"""The curfew command, end to end against the sandboxed settings (see conftest)."""

import pytest
from helpers import KIDS, MEMBER, make_state

from curfew import cli
from curfew.state import load_state, save_state

LEASE = """
lease {ip} {{
  starts 6 2099/11/07 20:00:00;
  ends 6 2099/11/07 23:00:00;
  cltt 6 2099/11/07 20:00:00;
  binding state active;
  hardware ethernet {mac};
  client-hostname "{name}";
}}
"""


@pytest.fixture
def house(sandbox):
    """Three devices on the network and a Kids profile, in the sandbox."""
    devices = [
        ("10.7.1.5", MEMBER, "sams-ipad"),
        ("10.7.1.6", "a8:bb:cc:dd:ee:02", "living-room-tv"),
        ("10.7.1.7", "a8:bb:cc:dd:ee:03", "kitchen-tv"),
    ]
    (sandbox / "dhcpd.leases").write_text(
        "".join(LEASE.format(ip=ip, mac=mac, name=name) for ip, mac, name in devices)
    )
    (sandbox / "dhcpd.conf").write_text("")
    save_state(make_state(profiles=KIDS))
    yield
    save_state(make_state())


def run(capsys, *argv: str) -> tuple[int, str]:
    """Run the command line; return its exit status and everything it printed."""
    status = cli.main(list(argv))
    captured = capsys.readouterr()
    return status, captured.out + captured.err


def test_status_and_listings(house, capsys) -> None:
    """Status, devices and profiles report what's on the network."""
    status, output = run(capsys, "status")
    assert status == 0 and "3 online" in output and "Kids" in output
    status, output = run(capsys, "devices")
    assert status == 0 and "living-room-tv" in output and "10.7.1.6" in output
    status, output = run(capsys, "profiles")
    assert status == 0 and "Kids" in output


def test_block_by_name_ip_or_mac(house, capsys) -> None:
    """A device can be named by its name, IP or MAC; blocking and unblocking stick."""
    assert run(capsys, "block", "living-room-tv")[0] == 0
    assert load_state()["devices"]["a8:bb:cc:dd:ee:02"]["blocked"] is True
    assert run(capsys, "unblock", "10.7.1.6")[0] == 0
    assert load_state()["devices"]["a8:bb:cc:dd:ee:02"]["blocked"] is False
    assert run(capsys, "rename", "a8:bb:cc:dd:ee:03", "Kitchen TV")[0] == 0
    assert run(capsys, "type", "Kitchen TV", "computer")[0] == 0
    assert load_state()["devices"]["a8:bb:cc:dd:ee:03"]["name"] == "Kitchen TV"


def test_ambiguous_or_unknown_devices_are_refused(house, capsys) -> None:
    """A name matching several devices, or none, changes nothing and says why."""
    status, output = run(capsys, "block", "tv")
    assert status == 1 and "several" in output and "kitchen-tv" in output
    status, output = run(capsys, "block", "toaster")
    assert status == 1 and "no device" in output
    assert not any(record.get("blocked") for record in load_state()["devices"].values())


def test_pause_resume_and_bonus(house, capsys) -> None:
    """Profiles pause for a spoken duration or until resumed; bad durations are refused."""
    assert run(capsys, "pause", "kids", "1h")[0] == 0
    assert load_state()["profiles"]["abcd1234"].get("pause_until")
    assert run(capsys, "resume", "all")[0] == 0
    assert not load_state()["profiles"]["abcd1234"].get("pause_until")
    assert run(capsys, "pause", "Kids")[0] == 0
    assert load_state()["profiles"]["abcd1234"]["paused"] is True
    status, output = run(capsys, "pause", "kids", "3 weeks")
    assert status == 1 and "isn't one of" in output
    status, output = run(capsys, "pause", "nobody")
    assert status == 1 and "no profile" in output
