"""The screensaver's frame reports: how smoothly it ran on each screen, a line a minute."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from curfew.config import FRAMES_LOG

# Rotated to .1 past this many bytes, so the log stays small.
FRAMES_MAX = 1_000_000
NUMBERS = (
    "seconds",
    "frames",
    "fps",
    "drops",
    "late",
    "stalls",
    "gap50",
    "gap95",
    "gapMax",
    "cost50",
    "cost95",
    "costMax",
    "width",
    "height",
    "tick",
)
WORDS = ("look", "quality", "where", "keys")
LONGEST = {"keys": 120}
FLAGS = ("app", "ultra", "sound")


def keep_report(
    report: str, address: str, path: Path = FRAMES_LOG, now: dt.datetime | None = None
) -> bool:
    """Append a report (the page's JSON) to the log, with when and from where.

    Only the known fields are kept, numbers as numbers and words short, so a page
    can't fill the log with anything else. Returns False for a report that isn't one.
    """
    try:
        given = json.loads(report)
    except ValueError:
        return False
    if not isinstance(given, dict):
        return False
    line = {"at": (now or dt.datetime.now(dt.UTC)).isoformat(timespec="seconds"), "from": address}
    for name in NUMBERS:
        value = given.get(name)
        if isinstance(value, int | float) and not isinstance(value, bool):
            line[name] = value
    for name in WORDS:
        value = given.get(name)
        if isinstance(value, str):
            line[name] = value[: LONGEST.get(name, 24)]
    for name in FLAGS:
        if isinstance(given.get(name), bool):
            line[name] = given[name]
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > FRAMES_MAX:
        path.replace(path.with_name(path.name + ".1"))
    with path.open("a") as log:
        log.write(json.dumps(line) + "\n")
    return True
