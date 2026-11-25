"""Internet use: the whole connection, a device or a profile over time."""

import datetime as dt
import html
import sqlite3

from curfew.config import APP_NAME
from curfew.devices import display_name
from curfew.leases import MAC_RE, Lease
from curfew.traffic import RANGES, WAN_KEY, range_edges, usage_series, usage_totals
from curfew.web.charts import render_calendar, render_rhythm, usage_block
from curfew.web.components import data_table, format_bytes, panel
from curfew.web.layout import chrome, page
from curfew.web.sky import sky_phase


def usage_target(state: dict, query: dict[str, list[str]]) -> tuple[str, str] | None:
    """Return what a usage page shows: ("wan", ""), ("device", mac) or ("profile", id).

    None means the query names a device or profile that isn't valid.
    """
    if "mac" in query:
        mac = query["mac"][0].lower()
        return ("device", mac) if MAC_RE.match(mac) else None
    if "profile" in query:
        profile_id = query["profile"][0]
        return ("profile", profile_id) if profile_id in state["profiles"] else None
    return ("wan", "")


def usage_ranking(
    totals: dict[str, tuple[int, int]],
    keys: list[str] | None,
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    range_key: str,
    limit: int = 15,
) -> str:
    """Return a table of devices by bytes moved, biggest first (``keys`` limits it)."""
    ranked = sorted(
        (
            (down + up, key, down, up)
            for key, (down, up) in totals.items()
            if key != WAN_KEY and (keys is None or key in keys) and down + up
        ),
        reverse=True,
    )[:limit]
    if not ranked:
        return '<p class="muted">No device traffic recorded for this period yet.</p>'
    rows = []
    for total, key, down, up in ranked:
        if MAC_RE.match(key):
            name = display_name(key, state["devices"].get(key, {}), leases.get(key), conf_names)
            label = (
                f'<a href="/device?mac={key}&amp;range={range_key}">'
                f"{html.escape(name or 'Unknown device')}</a>"
            )
        else:
            label = f'<span class="mono">{html.escape(key.removeprefix("ip:"))}</span>'
        rows.append(
            f'<tr><td class="name">{label}</td><td class="num">{format_bytes(down)}</td>'
            f'<td class="num">{format_bytes(up)}</td>'
            f'<td class="num"><strong>{format_bytes(total)}</strong></td></tr>'
        )
    return data_table(["Device", "Download|num", "Upload|num", "Total|num"], rows)


def usage_panels(
    traffic: sqlite3.Connection | None,
    keys: list[str],
    subject: str,
    base: str,
    range_key: str,
    now: dt.datetime,
    details: str = "",
) -> str:
    """Return the chart for a range (with its period links), the weekly rhythm and calendar.

    ``base`` is the page's URL with its query so far; the period links add
    ``range`` to it.
    """
    joiner = "" if base.endswith("?") else "&amp;"
    ranges = "".join(
        f'<a href="{base}{joiner}range={key}"'
        f"{' aria-current=page' if key == range_key else ''}>{label.removeprefix('Last ')}</a>"
        for key, label in RANGES.items()
    )
    series = usage_series(traffic, keys, range_edges(range_key, now))
    return (
        panel(
            "chart",
            RANGES[range_key],
            details + usage_block(series, range_key, subject),
            f'<nav class="ranges" aria-label="Period">{ranges}</nav>',
        )
        + render_rhythm(traffic, keys, now)
        + render_calendar(traffic, keys, now)
    )


def render_usage(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    traffic: sqlite3.Connection | None,
    target: tuple[str, str],
    range_key: str,
    now: dt.datetime,
) -> str:
    """Return a usage page for the whole connection or one profile.

    A single device's use is on its own page (pages.device).
    """
    kind, ident = target
    totals = usage_totals(traffic, range_edges(range_key, now)[0])
    if kind == "profile":
        profile = state["profiles"][ident]
        subject = profile["name"]
        keys = list(profile.get("members", []))
        base = f"/usage?profile={ident}"
        details = (
            f'<p class="muted">All {len(keys)} devices in '
            f'<a href="/profile?id={ident}">{html.escape(subject)}</a>.</p>'
        )
    else:
        subject = "whole connection"
        keys = [WAN_KEY]
        base = "/usage?"
        details = (
            '<p class="muted">Everything through Fibrenet (ppp0). Traffic between devices '
            "in the house never reaches homehub, so it isn't counted.</p>"
        )
    # A profile ranks its members, the whole connection every device.
    ranking = panel(
        "rank",
        "By device" if kind == "profile" else "Top devices",
        usage_ranking(
            totals, keys if kind == "profile" else None, state, leases, conf_names, range_key
        ),
    )
    # Named like its tab; a profile's page sits under it.
    title = "Usage" if kind == "wan" else subject
    heading = (
        "<h1>Usage</h1>"
        if kind == "wan"
        else f'<p class="crumbs"><a href="/usage">Usage</a> › Profile</p>'
        f"<h1>{html.escape(subject)}</h1>"
    )
    body = heading + usage_panels(traffic, keys, subject, base, range_key, now, details) + ranking
    return page(f"{title} · {APP_NAME}", chrome("usage", body, sky_phase(state, now)), script=True)
