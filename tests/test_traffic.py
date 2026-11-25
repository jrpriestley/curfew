"""Usage counting: counters, buckets, ranges, rhythm."""

import datetime as dt
import json

import pytest
from helpers import MEMBER, NOW, lease, make_state, traffic_db

from curfew import devices, policy, traffic
from curfew import leases as dhcp
from curfew.web import charts, components


def test_parse_nft_counters_and_deltas() -> None:
    """Counter sets parse to IP -> bytes; a counter that went backwards was reset."""
    listing = json.dumps(
        {
            "nftables": [
                {"metainfo": {}},
                {
                    "set": {
                        "name": "traffic_up",
                        "elem": [{"elem": {"val": "10.7.1.8", "counter": {"bytes": 80}}}],
                    }
                },
            ]
        }
    )
    assert traffic.parse_nft_counters(listing, "traffic_up") == {"10.7.1.8": 80}
    assert traffic.parse_nft_counters(listing, "traffic_down") == {}
    assert traffic.counter_delta(500, 200) == 300
    assert traffic.counter_delta(50, 200) == 50  # reset: everything is new
    assert traffic.counter_delta(70, None) == 70


def test_homehub_counts_under_its_own_address() -> None:
    """homehub's named counters join the per-IP sets as its address (both or neither)."""
    items = [
        {
            "set": {
                "name": "traffic_up",
                "elem": [{"elem": {"val": "10.7.1.8", "counter": {"bytes": 80}}}],
            }
        },
        {"counter": {"name": "homehub_down", "bytes": 900}},
        {"counter": {"name": "homehub_up", "bytes": 300}},
    ]
    counts = traffic.lan_counters(json.dumps({"nftables": items}))
    assert counts == {"10.7.1.8": (0, 80), traffic.ROUTER_ADDRESS: (900, 300)}
    assert traffic.ROUTER_ADDRESS not in traffic.lan_counters(json.dumps({"nftables": items[:2]}))


def test_homehub_is_always_on_the_device_list(monkeypatch, tmp_path) -> None:
    """With a LAN interface, homehub joins the leases: online, at its address, and
    out of reach of blocks, approvals and profiles (renaming still works)."""
    (tmp_path / dhcp.LAN_INTERFACE).mkdir()
    (tmp_path / dhcp.LAN_INTERFACE / "address").write_text("54:B2:03:04:B8:F8\n")
    mac = dhcp.router_mac.__wrapped__(tmp_path)
    assert mac == "54:b2:03:04:b8:f8"
    monkeypatch.setattr(dhcp, "router_mac", lambda: mac)
    monkeypatch.setattr(dhcp, "LEASES_FILE", tmp_path / "dhcpd.leases")
    dhcp.LEASES_FILE.write_text("")
    found = dhcp.current_leases(NOW)[mac]
    assert found.online and found.ip == traffic.ROUTER_ADDRESS
    state = make_state(profiles={"p1": {"name": "Kids", "members": [], "schedules": []}})
    state["settings"]["block_unknown"] = True
    assert policy.internet_status(state, mac, NOW) == "allowed"
    with pytest.raises(ValueError):
        devices.apply_device_action(state, mac, "block")
    with pytest.raises(ValueError):
        policy.apply_profile_action(state, {"action": "set_profile", "id": "p1", "mac": mac})
    devices.apply_device_action(state, mac, "rename", "Router")
    assert state["devices"][mac] == {"name": "Router"}


def test_record_traffic_buckets_by_owner_and_baselines_wan() -> None:
    """LAN bytes go to the MAC holding the IP (else the IP); first ppp0 reading is a baseline."""
    connection = traffic_db()
    owners = {"10.7.1.5": MEMBER}
    start = 1_794_000_000 - 1_794_000_000 % traffic.FINE_SECONDS
    traffic.record_traffic(connection, (10_000, 2_000), {"10.7.1.5": (900, 100)}, owners, start)
    traffic.record_traffic(
        connection,
        (15_000, 2_500),
        {"10.7.1.5": (1_900, 150), "10.7.1.6": (40, 4)},
        owners,
        start + 60,
    )
    totals = traffic.usage_totals(connection, 0)
    assert totals[MEMBER] == (1_900, 150)
    assert totals["ip:10.7.1.6"] == (40, 4)
    assert totals[traffic.WAN_KEY] == (5_000, 500)


def test_old_buckets_fold_into_hours_without_losing_bytes() -> None:
    """Buckets older than a week become hourly totals; the bytes are kept."""
    connection = traffic_db()
    old = 1_794_000_000 - 1_794_000_000 % 3600 - (traffic.FINE_DAYS + 1) * 86400
    connection.executemany(
        "INSERT INTO fine VALUES (?, 'wan', ?, 0)", [(old, 100), (old + 300, 50)]
    )
    traffic.record_traffic(connection, None, {}, {}, 1_794_000_000)
    assert connection.execute("SELECT count(*) FROM fine").fetchone() == (0,)
    assert traffic.usage_totals(connection, 0) == {"wan": (150, 0)}


def test_usage_series_bins_rows_from_both_tables() -> None:
    """Rows fall into the right bar whichever table holds them; other keys don't leak in."""
    connection = traffic_db()
    connection.execute("INSERT INTO fine VALUES (300, 'wan', 10, 1)")
    connection.execute("INSERT INTO fine VALUES (3900, 'wan', 20, 2)")
    connection.execute("INSERT INTO hourly VALUES (3600, 'wan', 5, 0)")
    connection.execute("INSERT INTO fine VALUES (3900, ?, 7, 7)", (MEMBER,))
    assert traffic.usage_series(connection, ["wan"], [0, 3600, 7200]) == [
        (0, 10, 1),
        (3600, 25, 2),
    ]
    assert traffic.usage_series(None, ["wan"], [0, 3600]) == [(0, 0, 0)]


