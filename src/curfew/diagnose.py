"""Connection diagnosis: each hop from the devices out to the internet, and its history.

Live: ``check_path`` measures every hop at once (pings, links, services,
PPPoE, a DNS lookup) and ``grade_path`` turns the numbers into green, amber
or red. History: the every-minute sync records the Fibrenet gateway's and
the internet's latency, and packet loss, for QUALITY_DAYS. Nothing here looks
at anyone's traffic; it only pings fixed addresses.
"""

import bisect
import datetime as dt
import json
import re
import secrets
import socket
import sqlite3
import struct
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, replace
from pathlib import Path

from curfew.cache import Recent
from curfew.config import (
    DNS_SERVER,
    LAN_INTERFACE,
    MODEM_ADDRESS,
    PING_TARGETS,
    PPP_SERVICE,
    PROBE_MARK,
    QUALITY_DAYS,
    STATUS_COMMANDS,
    WAN_INTERFACE,
    WAN_LINK,
    WATCHED_SERVICES,
)
from curfew.devices import display_name, vendor_for
from curfew.leases import Lease

PING_LOSS_RE = re.compile(r"([\d.]+)% packet loss")
PING_AVERAGE_RE = re.compile(r"= [\d.]+/([\d.]+)/")
PEER_RE = re.compile(r"inet ([\d.]+) peer ([\d.]+)")


@dataclass
class Probe:
    """A ping: average round trip in ms (None if nothing answered) and the share lost."""

    ms: float | None
    loss: float


def parse_ping(output: str) -> Probe:
    """Return the average and loss from ``ping -q`` output (Linux iputils)."""
    loss = PING_LOSS_RE.search(output)
    average = PING_AVERAGE_RE.search(output)
    return Probe(
        float(average.group(1)) if average else None,
        float(loss.group(1)) / 100 if loss else 1.0,
    )


def ping(host: str, count: int = 4) -> Probe:
    """Ping ``host`` a few times quickly; a host that can't be pinged counts as all lost."""
    mark = ["-m", PROBE_MARK] if PROBE_MARK else []
    try:
        result = subprocess.run(
            ["ping", "-n", "-q", "-c", str(count), "-i", "0.2", "-W", "1", *mark, host],
            capture_output=True,
            text=True,
            timeout=count + 3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return Probe(None, 1.0)
    return parse_ping(result.stdout)


def link_state(interface: str, root: Path = Path("/sys/class/net")) -> tuple[bool, int | None]:
    """Return (cable connected, speed in Mbit/s) for an interface."""
    try:
        up = (root / interface / "carrier").read_text().strip() == "1"
    except OSError:
        return False, None
    try:
        speed = int((root / interface / "speed").read_text())
    except (OSError, ValueError):
        speed = None
    return up, speed if speed and speed > 0 else None


def services_down(names: tuple[str, ...]) -> list[str]:
    """Return the systemd services in ``names`` that aren't running."""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", *names], capture_output=True, text=True, timeout=5
        )
    except (OSError, subprocess.TimeoutExpired):
        return list(names)
    states = result.stdout.split()
    return [name for name, state in zip(names, states, strict=False) if state != "active"]


def wan_address(interface: str = WAN_INTERFACE) -> tuple[str, str] | None:
    """Return the PPPoE link's (public IP, Fibrenet's gateway), or None while it's down."""
    try:
        result = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", "dev", interface],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = PEER_RE.search(result.stdout)
    return (match.group(1), match.group(2)) if match else None


