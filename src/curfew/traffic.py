"""Usage counting: per-IP and ppp0 counters into 5-minute and hourly buckets."""

import bisect
import datetime as dt
import json
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import NamedTuple

from curfew.cache import Recent
from curfew.config import NFT_TABLE, ROUTER_ADDRESS, TRAFFIC_DB, WAN_STATS
from curfew.leases import Lease, ip_owners
from curfew.schedules import aware

WAN_KEY = "wan"


FINE_SECONDS = 300  # 5-minute buckets for a week, then hourly for 90 days


FINE_DAYS = 7


HOURLY_DAYS = 90


RANGES = {"24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days"}


TRAFFIC_SCHEMA = """
CREATE TABLE IF NOT EXISTS fine (bucket INTEGER, key TEXT, down INTEGER, up INTEGER,
    PRIMARY KEY (bucket, key));
CREATE TABLE IF NOT EXISTS hourly (bucket INTEGER, key TEXT, down INTEGER, up INTEGER,
    PRIMARY KEY (bucket, key));
CREATE TABLE IF NOT EXISTS last (source TEXT PRIMARY KEY, down INTEGER, up INTEGER);
CREATE TABLE IF NOT EXISTS quality (minute INTEGER PRIMARY KEY, gateway_ms REAL,
    internet_ms REAL, loss REAL);
-- Weekly speed tests (curfew.speedtest): bits/s, or NULL and the error in server.
CREATE TABLE IF NOT EXISTS speed (at INTEGER PRIMARY KEY, down_bps REAL, up_bps REAL,
    ping_ms REAL, server TEXT, busy_bps REAL);
-- When each MAC first held a lease (only the device itself, never where it went).
CREATE TABLE IF NOT EXISTS seen (mac TEXT PRIMARY KEY, first INTEGER);
CREATE INDEX IF NOT EXISTS fine_key ON fine (key, bucket);
CREATE INDEX IF NOT EXISTS hourly_key ON hourly (key, bucket);
-- Readers see one table; the two never overlap in time.
CREATE VIEW IF NOT EXISTS buckets AS SELECT * FROM fine UNION ALL SELECT * FROM hourly;
"""


def parse_nft_counters(text: str, set_name: str) -> dict[str, int]:
    """Return IP -> bytes for one counter set in ``nft -j list ...`` output."""
    counts = {}
    for item in json.loads(text).get("nftables", []):
        if item.get("set", {}).get("name") != set_name:
            continue
        for element in item["set"].get("elem", []):
            body = element.get("elem", {}) if isinstance(element, dict) else {}
            ip, counter = body.get("val"), body.get("counter")
            if isinstance(ip, str) and isinstance(counter, dict):
                counts[ip] = int(counter.get("bytes", 0))
    return counts


def parse_named_counter(text: str, name: str) -> int | None:
    """Return the bytes of one named counter in ``nft -j list ...`` output, or None."""
    for item in json.loads(text).get("nftables", []):
        counter = item.get("counter", {})
        if counter.get("name") == name:
            return int(counter.get("bytes", 0))
    return None


def lan_counters(text: str) -> dict[str, tuple[int, int]]:
    """Return IP -> (bytes down, bytes up) from ``nft -j list table`` output.

    The house's devices come from the per-IP sets; homehub's own traffic
    (itself, Docker's containers) from its two named counters, under its address.
    """
    down = parse_nft_counters(text, "traffic_down")
    up = parse_nft_counters(text, "traffic_up")
    counts = {ip: (down.get(ip, 0), up.get(ip, 0)) for ip in set(down) | set(up)}
    own_down = parse_named_counter(text, "homehub_down")
    own_up = parse_named_counter(text, "homehub_up")
    if own_down is not None and own_up is not None:
        counts[ROUTER_ADDRESS] = (own_down, own_up)
    return counts


def read_lan_counters() -> dict[str, tuple[int, int]]:
    """Return IP -> (bytes down, bytes up) from the router's table."""
    result = subprocess.run(
        ["nft", "-j", "list", "table", *NFT_TABLE.split()], capture_output=True, text=True
    )
    return lan_counters(result.stdout if result.returncode == 0 else "{}")


def read_wan_counters(stats: Path = WAN_STATS) -> tuple[int, int] | None:
    """Return ppp0's (bytes received, bytes sent), or None while it's down."""
    try:
        return int((stats / "rx_bytes").read_text()), int((stats / "tx_bytes").read_text())
    except (FileNotFoundError, ValueError):
        return None


def counter_delta(current: int, previous: int | None) -> int:
    """Return bytes since the previous reading.

    A counter lower than last time was reset (PPPoE reconnect, firewall
    reload), so everything it holds is new.
    """
    if previous is None or current < previous:
        return current
    return current - previous


