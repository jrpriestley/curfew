"""DHCP: taking dhcpd.conf's settings over, curfew.conf, checks, installing, the page."""

import datetime as dt
import json
import subprocess

import pytest
from helpers import NOW, forms, make_state, text

from curfew import dhcp, leases
from curfew.config import STATE_FILE
from curfew.leases import parse_lease_records
from curfew.state import save_state
from curfew.web import server as web_server

DHCPD_CONF = """\
# homehub's DHCP
authoritative;
server-identifier 10.7.0.1;
default-lease-time 600;
max-lease-time 7200;
option domain-name-servers 10.7.0.1;

class "av" {
  match pick-first-value (option dhcp-client-identifier, hardware);
}
subclass "av" 1:58:a8:e8:00:00:01;  # Upstairs TV
subclass "av" 1:d8:be:65:00:00:02;  # Den TV

subnet 10.7.0.0 netmask 255.255.252.0 {
  option routers 10.7.0.1;
  option subnet-mask 255.255.252.0;
  ping-check true;
  pool {
    deny members of "av";
    range 10.7.1.0 10.7.1.254;
  }
  pool {
    allow members of "av";
    range 10.7.2.10 10.7.2.250;
  }
}

host printer {  # Office printer
  hardware ethernet aa:bb:cc:00:11:22;
  fixed-address 10.7.0.20;
}
"""

TV = "58:a8:e8:00:00:01"
LAPTOP = "aa:bb:cc:dd:ee:01"


def without_ids(settings: dict) -> dict:
    """Return settings with the pools' random ids taken out, to compare two adoptions."""
    pools = [{k: v for k, v in pool.items() if k != "id"} for pool in settings["pools"]]
    return {**settings, "pools": pools}


def managed() -> dict:
    """Return a state whose DHCP settings came from DHCPD_CONF."""
    state = make_state()
    state["dhcp"] = dhcp.adopt(DHCPD_CONF).dhcp
    return state


NO_HAND = dhcp.HandWritten(True, set(), {}, ["option domain-name-servers 10.7.0.1"])


@pytest.fixture
def files(tmp_path, monkeypatch):
    """Point dhcpd.conf and curfew.conf at a temporary /etc/dhcp; return its path."""
    monkeypatch.setattr(dhcp, "DHCPD_CONF", tmp_path / "dhcpd.conf")
    monkeypatch.setattr(dhcp, "CURFEW_DHCP_CONF", tmp_path / "curfew.conf")
    return tmp_path


def fake_commands(monkeypatch, check="", restart="") -> list[list[str]]:
    """Stand in for dhcpd -t and systemctl: ``check`` / ``restart`` are their complaints."""
    calls = []

    def run(command, timeout):
        calls.append(command)
        if "-t" in command:
            return subprocess.CompletedProcess(command, 1 if check else 0, "", check)
        if command[:2] == ["systemctl", "restart"]:
            return subprocess.CompletedProcess(command, 1 if restart else 0, "", restart)
        return None

    monkeypatch.setattr(dhcp, "run", run)
    return calls


def test_adopt_moves_all_but_the_global_settings() -> None:
    """The house subnet, classes and hosts move; globals and comments stay; the include
    takes the first moved block's place."""
    adoption = dhcp.adopt(DHCPD_CONF)
    settings = adoption.dhcp
    assert settings["subnet"] == "10.7.0.0/22" and settings["routers"] == "10.7.0.1"
    assert settings["extra"] == ["ping-check true"]  # kept word for word
    assert [(p["name"], p["start"], p["permits"]) for p in settings["pools"]] == [
        ("default", "10.7.1.0", [["deny", "*"]]),  # every group: av is the only one
        ("av", "10.7.2.10", [["allow", "av"]]),
    ]
    assert settings["classes"]["av"]["members"] == {
        f"1:{TV}": "Upstairs TV",
        "1:d8:be:65:00:00:02": "Den TV",
    }
    printer = settings["hosts"]["aa:bb:cc:00:11:22"]
    assert (printer["ip"], printer["name"], printer["host"]) == (
        "10.7.0.20",
        "Office printer",  # its comment
        "printer",
    )
    conf = adoption.conf
    assert conf.startswith("# homehub's DHCP\nauthoritative;")
    assert "max-lease-time 7200;" in conf and "option domain-name-servers 10.7.0.1;" in conf
    assert "subnet" not in conf and "subclass" not in conf and "host" not in conf
    assert "Upstairs TV" not in conf  # the name went with its line
    assert conf.count(dhcp.include_line()) == 1
    assert conf.index("option domain-name-servers") < conf.index("include")


