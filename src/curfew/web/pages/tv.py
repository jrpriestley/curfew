"""TV: curfew on the living-room TV (the Fire TV app shows it), read-only.

Signed in with the TV key (curfew tv-link), not a password, so it reaches
only /tv: Home (a dashboard: tiles, the live view, the constellation,
today's busiest devices, the weekly speed tests), Devices, Network and
Usage (the web pages, with every form, button and box taken out), and
Settings (dark or light, and when the screensaver starts). The remote steps
through the tabs (app.js). The screensaver (/tv/flow) shows the house's
traffic flowing between the internet, homehub and each device.
"""

import datetime as dt
import html
import json
import random
import sqlite3
from collections import Counter
from importlib import resources
from typing import NamedTuple

from curfew import __version__
from curfew.config import APP_NAME, LATITUDE, LONGITUDE, RECENT_DAYS, REFRESH_PAGE
from curfew.devices import KIND_LABELS, device_kind
from curfew.events import Event
from curfew.leases import Lease, is_router
from curfew.traffic import WAN_KEY, first_seen, local_midnight, peak_rate, usage_totals
from curfew.weather import Weather, scene_weather, weather_icon, wind_words
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
from curfew.web.pages.home import render_tiles
from curfew.web.pages.network import render_bandwidth
from curfew.web.sky import logo_svg, sky_hours, sky_phase

TV_LIVE = "/tv/live.json"  # the TV's own feeds: the TV key opens these, not /live.json
TV_SETTINGS = "/tv/settings"  # Settings' forms post here too
TV_FLOW = "/tv/flow"  # the screensaver
TV_FRAMES = "/tv/frames"  # the screensaver's frame report, once a minute
TV_THEMES = ("dark", "light")  # dark first: the TV's default
# When the screensaver starts, in minutes without a key ("off": never).
SAVER_CHOICES = {"2": "2 min", "5": "5 min", "15": "15 min", "off": "Off"}
SAVER_DEFAULT = "5"
SAVER_COOKIE = "curfew_saver"  # the choice, kept on the TV (sent only to /tv)
# How the screensaver looks (OK on it goes to the next, in this order). Orbit: 3D, devices
# orbiting. Still: flat and still. Neighbourhood: a town of streets and houses,
# the data driving between them. Forest: a tree for each device, growing with its traffic.
# Highway: a car on a highway, as fast as the house is using the line.
FLOW_LOOKS = {
    "space": "Orbit",
    "simple": "Still",
    "town": "Neighbourhood",
    "forest": "Forest",
    "highway": "Highway",
}
FLOW_COOKIE = "curfew_flow"  # kept on the TV (sent only to /tv); OK on the screensaver sets it
# The screensaver's sound (Highway's, flow-sound.js): off unless chosen. Kept on the TV
# (Settings) or the computer (Controls), sent only to /tv.
SOUND_CHOICES = {"on": "On", "off": "Off"}
SOUND_COOKIE = "curfew_sound"


class TvPrefs(NamedTuple):
    """What Settings keeps on the TV."""

    theme: str = TV_THEMES[0]
    saver: str = SAVER_DEFAULT
    flow: str = "space"
    sound: str = "off"


DEFAULT_PREFS = TvPrefs()


TOP_DEVICES = 8

# The TV's tabs: (key, path, label); the remote's left and right walk this order.
TV_TABS = (
    ("home", "/tv", "Home"),
    ("settings", "/tv/settings", "Settings"),
)


def tv_page(active: str, content: str, state: dict, now: dt.datetime, prefs: TvPrefs) -> str:
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


def themed(page_html: str, prefs: TvPrefs, css: str = "tv-page") -> str:
    """Return a page in the TV's theme, marked as a TV page (for its styles and keys)."""
    return page_html.replace(
        '<html lang="en">', f'<html lang="en" data-theme="{prefs.theme}" class="{css}">', 1
    )


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
        f"{device_badge(row.name, row.mac, row.lease)}"
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
    prefs: TvPrefs = DEFAULT_PREFS,
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
            device_kind(row.name, row.mac),
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


def render_tv_settings(state: dict, now: dt.datetime, prefs: TvPrefs) -> str:
    """Return Settings: the theme and the screensaver, kept on the TV (OK picks)."""
    themes = {choice: (choice, choice.title()) for choice in TV_THEMES}
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
            " what happens along the way. ▲ on the screensaver turns it on, ▼ off.</p>",
        )
        + '<p class="muted">▲ ▼ to choose, OK to pick. Kept on this TV.</p>'
    )
    return tv_page("settings", content, state, now, prefs)


