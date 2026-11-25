"""Device identity: leases, dhcpd.conf names, makers, types, saved state."""

import pytest
from helpers import CONF, KIDS, LEASES, MEMBER, NOW, lease, make_state

from curfew import devices
from curfew import leases as dhcp
from curfew import state as store


def test_parse_leases_keeps_latest_and_hostname() -> None:
    """The newest lease per MAC wins; MACs are lowercased; expired leases are offline."""
    leases = dhcp.parse_leases(LEASES, NOW)
    robot = leases["4c:b9:ea:00:00:04"]
    assert (robot.ip, robot.hostname, robot.online) == ("10.7.1.44", "iRobot-0004", True)
    assert leases["58:e4:88:00:00:03"].online is False


def test_parse_conf_names_only_commented_lines() -> None:
    """Names come from dhcpd.conf comments; uncommented lines are skipped."""
    assert dhcp.parse_conf_names(CONF) == {
        "58:a8:e8:00:00:01": "Upstairs TV",
        "d8:be:65:00:00:02": "Den TV",
    }


def test_display_name_priority() -> None:
    """A typed name beats the dhcpd.conf comment, which beats the DHCP hostname."""
    mac = "aa:bb:cc:dd:ee:ff"
    with_host = lease(mac, name="host")
    assert devices.display_name(mac, {"name": "Typed"}, with_host, {mac: "Conf"}) == "Typed"
    assert devices.display_name(mac, {}, with_host, {mac: "Conf"}) == "Conf"
    assert devices.display_name(mac, {}, with_host, {}) == "host"
    assert devices.display_name(mac, {}, None, {}) == ""


def test_is_private_checks_locally_administered_bit() -> None:
    """The second-lowest bit of the first octet marks a private (random) MAC."""
    assert dhcp.is_private("da:a1:19:00:00:01") and dhcp.is_private("02:42:ac:11:00:02")
    assert not dhcp.is_private("58:a8:e8:00:00:01")


def test_vendor_lookup_prefers_longest_assignment(tmp_path) -> None:
    """The longest registered prefix wins; private and unknown MACs get no maker."""
    (tmp_path / "oui.csv").write_text(
        "Registry,Assignment,Organization Name,Organization Address\n"
        'MA-L,4CB9EA,"iRobot Corporation",x\nMA-L,70B3D5,"IEEE Registration Authority",x\n'
        "MA-L,AC1122,Private,\n"
    )
    (tmp_path / "oui36.csv").write_text(
        "Registry,Assignment,Organization Name,Organization Address\n"
        'MA-S,70B3D5123,"Small Maker, Inc.",x\n'
    )
    vendors = devices.load_vendors(tmp_path)
    assert devices.vendor_for("4c:b9:ea:00:00:04", vendors) == "iRobot Corporation"
    assert devices.vendor_for("70:b3:d5:12:34:56", vendors) == "Small Maker, Inc."
    assert devices.vendor_for("70:b3:d5:99:34:56", vendors) == "IEEE Registration Authority"
    assert devices.maker_text("da:a1:19:00:00:01", vendors) == "none (private address)"
    assert devices.maker_text("00:11:22:33:44:55", vendors) == "unknown"
    assert devices.maker_text("ac:11:22:00:00:01", vendors) == "hidden by the maker"
    assert devices.load_vendors(tmp_path / "missing") == {}


def test_device_kind_guesses_from_name() -> None:
    """Specific words beat general ones; no clue falls back to a generic device."""
    assert devices.device_kind("Sams-iPad", MEMBER) == "tablet"
    assert devices.device_kind("galaxy-tab-s9", MEMBER) == "tablet"
    assert devices.device_kind("galaxy-s24", MEMBER) == "phone"
    assert devices.device_kind("upstairs-tv", MEMBER) == "tv"
    assert devices.device_kind("xbox-series-x", MEMBER) == "console"
    assert devices.device_kind("", "02:00:00:00:00:01") == "device"


def test_a_type_set_by_hand_wins_over_the_guess() -> None:
    """It shows wherever the guess would, until it's set back to automatic."""
    state = make_state({MEMBER: {"name": "Sams-iPad"}})
    devices.apply_device_action(state, MEMBER, "type", kind="computer")
    record = state["devices"][MEMBER]
    assert devices.device_kind("Sams-iPad", MEMBER, record) == "computer"
    assert record["name"] == "Sams-iPad"
    with pytest.raises(ValueError, match="Unknown type"):
        devices.apply_device_action(state, MEMBER, "type", kind="spaceship")
    assert record["kind"] == "computer"
    devices.apply_device_action(state, MEMBER, "type", kind="")
    assert "kind" not in record
    assert devices.device_kind("Sams-iPad", MEMBER, record) == "tablet"


def test_state_round_trip(tmp_path) -> None:
    """State saves and loads unchanged; a missing file gives empty defaults."""
    path = tmp_path / "devices.json"
    state = make_state({"aa:bb:cc:dd:ee:ff": {"blocked": True}}, KIDS, private=True)
    store.save_state(state, path)
    assert store.load_state(path) == state
    empty = store.load_state(tmp_path / "missing.json")
    assert empty["devices"] == {} and empty["profiles"] == {}
