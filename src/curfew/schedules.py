"""Profile schedules, pauses and bonus time, in homehub's local time."""

import datetime as dt
import re
from typing import NamedTuple

from curfew.config import MORNING

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


PAUSE_CHOICES = {"30": "30 min", "60": "1 hour", "120": "2 hours"}


BONUS_CHOICES = {"15": "15 min", "30": "30 min", "60": "1 hour"}


BONUS_AHEAD = dt.timedelta(hours=24)  # how soon a block must start to give bonus time ahead


DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def to_minutes(hhmm: str) -> int:
    """Return minutes after midnight for ``HH:MM``."""
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def schedule_active(schedule: dict, now: dt.datetime) -> bool:
    """Return True if ``now`` (local time) falls in the schedule's window.

    A window whose end is not after its start runs past midnight and belongs
    to the day it starts on: Fri 21:00-07:00 covers Friday night through
    Saturday 07:00.
    """
    start, end = to_minutes(schedule["start"]), to_minutes(schedule["end"])
    current = now.hour * 60 + now.minute
    days = set(schedule["days"])
    today, yesterday = now.weekday(), (now.weekday() - 1) % 7
    if start < end:
        return today in days and start <= current < end
    return (today in days and current >= start) or (yesterday in days and current < end)


def aware(moment: dt.datetime) -> dt.datetime:
    """Return ``moment`` with a time zone, treating naive times as local."""
    return moment if moment.tzinfo else moment.astimezone()


def until_active(profile: dict, key: str, now: dt.datetime) -> bool:
    """Return True if the profile's ``pause_until`` / ``bonus_until`` is in the future."""
    until = profile.get(key)
    return bool(until) and dt.datetime.fromisoformat(until) > aware(now)


def is_paused(profile: dict, now: dt.datetime) -> bool:
    """Return True if the profile is paused, indefinitely or for a while."""
    return bool(profile.get("paused")) or until_active(profile, "pause_until", now)


def bonus_window(profile: dict) -> tuple[dt.datetime | None, dt.datetime] | None:
    """Return bonus time's (from, until), or None. ``from`` None: it began when given
    (saved before bonus time could be given ahead)."""
    if not profile.get("bonus_until"):
        return None
    start = profile.get("bonus_from")
    return (
        dt.datetime.fromisoformat(start) if start else None,
        dt.datetime.fromisoformat(profile["bonus_until"]),
    )


def bonus_live(profile: dict, now: dt.datetime) -> bool:
    """Return True while bonus time is lifting the schedules."""
    window = bonus_window(profile)
    now = aware(now)
    return bool(window) and (window[0] is None or window[0] <= now) and now < window[1]


def bonus_due(profile: dict, now: dt.datetime) -> bool:
    """Return True if bonus time is running now or still to come."""
    window = bonus_window(profile)
    return bool(window) and aware(now) < window[1]


def profile_block_reason(profile: dict, now: dt.datetime) -> str | None:
    """Return ``paused``, ``scheduled`` or None for a profile right now.

    A pause (indefinite or timed) always blocks. Bonus time lifts schedules
    within its window, but not a pause.
    """
    if is_paused(profile, now):
        return "paused"
    if bonus_live(profile, now):
        return None
    if any(schedule_active(schedule, now) for schedule in profile.get("schedules", [])):
        return "scheduled"
    return None


def next_change(profile: dict, now: dt.datetime, days_ahead: int = 8) -> dt.datetime | None:
    """Return when the profile next switches between blocked and allowed.

    Candidates are every schedule edge in the coming days plus the ends of
    a timed pause or bonus; the first one whose state differs from now wins.
    None means nothing changes in that horizon (no schedules, or paused
    indefinitely).
    """
    now = aware(now)
    candidates = []
    for key in ("pause_until", "bonus_from", "bonus_until"):
        if until_active(profile, key, now):
            candidates.append(dt.datetime.fromisoformat(profile[key]))
    for offset in range(days_ahead):
        day = now + dt.timedelta(days=offset)
        for schedule in profile.get("schedules", []):
            for edge in (schedule["start"], schedule["end"]):
                hours, minutes = divmod(to_minutes(edge), 60)
                candidates.append(day.replace(hour=hours, minute=minutes, second=0, microsecond=0))
    blocked_now = profile_block_reason(profile, now) is not None
    for moment in sorted(c for c in candidates if c > now):
        if (profile_block_reason(profile, moment) is not None) != blocked_now:
            return moment
    return None


class NextChange(NamedTuple):
    """A profile's next change, in words and as a moment."""

    verb: str  # "Blocked from" or "Allowed again"
    when: str  # "21:00", or "Sun 21:00" when it isn't today
    wait: str  # "3 h 30 min"
    moment: dt.datetime


