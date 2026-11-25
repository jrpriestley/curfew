"""The ``curfew`` command: run the page and the sync, and manage devices and profiles.

    curfew status                    what's online, blocked, scheduled; today's use
    curfew devices [--all]           the device list
    curfew profiles                  profiles, their state and next change
    curfew block|unblock DEVICE      by name, MAC or IP
    curfew approve DEVICE [--name N] let a new device on (when blocking new devices)
    curfew guest DEVICE              let a new device on for a day, then forget it
    curfew forget DEVICE             drop a device's record: it's new again
    curfew wake DEVICE               send a wake-on-LAN packet
    curfew rename DEVICE NAME
    curfew type DEVICE KIND
    curfew pause PROFILE|all [FOR]   FOR: 30m, 1h, 2h or morning; default until resumed
    curfew resume PROFILE|all
    curfew bonus PROFILE FOR|end     15m, 30m or 1h more (now, or ahead of the next block);
                                     end revokes it
    curfew dhcp [status]             dhcpd: running?, pools, fixed addresses
    curfew dhcp leases [--all]       the leases held (--all: expired and free too)
    curfew dhcp adopt [--apply]      move all but dhcpd.conf's global settings to curfew.conf
    curfew dhcp fix DEVICE IP        give a device a fixed address (unfix to take it away)
    curfew dhcp apply | restart      rewrite curfew.conf from saved settings; restart dhcpd
    curfew speedtest [--weekly]      test the line's speed now (--weekly: once the house is quiet)
    curfew speedtest --list          every test so far
    curfew serve | sync | doh        the web page, the every-minute sync, DoH rules
    curfew firewall                  just the firewall (run on each DHCP lease)

Commands that change things need root (sudo), like the services that run them.
"""

import argparse
import datetime as dt
import subprocess
import sys
import time

from curfew import __version__, dhcp
from curfew.config import (
    APP_NAME,
    BIND_ADDRESS,
    CURFEW_DHCP_CONF,
    DHCPD_CONF,
    DOH_DOMAINS_FILE,
    PIHOLE_DB,
    RECENT_DAYS,
    TRAFFIC_DB,
)
from curfew.devices import KIND_LABELS, apply_device_action, display_name
from curfew.firewall import router_active
from curfew.leases import (
    MAC_RE,
    Lease,
    current_conf_names,
    current_lease_records,
    current_leases,
)
from curfew.pihole import read_domains, write_doh_rules
from curfew.policy import apply_profile_action, internet_status, profile_for
from curfew.schedules import format_next_change, local_now, profile_block_reason
from curfew.speedtest import (
    describe,
    house_use,
    mark_testing,
    mbps,
    measure,
    record_speed,
    speed_history,
    wait_for_quiet,
    when,
)
from curfew.state import load_state, open_readonly
from curfew.sync import change_state, sync_all, sync_firewall
from curfew.traffic import WAN_KEY, local_midnight, open_traffic, usage_totals
from curfew.wake import wake
from curfew.web.components import format_bytes, format_seen

# Spoken durations -> the choices the page offers (minutes, or "morning").
PAUSE_DURATIONS = {"30m": "30", "1h": "60", "60m": "60", "2h": "120", "morning": "morning"}
BONUS_DURATIONS = {"15m": "15", "30m": "30", "1h": "60", "60m": "60"}


class CommandError(Exception):
    """A problem to report to the user (exit status 1), not a crash."""


def resolve_device(
    query: str, state: dict, leases: dict[str, Lease], conf_names: dict[str, str]
) -> str:
    """Return the MAC a query names: a MAC, a current IP, or a device name.

    Names match case-insensitively, exactly first, then as a unique part of
    a name. Anything ambiguous or unknown raises CommandError.
    """
    wanted = query.strip().lower()
    if MAC_RE.match(wanted):
        return wanted
    by_ip = [mac for mac, lease in leases.items() if lease.ip == wanted]
    if by_ip:
        return by_ip[0]
    names = {
        mac: display_name(mac, state["devices"].get(mac, {}), leases.get(mac), conf_names)
        for mac in set(leases) | set(state["devices"])
    }
    for matches in (
        [mac for mac, name in names.items() if name.lower() == wanted],
        [mac for mac, name in names.items() if wanted in name.lower()],
    ):
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            listing = ", ".join(sorted(f"{names[mac]} ({mac})" for mac in matches))
            raise CommandError(f"{query!r} matches several devices: {listing}")
    raise CommandError(f"no device called {query!r} (try a MAC or IP)")


