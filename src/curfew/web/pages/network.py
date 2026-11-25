"""Network: the house at a glance (constellation), DHCP and Pi-hole (scoreboard, groups)."""

import datetime as dt
import html
import sqlite3
import urllib.parse

from curfew.config import APP_NAME, PING_TARGETS, REFRESH_PATH, REFRESH_PIHOLE
from curfew.devices import device_kind
from curfew.dhcp import ServiceState
from curfew.diagnose import Hop, quality_series
from curfew.leases import Lease, LeaseRecord, is_router
from curfew.speedtest import BUSY_BPS, mbps, speed_history, when
from curfew.traffic import local_midnight, usage_totals
from curfew.web.charts import (
    Star,
    bandwidth_chart_svg,
    quality_chart_svg,
    quality_edges,
    render_constellation,
    ring_svg,
)
from curfew.web.components import data_table, legend, panel, pill, table_twin
from curfew.web.layout import chrome, page
from curfew.web.pages.devices import collect_rows
from curfew.web.pages.dhcp import dhcp_summary
from curfew.web.sky import sky_phase

PIHOLE_OUTCOMES = (
    ("Blocked by blocklists", "blocked", ("GRAVITY", "GRAVITY_CNAME")),
    (
        "Blocked by your rules",
        "blocked",
        ("REGEX", "DENYLIST", "REGEX_CNAME", "DENYLIST_CNAME"),
    ),
    ("Bypass attempts (relay, DoH canary)", "blocked", ("SPECIAL_DOMAIN",)),
    ("Answered from cache", "answered", ("CACHE", "CACHE_STALE")),
    ("Looked up (unbound)", "answered", ("FORWARDED", "RETRIED", "RETRIED_DNSSEC")),
)


def render_pihole_panel(summary: dict | None) -> str:
    """Return the Pi-hole scoreboard: share blocked and why, last 24 hours."""
    if not summary or "queries" not in summary:
        return ""
    queries = summary["queries"]
    status = queries.get("status", {})
    total = int(queries.get("total", 0))
    blocked = int(queries.get("blocked", 0))
    if not total:
        return ""
    counts = [sum(int(status.get(key, 0)) for key in keys) for _l, _s, keys in PIHOLE_OUTCOMES]
    peak = max(counts) or 1
    rows = []
    for (label, side, _keys), count in zip(PIHOLE_OUTCOMES, counts, strict=True):
        rows.append(
            f"<li><span>{label}</span>"
            '<svg class="bar-track" viewBox="0 0 100 1" preserveAspectRatio="none" '
            f'aria-hidden="true"><rect class="bar-{side}" '
            f'width="{max(count / peak * 100, 1):.1f}" height="1"/></svg>'
            f'<span class="bar-value">{count:,}</span></li>'
        )
    listed = int(summary.get("gravity", {}).get("domains_being_blocked", 0))
    share = blocked / total
    return panel(
        "pihole-stats",
        "Pi-hole · last 24 hours",
        f'<div class="pihole-top">{ring_svg(share, f"{share:.0%} of DNS queries blocked")}'
        f"<p><strong>{blocked:,}</strong> of {total:,} lookups blocked"
        f'<br><span class="muted">{listed:,} domains on the blocklists</span></p></div>'
        + legend([("swatch-blocked", "Blocked", ""), ("swatch-answered", "Answered", "")])
        + f'<ul class="bars">{"".join(rows)}</ul>',
        f'<span class="muted">every {REFRESH_PIHOLE} s</span>',
        attrs=f'id="pihole-stats" data-part="/network/pihole" data-every="{REFRESH_PIHOLE}"',
    )