def render_weather(weather: Weather | None) -> str:
    """Return the screensaver's weather corner: now, in words, today's range and the wind."""
    if weather is None:
        return ""
    return (
        f'<div class="flow-weather"><strong>{icon(weather_icon(weather))}'
        f"{weather.temperature:.0f}°</strong>"
        f"<span>{html.escape(weather.words)}</span>"
        f"<small>feels {weather.feels:.0f}° · high {weather.high:.0f}° · "
        f"low {weather.low:.0f}° · {wind_words(weather)}</small></div>"
    )


# Under the weather: the date, then the calendar's events, so many a day at most.
EVENTS_SHOWN = {"Today": 4, "Tomorrow": 3}


def render_calendar(local: dt.datetime, days: list[tuple[str, list[Event]]]) -> str:
    """Return the screensaver's day: the date, then today's and tomorrow's events, if any.

    All-day events first, then by time; a day with more than fit says how many more.
    """
    sections = []
    for label, events in days:
        shown = events[: EVENTS_SHOWN.get(label, 3)]
        items = "".join(
            f"<li><time>{'All day' if event.all_day else f'{event.start:%H:%M}'}</time>"
            f"<span>{html.escape(event.title)}</span></li>"
            for event in shown
        )
        more = len(events) - len(shown)
        if more:
            items += f'<li class="more">and {more} more</li>'
        sections.append(f"<section><h3>{label}</h3><ul>{items}</ul></section>")
    date = f'<p class="flow-date">{local:%A %-d %B}</p>'
    return f'<div class="flow-calendar">{date}{"".join(sections)}</div>'


# The screensaver's facts about the internet (data/internet-facts.txt, the nerdier the
# better); one of the house's own (flow_facts) comes between every two.
INTERNET_FACTS = tuple(
    line.strip()
    for line in (resources.files("curfew") / "data" / "internet-facts.txt")
    .read_text()
    .splitlines()
    if line.strip() and not line.startswith("#")
)
HD_HOUR = 3e9  # bytes in an hour of HD video, roughly
FILM = 5e9  # bytes in a film, for the speed test's sake


def counted(count: int, noun: str) -> str:
    """Return "1 device", "3 devices"."""
    return f"{count} {noun}{'' if count == 1 else 's'}"


