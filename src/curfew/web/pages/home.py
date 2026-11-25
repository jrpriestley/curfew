"""Home: summary tiles, new devices, profile cards, live view, Pi-hole."""

import datetime as dt
import html
import sqlite3

from curfew.config import APP_NAME
from curfew.devices import MAX_NAME, display_name
from curfew.leases import Lease
from curfew.policy import internet_status, pending_macs
from curfew.schedules import next_change_parts
from curfew.traffic import WAN_KEY, local_midnight, range_edges, usage_series, usage_totals
from curfew.web.charts import day_strip_svg, render_live_panel, usage_block
from curfew.web.components import (
    action_button,
    countdown,
    data_table,
    device_cell,
    format_bytes,
    format_seen,
    override_controls,
    panel,
    pause_all_controls,
    post_form,
    profile_state_html,
    router_notice,
    submit,
    tile,
)
from curfew.web.layout import chrome, page
from curfew.web.sky import sky_phase


def render_profile_cards(state: dict, now: dt.datetime, today: dict[str, tuple[int, int]]) -> str:
    """Return the Profiles section: a card per profile, Pause all, and a create card."""
    cards = []
    profiles = sorted(state["profiles"].items(), key=lambda item: item[1]["name"].lower())
    for profile_id, profile in profiles:
        members = profile.get("members", [])
        used = sum(sum(today.get(mac, (0, 0))) for mac in members)
        sites = len(profile.get("sites", []))
        parts = next_change_parts(profile, now)
        next_line = (
            f'<p class="next-line">{parts.verb} {parts.when} '
            f"<small>in {countdown(parts.moment, parts.wait, now)}</small></p>"
            if parts
            else '<p class="next-line"><small>No schedule</small></p>'
        )
        strip = day_strip_svg(profile, now) if profile.get("schedules") else ""
        cards.append(
            f'<article class="card profile-card" aria-labelledby="p-{profile_id}" '
            f'data-key="p-{profile_id}">'
            f'<div class="card-head"><h3 id="p-{profile_id}"><a href="/profile?id={profile_id}">'
            f"{html.escape(profile['name'])}</a></h3>{profile_state_html(profile, now)}</div>"
            f"{next_line}{strip}"
            '<dl class="facts">'
            f"<div><dt>Devices</dt><dd>{len(members)}</dd></div>"
            f"<div><dt>Today</dt><dd>{format_bytes(used) if used else '—'}</dd></div>"
            f"<div><dt>Sites blocked</dt><dd>{sites}</dd></div></dl>"
            f'<div class="card-actions">{override_controls(profile_id, profile, now)}</div>'
            "</article>"
        )
    cards.append(
        '<article class="card profile-card new-card" aria-label="New profile">'
        '<p class="muted">Create a profile</p>'
        + post_form(
            "/profile",
            {"action": "create"},
            f'<input type="text" name="name" maxlength="{MAX_NAME}" required '
            'aria-label="Profile name" placeholder="Name, e.g. TVs">' + submit("Create"),
        )
        + "</article>"
    )
    head_controls = pause_all_controls(state, now) if profiles else ""
    return (
        '<section aria-labelledby="profiles-title"><div class="section-head">'
        f'<h2 id="profiles-title">Profiles</h2>{head_controls}</div>'
        f'<div class="profile-grid">{"".join(cards)}</div></section>'
    )


def render_unknown_queue(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    pending: list[str],
    now: dt.datetime,
) -> str:
    """Return the new-device approval queue, or '' when blocking new devices is off."""
    if not state["settings"].get("block_unknown"):
        return ""
    rows = []
    for mac in pending:
        lease = leases[mac]
        record = state["devices"].get(mac, {})
        name = display_name(mac, record, lease, conf_names)
        form_id = "approve-" + mac.replace(":", "")
        # The name box sits in its own cell, tied to the Approve form by id,
        # so every row's box and buttons line up in columns.
        rows.append(
            f"<tr>{device_cell(name, mac, lease, record)}"
            f'<td class="seen detail">{format_seen(lease.last_seen, now)}</td>'
            f'<td class="newname"><input type="text" name="name" form="{form_id}" '
            f'maxlength="{MAX_NAME}" aria-label="Name for {html.escape(name or mac)}" '
            f'placeholder="Name it" value="{html.escape(name)}"></td>'
            f'<td class="actions">{action_button(mac, "approve", "Approve", form_id=form_id)}'
            f"{action_button(mac, 'guest', 'For a day')}"
            f"{action_button(mac, 'block', 'Keep blocked')}</td></tr>"
        )
    queue = (
        data_table(
            ["Device", "Last seen", "Name", '<span class="sr-only">Actions</span>'], rows, "cards"
        )
        if rows
        else '<p class="muted">No new devices waiting.</p>'
    )
    return panel("queue", "New devices", queue)


