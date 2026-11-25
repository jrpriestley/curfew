"""Changing state safely, and pushing it out to nftables, Pi-hole and the usage log."""

import copy
import datetime as dt
import fcntl
import sqlite3
import sys
from collections.abc import Callable

from curfew.config import LOCK_FILE
from curfew.devices import expired_guests, forget_expired_guests
from curfew.dhcp import push_dhcp
from curfew.diagnose import sample_quality
from curfew.firewall import sync_nft
from curfew.leases import current_leases
from curfew.pihole import sync_pihole
from curfew.state import load_state, save_state
from curfew.traffic import open_traffic, sync_traffic


def change_state[Result](mutate: Callable[[dict], Result]) -> Result:
    """Apply ``mutate(state)`` under a file lock, save, push it out, and return its result.

    The web page and the command line both change state through here, so
    their changes never overwrite each other. Pi-hole is pushed too; if that
    fails the change still stands and the next minute's sync retries it.
    A DHCP change is different: if dhcpd won't take it, it raises ValueError
    and nothing is saved.
    """
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_FILE, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = load_state()
        dhcp_before = copy.deepcopy(state.get("dhcp"))
        result = mutate(state)
        push_dhcp(dhcp_before, state.get("dhcp"))
        save_state(state)
        sync_nft(state)
        try:
            sync_pihole(state, current_leases(dt.datetime.now(dt.UTC)))
        except (sqlite3.Error, OSError) as error:
            print(f"pihole sync failed: {error}", file=sys.stderr)
    return result


def sync_firewall() -> bool:
    """Push saved state and the current leases into nftables, and nothing else.

    Run by curfew-leases.path each time dhcpd writes a lease, so a new address
    is let through (or a blocked device's new address stopped) within a second.
    Under the state lock, so it never pushes a state older than a change's.
    """
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_FILE, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return sync_nft(load_state())


def sync_all() -> list[str]:
    """Push saved state everywhere and take a usage sample; return what happened."""
    now = dt.datetime.now(dt.UTC)
    report = []
    if expired_guests(load_state(), now):
        gone = change_state(lambda state: forget_expired_guests(state, now))
        report.append(f"forgot {len(gone)} guest device(s)")
    state = load_state()
    leases = current_leases(now)
    if sync_nft(state, leases=leases):
        report.append("firewall synced")
        sync_traffic(leases, now)
        connection = open_traffic()
        try:
            sample_quality(connection, now)  # about a second: two pings in parallel
        finally:
            connection.close()
    else:
        report.append("router table not loaded; firewall not synced")
    if sync_pihole(state, leases, now):
        report.append("pihole updated")
    return report
