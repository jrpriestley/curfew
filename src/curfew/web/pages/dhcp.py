"""DHCP (under Network): the server's state, pools and their devices, fixed addresses,
leases, and the rarely needed settings folded away at the end.

Pools are what the page talks about. Behind them are dhcpd classes: a pool
for one class's members is filled by putting devices in that class.
"""

import datetime as dt
import html

from curfew.config import APP_NAME, CURFEW_DHCP_CONF, DHCPD_CONF, RECENT_DAYS
from curfew.devices import display_name, maker_text
from curfew.dhcp import (
    EVERY_GROUP,
    HandWritten,
    ServiceState,
    device_group,
    fixed_ip,
    global_option,
    place_name,
    pool_choices,
    pool_for,
    pool_size,
    who_text,
)
from curfew.leases import Lease, LeaseRecord, is_router
from curfew.web.components import (
    data_table,
    fold,
    format_seen,
    panel,
    pick,
    pick_form,
    pill,
    post_form,
    submit,
)
from curfew.web.layout import chrome, page
from curfew.web.sky import sky_phase

SERVICE_PILLS = {
    "active": pill("ok", "Running", "isc-dhcp-server is running"),
    "activating": pill("warn", "Starting", "isc-dhcp-server is starting"),
    "failed": pill("danger", "Failed", "isc-dhcp-server stopped with an error"),
    "inactive": pill("danger", "Stopped", "isc-dhcp-server isn't running"),
}


def is_current(record: LeaseRecord, now: dt.datetime) -> bool:
    """Return True for a lease that's held right now."""
    return record.binding == "active" and (record.ends is None or record.ends > now)


def at_time(when: dt.datetime | None, now: dt.datetime) -> str:
    """Return a lease time: the clock today, else the day and clock; '—' for never."""
    if when is None:
        return "never"
    local = when.astimezone()
    return local.strftime(
        "%H:%M" if local.date() == now.astimezone().date() else "%a %b %-d %H:%M"
    )


def card_label(text: str) -> str:
    """Return a cell's label for phone cards, which hide the column headings."""
    return f'<span class="card-label">{text} </span>'


def text_input(name: str, label: str, value: str, size: int = 15, extra: str = "") -> str:
    """Return a labelled text box."""
    return (
        f'<label>{label} <input type="text" name="{name}" value="{html.escape(value)}" '
        f'size="{size}"{extra}></label>'
    )


def address_input(name: str, label: str, value: str = "", extra: str = "") -> str:
    """Return a labelled box for an IPv4 address."""
    return text_input(name, label, value, 13, ' inputmode="decimal" spellcheck="false"' + extra)


def who_select(permits: list, classes: list[str]) -> str:
    """Return the "for whom" choice for a pool: everyone, or by device group."""
    current = (
        "all"
        if not permits
        else "rest"
        if permits == [["deny", EVERY_GROUP]]
        else f"{'only' if permits[0][0] == 'allow' else 'except'}:{permits[0][1]}"
        if len(permits) == 1
        else "keep"
    )
    choices = [("all", "Everyone"), ("rest", "Everyone else")]
    if current == "keep":
        choices.insert(0, ("keep", f"As it is ({who_text(permits)})"))
    for name in classes:
        choices += [(f"only:{name}", f"Only {name}"), (f"except:{name}", f"Everyone but {name}")]
    options = "".join(
        f'<option value="{html.escape(value)}"{" selected" if value == current else ""}>'
        f"{html.escape(text)}</option>"
        for value, text in choices
    )
    return f'<label>For <select name="who">{options}</select></label>'


def pool_form(action: str, pool: dict, classes: list[str], label: str) -> str:
    """Return the form to add or change a pool."""
    fields = {"action": action} | ({"id": pool["id"]} if "id" in pool else {})
    return post_form(
        "/dhcp",
        fields,
        text_input("name", "Name", pool.get("name", ""), 12, ' maxlength="40" required')
        + address_input("start", "From", pool.get("start", ""))
        + address_input("end", "To", pool.get("end", ""))
        + who_select(pool.get("permits", []), classes)
        + submit(label),
        "inline-form",
    )