def test_curfew_conf_reads_back_the_same() -> None:
    """Rendering then adopting again gives the same settings: nothing lost on the way."""
    first = dhcp.adopt(DHCPD_CONF)
    whole = first.conf.replace(dhcp.include_line(), dhcp.render_conf(first.dhcp))
    second = dhcp.adopt(whole).dhcp
    assert without_ids(second) == without_ids(first.dhcp)


def test_adopt_refuses_what_it_cant_carry() -> None:
    """A block curfew can't model stops the move, saying what; so does a second adopt."""
    tangled = DHCPD_CONF.replace("ping-check true;", 'group { filename "x"; }')
    with pytest.raises(ValueError, match="in the subnet: group"):
        dhcp.adopt(tangled)
    with pytest.raises(ValueError, match="already includes"):
        dhcp.adopt(dhcp.adopt(DHCPD_CONF).conf)
    with pytest.raises(ValueError, match="no subnet"):
        dhcp.adopt("authoritative;\n")


@pytest.mark.parametrize(
    ("fields", "complaint"),
    [
        ({"action": "fix", "mac": LAPTOP, "ip": "10.7.1.7"}, "in pool default"),
        ({"action": "fix", "mac": LAPTOP, "ip": "10.7.0.20"}, "already"),
        ({"action": "fix", "mac": LAPTOP, "ip": "10.7.0.1"}, "already homehub's"),
        ({"action": "fix", "mac": LAPTOP, "ip": "192.168.1.5"}, "isn't a device address"),
        ({"action": "fix", "mac": LAPTOP, "ip": "10.7.3.255"}, "isn't a device address"),
        (
            {"action": "add_pool", "name": "x", "start": "10.7.1.200", "end": "10.7.3.10"},
            "shares addresses with pool default",
        ),
        (
            {
                "action": "add_pool",
                "name": "x",
                "start": "10.7.3.1",
                "end": "10.7.3.9",
                "who": "only:printers",
            },
            "no device group called 'printers'",
        ),
        (
            {"action": "options", "routers": "10.7.0.1", "default_lease": "90", "max_lease": "60"},
            "longer",
        ),
        ({"action": "options", "routers": "10.7.9.1"}, "Gateway"),
        ({"action": "options", "routers": ""}, "no global option routers"),
        ({"action": "group", "mac": LAPTOP, "group": "nope"}, "no device group"),
    ],
)
def test_changes_that_cant_work_are_refused(fields, complaint) -> None:
    """Each mistake is caught before dhcpd sees it, in words for the page."""
    with pytest.raises(ValueError, match=complaint):
        dhcp.apply_dhcp_action(managed(), {"who": "all", **fields}, NO_HAND)


def test_an_empty_box_falls_back_to_a_global_option_only_if_there_is_one() -> None:
    """Clearing the gateway is fine once dhcpd.conf sets one; DNS likewise."""
    state = managed()
    hand = dhcp.HandWritten(True, set(), {}, ["option routers 10.7.0.1"])
    with pytest.raises(ValueError, match="no global option domain-name-servers"):
        dhcp.apply_dhcp_action(state, {"action": "options", "routers": ""}, hand)
    hand.settings.append("option domain-name-servers 10.7.0.1")
    dhcp.apply_dhcp_action(state, {"action": "options", "routers": ""}, hand)
    assert "option routers" not in dhcp.render_conf(state["dhcp"])
    assert dhcp.global_option(hand, "routers") == "10.7.0.1"


