"""One profile: status, week, schedules, sites, use, devices, manage."""

import collections
import datetime as dt
import html
import sqlite3

from curfew.config import APP_NAME, RECENT_DAYS
from curfew.devices import MAX_NAME, display_name
from curfew.leases import Lease, is_router
from curfew.policy import SITE_PRESETS, internet_status, profile_for
from curfew.schedules import (
    DAY_NAMES,
    format_days,
    schedule_active,
)
from curfew.traffic import local_midnight, range_edges, usage_series, usage_totals
from curfew.web.charts import usage_block, week_timeline_svg
from curfew.web.components import (
    data_table,
    next_change_html,
    override_controls,
    panel,
    post_form,
    profile_form,
    profile_state_html,
    submit,
)
from curfew.web.layout import chrome, page
from curfew.web.pages.devices import DeviceRow, device_row
from curfew.web.sky import sky_phase


def render_profile(
    state: dict,
    profile_id: str,
    leases: dict[str, Lease],
    conf_names: dict[str, str],
    now: dt.datetime,
    traffic: sqlite3.Connection | None = None,
) -> str:
    """Return one profile's page: status, schedules, sites, use, members, rename/delete."""
    profile = state["profiles"][profile_id]
    members = profile.get("members", [])
    use_series = usage_series(traffic, members, range_edges("24h", now))
    local = now.astimezone()
    name = html.escape(profile["name"])
    hidden = {"id": profile_id}
    cutoff = now - dt.timedelta(days=RECENT_DAYS)
    candidate_macs = [
        mac
        for mac in set(leases) | set(state["devices"])
        if mac not in members
        and not is_router(mac)
        and (mac in state["devices"] or leases[mac].last_seen >= cutoff)
    ]
    labels = {
        mac: display_name(mac, state["devices"].get(mac, {}), leases.get(mac), conf_names)
        or "Unnamed device"
        for mac in [*members, *candidate_macs]
    }

    schedule_rows = [
        f"<tr><td>{format_days(s['days'])}</td><td>{s['start']}</td><td>{s['end']}"
        f"{' <span class=muted>(next day)</span>' if s['end'] <= s['start'] else ''}</td>"
        f"<td>{'<strong>active now</strong>' if schedule_active(s, local) else ''}</td>"
        f"<td>{profile_form(profile_id, 'remove_schedule', 'Remove', extra={'sid': s['id']})}"
        "</td></tr>"
        for s in profile.get("schedules", [])
    ]
    day_boxes = "".join(
        f'<label><input type="checkbox" name="day{index}" value="1"> {day}</label>'
        for index, day in enumerate(DAY_NAMES)
    )
    today = usage_totals(traffic, local_midnight(now))
    member_rows = [
        device_row(
            DeviceRow(
                mac,
                display_name(mac, state["devices"].get(mac, {}), leases.get(mac), conf_names),
                state["devices"].get(mac, {}),
                leases.get(mac),
                internet_status(state, mac, local),
                profile_id,
            ),
            state,
            today.get(mac),
            now,
            show_profile=False,
        )
        for mac in sorted(members, key=lambda m: labels[m].lower())
    ]
    # Named devices first, alphabetically; unnamed ones at the end.
    candidates = sorted(
        candidate_macs, key=lambda m: (labels[m] == "Unnamed device", labels[m].lower(), m)
    )
    label_counts = collections.Counter(labels[mac].lower() for mac in candidates)

    def option_text(mac: str) -> str:
        """Name, plus the IP only where the name alone is ambiguous."""
        text = labels[mac]
        if label_counts[text.lower()] > 1 or text == "Unnamed device":
            lease = leases.get(mac)
            text += f" · {lease.ip}" if lease else f" · …{mac[-5:]}"
        owner = profile_for(state, mac)[0]
        if owner:
            text += f" — in {state['profiles'][owner]['name']}"
        return html.escape(text)

    options = "".join(f'<option value="{mac}">{option_text(mac)}</option>' for mac in candidates)
    status = profile_state_html(profile, local)
    upcoming = next_change_html(profile, local)
    if upcoming:
        status += f' <span class="muted">· {upcoming}</span>'
    no_rows = '<p class="muted">{}</p>'.format
    body = (
        f'<p class="crumbs"><a href="/">Home</a> › Profile</p><h1>{name}</h1>'
        + panel(
            "now",
            "Right now",
            f'<p>{status} <span class="muted">(homehub time {local.strftime("%a %H:%M")})'
            "</span></p>",
            override_controls(profile_id, profile, local),
        )
        + panel(
            "week",
            "Week at a glance",
            '<p class="muted">Shaded: no internet for this profile\'s devices. '
            "The line marks now; hover a block for its times.</p>"
            f'<div class="chart-wrap">{week_timeline_svg(profile, local)}</div>',
        )
        + panel(
            "sched",
            "Schedules",
            '<p class="muted">Members have no internet during these windows. A window that ends '
            "at or before its start runs overnight into the next day.</p>"
            + (
                data_table(
                    ["Days", "From", "To", "Now", '<span class="sr-only">Actions</span>'],
                    schedule_rows,
                )
                if schedule_rows
                else no_rows("No schedules yet.")
            )
            + post_form(
                "/profile",
                {**hidden, "action": "add_schedule"},
                '<span class="days" role="group" aria-label="Days"><span class="muted">Days</span>'
                f"{day_boxes}</span>"
                '<label>From <input type="time" name="start" value="21:00" required></label>'
                '<label>To <input type="time" name="end" value="07:00" required></label>'
                + submit("Add schedule"),
                "inline-form",
            ),
        )
        + render_sites(profile_id, profile)
        + panel(
            "use",
            "Internet use · last 24 hours",
            usage_block(use_series, "24h", profile["name"]),
            f'<a href="/usage?profile={profile_id}">Details ›</a>',
        )
        + panel(
            "members",
            "Devices",
            (
                data_table(
                    [
                        "Device",
                        "Last seen",
                        "Today",
                        "Internet",
                        '<span class="sr-only">Details</span>',
                    ],
                    member_rows,
                    "cards device-table",
                )
                if member_rows
                else no_rows("No devices yet.")
            )
            + post_form(
                "/profile",
                {**hidden, "action": "add_member"},
                f'<label>Add device <select name="mac" required>{options}</select></label>'
                + submit("Add"),
                "inline-form",
            )
            + no_rows("A device belongs to one profile; adding it here moves it."),
        )
        + panel(
            "manage",
            "Manage",
            post_form(
                "/profile",
                {**hidden, "action": "rename"},
                f'<label>Name <input type="text" name="name" maxlength="{MAX_NAME}" required '
                f'value="{name}"></label>' + submit("Rename"),
                "inline-form",
            )
            # Set apart below a rule, and tinted once opened, so it's never hit by accident.
            + '<details class="danger-zone"><summary>Delete this profile…</summary>'
            + '<div class="danger-body">'
            + no_rows("Its devices keep any individual blocks; schedules are removed.")
            + profile_form(profile_id, "delete", "Delete profile", "block")
            + "</div></details>",
        )
    )
    return page(
        f"{profile['name']} · {APP_NAME}", chrome("home", body, sky_phase(state, now)), script=True
    )