def page_head(service: ServiceState, now: dt.datetime) -> str:
    """Return the heading with the server's state, since when, and Restart."""
    state = SERVICE_PILLS.get(service.state, pill("muted", service.state.title(), ""))
    since = ""
    if service.since and service.state == "active":
        started = dt.datetime.fromtimestamp(service.since, dt.UTC)
        since = f' <span class="muted">since {at_time(started, now)}</span>'
    return (
        f'<div class="section-head page-head"><h1>DHCP</h1><span class="controls">'
        f'<span class="status-line">{state}{since}</span>'
        + post_form("/dhcp", {"action": "restart"}, submit("Restart"))
        + "</span></div>"
    )


def only_group(pool: dict) -> str:
    """Return the group a pool is for alone (``allow members of`` it), or ''."""
    allowed = [name for rule, name in pool.get("permits", []) if rule == "allow"]
    return allowed[0] if len(allowed) == 1 else ""


def pool_devices(dhcp: dict, pool: dict, name_of, choices: list[tuple[str, str]]) -> str:
    """Return who a pool is for: its devices (×: back to the pool for everyone else)
    and Add device, when it serves one group; else who it serves, in words."""
    group = only_group(pool)
    if not group:
        return f'<p class="muted">{html.escape(who_text(pool.get("permits", [])))}.</p>'
    members = sorted(
        (
            (key[-17:], name_of(key[-17:]) or note)
            for key, note in dhcp["classes"].get(group, {}).get("members", {}).items()
        ),
        key=lambda item: (item[1] or item[0]).lower(),
    )
    back = place_name(dhcp, "")
    chips = "".join(
        f'<li><a href="/device?mac={mac}">{html.escape(shown or mac)}</a>'
        + post_form(
            "/dhcp", {"action": "group", "mac": mac, "group": ""}, submit("×", "ghost")
        ).replace(
            "<button type=submit",
            f'<button type=submit aria-label="Move {html.escape(shown or mac)} to '
            f'{html.escape(back)}" title="Move to {html.escape(back)}"',
            1,
        )
        + "</li>"
        for mac, shown in members
    )
    inside = {mac for mac, _shown in members}
    add = post_form(
        "/dhcp",
        {"action": "group", "group": group},
        device_select([c for c in choices if c[0] not in inside]) + submit("Add"),
        "inline-form",
    )
    listed = f'<ul class="sites">{chips}</ul>' if chips else '<p class="muted">No devices yet.</p>'
    return listed + add


