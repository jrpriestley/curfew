"""Small HTML building blocks shared by the pages: forms, panels, rows."""

import datetime as dt
import html
from collections.abc import Iterable

from curfew.config import MORNING
from curfew.devices import KIND_LABELS, device_kind, maker_text
from curfew.leases import Lease, is_private
from curfew.schedules import (
    BONUS_CHOICES,
    PAUSE_CHOICES,
    bonus_due,
    bonus_live,
    bonus_window,
    can_give_bonus,
    is_paused,
    next_change_parts,
    profile_block_reason,
    until_active,
)
from curfew.web.icons import icon


def format_seen(when: dt.datetime | None, now: dt.datetime) -> str:
    """Return a short human 'last seen' string."""
    if when is None:
        return "never"
    minutes = int((now - when).total_seconds() // 60)
    if minutes < 2:
        return "just now"
    if minutes < 60:
        return f"{minutes} min ago"
    if minutes < 48 * 60:
        return f"{minutes // 60} h ago"
    return when.astimezone().strftime("%b %-d")


def hidden_inputs(fields: dict[str, str]) -> str:
    """Return hidden inputs for form fields (values escaped)."""
    return "".join(
        f'<input type="hidden" name="{name}" value="{html.escape(value)}">'
        for name, value in fields.items()
    )


def post_form(
    url: str, fields: dict[str, str], inner: str, css: str = "", form_id: str = ""
) -> str:
    """Return a POST form: hidden ``fields`` followed by ``inner`` (inputs, buttons)."""
    attrs = (f' class="{css}"' if css else "") + (f' id="{form_id}"' if form_id else "")
    return f'<form method="post" action="{url}"{attrs}>{hidden_inputs(fields)}{inner}</form>'


def pick(label: str, name: str, choices: Iterable[tuple[str, str]], current: str | None) -> str:
    """Return a labelled drop-down of (value, text) choices."""
    options = "".join(
        f'<option value="{html.escape(value)}"{" selected" if value == current else ""}>'
        f"{html.escape(text)}</option>"
        for value, text in choices
    )
    return f'<label><span>{label}</span> <select name="{name}">{options}</select></label>'


def pick_form(url: str, fields: dict[str, str], box: str, other: str = "") -> str:
    """Return a drop-down (or a box) with its Save button, which app.js shows once it's changed.

    ``other`` is a button to show till then.
    """
    return post_form(url, fields, box + other + submit("Save"), "pick")


def submit(label: str, css: str = "", attrs: str = "") -> str:
    """Return a submit button."""
    css_attr = f' class="{css}"' if css else ""
    return f"<button type=submit{css_attr}{attrs}>{label}</button>"


def panel(
    slug: str, title: str, body: str, aside: str = "", css: str = "", attrs: str = ""
) -> str:
    """Return a titled panel; ``aside`` (a link or controls) sits opposite the title.

    ``attrs`` adds attributes to the section (an id, data- hooks for the page script).
    """
    head = (
        f'<div class="panel-head"><h2 id="{slug}-title">{title}</h2>{aside}</div>'
        if aside
        else f'<h2 id="{slug}-title">{title}</h2>'
    )
    return (
        f'<section class="panel{" " + css if css else ""}" aria-labelledby="{slug}-title"'
        f"{' ' + attrs if attrs else ''}>"
        f"{head}{body}</section>"
    )


def data_table(headers: list[str], rows: list[str], css: str = "") -> str:
    """Return a scrollable table; a header ending in ``|num`` is right-aligned."""
    cells = "".join(
        f'<th scope="col" class="num">{header.removesuffix("|num")}</th>'
        if header.endswith("|num")
        else f'<th scope="col">{header}</th>'
        for header in headers
    )
    css_attr = f' class="{css}"' if css else ""
    return (
        f'<div class="table-wrap"><table{css_attr}><thead><tr>{cells}</tr></thead>'
        f"<tbody>{''.join(rows)}</tbody></table></div>"
    )


def table_twin(table: str) -> str:
    """Return a chart's table version, collapsed under "Show as table"."""
    return f"<details><summary>Show as table</summary>{table}</details>"


def legend(items: list[tuple[str, str, str]]) -> str:
    """Return a legend from (swatch class, label, value html) items."""
    return (
        '<p class="legend">'
        + "".join(
            f'<span><span class="swatch {swatch}"></span>{label}{" " + value if value else ""}'
            "</span>"
            for swatch, label, value in items
        )
        + "</p>"
    )


# Tinted pills: the word carries the meaning, the tint only reinforces it.
def pill(tone: str, label: str, tip: str) -> str:
    """Return a status pill: tinted background, dark text, reason on hover."""
    return f'<span class="pill pill-{tone}" title="{tip}">{label}</span>'


STATUS_LABELS = {
    "blocked": pill("danger", "Blocked", "Blocked by hand"),
    "paused": pill("danger", "Paused", "Blocked: its profile is paused"),
    "scheduled": pill("warn", "Scheduled", "Blocked by its profile schedule"),
    "unknown": pill("danger", "New device", "Blocked until approved"),
    "private": pill("warn", "Private", "Blocked: private Wi-Fi address"),
    "allowed": pill("ok", "Allowed", "Has internet"),
}


def format_bytes(count: int) -> str:
    """Return a short decimal (SI, powers of 1000) size: ``940 kB``, ``1.2 GB``."""
    value = float(count)
    for unit in ("B", "kB", "MB", "GB", "TB"):  # decimal SI, as ISPs meter
        if value < 1000 or unit == "TB":
            break
        value /= 1000
    return f"{value:.0f} {unit}" if unit == "B" or value >= 100 else f"{value:.1f} {unit}"


def until_clock(profile: dict, key: str) -> str:
    """Return the local HH:MM a timed pause or bonus ends."""
    return dt.datetime.fromisoformat(profile[key]).astimezone().strftime("%H:%M")


def profile_state_html(profile: dict, now: dt.datetime) -> str:
    """Return the profile's current effect plus any timed override."""
    reason = profile_block_reason(profile, now)
    label = STATUS_LABELS[reason] if reason else STATUS_LABELS["allowed"]
    if profile.get("paused"):
        label += ' <span class="muted">until resumed</span>'
    elif until_active(profile, "pause_until", now):
        label += f' <span class="muted">until {until_clock(profile, "pause_until")}</span>'
    elif bonus_live(profile, now) and not reason:
        label += (
            f' <span class="muted">bonus time until {until_clock(profile, "bonus_until")}</span>'
        )
    elif bonus_due(profile, now) and not reason:
        start = bonus_window(profile)[0]
        label += (
            f' <span class="muted">bonus time {start.astimezone().strftime("%H:%M")}–'
            f"{until_clock(profile, 'bonus_until')}</span>"
        )
    return label


# One Pause menu for a profile and for all of them, so how long is always in
# words beside the button: until resumed (the first), or for a while.
PAUSE_FOR_CHOICES = {
    "indefinite": "until resumed",
    **PAUSE_CHOICES,
    "morning": f"until {MORNING}",
}


def profile_form(
    profile_id: str, action: str, label: str, css: str = "", extra: dict[str, str] | None = None
) -> str:
    """Return a one-button form posting a profile action (with any ``extra`` fields)."""
    fields = {"id": profile_id, "action": action, **(extra or {})}
    return post_form("/profile", fields, submit(label, css))


def choice_form(fields: dict[str, str], choices: dict[str, str], label: str, css: str) -> str:
    """Return a select + button form for a timed profile action."""
    options = "".join(f'<option value="{key}">{text}</option>' for key, text in choices.items())
    return post_form(
        "/profile",
        fields,
        f'<select name="minutes" aria-label="{label} for how long">{options}</select>'
        + submit(label, css),
    )


def override_controls(profile_id: str, profile: dict, now: dt.datetime) -> str:
    """Return the buttons that fit the profile's state right now.

    Paused: Resume. Otherwise Pause, with how long in its menu (until resumed, or a
    while); then, with bonus time running or to come, More bonus and Revoke bonus; else, while a
    schedule blocks or will within a day, Bonus time.
    """
    if is_paused(profile, now):
        resume = profile_form(profile_id, "resume", "Resume", "unblock")
        return f'<span class="controls">{resume}</span>'
    fields = {"id": profile_id}
    controls = [
        choice_form({**fields, "action": "pause_for"}, PAUSE_FOR_CHOICES, "Pause", "block"),
    ]
    if bonus_due(profile, now):
        controls.append(
            choice_form({**fields, "action": "bonus"}, BONUS_CHOICES, "More bonus", "unblock")
        )
        controls.append(profile_form(profile_id, "end_bonus", "Revoke bonus", "block"))
    elif can_give_bonus(profile, now):
        controls.append(
            choice_form({**fields, "action": "bonus"}, BONUS_CHOICES, "Bonus time", "unblock")
        )
    return f'<span class="controls">{"".join(controls)}</span>'


def pause_all_controls(state: dict, now: dt.datetime) -> str:
    """Return the Pause all / Resume all controls for the Profiles panel."""
    profiles = state["profiles"].values()
    controls = []
    if any(is_paused(profile, now) for profile in profiles):
        controls.append(
            post_form("/profile", {"action": "resume_all"}, submit("Resume all", "unblock"))
        )
    if not all(is_paused(profile, now) for profile in profiles):
        controls.append(
            choice_form({"action": "pause_all"}, PAUSE_FOR_CHOICES, "Pause all", "block")
        )
    return f'<div class="all-controls">{"".join(controls)}</div>'


def device_badge(name: str, mac: str, lease: Lease | None, record: dict) -> str:
    """Return the device-type icon tile, with a green badge while it's online."""
    kind = device_kind(name, mac, record)
    online = (
        '<span class="online" title="Online now"><span class="sr-only">online</span></span>'
        if lease and lease.online
        else ""
    )
    return f'<span class="dev-icon" title="{KIND_LABELS[kind]}">{icon(kind)}{online}</span>'


def router_notice(active: bool) -> str:
    """Return the warning shown while the router firewall isn't loaded."""
    if active:
        return ""
    return (
        '<p class="panel notice">The router isn\'t running, so blocks are saved but not '
        "enforced until homehub-router.service starts.</p>"
    )


def action_button(mac: str, action: str, label: str, form_id: str = "") -> str:
    """Return a one-button form posting a device action."""
    return post_form("/device", {"mac": mac, "action": action}, submit(label, action), "", form_id)


def device_cell(
    name: str, mac: str, lease: Lease | None, record: dict, extra: str = "", info: bool = True
) -> str:
    """Return a device's name cell: type icon, name (or ``extra``), ⓘ and private tag.

    The name opens the device's page; ``extra`` replaces it, e.g. with the rename box.
    Without ``info`` there's no ⓘ (a row that opens to its facts has no need).
    """
    label = html.escape(name) if name else '<span class="muted">Unknown device</span>'
    label = f'<a class="dev-link" href="/device?mac={mac}" title="{html.escape(name)}">{label}</a>'
    private_tag = "<span class=tag>private</span>" if is_private(mac) else ""
    return (
        f'<td class="name"><span class="dev">{device_badge(name, mac, lease, record)}<span>'
        f"{extra or label}{info_popup(name, mac, lease) if info else ''}{private_tag}"
        "</span></span></td>"
    )


FOLD_COOKIE = "curfew_folds"  # which folds a visitor opened or closed (see app.js)


def parse_folds(cookie: str | None) -> dict[str, bool]:
    """Return fold key -> open from the cookie (``options:0/known:1``); junk is ignored."""
    folds = {}
    for item in (cookie or "").split("/"):
        key, _, value = item.partition(":")
        if key.isalpha() and value in {"0", "1"}:
            folds[key] = value == "1"
    return folds


def fold(
    key: str, title: str, body: str, folds: dict[str, bool], default_open: bool = True, aside=""
) -> str:
    """Return a collapsible section, open or shut as the visitor last left it."""
    is_open = folds.get(key, default_open)
    return (
        f'<details class="fold" data-fold="{key}"{" open" if is_open else ""}>'
        f'<summary><h2>{title}</h2>{aside}</summary><div class="fold-body">{body}</div></details>'
    )


def switch_card(field: str, title: str, explain: str, status: str, enabled: bool) -> str:
    """Return a setting card with an on/off switch that posts the opposite value."""
    title_id = f"{field}-title"
    return (
        f'<section class="card switch-card" aria-labelledby="{title_id}"><div>'
        f'<h2 id="{title_id}">{title}</h2><p class="muted">{explain}</p>'
        f'<p class="switch-state">{status}</p></div>'
        + post_form(
            "/settings",
            {field: "off" if enabled else "on"},
            submit(
                '<span class="knob"></span>',
                "switch",
                f' role="switch" aria-checked="{str(enabled).lower()}" '
                f'aria-labelledby="{title_id}"',
            ),
        )
        + "</section>"
    )


def info_button(label: str, rows: str) -> str:
    """Return an ⓘ button whose pop-up holds ``rows``: info-key spans, each with its value."""
    return (
        '<span class="info"><button type="button" class="info-btn ghost" '
        f'aria-label="Details for {html.escape(label)}" aria-expanded="false">ⓘ</button>'
        f'<span class="info-pop" role="tooltip">{rows}</span></span>'
    )


def info_popup(label: str, mac: str, lease: Lease | None) -> str:
    """Return the ⓘ button whose pop-up shows a device's IP, MAC and maker."""
    ip = html.escape(lease.ip) if lease else "—"
    return info_button(
        label or mac,
        f'<span class="info-key">IP</span><span class="mono">{ip}</span>'
        f'<span class="info-key">MAC</span><span class="mono">{mac}</span>'
        f'<span class="info-key">Maker</span><span>{html.escape(maker_text(mac))}</span>',
    )


COUNTDOWN_SECONDS = 3600  # the ring empties over the last hour before a change


def countdown(moment: dt.datetime, wait: str, now: dt.datetime) -> str:
    """Return the wait until ``moment`` with a ring that empties over its last hour.

    The ring shows only in that hour (class ``far`` hides it before then). The
    page script ticks both every second, and reloads when the moment comes.
    """
    remaining = max(0.0, (moment - now).total_seconds())
    fraction = min(remaining, COUNTDOWN_SECONDS) / COUNTDOWN_SECONDS
    return (
        f'<span class="countdown{" far" if remaining > COUNTDOWN_SECONDS else ""}" '
        f'data-at="{int(moment.timestamp())}">'
        '<svg class="cd-ring" viewBox="0 0 20 20" aria-hidden="true">'
        '<circle class="cd-track" cx="10" cy="10" r="7.5"/>'
        '<circle class="cd-arc" cx="10" cy="10" r="7.5" pathLength="1" '
        f'stroke-dasharray="{fraction:.3f} 1" transform="rotate(-90 10 10)"/></svg>'
        f'<span class="cd-text">{wait}</span></span>'
    )


def next_change_html(profile: dict, now: dt.datetime) -> str:
    """Return e.g. ``Blocked from 21:00 (in ◔ 3 h 30 min)``, counting down live; or ''."""
    parts = next_change_parts(profile, now)
    if parts is None:
        return ""
    return f"{parts.verb} {parts.when} (in {countdown(parts.moment, parts.wait, now)})"


def tile(href: str, label: str, value: str, sub: str, alert: bool = False) -> str:
    """Return one summary tile: a link to the details, or (no ``href``) just the figure."""
    tag, link = ("a", f' href="{href}"') if href else ("div", "")
    return (
        f'<{tag} class="tile{" tile-alert" if alert else ""}"{link} data-key="{label}">'
        f'<span class="tile-label">{label}</span><span class="tile-value">{value}</span>'
        f'<span class="tile-sub">{sub}</span></{tag}>'
    )


def usage_cell(mac: str, counts: tuple[int, int] | None) -> str:
    """Return a device's Today cell: total bytes linking to its usage page."""
    if not counts or not sum(counts):
        return '<td class="usage detail empty"><span class="muted">—</span></td>'
    tip = f"Today: download {format_bytes(counts[0])}, upload {format_bytes(counts[1])}"
    return (
        f'<td class="usage detail"><a href="/device?mac={mac}" title="{tip}">'
        f'{format_bytes(sum(counts))}<span class="unit"> today</span></a></td>'
    )
