"""Connection diagnosis: reading pings and links, grading each hop, and the quality record."""

import dataclasses
import re
import socket
import sqlite3
import subprocess
import sys
import threading

from helpers import text

from curfew import diagnose
from curfew.traffic import TRAFFIC_SCHEMA
from curfew.web.pages import network as network_page

PING_OK = """PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.

--- 1.1.1.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 603ms
rtt min/avg/max/mdev = 5.712/6.134/6.902/0.448 ms
"""
PING_LOSSY = """--- 10.7.1.2 ping statistics ---
4 packets transmitted, 3 received, 25% packet loss, time 610ms
rtt min/avg/max/mdev = 1.9/2.5/3.1/0.4 ms
"""
PING_DEAD = """--- 10.7.0.254 ping statistics ---
4 packets transmitted, 0 received, 100% packet loss, time 3071ms
"""


def test_parse_ping() -> None:
    """Average and loss come out of ping's summary; no replies means no average."""
    assert diagnose.parse_ping(PING_OK) == diagnose.Probe(6.134, 0.0)
    assert diagnose.parse_ping(PING_LOSSY) == diagnose.Probe(2.5, 0.25)
    assert diagnose.parse_ping(PING_DEAD) == diagnose.Probe(None, 1.0)
    assert diagnose.parse_ping("") == diagnose.Probe(None, 1.0)


def test_ping_carries_the_mark(monkeypatch) -> None:
    """Pings are marked so they leave by ppp0, past the VPN's kill switch."""
    calls = []

    def fake_run(command, **_kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, PING_OK, "")

    monkeypatch.setattr(diagnose.subprocess, "run", fake_run)
    assert diagnose.ping("1.1.1.1") == diagnose.Probe(6.134, 0.0)
    assert calls[0][-3:] == ["-m", diagnose.PROBE_MARK, "1.1.1.1"]
    monkeypatch.setattr(diagnose, "PROBE_MARK", "")
    diagnose.ping("1.1.1.1")
    assert "-m" not in calls[1]


def healthy() -> diagnose.Measurements:
    """Return measurements for a house where everything works."""
    good = diagnose.Probe(5.0, 0.0)
    return diagnose.Measurements(
        online=40,
        mesh=[("eero-living", diagnose.Probe(2.0, 0.0))],
        lan=(True, 1000),
        dns_ms=1.0,
        wan_link=(True, 1000),
        modem=diagnose.Probe(0.4, 0.0),
        wan=("69.165.160.136", "206.248.155.246"),
        since=1_000_000,
        gateway=good,
        internet=[("1.1.1.1", good), ("8.8.8.8", good)],
    )


def statuses(found: diagnose.Measurements) -> dict[str, str]:
    """Return each hop's status by title."""
    return {hop.title: hop.status for hop in diagnose.grade_path(found, now=1_000_000 + 7200)}


def test_grade_path_healthy_and_failures() -> None:
    """A healthy house is all ok; each kind of fault turns its own hop amber or red."""
    assert set(statuses(healthy()).values()) == {"ok"}
    lossy = healthy()
    lossy.mesh = [("eero-living", diagnose.Probe(2.0, 0.25))]
    assert statuses(lossy)["eero mesh"] == "warn"
    stopped = healthy()
    stopped.down = ["pihole-FTL"]
    assert statuses(stopped)["homehub"] == "bad"
    no_ppp = healthy()
    no_ppp.wan, no_ppp.internet = None, [("1.1.1.1", diagnose.Probe(None, 1.0))]
    assert statuses(no_ppp)["Fibrenet"] == "bad" and statuses(no_ppp)["Internet"] == "bad"
    slow_link = healthy()
    slow_link.wan_link = (True, 100)
    assert statuses(slow_link)["ONTbox"] == "warn"
    unplugged = healthy()
    unplugged.lan = (False, None)
    assert statuses(unplugged)["homehub"] == "bad"


def test_link_state_reads_sysfs(tmp_path) -> None:
    """Carrier and speed come from /sys/class/net; a missing interface is down."""
    (tmp_path / "eno1").mkdir()
    (tmp_path / "eno1" / "carrier").write_text("1\n")
    (tmp_path / "eno1" / "speed").write_text("1000\n")
    assert diagnose.link_state("eno1", tmp_path) == (True, 1000)
    assert diagnose.link_state("missing", tmp_path) == (False, None)


