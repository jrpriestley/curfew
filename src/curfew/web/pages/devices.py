"""Devices: the options (two switches), and the unknown and known device tables."""

import collections
import datetime as dt
import html
import sqlite3
import urllib.parse
import urllib.request
from typing import NamedTuple

from curfew.config import APP_NAME, RECENT_DAYS
from curfew.devices import (
    KIND_LABELS,
    MAX_NAME,
    device_kind,
    display_name,
    guest_until,
    maker_text,
)
from curfew.firewall import leased_ips
from curfew.leases import Lease, is_private, is_router
from curfew.policy import STATUS_ORDER, internet_status, pending_macs, profile_for
from curfew.traffic import local_midnight, usage_totals
from curfew.web.components import (
    STATUS_LABELS,
    action_button,
    device_cell,
    fold,
    format_bytes,
    format_seen,
    post_form,
    router_notice,
    submit,
    switch_card,
    usage_cell,
)
from curfew.web.layout import chrome, page
from curfew.web.pages.dhcp import pool_control
from curfew.web.sky import sky_phase

SORTS = {
    "name": "Device",
    "seen": "Last seen",
    "today": "Today",
    "profile": "Profile",
    "status": "Internet",
}


NEWEST_FIRST = {"seen", "today"}  # these start descending; the rest A-Z or by severity


def natural_descending(sort: str) -> bool:
    """Return the direction a column sorts in when first chosen."""
    return sort in NEWEST_FIRST


def render_policy(settings: dict, private_blocked: int) -> str:
    """Return the private-address switch card."""
    enabled = bool(settings.get("block_private"))
    status = f"On · {private_blocked} device(s) blocked by it" if enabled else "Off"
    return switch_card(
        "block_private",
        "Block private Wi-Fi addresses",
        "Cuts internet for devices using a private or rotating MAC address (tagged "
        "<span class=tag>private</span>) unless you allow them. Local network still works.",
        status,
        enabled,
    )


def render_dhcp_switch(settings: dict, leased: int) -> str:
    """Return the "require addresses from homehub" switch card."""
    enabled = bool(settings.get("require_dhcp"))
    return switch_card(
        "require_dhcp",
        "Require addresses from homehub",
        "Only addresses homehub handed out reach the internet, so a device can't "
        "dodge a block by setting its own. Local network still works.",
        f"On · {leased} address(es) handed out" if enabled else "Off",
        enabled,
    )


def render_unknown_switch(state: dict, leases: dict[str, Lease], waiting: int) -> str:
    """Return the "block new devices" switch card."""
    enabled = bool(state["settings"].get("block_unknown"))
    explain = "Devices you haven't approved get no internet until you approve them."
    if enabled:
        status = f"On · {waiting} new device(s) waiting for approval"
        if waiting:
            status += ' · <a href="/">review on Home</a>'
    else:
        status = "Off"
        seen = len(set(leases) | set(state["devices"]))
        explain += f" Turning this on approves the {seen} devices seen so far."

    return switch_card("block_unknown", "Block new devices", explain, status, enabled)


def rename_box(mac: str, name: str, link: bool = False) -> str:
    """Return a device's name with a ✎ that swaps in a rename form (see app.js).

    With ``link`` the name opens the device's page.
    """
    label = html.escape(name) if name else '<span class="muted">Unknown device</span>'
    if link:
        label = (
            f'<a class="dev-link" href="/device?mac={mac}" title="{html.escape(name)}">{label}</a>'
        )
    else:  # its own element, so a long name can end in "…" (see app.css)
        label = f'<span class="dev-name" title="{html.escape(name)}">{label}</span>'
    return (
        f'<span class="namebox"><span class="shown">{label}'
        f'<button type="button" class="edit ghost" aria-label="Rename '
        f'{html.escape(name or mac)}" title="Rename">✎</button></span>'
        + post_form(
            "/device",
            {"mac": mac, "action": "rename"},
            f'<input type="text" name="name" maxlength="{MAX_NAME}" aria-label="Device name" '
            f'value="{html.escape(name)}">'
            + submit("Save")
            + '<button type="button" class="cancel">Cancel</button>',
            "rename",
        ).replace('class="rename">', 'class="rename" hidden>', 1)
        + "</span>"
    )


