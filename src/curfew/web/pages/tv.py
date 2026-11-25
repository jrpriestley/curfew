"""TV: curfew on the living-room TV (the Fire TV app shows it), read-only.

Signed in with the TV key (curfew tv-link), not a password, so it reaches
only /tv: Home (a dashboard: tiles, the live view, the constellation,
today's busiest devices, the weekly speed tests), Devices, Network and
Usage (the web pages, with every form, button and box taken out), and
Settings (dark or light, and when the screensaver starts). The remote steps
through the tabs (app.js). Its screensaver is Flow (flow.py), at /tv/flow.
"""

import datetime as dt
import html
import sqlite3

from curfew import __version__
from curfew.config import APP_NAME, REFRESH_PAGE
from curfew.devices import device_kind
from curfew.leases import Lease, is_router
from curfew.traffic import local_midnight, usage_totals
from curfew.web.charts import Star, render_constellation, render_live_panel
from curfew.web.components import (
    STATUS_LABELS,
    data_table,
    device_badge,
    format_bytes,
    panel,
)
from curfew.web.icons import icon
from curfew.web.layout import page
from curfew.web.pages.devices import collect_rows
from curfew.web.pages.flow import (
    DEFAULT_PREFS,
    FLOW_LOOKS,
    SAVER_CHOICES,
    SCREEN_THEMES,
    SOUND_CHOICES,
    TV_LIVE,
    ScreenPrefs,
    themed,
)
from curfew.web.pages.home import render_tiles
from curfew.web.pages.network import render_bandwidth
from curfew.web.sky import logo_svg, sky_phase

TV_SETTINGS = "/tv/settings"  # Settings' forms post here too
TOP_DEVICES = 8

# The TV's tabs: (key, path, label); the remote's left and right walk this order.
TV_TABS = (
    ("home", "/tv", "Home"),
    ("settings", "/tv/settings", "Settings"),
)


def tv_page(active: str, content: str, state: dict, now: dt.datetime, prefs: ScreenPrefs) -> str:
    """Return a TV page: the bar (name, tabs, the remote's keys, clock) and ``content``.

    ``data-saver`` tells the page script when to start the screensaver.
    """
    local = now.astimezone()
    sky, _tip = sky_phase(state, now)
    tabs = "".join(
        f'<a href="{path}"{" aria-current=page" if key == active else ""}>'
        f"{icon(prefs.theme if key == 'settings' else key)}<span>{label}</span></a>"
        for key, path, label in TV_TABS
    )
    bar = (
        f'<header class="topbar tv-bar sky-{sky}"><div class="topbar-inner">'
        f'<span class="brand">{logo_svg(local)}<span>{APP_NAME}</span></span>'
        f'<nav class="primary" aria-label="Sections">{tabs}</nav>'
        '<span class="tv-keys" aria-hidden="true">'
        "◀ ▶ tabs · ▲ ▼ scroll · play: flow</span>"
        f'<span class="tv-version">{APP_NAME} {__version__}</span>'
        f'<span class="tv-clock"><time datetime="{local.isoformat()}">{local:%H:%M}</time>'
        f"<small>{local:%a %-d %b}</small></span></div></header>"
    )
    saver = "" if prefs.saver == "off" else prefs.saver
    body = (
        f'{bar}<main class="tv tv-{active}" data-every="{REFRESH_PAGE}" data-saver="{saver}">'
        f"{content}</main>"
    )
    label = next(label for key, _path, label in TV_TABS if key == active)
    return themed(page(f"{label} · {APP_NAME} TV", body, script=True), prefs)


def render_top_devices(rows: list, today: dict[str, tuple[int, int]]) -> str:
    """Return today's busiest devices: icon and name (and status, if not allowed), how much."""
    busiest = sorted(
        (row for row in rows if sum(today.get(row.mac, (0, 0)))),
        key=lambda row: -sum(today.get(row.mac, (0, 0))),
    )[:TOP_DEVICES]
    if not busiest:
        return panel("top", "Busiest today", '<p class="muted">Nothing used yet today.</p>')
    # Most are allowed: a status shows only for one that isn't, beside its name.
    table_rows = [
        f'<tr data-key="top-{row.mac}"><td class="name"><span class="dev">'
        f"{device_badge(row.name, row.mac, row.lease, row.record)}"
        f"<span>{html.escape(row.name) or '<span class=muted>Unknown device</span>'}</span>"
        f"{'' if row.status == 'allowed' else STATUS_LABELS.get(row.status, '')}"
        f'</span></td><td class="num">{format_bytes(sum(today.get(row.mac, (0, 0))))}</td></tr>'
        for row in busiest
    ]
    return panel(
        "top",
        "Busiest today",
        data_table(["Device", "Today|num"], table_rows, "tv-top"),
    )


