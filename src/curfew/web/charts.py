"""SVG charts: week timeline, usage bars, weekly rhythm, live view."""

import datetime as dt
import html
import math
import sqlite3
from typing import NamedTuple

from curfew.config import REFRESH_LIVE, REFRESH_STARS
from curfew.devices import KIND_LABELS
from curfew.schedules import DAY_NAMES, aware, clock, day_segments, format_schedule
from curfew.traffic import (
    CALENDAR_WEEKS,
    RANGES,
    RHYTHM_WEEKS,
    CalendarDay,
    calendar_days,
    hour_edges,
    rhythm_cells,
)
from curfew.web.components import data_table, format_bytes, legend, panel, table_twin


def week_timeline_svg(profile: dict, now: dt.datetime) -> str:
    """Return a 7 x 24 h SVG of a profile's curfew windows with a now line.

    One series (blocked time), so no legend box: the section heading names
    it, and the Schedules table below is the text twin.
    """
    label_w, plot_w, row_h, bar_h, top = 44, 672, 22, 12, 6
    per_min = plot_w / (24 * 60)
    height = top + 7 * row_h + 22
    parts = []
    for hour in range(0, 25, 6):
        x = label_w + hour * 60 * per_min
        parts.append(
            f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + 7 * row_h}" '
            'class="c-grid" stroke-width="1"/>'
            f'<text x="{x:.1f}" y="{top + 7 * row_h + 15}" text-anchor="middle" '
            f'font-size="11" class="c-label">{hour:02d}:00</text>'
        )
    today = now.weekday()
    for day in range(7):
        y = top + day * row_h
        weight = ' class="c-strong"' if day == today else ' class="c-label"'
        parts.append(
            f'<text x="0" y="{y + row_h / 2 + 4:.1f}" font-size="12"{weight}>'
            f"{DAY_NAMES[day]}</text>"
        )
        for start, end, schedule in day_segments(profile, day):
            x = label_w + start * per_min + 1  # 1px each side: a 2px gap between spans
            width = max((end - start) * per_min - 2, 2)
            tip = (
                f"{DAY_NAMES[day]} {clock(start)}–{clock(end)} blocked "
                f"({format_schedule(schedule)})"
            )
            parts.append(
                f"<g><title>{html.escape(tip)}</title>"
                f'<rect x="{x:.1f}" y="{y}" width="{width:.1f}" height="{row_h}" '
                'fill="transparent"/>'
                f'<rect x="{x:.1f}" y="{y + (row_h - bar_h) / 2:.1f}" width="{width:.1f}" '
                f'height="{bar_h}" rx="3" class="c-curfew"/></g>'
            )
    now_x = label_w + (now.hour * 60 + now.minute) * per_min
    now_y = top + today * row_h
    # The page script moves the line along every minute (data-x0 etc. are its geometry).
    parts.append(
        f"<g><title>Now: {DAY_NAMES[today]} {now.strftime('%H:%M')}</title>"
        f'<line x1="{now_x:.1f}" y1="{now_y - 2}" x2="{now_x:.1f}" y2="{now_y + row_h + 2}" '
        f'class="c-now now-line" data-x0="{label_w}" data-per-min="{per_min:.5f}" '
        f'data-y0="{top}" data-row-h="{row_h}" stroke-width="2"/></g>'
    )
    total = sum(e - s for d in range(7) for s, e, _ in day_segments(profile, d))
    summary = (
        f"Weekly curfew: {total // 60} h {total % 60} min blocked per week"
        if total
        else "Weekly curfew: no schedules"
    )
    return (
        f'<svg class="timeline" viewBox="0 0 {label_w + plot_w + 20} {height}" role="img" '
        f'data-now="{now_x / (label_w + plot_w + 20):.3f}" '
        f'aria-label="{html.escape(summary)}">{"".join(parts)}</svg>'
    )


def day_strip_svg(profile: dict, now: dt.datetime) -> str:
    """Return a slim 24 h strip of today's curfew windows with a now tick."""
    width, height = 240, 10
    per_min = width / (24 * 60)
    spans = day_segments(profile, now.weekday())
    bars = "".join(
        f'<rect x="{start * per_min + 1:.1f}" y="1" '
        f'width="{max((end - start) * per_min - 2, 2):.1f}" '
        f'height="8" rx="2" class="c-curfew"/>'
        for start, end, _ in spans
    )
    now_x = (now.hour * 60 + now.minute) * per_min
    text = ", ".join(f"{clock(s)}–{clock(e)}" for s, e, _ in spans) or "nothing"
    label = f"Today blocked: {text}"
    return (
        f'<svg class="strip" viewBox="0 0 {width} {height}" preserveAspectRatio="none" '
        'role="img" '
        f'aria-label="{html.escape(label)}"><title>{html.escape(label)}</title>'
        f'<rect x="0" y="1" width="{width}" height="8" rx="2" class="c-track"/>{bars}'
        f'<line x1="{now_x:.1f}" y1="0" x2="{now_x:.1f}" y2="{height}" '
        f'class="c-now now-line" data-x0="0" data-per-min="{per_min:.5f}" '
        'stroke-width="2"/></svg>'
    )


