"""One device: what it is, why it has internet or not, and when it was in use."""

import datetime as dt
import html
import sqlite3

from curfew.config import APP_NAME
from curfew.devices import display_name, guest_until
from curfew.leases import Lease
from curfew.policy import internet_status, profile_for
from curfew.traffic import ActivePeriod, active_periods, first_seen, local_midnight, usage_totals
from curfew.web.charts import render_live_panel
from curfew.web.components import (
    STATUS_LABELS,
    data_table,
    device_badge,
    format_bytes,
    next_change_html,
    panel,
)
from curfew.web.layout import chrome, page
from curfew.web.pages.devices import facts, manage, rename_box
from curfew.web.pages.dhcp import device_dhcp
from curfew.web.pages.usage import usage_panels
from curfew.web.sky import sky_phase

STATUS_WHY = {
    "blocked": "Blocked by hand.",
    "unknown": "A new device: no internet until you approve it.",
    "paused": "Its profile is paused.",
    "scheduled": "Its profile's schedule is blocking it.",
    "private": "It uses a private Wi-Fi address, which is blocked unless you allow it.",
    "allowed": "Has internet.",
}


PERIODS_SHOWN = 12


def status_line(state: dict, mac: str, local: dt.datetime) -> str:
    """Return the device's internet status, why, and when its profile next changes."""
    status = internet_status(state, mac, local)
    line = f"{STATUS_LABELS[status]} {STATUS_WHY[status]}"
    until = guest_until(state["devices"].get(mac, {}))
    if until:
        line += f" A guest until {until.astimezone().strftime('%a %H:%M')}, then forgotten."
    profile_id, profile = profile_for(state, mac)
    # A block by hand, approval or the private rule outrank the profile, so
    # its next change only matters when the profile is what decides.
    if profile and status in {"paused", "scheduled", "allowed"}:
        upcoming = next_change_html(profile, local)
        link = f'<a href="/profile?id={profile_id}">{html.escape(profile["name"])}</a>'
        line += f" <span class=muted>{link}{': ' + upcoming if upcoming else ''}"
        line += "</span>"
    return f'<p class="status-line">{line}</p>'


def period_row(period: ActivePeriod, now: dt.datetime) -> str:
    """Return one row of the in-use table: start, end (or "now"), length and data."""
    start = dt.datetime.fromtimestamp(period.start, dt.UTC).astimezone()
    end = dt.datetime.fromtimestamp(period.end, dt.UTC).astimezone()
    ongoing = period.end >= now.timestamp()
    minutes = (min(period.end, int(now.timestamp())) - period.start) // 60
    length = f"{minutes // 60} h {minutes % 60} min" if minutes >= 60 else f"{minutes} min"
    until = (
        "now" if ongoing else end.strftime("%H:%M" if end.date() == start.date() else "%a %H:%M")
    )
    return (
        f"<tr><td>{start.strftime('%a %b %-d, %H:%M')}</td><td>{until}</td>"
        f'<td class="num">{length}</td><td class="num">{format_bytes(period.total)}</td></tr>'
    )


def render_device(
    state: dict,
    mac: str,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    traffic: sqlite3.Connection | None,
    range_key: str,
    now: dt.datetime,
) -> str:
    """Return one device's page: status and facts, controls, when in use, and its charts."""
    local = now.astimezone()
    lease = leases.get(mac)
    record = state["devices"].get(mac, {})
    name = display_name(mac, record, lease, conf_names)
    subject = name or "Unknown device"
    status = internet_status(state, mac, local)
    today = usage_totals(traffic, local_midnight(now)).get(mac)
    periods = active_periods(traffic, mac, now)
    in_use = (
        data_table(
            ["From", "To", "For|num", "Data|num"],
            [period_row(period, now) for period in periods[:PERIODS_SHOWN]],
        )
        if periods
        else '<p class="muted">Not in use in the last 7 days.</p>'
    )
    body = (
        '<p class="crumbs"><a href="/devices">Devices</a> › Device</p>'
        f'<h1 class="dev">{device_badge(name, mac, lease, record)}{rename_box(mac, name)}</h1>'
        + panel(
            "now",
            "Right now",
            status_line(state, mac, local)
            + facts(mac, name, record, lease, today, first_seen(traffic, mac), now),
        )
        + panel("manage", "Manage", manage(state, mac, name, status, lease))
        + device_dhcp(state, mac, name)
        + render_live_panel(f"/live.json?mac={mac}", "Live", "device")
        + panel(
            "in-use",
            "When it was in use · last 7 days",
            '<p class="muted">Spells of steady traffic (over 100 kB in 5 minutes), with gaps '
            "under 15 minutes joined. Background chatter doesn't count. Only how much, never "
            "where: homehub keeps no record of the sites a device visits.</p>" + in_use,
        )
        + usage_panels(traffic, [mac], subject, f"/device?mac={mac}", range_key, now)
    )
    return page(
        f"{subject} · {APP_NAME}", chrome("devices", body, sky_phase(state, now)), script=True
    )