def test_dns_query_times_an_answer_and_gives_up_on_silence() -> None:
    """A server that answers gives a time; one that stays silent gives none (1 s timeout)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as server:
        server.bind(("127.0.0.1", 0))
        port = server.getsockname()[1]

        def answer() -> None:
            query, client = server.recvfrom(512)
            # Same id, "response" flag, no error: enough for dns_query to accept.
            server.sendto(query[:2] + b"\x81\x80" + query[4:], client)

        threading.Thread(target=answer, daemon=True).start()
        took = diagnose.dns_query("example.com", "127.0.0.1", port)
        assert took is not None and took < 1000
        assert diagnose.dns_query("example.com", "127.0.0.1", port) is None  # nobody replies


def test_quality_record_and_series() -> None:
    """Minutes are averaged per bar; old minutes are dropped; empty bars stay empty."""
    connection = sqlite3.connect(":memory:")
    connection.executescript(TRAFFIC_SCHEMA)
    start = 1_800_000_000 - 1_800_000_000 % 3600
    for minute, gateway, internet, loss in ((0, 4, 8, 0.0), (1, 6, 12, 0.2)):
        diagnose.record_quality(
            connection,
            start + minute * 60,
            diagnose.Probe(gateway, loss),
            diagnose.Probe(internet, 0.0),
        )
    series = diagnose.quality_series(connection, [start, start + 300, start + 600])
    assert series[0] == (start, 5.0, 10.0, 0.1)
    assert series[1] == (start + 300, None, None, None)
    diagnose.record_quality(
        connection, start + 40 * 86400, diagnose.Probe(5, 0), diagnose.Probe(9, 0)
    )
    assert connection.execute("SELECT count(*) FROM quality").fetchone() == (1,)


def test_path_panel_says_what_is_wrong() -> None:
    """The panel names every hop and its state in words, not just colour."""
    found = healthy()
    found.wan, found.internet = None, [("1.1.1.1", diagnose.Probe(None, 1.0))]
    shown = text(network_page.render_path(diagnose.grade_path(found)))
    for title in ("Devices", "eero mesh", "homehub", "ONTbox", "Fibrenet", "Internet"):
        assert title in shown
    assert "PPPoE down" in shown and "not working" in shown and "no answer" in shown


def test_path_panel_words_only_trouble() -> None:
    """Healthy hops show no status word (the dot says it); unhealthy ones say what's wrong."""
    hops = diagnose.grade_path(healthy())
    panel = network_page.render_path(hops)
    visible = re.sub(r'<span class="sr-only">[^<]*</span>', "", panel)
    assert "working" not in text(visible) and "working" in text(panel)  # read aloud, not shown
    off = diagnose.with_reports(hops, [("homehub", diagnose.Hop("VPN", "off", [("for", "x")]))])
    shown = re.sub(r'<span class="sr-only">[^<]*</span>', "", network_page.render_path(off))
    assert ">off<" not in shown  # the grey dot and its facts say it


def test_the_screensaver_reads_the_vpn_card(monkeypatch) -> None:
    """The VPN's mode and state, for the screensaver; nothing without a VPN card."""
    said = '{"state": "down", "facts": [["for", "whole house"], ["ping", "no answer"]]}'
    command = [sys.executable, "-c", f"print({said!r})"]
    monkeypatch.setattr(diagnose, "STATUS_COMMANDS", ({"name": "VPN", "command": command},))
    monkeypatch.setattr(diagnose, "_vpn", diagnose.Recent(60))
    assert diagnose.vpn_now() == {"for": "whole house", "status": "bad"}
    monkeypatch.setattr(diagnose, "STATUS_COMMANDS", ({"name": "eero mesh", "command": command},))
    monkeypatch.setattr(diagnose, "_vpn", diagnose.Recent(60))
    assert diagnose.vpn_now() == {}