def session_since(service: str = PPP_SERVICE) -> int | None:
    """Return when the PPPoE service last started (epoch seconds), if known."""
    try:
        result = subprocess.run(
            ["systemctl", "show", "--timestamp=unix", "-p", "ActiveEnterTimestamp", service],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = re.search(r"=@(\d+)", result.stdout)
    return int(match.group(1)) if match else None


def dns_query(name: str = "example.com", server: str = DNS_SERVER, port: int = 53) -> float | None:
    """Ask ``server`` for ``name``'s address directly; return the answer time in ms."""
    query_id = secrets.randbits(16)
    question = b"".join(bytes([len(label)]) + label.encode() for label in name.split("."))
    packet = struct.pack(">HHHHHH", query_id, 0x0100, 1, 0, 0, 0) + question + b"\0\0\1\0\1"
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(1.0)
        start = time.perf_counter()
        try:
            sock.sendto(packet, (server, port))
            reply = sock.recv(512)
        except OSError:
            return None
    if len(reply) < 12 or struct.unpack(">H", reply[:2])[0] != query_id:
        return None
    if reply[3] & 0x0F:  # an error code (SERVFAIL, NXDOMAIN, ...)
        return None
    return (time.perf_counter() - start) * 1000


def eeros(leases: dict[str, Lease], devices: dict | None = None) -> list[tuple[str, str]]:
    """Return (name, IP) of the eero units on the network, found by their maker.

    Names are the ones given on the page (rename an eero to its room), else
    the unit's own DHCP name.
    """
    devices = devices or {}
    return sorted(
        (display_name(mac, devices.get(mac, {}), lease, {}) or "eero", lease.ip)
        for mac, lease in leases.items()
        if lease.online and "eero" in vendor_for(mac).lower()
    )


@dataclass
class Measurements:
    """Everything check_path measures, before grading."""

    online: int = 0
    mesh: list[tuple[str, Probe]] = field(default_factory=list)  # (eero name, ping)
    lan: tuple[bool, int | None] = (False, None)
    down: list[str] = field(default_factory=list)  # services not running
    dns_ms: float | None = None
    wan_link: tuple[bool, int | None] = (False, None)
    modem: Probe = field(default_factory=lambda: Probe(None, 1.0))
    wan: tuple[str, str] | None = None  # (public IP, gateway)
    since: int | None = None
    gateway: Probe = field(default_factory=lambda: Probe(None, 1.0))
    internet: list[tuple[str, Probe]] = field(default_factory=list)


def check_path(leases: dict[str, Lease], devices: dict | None = None) -> Measurements:
    """Measure every hop at once (about a second, as the pings run in parallel)."""
    found = Measurements(online=sum(lease.online for lease in leases.values()))
    units = eeros(leases, devices)
    found.wan = wan_address()
    with ThreadPoolExecutor(max_workers=8) as pool:
        mesh = [(name, pool.submit(ping, ip)) for name, ip in units]
        modem = pool.submit(ping, MODEM_ADDRESS)
        gateway = pool.submit(ping, found.wan[1]) if found.wan else None
        internet = [(host, pool.submit(ping, host)) for host in PING_TARGETS]
        dns = pool.submit(dns_query)
        found.lan = link_state(LAN_INTERFACE)
        found.wan_link = link_state(WAN_LINK)
        found.down = services_down(WATCHED_SERVICES)
        found.since = session_since()
        found.mesh = [(name, future.result()) for name, future in mesh]
        found.modem = modem.result()
        if gateway:
            found.gateway = gateway.result()
        found.internet = [(host, future.result()) for host, future in internet]
        found.dns_ms = dns.result()
    return found


@dataclass
class Hop:
    """One link in the path, graded: status is ok, warn, bad, off or unknown.

    Facts are (key, value) pairs, such as ("DNS", "3 ms"); a fact that's a
    whole phrase, such as "services running", has an empty key. A summary,
    when there is one, is what the row shows (a line or two); the facts are
    then shown when the row is opened. A tool's card can name the hop it
    goes after, overriding the config's ``after``.
    """

    title: str
    status: str
    facts: list[tuple[str, str]]
    summary: list[tuple[str, str]] = field(default_factory=list)
    after: str = ""


def grade_ping(probe: Probe, ok_ms: float, warn_ms: float) -> str:
    """Return ok, warn or bad for a ping: nothing back is bad, any loss at least warn."""
    if probe.ms is None or probe.loss >= 1:
        return "bad"
    if probe.loss > 0 or probe.ms > warn_ms:
        return "warn"
    return "ok" if probe.ms <= ok_ms else "warn"


def worst(statuses: list[str]) -> str:
    """Return the worst of several statuses."""
    order = ["bad", "warn", "unknown", "ok"]
    return min(statuses, key=order.index) if statuses else "unknown"


def describe(probe: Probe) -> str:
    """Return a ping as words: ``6 ms``, ``6 ms, 25% lost`` or ``no answer``."""
    if probe.ms is None:
        return "no answer"
    loss = f", {probe.loss:.0%} lost" if probe.loss else ""
    return f"{probe.ms:.0f} ms{loss}" if probe.ms >= 1 else f"{probe.ms:.1f} ms{loss}"


def describe_link(link: tuple[bool, int | None]) -> str:
    """Return a link as words: ``1 Gbit/s``, ``100 Mbit/s`` or ``unplugged``."""
    up, speed = link
    if not up:
        return "unplugged"
    if speed is None:
        return "connected"
    return f"{speed // 1000} Gbit/s" if speed >= 1000 else f"{speed} Mbit/s"


def grade_link(link: tuple[bool, int | None]) -> str:
    """Return ok for a gigabit link, warn for a slower one, bad for no cable."""
    up, speed = link
    if not up:
        return "bad"
    return "warn" if speed is not None and speed < 1000 else "ok"


def slowest(probes: list[Probe]) -> str:
    """Return the slowest of several pings as words (one with no answer is slowest)."""
    return describe(max(probes, key=lambda probe: (probe.ms is None, probe.loss, probe.ms or 0)))


def grade_path(found: Measurements, now: float | None = None) -> list[Hop]:
    """Return the path's hops, graded, from the devices out to the internet."""
    now = now or time.time()
    mesh_status = worst([grade_ping(probe, 20, 100) for _name, probe in found.mesh])
    homehub_status = worst(
        [
            grade_link(found.lan),
            "bad" if found.down else "ok",
            "bad" if found.dns_ms is None else "ok",
        ]
    )
    dns = (
        "DNS",
        "not answering"
        if found.dns_ms is None
        else f"{found.dns_ms:.0f} ms"
        if found.dns_ms >= 1
        else "<1 ms",
    )
    services = ("down", ", ".join(found.down)) if found.down else ("", "services running")
    mesh = [probe for _name, probe in found.mesh]
    session = []
    if found.since:
        hours = (now - found.since) / 3600
        session.append(("up", f"{hours / 24:.0f} d" if hours >= 48 else f"{hours:.0f} h"))
    return [
        Hop("Devices", "ok" if found.online else "warn", [("online", str(found.online))]),
        Hop(
            "eero mesh",
            mesh_status,
            [(name, describe(probe)) for name, probe in found.mesh] or [("", "no eeros found")],
            [("eeros", str(len(mesh))), ("slowest", slowest(mesh))] if mesh else [],
        ),
        Hop(
            "homehub",
            homehub_status,
            [("LAN", describe_link(found.lan)), services, dns],
            [services, dns],
        ),
        Hop(
            "ONTbox",
            worst([grade_link(found.wan_link), grade_ping(found.modem, 10, 50)]),
            [("link", describe_link(found.wan_link)), ("ping", describe(found.modem))],
        ),
        Hop(
            "Fibrenet",
            "bad" if not found.wan else grade_ping(found.gateway, 30, 100),
            (
                [("PPPoE", found.wan[0]), *session, ("gateway", describe(found.gateway))]
                if found.wan
                else [("PPPoE", "down")]
            ),
            [("gateway", describe(found.gateway)), *session] if found.wan else [],
        ),
        Hop(
            "Internet",
            worst([grade_ping(probe, 50, 150) for _host, probe in found.internet]),
            [(host, describe(probe)) for host, probe in found.internet]
            + ([("", "checked outside the VPN")] if PROBE_MARK else []),
            [("slowest", slowest([probe for _host, probe in found.internet]))]
            if found.internet
            else [],
        ),
    ]


# What another tool says of itself, as one JSON line: {"state": ..., "facts":
# [[key, value], ...], "summary": [[key, value], ...] (optional: the card's
# line or two, the facts then shown when it's opened), "after": hop title
# (optional: where the card goes, if not where the config says)}. "down" is
# the tool's "bad".
REPORTED_STATES = {"ok": "ok", "warn": "warn", "down": "bad", "off": "off"}


def read_status(name: str, command: list[str], timeout: float = 5) -> Hop:
    """Run a tool's status command and return its card; one that fails is unknown."""
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, check=True
        )
        report = json.loads(result.stdout)
        return Hop(
            name,
            REPORTED_STATES.get(report["state"], "unknown"),
            [(str(key), str(value)) for key, value in report.get("facts", [])],
            [(str(key), str(value)) for key, value in report.get("summary", [])],
            str(report.get("after", "")),
        )
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        return Hop(name, "unknown", [("", "no report")])


