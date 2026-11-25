"""The family calendar's events, for the TV's screensaver: what's left of today, and tomorrow.

From a calendar's public link (curfew.toml's [calendar] url: iCloud's webcal://
address, or https://), asked at most every EVENTS_SECONDS, in the background once
there's an answer. Its iCalendar is read here with the standard library: one-off,
timed and all-day events (all-day ones over several days on each of them), repeats
(RRULE: daily, weekly, monthly or yearly, with INTERVAL, COUNT, UNTIL, BYDAY and
BYMONTHDAY), dates left out (EXDATE) and single occurrences moved, changed or
cancelled (RECURRENCE-ID).
"""

import datetime as dt
import re
import urllib.request
from typing import NamedTuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from curfew.cache import Recent
from curfew.config import CALENDAR_URL

EVENTS_SECONDS = 15 * 60
MAX_BYTES = 5_000_000  # a family calendar's years of events are far less
MAX_REPEATS = 5000  # occurrences worked through for one repeating event, at most
DAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
LINE_RE = re.compile(r'^([A-Za-z0-9-]+)((?:;[^:;=]+=(?:"[^"]*"|[^:;"]*))*):(.*)$')


class Event(NamedTuple):
    """One occurrence: when (local), until when, its title, and whether it's all day."""

    start: dt.datetime
    end: dt.datetime
    title: str
    all_day: bool = False


def unfold(text: str) -> list[str]:
    """Return iCalendar's lines with the long ones (continued after a space) joined."""
    return re.sub(r"\r?\n[ \t]", "", text).splitlines()


def unescape(value: str) -> str:
    """Return an iCalendar text value as plain text (new lines as spaces)."""
    return re.sub(
        r"\\(.)", lambda found: {"n": " ", "N": " "}.get(found.group(1), found.group(1)), value
    )


def read_lines(text: str) -> list[dict[str, list[tuple[dict[str, str], str]]]]:
    """Return each VEVENT as {NAME: [(params, value), ...]}."""
    events, current = [], None
    for line in unfold(text):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current is not None:
                events.append(current)
            current = None
        elif current is not None and (found := LINE_RE.match(line)):
            name, raw_params, value = found.groups()
            params = {}
            for param in raw_params.split(";")[1:]:
                key, _, param_value = param.partition("=")
                params[key.upper()] = param_value.strip('"')
            current.setdefault(name.upper(), []).append((params, value))
    return events


def zone(name: str | None, local: dt.tzinfo) -> dt.tzinfo:
    """Return the time zone a TZID names (Apple's are IANA names), else local time."""
    if not name:
        return local
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return local


def moment(params: dict[str, str], value: str, local: dt.tzinfo) -> dt.datetime | dt.date | None:
    """Return a DATE or DATE-TIME value: a date (all day), or a time zone-aware datetime."""
    value = value.strip()
    try:
        if params.get("VALUE") == "DATE" or len(value) == 8:
            return dt.datetime.strptime(value[:8], "%Y%m%d").date()
        when = dt.datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
    except ValueError:
        return None
    if value.endswith("Z"):
        return when.replace(tzinfo=dt.UTC)
    return when.replace(tzinfo=zone(params.get("TZID"), local))


def moments(entries: list[tuple[dict[str, str], str]], local: dt.tzinfo) -> list:
    """Return every date or time in a property that may list several (EXDATE)."""
    found = []
    for params, value in entries:
        for part in value.split(","):
            if (when := moment(params, part, local)) is not None:
                found.append(when)
    return found


def duration(value: str) -> dt.timedelta | None:
    """Return an iCalendar DURATION (P1DT2H30M, PT45M, P1W), or None."""
    found = re.fullmatch(
        r"([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value
    )
    if not found:
        return None
    sign, weeks, days, hours, minutes, seconds = found.groups()
    span = dt.timedelta(
        weeks=int(weeks or 0),
        days=int(days or 0),
        hours=int(hours or 0),
        minutes=int(minutes or 0),
        seconds=int(seconds or 0),
    )
    return -span if sign == "-" else span


def rule(value: str) -> dict[str, str]:
    """Return an RRULE's parts: {"FREQ": "WEEKLY", "BYDAY": "MO,WE", ...}."""
    return {
        key.upper(): part for key, _, part in (item.partition("=") for item in value.split(";"))
    }


