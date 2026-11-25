"""dhcpd's lease file and dhcpd.conf names: who is on the network."""

import datetime as dt
import functools
import json
import re
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path

from curfew.config import CURFEW_DHCP_CONF, DHCPD_CONF, LAN_INTERFACE, LEASES_FILE, ROUTER_ADDRESS

MAC_RE = re.compile(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")


NEIGHBOUR_FRESH = 600  # a fixed-address device heard from this recently is online (a lease)


@dataclass
class Lease:
    """The most recent DHCP lease seen for one MAC."""

    mac: str
    ip: str
    hostname: str
    last_seen: dt.datetime
    online: bool


def parse_lease_time(value: str) -> dt.datetime:
    """Parse a dhcpd lease time such as ``5 2026/09/25 00:33:52`` (UTC)."""
    _weekday, date, clock = value.split()[:3]
    return dt.datetime.strptime(f"{date} {clock}", "%Y/%m/%d %H:%M:%S").replace(tzinfo=dt.UTC)


LEASE_FIELDS = ("hardware ethernet", "client-hostname", "binding state", "cltt", "starts", "ends")


def lease_entries(text: str):
    """Yield (IP, fields) for each entry in dhcpd.leases content, oldest first."""
    for match in re.finditer(r"^lease ([\d.]+) \{(.*?)^\}", text, re.M | re.S):
        ip, body = match.groups()
        fields: dict[str, str] = {}
        for line in body.splitlines():
            line = line.strip().rstrip(";")
            for key in LEASE_FIELDS:
                if line.startswith(key + " "):
                    fields[key] = line[len(key) + 1 :].strip().strip('"')
        yield ip, fields


def parse_leases(text: str, now: dt.datetime) -> dict[str, Lease]:
    """Return the latest lease per MAC from dhcpd.leases content."""
    leases: dict[str, Lease] = {}
    for ip, fields in lease_entries(text):
        mac = fields.get("hardware ethernet", "").lower()
        if not MAC_RE.match(mac) or "cltt" not in fields:
            continue
        seen = parse_lease_time(fields["cltt"])
        ends = fields.get("ends", "")
        online = (
            fields.get("binding state") == "active"
            and ends != "never"
            and bool(ends)
            and parse_lease_time(ends) > now
        )
        previous = leases.get(mac)
        if previous and previous.last_seen > seen:
            continue
        hostname = fields.get("client-hostname") or (previous.hostname if previous else "")
        leases[mac] = Lease(mac, ip, hostname, seen, online)
    return leases


@dataclass
class LeaseRecord:
    """An address's latest entry in the lease file, whoever holds it."""

    ip: str
    mac: str
    hostname: str
    binding: str  # dhcpd's binding state: active, free, expired, abandoned, backup
    starts: dt.datetime | None
    ends: dt.datetime | None  # None: never


def parse_lease_records(text: str) -> dict[str, LeaseRecord]:
    """Return each address's latest entry from dhcpd.leases content (later entries win)."""
    records = {}
    for ip, fields in lease_entries(text):
        times = [
            None if fields.get(key, "never") == "never" else parse_lease_time(fields[key])
            for key in ("starts", "ends")
        ]
        records[ip] = LeaseRecord(
            ip,
            fields.get("hardware ethernet", "").lower(),
            fields.get("client-hostname", ""),
            fields.get("binding state", ""),
            *times,
        )
    return records


def current_lease_records() -> dict[str, LeaseRecord]:
    """Return each address's latest entry from dhcpd's lease file."""
    return parse_lease_records(LEASES_FILE.read_text(errors="replace"))


def parse_conf_names(text: str) -> dict[str, str]:
    """Return MAC -> name from ``subclass ... 1:<mac>;  # Name`` lines."""
    names = {}
    pattern = r"^\s*subclass\s+\"[^\"]+\"\s+(?:1:)?([0-9a-fA-F:]{17});\s*#\s*(.+?)\s*$"
    for mac, name in re.findall(pattern, text, re.M):
        names[mac.lower()] = name
    return names


@functools.cache
def router_mac(sys_net: Path = Path("/sys/class/net")) -> str:
    """Return homehub's own MAC on the house side ('' where there's no such interface)."""
    try:
        return (sys_net / LAN_INTERFACE / "address").read_text().strip().lower()
    except OSError:
        return ""


def is_router(mac: str) -> bool:
    """Return True for homehub itself."""
    return bool(mac) and mac == router_mac()


def parse_fixed_hosts(text: str) -> dict[str, str]:
    """Return MAC -> fixed address from the host declarations in dhcpd config text."""
    hosts = {}
    for body in re.findall(r"^\s*host\s+[^{]+\{(.*?)\}", text, re.M | re.S):
        mac = re.search(r"hardware\s+ethernet\s+([0-9a-fA-F:]{17})", body)
        ip = re.search(r"fixed-address\s+([\d.]+)", body)
        if mac and ip:
            hosts[mac.group(1).lower()] = ip.group(1)
    return hosts


def parse_neighbours(text: str) -> dict[str, tuple[str, int]]:
    """Return IP -> (MAC, seconds since last heard from) from ``ip -s -j neigh`` output."""
    neighbours = {}
    for entry in json.loads(text or "[]"):
        mac = entry.get("lladdr", "").lower()
        if not MAC_RE.match(mac) or {"FAILED", "INCOMPLETE"} & set(entry.get("state", [])):
            continue
        neighbours[entry["dst"]] = (mac, int(entry.get("confirmed", entry.get("updated", 0))))
    return neighbours


def read_neighbours() -> dict[str, tuple[str, int]]:
    """Return homehub's neighbour table on the house side ({} where there's none)."""
    try:
        result = subprocess.run(
            ["ip", "-s", "-j", "neigh", "show", "dev", LAN_INTERFACE],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return parse_neighbours(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError, KeyError):
        return {}


def add_fixed(
    leases: dict[str, Lease],
    hosts: dict[str, str],
    neighbours: dict[str, tuple[str, int]],
    now: dt.datetime,
) -> None:
    """Put each fixed-address device at its address: dhcpd keeps no lease for one.

    It's online while homehub has heard from it lately (the neighbour table);
    otherwise it was last seen then, or at its old lease from a pool.
    """
    for mac, ip in hosts.items():
        previous = leases.get(mac)
        heard = neighbours.get(ip)
        if heard and heard[0] == mac:
            seen, online = now - dt.timedelta(seconds=heard[1]), heard[1] < NEIGHBOUR_FRESH
        elif previous:
            seen, online = previous.last_seen, False
        else:
            continue  # not seen yet: nothing to show
        leases[mac] = Lease(mac, ip, previous.hostname if previous else "", seen, online)


def current_fixed_hosts() -> dict[str, str]:
    """Return MAC -> fixed address from dhcpd.conf and curfew's part of it."""
    hosts = {}
    for path in (DHCPD_CONF, CURFEW_DHCP_CONF):
        try:
            hosts |= parse_fixed_hosts(path.read_text(errors="replace"))
        except FileNotFoundError:
            pass
    return hosts


def current_leases(now: dt.datetime) -> dict[str, Lease]:
    """Return the latest lease per MAC from dhcpd's lease file, fixed addresses, and
    homehub itself.

    Neither homehub nor a fixed-address device holds a lease, so they're added
    (homehub as always online): their internet traffic is counted under their
    address like any device's.
    """
    leases = parse_leases(LEASES_FILE.read_text(errors="replace"), now)
    if hosts := current_fixed_hosts():
        add_fixed(leases, hosts, read_neighbours(), now)
    if mac := router_mac():
        leases[mac] = Lease(mac, ROUTER_ADDRESS, socket.gethostname(), now, True)
    return leases


def current_conf_names() -> dict[str, str]:
    """Return MAC -> name from the comments in dhcpd.conf and curfew's part of it."""
    names = parse_conf_names(DHCPD_CONF.read_text(errors="replace"))
    try:
        names |= parse_conf_names(CURFEW_DHCP_CONF.read_text(errors="replace"))
    except FileNotFoundError:
        pass
    return names


def is_private(mac: str) -> bool:
    """Return True for a locally administered (private/random) MAC."""
    return bool(int(mac[:2], 16) & 0x02)


def ip_owners(leases: dict[str, Lease]) -> dict[str, str]:
    """Return IP -> MAC, the most recent lease winning when an IP changed hands."""
    owners: dict[str, tuple[dt.datetime, str]] = {}
    for mac, lease in leases.items():
        if lease.ip not in owners or owners[lease.ip][0] < lease.last_seen:
            owners[lease.ip] = (lease.last_seen, mac)
    return {ip: mac for ip, (_seen, mac) in owners.items()}
