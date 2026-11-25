"""DHCP: curfew's share of isc-dhcp-server's settings, and the service itself.

dhcpd.conf keeps the global settings and includes curfew.conf, which curfew
writes from its saved state (``state["dhcp"]``): the device classes, the
house subnet with its options and address pools, and the fixed addresses.
``curfew dhcp adopt`` moves them out of dhcpd.conf, once. After that each
change is tested with ``dhcpd -t`` on copies before it replaces the live
file, and if dhcpd won't restart with it, the old file goes back.

What curfew doesn't model (an unusual option in the subnet, a pool's
``allow unknown-clients``) is carried over word for word as ``extra``.
"""

import ipaddress
import os
import re
import secrets
import subprocess
from dataclasses import dataclass
from pathlib import Path

from curfew.config import CURFEW_DHCP_CONF, DHCP_SERVICE, DHCPD, DHCPD_CONF, ROUTER_ADDRESS
from curfew.leases import MAC_RE, parse_conf_names

TOKEN_RE = re.compile(r'"(?:[^"\\\n]|\\.)*"|#[^\n]*|[{};]|[^\s{};"#]+')
CLASS_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")
MEMBER_RE = re.compile(r"^(1:)?[0-9a-f]{2}(:[0-9a-f]{2}){5}$")
DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$")
LEASE_KEYS = (("default_lease", "default-lease-time"), ("max_lease", "max-lease-time"))
LEASE_WORDS = {keyword: key for key, keyword in LEASE_KEYS}
EVERY_GROUP = "*"  # a pool's ["deny", "*"]: no member of any group (each is written out)
MAX_LABEL = 40
LOG_LINES = 20


@dataclass
class Statement:
    """One dhcpd.conf statement: its words, its block (None for ``...;``) and where it sits."""

    words: list[str]
    body: "list[Statement] | None"
    start: int
    end: int  # just past its ``;`` or ``}``
    note: str = ""  # a comment on the line its ``;`` or ``{`` is on: often a name


def parse_conf(text: str) -> list[Statement]:
    """Return a dhcpd.conf's statements as a tree (ValueError if garbled).

    Comments are dropped, except one ending a statement's line, kept as its note.
    """
    top: list[Statement] = []
    stack: list[tuple[list[Statement], Statement | None]] = [(top, None)]
    words: list[str] = []
    start = 0
    last: tuple[Statement, int] | None = None  # the newest statement and its ; or {
    for match in TOKEN_RE.finditer(text):
        token = match.group()
        if token.startswith("#"):
            if last and "\n" not in text[last[1] : match.start()]:
                last[0].note = token[1:].strip()
            continue
        if token == ";":
            if words:
                node = Statement(words, None, start, match.end())
                stack[-1][0].append(node)
                last = (node, match.start())
            words = []
        elif token == "{":
            node = Statement(words, [], start if words else match.start(), 0)
            stack[-1][0].append(node)
            stack.append((node.body, node))
            last = (node, match.start())
            words = []
        elif token == "}":
            if words or len(stack) == 1:
                raise ValueError(f"a missing ; or an extra }} at character {match.start()}")
            stack.pop()[1].end = match.end()
        else:
            if not words:
                start = match.start()
            words.append(token)
    if words or len(stack) > 1:
        raise ValueError("the file ends inside a statement or block")
    return top


def unquote(word: str) -> str:
    """Return a word without its quotes."""
    return word[1:-1] if len(word) >= 2 and word[0] == word[-1] == '"' else word


def listed(words: list[str]) -> list[str]:
    """Return a comma-separated list's items: ``10.7.0.1, 1.1.1.1`` -> two."""
    return " ".join(words).replace(",", " ").split()


def label(text: str) -> str:
    """Return a name fit for a one-line comment: no line breaks or ``#``, not too long."""
    return " ".join(text.replace("#", " ").split())[:MAX_LABEL]


def member_mac(key: str) -> str:
    """Return the MAC in a class member's key (``1:aa:bb:..`` or a bare MAC)."""
    return key[-17:]


def host_name(mac: str) -> str:
    """Return the host declaration's name curfew gives a fixed address."""
    return "curfew-" + mac.replace(":", "")


# Reading what dhcpd.conf keeps.


@dataclass
class HandWritten:
    """What dhcpd.conf itself holds: whether it includes curfew.conf, and the rest."""

    includes: bool
    classes: set[str]
    fixed: dict[str, str]  # IP -> host name, for fixed addresses written there
    settings: list[str]  # its top-level statements, in words


