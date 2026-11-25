"""The nftables side: block, allow, approve and lease sets, and the rules that use them."""

import datetime as dt
import subprocess
from collections.abc import Iterable

from curfew.config import NFT_TABLE
from curfew.dhcp import read_hand_written
from curfew.leases import Lease, current_leases, ip_owners, is_router
from curfew.policy import effective_blocked, internet_status
from curfew.schedules import local_now
from curfew.state import macs_with


def fixed_owners(state: dict) -> dict[str, str]:
    """Return curfew's fixed addresses, IP -> MAC. dhcpd keeps no lease for these."""
    hosts = state.get("dhcp", {}).get("hosts", {})
    return {host["ip"]: mac for mac, host in hosts.items() if host.get("ip")}


def leased_ips(
    leases: dict[str, Lease], state: dict | None = None, hand_fixed: Iterable[str] = ()
) -> list[str]:
    """Return the addresses homehub hands out: current leases, and the fixed addresses
    (curfew's, and any written in dhcpd.conf), which never appear in the lease file."""
    ips = {lease.ip for mac, lease in leases.items() if lease.online and not is_router(mac)}
    return sorted(ips | set(fixed_owners(state or {})) | set(hand_fixed))


def blocked_ips(state: dict, leases: dict[str, Lease], now: dt.datetime) -> list[str]:
    """Return the addresses of devices without internet, whatever the reason.

    A device behind a bridge that rewrites MACs (a TV sharing its Wi-Fi) still
    asks for its address under its own MAC, so its lease says which address to
    stop. An address counts for whoever holds its newest lease, so a recycled
    address follows its new owner; a fixed address, for the device it's fixed for.
    """
    owners = fixed_owners(state) | ip_owners(
        {mac: lease for mac, lease in leases.items() if not is_router(mac)}
    )
    return sorted(
        ip for ip, mac in owners.items() if internet_status(state, mac, now) != "allowed"
    )


def nft_script(
    state: dict, now: dt.datetime, leases: dict[str, Lease], hand_fixed: Iterable[str] = ()
) -> str:
    """Return one nft transaction that rewrites the sets and the curfew-filled chains.

    ``hand_fixed``: fixed addresses written in dhcpd.conf, handed out like the rest.
    """
    lines = []
    known = macs_with(state["devices"], "known")
    leased = leased_ips(leases, state, hand_fixed)
    sets = (
        ("blocked_macs", effective_blocked(state, now)),
        ("allowed_macs", macs_with(state["devices"], "allowed")),
        ("known_macs", known),
        ("blocked_ips", blocked_ips(state, leases, now)),
        ("leased_ips", leased),
    )
    for set_name, macs in sets:
        lines.append(f"flush set {NFT_TABLE} {set_name}")
        if macs:
            lines.append(f"add element {NFT_TABLE} {set_name} {{ {', '.join(macs)} }}")
    lines.append(f"flush chain {NFT_TABLE} unknown_macs")
    # Never with an empty allowlist: that would cut every device off.
    if state["settings"].get("block_unknown") and known:
        lines.append(f"add rule {NFT_TABLE} unknown_macs ether saddr != @known_macs drop")
    lines.append(f"flush chain {NFT_TABLE} private_macs")
    if state["settings"].get("block_private"):
        lines.append(f"add rule {NFT_TABLE} private_macs ether saddr @allowed_macs return")
        lines.append(
            f"add rule {NFT_TABLE} private_macs "
            "ether saddr & 02:00:00:00:00:00 == 02:00:00:00:00:00 drop"
        )
    lines.append(f"flush chain {NFT_TABLE} lease_check")
    # Never with no leases read: that would cut every device off.
    if state["settings"].get("require_dhcp") and leased:
        lines.append(f"add rule {NFT_TABLE} lease_check ip saddr != @leased_ips counter drop")
    return "\n".join(lines) + "\n"


def router_active() -> bool:
    """Return True when the router's nftables table is loaded (False without nft at all)."""
    # -t (terse) leaves out set elements, which include a counter per LAN IP.
    try:
        result = subprocess.run(
            ["nft", "-t", "list", "table", *NFT_TABLE.split()], capture_output=True
        )
    except FileNotFoundError:
        return False
    return result.returncode == 0


def sync_nft(
    state: dict, now: dt.datetime | None = None, leases: dict[str, Lease] | None = None
) -> bool:
    """Load state and the current leases into nftables; return False if the router is off."""
    if not router_active():
        return False
    if leases is None:
        leases = current_leases(dt.datetime.now(dt.UTC))
    script = nft_script(state, now or local_now(), leases, read_hand_written().fixed)
    subprocess.run(["nft", "-f", "-"], input=script.encode(), check=True)
    return True