NICE_STEPS = (1, 2, 2.5, 3, 4, 5, 6, 8, 10)  # also used by the live chart's script


def nice_ceiling(value: float) -> float:
    """Return the smallest round axis top (NICE_STEPS x 10^n) at or above ``value``."""
    if value <= 0:
        return 1
    base = 10 ** math.floor(math.log10(value))
    return next(step * base for step in NICE_STEPS if step * base >= value)


def top_rounded_bar(x: float, y: float, width: float, height: float, css: str) -> str:
    """Return an SVG bar with rounded top corners and a square foot on the baseline."""
    radius = min(4, width / 2, height)
    return (
        f'<path class="{css}" d="M{x:.1f},{y + height:.1f} V{y + radius:.1f} '
        f"Q{x:.1f},{y:.1f} {x + radius:.1f},{y:.1f} H{x + width - radius:.1f} "
        f'Q{x + width:.1f},{y:.1f} {x + width:.1f},{y + radius:.1f} V{y + height:.1f} Z"/>'
    )


def period_label(start: int, range_key: str) -> str:
    """Return a bar's period for tooltips and the table: ``Sat 14:00–15:00`` or ``Sat Nov 7``."""
    moment = dt.datetime.fromtimestamp(start).astimezone()
    if range_key == "30d":
        return moment.strftime("%a %b %-d")
    finish = moment + dt.timedelta(hours=1)
    return f"{moment.strftime('%a %H:%M')}–{finish.strftime('%H:%M')}"


def usage_chart_svg(series: list[tuple[int, int, int]], range_key: str, subject: str) -> str:
    """Return a stacked bar chart of download (base) and upload (top) per period.

    Two series, so the page shows a legend beside it; every bar has a
    tooltip and the table under the chart holds the same numbers.
    """
    label_w, plot_w, plot_h, top = 60, 672, 150, 8
    slot = plot_w / len(series)
    gap = 2 if slot >= 4 else 1
    peak = nice_ceiling(max((down + up for _start, down, up in series), default=0))
    scale = plot_h / peak
    base_y = top + plot_h
    parts = []
    for fraction in (0, 0.5, 1):
        y = base_y - fraction * plot_h
        parts.append(
            f'<line x1="{label_w}" y1="{y:.1f}" x2="{label_w + plot_w}" y2="{y:.1f}" '
            'class="c-grid" stroke-width="1"/>'
            f'<text x="{label_w - 6}" y="{y + 4:.1f}" text-anchor="end" font-size="11" '
            f'class="c-label">{format_bytes(int(peak * fraction))}</text>'
        )
    for index, (start, down, up) in enumerate(series):
        x = label_w + index * slot + gap / 2
        width = slot - gap
        tip = (
            f"{period_label(start, range_key)}: download {format_bytes(down)}, "
            f"upload {format_bytes(up)}"
        )
        marks = [
            f"<title>{html.escape(tip)}</title>"
            f'<rect x="{label_w + index * slot:.1f}" y="{top}" width="{slot:.1f}" '
            f'height="{plot_h}" fill="transparent"/>'
        ]
        down_h = max(down * scale, 1) if down else 0
        up_h = max(up * scale, 1) if up else 0
        if down_h:
            if up_h:  # square top under the upload segment
                marks.append(
                    f'<rect x="{x:.1f}" y="{base_y - down_h:.1f}" width="{width:.1f}" '
                    f'height="{down_h:.1f}" class="c-down"/>'
                )
            else:
                marks.append(top_rounded_bar(x, base_y - down_h, width, down_h, "c-down"))
        if up_h:
            # A 2px surface gap separates the two segments.
            up_y = base_y - down_h - (2 if down_h else 0) - up_h
            marks.append(top_rounded_bar(x, up_y, width, up_h, "c-up"))
        parts.append(f'<g data-x="{label_w + (index + 0.5) * slot:.1f}">{"".join(marks)}</g>')
        moment = dt.datetime.fromtimestamp(start).astimezone()
        if range_key == "24h" and moment.hour % 6 == 0:
            text = moment.strftime("%H:00")
        elif range_key == "7d" and moment.hour == 0:
            text = moment.strftime("%a")
        elif range_key == "30d" and (len(series) - 1 - index) % 7 == 0:
            text = moment.strftime("%b %-d")
        else:
            continue
        anchor_x = label_w + index * slot + (slot / 2 if range_key == "30d" else 0)
        parts.append(
            f'<text x="{anchor_x:.1f}" y="{base_y + 15}" text-anchor="middle" font-size="11" '
            f'class="c-label">{text}</text>'
        )
    total_down = sum(down for _start, down, _up in series)
    total_up = sum(up for _start, _down, up in series)
    summary = (
        f"Internet use, {subject}, {RANGES[range_key].lower()}: "
        f"{format_bytes(total_down)} down, {format_bytes(total_up)} up"
    )
    return (
        # data-now=1: on a phone, where the chart scrolls, open at the latest bars.
        f'<svg class="usage-chart" viewBox="0 0 {label_w + plot_w + 12} {base_y + 22}" '
        f'role="img" data-now="1" data-cross="{top} {base_y}" '
        f'aria-label="{html.escape(summary)}">{"".join(parts)}</svg>'
    )