def statement_text(statement: Statement) -> str:
    """Return a statement in one line: its words, and ``{ … }`` for a block."""
    return " ".join(statement.words) + (" { … }" if statement.body is not None else "")


def include_line(path: Path = CURFEW_DHCP_CONF) -> str:
    """Return the line that pulls curfew.conf into dhcpd.conf."""
    return f'include "{path}";'


def read_hand_written(text: str | None = None) -> HandWritten:
    """Return what dhcpd.conf holds (read now unless ``text`` is given; empty if missing)."""
    if text is None:
        try:
            text = DHCPD_CONF.read_text(errors="replace")
        except FileNotFoundError:
            text = ""
    statements = parse_conf(text)
    ours = ["include", f'"{CURFEW_DHCP_CONF}"']
    classes, fixed, settings = set(), {}, []
    for statement in statements:
        words = statement.words
        if words == ours:
            continue
        settings.append(statement_text(statement))
        if words[:1] in (["class"], ["subclass"]) and len(words) > 1:
            classes.add(unquote(words[1]))
        for host in [statement] + [s for s in statement.body or [] if s.body is not None]:
            if host.words[:1] == ["host"]:
                for inner in host.body or []:
                    if inner.words[:1] == ["fixed-address"]:
                        for ip in listed(inner.words[1:]):
                            fixed[ip] = unquote(host.words[1]) if len(host.words) > 1 else ""
    return HandWritten(any(s.words == ours for s in statements), classes, fixed, settings)


def global_option(hand: HandWritten, name: str) -> str:
    """Return dhcpd.conf's global ``option <name>`` value, or '' if it sets none."""
    for setting in hand.settings:
        words = setting.split(" ", 2)
        if words[:2] == ["option", name] and len(words) == 3:
            return words[2].rstrip(";").strip()
    return ""


# Taking over: moving everything but the global settings out of dhcpd.conf.


@dataclass
class Adoption:
    """What ``curfew dhcp adopt`` would do: curfew's settings, and dhcpd.conf after."""

    dhcp: dict
    conf: str
    moved: list[str]  # what leaves dhcpd.conf, in words


MOVED = ("subnet", "class", "subclass", "host")


def new_pool(name: str, start: str, end: str, permits: list, extra: list[str]) -> dict:
    """Return a pool record with a fresh id."""
    return {
        "id": secrets.token_hex(4),
        "name": name,
        "start": start,
        "end": end,
        "permits": permits,
        "extra": extra,
    }


def read_permit(words: list[str]) -> list[str] | None:
    """Return ``[allow|deny, class]`` for ``allow members of "x"``, else None."""
    if len(words) == 4 and words[0] in ("allow", "deny") and words[1:3] == ["members", "of"]:
        return [words[0], unquote(words[3])]
    return None


def read_pool(pool: Statement, problems: list[str]) -> list[dict]:
    """Return a pool block as curfew's pools (one per range)."""
    permits, extra, ranges = [], [], []
    for statement in pool.body or []:
        words = statement.words
        if statement.body is not None:
            problems.append(f"a block inside a pool: {statement_text(statement)}")
        elif words[0] == "range" and len(words) == 3:
            ranges.append(words[1:])
        elif permit := read_permit(words):
            permits.append(permit)
        else:
            extra.append(" ".join(words))
    if not ranges:
        problems.append("a pool with no plain range")
    allowed = [name for rule, name in permits if rule == "allow"]
    name = label(pool.note) or label(" ".join(allowed)) or "default"
    return [new_pool(name, start, end, permits, extra) for start, end in ranges]


def read_host(host: Statement, dhcp: dict, problems: list[str]) -> None:
    """Add a host block with a hardware address and one fixed IP to ``dhcp["hosts"]``."""
    name = unquote(host.words[1]) if len(host.words) == 2 else ""
    mac, ip, extra = "", "", []
    for statement in host.body or []:
        words = statement.words
        if words[:2] == ["hardware", "ethernet"] and len(words) == 3:
            mac = words[2].lower()
        elif words[0] == "fixed-address" and len(listed(words[1:])) == 1:
            ip = listed(words[1:])[0]
        elif statement.body is None:
            extra.append(" ".join(words))
        else:
            problems.append(f"a block inside host {name}")
    try:
        ipaddress.IPv4Address(ip)
    except ValueError:
        problems.append(f"host {name or '?'} without one fixed IP address (by number)")
        return
    if not MAC_RE.match(mac):
        problems.append(f"host {name or '?'} without a hardware ethernet address")
        return
    note = label(host.note or name)
    dhcp["hosts"][mac] = {"ip": ip, "name": note, "host": name, "extra": extra}