class DeviceRow(NamedTuple):
    """One row of the device table."""

    mac: str
    name: str
    record: dict
    lease: Lease | None
    status: str
    profile_id: str | None


def sort_rows(
    rows: list[DeviceRow],
    sort: str,
    state: dict,
    today: dict[str, tuple[int, int]],
    descending: bool | None = None,
) -> list[DeviceRow]:
    """Return rows by name, then re-sorted (stably) by ``sort`` if it isn't the name,
    turned around when ``descending`` isn't the column's natural direction."""
    rows = in_natural_order(rows, sort, state, today)
    if descending is not None and descending != natural_descending(sort):
        rows.reverse()
    return rows


def in_natural_order(
    rows: list[DeviceRow], sort: str, state: dict, today: dict[str, tuple[int, int]]
) -> list[DeviceRow]:
    """Return rows in ``sort``'s natural direction (see NEWEST_FIRST)."""
    rows = sorted(rows, key=lambda row: row.name.lower() or "~" + row.mac)
    oldest = dt.datetime.min.replace(tzinfo=dt.UTC)
    if sort == "seen":
        rows.sort(key=lambda row: row.lease.last_seen if row.lease else oldest, reverse=True)
    elif sort == "today":
        rows.sort(key=lambda row: sum(today.get(row.mac, (0, 0))), reverse=True)
    elif sort == "status":
        rows.sort(key=lambda row: STATUS_ORDER.index(row.status))
    elif sort == "profile":
        # Devices in a profile first, by profile name; the rest last.
        rows.sort(
            key=lambda row: (
                row.profile_id is None,
                state["profiles"][row.profile_id]["name"].lower() if row.profile_id else "",
                row.profile_id or "",
            )
        )
    return rows


def fact_items(
    mac: str, name: str, lease: Lease | None, today: tuple[int, int] | None, now: dt.datetime
) -> list[tuple[str, str]]:
    """Return a device's facts as (label, HTML): online, today, addresses, maker, type."""
    if lease and lease.online:
        online = "Online now"
    else:
        online = f"Last seen {format_seen(lease.last_seen if lease else None, now)}"
    down, up = today or (0, 0)
    used = (
        f"{format_bytes(down + up)} <small>↓ {format_bytes(down)} · ↑ {format_bytes(up)}</small>"
        if down + up
        else "nothing yet"
    )
    private = " <span class=tag>private</span>" if is_private(mac) else ""
    items = [
        ("Connection", online),
        ("Today", used),
        ("IP address", html.escape(lease.ip) if lease else "—"),
        ("MAC address", f'<span class="mono">{mac}</span>{private}'),
        ("Maker", html.escape(maker_text(mac))),
        ("Type", f"{KIND_LABELS[device_kind(name, mac)]} <small>(a guess)</small>"),
    ]
    if lease and lease.hostname and lease.hostname != name:
        items.append(("Calls itself", html.escape(lease.hostname)))
    return items


def fact_list(items: list[tuple[str, str]]) -> str:
    """Return facts from fact_items as the device's definition list."""
    return (
        '<dl class="device-facts">'
        + "".join(f"<div><dt>{key}</dt><dd>{value}</dd></div>" for key, value in items)
        + "</dl>"
    )


def facts(
    mac: str,
    name: str,
    lease: Lease | None,
    today: tuple[int, int] | None,
    first: tuple[int, bool] | None,
    now: dt.datetime,
) -> str:
    """Return the device page's facts: fact_items, with when it was first seen third."""
    if first is None:
        first_text = "—"
    else:
        moment = dt.datetime.fromtimestamp(first[0], dt.UTC).astimezone()
        first_text = moment.strftime("%b %-d, %Y")
        if first[1]:
            first_text = f"{first_text} <small>or earlier (records start then)</small>"
    items = fact_items(mac, name, lease, today, now)
    items.insert(2, ("First seen", first_text))
    return fact_list(items)