def resolve_profiles(query: str, state: dict) -> list[str]:
    """Return the profile ids a query names: ``all``, a profile name or an id."""
    if query.lower() == "all":
        return list(state["profiles"])
    for profile_id, profile in state["profiles"].items():
        if query.lower() in {profile["name"].lower(), profile_id}:
            return [profile_id]
    known = ", ".join(sorted(p["name"] for p in state["profiles"].values())) or "none yet"
    raise CommandError(f"no profile called {query!r} (profiles: {known})")


def duration(text: str, choices: dict[str, str]) -> str:
    """Return the page's value for a spoken duration, e.g. ``1h`` -> ``60``."""
    value = choices.get(text.lower())
    if value is None:
        raise CommandError(f"{text!r} isn't one of: {', '.join(choices)}")
    return value


def table(rows: list[list[str]]) -> str:
    """Return rows as left-aligned columns, the first row as a header."""
    widths = [max(len(row[column]) for row in rows) for column in range(len(rows[0]))]
    return "\n".join(
        "  ".join(cell.ljust(width) for cell, width in zip(row, widths, strict=True)).rstrip()
        for row in rows
    )


def device_rows(state: dict, leases: dict[str, Lease], conf_names: dict, now, show_all: bool):
    """Return the device list as table rows, by name."""
    local = now.astimezone()
    cutoff = now - dt.timedelta(days=RECENT_DAYS)
    traffic = open_readonly(TRAFFIC_DB)
    today = usage_totals(traffic, local_midnight(now))
    rows = []
    for mac in set(leases) | set(state["devices"]):
        lease = leases.get(mac)
        record = state["devices"].get(mac, {})
        if not (show_all or (lease and lease.last_seen >= cutoff) or record.get("blocked")):
            continue
        profile_id, profile = profile_for(state, mac)
        used = sum(today.get(mac, (0, 0)))
        rows.append(
            [
                display_name(mac, record, lease, conf_names) or "(unnamed)",
                internet_status(state, mac, local),
                profile["name"] if profile else "-",
                lease.ip if lease else "-",
                mac,
                format_seen(lease.last_seen if lease else None, now),
                format_bytes(used) if used else "-",
            ]
        )
    rows.sort(key=lambda row: (row[0] == "(unnamed)", row[0].lower()))  # unnamed last
    return [["NAME", "INTERNET", "PROFILE", "IP", "MAC", "SEEN", "TODAY"], *rows]


def profile_rows(state: dict, now: dt.datetime) -> list[list[str]]:
    """Return the profiles as table rows: name, state, devices, next change."""
    local = now.astimezone()
    rows = [["PROFILE", "INTERNET", "DEVICES", "NEXT"]]
    for profile in sorted(state["profiles"].values(), key=lambda p: p["name"].lower()):
        reason = profile_block_reason(profile, local)
        rows.append(
            [
                profile["name"],
                reason or "allowed",
                str(len(profile.get("members", []))),
                format_next_change(profile, local) or "-",
            ]
        )
    return rows


def status_text(state: dict, leases: dict[str, Lease], now: dt.datetime, active: bool) -> str:
    """Return the status summary: router, devices online and blocked, today's use, profiles."""
    local = now.astimezone()
    online = [mac for mac, lease in leases.items() if lease.online]
    blocked = [mac for mac in online if internet_status(state, mac, local) != "allowed"]
    traffic = open_readonly(TRAFFIC_DB)
    used = sum(usage_totals(traffic, local_midnight(now)).get(WAN_KEY, (0, 0)))
    lines = [
        f"{APP_NAME} {__version__} · router {'running' if active else 'NOT running'}"
        f" · {local.strftime('%a %H:%M')}",
        f"devices: {len(online)} online, {len(blocked)} of them blocked now",
        f"today: {format_bytes(used)} through the connection",
    ]
    if state["profiles"]:
        lines += ["", table(profile_rows(state, now))]
    return "\n".join(lines)


def dhcp_status(state: dict, now: dt.datetime) -> str:
    """Return dhcpd's state, its pools (how full) and the fixed addresses."""
    service = dhcp.service_state()
    records = current_lease_records()
    held = [
        record
        for record in records.values()
        if record.binding == "active" and (record.ends is None or record.ends > now)
    ]
    lines = [f"{dhcp.DHCP_SERVICE} {service.state} · {len(held)} leases held"]
    settings = state.get("dhcp")
    if not settings:
        lines.append("curfew doesn't manage dhcpd's settings yet (see: curfew dhcp adopt)")
        return "\n".join(lines)
    rows = [["POOL", "RANGE", "FOR", "IN USE"]]
    for pool in settings["pools"]:
        used = sum(dhcp.pool_for(settings, record.ip) is pool for record in held)
        rows.append(
            [
                pool["name"],
                f"{pool['start']} - {pool['end']}",
                dhcp.who_text(pool.get("permits", [])),
                f"{used} of {dhcp.pool_size(pool)}",
            ]
        )
    lines += ["", table(rows)]
    if settings.get("hosts"):
        hosts = [["FIXED", "DEVICE", "MAC"]]
        for mac, host in sorted(settings["hosts"].items(), key=lambda item: item[1]["ip"]):
            name = state["devices"].get(mac, {}).get("name") or host.get("name", "")
            hosts.append([host["ip"], name or "-", mac])
        lines += ["", table(hosts)]
    return "\n".join(lines)