def read_subnet(subnet: Statement, dhcp: dict, problems: list[str]) -> None:
    """Fill ``dhcp`` from the house subnet's block."""
    for statement in subnet.body or []:
        words = statement.words
        if statement.body is not None:
            if words == ["pool"]:
                dhcp["pools"] += read_pool(statement, problems)
            elif words[:1] == ["host"]:
                read_host(statement, dhcp, problems)
            else:
                problems.append(f"in the subnet: {statement_text(statement)}")
        elif words[0] == "range" and len(words) == 3:
            dhcp["pools"].append(new_pool("default", words[1], words[2], [], []))
        elif words[:2] == ["option", "routers"] and len(listed(words[2:])) == 1:
            dhcp["routers"] = listed(words[2:])[0]
        elif words[:2] == ["option", "domain-name-servers"]:
            dhcp["dns"] = listed(words[2:])
        elif words[:2] == ["option", "domain-name"] and len(words) == 3:
            dhcp["domain"] = unquote(words[2])
        elif words[:2] in (["option", "subnet-mask"], ["option", "broadcast-address"]):
            pass  # these follow from the subnet itself
        elif words[0] in LEASE_WORDS and len(words) == 2 and words[1].isdigit():
            dhcp[LEASE_WORDS[words[0]]] = int(words[1])
        else:
            dhcp["extra"].append(" ".join(words))
    # Two pools can't share a name on the page: number the repeats.
    seen: dict[str, int] = {}
    for pool in dhcp["pools"]:
        seen[pool["name"]] = seen.get(pool["name"], 0) + 1
        if seen[pool["name"]] > 1:
            pool["name"] = f"{pool['name']} {seen[pool['name']]}"


def house_subnet(statements: list[Statement]) -> Statement:
    """Return the subnet that holds homehub's own address."""
    router = ipaddress.IPv4Address(ROUTER_ADDRESS)
    for statement in statements:
        words = statement.words
        if len(words) == 4 and words[0] == "subnet" and words[2] == "netmask":
            try:
                if router in ipaddress.IPv4Network(f"{words[1]}/{words[3]}"):
                    return statement
            except ValueError:
                continue
    raise ValueError(f"dhcpd.conf has no subnet with {ROUTER_ADDRESS} (homehub) in it")


def cut(text: str, statements: list[Statement], replacement: str) -> str:
    """Return ``text`` without ``statements`` (and a comment ending their line);
    ``replacement`` takes the first one's place."""
    pieces, position = [], 0
    for index, statement in enumerate(sorted(statements, key=lambda s: s.start)):
        start = text.rfind("\n", 0, statement.start) + 1
        if text[start : statement.start].strip():
            start = statement.start
        end = text.find("\n", statement.end)
        end = len(text) if end == -1 else end + 1
        rest = text[statement.end : end].strip()
        if rest and not rest.startswith("#"):
            end = statement.end
        pieces.append(text[position:start])
        if index == 0:
            pieces.append(replacement + "\n")
        position = end
    pieces.append(text[position:])
    return re.sub(r"\n{3,}", "\n\n", "".join(pieces))