def test_range_edges_cover_the_period() -> None:
    """Each range has its number of bars and ends with the period containing now."""
    for key, bars in (("24h", 24), ("7d", 168), ("30d", 30)):
        edges = traffic.range_edges(key, NOW)
        assert len(edges) == bars + 1 and edges == sorted(edges)
        assert edges[-2] <= NOW.timestamp() < edges[-1]


def test_format_bytes_and_nice_ceiling() -> None:
    """Sizes read in decimal SI units; axis tops are round and never below the value."""
    assert components.format_bytes(0) == "0 B"
    assert components.format_bytes(940_000) == "940 kB"
    assert components.format_bytes(1_234_000_000) == "1.2 GB"
    for value in (1, 7, 2_200, 3_400_000, 999_999_999):
        top = charts.nice_ceiling(value)
        assert top >= value and top < value * 2.5
    assert charts.nice_ceiling(0) == 1


def test_ip_owners_prefers_latest_lease() -> None:
    """When an IP changed hands, the newer lease owns it."""
    old = lease("aa:bb:cc:dd:ee:01", "10.7.1.5", when=NOW - dt.timedelta(days=2), online=False)
    new = lease("aa:bb:cc:dd:ee:02", "10.7.1.5")
    assert dhcp.ip_owners({old.mac: old, new.mac: new}) == {"10.7.1.5": new.mac}


def test_rhythm_averages_only_recorded_hours() -> None:
    """Weekday x hour averages count only hours since recording began; others are empty."""
    connection = traffic_db()
    now = dt.datetime(2026, 11, 9, 12, 30).astimezone()
    hour = int(now.timestamp()) // 3600 * 3600 - 2 * 3600  # two complete hours back
    connection.execute("INSERT INTO fine VALUES (?, 'wan', 600, 0)", (hour,))
    cells = traffic.rhythm_cells(connection, ["wan"], now)
    slot = dt.datetime.fromtimestamp(hour).astimezone()
    after = slot + dt.timedelta(hours=1)
    assert cells[slot.weekday()][slot.hour] == 600
    assert cells[after.weekday()][after.hour] == 0  # recorded, nothing used
    assert all(value is None for value in cells[(slot.weekday() + 3) % 7])
    assert charts.render_rhythm(traffic_db(), ["wan"], now) == ""  # nothing to show yet


def test_calendar_days_put_each_day_in_its_square() -> None:
    """Daily totals land on their own local day; days before recording began are blank."""
    connection = traffic_db()
    now = dt.datetime(2026, 11, 8, 12, 0).astimezone()
    yesterday_noon = now - dt.timedelta(days=1)
    connection.execute(
        "INSERT INTO fine VALUES (?, 'wan', 4000, 1000)", (int(yesterday_noon.timestamp()),)
    )
    days = traffic.calendar_days(connection, ["wan"], now)
    assert days[0].day.weekday() == 0 and days[-1].day == now.date()  # Monday first, ends today
    by_day = {d.day: d for d in days}
    assert by_day[yesterday_noon.date()].down + by_day[yesterday_noon.date()].up == 5000
    assert by_day[now.date()].recorded and not by_day[now.date() - dt.timedelta(days=3)].recorded


def test_active_periods_join_short_gaps_and_ignore_chatter() -> None:
    """Busy buckets form spells; gaps up to 15 min join; small traffic doesn't count."""
    connection = traffic_db()
    base = int(NOW.timestamp()) // 300 * 300 - 7200
    rows = [(0, 200_000), (300, 200_000), (1200, 200_000), (1800, 50_000), (3600, 300_000)]
    for offset, size in rows:
        connection.execute("INSERT INTO fine VALUES (?, ?, ?, 0)", (base + offset, MEMBER, size))
    periods = traffic.active_periods(connection, MEMBER, NOW)
    assert periods == [
        traffic.ActivePeriod(base + 3600, base + 3900, 300_000),
        traffic.ActivePeriod(base, base + 1500, 600_000),
    ]
    assert traffic.active_periods(None, MEMBER, NOW) == []


def test_first_seen_takes_the_earliest_and_flags_the_records_edge() -> None:
    """First seen is the earlier of lease and traffic; at the records' start it may be older."""
    connection = traffic_db()
    now_ts = int(NOW.timestamp())
    connection.execute("INSERT INTO fine VALUES (?, 'wan', 1, 1)", (now_ts - 86400 * 5,))
    connection.execute("INSERT INTO fine VALUES (?, ?, 1, 1)", (now_ts - 86400 * 2, MEMBER))
    assert traffic.first_seen(connection, MEMBER) == (now_ts - 86400 * 2, False)
    traffic.record_seen(connection, {MEMBER: lease(MEMBER, when=NOW - dt.timedelta(days=3))})
    traffic.record_seen(connection, {MEMBER: lease(MEMBER, when=NOW)})  # later: kept earlier
    assert traffic.first_seen(connection, MEMBER) == (now_ts - 86400 * 3, False)
    connection.execute("INSERT INTO fine VALUES (?, ?, 1, 1)", (now_ts - 86400 * 5, MEMBER))
    assert traffic.first_seen(connection, MEMBER) == (now_ts - 86400 * 5, True)
    assert traffic.first_seen(connection, "aa:bb:cc:dd:ee:99") is None
