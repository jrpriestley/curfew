"""The weekly speed test: running it, waiting for a quiet house, storing and showing it."""

import json
import sqlite3
import sys

from helpers import NOW, make_state, text, traffic_db

from curfew import cli, speedtest
from curfew.traffic import TRAFFIC_SCHEMA, WAN_KEY
from curfew.web.pages.network import render_bandwidth, render_network

OUTPUT = json.dumps(
    {
        "download": 607_160_000.0,
        "upload": 497_720_000.0,
        "ping": 18.641,
        "server": {"name": "Toronto, ON", "sponsor": "Rogers", "id": "1"},
    }
)
AT = int(NOW.timestamp())
NEAR = [{"id": "1", "lat": "43.65", "lon": "-79.38", "url": "http://x/upload.php", "d": 1.0}]


def test_a_result_is_read_from_speedtest_cli_json() -> None:
    """Speeds stay in bits/s; the server reads as sponsor (place)."""
    result = speedtest.parse_result(OUTPUT, AT, 0)
    assert result.down_bps == 607_160_000 and result.up_bps == 497_720_000
    assert result.server == "Rogers (Toronto, ON)"
    assert speedtest.describe(result) == (
        "down 607 Mb/s · up 498 Mb/s · ping 19 ms · Rogers (Toronto, ON)"
    )


def test_a_failed_test_is_a_result_with_its_error() -> None:
    """A command that fails, or prints something else, is kept as a failure, not a crash."""
    failing = (sys.executable, "-c", "import sys; sys.exit('Cannot retrieve configuration')")
    result = speedtest.measure(AT, 0, failing, NEAR)
    assert result.down_bps is None and result.server == "Cannot retrieve configuration"
    odd = speedtest.measure(AT, 0, (sys.executable, "-c", "print('hello')"), NEAR)
    assert odd.down_bps is None and "expects" in odd.server
    missing = speedtest.measure(AT, 0, ("/nonexistent/speedtest",), NEAR)
    assert missing.server.startswith("didn't run")
    passing = speedtest.measure(AT, 0, (sys.executable, "-c", f"print({OUTPUT!r})"), NEAR)
    assert passing.down_bps == 607_160_000
    none = speedtest.measure(AT, 0, failing, "no server within 100 km")
    assert none.down_bps is None and none.server == "no server within 100 km"


def test_the_test_gets_only_nearby_servers_nearest_first() -> None:
    """Servers past the limit, or without a place or address, are left out; the
    command reads the rest on stdin."""
    paris = (43.19, -80.38)
    listed = [
        {"id": "far", "lat": "10.5", "lon": "-66.9", "url": "http://caracas/upload.php"},
        {"id": "kitchener", "lat": "43.45", "lon": "-80.49", "url": "http://k/upload.php"},
        {"id": "brantford", "lat": "43.14", "lon": "-80.26", "url": "http://b/upload.php"},
        {"id": "toronto", "lat": "43.65", "lon": "-79.38", "url": "http://t/upload.php"},
        {"id": "nowhere", "url": "http://n/upload.php"},
        {"id": "no-url", "lat": "43.19", "lon": "-80.38"},
    ]
    near = speedtest.nearby_servers(listed, paris, 100)
    assert [server["id"] for server in near] == ["brantford", "kitchener", "toronto"]
    assert 9 < near[0]["d"] < 12 and 90 < near[2]["d"] < 100
    assert speedtest.nearby_servers(listed, paris, 5) == []
    echo = (
        sys.executable,
        "-c",
        "import json,sys; json.load(sys.stdin); print(" + repr(OUTPUT) + ")",
    )
    assert speedtest.measure(AT, 0, echo, near).down_bps == 607_160_000