def test_fixed_addresses_groups_and_pools_change() -> None:
    """Fix and unfix, move between groups (same key form), edit and remove pools."""
    state = managed()
    dhcp.apply_dhcp_action(
        state, {"action": "fix", "mac": LAPTOP, "ip": "10.7.0.30", "name": "Laptop"}, NO_HAND
    )
    assert dhcp.fixed_ip(state, LAPTOP) == "10.7.0.30"
    assert "host curfew-aabbccddee01 {  # Laptop" in dhcp.render_conf(state["dhcp"])
    dhcp.apply_dhcp_action(state, {"action": "unfix", "mac": LAPTOP}, NO_HAND)
    assert dhcp.fixed_ip(state, LAPTOP) == ""

    dhcp.apply_dhcp_action(state, {"action": "group", "mac": LAPTOP, "group": "av"}, NO_HAND)
    assert f"1:{LAPTOP}" in state["dhcp"]["classes"]["av"]["members"]
    assert dhcp.device_group(state, LAPTOP) == "av"
    dhcp.apply_dhcp_action(state, {"action": "group", "mac": TV, "group": ""}, NO_HAND)
    assert dhcp.device_group(state, TV) == ""

    main, tv = state["dhcp"]["pools"]
    dhcp.apply_dhcp_action(
        state,
        {
            "action": "edit_pool",
            "id": main["id"],
            "name": "House",
            "start": "10.7.1.10",
            "end": "10.7.1.200",
            "who": "keep",
        },
        NO_HAND,
    )
    assert (main["name"], main["start"], main["permits"]) == (
        "House",
        "10.7.1.10",
        [["deny", "*"]],
    )
    dhcp.apply_dhcp_action(state, {"action": "remove_pool", "id": tv["id"]}, NO_HAND)
    with pytest.raises(ValueError, match="at least one pool"):
        dhcp.apply_dhcp_action(state, {"action": "remove_pool", "id": main["id"]}, NO_HAND)


def test_install_tests_first_and_puts_back_what_dhcpd_wont_run(files, monkeypatch) -> None:
    """dhcpd -t refusing changes nothing; a failed restart puts the old file back."""
    (files / "dhcpd.conf").write_text(dhcp.adopt(DHCPD_CONF).conf)  # includes files/curfew.conf
    (files / "curfew.conf").write_text("old\n")
    test_copy = str(files / ".curfew-test-part.conf")
    fake_commands(
        monkeypatch,
        check=f"{test_copy} line 3: semicolon expected.\n"
        "Configuration file errors encountered -- exiting\nIf you think you have received...",
    )
    with pytest.raises(ValueError, match=f"{files / 'curfew.conf'} line 3: semicolon expected.$"):
        dhcp.install({files / "curfew.conf": "new\n"})
    assert (files / "curfew.conf").read_text() == "old\n"
    assert not list(files.glob(".curfew-test*"))  # the test copies are cleaned up

    calls = fake_commands(monkeypatch, restart="Job failed")
    with pytest.raises(ValueError, match="old settings are back: Job failed"):
        dhcp.install({files / "curfew.conf": "new\n"})
    assert (files / "curfew.conf").read_text() == "old\n"
    assert sum(call[:2] == ["systemctl", "restart"] for call in calls) == 2

    fake_commands(monkeypatch)
    dhcp.install({files / "curfew.conf": "new\n"})
    assert (files / "curfew.conf").read_text() == "new\n"


def test_push_needs_the_include_and_skips_what_is_already_there(files, monkeypatch) -> None:
    """Settings go live only once dhcpd.conf includes curfew.conf, and only if changed."""
    calls = fake_commands(monkeypatch)
    before = managed()["dhcp"]
    after = managed()["dhcp"]
    after["routers"] = "10.7.0.2"
    (files / "dhcpd.conf").write_text("authoritative;\n")
    with pytest.raises(ValueError, match="doesn't include"):
        dhcp.push_dhcp(before, after)
    (files / "dhcpd.conf").write_text(f'authoritative;\ninclude "{files / "curfew.conf"}";\n')
    dhcp.push_dhcp(before, after)
    assert "option routers 10.7.0.2;" in (files / "curfew.conf").read_text()
    calls.clear()
    dhcp.push_dhcp(None, after)  # already written: nothing to do
    assert calls == []