def open_traffic(path: Path = TRAFFIC_DB) -> sqlite3.Connection:
    """Open (creating if needed) the usage database for writing."""
    connection = sqlite3.connect(path, timeout=10)
    connection.executescript(TRAFFIC_SCHEMA)
    return connection


def record_traffic(
    connection: sqlite3.Connection,
    wan: tuple[int, int] | None,
    lan: dict[str, tuple[int, int]],
    owners: dict[str, str],
    now_ts: int,
) -> None:
    """Add the bytes moved since the last reading to the current 5-minute bucket.

    ``lan`` is counted per IP and stored under the MAC that holds that IP
    (``owners``), else under ``ip:<address>``. The first ppp0 reading is
    only a baseline: it holds everything since the line came up.
    """
    bucket = now_ts - now_ts % FINE_SECONDS
    last = {
        source: (down, up)
        for source, down, up in connection.execute("SELECT source, down, up FROM last")
    }
    sources = {f"ip:{ip}": counts for ip, counts in lan.items()}
    if wan is not None:
        sources[WAN_KEY] = wan
    added: dict[str, list[int]] = {}
    with connection:
        for source, (down, up) in sources.items():
            previous = last.get(source)
            if source == WAN_KEY and previous is None:
                deltas = [0, 0]
            else:
                deltas = [
                    counter_delta(down, previous[0] if previous else None),
                    counter_delta(up, previous[1] if previous else None),
                ]
            key = WAN_KEY if source == WAN_KEY else owners.get(source[3:], source)
            total = added.setdefault(key, [0, 0])
            total[0] += deltas[0]
            total[1] += deltas[1]
            connection.execute("INSERT OR REPLACE INTO last VALUES (?, ?, ?)", (source, down, up))
        for key, (down, up) in added.items():
            if down or up:
                connection.execute(
                    "INSERT INTO fine VALUES (?, ?, ?, ?) ON CONFLICT (bucket, key) "
                    "DO UPDATE SET down = down + excluded.down, up = up + excluded.up",
                    (bucket, key, down, up),
                )
        # Fold buckets older than a week into hours; drop hours past 90 days.
        cutoff = bucket - FINE_DAYS * 86400
        connection.execute(
            "INSERT INTO hourly SELECT bucket - bucket % 3600, key, sum(down), sum(up) "
            "FROM fine WHERE bucket < ? GROUP BY 1, 2 ON CONFLICT (bucket, key) "
            "DO UPDATE SET down = down + excluded.down, up = up + excluded.up",
            (cutoff,),
        )
        connection.execute("DELETE FROM fine WHERE bucket < ?", (cutoff,))
        connection.execute("DELETE FROM hourly WHERE bucket < ?", (bucket - HOURLY_DAYS * 86400,))


def sync_traffic(leases: dict[str, Lease], now: dt.datetime, path: Path = TRAFFIC_DB) -> None:
    """Take one usage sample (call only while the router is running)."""
    connection = open_traffic(path)
    try:
        record_traffic(
            connection,
            read_wan_counters(),
            read_lan_counters(),
            ip_owners(leases),
            int(now.timestamp()),
        )
        record_seen(connection, leases)
    finally:
        connection.close()


def record_seen(connection: sqlite3.Connection, leases: dict[str, Lease]) -> None:
    """Note when each MAC was first seen; later leases never move it."""
    with connection:
        connection.executemany(
            "INSERT INTO seen VALUES (?, ?) ON CONFLICT (mac) "
            "DO UPDATE SET first = min(first, excluded.first)",
            [(mac, int(lease.last_seen.timestamp())) for mac, lease in leases.items()],
        )


def first_seen(connection: sqlite3.Connection | None, mac: str) -> tuple[int, bool] | None:
    """Return when a MAC was first seen and whether that is only when records begin.

    The earlier of its first lease and its first recorded traffic. Traffic
    is kept for HOURLY_DAYS, so a device as old as the records may be older.
    """
    if connection is None:
        return None
    try:
        lease_first = connection.execute("SELECT first FROM seen WHERE mac = ?", (mac,)).fetchone()
    except sqlite3.OperationalError:  # no seen table until the next sync creates it
        lease_first = None
    traffic_first = first_recorded(connection, [mac], 0)
    times = [t for t in (lease_first and lease_first[0], traffic_first) if t is not None]
    if not times:
        return None
    start = connection.execute(
        "SELECT min(bucket) FROM (SELECT min(bucket) AS bucket FROM fine "
        "UNION ALL SELECT min(bucket) FROM hourly)"
    ).fetchone()[0]
    first = min(times)
    return first, start is not None and first < start + 3600


ACTIVE_BYTES = 100_000  # a 5-minute bucket counts as "in use" above this