def adopt(text: str) -> Adoption:
    """Return how to move dhcpd.conf's house subnet, classes and hosts into curfew.conf.

    The global settings (and any other subnet) stay. ValueError lists what
    curfew can't take over, so nothing moves until that's sorted out by hand.
    """
    statements = parse_conf(text)
    if any(s.words == ["include", f'"{CURFEW_DHCP_CONF}"'] for s in statements):
        raise ValueError(f"dhcpd.conf already includes {CURFEW_DHCP_CONF}")
    subnet = house_subnet(statements)
    network = ipaddress.IPv4Network(f"{subnet.words[1]}/{subnet.words[3]}")
    dhcp: dict = {"subnet": str(network), "classes": {}, "pools": [], "hosts": {}, "extra": []}
    problems: list[str] = []
    names = parse_conf_names(text)
    moved = []
    for statement in statements:
        words = statement.words
        kind = words[0] if words else ""
        if kind == "subnet" and statement is subnet:
            read_subnet(statement, dhcp, problems)
        elif kind == "class" and len(words) == 2 and statement.body is not None:
            rules = []
            for rule in statement.body:
                if rule.body is not None:
                    problems.append(f"a block inside class {words[1]}")
                rules.append(" ".join(rule.words))
            group = dhcp["classes"].setdefault(unquote(words[1]), {"members": {}})
            group["rules"] = rules
        elif kind == "subclass" and len(words) == 3 and statement.body is None:
            key = words[2].lower()
            if not MEMBER_RE.match(key):
                problems.append(f"subclass {words[1]} {words[2]} (curfew knows MACs only)")
            group = dhcp["classes"].setdefault(unquote(words[1]), {"rules": [], "members": {}})
            group["members"][key] = label(names.get(member_mac(key), ""))
        elif kind == "host" and statement.body is not None:
            read_host(statement, dhcp, problems)
        elif kind in ("shared-network", "group") and statement.body is not None:
            if any(
                s.words[:1] == ["subnet"] and s.words[1:2] == subnet.words[1:2]
                for s in statement.body
            ):
                problems.append(f"the house subnet is inside {kind}")
            continue
        else:
            continue
        if kind != "subnet" or statement is subnet:
            moved.append(statement)
    for name in dhcp["classes"]:
        if not CLASS_RE.match(name):
            problems.append(f'class "{name}" (curfew takes letters, digits, . _ - only)')
    if not dhcp["pools"]:
        problems.append("the house subnet has no range to hand out")
    # A pool turning away every group is "everyone not in a group", so a new
    # group is kept out of it too.
    for pool in dhcp["pools"]:
        denied = sorted(name for rule, name in pool["permits"] if rule == "deny")
        if (
            dhcp["classes"]
            and len(denied) == len(pool["permits"])
            and denied == sorted(dhcp["classes"])
        ):
            pool["permits"] = [["deny", EVERY_GROUP]]
    if problems:
        raise ValueError(
            "curfew can't take these over; change them in dhcpd.conf first:\n  "
            + "\n  ".join(dict.fromkeys(problems))
        )
    words = []
    if dhcp["classes"]:
        members = sum(len(group["members"]) for group in dhcp["classes"].values())
        words.append(f"{count(len(dhcp['classes']), 'class')} ({count(members, 'device')})")
    words.append(f"subnet {network} ({count(len(dhcp['pools']), 'pool')})")
    if dhcp["hosts"]:
        words.append(count(len(dhcp["hosts"]), "fixed address"))
    return Adoption(dhcp, cut(text, moved, include_line()).rstrip("\n") + "\n", words)


def count(number: int, thing: str) -> str:
    """Return e.g. ``1 pool``, ``2 classes``."""
    return f"{number} {thing}{'' if number == 1 else 'es' if thing.endswith(('s', 'ss')) else 's'}"


# Writing curfew.conf.

HEADER = (
    "# Written by curfew from its saved settings (Network › DHCP on the page, or\n"
    "# `curfew dhcp`); changes made here are overwritten. dhcpd.conf includes this\n"
    "# file and keeps the global settings.\n"
)


def render_conf(dhcp: dict) -> str:
    """Return curfew.conf: classes, then the house subnet and its pools, then fixed addresses."""
    out = [HEADER]
    for name, group in sorted(dhcp.get("classes", {}).items()):
        out.append(f'class "{name}" {{')
        out += [f"  {rule};" for rule in group.get("rules", [])]
        out.append("}")
        members = sorted(group.get("members", {}).items(), key=lambda item: item[1].lower())
        for key, note in members:
            out.append(f'subclass "{name}" {key};' + (f"  # {label(note)}" if note else ""))
        out.append("")
    network = ipaddress.IPv4Network(dhcp["subnet"])
    out.append(f"subnet {network.network_address} netmask {network.netmask} {{")
    if dhcp.get("routers"):
        out.append(f"  option routers {dhcp['routers']};")
    if dhcp.get("dns"):
        out.append(f"  option domain-name-servers {', '.join(dhcp['dns'])};")
    if dhcp.get("domain"):
        out.append(f'  option domain-name "{dhcp["domain"]}";')
    for key, keyword in LEASE_KEYS:
        if dhcp.get(key):
            out.append(f"  {keyword} {dhcp[key]};")
    out += [f"  {line};" for line in dhcp.get("extra", [])]
    for pool in dhcp["pools"]:
        out += ["", f"  pool {{  # {label(pool['name'])}"]
        groups = sorted(dhcp.get("classes", {}))
        out += [
            f'    {rule} members of "{group}";'
            for rule, name in pool.get("permits", [])
            for group in (groups if name == EVERY_GROUP else [name])
        ]
        out += [f"    {line};" for line in pool.get("extra", [])]
        out += [f"    range {pool['start']} {pool['end']};", "  }"]
    out.append("}")
    hosts = sorted(
        dhcp.get("hosts", {}).items(), key=lambda item: ipaddress.IPv4Address(item[1]["ip"])
    )
    for mac, host in hosts:
        note = label(host.get("name", ""))
        out += [
            "",
            f"host {host.get('host') or host_name(mac)} {{" + (f"  # {note}" if note else ""),
            f"  hardware ethernet {mac};",
            f"  fixed-address {host['ip']};",
            *[f"  {line};" for line in host.get("extra", [])],
            "}",
        ]
    return "\n".join(out) + "\n"