def test_the_weekly_test_waits_for_the_house_to_be_quiet() -> None:
    """Busy: wait and look again; quiet, or out of tries, and it goes ahead."""
    connection = traffic_db()
    clock = [float(AT)]
    end = AT - AT % 300
    # 500 MB in each of the last two 5-minute buckets: about 13 Mb/s, busy.
    for bucket in (end - 600, end - 300):
        connection.execute("INSERT INTO fine VALUES (?, ?, ?, ?)", (bucket, WAN_KEY, 500e6, 0))
    assert speedtest.house_use(connection, AT) > speedtest.BUSY_BPS
    slept = []

    def sleep(seconds: float) -> None:
        slept.append(seconds)
        clock[0] += seconds

    busy = speedtest.wait_for_quiet(connection, lambda: clock[0], sleep)
    assert busy == 0 and slept == [speedtest.WAIT_SECONDS]  # quiet by the second look
    # Busy throughout: three waits, then it runs anyway and says how busy.
    for offset in range(0, 3600, 300):
        connection.execute(
            "INSERT OR REPLACE INTO fine VALUES (?, ?, ?, ?)", (end + offset, WAN_KEY, 500e6, 0)
        )
    slept.clear()
    clock[0] = float(AT)
    busy = speedtest.wait_for_quiet(connection, lambda: clock[0], sleep)
    assert busy > speedtest.BUSY_BPS and len(slept) == speedtest.TRIES - 1


def test_results_are_stored_and_listed() -> None:
    """Tests come back oldest first, failures included."""
    connection = traffic_db()
    assert speedtest.speed_history(None) == []
    speedtest.record_speed(connection, speedtest.parse_result(OUTPUT, AT, 0))
    speedtest.record_speed(
        connection, speedtest.SpeedResult(AT - 604800, None, None, None, "timed out", 0)
    )
    history = speedtest.speed_history(connection)
    assert [result.at for result in history] == [AT - 604800, AT]
    assert history[1].server == "Rogers (Toronto, ON)"


def test_the_line_speed_is_the_latest_test_that_worked() -> None:
    """A later failure doesn't hide the speed; no test that worked, no speed."""
    connection = traffic_db()
    assert speedtest.line_speed(connection) is None
    result = speedtest.parse_result(OUTPUT, AT, 0)
    speedtest.record_speed(connection, result)
    speedtest.record_speed(
        connection, speedtest.SpeedResult(AT + 604800, None, None, None, "timed out", 0)
    )
    assert speedtest.line_speed(connection) == (result.down_bps, result.up_bps)


def test_the_network_page_shows_bandwidth_over_time() -> None:
    """Empty: when the first runs. Then the latest in the legend, a chart and a table."""
    assert "first test runs on Sunday at 03:30" in text(render_bandwidth(None, NOW))
    connection = traffic_db()
    speedtest.record_speed(
        connection, speedtest.SpeedResult(AT - 604800, None, None, None, "timed out", 0)
    )
    speedtest.record_speed(connection, speedtest.parse_result(OUTPUT, AT - 3600, 9e6))
    body = render_bandwidth(connection, NOW)
    shown = text(body)
    assert "Download 607 Mb/s" in shown and "Upload 498 Mb/s" in shown
    assert "Failed: timed out" in shown and "house busy, 9 Mb/s" in shown
    assert 'class="quality-chart"' in body and "latest 607 Mb/s down" in body
    page = text(render_network(make_state(), {}, {}, NOW, connection))
    assert page.index("Connection quality") < page.index("Bandwidth")


def test_the_command_lists_tests(monkeypatch, tmp_path) -> None:
    """curfew speedtest --list prints every test; none yet says so."""
    path = tmp_path / "traffic.db"
    monkeypatch.setattr(cli, "TRAFFIC_DB", path)
    assert cli.main(["speedtest", "--list"]) == 0
    connection = sqlite3.connect(path)
    connection.executescript(TRAFFIC_SCHEMA)
    speedtest.record_speed(connection, speedtest.parse_result(OUTPUT, AT, 0))
    connection.close()
    args = cli.parser().parse_args(["speedtest", "--list"])
    listing = cli.run_speedtest(args)
    assert "607 Mb/s" in listing and "Rogers (Toronto, ON)" in listing


def test_a_test_beginning_is_marked_for_the_screensaver(tmp_path) -> None:
    """The mark counts for TESTING_SECONDS after a test begins; without one, no test."""
    mark = tmp_path / "speedtest-started"
    assert not speedtest.testing(mark)
    speedtest.mark_testing(mark)
    assert speedtest.testing(mark)
    later = mark.stat().st_mtime + speedtest.TESTING_SECONDS + 1
    assert not speedtest.testing(mark, clock=lambda: later)
    speedtest.mark_testing(tmp_path / "missing" / "mark")  # nowhere to write: no harm