def usage_legend(series: list[tuple[int, int, int]]) -> str:
    """Return the legend, with each series' total as its direct label."""
    total_down = sum(down for _start, down, _up in series)
    total_up = sum(up for _start, _down, up in series)
    return legend(
        [
            ("swatch-down", "Download", f"<strong>{format_bytes(total_down)}</strong>"),
            ("swatch-up", "Upload", f"<strong>{format_bytes(total_up)}</strong>"),
        ]
    )


def usage_table(series: list[tuple[int, int, int]], range_key: str) -> str:
    """Return the chart's numbers as a table in a collapsed details block."""
    rows = [
        f"<tr><td>{period_label(start, range_key)}</td>"
        f'<td class="num">{format_bytes(down)}</td><td class="num">{format_bytes(up)}</td></tr>'
        for start, down, up in reversed(series)
        if down or up
    ]
    if not rows:
        return ""
    return table_twin(data_table(["Period", "Download|num", "Upload|num"], rows))


def usage_block(series: list[tuple[int, int, int]], range_key: str, subject: str) -> str:
    """Return legend, chart and table twin, or a note when nothing is recorded."""
    if not any(down or up for _start, down, up in series):
        return '<p class="muted">No internet traffic recorded for this period yet.</p>'
    return (
        f"{usage_legend(series)}"
        f'<div class="chart-wrap">{usage_chart_svg(series, range_key, subject)}</div>'
        f"{usage_table(series, range_key)}"
    )


# The live chart's geometry, shared with the script through data- attributes.
LIVE_WIDTH, LIVE_HEIGHT = 640, 132


LIVE_PLOT = (76, 8, 636, 124)  # left, top, right, bottom of the plot area


LIVE_POINTS = 60


def render_live_panel(
    source: str = "/live.json", title: str = "Right now", subject: str = "internet"
) -> str:
    """Return a live throughput panel; PAGE_SCRIPT polls ``source`` to fill it.

    The whole connection's (ppp0) by default; a device page passes its own feed.
    """
    left, top, right, bottom = LIVE_PLOT
    middle = (top + bottom) // 2
    grid = "".join(
        f'<line class="c-grid" x1="{left}" y1="{y}" x2="{right}" y2="{y}"/>'
        for y in (top, middle, bottom)
    )
    labels = "".join(
        f'<text class="c-label{" " + css if css else ""}" x="{left - 6}" y="{y + 4}" '
        f'text-anchor="end" font-size="11">{text}</text>'
        for css, y, text in (("live-top", top, ""), ("live-mid", middle, ""), ("", bottom, "0"))
    )
    window = LIVE_POINTS * REFRESH_LIVE // 60
    data = (
        f'data-src="{html.escape(source)}" '
        f'data-plot="{" ".join(map(str, LIVE_PLOT))}" data-width="{LIVE_WIDTH}" '
        f'data-points="{LIVE_POINTS}" data-interval="{REFRESH_LIVE}" '
        f'data-steps="{" ".join(map(str, NICE_STEPS))}"'
    )
    body = (
        legend(
            [
                ("swatch-down", "Download", '<strong data-read="down">…</strong>'),
                ("swatch-up", "Upload", '<strong data-read="up">…</strong>'),
            ]
        ).replace('class="legend"', 'class="legend live-read"', 1)
        + f'<svg class="live-chart" viewBox="0 0 {LIVE_WIDTH} {LIVE_HEIGHT}" role="img" '
        f'aria-label="Live {html.escape(subject)} throughput, last {window} minutes">'
        f"{grid}{labels}"
        '<polyline class="live-line live-down" points=""/>'
        '<polyline class="live-line live-up" points=""/>'
        f'<line class="live-cross" x1="0" y1="{top}" x2="0" y2="{bottom}" visibility="hidden"/>'
        f'<rect class="live-hit" x="{left}" y="0" width="{right - left}" height="{LIVE_HEIGHT}" '
        'fill="transparent"/></svg>'
        '<p class="muted live-hover">&nbsp;</p>'
        '<noscript><p class="muted">The live view needs JavaScript.</p></noscript>'
    )
    note = f'<span class="muted">last {window} minutes · every {REFRESH_LIVE} s</span>'
    return panel("live", title, body, note, "live", f'id="live" data-keep {data}')