def test_lease_records_keep_each_address_latest_entry() -> None:
    """Later entries win; "never" ends stay open."""
    records = parse_lease_records(
        """
lease 10.7.1.5 {
  starts 6 2026/11/07 19:00:00;
  ends 6 2026/11/07 19:10:00;
  binding state free;
  hardware ethernet AA:BB:CC:DD:EE:01;
}
lease 10.7.1.5 {
  starts 6 2026/11/07 20:25:00;
  ends never;
  binding state active;
  hardware ethernet aa:bb:cc:dd:ee:02;
  client-hostname "phone";
}
"""
    )
    record = records["10.7.1.5"]
    assert (record.mac, record.binding, record.hostname, record.ends) == (
        "aa:bb:cc:dd:ee:02",
        "active",
        "phone",
        None,
    )
    assert record.starts == dt.datetime(2026, 11, 7, 20, 25, tzinfo=dt.UTC)


@pytest.fixture
def quiet_service(monkeypatch, sandbox):
    """No systemctl or journalctl on the test machine: a running service, a short log."""
    monkeypatch.setattr(
        web_server, "service_state", lambda: dhcp.ServiceState("active", 0, ["DHCPACK on x"])
    )
    (sandbox / "dhcpd.leases").write_text(
        f"lease 10.7.1.9 {{\n  starts 6 2026/11/07 20:00:00;\n  ends 6 2099/11/07 20:10:00;\n"
        "  cltt 6 2026/11/07 20:00:00;\n"
        f"  binding state active;\n  hardware ethernet {LAPTOP};\n}}\n"
    )
    (sandbox / "dhcpd.conf").write_text(
        "option domain-name-servers 10.7.0.1;\ndefault-lease-time 600;\n"
    )
    yield
    STATE_FILE.unlink(missing_ok=True)


def test_dhcp_page_before_and_after_adopting(server, quiet_service) -> None:
    """Unmanaged: leases, service and how to adopt. Managed: pools, options, fixed, groups."""
    app, request = server
    response, body = request("GET", "/dhcp")
    assert response.status == 200
    shown = text(body)
    assert "Running" in shown and "curfew dhcp adopt" in shown and "10.7.1.9" in shown
    assert {form["fields"].get("action") for form in forms(body)} >= {"restart"}

    app.state["dhcp"] = dhcp.adopt(DHCPD_CONF).dhcp
    save_state(app.state)  # pages read the saved state
    _response, body = request("GET", "/dhcp")
    shown = text(body)
    assert "Address pools" in shown and "1 of 255" in shown  # the laptop holds a default address
    assert "Everyone else" in shown and "Only av" in shown
    assert "Device groups" not in shown and "Move a device" not in shown  # folded into pools
    options = body.index('<details class="fold" data-fold="dhcpoptions">')  # starts shut
    assert body.index("<h1>DHCP</h1>") < options < body.index("Address pools")  # at the top
    assert "gateway 10.7.0.1 · DNS 10.7.0.1 · lease 10 min" in text(body)  # its summary
    assert "Upstairs TV" in shown and "10.7.0.20" in shown
    assert {form["fields"].get("action") for form in forms(body)} >= {
        "options",
        "add_pool",
        "edit_pool",
        "remove_pool",
        "fix",
        "unfix",
    }
    _response, body = request("GET", "/network")
    assert "leases held" in text(body) and 'href="/dhcp"' in body


