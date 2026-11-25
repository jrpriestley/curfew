"""The family calendar: its iCalendar read, its repeats worked out, today and tomorrow."""

import datetime as dt
from zoneinfo import ZoneInfo

from curfew.events import Event, days_ahead, duration, events_between, unfold
from curfew.web.pages.flow import render_calendar

TORONTO = ZoneInfo("America/Toronto")
MONDAY = dt.datetime(2026, 11, 16, 0, 0, tzinfo=TORONTO)  # a Monday
CALENDAR = "\r\n".join(
    [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",  # every Monday and Wednesday at 16:30, but not this Wednesday
        "UID:swim",
        "SUMMARY:Swimming",
        "DTSTART;TZID=America/Toronto:20261005T163000",
        "DTEND;TZID=America/Toronto:20261005T173000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
        "EXDATE;TZID=America/Toronto:20261118T163000",
        "END:VEVENT",
        "BEGIN:VEVENT",  # daily at 08:00 (UTC 13:00), but today's moved to 09:00
        "UID:walk",
        "SUMMARY:Dog walk",
        "DTSTART:20261101T130000Z",
        "DURATION:PT30M",
        "RRULE:FREQ=DAILY;COUNT=60",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:walk",
        "RECURRENCE-ID:20261116T130000Z",
        "SUMMARY:Dog walk (late)",
        "DTSTART:20261116T140000Z",
        "DURATION:PT30M",
        "END:VEVENT",
        "BEGIN:VEVENT",  # all day, Monday to Wednesday (DTEND is the day after)
        "UID:trip",
        "SUMMARY:Grandma\\, visiting",
        "DTSTART;VALUE=DATE:20261116",
        "DTEND;VALUE=DATE:20261119",
        "END:VEVENT",
        "BEGIN:VEVENT",  # the third Tuesday of every month (17 November)
        "UID:club",
        "SUMMARY:Book club",
        "DTSTART;TZID=America/Toronto:20260113T19",
        " 0000",
        "RRULE:FREQ=MONTHLY;BYDAY=3TU",
        "END:VEVENT",
        "BEGIN:VEVENT",  # a one-off, long gone
        "UID:old",
        "SUMMARY:Dentist",
        "DTSTART;TZID=America/Toronto:20250101T090000",
        "END:VEVENT",
        "BEGIN:VEVENT",  # cancelled
        "UID:off",
        "SUMMARY:Cancelled",
        "STATUS:CANCELLED",
        "DTSTART;TZID=America/Toronto:20261117T090000",
        "END:VEVENT",
        "BEGIN:VEVENT",  # weekly until last month: over
        "UID:done",
        "SUMMARY:Old class",
        "DTSTART;TZID=America/Toronto:20260901T100000",
        "RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
)


def at(day: int, hour: int, minute: int = 0) -> dt.datetime:
    return dt.datetime(2026, 11, day, hour, minute, tzinfo=TORONTO)


def test_two_days_of_events_are_worked_out() -> None:
    """Repeats, moved and skipped occurrences, all-day spans, folded lines, escapes."""
    found = events_between(CALENDAR, MONDAY, MONDAY + dt.timedelta(days=2))
    assert [(event.start, event.title, event.all_day) for event in found] == [
        (at(16, 0), "Grandma, visiting", True),  # once, Monday to Wednesday
        (at(16, 9), "Dog walk (late)", False),  # today's, moved
        (at(16, 16, 30), "Swimming", False),
        (at(17, 8), "Dog walk", False),
        (at(17, 19), "Book club", False),  # the third Tuesday
    ]
    titles = [(event.start.date().day, event.title) for event in found]
    assert (16, "Dog walk") not in titles and (16, "Dog walk (late)") in titles
    assert (17, "Dog walk") in titles and (17, "Book club") in titles
    assert "Dentist" not in str(titles) and "Cancelled" not in str(titles)
    assert "Old class" not in str(titles)
    third = events_between(CALENDAR, at(18, 0), at(19, 0))  # Wednesday: swimming skipped
    assert [event.title for event in third] == ["Grandma, visiting", "Dog walk"]


def test_today_keeps_whats_still_to_come_and_tomorrow_follows() -> None:
    """Today drops what's over; all-day events stay all day; tomorrow has its own."""
    found = events_between(CALENDAR, MONDAY, MONDAY + dt.timedelta(days=2))
    days = days_ahead(found, at(16, 12))
    assert [label for label, _events in days] == ["Today", "Tomorrow"]
    assert [event.title for event in days[0][1]] == ["Grandma, visiting", "Swimming"]
    assert [event.title for event in days[1][1]] == ["Grandma, visiting", "Dog walk", "Book club"]
    assert days_ahead([], at(16, 12)) == []


def test_the_calendar_shows_the_date_and_its_days() -> None:
    """The date always; each day's events with their times, and how many more."""
    assert "Monday 16 November" in render_calendar(at(16, 12), [])
    many = [Event(at(16, 13 + n), at(16, 14 + n), f"Thing {n}") for n in range(6)]
    shown = render_calendar(at(16, 12), [("Today", many)])
    assert "<h3>Today</h3>" in shown and "<time>13:00</time><span>Thing 0</span>" in shown
    assert "Thing 4" not in shown and "and 2 more" in shown
    assert "All day" in render_calendar(
        at(16, 12), [("Today", [Event(at(16, 0), at(17, 0), "Off", True)])]
    )


def test_reading_odds_and_ends() -> None:
    """Long lines unfold; durations read; nonsense is nothing."""
    assert unfold("A:b\r\n c\r\nD:e") == ["A:bc", "D:e"]
    assert duration("P1DT2H30M") == dt.timedelta(days=1, hours=2, minutes=30)
    assert duration("PT45M") == dt.timedelta(minutes=45)
    assert duration("nonsense") is None
    assert events_between("not a calendar", MONDAY, MONDAY + dt.timedelta(days=1)) == []