def ring_svg(fraction: float, label: str) -> str:
    """Return a single-value ring meter (track plus arc) with the value in the middle."""
    radius = 40
    circumference = 2 * math.pi * radius
    arc = max(0.0, min(fraction, 1.0)) * circumference
    return (
        f'<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="{html.escape(label)}">'
        f'<circle class="ring-track" cx="50" cy="50" r="{radius}"/>'
        f'<circle class="ring-arc" cx="50" cy="50" r="{radius}" '
        f'stroke-dasharray="{arc:.1f} {circumference:.1f}" transform="rotate(-90 50 50)"/>'
        f'<text x="50" y="56" text-anchor="middle" class="ring-value">{fraction:.0%}</text></svg>'
    )


RHYTHM_LEVELS = 6


def rhythm_svg(cells: list[list[float | None]]) -> str:
    """Return the 7 x 24 heatmap: one sequential hue, darker means busier.

    Levels split the busiest hour's average into six even steps; empty
    slots (nothing recorded yet) show as the bare track.
    """
    label_w, cell_w, cell_h, gap, top = 40, 27, 20, 2, 4
    peak = max((value for row in cells for value in row if value), default=0)
    parts = []
    for hour in range(0, 24, 3):
        parts.append(
            f'<text class="c-label" x="{label_w + hour * cell_w + 1}" '
            f'y="{top + 7 * cell_h + 14}" font-size="11">{hour:02d}</text>'
        )
    for day in range(7):
        y = top + day * cell_h
        parts.append(
            f'<text class="c-label" x="0" y="{y + cell_h / 2 + 4:.1f}" font-size="11">'
            f"{DAY_NAMES[day]}</text>"
        )
        for hour in range(24):
            value = cells[day][hour]
            if value is None:
                level, tip = 0, "nothing recorded yet"
            else:
                level = math.ceil(value / peak * RHYTHM_LEVELS) if peak and value else 0
                tip = f"average {format_bytes(int(value))}"
            label = f"{DAY_NAMES[day]} {hour:02d}:00–{(hour + 1) % 24:02d}:00: {tip}"
            parts.append(
                f'<rect class="h{level}" x="{label_w + hour * cell_w + gap / 2}" '
                f'y="{y + gap / 2}" width="{cell_w - gap}" height="{cell_h - gap}" rx="3">'
                f"<title>{html.escape(label)}</title></rect>"
            )
    width = label_w + 24 * cell_w
    return (
        f'<svg class="rhythm" viewBox="0 0 {width} {top + 7 * cell_h + 20}" role="img" '
        'aria-label="Average internet use by weekday and hour, last four weeks">'
        f"{''.join(parts)}</svg>"
    )


def render_rhythm(connection: sqlite3.Connection | None, keys: list[str], now: dt.datetime) -> str:
    """Return the Weekly rhythm section: heatmap, its scale and a table twin."""
    cells = rhythm_cells(connection, keys, now)
    values = [value for row in cells for value in row if value is not None]
    if not values:
        return ""
    peak = max(values)
    steps = "".join(
        f'<span class="h-swatch h{level}"></span>' for level in range(1, RHYTHM_LEVELS + 1)
    )
    table_rows = [
        f'<tr><th scope="row">{DAY_NAMES[day]}</th>'
        + "".join(
            f'<td class="num">{format_bytes(int(value)) if value is not None else "—"}</td>'
            for value in cells[day]
        )
        + "</tr>"
        for day in range(7)
    ]
    hours = [f"{hour:02d}|num" for hour in range(24)]
    return panel(
        "rhythm",
        "Weekly rhythm",
        f'<div class="chart-wrap">{rhythm_svg(cells)}</div>'
        f'<p class="scale"><span class="muted">Less</span>{steps}<span class="muted">More '
        f"(busiest hour {format_bytes(int(peak))})</span></p>"
        + table_twin(data_table(["Day", *hours], table_rows)),
        f'<span class="muted">average per hour, last {RHYTHM_WEEKS} weeks</span>',
    )