# Checking settings before they're tried.


def usable(text: str, network: ipaddress.IPv4Network, what: str) -> ipaddress.IPv4Address:
    """Return ``text`` as an address a device in ``network`` can have (else ValueError)."""
    try:
        ip = ipaddress.IPv4Address(text.strip())
    except ValueError:
        raise ValueError(f"{what}: {text!r} isn't an IPv4 address.") from None
    if ip not in network or ip in (network.network_address, network.broadcast_address):
        raise ValueError(f"{what}: {ip} isn't a device address in {network}.")
    return ip


def check_settings(dhcp: dict, hand: HandWritten) -> None:
    """Raise ValueError, in words for the page, if the settings can't work.

    dhcpd -t checks the syntax later; this catches what it lets through, like
    a fixed address inside a pool or two pools sharing addresses.
    """
    network = ipaddress.IPv4Network(dhcp["subnet"])
    if dhcp.get("routers"):
        usable(dhcp["routers"], network, "Gateway")
    # An empty box falls back to dhcpd.conf; with nothing there, devices get no
    # gateway (or no DNS) and lose the internet as their leases renew.
    for key, option, what in (
        ("routers", "routers", "Gateway"),
        ("dns", "domain-name-servers", "DNS"),
    ):
        if not dhcp.get(key) and not global_option(hand, option):
            raise ValueError(
                f"{what}: {DHCPD_CONF.name} has no global option {option} to fall back "
                "on, so devices would get none. Set one here, or add it there first."
            )
    for server in dhcp.get("dns", []):
        try:
            ipaddress.IPv4Address(server)
        except ValueError:
            raise ValueError(f"DNS server: {server!r} isn't an IPv4 address.") from None
    if dhcp.get("domain") and not DOMAIN_RE.match(dhcp["domain"]):
        raise ValueError(f"Domain: {dhcp['domain']!r} isn't a domain name.")
    default, longest = dhcp.get("default_lease"), dhcp.get("max_lease")
    if default and longest and default > longest:
        raise ValueError("The usual lease can't be longer than the longest one.")
    classes = set(dhcp.get("classes", {})) | hand.classes
    for name, group in dhcp.get("classes", {}).items():
        if not CLASS_RE.match(name) or not all(map(MEMBER_RE.match, group.get("members", {}))):
            raise ValueError(f"Device group {name!r} has a bad name or member.")
    ranges = []
    names = set()
    for pool in dhcp["pools"]:
        what = f"Pool {pool['name'] or '(unnamed)'}"
        if not pool["name"] or pool["name"] in names:
            raise ValueError(f"{what}: each pool needs a name of its own.")
        names.add(pool["name"])
        first, last = usable(pool["start"], network, what), usable(pool["end"], network, what)
        if first > last:
            raise ValueError(f"{what}: the range ends before it starts.")
        for rule, name in pool.get("permits", []):
            if [rule, name] == ["deny", EVERY_GROUP]:
                continue
            if rule not in ("allow", "deny") or name not in classes:
                raise ValueError(f"{what}: there's no device group called {name!r}.")
        for other, start, end in ranges:
            if first <= end and start <= last:
                raise ValueError(f"{what} shares addresses with pool {other}.")
        ranges.append((pool["name"], first, last))
    if not ranges:
        raise ValueError("Keep at least one pool, or new devices get no address.")
    reserved = {dhcp.get("routers", ""): "the gateway", ROUTER_ADDRESS: "homehub"}
    reserved |= {ip: f"host {name} in dhcpd.conf" for ip, name in hand.fixed.items()}
    for mac, host in dhcp.get("hosts", {}).items():
        if not MAC_RE.match(mac):
            raise ValueError(f"{mac!r} isn't a MAC address.")
        ip = usable(host["ip"], network, "Fixed address")
        for pool_name, start, end in ranges:
            if start <= ip <= end:
                raise ValueError(
                    f"{ip} is in pool {pool_name}; a fixed address has to be outside the pools."
                )
        if str(ip) in reserved:
            raise ValueError(f"{ip} is already {reserved[str(ip)]}'s.")
        reserved[str(ip)] = "another device"