ACTIVE_GAP = 3 * FINE_SECONDS  # quieter spells up to this long don't end a period


class ActivePeriod(NamedTuple):
    """A spell of steady traffic from one device."""

    start: int
    end: int
    total: int


def active_periods(
    connection: sqlite3.Connection | None, key: str, now: dt.datetime, days: int = FINE_DAYS
) -> list[ActivePeriod]:
    """Return when a device was in use over the last ``days`` days, newest first.

    Built from the 5-minute buckets: each one moving more than ACTIVE_BYTES
    is in use, and spells closer than ACTIVE_GAP join up. Background chatter
    (update checks, keep-alives) stays below the line.
    """
    if connection is None:
        return []
    since = int(aware(now).timestamp()) - days * 86400
    periods: list[list[int]] = []
    for bucket, total in connection.execute(
        "SELECT bucket, down + up FROM fine WHERE key = ? AND bucket >= ? AND down + up > ? "
        "ORDER BY bucket",
        (key, since, ACTIVE_BYTES),
    ):
        if periods and bucket - periods[-1][1] <= ACTIVE_GAP:
            periods[-1][1] = bucket + FINE_SECONDS
            periods[-1][2] += total
        else:
            periods.append([bucket, bucket + FINE_SECONDS, total])
    return [ActivePeriod(*period) for period in reversed(periods)]


def hour_edges(hours: int, now: dt.datetime, include_current: bool = True) -> list[int]:
    """Return hourly boundaries (epoch seconds) for the last ``hours`` hours.

    With ``include_current`` the last bar is the hour in progress; without,
    the range ends at the start of it (complete hours only).
    """
    end = int(aware(now).timestamp()) // 3600 * 3600 + (3600 if include_current else 0)
    return [end - (hours - i) * 3600 for i in range(hours + 1)]


def range_edges(range_key: str, now: dt.datetime) -> list[int]:
    """Return bar boundaries (epoch seconds) for a usage range.

    24h and 7d use local hours ending with the current one; 30d uses local
    days (midnight to midnight, so DST days are 23 or 25 hours).
    """
    if range_key == "30d":
        today = aware(now).astimezone().date()
        return day_edges(today - dt.timedelta(days=29), today)
    return hour_edges(24 if range_key == "24h" else 168, now)


def day_edges(first_day: dt.date, last_day: dt.date) -> list[int]:
    """Return local midnights from ``first_day`` to the end of ``last_day`` (epoch seconds).

    Built from local dates, so a DST day is simply 23 or 25 hours long.
    """
    days = (last_day - first_day).days + 1
    return [
        int(dt.datetime.combine(first_day + dt.timedelta(days=i), dt.time()).timestamp())
        for i in range(days + 1)
    ]


def first_recorded(connection: sqlite3.Connection, keys: list[str], since: int) -> int | None:
    """Return the first bucket recorded for ``keys`` at or after ``since``, if any."""
    marks = ", ".join("?" * len(keys))
    return connection.execute(
        f"SELECT min(bucket) FROM buckets WHERE key IN ({marks}) AND bucket >= ?",
        [*keys, since],
    ).fetchone()[0]


def usage_series(
    connection: sqlite3.Connection | None, keys: list[str], edges: list[int]
) -> list[tuple[int, int, int]]:
    """Return (bar start, bytes down, bytes up) per bar between ``edges``, summed over keys."""
    bars = [[start, 0, 0] for start in edges[:-1]]
    if connection is None or not keys:
        return [tuple(bar) for bar in bars]
    marks = ", ".join("?" * len(keys))
    query = (
        f"SELECT bucket, down, up FROM buckets WHERE key IN ({marks}) "
        "AND bucket >= ? AND bucket < ?"
    )
    for bucket, down, up in connection.execute(query, [*keys, edges[0], edges[-1]]):
        index = bisect.bisect_right(edges, bucket) - 1
        bars[index][1] += down
        bars[index][2] += up
    return [tuple(bar) for bar in bars]


def usage_totals(connection: sqlite3.Connection | None, since: int) -> dict[str, tuple[int, int]]:
    """Return key -> (bytes down, bytes up) since an epoch time, for every key."""
    if connection is None:
        return {}
    rows = connection.execute(
        "SELECT key, sum(down), sum(up) FROM buckets WHERE bucket >= ? GROUP BY key",
        (since,),
    )
    return {key: (down, up) for key, down, up in rows}


def peak_rate(connection: sqlite3.Connection | None, key: str, since: int) -> float:
    """Return the busiest 5 minutes' download since ``since`` for ``key``, in bits/s."""
    if connection is None:
        return 0.0
    try:
        row = connection.execute(
            "SELECT max(down) FROM fine WHERE key = ? AND bucket >= ?", (key, since)
        ).fetchone()
    except sqlite3.OperationalError:  # no table until the sync first opens the database
        return 0.0
    return (row[0] or 0) * 8 / FINE_SECONDS