def test_dhcp_posts_change_state_and_say_so(server, quiet_service) -> None:
    """A fixed address from the device page applies, toasts, and refusals explain."""
    app, request = server
    app.state["dhcp"] = dhcp.adopt(DHCPD_CONF).dhcp
    save_state(app.state)
    _response, body = request("GET", f"/device?mac={LAPTOP}")
    assert ("fix", LAPTOP) in {
        (f["fields"].get("action"), f["fields"].get("mac")) for f in forms(body)
    }
    response, _ = request(
        "POST", "/dhcp", f"action=fix&mac={LAPTOP}&ip=10.7.0.31&name=Laptop", referer="/dhcp"
    )
    assert response.status == 303 and response.getheader("Location") == "/dhcp"
    assert dhcp.fixed_ip(app.state, LAPTOP) == "10.7.0.31"
    _response, body = request(
        "GET", "/dhcp", cookie=response.getheader("Set-Cookie").split(";")[0]
    )
    assert "the fixed address 10.7.0.31" in text(body)
    response, body = request("POST", "/dhcp", f"action=fix&mac={LAPTOP}&ip=10.7.1.3")
    assert response.status == 400 and "in pool default" in text(body)


def test_network_pairs_the_dhcp_and_pihole_cards() -> None:
    """Both cards share a row; with Pi-hole away, DHCP stands alone."""

    from curfew.web.pages.network import render_network

    service = dhcp.ServiceState("active", 0, [])
    pihole = {"queries": {"total": 100, "blocked": 10, "status": {"GRAVITY": 10}}}
    body = render_network(
        managed(), {}, {}, NOW, pihole=pihole, lease_records={}, dhcp_service=service
    )
    pair = body[body.index('<div class="duo duo-even">') :]
    assert pair.index('id="dhcp-title"') < pair.index('id="pihole-stats"')
    alone = render_network(managed(), {}, {}, NOW, lease_records={}, dhcp_service=service)
    assert "duo-even" not in alone and 'id="dhcp-title"' in alone


def test_pools_map_to_device_groups() -> None:
    """default (no allow) means no group; the av pool means av; a pool-less group shows too."""
    settings = managed()["dhcp"]
    assert dhcp.pool_choices(settings) == [
        ("", "default (10.7.1.0 – 10.7.1.254)"),
        ("av", "av (10.7.2.10 – 10.7.2.250)"),
    ]
    settings["classes"]["printers"] = {"rules": ["match hardware"], "members": {}}
    assert dhcp.pool_choices(settings)[-1] == ("printers", "Group printers (no pool of its own)")
    assert dhcp.place_name(settings, "av") == "av" and dhcp.place_name(settings, "") == "default"


def test_drop_downs_name_devices_and_offer_pools(server, quiet_service) -> None:
    """The DHCP page lists devices by name and MAC; every device row can change pool."""
    app, request = server
    app.state["dhcp"] = dhcp.adopt(DHCPD_CONF).dhcp
    app.state["devices"][TV] = {"name": "Upstairs TV"}
    save_state(app.state)
    _response, body = request("GET", "/dhcp")
    assert f"Upstairs TV · {TV}" in body and f"device · {LAPTOP}" in body
    move = [f for f in forms(body) if f["fields"].get("action") == "group"]
    assert move and {"mac", "group"} <= set(move[0]["fields"])
    _response, body = request("GET", "/devices?all=1")
    rows = {(f["fields"].get("action"), f["fields"].get("mac")) for f in forms(body)}
    assert ("group", TV) in rows and ("group", LAPTOP) in rows
    assert '<option value="av" selected>' in body  # the TV is in av now
    response, _ = request("POST", "/dhcp", f"action=group&mac={LAPTOP}&group=av", referer="/dhcp")
    assert dhcp.device_group(app.state, LAPTOP) == "av"
    _response, body = request(
        "GET", "/dhcp", cookie=response.getheader("Set-Cookie").split(";")[0]
    )
    assert "to av" in text(body)