def render_tiles(
    state: dict,
    leases: dict[str, Lease],
    now: dt.datetime,
    today: dict[str, tuple[int, int]],
    links: bool = True,
) -> str:
    """Return the summary tiles: online, blocked now, today's use, next change.

    Without ``links`` (a read-only account) they're figures, not links to pages it can't open.
    """

    def linked(href: str, label: str, value: str, sub: str, alert: bool = False) -> str:
        return tile(href if links else "", label, value, sub, alert)

    local = now.astimezone()
    online = [mac for mac, lease in leases.items() if lease.online]
    blocked = sum(1 for mac in online if internet_status(state, mac, local) != "allowed")
    used = sum(today.get(WAN_KEY, (0, 0)))
    changes = sorted(
        (parts.moment, profile_id, parts)
        for profile_id, profile in state["profiles"].items()
        if (parts := next_change_parts(profile, local)) is not None
    )
    if changes:
        _moment, profile_id, parts = changes[0]
        profile = state["profiles"][profile_id]
        outcome = "allowed" if parts.verb.startswith("Allowed") else "blocked"
        next_tile = linked(
            f"/profile?id={profile_id}",
            "Next change",
            parts.when,
            f"{html.escape(profile['name'])} {outcome}",
        )
    else:
        next_tile = linked("/#profiles-title", "Next change", "—", "no schedules")
    return (
        '<div class="tiles">'
        + linked("/devices?sort=seen", "Online now", str(len(online)), "devices")
        + linked(
            "/devices?sort=status",
            "Blocked now",
            str(blocked),
            "of the online devices",
            alert=bool(blocked),
        )
        + linked("/usage", "Today", format_bytes(used), "through the connection")
        + next_tile
        + "</div>"
    )


# Query outcomes, grouped for people; status names are Pi-hole's.
def render_home(
    state: dict,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    active: bool,
    now: dt.datetime,
    traffic: sqlite3.Connection | None = None,
    viewer: bool = False,
) -> str:
    """Return Home: tiles, waiting devices, profiles, the live view and today's chart.

    A read-only account (``viewer``) gets the figures only: the tiles (not links), the
    live view and today's chart; nothing to change and no way to the other pages.
    """
    today = usage_totals(traffic, local_midnight(now))
    if viewer:
        body = (
            '<h1 class="sr-only">Home</h1>'
            f"{render_tiles(state, leases, now, today, links=False)}"
            f"{render_live_panel()}"
            f"{render_usage_panel(traffic, now, links=False)}"
        )
        return page(
            f"{APP_NAME} · homehub",
            chrome("home", body, sky_phase(state, now), viewer=True),
            script=True,
        )
    pending = pending_macs(state, leases, conf_names, now)
    body = (
        f'{router_notice(active)}<h1 class="sr-only">Home</h1>'
        f"{render_tiles(state, leases, now, today)}"
        f"{render_unknown_queue(state, leases, conf_names, pending, now)}"
        f"{render_profile_cards(state, now.astimezone(), today)}"
        f"{render_live_panel()}"
        f"{render_usage_panel(traffic, now)}"
    )
    return page(f"{APP_NAME} · homehub", chrome("home", body, sky_phase(state, now)), script=True)


def render_usage_panel(
    traffic: sqlite3.Connection | None, now: dt.datetime, links: bool = True
) -> str:
    """Return the main page's whole-connection chart for the last 24 hours."""
    series = usage_series(traffic, [WAN_KEY], range_edges("24h", now))
    return panel(
        "usage",
        "Internet use · last 24 hours",
        usage_block(series, "24h", "whole connection"),
        '<a href="/usage">Details and top devices ›</a>' if links else "",
    )