def lease_rows(state, leases, conf_names, now: dt.datetime, show_all: bool):
    """Return dhcpd's leases as table rows, by address."""
    rows = [["IP", "DEVICE", "MAC", "STATE", "ENDS"]]
    records = sorted(
        current_lease_records().values(),
        key=lambda record: tuple(int(part) for part in record.ip.split(".")),
    )
    for record in records:
        held = record.binding == "active" and (record.ends is None or record.ends > now)
        if not (held or show_all):
            continue
        record_state = (
            "active" if held else "expired" if record.binding == "active" else (record.binding)
        )
        name = display_name(
            record.mac, state["devices"].get(record.mac, {}), leases.get(record.mac), conf_names
        )
        ends = record.ends.astimezone().strftime("%a %H:%M") if record.ends else "never"
        rows.append(
            [record.ip, name or record.hostname or "-", record.mac or "-", record_state, ends]
        )
    return rows


def dhcp_adopt(state: dict, apply: bool) -> str:
    """Show (or, with ``apply``, make) the move of dhcpd.conf's non-global settings."""
    if state.get("dhcp"):
        raise CommandError("curfew already manages DHCP (see: curfew dhcp)")
    original = DHCPD_CONF.read_text()
    adoption = dhcp.adopt(original)
    curfew_conf = dhcp.render_conf(adoption.dhcp)
    if not apply:
        return (
            f"Would move to {CURFEW_DHCP_CONF}: {'; '.join(adoption.moved)}.\n\n"
            f"--- {DHCPD_CONF} after (the global settings) ---\n{adoption.conf}\n"
            f"--- {CURFEW_DHCP_CONF} ---\n{curfew_conf}\n"
            "Run again with --apply to make the change. dhcpd -t checks both files first, "
            f"{DHCPD_CONF} is backed up, and if dhcpd won't start, the old file goes back."
        )
    backup = DHCPD_CONF.with_name(f"{DHCPD_CONF.name}.before-curfew")
    if backup.exists():
        backup = backup.with_name(f"{backup.name}-{dt.datetime.now():%Y%m%d-%H%M%S}")
    try:
        backup.write_text(original)
        dhcp.install({DHCPD_CONF: adoption.conf, CURFEW_DHCP_CONF: curfew_conf})
    except PermissionError as error:
        raise CommandError(f"{error.filename}: permission denied (run with sudo)") from None
    change(lambda current: current.__setitem__("dhcp", adoption.dhcp))
    return (
        f"moved to {CURFEW_DHCP_CONF}: {'; '.join(adoption.moved)}\n"
        f"{DHCPD_CONF} keeps the global settings (it was {backup}); dhcpd restarted"
    )


def run_dhcp(args: argparse.Namespace, state: dict, leases, conf_names, now) -> str:
    """Carry out a ``curfew dhcp`` command; return what to print."""
    action = args.dhcp_command or "status"
    if action == "status":
        return dhcp_status(state, now)
    if action == "leases":
        return table(lease_rows(state, leases, conf_names, now, args.all))
    if action == "adopt":
        return dhcp_adopt(state, args.apply)
    if action == "restart":
        problem = dhcp.restart_service()
        if problem:
            raise CommandError(f"dhcpd didn't restart: {problem}")
        return f"restarted {dhcp.DHCP_SERVICE}"
    if not state.get("dhcp"):
        raise CommandError("curfew doesn't manage DHCP yet (see: curfew dhcp adopt)")
    if action == "apply":
        try:
            dhcp.install({CURFEW_DHCP_CONF: dhcp.render_conf(state["dhcp"])})
        except PermissionError as error:
            raise CommandError(f"{error.filename}: permission denied (run with sudo)") from None
        return f"wrote {CURFEW_DHCP_CONF}; dhcpd restarted"
    mac = resolve_device(args.device, state, leases, conf_names)
    name = display_name(mac, state["devices"].get(mac, {}), leases.get(mac), conf_names)
    if action == "fix":
        fields = {"action": "fix", "mac": mac, "ip": args.ip, "name": name}
    else:
        fields = {"action": "unfix", "mac": mac}
    change(lambda current: dhcp.apply_dhcp_action(current, fields))
    return f"{action}: {name or mac}" + (f" at {args.ip}" if action == "fix" else "")