def manage(state: dict, mac: str, status: str, lease: Lease | None) -> str:
    """Return the device's controls: block or unblock, approve or let on as a guest,
    allow, wake, and its profile."""
    if is_router(mac):
        return (
            '<p class="muted">The router itself. Its own internet use (updates, DNS, '
            "Jellyfin, downloads) counts here; blocks and profiles are for the house's "
            "devices.</p>"
        )
    record = state["devices"].get(mac, {})
    buttons = [
        action_button(mac, "unblock", "Unblock")
        if record.get("blocked")
        else action_button(mac, "block", "Block")
    ]
    if status == "unknown":
        buttons[:0] = [
            action_button(mac, "approve", "Approve"),
            action_button(mac, "guest", "Let on for a day"),
        ]
    elif guest_until(record):
        buttons[:0] = [
            action_button(mac, "approve", "Keep for good"),
            action_button(mac, "forget", "Forget now"),
        ]
    if not (lease and lease.online):
        # Only wired computers set up for it answer; there's no reply either way.
        buttons.append(
            post_form(
                "/wake",
                {"mac": mac},
                submit("Wake", "", ' title="Send a wake-on-LAN packet (wired, set-up devices)"'),
            )
        )
    if is_private(mac) and state["settings"].get("block_private") and not record.get("blocked"):
        allowed = record.get("allowed")
        buttons.append(
            action_button(
                mac, "disallow" if allowed else "allow", "Revoke" if allowed else "Allow"
            )
        )
    profile_id, profile = profile_for(state, mac)
    options = "".join(
        f'<option value="{pid}"{" selected" if pid == profile_id else ""}>'
        f"{html.escape(other['name'])}</option>"
        for pid, other in sorted(state["profiles"].items(), key=lambda item: item[1]["name"])
    )
    choose = (
        post_form(
            "/profile",
            {"action": "add_member", "mac": mac},
            '<label>Profile <select name="id" required>'
            + ("" if profile else '<option value="" selected disabled>None</option>')
            + f"{options}</select></label>"
            + submit("Move" if profile else "Add"),
        )
        if state["profiles"]
        else '<p class="muted">No profiles yet; make one on Home.</p>'
    )
    leave = (
        post_form(
            "/profile",
            {"id": profile_id, "action": "remove_member", "mac": mac},
            submit(f"Take out of {html.escape(profile['name'])}"),
        )
        if profile
        else ""
    )
    return (
        f'<div class="controls">{"".join(buttons)}</div>'
        f'<div class="controls">{choose}{leave}</div>'
    )


def device_row(
    row: DeviceRow,
    state: dict,
    today: tuple[int, int] | None,
    now: dt.datetime,
    show_profile: bool,
) -> str:
    """Return a device's table row and, under it, the row it opens to (hidden till then).

    The row: name (rename), last seen, today, profile, status, and a ▸ that
    opens it, as does a click anywhere on the row but its controls (app.js).
    Opened: the device's facts, every control, and a link to its page.
    Shared by the Devices page and a profile's device list (which leaves out
    the profile column).
    """
    mac, name, profile_id = row.mac, row.name, row.profile_id
    profile_cell = ""
    if show_profile:
        link = (
            f'<a href="/profile?id={profile_id}">'
            f"{html.escape(state['profiles'][profile_id]['name'])}</a>"
            if profile_id
            else '<span class="muted">—</span>'
        )
        profile_cell = f'<td class="profile detail{"" if profile_id else " empty"}">{link}</td>'
    more_id = "more-" + mac.replace(":", "")
    opened = (
        f'<tr class="dev-more" id="{more_id}" hidden><td colspan="{6 if show_profile else 5}">'
        + fact_list(fact_items(mac, name, row.lease, today, now))
        + manage(state, mac, row.status, row.lease)
        + pool_control(state, mac, name)
        + f'<p class="dev-page"><a href="/device?mac={mac}">Usage &amp; history →</a></p>'
        "</td></tr>"
    )
    return (
        f'<tr class="dev-row" data-key="{mac}">'
        f"{device_cell(name, mac, row.lease, rename_box(mac, name), info=False)}"
        f'<td class="seen detail">'
        f"{format_seen(row.lease.last_seen if row.lease else None, now)}</td>"
        f"{usage_cell(mac, today)}{profile_cell}"
        f'<td class="status">{STATUS_LABELS[row.status]}</td>'
        '<td class="more-cell"><button type="button" class="more ghost" aria-expanded="false" '
        f'aria-controls="{more_id}" aria-label="Details for {html.escape(name or mac)}">▸'
        "</button></td></tr>" + opened
    )