def flow_facts(
    rows: list,
    today: dict[str, tuple[int, int]],
    week: dict[str, tuple[int, int]],
    line: tuple[float, float] | None,
) -> list[str]:
    """Return the screensaver's facts: the internet's, with one of the house's own (now)
    between every two."""
    devices = [row for row in rows if not is_router(row.mac)]
    online = [row for row in devices if row.lease and row.lease.online]
    used = sum(today.get(WAN_KEY, (0, 0)))
    house = [
        f"{counted(len(online), 'device')} {'is' if len(online) == 1 else 'are'} online right"
        f" now, of {len(devices)} seen in the last {RECENT_DAYS} days."
    ]
    if used:
        house.append(
            f"The house has used {format_bytes(used)} today: about"
            f" {used / HD_HOUR:.0f} hours of HD video."
        )
        busiest = max(devices, key=lambda row: sum(today.get(row.mac, (0, 0))), default=None)
        most = sum(today.get(busiest.mac, (0, 0))) if busiest else 0
        if most:
            house.append(
                f"Busiest today: {busiest.name or 'an unknown device'}, with"
                f" {format_bytes(most)} ({100 * most / used:.0f}% of the house's traffic)."
            )
    if sum(week.get(WAN_KEY, (0, 0))):
        house.append(
            f"This week, {format_bytes(sum(week[WAN_KEY]))} has come through the connection."
        )
    if line:
        house.append(
            f"The last speed test measured {line[0] / 1e6:.0f} Mb/s down and"
            f" {line[1] / 1e6:.0f} up: a 5 GB film in about {FILM * 8 / line[0]:.0f} seconds."
        )
    kinds = Counter(device_kind(row.name, row.mac) for row in devices)
    if kinds:
        kind, count = kinds.most_common(1)[0]
        house.append(f"{KIND_LABELS[kind]} is the house's biggest group: {count} devices.")
    cut = sum(1 for row in online if row.status != "allowed")
    if cut:
        house.append(
            f"{counted(cut, 'device')} online {'is' if cut == 1 else 'are'} cut off right now,"
            " by profile or by hand."
        )
    facts = []  # the internet's in a new order each time, so the screen doesn't repeat itself
    for index, fact in enumerate(random.sample(INTERNET_FACTS, len(INTERNET_FACTS))):
        if index % 2 == 0:  # the house's own, between every two
            facts.append(house[index // 2 % len(house)])
        facts.append(fact)
    return facts


NEW_SECONDS = 3600  # a device first seen this recently is new (Forest sends a visitor)


def is_new(traffic: sqlite3.Connection | None, mac: str, now: dt.datetime) -> bool:
    """Return whether a device was first seen within NEW_SECONDS (not just as records begin)."""
    seen = first_seen(traffic, mac)
    return bool(seen and not seen[1] and now.timestamp() - seen[0] < NEW_SECONDS)


def render_tv_flow(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    now: dt.datetime,
    prefs: TvPrefs,
    back: str = "/tv",
    weather: Weather | None = None,
    line: tuple[float, float] | None = None,
    traffic: sqlite3.Connection | None = None,
    measured: tuple[float, float] | None = None,
    days: list[tuple[str, list[Event]]] | None = None,
) -> str:
    """Return the screensaver: a canvas the page script fills with the house's traffic.

    ``line`` is what the connection can carry (bits a second, down and up), against
    which the page shows each device's and the house's share; ``measured`` is the
    latest speed test's reading, for a fact; ``days`` the calendar's today and
    tomorrow, under the weather with the date.

    The devices to draw (name, kind, online, allowed, today's bytes, new) ride along as JSON; their
    traffic comes live from the TV's feeds. ``back`` is the tab any key returns to.
    """
    rows, _private_blocked = collect_rows(state, leases, conf_names, now, show_all=False)
    today = usage_totals(traffic, local_midnight(now))
    devices = [
        {
            "mac": row.mac,
            "name": row.name or "Unknown device",
            "kind": device_kind(row.name, row.mac),
            "online": bool(row.lease and row.lease.online),
            "allowed": row.status == "allowed",
            "today": sum(today.get(row.mac, (0, 0))),  # bytes: the dot's size
            "profile": row.profile_id or "",  # its constellation
            "new": is_new(traffic, row.mac, now),  # Forest's visitor
        }
        for row in rows
        if not is_router(row.mac)
    ]
    local = now.astimezone()
    week = usage_totals(traffic, int(now.timestamp()) - 7 * 86400)
    facts = flow_facts(rows, today, week, measured)
    profiles = {key: profile["name"] for key, profile in state["profiles"].items()}
    sky, _why = sky_phase(state, now)
    # When dawn, day, dusk and night start today: Neighbourhood's sky follows them.
    sun = " ".join(f"{hour:.2f}" for hour in sky_hours(local.date(), local.tzinfo))
    # Where homehub is, for the moon's light on the scenes (no sun or moon is drawn);
    # a glow low in the sky at dawn, dusk and by day.
    placed = LATITUDE is not None and LONGITUDE is not None
    place = f' data-place="{LATITUDE:.4f} {LONGITUDE:.4f}"' if placed else ""
    horizon = f'<div class="flow-horizon sky-{sky}"></div>'
    body = (
        f'<main class="tv-flow flow-{prefs.flow}" data-back="{html.escape(back)}">'
        f"{horizon}"
        # The head: a status bar of the weather, the theme's name and the hint; the
        # calendar a panel under it.
        f'<div class="flow-top">{render_weather(weather)}'
        f'<p class="flow-look">{html.escape(FLOW_LOOKS[prefs.flow])}</p>'
        '<p class="flow-hint"><span><b>OK</b> theme</span><span><b>☰</b> zen</span>'
        '<span><b>▲▼</b> sound</span><span class="flow-hint-speed"><b>◀▶</b> speed</span></p>'
        "</div>"
        f"{render_calendar(local, days or [])}"
        '<canvas id="flow" role="img" aria-label="The house\'s traffic, flowing"'
        f' data-src="{TV_LIVE}" data-devices="{html.escape(json.dumps(devices))}"'
        + (f' data-line="{line[0]:.0f} {line[1]:.0f}"' if line else "")
        + f' data-profiles="{html.escape(json.dumps(profiles))}"'
        + f' data-peak="{peak_rate(traffic, WAN_KEY, local_midnight(now)):.0f}"'
        + f' data-day="{local:%Y-%m-%d}" data-look="{prefs.flow}" data-sound="{prefs.sound}"'
        + f' data-sun="{sun}"{place}'
        + f' data-weather="{html.escape(json.dumps(scene_weather(weather)))}"'
        + "></canvas>"
        # The foot: one status bar, the clock, a fact and the connection.
        f'<div class="flow-bar"><div class="flow-clock"><time>{local:%H:%M}</time></div>'
        f'<p class="flow-fact" data-facts="{html.escape(json.dumps(facts))}"></p>'
        '<div class="flow-rates"><canvas class="flow-history" aria-hidden="true"></canvas>'
        '<span class="flow-down">↓ <strong data-flow="down">…</strong>'
        '</span><span class="flow-up">↑ <strong data-flow="up">…</strong></span></div></div>'
        "</main>"
    )
    # Space is dark, whatever the TV's theme.
    dark = prefs._replace(theme="dark")
    return themed(
        page(f"Flow · {APP_NAME} TV", body, script=True, flow=True), dark, "tv-page tv-saver"
    )