def change(mutate) -> None:
    """Apply a change through the shared, locked path; explain if root is needed."""
    try:
        change_state(mutate)
    except PermissionError as error:
        raise CommandError(f"{error.filename}: permission denied (run with sudo)") from None


def parser() -> argparse.ArgumentParser:
    """Return the argument parser."""
    top = argparse.ArgumentParser(
        prog=APP_NAME,
        description="Block devices from the internet by hand, by profile and on schedules.",
    )
    top.add_argument("--version", action="version", version=f"{APP_NAME} {__version__}")
    commands = top.add_subparsers(dest="command", required=True, metavar="COMMAND")
    commands.add_parser("serve", help="run the web page (HTTPS)")
    commands.add_parser("sync", help="push state to the firewall and Pi-hole; log usage")
    commands.add_parser("firewall", help="push state and leases to the firewall only")
    commands.add_parser("doh", help="block encrypted-DNS resolvers in Pi-hole")
    commands.add_parser("status", help="what's online, blocked and scheduled")
    tv = commands.add_parser("tv-link", help="the TV dashboard's link (read-only, no password)")
    tv.add_argument("--new", action="store_true", help="make a new link; the old one stops")
    listing = commands.add_parser("devices", help="list devices")
    listing.add_argument("--all", action="store_true", help="include long-gone devices")
    commands.add_parser("profiles", help="list profiles")
    for name, text in (
        ("block", "cut a device off"),
        ("unblock", "let a device back on"),
        ("guest", "let a new device on for a day, then forget it"),
        ("forget", "drop a device's record: it's new again"),
        ("wake", "send a wake-on-LAN packet"),
    ):
        commands.add_parser(name, help=text).add_argument("device", help="name, MAC or IP")
    approve = commands.add_parser("approve", help="approve a new device")
    approve.add_argument("device", help="name, MAC or IP")
    approve.add_argument("--name", default="", help="name it while approving")
    rename = commands.add_parser("rename", help="rename a device")
    rename.add_argument("device", help="name, MAC or IP")
    rename.add_argument("name")
    kind = commands.add_parser("type", help="set a device's type")
    kind.add_argument("device", help="name, MAC or IP")
    kind.add_argument(
        "kind", choices=["auto", *sorted(KIND_LABELS)], help="auto: guessed from its name"
    )
    pause = commands.add_parser("pause", help="pause a profile (or all)")
    pause.add_argument("profile", help="profile name, or all")
    pause.add_argument("duration", nargs="?", help=f"one of {', '.join(PAUSE_DURATIONS)}")
    commands.add_parser("resume", help="resume a profile (or all)").add_argument("profile")
    bonus = commands.add_parser("bonus", help="lift a profile's schedule for a while")
    bonus.add_argument("profile")
    bonus.add_argument("duration", help=f"one of {', '.join(BONUS_DURATIONS)}, or end")
    speed = commands.add_parser("speedtest", help="test the internet line's speed")
    speed.add_argument("--weekly", action="store_true", help="wait for the house to be quiet")
    speed.add_argument("--list", action="store_true", help="show every test so far")
    dhcp_parser = commands.add_parser("dhcp", help="the DHCP server: pools, fixed addresses")
    actions = dhcp_parser.add_subparsers(dest="dhcp_command", metavar="ACTION")
    actions.add_parser("status", help="running?, pools and fixed addresses (the default)")
    leases = actions.add_parser("leases", help="the leases held")
    leases.add_argument("--all", action="store_true", help="expired and free ones too")
    adopt = actions.add_parser("adopt", help="move all but the global settings to curfew.conf")
    adopt.add_argument("--apply", action="store_true", help="do it (without: show it)")
    actions.add_parser("apply", help="rewrite curfew.conf from saved settings, restart dhcpd")
    actions.add_parser("restart", help="restart dhcpd")
    fix = actions.add_parser("fix", help="give a device a fixed address")
    fix.add_argument("device", help="name, MAC or IP")
    fix.add_argument("ip")
    actions.add_parser("unfix", help="take a device's fixed address away").add_argument(
        "device", help="name, MAC or IP"
    )
    return top