def collect_rows(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    now: dt.datetime,
    show_all: bool,
) -> tuple[list[DeviceRow], int]:
    """Return the devices to list (recent ones, or all) and how many the private rule blocks.

    "Recent" means a lease in the last RECENT_DAYS; blocked, allowed and
    profile devices are always listed.
    """
    local = now.astimezone()
    cutoff = now - dt.timedelta(days=RECENT_DAYS)
    rows: list[DeviceRow] = []
    private_blocked = 0
    for mac in set(leases) | set(state["devices"]):
        record = state["devices"].get(mac, {})
        lease = leases.get(mac)
        status = internet_status(state, mac, local)
        profile_id, _profile = profile_for(state, mac)
        recent = lease is not None and lease.last_seen >= cutoff
        if status == "private" and recent:
            private_blocked += 1
        keep = recent or record.get("blocked") or record.get("allowed") or profile_id
        if show_all or keep:
            name = display_name(mac, record, lease, conf_names)
            rows.append(DeviceRow(mac, name, record, lease, status, profile_id))
    return rows, private_blocked


def render_devices(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    active: bool,
    show_all: bool,
    now: dt.datetime,
    sort: str = "name",
    traffic: sqlite3.Connection | None = None,
    folds: dict[str, bool] | None = None,
    descending: bool | None = None,
) -> str:
    """Return the device list page, sorted by ``sort`` (a key of SORTS).

    Options (the two switches) sit in a fold, shut by default; devices split
    into Unknown (no name yet, or waiting for approval) and Known, each a
    fold. ``folds`` is how the visitor last left them. Sorting by profile
    also groups the rows under a heading per profile. ``traffic`` (the usage
    database) feeds the Today column.
    """
    folds = folds or {}
    today = usage_totals(traffic, local_midnight(now))
    settings = state["settings"]
    pending = pending_macs(state, leases, conf_names, now)
    rows, private_blocked = collect_rows(state, leases, conf_names, now, show_all)
    if descending is None:
        descending = natural_descending(sort)
    rows = sort_rows(rows, sort, state, today, descending)
    unknown = [row for row in rows if is_unknown(row)]
    known = [row for row in rows if not is_unknown(row)]

    def sort_url(key: str) -> str:
        # The current column turns around; another starts in its natural direction.
        return main_url(show_all, key, not descending if key == sort else None)

    def header_cell(key: str) -> str:
        order = "descending" if descending else "ascending"
        current = f' aria-sort="{order}"' if key == sort else ""
        return f'<th scope="col"{current}><a href="{sort_url(key)}">{SORTS[key]}</a></th>'

    def device_table(group: list[DeviceRow], empty: str) -> str:
        if not group:
            return f'<p class="muted">{empty}</p>'
        return (
            '<div class="table-wrap"><table class="cards device-table device-list"><thead><tr>'
            f"{''.join(header_cell(key) for key in SORTS)}"
            '<th scope="col"><span class="sr-only">Details</span></th></tr></thead>'
            f"<tbody>{''.join(table_rows(group, state, today, now, sort))}</tbody></table></div>"
        )

    def count(group: list[DeviceRow]) -> str:
        return f'<span class="fold-count">{len(group)}</span>'

    # Phones hide the table head, so they get the same choices as links.
    arrow = " ↓" if descending else " ↑"
    sort_links = " · ".join(
        f'<a href="{sort_url(key)}"{" aria-current=true" if key == sort else ""}>'
        f"{'Name' if key == 'name' else label}{arrow if key == sort else ''}</a>"
        for key, label in SORTS.items()
    )
    all_switch = (
        f'<a class="switch-link" href="{main_url(not show_all, sort, descending)}" role="switch" '
        f'aria-checked="{str(show_all).lower()}">'
        '<span class="switch"><span class="knob"></span></span>'
        f"Show all devices <span class=muted>(not just the last {RECENT_DAYS} days)</span></a>"
    )
    option_states = (
        f"New devices {'blocked' if settings.get('block_unknown') else 'allowed'} · "
        f"private addresses {'blocked' if settings.get('block_private') else 'allowed'} · "
        f"own addresses {'refused' if settings.get('require_dhcp') else 'allowed'}"
    )
    body = (
        f"{router_notice(active)}<h1>Devices</h1>"
        + fold(
            "options",
            "Options",
            '<div class="policies">'
            f"{render_unknown_switch(state, leases, len(pending))}"
            f"{render_policy(settings, private_blocked)}"
            f"{render_dhcp_switch(settings, len(leased_ips(leases, state)))}</div>",
            folds,
            default_open=False,
            aside=f'<span class="fold-note">{option_states}</span>',
        )
        + '<div class="tools"><label>Filter <input type="search" id="filter" '
        f'placeholder="name, IP, MAC or profile"></label>{all_switch}'
        f'<span class="sort-links">Sort: {sort_links}</span></div>'
        + fold(
            "known", "Known devices", device_table(known, "None yet."), folds, aside=count(known)
        )
        + fold(
            "unknown",
            "Unknown devices",
            '<p class="muted fold-hint">No name yet, or waiting for approval. '
            "Name one (✎) to move it to Known.</p>" + device_table(unknown, "None."),
            folds,
            aside=count(unknown),
        )
    )
    return page(
        f"Devices · {APP_NAME}", chrome("devices", body, sky_phase(state, now)), script=True
    )