def with_reports(hops: list[Hop], reports: list[tuple[str, Hop]]) -> list[Hop]:
    """Return the path with each card after the hop it or the config names (else at the end).

    A card named like a hop takes that hop over instead: its facts replace the
    measured ones and the worse status shows (with its reason, if measured).
    Without a report (unknown), the hop keeps what was measured and adds why.
    """
    hops = list(hops)
    for after, card in reports:
        same = next((i for i, hop in enumerate(hops) if hop.title == card.title), None)
        if same is not None:
            hop = hops[same]
            if card.status == "unknown":
                summary = (hop.summary or hop.facts) + [("", "no report")]
                hops[same] = Hop(hop.title, hop.status, hop.facts + card.facts, summary)
            elif worst([hop.status, card.status]) == card.status:
                hops[same] = Hop(hop.title, card.status, card.facts, card.summary)
            else:
                # Measured worse than reported: keep the measurement's reason
                # on the card (after the report's headline) and in its facts.
                keys = {key for key, _value in card.summary}
                measured = [line for line in hop.summary or hop.facts if line[0] not in keys]
                summary = card.summary[:1] + measured
                hops[same] = Hop(hop.title, hop.status, card.facts + hop.facts, summary)
            continue
        after = card.after or after
        place = next((i + 1 for i, hop in enumerate(hops) if hop.title == after), len(hops))
        hops.insert(place, card)
    return hops