def run_speedtest(args: argparse.Namespace) -> str:
    """Run a speed test and store it, or (--list) show every test so far."""
    if args.list:
        results = speed_history(open_readonly(TRAFFIC_DB))
        if not results:
            return "no speed tests yet"
        return table(
            [["when", "down", "up", "ping", "server"]]
            + [
                [
                    when(result),
                    mbps(result.down_bps),
                    mbps(result.up_bps),
                    "—" if result.ping_ms is None else f"{result.ping_ms:.0f} ms",
                    result.server,
                ]
                for result in results
            ]
        )
    connection = open_traffic()
    busy = wait_for_quiet(connection) if args.weekly else house_use(connection, int(time.time()))
    mark_testing()
    result = measure(int(time.time()), busy)
    record_speed(connection, result)
    if result.down_bps is None:
        raise CommandError(f"speed test {describe(result)}")
    return describe(result)


def tv_link(new: bool) -> str:
    """Return the TV dashboard's link, making its key first if there's none (or with --new)."""
    from curfew.web.auth import new_tv_key, read_tv_key  # the web stack, only when asked

    key = read_tv_key()
    if new or not key:
        key = new_tv_key()
    return f"https://homehub:{BIND_ADDRESS[1]}/tv?key={key}"


def run(args: argparse.Namespace) -> str:
    """Carry out a parsed command; return what to print."""
    if args.command == "serve":
        from curfew.web.server import serve  # the web stack loads only when serving

        serve()
        return ""
    if args.command == "firewall":
        return "" if sync_firewall() else "router table not loaded; firewall not synced"
    if args.command == "sync":
        return "\n".join(sync_all())
    if args.command == "speedtest":
        return run_speedtest(args)
    if args.command == "tv-link":
        return tv_link(args.new)
    if args.command == "doh":
        count = write_doh_rules(read_domains(DOH_DOMAINS_FILE.read_text()), PIHOLE_DB)
        subprocess.run(["pihole", "reloadlists"], check=True, capture_output=True)
        return f"{count} DoH resolver rules in Pi-hole"

    now = dt.datetime.now(dt.UTC)
    state = load_state()
    leases = current_leases(now)
    conf_names = current_conf_names()
    if args.command == "status":
        return status_text(state, leases, now, router_active())
    if args.command == "devices":
        return table(device_rows(state, leases, conf_names, now, args.all))
    if args.command == "profiles":
        return table(profile_rows(state, now)) if state["profiles"] else "no profiles yet"
    if args.command == "dhcp":
        return run_dhcp(args, state, leases, conf_names, now)
    if args.command == "wake":
        mac = resolve_device(args.device, state, leases, conf_names)
        wake(mac)
        return f"wake: sent to {mac}"
    if args.command in {"block", "unblock", "approve", "rename", "type", "guest", "forget"}:
        mac = resolve_device(args.device, state, leases, conf_names)
        name = getattr(args, "name", "") or ""
        kind = getattr(args, "kind", "").removeprefix("auto")
        change(lambda current: apply_device_action(current, mac, args.command, name, kind))
        shown = display_name(mac, state["devices"].get(mac, {}), leases.get(mac), conf_names)
        return f"{args.command}: {name if args.command == 'rename' else shown or mac}"
    profile_ids = resolve_profiles(args.profile, state)
    if args.command == "pause":
        minutes = duration(args.duration, PAUSE_DURATIONS) if args.duration else ""
        fields = {"action": "pause_for", "minutes": minutes} if minutes else {"action": "pause"}
    elif args.command == "resume":
        fields = {"action": "resume"}
    elif args.duration.lower() == "end":
        fields = {"action": "end_bonus"}
    else:
        fields = {"action": "bonus", "minutes": duration(args.duration, BONUS_DURATIONS)}

    def apply(current: dict) -> None:
        for profile_id in profile_ids:
            apply_profile_action(current, {**fields, "id": profile_id})

    change(apply)
    names = ", ".join(state["profiles"][profile_id]["name"] for profile_id in profile_ids)
    after = load_state()
    upcoming = [
        format_next_change(after["profiles"][profile_id], local_now())
        for profile_id in profile_ids
        if profile_id in after["profiles"]
    ]
    return f"{args.command}: {names}" + (
        f" · {upcoming[0]}" if len(upcoming) == 1 and upcoming[0] else ""
    )


def main(argv: list[str] | None = None) -> int:
    """Run the ``curfew`` command line."""
    args = parser().parse_args(argv)
    try:
        output = run(args)
    except (CommandError, ValueError) as error:  # ValueError: a change refused
        print(f"{APP_NAME}: {error}", file=sys.stderr)
        return 1
    if output:
        print(output)
    return 0