def next_change_parts(profile: dict, now: dt.datetime) -> NextChange | None:
    """Return the next change, e.g. ("Blocked from", "Sun 21:00", "3 h 30 min", moment),
    or None when nothing changes. Callers lay the parts out."""
    moment = next_change(profile, now)
    if moment is None:
        return None
    now = aware(now)
    minutes = max(1, int((moment - now).total_seconds() // 60))
    if minutes < 60:
        wait = f"{minutes} min"
    elif minutes % 60:
        wait = f"{minutes // 60} h {minutes % 60} min"
    else:
        wait = f"{minutes // 60} h"
    # The weekday only matters when the change isn't today.
    when = moment.strftime("%H:%M" if moment.date() == now.date() else "%a %H:%M")
    verb = "Allowed again" if profile_block_reason(profile, now) else "Blocked from"
    return NextChange(verb, when, wait, moment)


def format_next_change(profile: dict, now: dt.datetime) -> str:
    """Return e.g. ``Blocked from Sun 21:00 (in 3 h 30 min)``, or ''."""
    parts = next_change_parts(profile, now)
    if parts is None:
        return ""
    return f"{parts.verb} {parts.when} (in {parts.wait})"


def local_now() -> dt.datetime:
    """Return the current time in homehub's local time zone."""
    return dt.datetime.now().astimezone()


def format_days(days: list[int]) -> str:
    """Return ``Every day``, or day names with consecutive runs as ranges."""
    days = sorted(set(days))
    if len(days) == 7:
        return "Every day"
    runs: list[list[int]] = []
    for day in days:
        if runs and day == runs[-1][-1] + 1:
            runs[-1].append(day)
        else:
            runs.append([day])
    return ", ".join(
        DAY_NAMES[run[0]] if len(run) == 1 else f"{DAY_NAMES[run[0]]}–{DAY_NAMES[run[-1]]}"
        for run in runs
    )


def format_schedule(schedule: dict) -> str:
    """Return e.g. ``Sun–Thu 21:00–07:00 (overnight)``."""
    overnight = " (overnight)" if schedule["end"] <= schedule["start"] else ""
    return f"{format_days(schedule['days'])} {schedule['start']}–{schedule['end']}{overnight}"


def day_segments(profile: dict, day: int) -> list[tuple[int, int, dict]]:
    """Return (start, end) minute spans a profile's schedules block on a weekday.

    Overnight windows are split at midnight: the evening part on the day they
    start, the morning part on the next day.
    """
    spans = []
    for schedule in profile.get("schedules", []):
        start, end = to_minutes(schedule["start"]), to_minutes(schedule["end"])
        days = set(schedule["days"])
        if start < end:
            if day in days:
                spans.append((start, end, schedule))
            continue
        if day in days:
            spans.append((start, 24 * 60, schedule))
        if (day - 1) % 7 in days and end > 0:
            spans.append((0, end, schedule))
    return sorted(spans, key=lambda span: span[0])


def clock(minutes: int) -> str:
    """Return HH:MM for minutes after midnight (1440 shows as 24:00)."""
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def next_block(profile: dict, now: dt.datetime) -> dt.datetime | None:
    """Return when a schedule next blocks the profile, if that's within BONUS_AHEAD
    and it isn't blocked (or paused) already."""
    now = aware(now)
    if profile_block_reason(profile, now) is not None:
        return None
    moment = next_change(profile, now)
    return moment if moment and moment - now <= BONUS_AHEAD else None


def can_give_bonus(profile: dict, now: dt.datetime) -> bool:
    """Return True if bonus time can be given now: more of it, during a scheduled
    block, or ahead of one that starts within BONUS_AHEAD."""
    if is_paused(profile, now):
        return False
    return (
        bonus_due(profile, now)
        or profile_block_reason(profile, now) == "scheduled"
        or next_block(profile, now) is not None
    )


def give_bonus(profile: dict, minutes: int, now: dt.datetime) -> None:
    """Give bonus time: more on top of bonus still due (pushing its end out), else
    from now during a block, else from the next block's start (pushing that out).

    Raises ValueError when there's no block to give it against.
    """
    now = aware(now)
    extra = dt.timedelta(minutes=minutes)
    window = bonus_window(profile)
    if is_paused(profile, now):
        raise ValueError("Bonus time doesn't lift a pause; resume the profile first.")
    if window and now < window[1]:
        start, until = window[0], window[1] + extra
    elif profile_block_reason(profile, now) == "scheduled":
        start, until = now, now + extra
    elif (block := next_block(profile, now)) is not None:
        start, until = block, block + extra
    else:
        raise ValueError("No schedule blocks this profile in the next 24 hours.")
    if start is None:
        profile.pop("bonus_from", None)
    else:
        profile["bonus_from"] = start.isoformat(timespec="seconds")
    profile["bonus_until"] = until.isoformat(timespec="seconds")


def end_bonus(profile: dict) -> None:
    """Take bonus time away, whether it's running or still to come."""
    profile.pop("bonus_from", None)
    profile.pop("bonus_until", None)


def apply_override(profile: dict, action: str, minutes: str, now: dt.datetime) -> None:
    """Apply a pause, timed pause, bonus or their end to a profile in place.

    Raises ValueError for a duration that isn't offered.
    """
    now = aware(now)
    if action == "pause":
        profile["paused"] = True
    elif action == "resume":
        profile["paused"] = False
        profile.pop("pause_until", None)
    elif action == "end_bonus":
        end_bonus(profile)
    elif action == "pause_for":
        if minutes == "morning":
            hours, mins = divmod(to_minutes(MORNING), 60)
            until = now.replace(hour=hours, minute=mins, second=0, microsecond=0)
            if until <= now:
                until += dt.timedelta(days=1)
        elif minutes in PAUSE_CHOICES:
            until = now + dt.timedelta(minutes=int(minutes))
        else:
            raise ValueError("Pick how long to pause.")
        profile["pause_until"] = until.isoformat(timespec="seconds")
        end_bonus(profile)
    elif action == "bonus":
        if minutes not in BONUS_CHOICES:
            raise ValueError("Pick how much bonus time.")
        give_bonus(profile, int(minutes), now)