def render_pihole_groups(groups: list[dict] | None) -> str:
    """Return the read-only Pi-hole groups panel, or '' without Pi-hole."""
    if not groups:
        return ""
    rows = []
    for group in groups:
        applies = ", ".join(
            html.escape(ip) + (f" ({html.escape(comment)})" if comment else "")
            for ip, comment in group["clients"]
        )
        if group["default"]:
            applies = "Everyone not in another group" + (f"; also {applies}" if applies else "")
        lists = group["lists"]
        list_tip = html.escape(
            ", ".join(urllib.parse.urlsplit(url).netloc or url for url in lists)
        )
        chips = "".join(
            f'<li class="rule-{kind}" title="{kind}">{"✓ " if kind == "allow" else ""}'
            f"{html.escape(rule)}</li>"
            for rule, kind in group["rules"]
        )
        rules = f'<ul class="sites readonly">{chips}</ul>' if chips else ""
        if group["doh"]:
            rules += f'<span class="muted">+ {group["doh"]} encrypted-DNS blocks (curfew)</span>'
        name = html.escape(group["name"])
        if not group["enabled"]:
            name += f" {pill('muted', 'Off', 'Disabled in Pi-hole')}"
        rows.append(
            f'<tr><td class="lead">{name}</td>'
            f'<td class="detail">{applies or "—"}</td>'
            f'<td class="detail" title="{list_tip}">{len(lists)}<span class="unit"> blocklist'
            f"{'' if len(lists) == 1 else 's'}</span></td>"
            f'<td class="detail">{rules or "—"}</td></tr>'
        )
    return panel(
        "pihole",
        "Pi-hole groups",
        '<p class="muted">Read-only. These are managed in Pi-hole; curfew\'s own profile '
        "groups are left out.</p>"
        + data_table(["Group", "Applies to", "Blocklists", "Rules"], rows, "cards"),
        '<a href="https://homehub/admin/groups">Edit in Pi-hole ›</a>',
        "groups-panel",
    )


STATUS_WORDS = {
    "ok": "working",
    "warn": "warn",
    "bad": "not working",
    "off": "off",
    "unknown": "?",
}


def hop_details(facts: list[tuple[str, str]]) -> str:
    """Return a hop's facts as rows for its opened row: key, then value."""
    return "".join(
        f'<span class="info-key">{html.escape(key)}</span><span>{html.escape(value)}</span>'
        for key, value in facts
    )


def render_fact(key: str, value: str) -> str:
    """Return one fact of a hop: the key stands out from its value."""
    shown = f'<span class="fact-key">{html.escape(key)}</span> ' if key else ""
    return f"<li>{shown}{html.escape(value)}</li>"


def render_path(hops: list[Hop]) -> str:
    """Return the connection path: one row per hop, coloured and worded by its state.

    A hop with a summary opens (a native disclosure) to show every fact.
    """
    rows = []
    for hop in hops:
        row = (
            '<span class="hop-dot" aria-hidden="true"></span>'
            f"<strong>{html.escape(hop.title)}</strong>"
            f"<ul>{''.join(render_fact(k, v) for k, v in hop.summary or hop.facts)}</ul>"
            # A working or switched-off hop needs only its dot (an off one's facts
            # say so); trouble is also said in words, as colour alone isn't enough.
            f'<span class="{"sr-only" if hop.status in ("ok", "off") else "hop-word"}">'
            f"{STATUS_WORDS[hop.status]}</span>"
        )
        body = (
            f'<details class="hop-detail"><summary class="hop-row">{row}</summary>'
            f'<div class="hop-facts">{hop_details(hop.facts)}</div></details>'
            if hop.summary
            else f'<div class="hop-row">{row}</div>'
        )
        rows.append(
            f'<li class="hop hop-{hop.status}" data-key="{html.escape(hop.title)}">{body}</li>'
        )
    cards = "".join(rows)
    return panel(
        "path",
        "Connection path",
        f'<ol class="path">{cards}</ol>',
        f'<span class="muted">from your devices out to the internet · '
        f"checked every {REFRESH_PATH} s</span>",
        attrs=f'id="path" data-part="/network/path" data-every="{REFRESH_PATH}"',
    )


QUALITY_RANGES = {"24h": "24 hours", "7d": "7 days"}


def render_quality(traffic: sqlite3.Connection | None, range_key: str, now: dt.datetime) -> str:
    """Return the connection quality history: latency lines over a loss strip, and a table."""
    series = quality_series(traffic, quality_edges(range_key, now))
    links = "".join(
        f'<a href="/network?quality={key}"{" aria-current=page" if key == range_key else ""}>'
        f"{label}</a>"
        for key, label in QUALITY_RANGES.items()
    )
    recorded = [row for row in series if row[1] is not None or row[2] is not None]
    if not recorded:
        body = '<p class="muted">Recording starts with the next minute\'s check.</p>'
    else:
        rows = [
            f"<tr><td>{dt.datetime.fromtimestamp(start).astimezone().strftime('%a %H:%M')}</td>"
            + "".join(
                f'<td class="num">{"—" if value is None else f"{value:.0f} ms"}</td>'
                for value in (gateway, internet)
            )
            + f'<td class="num">{0 if loss is None else loss:.0%}</td></tr>'
            for start, gateway, internet, loss in reversed(recorded)
        ]
        body = (
            legend(
                [
                    ("swatch-down", "Fibrenet gateway", ""),
                    ("swatch-up", f"Internet ({PING_TARGETS[0]})", ""),
                    ("swatch-cut", "Packet loss", ""),
                ]
            )
            + f'<div class="chart-wrap">{quality_chart_svg(series, range_key)}</div>'
            + table_twin(data_table(["Time", "Gateway|num", "Internet|num", "Lost|num"], rows))
        )
    return panel(
        "quality",
        "Connection quality",
        body,
        f'<nav class="ranges" aria-label="Period">{links}</nav>',
    )