def render_sites(profile_id: str, profile: dict) -> str:
    """Return a profile's Blocked sites section: the list, an add box and presets."""
    sites = profile.get("sites", [])
    listing = (
        '<ul class="sites">'
        + "".join(
            f"<li>{html.escape(site)}"
            + profile_form(profile_id, "remove_site", "×", "ghost", {"site": site}).replace(
                "<button type=submit",
                f'<button type=submit aria-label="Unblock {html.escape(site)}" title="Unblock"',
                1,
            )
            + "</li>"
            for site in sites
        )
        + "</ul>"
        if sites
        else '<p class="muted">No sites blocked.</p>'
    )
    presets = "".join(
        profile_form(profile_id, "add_site", name, extra={"preset": name})
        for name, domains in SITE_PRESETS.items()
        if not set(domains) <= set(sites)
    )
    return panel(
        "sites",
        "Blocked sites",
        '<p class="muted">Blocked for this profile\'s devices at all times, through Pi-hole, '
        "including subdomains. Takes a few minutes to bite (DNS caches). Apps that use their "
        "own encrypted DNS can get around it.</p>"
        + listing
        + post_form(
            "/profile",
            {"id": profile_id, "action": "add_site"},
            '<label>Site <input type="text" name="site" required maxlength="300" '
            'placeholder="e.g. youtube.com"></label>' + submit("Block", "block"),
            "inline-form",
        )
        + (
            f'<div class="presets"><span class="muted">Quick add:</span>{presets}</div>'
            if presets
            else ""
        ),
    )