def calendar_svg(days: list[CalendarDay], today: dt.date) -> str:
    """Return the calendar: a square per day, a column per week, shaded by the day's use.

    Same sequential ramp as the weekly rhythm (six even steps of the busiest
    day); days before recording began are left as the bare track; today is
    outlined.
    """
    cell, gap, left, top = 16, 3, 30, 16
    step = cell + gap
    peak = max((d.down + d.up for d in days if d.recorded), default=0)
    parts = []
    for row, label in ((0, "Mon"), (2, "Wed"), (4, "Fri")):
        parts.append(
            f'<text class="c-label" x="0" y="{top + row * step + 12}" font-size="10">'
            f"{label}</text>"
        )
    month_shown = None
    for index, day in enumerate(days):
        column, row = divmod(index, 7)
        if row == 0 and day.day.month != month_shown:
            month_shown = day.day.month
            parts.append(
                f'<text class="c-label" x="{left + column * step}" y="11" font-size="10">'
                f"{day.day.strftime('%b')}</text>"
            )
        total = day.down + day.up
        level = math.ceil(total / peak * RHYTHM_LEVELS) if day.recorded and peak and total else 0
        tip = f"{day.day.strftime('%a %b %-d')}: " + (
            format_bytes(total) if day.recorded else "nothing recorded yet"
        )
        outline = ' class="today"' if day.day == today else ""
        parts.append(
            f"<g{outline}><title>{html.escape(tip)}</title>"
            f'<rect class="h{level}" x="{left + column * step}" y="{top + row * step}" '
            f'width="{cell}" height="{cell}" rx="3"/></g>'
        )
    weeks = math.ceil(len(days) / 7)
    recorded = [d for d in days if d.recorded]
    summary = (
        f"Daily internet use, last {weeks} weeks: "
        f"{format_bytes(sum(d.down + d.up for d in recorded))} over {len(recorded)} days"
    )
    return (
        f'<svg class="calendar" viewBox="0 0 {left + weeks * step} {top + 7 * step}" '
        f'role="img" aria-label="{html.escape(summary)}">{"".join(parts)}</svg>'
    )


def render_calendar(
    connection: sqlite3.Connection | None, keys: list[str], now: dt.datetime
) -> str:
    """Return the Every day section: calendar, its scale and a table twin; '' with no data."""
    days = calendar_days(connection, keys, now)
    recorded = [d for d in days if d.recorded]
    if not recorded:
        return ""
    busiest = max(recorded, key=lambda d: d.down + d.up)
    steps = "".join(
        f'<span class="h-swatch h{level}"></span>' for level in range(1, RHYTHM_LEVELS + 1)
    )
    rows = [
        f'<tr><td>{d.day.strftime("%a %b %-d")}</td><td class="num">{format_bytes(d.down)}</td>'
        f'<td class="num">{format_bytes(d.up)}</td>'
        f'<td class="num">{format_bytes(d.down + d.up)}</td></tr>'
        for d in reversed(recorded)
    ]
    return panel(
        "calendar",
        "Every day",
        f'<div class="chart-wrap">{calendar_svg(days, aware(now).astimezone().date())}</div>'
        f'<p class="scale"><span class="muted">Less</span>{steps}<span class="muted">More '
        f"(busiest {busiest.day.strftime('%a %b %-d')}, "
        f"{format_bytes(busiest.down + busiest.up)})</span></p>"
        + table_twin(data_table(["Day", "Download|num", "Upload|num", "Total|num"], rows)),
        f'<span class="muted">last {CALENDAR_WEEKS} weeks</span>',
    )


class Star(NamedTuple):
    """One device in the constellation."""

    mac: str
    name: str
    kind: str  # a key of devices.KIND_LABELS
    online: bool
    allowed: bool  # has internet right now
    used: int  # bytes today


def label_box(x: float, y: float, anchor: str, text: str) -> tuple[float, float, float, float]:
    """Return a text label's rough box (left, top, right, bottom) at 11px, with a margin."""
    width = len(text) * 6.2  # roughly, in the system font
    left = {"start": x, "end": x - width}.get(anchor, x - width / 2)
    return left - 3, y - 13, left + width + 3, y + 5


def boxes_overlap(
    first: tuple[float, float, float, float], second: tuple[float, float, float, float]
) -> bool:
    """Return True if two boxes (left, top, right, bottom) intersect."""
    return not (
        first[2] <= second[0]
        or second[2] <= first[0]
        or first[3] <= second[1]
        or second[3] <= first[1]
    )


TWINKLE_STEPS = 8  # online stars twinkle out of step, in this many groups (see CSS)


