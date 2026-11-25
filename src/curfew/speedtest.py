"""Bandwidth over time: a speed test from homehub, weekly in the early hours.

homehub's own traffic leaves by ppp0 (homehub-vpn routes only the devices
it's turned on for), so the test measures the Fibrenet line. It waits for
the house to be quiet first, so the result isn't someone else's download.

Only servers near homehub count (within SPEEDTEST_NEAR_KM of [sky]): curfew
asks speedtest.net's server list for those itself and hands them to the test,
since speedtest-cli's own pick places homehub by its address, sometimes a
continent away.
"""

import datetime as dt
import json
import math
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import NamedTuple

from curfew.config import (
    LATITUDE,
    LONGITUDE,
    SPEEDTEST_COMMAND,
    SPEEDTEST_MARK,
    SPEEDTEST_NEAR_KM,
)
from curfew.traffic import FINE_SECONDS, WAN_KEY

BUSY_BPS = 5_000_000  # the house using more than this (both ways), the test waits
WAIT_SECONDS = 15 * 60
TRIES = 4  # a look now and three more, 45 minutes at most; then it runs anyway
SERVERS_URL = "https://www.speedtest.net/api/js/servers"
NEAREST = 10  # servers offered to the test; it keeps the one that answers fastest
TESTING_SECONDS = 120  # a test this recently begun counts as running (it takes about 30 s)


class SpeedResult(NamedTuple):
    """One test: speeds in bits/s, or an error when it didn't complete."""

    at: int  # Unix time
    down_bps: float | None
    up_bps: float | None
    ping_ms: float | None
    server: str  # "Rogers (Toronto, ON)", or what went wrong
    busy_bps: float  # the house's own use just before


def house_use(connection: sqlite3.Connection, now_ts: int) -> float:
    """Return the house's internet use over the last two whole 5-minute buckets, in bits/s."""
    end = now_ts - now_ts % FINE_SECONDS
    start = end - 2 * FINE_SECONDS
    row = connection.execute(
        "SELECT sum(down + up) FROM fine WHERE key = ? AND bucket >= ? AND bucket < ?",
        (WAN_KEY, start, end),
    ).fetchone()
    return (row[0] or 0) * 8 / (end - start)


def parse_result(text: str, at: int, busy: float) -> SpeedResult:
    """Return speedtest-cli's --json output as a result. Raises ValueError if it isn't."""
    try:
        data = json.loads(text)
        server = data.get("server") or {}
        sponsor, place = server.get("sponsor", ""), server.get("name", "")
        where = f"{sponsor} ({place})" if sponsor and place else sponsor or place
        return SpeedResult(
            at, float(data["download"]), float(data["upload"]), float(data["ping"]), where, busy
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError, AttributeError):
        raise ValueError("the speed test's output wasn't what curfew expects") from None