def pools_panel(
    dhcp: dict,
    records: dict[str, LeaseRecord],
    now: dt.datetime,
    name_of,
    choices: list[tuple[str, str]],
) -> str:
    """Return the pools: range, who they serve, how full. Each opens (▸, as device rows
    do) to its devices, then its Change form and Remove, full width, so they fit a phone."""
    classes = sorted(dhcp.get("classes", {}))
    held: dict[str, int] = {}
    for record in records.values():
        pool = pool_for(dhcp, record.ip) if is_current(record, now) else None
        if pool:
            held[pool["id"]] = held.get(pool["id"], 0) + 1
    rows = []
    for pool in dhcp["pools"]:
        size, used = pool_size(pool), held.get(pool["id"], 0)
        remove = (
            '<div class="controls">'
            + post_form("/dhcp", {"action": "remove_pool", "id": pool["id"]}, submit("Remove"))
            + "</div>"
            if len(dhcp["pools"]) > 1
            else ""
        )
        name = html.escape(pool["name"])
        more_id = f"pool-{pool['id']}"
        rows.append(
            f'<tr class="dev-row" data-key="{more_id}"><td class="lead">{name}</td>'
            f'<td class="detail mono">{pool["start"]} – {pool["end"]}</td>'
            f'<td class="detail">{card_label("for")}'
            f"{html.escape(who_text(pool.get('permits', [])))}</td>"
            '<td class="detail"><svg class="bar-track" viewBox="0 0 100 1" '
            'preserveAspectRatio="none" aria-hidden="true"><rect class="bar-used" '
            f'width="{max(used / size * 100, 1):.1f}" height="1"/></svg>'
            f'<span class="bar-value">{used} of {size} in use</span></td>'
            '<td class="more-cell"><button type="button" class="more ghost" '
            f'aria-expanded="false" aria-controls="{more_id}" aria-label="Open {name}">▸'
            "</button></td></tr>"
            f'<tr class="dev-more pool-more" id="{more_id}" hidden><td colspan="5">'
            + pool_devices(dhcp, pool, name_of, choices)
            + '<h3 class="pool-change">Change this pool</h3>'
            f"{pool_form('edit_pool', pool, classes, 'Save')}{remove}</td></tr>"
        )
    # A group with no pool of its own is still reachable from a device's page.
    pooled = {only_group(pool) for pool in dhcp["pools"]}
    loose = [name for name in classes if name not in pooled]
    return panel(
        "dhcp-pools",
        "Address pools",
        data_table(["Pool", "Addresses", "For", "In use", ""], rows, "cards")
        + (
            '<p class="muted">Also a group with no pool of its own: '
            f"{html.escape(', '.join(loose))} (set on a device's page).</p>"
            if loose
            else ""
        )
        + "<details><summary>Add a pool</summary>"
        + pool_form("add_pool", {}, classes, "Add")
        + "</details>",
        f'<span class="muted mono">{html.escape(dhcp["subnet"])}</span>',
    )