# Putting files in place, and the service.


def run(command: list[str], timeout: float) -> subprocess.CompletedProcess | None:
    """Run a command, capturing its output; None if it couldn't run or took too long."""
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None


def point_include(conf: str, path: Path) -> str:
    """Return dhcpd.conf text with its curfew.conf include pointing at ``path``."""
    pattern = rf'^(\s*include\s+)"{re.escape(str(CURFEW_DHCP_CONF))}"'
    return re.sub(pattern, lambda match: f'{match.group(1)}"{path}"', conf, flags=re.M)


def complaint(output: str, renames: dict[str, str]) -> str:
    """Return dhcpd -t's complaint in a line or three, without its sign-off."""
    for copy, real in renames.items():
        output = output.replace(copy, real)
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    end = next((i for i, line in enumerate(lines) if line.startswith("Configuration file")), None)
    lines = lines[:end]
    found = [line for line in lines if " line " in line] or lines
    return "; ".join(found[-3:]) or "dhcpd -t failed"


def test_files(conf: str, curfew: str) -> str:
    """Return dhcpd's complaint about dhcpd.conf and curfew.conf as given, or '' if it's happy.

    The copies sit beside the real files: AppArmor lets dhcpd read /etc/dhcp only.
    """
    curfew_copy = CURFEW_DHCP_CONF.with_name(".curfew-test-part.conf")
    conf_copy = DHCPD_CONF.with_name(".curfew-test.conf")
    try:
        curfew_copy.write_text(curfew)
        conf_copy.write_text(point_include(conf, curfew_copy))
        result = run([DHCPD, "-t", "-q", "-cf", str(conf_copy)], 15)
    except OSError as error:
        return f"couldn't write the test copy: {error.strerror or error}"
    finally:
        curfew_copy.unlink(missing_ok=True)
        conf_copy.unlink(missing_ok=True)
    if result is None:
        return f"{DHCPD} -t didn't run"
    if result.returncode == 0:
        return ""
    renames = {str(curfew_copy): str(CURFEW_DHCP_CONF), str(conf_copy): str(DHCPD_CONF)}
    return complaint(result.stderr + result.stdout, renames)


def restart_service() -> str:
    """Restart dhcpd; return what went wrong, or '' if it's running."""
    result = run(["systemctl", "restart", DHCP_SERVICE], 30)
    if result is None:
        return "systemctl didn't run"
    if result.returncode:
        return result.stderr.strip() or f"{DHCP_SERVICE} didn't start"
    return ""


def write_file(path: Path, text: str | None) -> None:
    """Replace a file atomically, readable by all (None removes it)."""
    if text is None:
        path.unlink(missing_ok=True)
        return
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text)
    tmp.chmod(0o644)
    os.replace(tmp, path)


def read_file(path: Path) -> str | None:
    """Return a file's text, or None if there's no such file."""
    try:
        return path.read_text()
    except FileNotFoundError:
        return None


def install(files: dict[Path, str]) -> None:
    """Put dhcpd.conf and/or curfew.conf in place together and restart dhcpd.

    dhcpd -t checks the pair first; if it refuses, or dhcpd won't start with
    them, the old files stay (or go back). Either way ValueError says why.
    """
    conf = files.get(DHCPD_CONF) or read_file(DHCPD_CONF) or ""
    curfew = files.get(CURFEW_DHCP_CONF) or read_file(CURFEW_DHCP_CONF) or ""
    error = test_files(conf, curfew)
    if error:
        raise ValueError(f"dhcpd refused that, so nothing changed: {error}")
    previous = {path: read_file(path) for path in files}
    for path, text in files.items():
        write_file(path, text)
    problem = restart_service()
    if problem:
        for path, text in previous.items():
            write_file(path, text)
        restart_service()
        raise ValueError(
            f"dhcpd wouldn't start with that, so the old settings are back: {problem}"
        )