def steady(hops: list[Hop], seen: dict[str, str]) -> list[Hop]:
    """Return the hops with one-off trouble smoothed: worse shows once seen twice in a row.

    A single slow ping (a wireless eero answering late, say) shows as the
    better of this check and the last; ``seen`` keeps each hop's last status.
    """
    order = ["bad", "warn", "unknown", "ok"]
    shown = []
    for hop in hops:
        last = seen.get(hop.title, hop.status)
        seen[hop.title] = hop.status
        better = max(hop.status, last, key=order.index)
        shown.append(replace(hop, status=better) if better != hop.status else hop)
    return shown


_seen: dict[str, str] = {}  # each measured hop's status at the last check, for steady()
_path = Recent[list[Hop]](5)


def path_now(leases: dict[str, Lease], devices: dict | None = None) -> list[Hop]:
    """Return the graded path and the tools' reports, measuring at most every 5 seconds."""

    def measure() -> list[Hop]:
        with ThreadPoolExecutor(max_workers=max(1, len(STATUS_COMMANDS))) as pool:
            asked = [
                (entry.get("after", ""), pool.submit(read_status, entry["name"], entry["command"]))
                for entry in STATUS_COMMANDS
            ]
            hops = steady(grade_path(check_path(leases, devices)), _seen)
            return with_reports(hops, [(after, future.result()) for after, future in asked])

    return _path.get(measure)


_vpn = Recent[dict[str, str]](60, too_old=300)


def vpn_now() -> dict[str, str]:
    """Return what the VPN card says, for the screensaver: {"for", "status"}, at most a minute old.

    "for" is homehub-vpn's: nothing, homehub or whole house; without a VPN
    card in the config (or with no report), {}.
    """

    def read() -> dict[str, str]:
        entry = next((entry for entry in STATUS_COMMANDS if entry.get("name") == "VPN"), None)
        if entry is None:
            return {}
        card = read_status(entry["name"], entry["command"])
        mode = dict(card.facts).get("for")
        return {"for": mode, "status": card.status} if mode else {}

    return _vpn.get(read)


def record_quality(
    connection: sqlite3.Connection, minute: int, gateway: Probe, internet: Probe
) -> None:
    """Store one minute's gateway and internet latency and loss; drop old minutes."""
    with connection:
        connection.execute(
            "INSERT OR REPLACE INTO quality VALUES (?, ?, ?, ?)",
            (minute, gateway.ms, internet.ms, max(gateway.loss, internet.loss)),
        )
        connection.execute(
            "DELETE FROM quality WHERE minute < ?", (minute - QUALITY_DAYS * 86400,)
        )


def sample_quality(connection: sqlite3.Connection, now: dt.datetime) -> None:
    """Ping Fibrenet's gateway and the first internet target together and record it."""
    wan = wan_address()
    with ThreadPoolExecutor(max_workers=2) as pool:
        gateway = pool.submit(ping, wan[1], 5) if wan else None
        internet = pool.submit(ping, PING_TARGETS[0], 5)
        record_quality(
            connection,
            int(now.timestamp()) // 60 * 60,
            gateway.result() if gateway else Probe(None, 1.0),
            internet.result(),
        )


def quality_series(
    connection: sqlite3.Connection | None, edges: list[int]
) -> list[tuple[int, float | None, float | None, float | None]]:
    """Return (bar start, gateway ms, internet ms, loss) averaged per bar between ``edges``."""
    sums = [[0.0, 0, 0.0, 0, 0.0, 0] for _ in edges[:-1]]
    if connection is not None:
        rows = connection.execute(
            "SELECT minute, gateway_ms, internet_ms, loss FROM quality "
            "WHERE minute >= ? AND minute < ?",
            (edges[0], edges[-1]),
        )
        for minute, gateway_ms, internet_ms, loss in rows:
            index = bisect.bisect_right(edges, minute) - 1
            for offset, value in ((0, gateway_ms), (2, internet_ms), (4, loss)):
                if value is not None:
                    sums[index][offset] += value
                    sums[index][offset + 1] += 1
    return [
        (
            start,
            *(
                totals[offset] / totals[offset + 1] if totals[offset + 1] else None
                for offset in (0, 2, 4)
            ),
        )
        for start, totals in zip(edges[:-1], sums, strict=True)
    ]