def km_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Return the distance between two (latitude, longitude) places, in km."""
    (lat1, lon1), (lat2, lon2) = (tuple(map(math.radians, place)) for place in (a, b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


def nearby_servers(listed: list[dict], here: tuple[float, float], km: float) -> list[dict]:
    """Return the NEAREST listed servers within km of here, nearest first, each with ``d``
    (its distance; speedtest.net's own ``distance`` is rough)."""
    near = []
    for server in listed:
        try:
            d = km_between(here, (float(server["lat"]), float(server["lon"])))
        except (KeyError, TypeError, ValueError):
            continue
        if d <= km and server.get("url"):
            near.append({**server, "d": d})
    return sorted(near, key=lambda server: server["d"])[:NEAREST]


def list_servers(here: tuple[float, float]) -> list[dict]:
    """Return speedtest.net's servers nearest here (about 30 s at most). Raises OSError."""
    query = urllib.parse.urlencode({"engine": "js", "limit": 50, "lat": here[0], "lon": here[1]})
    request = urllib.request.Request(f"{SERVERS_URL}?{query}", headers={"User-Agent": "curfew"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            listed = json.load(response)
    except ValueError:
        raise OSError("speedtest.net's server list wasn't what curfew expects") from None
    if not isinstance(listed, list):
        raise OSError("speedtest.net's server list wasn't what curfew expects")
    return [server for server in listed if isinstance(server, dict)]


def find_servers() -> list[dict] | str:
    """Return the servers within SPEEDTEST_NEAR_KM of [sky], or why there are none."""
    if LATITUDE is None or LONGITUDE is None:
        return "no [sky] place, so no servers known to be near"
    here = (LATITUDE, LONGITUDE)
    try:
        listed = list_servers(here)
    except OSError as error:
        return f"couldn't list servers: {error}"
    return nearby_servers(listed, here, SPEEDTEST_NEAR_KM) or (
        f"no server within {SPEEDTEST_NEAR_KM:.0f} km"
    )


def measure(
    at: int,
    busy: float,
    command: tuple[str, ...] = SPEEDTEST_COMMAND,
    servers: list[dict] | str | None = None,
) -> SpeedResult:
    """Run the speed test (about 30 s) against nearby servers (found now if not given;
    a string is why there are none). A test that fails is a result too, with its error."""
    if servers is None:
        servers = find_servers()
    if isinstance(servers, str):
        return SpeedResult(at, None, None, None, servers, busy)
    try:
        done = subprocess.run(
            command, input=json.dumps(servers), capture_output=True, text=True, timeout=180
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return SpeedResult(at, None, None, None, f"didn't run: {error}", busy)
    if done.returncode:
        said = (done.stderr or done.stdout).strip().splitlines()
        return SpeedResult(at, None, None, None, said[-1] if said else "failed", busy)
    try:
        return parse_result(done.stdout, at, busy)
    except ValueError as error:
        return SpeedResult(at, None, None, None, str(error), busy)


def mark_testing(path: Path = SPEEDTEST_MARK, clock: Callable[[], float] = time.time) -> None:
    """Note that a test is beginning, for the screensaver (Orbit launches a probe)."""
    try:
        path.write_text(f"{clock():.0f}\n")
    except OSError:  # no state directory (not on homehub): nothing to show it to
        pass


def testing(path: Path = SPEEDTEST_MARK, clock: Callable[[], float] = time.time) -> bool:
    """Return whether a test began within the last TESTING_SECONDS."""
    try:
        return clock() - path.stat().st_mtime < TESTING_SECONDS
    except OSError:
        return False


def wait_for_quiet(
    connection: sqlite3.Connection,
    clock: Callable[[], float] = time.time,
    sleep: Callable[[float], None] = time.sleep,
) -> float:
    """Wait (up to TRIES looks, WAIT_SECONDS apart) for the house to go quiet; return its use."""
    for attempt in range(TRIES):
        busy = house_use(connection, int(clock()))
        if busy < BUSY_BPS or attempt == TRIES - 1:
            return busy
        sleep(WAIT_SECONDS)
    return busy


def record_speed(connection: sqlite3.Connection, result: SpeedResult) -> None:
    """Store a result (kept for good: one row a week)."""
    with connection:
        connection.execute("INSERT OR REPLACE INTO speed VALUES (?, ?, ?, ?, ?, ?)", result)


def line_speed(connection: sqlite3.Connection | None) -> tuple[float, float] | None:
    """Return the line's speed (bits a second, down and up) from the latest test that
    worked, or None before there's one."""
    for result in reversed(speed_history(connection)):
        if result.down_bps and result.up_bps:
            return result.down_bps, result.up_bps
    return None


def speed_history(connection: sqlite3.Connection | None) -> list[SpeedResult]:
    """Return every result, oldest first (none before the first test or the table)."""
    if connection is None:
        return []
    try:
        rows = connection.execute("SELECT * FROM speed ORDER BY at").fetchall()
    except sqlite3.OperationalError:  # no table until the sync next opens the database
        return []
    return [SpeedResult(*row) for row in rows]


def mbps(bps: float | None) -> str:
    """Return bits/s as e.g. ``607 Mb/s`` (``—`` for none)."""
    return "—" if bps is None else f"{bps / 1e6:.0f} Mb/s"


def describe(result: SpeedResult) -> str:
    """Return a result in a line, e.g. ``down 607 Mb/s · up 498 Mb/s · ping 19 ms · Rogers``."""
    if result.down_bps is None:
        return f"failed: {result.server}"
    line = (
        f"down {mbps(result.down_bps)} · up {mbps(result.up_bps)} · "
        f"ping {result.ping_ms:.0f} ms · {result.server}"
    )
    if result.busy_bps >= BUSY_BPS:
        line += f" (house busy: {mbps(result.busy_bps)})"
    return line


def when(result: SpeedResult) -> str:
    """Return when a test ran, in local time: ``Sun 15 Nov 03:30``."""
    return dt.datetime.fromtimestamp(result.at).astimezone().strftime("%a %d %b %H:%M")