def constellation_svg(
    stars: list[Star], hub_mac: str = "", hub_used: int = 0, width: int = 640, height: int = 440
) -> str:
    """Return every device as a dot around homehub, grouped by type into sectors.

    Size follows today's use (area-ish: square root); colour says online
    (green, with a glow and a spoke to the centre), offline (faded) or
    without internet (red). Layout is deterministic: groups by size, then
    devices by use, placed on rings from the centre outwards, so a device
    stays put between visits. The ellipse squash fits the wide panel.
    """
    cx, cy, squash = width / 2, height / 2, 0.8
    first_ring, ring_step, spacing, gap = 64, 26, 24, 0.12
    peak = max((star.used for star in stars), default=0)
    groups: dict[str, list[Star]] = {}
    for star in sorted(stars, key=lambda s: (-s.used, s.name.lower(), s.mac)):
        groups.setdefault(star.kind, []).append(star)
    order = sorted(groups.items(), key=lambda item: (-len(item[1]), item[0]))
    available = 2 * math.pi - gap * len(order)
    angle = -math.pi / 2
    spokes, marks, labels = [], [], []
    placed_boxes: list[tuple[float, float, float, float]] = []
    # Bounds of everything drawn, so the viewBox can hug the picture.
    # At least a 520 x 300 frame, so a house with few devices isn't drawn huge.
    xs, ys = [cx - 260, cx + 260], [cy - 150, cy + 150]
    twinkle = 0  # staggers the online stars' twinkle
    for kind, members in order:
        span = available * len(members) / len(stars)
        placed, ring, radius = 0, 0, first_ring
        while placed < len(members):
            radius = first_ring + ring * ring_step
            batch = members[placed : placed + max(1, int(span * radius / spacing))]
            for slot, star in enumerate(batch):
                theta = angle + span * (slot + 0.5) / len(batch)
                x, y = cx + radius * math.cos(theta), cy + radius * math.sin(theta) * squash
                size = 3.5 + 8 * math.sqrt(star.used / peak) if peak else 3.5
                xs += [x - size - 6, x + size + 6]
                ys += [y - size - 6, y + size + 6]
                state = "online" if star.online else "offline"
                state = state if star.allowed else "cut"
                if star.online and star.allowed:
                    spokes.append(
                        f'<line class="spoke" x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}"/>'
                    )
                tip = (
                    f"{star.name or 'Unknown device'} · {KIND_LABELS[star.kind]} · "
                    + ("online" if star.online else "offline")
                    + ("" if star.allowed else " · no internet")
                    + (f" · {format_bytes(star.used)} today" if star.used else "")
                )
                glow = (
                    f'<circle class="glow" cx="{x:.1f}" cy="{y:.1f}" r="{size + 5:.1f}"/>'
                    if state == "online"
                    else ""
                )
                twinkle += 1
                marks.append(
                    f'<a href="/device?mac={star.mac}" data-mac="{star.mac}" '
                    f'class="tw{twinkle % TWINKLE_STEPS}">'
                    f"<title>{html.escape(tip)}</title>{glow}"
                    f'<circle class="star star-{state}" cx="{x:.1f}" cy="{y:.1f}" '
                    f'r="{size:.1f}"/></a>'
                )
            placed += len(batch)
            ring += 1
        middle = angle + span / 2
        side = math.cos(middle)
        anchor = "start" if side > 0.25 else "end" if side < -0.25 else "middle"
        text = f"{KIND_LABELS[kind]} · {len(members)}"
        # Step the label outward along its own sector until it clears the
        # labels already placed (small neighbouring groups otherwise collide).
        for step in range(12):
            reach = radius + 22 + step * 14
            label_x = cx + reach * math.cos(middle)
            label_y = cy + reach * math.sin(middle) * squash + 4
            box = label_box(label_x, label_y, anchor, text)
            if not any(boxes_overlap(box, other) for other in placed_boxes):
                break
        placed_boxes.append(box)
        xs += [box[0], box[2]]
        ys += [box[1], box[3]]
        labels.append(
            f'<text class="c-label" x="{label_x:.1f}" y="{label_y:.1f}" text-anchor="{anchor}" '
            f'font-size="11">{text}</text>'
        )
        angle += span + gap
    online = sum(star.online for star in stars)
    cut = sum(not star.allowed for star in stars)
    summary = f"{len(stars)} devices: {online} online, {cut} without internet"
    hub = (
        f'<circle class="hub" cx="{cx}" cy="{cy}" r="28"/>'
        f'<text class="c-strong" x="{cx}" y="{cy + 3.5}" text-anchor="middle" font-size="10">'
        "homehub</text>"
    )
    if hub_mac:
        # homehub's own traffic glows like a star's, and the hub opens its page.
        tip = "homehub · the router" + (f" · {format_bytes(hub_used)} today" if hub_used else "")
        hub = (
            f'<a href="/device?mac={hub_mac}" data-mac="{hub_mac}" class="hub-link">'
            f"<title>{html.escape(tip)}</title>"
            f'<circle class="glow" cx="{cx}" cy="{cy}" r="33"/>{hub}</a>'
        )
    left, top = min(xs) - 8, min(ys) - 8
    box = f"{left:.0f} {top:.0f} {max(xs) - left + 8:.0f} {max(ys) - top + 8:.0f}"
    return (
        f'<svg class="constellation" viewBox="{box}" role="img" data-every="{REFRESH_STARS}" '
        f'aria-label="{html.escape(summary)}">{"".join(spokes)}{hub}{"".join(marks)}'
        f"{''.join(labels)}</svg>"
    )


