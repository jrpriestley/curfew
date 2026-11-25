"""The nftables script: sets and rules follow the state."""

import datetime as dt

from helpers import FRI_2230, KIDS, MEMBER, NOW, SAT_0730, lease, make_state, nft_sets

from curfew import firewall


def test_nft_script_fills_sets_and_rules() -> None:
    """Blocked, allowed and known MACs land in their sets; rules follow the settings."""
    devices = {
        "aa:bb:cc:dd:ee:ff": {"blocked": True},
        "da:00:00:00:00:01": {"allowed": True, "known": True},
    }
    state = make_state(devices, KIDS, private=True)
    script = firewall.nft_script(state, FRI_2230, {})  # Kids' curfew is on
    sets = nft_sets(script)
    assert sets["blocked_macs"] == {"aa:bb:cc:dd:ee:ff", MEMBER}
    assert sets["allowed_macs"] == {"da:00:00:00:00:01"}
    assert "private_macs" in script and "drop" in script.split("private_macs")[-1]
    state["settings"]["block_unknown"] = True
    assert "!= @known_macs" in firewall.nft_script(state, FRI_2230, {})
    # Never block everyone: with no approved devices the allowlist rule is left out.
    nobody = make_state()
    nobody["settings"]["block_unknown"] = True
    assert "!= @known_macs" not in firewall.nft_script(nobody, FRI_2230, {})
    off = firewall.nft_script(make_state(), SAT_0730, {})
    assert all(not members for members in nft_sets(off).values())
    assert "ether saddr & 02:00:00:00:00:00" not in off


def test_addresses_follow_leases_for_blocks_and_the_dhcp_rule() -> None:
    """A device without internet is stopped by its leased address too (for one behind a
    MAC-rewriting bridge); a recycled address follows its newest holder; only current
    leases count as handed out; and the DHCP rule needs the switch and at least one lease."""
    blocked, allowed, gone = "a8:bb:cc:dd:ee:01", "a8:bb:cc:dd:ee:02", "a8:bb:cc:dd:ee:03"
    earlier = NOW - dt.timedelta(hours=3)
    leases = {
        blocked: lease(blocked, "10.7.1.20"),
        allowed: lease(allowed, "10.7.1.21"),
        # An old blocked device whose address has since gone to `allowed`.
        gone: lease(gone, "10.7.1.21", online=False, when=earlier),
    }
    state = make_state({blocked: {"blocked": True}, gone: {"blocked": True}})
    sets = nft_sets(firewall.nft_script(state, FRI_2230, leases))
    assert sets["blocked_ips"] == {"10.7.1.20"}
    assert sets["leased_ips"] == {"10.7.1.20", "10.7.1.21"}
    assert "!= @leased_ips" not in firewall.nft_script(state, FRI_2230, leases)
    state["settings"]["require_dhcp"] = True
    assert "lease_check ip saddr != @leased_ips counter drop" in firewall.nft_script(
        state, FRI_2230, leases
    )
    # Never cut everyone off: with no leases read, the rule is left out.
    assert "!= @leased_ips" not in firewall.nft_script(state, FRI_2230, {})


def test_fixed_addresses_count_as_handed_out() -> None:
    """dhcpd keeps no lease for a fixed address, so it's added: else, with addresses
    required from homehub, a reserved device (an eero) loses the internet."""
    eero, kid = "f0:21:e0:00:00:05", "a8:bb:cc:dd:ee:01"
    state = make_state({kid: {"blocked": True}})
    state["dhcp"] = {"hosts": {eero: {"ip": "10.7.0.2"}, kid: {"ip": "10.7.0.30"}}}
    state["settings"]["require_dhcp"] = True
    other = "a8:bb:cc:dd:ee:02"
    script = firewall.nft_script(state, FRI_2230, {other: lease(other, "10.7.1.21")}, ["10.7.0.9"])
    sets = nft_sets(script)
    assert sets["leased_ips"] == {"10.7.0.2", "10.7.0.30", "10.7.0.9", "10.7.1.21"}
    assert sets["blocked_ips"] == {"10.7.0.30"}  # a blocked device's fixed address too