def is_unknown(row: DeviceRow) -> bool:
    """Return True for a device with no name yet, or one waiting for approval."""
    return not row.name or row.status == "unknown"


def table_rows(
    rows: list[DeviceRow],
    state: dict,
    today: dict[str, tuple[int, int]],
    now: dt.datetime,
    sort: str,
) -> list[str]:
    """Return the table rows, under a heading per profile when sorted by profile."""
    group_sizes = collections.Counter(row.profile_id for row in rows)
    body_rows = []
    current_group: object = ()  # matches no profile id, so the first row opens a group
    for row in rows:
        profile_id = row.profile_id
        if sort == "profile" and profile_id != current_group:
            current_group = profile_id
            heading = (
                html.escape(state["profiles"][profile_id]["name"]) if profile_id else "No profile"
            )
            size = group_sizes[profile_id]
            body_rows.append(
                f'<tr class="group"><th colspan="6" scope="colgroup">{heading} '
                f'<span class="muted">· {size} device{"" if size == 1 else "s"}</span></th></tr>'
            )
        body_rows.append(device_row(row, state, today.get(row.mac), now, show_profile=True))
    return body_rows


def main_url(show_all: bool, sort: str, descending: bool | None = None) -> str:
    """Return the Devices page URL for a view: recent or all devices, a sort, and its
    direction (left out when it's the column's natural one)."""
    query = {}
    if show_all:
        query["all"] = "1"
    if sort != "name":
        query["sort"] = sort
    if descending is not None and descending != natural_descending(sort):
        query["dir"] = "desc" if descending else "asc"
    return "/devices?" + urllib.parse.urlencode(query) if query else "/devices"


def view_from_query(query: str) -> tuple[bool, str, bool]:
    """Return (show_all, sort, descending) from a main-page query string, ignoring
    anything else."""
    fields = urllib.parse.parse_qs(query)
    sort = fields.get("sort", ["name"])[0]
    sort = sort if sort in SORTS else "name"
    direction = fields.get("dir", [""])[0]
    descending = {"desc": True, "asc": False}.get(direction, natural_descending(sort))
    return fields.get("all") == ["1"], sort, descending