def local_midnight(now: dt.datetime) -> int:
    """Return the epoch time of homehub's last local midnight."""
    local = aware(now).astimezone()
    return int(dt.datetime.combine(local.date(), dt.time()).timestamp())


def counter_payload(counters: tuple[int, int] | None, now: float | None = None) -> dict:
    """Return byte counters (rx down, tx up; None while unknown) with a timestamp."""
    return {
        "t": now if now is not None else time.time(),
        "rx": counters[0] if counters else None,
        "tx": counters[1] if counters else None,
    }


def live_payload(now: float | None = None) -> dict:
    """Return ppp0's byte counters with a timestamp for the live view."""
    return counter_payload(read_wan_counters(), now)


# Read in line, not behind the scenes: a live rate needs counters as of its timestamp.
_lan_counters = Recent[tuple[float, dict[str, tuple[int, int]]]](1, background=False)


def recent_lan_counters_read() -> tuple[float, dict[str, tuple[int, int]]]:
    """Return when read_lan_counters() was last asked and what it said, asking nft at most
    every second.

    The live views poll every few seconds, possibly from several browsers. The time is
    the read's, not the request's: a request within the second gets the same counters and
    the same time, so a rate taken from two readings is never 0 or doubled.
    """
    return _lan_counters.get(lambda: (time.time(), read_lan_counters()))


def device_payload(lease: Lease | None, now: float | None = None) -> dict:
    """Return one device's byte counters (down = rx, up = tx) for its live view.

    Only how much, never where: the counters are per device, nothing more.
    """
    if not (lease and lease.online):
        return counter_payload(None, now)
    read_at, counters = recent_lan_counters_read()
    return counter_payload(counters.get(lease.ip), now if now is not None else read_at)


def devices_payload(leases: dict[str, Lease], now: float | None = None) -> dict:
    """Return every online device's byte counters, by MAC, for the constellation."""
    read_at, counters = recent_lan_counters_read()
    owners = ip_owners({mac: lease for mac, lease in leases.items() if lease.online})
    return {
        "t": now if now is not None else read_at,
        "devices": {mac: counters[ip] for ip, mac in owners.items() if ip in counters},
    }


RHYTHM_WEEKS = 4


def rhythm_cells(
    connection: sqlite3.Connection | None, keys: list[str], now: dt.datetime
) -> list[list[float | None]]:
    """Return average bytes per hour for each weekday (Mon first) and local hour.

    Averages the last four weeks of complete hours, counting only hours
    since recording began, so a young database isn't diluted by zeros.
    None marks a slot with no hours recorded yet.
    """
    empty: list[list[float | None]] = [[None] * 24 for _ in range(7)]
    if connection is None or not keys:
        return empty
    edges = hour_edges(RHYTHM_WEEKS * 168, now, include_current=False)
    first = first_recorded(connection, keys, edges[0])
    if first is None:
        return empty
    sums = [[0.0] * 24 for _ in range(7)]
    counts = [[0] * 24 for _ in range(7)]
    for start, down, up in usage_series(connection, keys, edges):
        if start + 3600 <= first:
            continue  # before recording began
        moment = dt.datetime.fromtimestamp(start).astimezone()
        sums[moment.weekday()][moment.hour] += down + up
        counts[moment.weekday()][moment.hour] += 1
    return [
        [sums[day][hour] / counts[day][hour] if counts[day][hour] else None for hour in range(24)]
        for day in range(7)
    ]


CALENDAR_WEEKS = 13  # about the 90 days usage is kept for


class CalendarDay(NamedTuple):
    """One day of the usage calendar."""

    day: dt.date
    down: int
    up: int
    recorded: bool  # False before recording began (shown blank, not as zero)


def calendar_days(
    connection: sqlite3.Connection | None, keys: list[str], now: dt.datetime
) -> list[CalendarDay]:
    """Return every day of the last CALENDAR_WEEKS weeks, Monday first, through today."""
    today = aware(now).astimezone().date()
    start = today - dt.timedelta(days=today.weekday() + 7 * (CALENDAR_WEEKS - 1))
    edges = day_edges(start, today)
    if connection is None or not keys:
        return [
            CalendarDay(start + dt.timedelta(days=i), 0, 0, False) for i in range(len(edges) - 1)
        ]
    first = first_recorded(connection, keys, edges[0])
    return [
        CalendarDay(
            start + dt.timedelta(days=index),
            down,
            up,
            first is not None and edges[index + 1] > first,
        )
        for index, (_start, down, up) in enumerate(usage_series(connection, keys, edges))
    ]