def test_tools_report_their_own_cards() -> None:
    """A tool's JSON line becomes a card ("down" is red); one that fails or talks nonsense
    is unknown; each card goes after the hop it names, or at the end."""
    said = '{"state": "down", "facts": [["for", "homehub"], ["ping", "no answer"]]}'
    vpn = diagnose.read_status("VPN", [sys.executable, "-c", f"print({said!r})"])
    assert (vpn.status, vpn.facts) == ("bad", [("for", "homehub"), ("ping", "no answer")])
    assert diagnose.read_status("VPN", [sys.executable, "-c", "print('hi')"]).status == "unknown"
    assert diagnose.read_status("VPN", ["/nonexistent/tool"]).facts == [("", "no report")]
    path = diagnose.grade_path(healthy())
    other = diagnose.Hop("Backup", "ok", [])
    titles = [hop.title for hop in diagnose.with_reports(path, [("homehub", vpn), ("", other)])]
    assert titles[titles.index("homehub") + 1] == "VPN" and titles[-1] == "Backup"
    # A tool can say where its card goes, over the config: the house's VPN after Fibrenet.
    said = '{"state": "ok", "facts": [["for", "whole house"]], "after": "Fibrenet"}'
    house = diagnose.read_status("VPN", [sys.executable, "-c", f"print({said!r})"])
    titles = [hop.title for hop in diagnose.with_reports(path, [("homehub", house)])]
    assert titles[titles.index("Fibrenet") + 1 :] == ["VPN", "Internet"]
    # Named like a hop: it takes the hop over (worse status wins), or adds why it can't.
    mesh = diagnose.Hop("eero mesh", "warn", [("upstairs", "wireless · 2/5 bars")])
    taken = {hop.title: hop for hop in diagnose.with_reports(path, [("", mesh)])}["eero mesh"]
    assert (taken.status, taken.facts) == ("warn", [("upstairs", "wireless · 2/5 bars")])
    # Measured worse than reported: the measurement's reason stays on the card.
    slow = dataclasses.replace(healthy(), mesh=[("eero-living", diagnose.Probe(45.0, 0.0))])
    fine = diagnose.Hop("eero mesh", "ok", [("living", "wired")], [("eeros", "1 of 1 online")])
    hops = diagnose.with_reports(diagnose.grade_path(slow), [("", fine)])
    worse = {hop.title: hop for hop in hops}["eero mesh"]
    assert worse.status == "warn" and worse.summary[0] == ("eeros", "1 of 1 online")
    assert any(key == "slowest" for key, _value in worse.summary)
    assert ("living", "wired") in worse.facts and len(worse.facts) > 1
    signed_out = diagnose.Hop("eero mesh", "unknown", [("", "not signed in")])
    kept = {hop.title: hop for hop in diagnose.with_reports(path, [("", signed_out)])}["eero mesh"]
    assert kept.status == "ok" and kept.facts[-1] == ("", "not signed in") and len(kept.facts) > 1


def test_path_facts_set_the_key_apart() -> None:
    """Each fact's key is marked so it stands out; a phrase without a key is left plain."""
    panel = network_page.render_path(diagnose.grade_path(healthy()))
    assert '<span class="fact-key">DNS</span> ' in panel
    assert "<li>services running</li>" in panel


def test_rows_show_a_summary_and_open_to_every_fact() -> None:
    """A hop with a summary shows it on its row and opens to every fact; one
    without just shows its facts. A tool's summary comes through the contract too."""
    panel = network_page.render_path(diagnose.grade_path(healthy()))
    homehub = panel.split('data-key="homehub"')[1].split("</li>\n")[0].split("</details>")[0]
    row, opened = homehub.split("</summary>")
    assert "<details" in homehub and ">LAN<" in opened  # opened: every fact...
    assert "LAN" not in row  # ...not on the row
    modem = panel.split('data-key="ONTbox"')[1].split("</li>")[0]
    assert "<details" not in modem and "hop-row" in modem
    said = '{"state": "ok", "facts": [["a", "1"], ["b", "2"]], "summary": [["a", "1"]]}'
    hop = diagnose.read_status("Tool", [sys.executable, "-c", f"print({said!r})"])
    assert hop.summary == [("a", "1")] and len(hop.facts) == 2


def test_one_off_trouble_waits_for_a_second_check() -> None:
    """Trouble shows once seen twice in a row; a blip between good checks never does."""
    seen: dict[str, str] = {}
    hop = lambda status: [diagnose.Hop("eero mesh", status, [])]  # noqa: E731
    statuses = [
        diagnose.steady(hop(s), seen)[0].status
        for s in ("ok", "warn", "ok", "warn", "warn", "bad", "bad")
    ]
    assert statuses == ["ok", "ok", "ok", "ok", "warn", "warn", "bad"]
    assert diagnose.steady(hop("bad"), {})[0].status == "bad"  # first look: as measured