def minutes(seconds: int | None) -> str:
    """Return a lease time in minutes for its box ('' for unset)."""
    return str(seconds // 60) if seconds else ""


def lines(texts: list[str]) -> str:
    """Return config lines as a list (or '' for none)."""
    items = "".join(f"<li class=mono>{html.escape(text)}</li>" for text in texts)
    return f"<ul>{items}</ul>" if items else ""


def options_summary(dhcp: dict, hand: HandWritten) -> str:
    """Return the options in a line, for beside the fold's title: gateway, DNS, lease."""
    lease = dhcp.get("default_lease") or next(
        (
            int(words[1])
            for words in (x.split() for x in hand.settings)
            if words[0] == "default-lease-time" and len(words) == 2 and words[1].isdigit()
        ),
        None,
    )
    routers = dhcp.get("routers") or global_option(hand, "routers")
    dns = ", ".join(dhcp.get("dns", [])) or global_option(hand, "domain-name-servers")
    parts = [
        f"gateway {routers or 'none'}",
        f"DNS {dns or 'none'}",
        f"lease {f'{lease // 60} min' if lease else 'dhcpd default'}",
    ]
    return " · ".join(parts)


def options_fold(dhcp: dict, hand: HandWritten, service: ServiceState, folds: dict) -> str:
    """Return Options at the top, shut unless left open (as on Devices): the subnet's
    settings, what else is kept as written, dhcpd.conf's global settings, the log."""

    def globally(option: str) -> str:
        """Return a placeholder showing what an empty box falls back to."""
        value = global_option(hand, option)
        return f' placeholder="{html.escape(value)}"' if value else ""

    form = post_form(
        "/dhcp",
        {"action": "options"},
        address_input("routers", "Gateway", dhcp.get("routers", ""), globally("routers"))
        + text_input(
            "dns",
            "DNS",
            ", ".join(dhcp.get("dns", [])),
            20,
            ' spellcheck="false"' + globally("domain-name-servers"),
        )
        + text_input("domain", "Domain", dhcp.get("domain", ""), 14, ' spellcheck="false"')
        + text_input(
            "default_lease",
            "Usual lease (min)",
            minutes(dhcp.get("default_lease")),
            5,
            ' inputmode="numeric"',
        )
        + text_input(
            "max_lease",
            "Longest (min)",
            minutes(dhcp.get("max_lease")),
            5,
            ' inputmode="numeric"',
        )
        + submit("Save"),
        "inline-form",
    )
    kept = [*dhcp.get("extra", []), *(x for pool in dhcp["pools"] for x in pool.get("extra", []))]
    sections = [
        (
            "Subnet",
            '<p class="muted">For the house subnet. An empty box uses the global '
            "setting below (shown faintly in it).</p>" + form,
        ),
        ("Kept as written", lines(kept)),
        (
            f"Global settings <span class=muted>{html.escape(str(DHCPD_CONF))}</span>",
            lines(hand.settings),
        ),
        (
            "Recent log",
            f'<pre class="log mono">{html.escape(chr(10).join(service.log))}</pre>'
            if service.log
            else "",
        ),
    ]
    body = "".join(f"<h3>{title}</h3>{content}" for title, content in sections if content)
    return fold(
        "dhcpoptions",
        "Options",
        f'<section class="panel">{body}</section>',
        folds,
        default_open=False,
        aside=f'<span class="fold-note">{html.escape(options_summary(dhcp, hand))}</span>',
    )


def fixed_panel(
    dhcp: dict, leases: dict[str, Lease], name_of, choices: list[tuple[str, str]]
) -> str:
    """Return the fixed addresses, and a form to give a device one."""
    rows = []
    for mac, host in sorted(dhcp.get("hosts", {}).items(), key=lambda item: item[1]["ip"]):
        lease = leases.get(mac)
        now_at = lease.ip if lease and lease.online else "—"
        shown = name_of(mac) or host.get("name") or mac
        rows.append(
            f'<tr><td class="lead"><a href="/device?mac={mac}">{html.escape(shown)}</a></td>'
            f'<td class="detail mono">{card_label("fixed")}{host["ip"]}</td>'
            f'<td class="detail mono">{mac}</td>'
            f'<td class="detail mono">{card_label("now at")}{now_at}</td>'
            '<td class="actions">'
            + post_form("/dhcp", {"action": "unfix", "mac": mac}, submit("Remove"))
            + "</td></tr>"
        )
    form = post_form(
        "/dhcp",
        {"action": "fix"},
        device_select([c for c in choices if c[0] not in dhcp.get("hosts", {})])
        + address_input("ip", "Address")
        + submit("Give it"),
        "inline-form",
    )
    table = (
        data_table(["Device", "Fixed address", "MAC", "Now at", ""], rows, "cards")
        if rows
        else '<p class="muted">None yet.</p>'
    )
    return panel(
        "dhcp-fixed",
        "Fixed addresses",
        table
        + '<p class="muted">Outside the pools. A device moves at its next renewal.</p>'
        + form,
    )


LEASE_PILLS = {
    "active": pill("ok", "Active", "Held now"),
    "expired": pill("muted", "Expired", "The lease ran out"),
    "free": pill("muted", "Free", "Given back or expired"),
    "abandoned": pill("warn", "Abandoned", "dhcpd found something else using the address"),
}


def lease_row(record: LeaseRecord, dhcp: dict, name_of, now: dt.datetime) -> str:
    """Return one lease: address, device, pool, state and its time."""
    current = is_current(record, now)
    state = "active" if current else "expired" if record.binding == "active" else record.binding
    shown = name_of(record.mac) or record.hostname
    device = (
        f'<a href="/device?mac={record.mac}">{html.escape(shown or "Unknown device")}</a>'
        if record.mac
        else "—"
    )
    pool = pool_for(dhcp, record.ip) if dhcp else None
    when = (
        f"until {at_time(record.ends, now)}"
        if current
        else f"ended {format_seen(record.ends, now)}"
        if record.ends
        else ""
    )
    # As a phone card: the device, its state at the right, then IP · MAC · pool · when.
    return (
        f'<tr><td class="detail mono">{record.ip}</td><td class="lead">{device}</td>'
        f'<td class="detail mono">{record.mac or "—"}</td>'
        f'<td class="detail">{card_label("pool")}{html.escape(pool["name"]) if pool else "—"}</td>'
        f'<td class="status">{LEASE_PILLS.get(state, pill("muted", state.title(), ""))}</td>'
        f'<td class="detail">{when}</td></tr>'
    )


def address_key(ip: str) -> tuple[int, ...]:
    """Return an IP's sort key (10.7.0.9 before 10.7.0.10)."""
    return tuple(int(part) for part in ip.split("."))


def leases_panel(records: dict[str, LeaseRecord], dhcp: dict, name_of, now: dt.datetime) -> str:
    """Return the leases held now, with the rest (expired, free) folded away."""
    ordered = sorted(records.values(), key=lambda record: address_key(record.ip))
    held = [record for record in ordered if is_current(record, now)]
    others = [record for record in ordered if not is_current(record, now)]
    headers = ["Address", "Device", "MAC", "Pool", "State", "When"]
    body = (
        data_table(headers, [lease_row(r, dhcp, name_of, now) for r in held], "cards compact")
        if held
        else '<p class="muted">No leases held right now.</p>'
    )
    if others:
        body += (
            f"<details><summary>Expired and free ({len(others)})</summary>"
            + data_table(
                headers, [lease_row(r, dhcp, name_of, now) for r in others], "cards compact"
            )
            + "</details>"
        )
    return panel("dhcp-leases", f"Leases · {len(held)} held", body)


def choice_label(mac: str, name: str) -> str:
    """Return a device as the drop-downs list it: its name (or maker) and its MAC."""
    if not name:
        maker = maker_text(mac)
        known = maker not in ("unknown", "hidden by the maker") and not maker.startswith("none")
        name = f"Unnamed {maker} device" if known else "Unnamed device"
    return f"{name} · {mac}"


def device_choices(
    state: dict, leases: dict[str, Lease], name_of, now: dt.datetime
) -> list[tuple[str, str]]:
    """Return (MAC, label) for the drop-downs: devices seen lately or saved, named ones first."""
    cutoff = now - dt.timedelta(days=RECENT_DAYS)
    macs = {mac for mac, lease in leases.items() if lease.last_seen >= cutoff}
    macs |= set(state["devices"])
    named = [(mac, name_of(mac)) for mac in macs if not is_router(mac)]
    named.sort(key=lambda item: (not item[1], choice_label(*item).lower()))
    return [(mac, choice_label(mac, name)) for mac, name in named]


def device_select(choices: list[tuple[str, str]]) -> str:
    """Return the Device drop-down."""
    options = "".join(
        f'<option value="{mac}">{html.escape(text)}</option>' for mac, text in choices
    )
    return (
        '<label>Device <select name="mac" required><option value="" selected disabled>'
        f"Choose…</option>{options}</select></label>"
    )


def pool_pick(state: dict, mac: str, name: str) -> str:
    """Return the form that sets a device's pool, or '' (no DHCP settings, one place, homehub)."""
    dhcp = state.get("dhcp")
    if not dhcp or is_router(mac) or len(pool_choices(dhcp)) < 2:
        return ""
    return pick_form(
        "/dhcp",
        {"action": "group", "mac": mac, "name": name},
        pick("Pool", "group", pool_choices(dhcp), device_group(state, mac)),
    )


def adopt_notice(hand: HandWritten) -> str:
    """Return what to do while curfew doesn't manage DHCP yet."""
    return (
        "<p class=\"panel notice\">curfew shows dhcpd's leases and service here, but doesn't "
        "manage its settings yet. To move the subnet, pools, classes and fixed addresses out "
        f"of {html.escape(str(DHCPD_CONF))} into {html.escape(str(CURFEW_DHCP_CONF))} (the "
        "global settings stay), run <code>sudo curfew dhcp adopt</code> on homehub to see "
        "the change, then <code>sudo curfew dhcp adopt --apply</code>.</p>"
        if not hand.includes
        else '<p class="panel notice">dhcpd.conf includes curfew.conf, but curfew has no saved '
        "DHCP settings. Run <code>sudo curfew dhcp adopt</code> on homehub.</p>"
    )


def render_dhcp(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    records: dict[str, LeaseRecord],
    service: ServiceState,
    hand: HandWritten,
    now: dt.datetime,
    folds: dict[str, bool] | None = None,
) -> str:
    """Return the DHCP page."""

    def name_of(mac: str) -> str:
        return display_name(mac, state["devices"].get(mac, {}), leases.get(mac), conf_names)

    dhcp = state.get("dhcp")
    choices = device_choices(state, leases, name_of, now)
    body = (
        '<p class="crumbs"><a href="/network">Network</a> › DHCP</p>'
        + page_head(service, now)
        + (options_fold(dhcp, hand, service, folds or {}) if dhcp else "")
        + (
            pools_panel(dhcp, records, now, name_of, choices)
            + fixed_panel(dhcp, leases, name_of, choices)
            if dhcp
            else adopt_notice(hand)
        )
        + leases_panel(records, dhcp or {}, name_of, now)
    )
    return page(f"DHCP · {APP_NAME}", chrome("network", body, sky_phase(state, now)), script=True)


def dhcp_summary(
    records: dict[str, LeaseRecord], service: ServiceState, dhcp: dict | None, now: dt.datetime
) -> str:
    """Return the Network page's DHCP card: the server's state, leases held, the pools."""
    held = sum(is_current(record, now) for record in records.values())
    state = SERVICE_PILLS.get(service.state, pill("muted", service.state.title(), ""))
    pools = ""
    if dhcp:
        used: dict[str, int] = {}
        for record in records.values():
            pool = pool_for(dhcp, record.ip) if is_current(record, now) else None
            if pool:
                used[pool["id"]] = used.get(pool["id"], 0) + 1
        pools = "".join(
            f"<li><span>{html.escape(pool['name'])}</span>"
            '<svg class="bar-track" viewBox="0 0 100 1" preserveAspectRatio="none" '
            f'aria-hidden="true"><rect class="bar-used" width="'
            f'{max(used.get(pool["id"], 0) / pool_size(pool) * 100, 1):.1f}" height="1"/></svg>'
            f'<span class="bar-value">{used.get(pool["id"], 0)} of {pool_size(pool)}</span></li>'
            for pool in dhcp["pools"]
        )
    return panel(
        "dhcp",
        "DHCP",
        f'<p class="status-line">{state} <strong>{held}</strong> leases held</p>'
        + (f'<ul class="bars">{pools}</ul>' if pools else ""),
        '<a href="/dhcp">Manage ›</a>',
    )


def device_dhcp(state: dict, mac: str, name: str) -> str:
    """Return a device's fixed address, to set or take away (its pool is in manage)."""
    dhcp = state.get("dhcp")
    if not dhcp or is_router(mac):
        return ""
    current = fixed_ip(state, mac)
    # Remove is a form of its own, its button in the other's place for Save till there's a change.
    remove = submit("Remove", "clear", ' form="unfix"') if current else ""
    fix = pick_form(
        "/dhcp",
        {"action": "fix", "mac": mac, "name": name},
        '<label><span>Fixed address</span> <input type="text" name="ip" required '
        f'inputmode="decimal" spellcheck="false" placeholder="none" value="{current}"></label>',
        remove,
    )
    removal = post_form("/dhcp", {"action": "unfix", "mac": mac}, "", "", "unfix")
    return panel(
        "dhcp",
        "Address",
        f'<div class="picks wide">{fix}</div>{removal if current else ""}'
        '<p class="muted">It takes effect at the device\'s next renewal. '
        '<a href="/dhcp">DHCP ›</a></p>',
    )