def render_bandwidth(
    traffic: sqlite3.Connection | None, now: dt.datetime, table: bool = True
) -> str:
    """Return the weekly speed tests: download and upload over time, and a table
    (the TV leaves the table out)."""
    results = speed_history(traffic)
    if not results:
        body = (
            '<p class="muted">The first test runs on Sunday at 03:30, once the house is '
            "quiet. To run one now: <code>sudo curfew speedtest</code> on homehub.</p>"
        )
    else:
        latest = next((result for result in reversed(results) if result.down_bps), None)
        rows = [
            f"<tr><td>{when(result)}</td>"
            + (
                f'<td class="num">{mbps(result.down_bps)}</td>'
                f'<td class="num">{mbps(result.up_bps)}</td>'
                f'<td class="num">{result.ping_ms:.0f} ms</td>'
                f"<td>{html.escape(result.server)}"
                + (
                    f' <span class="muted">(house busy, {mbps(result.busy_bps)})</span>'
                    if result.busy_bps >= BUSY_BPS
                    else ""
                )
                + "</td>"
                if result.down_bps is not None
                else f'<td colspan="4" class="error">Failed: {html.escape(result.server)}</td>'
            )
            + "</tr>"
            for result in reversed(results)
        ]
        body = (
            legend(
                [
                    ("swatch-down", "Download", f"<strong>{mbps(latest.down_bps)}</strong>"),
                    (
                        "swatch-up",
                        "Upload",
                        f"<strong>{mbps(latest.up_bps)}</strong>"
                        f' <span class="muted">· latest, {when(latest)}</span>',
                    ),
                ]
                if latest
                else [("swatch-down", "Download", ""), ("swatch-up", "Upload", "")]
            )
            + f'<div class="chart-wrap">{bandwidth_chart_svg(results, now)}</div>'
            + (
                table_twin(data_table(["When", "Down|num", "Up|num", "Ping|num", "Server"], rows))
                if table
                else ""
            )
        )
    return panel(
        "bandwidth",
        "Bandwidth",
        body,
        '<span class="muted">weekly, Sun 03:30</span>',
    )


def render_network(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    now: dt.datetime,
    traffic: sqlite3.Connection | None = None,
    pihole: dict | None = None,
    pihole_groups: list[dict] | None = None,
    hops: list[Hop] | None = None,
    quality_range: str = "24h",
    lease_records: dict[str, LeaseRecord] | None = None,
    dhcp_service: ServiceState | None = None,
) -> str:
    """Return the Network page: path and quality, the constellation, DHCP, Pi-hole.

    The constellation shows the same devices as the Devices list (recent
    ones, plus any blocked, allowed or in a profile).
    """
    today = usage_totals(traffic, local_midnight(now))
    rows, _private_blocked = collect_rows(state, leases, conf_names, now, show_all=False)
    router = next((row for row in rows if is_router(row.mac)), None)
    stars = [
        Star(
            row.mac,
            row.name,
            device_kind(row.name, row.mac),
            bool(row.lease and row.lease.online),
            row.status == "allowed",
            sum(today.get(row.mac, (0, 0))),
        )
        for row in rows
        if row is not router
    ]
    hub_used = sum(today.get(router.mac, (0, 0))) if router else 0
    summaries = [
        dhcp_summary(lease_records, dhcp_service, state.get("dhcp"), now)
        if lease_records is not None and dhcp_service is not None
        else "",
        render_pihole_panel(pihole),
    ]
    # The two summary cards share a row when both are there (one column on phones).
    pair = "".join(summaries)
    if all(summaries):
        pair = f'<div class="duo duo-even">{pair}</div>'
    body = (
        "<h1>Network</h1>"
        + (render_path(hops) if hops else "")
        + render_quality(traffic, quality_range, now)
        + render_bandwidth(traffic, now)
        + render_constellation(stars, router.mac if router else "", hub_used)
        + pair
        + render_pihole_groups(pihole_groups)
    )
    return page(
        f"Network · {APP_NAME}", chrome("network", body, sky_phase(state, now)), script=True
    )