def render_tv(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    now: dt.datetime,
    traffic: sqlite3.Connection | None = None,
    prefs: ScreenPrefs = DEFAULT_PREFS,
) -> str:
    """Return the TV's Home: the dashboard."""
    today = usage_totals(traffic, local_midnight(now))
    rows, _private_blocked = collect_rows(state, leases, conf_names, now, show_all=False)
    router = next((row for row in rows if is_router(row.mac)), None)
    devices = [row for row in rows if row is not router]  # homehub's own use isn't a device's
    stars = [
        Star(
            row.mac,
            row.name,
            device_kind(row.name, row.mac, row.record),
            bool(row.lease and row.lease.online),
            row.status == "allowed",
            sum(today.get(row.mac, (0, 0))),
        )
        for row in devices
    ]
    hub_used = sum(today.get(router.mac, (0, 0))) if router else 0
    constellation = render_constellation(stars, router.mac if router else "", hub_used).replace(
        '<svg class="constellation"',
        f'<svg data-src="{TV_LIVE}?devices=1" class="constellation"',
        1,
    )
    content = (
        '<h1 class="sr-only">Home</h1>'
        f"{render_tiles(state, leases, now, today)}"
        '<div class="tv-grid">'
        f'<div class="tv-col">{render_live_panel(TV_LIVE)}'
        f"{render_bandwidth(traffic, now, table=False)}</div>"
        f'<div class="tv-col">{constellation}</div>'
        f'<div class="tv-col">{render_top_devices(devices, today)}</div>'
        "</div>"
    )
    return tv_page("home", content, state, now, prefs)


def option_buttons(field: str, choices: dict[str, tuple[str, str]], chosen: str) -> str:
    """Return a Settings form: one button per choice (value: (icon, label)), the chosen lit."""
    buttons = "".join(
        f'<button type="submit" name="{field}" value="{value}" class="tv-option"'
        f' aria-pressed="{"true" if value == chosen else "false"}">'
        f"{icon(symbol) if symbol else ''}<span>{label}</span></button>"
        for value, (symbol, label) in choices.items()
    )
    return f'<form method="post" action="{TV_SETTINGS}" class="tv-options">{buttons}</form>'


def render_tv_settings(state: dict, now: dt.datetime, prefs: ScreenPrefs) -> str:
    """Return Settings: the theme and the screensaver, kept on the TV (OK picks)."""
    themes = {choice: (choice, choice.title()) for choice in SCREEN_THEMES}
    savers = {value: ("", label) for value, label in SAVER_CHOICES.items()}
    looks = {value: ("", label) for value, label in FLOW_LOOKS.items()}
    sounds = {value: ("", label) for value, label in SOUND_CHOICES.items()}
    content = (
        "<h1>Settings</h1>"
        + panel("theme", "Theme", option_buttons("theme", themes, prefs.theme))
        + panel(
            "saver",
            "Screensaver",
            option_buttons("saver", savers, prefs.saver)
            + '<p class="muted">After this long without a key, the house\'s traffic flows'
            " across the screen. Play starts it any time; any key brings you back.</p>",
        )
        + panel(
            "look",
            "Screensaver look",
            option_buttons("flow", looks, prefs.flow)
            + '<p class="muted">Orbit is 3D, its devices orbiting; Still is flat'
            " and still; Neighbourhood is a town, its data driving the streets; Forest grows"
            " a tree for each device, green while it's busy. OK on the screensaver goes to"
            " the next.</p>",
        )
        + panel(
            "sound",
            "Screensaver sound",
            option_buttons("sound", sounds, prefs.sound)
            + '<p class="muted">Highway\u2019s sound: the engine, the road, the weather and'
            " what happens along the way; Background is all but the engine. ▲ ▼ on the"
            " screensaver turn it up and down, a stage at a time.</p>",
        )
        + '<p class="muted">▲ ▼ to choose, OK to pick. Kept on this TV.</p>'
    )
    return tv_page("settings", content, state, now, prefs)