def push_dhcp(before: dict | None, after: dict | None) -> None:
    """Make curfew.conf match changed settings (see curfew.sync.change_state).

    ValueError (nothing changed) if dhcpd.conf doesn't include curfew.conf
    yet, or dhcpd won't have the new file.
    """
    if after is None or after == before:
        return
    text = render_conf(after)
    if read_file(CURFEW_DHCP_CONF) == text:
        return
    if not read_hand_written().includes:
        raise ValueError(
            f"{DHCPD_CONF} doesn't include {CURFEW_DHCP_CONF}: run curfew dhcp adopt."
        )
    install({CURFEW_DHCP_CONF: text})


@dataclass
class ServiceState:
    """dhcpd's unit: running or not, since when, and its last log lines."""

    state: str  # systemd's ActiveState (active, failed, ...), or "unknown"
    since: int | None  # epoch seconds
    log: list[str]


def service_state() -> ServiceState:
    """Return the DHCP service's state and recent log."""
    show = run(
        [
            "systemctl",
            "show",
            "--timestamp=unix",
            "-p",
            "ActiveState",
            "-p",
            "ActiveEnterTimestamp",
            DHCP_SERVICE,
        ],
        5,
    )
    values = dict(line.partition("=")[::2] for line in show.stdout.splitlines()) if show else {}
    since = re.match(r"@(\d+)", values.get("ActiveEnterTimestamp", ""))
    log = run(
        [
            "journalctl",
            "-u",
            DHCP_SERVICE,
            "-n",
            str(LOG_LINES),
            "-q",
            "--no-pager",
            "-o",
            "short",
        ],
        5,
    )
    return ServiceState(
        values.get("ActiveState") or "unknown",
        int(since.group(1)) if since else None,
        log.stdout.splitlines() if log and log.returncode == 0 else [],
    )


# Changes from the page and the command line.


def seconds(minutes: str, what: str) -> int:
    """Return a lease time given in minutes as seconds (0: leave it to dhcpd.conf)."""
    minutes = minutes.strip()
    if not minutes:
        return 0
    if not minutes.isdigit() or not 1 <= int(minutes) <= 7 * 24 * 60:
        raise ValueError(f"{what}: give whole minutes, up to a week.")
    return int(minutes) * 60


def permits_for(who: str, pool: dict) -> list:
    """Return a pool's permits for a "who" choice: all, rest (no group's members),
    only:CLASS, except:CLASS, or keep."""
    if who == "keep":
        return pool.get("permits", [])
    if who == "all":
        return []
    if who == "rest":
        return [["deny", EVERY_GROUP]]
    rule, _, name = who.partition(":")
    if rule not in ("only", "except") or not name:
        raise ValueError("Choose who the pool is for.")
    return [["allow" if rule == "only" else "deny", name]]


def find_pool(dhcp: dict, pool_id: str) -> dict:
    """Return a pool by id (ValueError if it's gone)."""
    for pool in dhcp["pools"]:
        if pool["id"] == pool_id:
            return pool
    raise ValueError("That pool is gone.")


DHCP_ACTIONS = (
    "options",
    "add_pool",
    "edit_pool",
    "remove_pool",
    "fix",
    "unfix",
    "group",
)