def render_constellation(stars: list[Star], hub_mac: str = "", hub_used: int = 0) -> str:
    """Return the Constellation panel: the map and its legend ('' with no devices)."""
    if not stars:
        return ""
    return panel(
        "constellation",
        "Constellation",
        legend(
            [
                ("swatch-online", "Online", ""),
                ("swatch-offline", "Offline", ""),
                ("swatch-cut", "No internet", ""),
            ]
        )
        + f'<div class="chart-wrap">{constellation_svg(stars, hub_mac, hub_used)}</div>',
        '<span class="muted">size: today\'s use · click a device for its usage</span>',
    )


def quality_edges(range_key: str, now: dt.datetime) -> list[int]:
    """Return bar edges for the quality chart: 5-minute bars for 24 h, hourly for 7 d."""
    if range_key == "7d":
        return hour_edges(168, now)
    end = int(aware(now).timestamp()) // 300 * 300 + 300
    return [end - (288 - i) * 300 for i in range(289)]


def quality_chart_svg(
    series: list[tuple[int, float | None, float | None, float | None]], range_key: str
) -> str:
    """Return latency lines (Fibrenet's gateway, the internet) over a packet-loss strip.

    One y axis (ms) for the two lines; loss has its own strip below, since
    it's a different unit. Gaps in the record break the lines rather than
    drawing across them. Every bar has a hover tip; a table twin follows.
    """
    left, plot_w, plot_h, top, strip_h = 60, 672, 120, 8, 22
    slot = plot_w / len(series)
    values = [value for _s, gateway, internet, _l in series for value in (gateway, internet)]
    peak = nice_ceiling(max((value for value in values if value is not None), default=0) or 10)
    base = top + plot_h
    strip_top = base + 24
    parts = []
    for fraction in (0, 0.5, 1):
        y = base - fraction * plot_h
        parts.append(
            f'<line x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}" class="c-grid"/>'
            f'<text x="{left - 6}" y="{y + 4:.1f}" text-anchor="end" font-size="11" '
            f'class="c-label">{peak * fraction:.0f} ms</text>'
        )
    parts.append(
        f'<text x="{left - 6}" y="{strip_top + 15}" text-anchor="end" font-size="11" '
        'class="c-label">loss</text>'
        f'<rect x="{left}" y="{strip_top}" width="{plot_w}" height="{strip_h}" rx="3" '
        'class="c-track"/>'
    )
    for column, css in ((1, "q-gateway"), (2, "q-internet")):
        segments: list[list[str]] = [[]]
        for index, row in enumerate(series):
            value = row[column]
            if value is None:
                segments.append([])
                continue
            x = left + (index + 0.5) * slot
            segments[-1].append(f"{x:.1f},{base - min(value, peak) / peak * plot_h:.1f}")
        for points in segments:
            if len(points) > 1:
                parts.append(
                    f'<polyline class="q-line {css}" pathLength="1" points="{" ".join(points)}"/>'
                )
            elif points:
                x, y = points[0].split(",")
                parts.append(f'<circle class="q-dot {css}" cx="{x}" cy="{y}" r="2"/>')
    for index, (start, gateway, internet, loss) in enumerate(series):
        x = left + index * slot
        if loss:
            height = max(2, loss * strip_h)
            parts.append(
                f'<rect class="q-loss" x="{x:.1f}" y="{strip_top + strip_h - height:.1f}" '
                f'width="{max(slot - 1, 1):.1f}" height="{height:.1f}"/>'
            )
        if gateway is None and internet is None and loss is None:
            continue
        tip = dt.datetime.fromtimestamp(start).astimezone().strftime("%a %H:%M")
        tip += (
            f": Fibrenet {'—' if gateway is None else f'{gateway:.0f} ms'}"
            f" · internet {'—' if internet is None else f'{internet:.0f} ms'}"
            f" · {0 if loss is None else loss:.0%} lost"
        )
        parts.append(
            f'<g data-x="{x + slot / 2:.1f}"><title>{html.escape(tip)}</title>'
            f'<rect x="{x:.1f}" y="{top}" width="{slot:.2f}" height="{strip_top + strip_h - top}" '
            'fill="transparent"/></g>'
        )
        moment = dt.datetime.fromtimestamp(start).astimezone()
        if range_key == "24h" and moment.minute == 0 and moment.hour % 6 == 0:
            label = moment.strftime("%H:00")
        elif range_key == "7d" and moment.hour == 0:
            label = moment.strftime("%a")
        else:
            continue
        parts.append(
            f'<text x="{x:.1f}" y="{strip_top + strip_h + 15}" text-anchor="middle" '
            f'font-size="11" class="c-label">{label}</text>'
        )
    recorded = [row for row in series if row[1] is not None or row[2] is not None]
    worst_loss = max((row[3] or 0 for row in recorded), default=0)
    summary = (
        f"Connection quality, {'last 7 days' if range_key == '7d' else 'last 24 hours'}: "
        f"{len(recorded)} periods recorded, worst loss {worst_loss:.0%}"
    )
    return (
        f'<svg class="quality-chart" viewBox="0 0 {left + plot_w + 12} '
        f'{strip_top + strip_h + 22}" '
        f'role="img" data-now="1" data-cross="{top} {base}" '
        f'aria-label="{html.escape(summary)}">{"".join(parts)}</svg>'
    )