def test_pool_rows_open_to_their_forms() -> None:
    """Each pool row opens (▸) to a full-width row holding Change and Remove."""
    from curfew.web.pages.dhcp import pools_panel

    settings = managed()["dhcp"]
    choices = [(LAPTOP, "Laptop · " + LAPTOP), (TV, "TV · " + TV)]
    body = pools_panel(
        settings, {}, dt.datetime(2026, 11, 13, tzinfo=dt.UTC), lambda mac: "", choices
    )
    for pool in settings["pools"]:
        more = f'id="pool-{pool["id"]}" hidden'
        assert f'aria-controls="pool-{pool["id"]}"' in body and more in body
        opened = body[body.index(more) :].split("</tr>")[0]
        assert 'value="edit_pool"' in opened and 'value="remove_pool"' in opened
    av = body[body.index(f'id="pool-{settings["pools"][1]["id"]}"') :].split("</tr>")[0]
    assert f'href="/device?mac={TV}"' in av  # its devices, each with × back to default
    assert 'aria-label="Move' in av and "to default" in av
    assert f'<option value="{LAPTOP}">' in av and f'<option value="{TV}">' not in av  # Add
    default = body[body.index(f'id="pool-{settings["pools"][0]["id"]}"') :].split("</tr>")[0]
    assert "Everyone else." in default and "Add" not in default


def test_everyone_not_in_a_group_keeps_new_groups_out() -> None:
    """The default pool denies every group, by name, including one added later."""
    settings = managed()["dhcp"]
    assert '    deny members of "av";' in dhcp.render_conf(settings)
    settings["classes"]["printers"] = {"rules": ["match hardware"], "members": {}}
    conf = dhcp.render_conf(settings)
    default = conf[conf.index("# default") : conf.index("# av")]
    assert 'deny members of "av";' in default and 'deny members of "printers";' in default
    state = managed()
    pool = state["dhcp"]["pools"][1]
    fields = {"action": "edit_pool", "id": pool["id"], "name": "av", "who": "rest"}
    dhcp.apply_dhcp_action(state, {**fields, "start": pool["start"], "end": pool["end"]}, NO_HAND)
    assert dhcp.who_text(pool["permits"]) == "Everyone else"


def test_fixed_address_devices_are_placed_from_the_neighbour_table() -> None:
    """dhcpd keeps no lease for a fixed address: the device is shown there, online
    while homehub has heard from it lately, else last seen then or at its old lease."""
    hosts = leases.parse_fixed_hosts(
        dhcp.render_conf(managed()["dhcp"])
        + "host printer {\n  hardware ethernet AA:BB:CC:00:11:22;\n  fixed-address 10.7.0.20;\n}\n"
    )
    assert hosts == {"aa:bb:cc:00:11:22": "10.7.0.20"}
    eero, hue, gone = "f0:21:e0:00:00:05", "00:17:88:47:08:39", "a8:bb:cc:dd:ee:09"
    neighbours = leases.parse_neighbours(
        json.dumps(
            [
                {"dst": "10.7.0.11", "lladdr": eero, "confirmed": 27, "state": ["REACHABLE"]},
                {"dst": "10.7.0.20", "lladdr": hue, "confirmed": 1200, "state": ["STALE"]},
                {"dst": "10.7.0.30", "state": ["FAILED"]},
            ]
        )
    )
    assert neighbours == {"10.7.0.11": (eero, 27), "10.7.0.20": (hue, 1200)}
    old = NOW - dt.timedelta(hours=2)
    found = {
        eero: leases.Lease(eero, "10.7.1.9", "eero", old, False),
        gone: leases.Lease(gone, "10.7.1.40", "old-laptop", old, False),
    }
    fixed = {eero: "10.7.0.11", hue: "10.7.0.20", gone: "10.7.0.30", LAPTOP: "10.7.0.31"}
    leases.add_fixed(found, fixed, neighbours, NOW)
    heard = NOW - dt.timedelta(seconds=27)
    assert found[eero] == leases.Lease(eero, "10.7.0.11", "eero", heard, True)
    assert found[hue].ip == "10.7.0.20" and not found[hue].online  # heard from 20 min ago
    assert found[gone] == leases.Lease(gone, "10.7.0.30", "old-laptop", old, False)
    assert LAPTOP not in found  # never seen: nothing to show