def apply_dhcp_action(
    state: dict, fields: dict[str, str], hand: HandWritten | None = None
) -> None:
    """Apply one DHCP change from a form (or the command line) to state.

    Checked here (ValueError, nothing changed); the file is written and dhcpd
    restarted after, by change_state.
    """
    dhcp = state.get("dhcp")
    if dhcp is None:
        raise ValueError("curfew doesn't manage DHCP yet: run sudo curfew dhcp adopt on homehub.")
    action = fields.get("action", "")
    mac = fields.get("mac", "").lower()
    if action in ("fix", "unfix", "group") and not MAC_RE.match(mac):
        raise ValueError("That isn't a MAC address.")
    if action == "options":
        dhcp["routers"] = fields.get("routers", "").strip()
        dhcp["dns"] = listed([fields.get("dns", "")])
        dhcp["domain"] = fields.get("domain", "").strip().lower()
        dhcp["default_lease"] = seconds(fields.get("default_lease", ""), "Usual lease")
        dhcp["max_lease"] = seconds(fields.get("max_lease", ""), "Longest lease")
    elif action in ("add_pool", "edit_pool"):
        pool = (
            new_pool("", "", "", [], [])
            if action == "add_pool"
            else find_pool(dhcp, fields.get("id", ""))
        )
        pool["name"] = label(fields.get("name", ""))
        pool["start"] = fields.get("start", "").strip()
        pool["end"] = fields.get("end", "").strip()
        pool["permits"] = permits_for(fields.get("who", "keep"), pool)
        if action == "add_pool":
            dhcp["pools"].append(pool)
    elif action == "remove_pool":
        find_pool(dhcp, fields.get("id", ""))
        dhcp["pools"] = [pool for pool in dhcp["pools"] if pool["id"] != fields["id"]]
    elif action == "fix":
        host = dhcp.setdefault("hosts", {}).setdefault(
            mac, {"name": label(fields.get("name", ""))}
        )
        host["ip"] = fields.get("ip", "").strip()
    elif action == "unfix":
        dhcp.get("hosts", {}).pop(mac, None)
    elif action == "group":
        wanted = fields.get("group", "")
        classes = dhcp.get("classes", {})
        if wanted and wanted not in classes:
            raise ValueError(f"There's no device group called {wanted!r}.")
        for name, group in classes.items():
            members = group.setdefault("members", {})
            keys = [key for key in members if member_mac(key) == mac]
            if name == wanted and not keys:
                prefix = "" if members and not next(iter(members)).startswith("1:") else "1:"
                members[prefix + mac] = label(fields.get("name", ""))
            elif name != wanted:
                for key in keys:
                    del members[key]
    else:
        raise ValueError("Bad request.")
    check_settings(dhcp, read_hand_written() if hand is None else hand)


def fixed_ip(state: dict, mac: str) -> str:
    """Return a device's fixed address, or ''."""
    return state.get("dhcp", {}).get("hosts", {}).get(mac, {}).get("ip", "")


def pool_choices(dhcp: dict) -> list[tuple[str, str]]:
    """Return (device group, label) for each place a device can be put.

    A pool that allows one group's members is reached by joining that group;
    a pool with no allow ("default": everyone but av) by being in no group. A group
    without a pool of its own is listed too, so every group stays reachable.
    """
    choices, seen = [], set()
    for pool in dhcp.get("pools", []):
        allowed = [name for rule, name in pool.get("permits", []) if rule == "allow"]
        if len(allowed) > 1:
            continue
        group = allowed[0] if allowed else ""
        if group not in seen:
            seen.add(group)
            choices.append((group, f"{pool['name']} ({pool['start']} – {pool['end']})"))
    if "" not in seen:
        choices.insert(0, ("", "No group"))
    for name in sorted(dhcp.get("classes", {})):
        if name not in seen:
            choices.append((name, f"Group {name} (no pool of its own)"))
    return choices


def place_name(dhcp: dict, group: str) -> str:
    """Return the pool (or group) a device group puts a device in, in words."""
    label = dict(pool_choices(dhcp)).get(group, group or "no group")
    return label.split(" (")[0]


def device_group(state: dict, mac: str) -> str:
    """Return the name of the device group (class) a device is in, or ''."""
    for name, group in state.get("dhcp", {}).get("classes", {}).items():
        if any(member_mac(key) == mac for key in group.get("members", {})):
            return name
    return ""


def pool_for(dhcp: dict, ip: str) -> dict | None:
    """Return the pool an address falls in, if any."""
    try:
        address = ipaddress.IPv4Address(ip)
    except ValueError:
        return None
    for pool in dhcp.get("pools", []):
        start, end = ipaddress.IPv4Address(pool["start"]), ipaddress.IPv4Address(pool["end"])
        if start <= address <= end:
            return pool
    return None


def pool_size(pool: dict) -> int:
    """Return how many addresses a pool holds."""
    start, end = ipaddress.IPv4Address(pool["start"]), ipaddress.IPv4Address(pool["end"])
    return int(end) - int(start) + 1


def who_text(permits: list) -> str:
    """Return who a pool serves, in words."""
    if not permits:
        return "Everyone"
    if permits == [["deny", EVERY_GROUP]]:
        return "Everyone else"
    if len(permits) == 1:
        rule, name = permits[0]
        return f"Only {name}" if rule == "allow" else f"Everyone but {name}"
    return ", ".join(f"{rule} {name}" for rule, name in permits)