SPEED_SPAN = 8 * 7 * 86400  # the bandwidth chart shows at least the last 8 weeks


def bandwidth_chart_svg(results: list, now: dt.datetime) -> str:
    """Return download and upload over time: a dot for each test, joined by lines.

    Time runs along the bottom (at least SPEED_SPAN, more once there's more),
    so a missed week shows as a longer gap. A test that failed is a red mark
    on the baseline. Every test has a hover tip; a table twin follows.
    """
    left, plot_w, plot_h, top = 60, 672, 140, 8
    end = int(aware(now).timestamp())
    start = min([end - SPEED_SPAN, *(result.at for result in results)])
    speeds = [
        value / 1e6
        for result in results
        for value in (result.down_bps, result.up_bps)
        if value is not None
    ]
    peak = nice_ceiling(max(speeds, default=0) or 100)
    base = top + plot_h

    def x_of(at: int) -> float:
        return left + (at - start) / max(end - start, 1) * plot_w

    def y_of(bps: float) -> float:
        return base - min(bps / 1e6, peak) / peak * plot_h

    parts = []
    for fraction in (0, 0.5, 1):
        y = base - fraction * plot_h
        parts.append(
            f'<line x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}" class="c-grid"/>'
            f'<text x="{left - 6}" y="{y + 4:.1f}" text-anchor="end" font-size="11" '
            f'class="c-label">{peak * fraction:.0f} Mb/s</text>'
        )
    for column, css in (("down_bps", "q-gateway"), ("up_bps", "q-internet")):
        points = [
            f"{x_of(result.at):.1f},{y_of(getattr(result, column)):.1f}"
            for result in results
            if getattr(result, column) is not None
        ]
        if len(points) > 1:
            parts.append(
                f'<polyline class="q-line {css}" pathLength="1" points="{" ".join(points)}"/>'
            )
        for point in points:
            x, y = point.split(",")
            parts.append(f'<circle class="q-dot {css}" cx="{x}" cy="{y}" r="3"/>')
    for result in results:
        x = x_of(result.at)
        moment = dt.datetime.fromtimestamp(result.at).astimezone()
        if result.down_bps is None:
            parts.append(
                f'<rect class="q-loss" x="{x - 2:.1f}" y="{base - 10}" width="4" height="10"/>'
            )
            tip = f"{moment.strftime('%a %d %b %H:%M')}: failed ({result.server})"
        else:
            tip = (
                f"{moment.strftime('%a %d %b %H:%M')}: down {result.down_bps / 1e6:.0f} Mb/s"
                f" · up {result.up_bps / 1e6:.0f} Mb/s · ping {result.ping_ms:.0f} ms"
            )
        parts.append(
            f'<g><title>{html.escape(tip)}</title><rect x="{x - 8:.1f}" y="{top}" '
            f'width="16" height="{plot_h}" fill="transparent"/></g>'
        )
    # A date under the axis about every four weeks, from the right (today) back.
    step = max(4 * 7 * 86400, (end - start) // 6)
    for at in range(end, start - 1, -step):
        day = dt.datetime.fromtimestamp(at).astimezone().strftime("%d %b")
        parts.append(
            f'<text x="{x_of(at):.1f}" y="{base + 16}" text-anchor="middle" font-size="11" '
            f'class="c-label">{day}</text>'
        )
    done = [result for result in results if result.down_bps is not None]
    summary = f"Bandwidth over time: {len(results)} tests" + (
        f", latest {done[-1].down_bps / 1e6:.0f} Mb/s down, {done[-1].up_bps / 1e6:.0f} Mb/s up"
        if done
        else ""
    )
    return (
        f'<svg class="quality-chart" viewBox="0 0 {left + plot_w + 24} {base + 24}" '
        f'role="img" aria-label="{html.escape(summary)}">{"".join(parts)}</svg>'
    )