def nth_weekday(year: int, month: int, weekday: int, nth: int) -> dt.date | None:
    """Return the nth (1st, 2nd; -1 the last) given weekday of a month, if there is one."""
    first = dt.date(year, month, 1)
    following = dt.date(year + month // 12, month % 12 + 1, 1)
    days = [
        first + dt.timedelta(days=offset)
        for offset in range((following - first).days)
        if (first + dt.timedelta(days=offset)).weekday() == weekday
    ]
    try:
        return days[nth - 1 if nth > 0 else nth]
    except IndexError:
        return None


def repeat_dates(first: dt.date, parts: dict[str, str]):
    """Yield a repeating event's dates in order from its first, by its rule (no end)."""
    freq, step = parts.get("FREQ", ""), max(1, int(parts.get("INTERVAL", "1") or 1))
    days = [entry.strip() for entry in parts.get("BYDAY", "").split(",") if entry.strip()]
    month_days = [int(day) for day in parts.get("BYMONTHDAY", "").split(",") if day.strip()]
    if freq == "DAILY":
        day = first
        while True:
            yield day
            day += dt.timedelta(days=step)
    elif freq == "WEEKLY":
        weekdays = sorted({DAYS.index(day[-2:]) for day in days if day[-2:] in DAYS}) or [
            first.weekday()
        ]
        monday = first - dt.timedelta(days=first.weekday())
        while True:
            for weekday in weekdays:
                day = monday + dt.timedelta(days=weekday)
                if day >= first:
                    yield day
            monday += dt.timedelta(weeks=step)
    elif freq in ("MONTHLY", "YEARLY"):
        year, month = first.year, first.month
        while True:
            found = []
            for entry in days:  # 2TU, -1FR: that weekday of the month
                ordinal = re.fullmatch(r"([+-]?\d*)(MO|TU|WE|TH|FR|SA|SU)", entry)
                if ordinal and ordinal.group(1) not in ("", "+", "-"):
                    day = nth_weekday(
                        year, month, DAYS.index(ordinal.group(2)), int(ordinal.group(1))
                    )
                    if day:
                        found.append(day)
            for number in month_days or ([] if days else [first.day]):
                try:
                    found.append(dt.date(year, month, number))
                except ValueError:  # the 31st of a short month, say: none that month
                    pass
            for day in sorted(found):
                if day >= first:
                    yield day
            if freq == "MONTHLY":
                month += step
                year, month = year + (month - 1) // 12, (month - 1) % 12 + 1
            else:
                year += step


def occurrences(
    start: dt.datetime | dt.date, parts: dict[str, str], until: dt.date, local: dt.tzinfo
):
    """Yield a repeating event's starts, in order, up to ``until`` (by its COUNT and UNTIL)."""
    count = int(parts["COUNT"]) if parts.get("COUNT", "").isdigit() else None
    last = (
        moment({}, parts["UNTIL"], dt.UTC if parts["UNTIL"].endswith("Z") else local)
        if (parts.get("UNTIL"))
        else None
    )
    timed = isinstance(start, dt.datetime)
    for index, day in enumerate(repeat_dates(start.date() if timed else start, parts)):
        if index >= MAX_REPEATS or (count is not None and index >= count) or day >= until:
            return
        when = start.replace(year=day.year, month=day.month, day=day.day) if timed else day
        if last is not None and not before_or_at(when, last):
            return
        yield when


def before_or_at(when: dt.datetime | dt.date, last: dt.datetime | dt.date) -> bool:
    """Return True if a start is at or before a rule's UNTIL (by the day, if either is one)."""
    if isinstance(when, dt.datetime) and isinstance(last, dt.datetime):
        return when <= last
    day = when.date() if isinstance(when, dt.datetime) else when
    return day <= (last.date() if isinstance(last, dt.datetime) else last)


def as_local(when: dt.datetime | dt.date, local: dt.tzinfo) -> dt.datetime:
    """Return a start as local time (a date as its local midnight)."""
    if isinstance(when, dt.datetime):
        return when.astimezone(local)
    return dt.datetime.combine(when, dt.time(), local)


def same(a: dt.datetime | dt.date, b: dt.datetime | dt.date) -> bool:
    """Return True if two starts are the same moment (or day, for all-day ones)."""
    if isinstance(a, dt.datetime) and isinstance(b, dt.datetime):
        return a == b
    day_a = a.date() if isinstance(a, dt.datetime) else a
    day_b = b.date() if isinstance(b, dt.datetime) else b
    return day_a == day_b


def events_between(text: str, start: dt.datetime, end: dt.datetime) -> list[Event]:
    """Return the occurrences in an iCalendar that are on between two local times, in order."""
    local = start.tzinfo or dt.UTC
    found: list[Event] = []
    vevents = read_lines(text)
    moved: dict[str, list] = {}  # UID: the occurrences changed (by their RECURRENCE-ID)
    for vevent in vevents:
        if "RECURRENCE-ID" in vevent:
            uid = vevent.get("UID", [({}, "")])[0][1]
            moved.setdefault(uid, []).extend(moments(vevent["RECURRENCE-ID"], local))
    for vevent in vevents:
        if "DTSTART" not in vevent:
            continue
        status = vevent.get("STATUS", [({}, "")])[0][1].upper()
        params, value = vevent["DTSTART"][0]
        first = moment(params, value, local)
        if first is None or status == "CANCELLED":
            continue
        all_day = not isinstance(first, dt.datetime)
        if "DTEND" in vevent:
            finish = moment(*vevent["DTEND"][0], local)
            span = as_local(finish, local) - as_local(first, local) if finish is not None else None
        else:
            span = duration(vevent["DURATION"][0][1]) if "DURATION" in vevent else None
        if span is None or span <= dt.timedelta(0):
            span = dt.timedelta(days=1) if all_day else dt.timedelta(hours=1)
        title = unescape(vevent.get("SUMMARY", [({}, "")])[0][1]).strip() or "Busy"
        uid = vevent.get("UID", [({}, "")])[0][1]
        if "RRULE" in vevent and "RECURRENCE-ID" not in vevent:
            skipped = moments(vevent.get("EXDATE", []), local) + moved.get(uid, [])
            starts = [
                when
                for when in occurrences(
                    first, rule(vevent["RRULE"][0][1]), end.date() + dt.timedelta(days=1), local
                )
                if not any(same(when, gone) for gone in skipped)
            ]
        else:
            starts = [first]
        for when in starts:
            begins = as_local(when, local)
            if begins < end and begins + span > start:
                found.append(Event(begins, begins + span, title, all_day))
    return sorted(found, key=lambda event: (event.start.date(), not event.all_day, event.start))


def days_ahead(events: list[Event], now: dt.datetime) -> list[tuple[str, list[Event]]]:
    """Return ("Today", what's still to come or on) and ("Tomorrow", its events), if any."""
    today = now.date()
    sections = []
    for label, day in (("Today", today), ("Tomorrow", today + dt.timedelta(days=1))):
        midnight = dt.datetime.combine(day, dt.time(), now.tzinfo)
        on = [
            event
            for event in events
            if event.start < midnight + dt.timedelta(days=1)
            and event.end > max(midnight, now if day == today else midnight)
            and (event.all_day or event.start >= midnight)  # a timed one shows on its day
        ]
        if on:
            sections.append((label, on))
    return sections


def fetch_calendar(url: str) -> str | None:
    """Return the calendar at a public link (webcal:// is https://), or None."""
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://") :]
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            return response.read(MAX_BYTES).decode("utf-8", "replace")
    except (OSError, ValueError):
        return None


_calendar = Recent[str | None](EVENTS_SECONDS, too_old=6 * 3600)


def upcoming(now: dt.datetime) -> list[tuple[str, list[Event]]]:
    """Return today's and tomorrow's events (kept a while), none without a [calendar] url."""
    if not CALENDAR_URL:
        return []
    text = _calendar.get(lambda: fetch_calendar(CALENDAR_URL))
    if not text:
        return []
    local = now.astimezone()
    midnight = dt.datetime.combine(local.date(), dt.time(), local.tzinfo)
    # A family's years of events take a while to read (some 90 ms on homehub): read
    # once for each fetch and day, and only sorted into what's still to come each time.
    if _read.get("text") is not text or _read.get("day") != midnight:
        _read.update(text=text, day=midnight)  # (kept, so "is" can't match a new one)
        _read["events"] = events_between(text, midnight, midnight + dt.timedelta(days=2))
    return days_ahead(_read["events"], local)


_read: dict = {}  # the last read: that fetch's text, that day, and its events
