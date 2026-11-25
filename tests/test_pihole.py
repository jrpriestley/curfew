"""Pi-hole: profile site rules, encrypted-DNS rules, groups, scoreboard."""

import datetime as dt
import re
import sqlite3

from helpers import KIDS, MEMBER, NOW, groups_of_rule, lease, make_state, text

from curfew import pihole
from curfew.web.pages import network as network_page


def test_write_pihole_scopes_rules_to_the_profile(gravity) -> None:
    """A profile's sites reach only its group; subnet groups are kept; rewrites are clean."""
    plan = {"abcd1234": {"name": "Kids", "ips": ["10.7.1.5", "10.7.2.7"], "sites": ["tiktok.com"]}}
    pihole.write_pihole(plan, gravity)
    pihole.write_pihole(plan, gravity)  # idempotent
    connection = sqlite3.connect(gravity)
    group_id = connection.execute(
        'SELECT id FROM "group" WHERE name = ?', (pihole.CURFEW_GROUP_PREFIX + "abcd1234",)
    ).fetchone()[0]
    regex = pihole.site_regex("tiktok.com")
    assert groups_of_rule(connection, regex) == {group_id}  # not Default: nobody else
    av_client = connection.execute("SELECT id FROM client WHERE ip = '10.7.2.7'").fetchone()[0]
    client_groups = {
        row[0]
        for row in connection.execute(
            "SELECT group_id FROM client_by_group WHERE client_id = ?", (av_client,)
        )
    }
    assert client_groups == {0, 2, group_id}  # still in the TV pool's group too
    connection.close()
    pihole.write_pihole({}, gravity)
    connection = sqlite3.connect(gravity)
    assert connection.execute("SELECT count(*) FROM domainlist").fetchone() == (0,)
    assert connection.execute("SELECT ip FROM client").fetchall() == [("10.7.2.0/24",)]
    connection.close()


def test_site_regex_matches_domain_and_subdomains_only() -> None:
    """The Pi-hole regex matches a site and its subdomains, nothing that merely ends alike."""
    pattern = re.compile(pihole.site_regex("youtu.be"))
    assert pattern.search("youtu.be") and pattern.search("www.youtu.be")
    assert not pattern.search("notyoutu.be") and not pattern.search("youtu.be.evil.com")


def test_pihole_plan_uses_recent_member_ips() -> None:
    """Only profiles with sites and members holding a recent lease are planned."""
    state = make_state(profiles=KIDS)
    member = lease(MEMBER, "10.7.1.5")
    assert pihole.pihole_plan(state, {MEMBER: member}, NOW) == {}
    state["profiles"]["abcd1234"]["sites"] = ["roblox.com"]
    plan = pihole.pihole_plan(state, {MEMBER: member}, NOW)
    assert plan["abcd1234"]["ips"] == ["10.7.1.5"]
    assert plan["abcd1234"]["sites"] == ["roblox.com"]
    stale = lease(MEMBER, "10.7.1.5", when=NOW - dt.timedelta(days=90), online=False)
    assert pihole.pihole_plan(state, {MEMBER: stale}, NOW) == {}


def test_doh_rules_cover_every_group_but_curfews(gravity) -> None:
    """Encrypted-DNS rules reach Default and AV, skip curfew groups, and leave others' rules."""
    connection = sqlite3.connect(gravity)
    connection.execute("INSERT INTO \"group\" (id, name) VALUES (7, 'curfew-abcd1234')")
    connection.execute(
        "INSERT INTO domainlist (type, domain, comment) VALUES (3, ?, 'mine')",
        (pihole.site_regex("dns.google"),),
    )
    connection.commit()
    connection.close()
    domains = pihole.read_domains("# list\ndns.google\n\nDNS.Google  # dup\ncloudflare-dns.com\n")
    assert domains == ["dns.google", "cloudflare-dns.com"]
    assert pihole.write_doh_rules(domains, gravity) == 1
    assert pihole.write_doh_rules(domains, gravity) == 1  # idempotent
    connection = sqlite3.connect(gravity)
    assert groups_of_rule(connection, pihole.site_regex("cloudflare-dns.com")) == {0, 2}
    assert connection.execute(
        "SELECT comment FROM domainlist WHERE domain = ?", (pihole.site_regex("dns.google"),)
    ).fetchone() == ("mine",)
    connection.close()


def test_pihole_groups_are_read_with_readable_rules(gravity) -> None:
    """Pi-hole's own groups are listed with readable rules; curfew's own rows are left out."""
    connection = sqlite3.connect(gravity)
    connection.execute("INSERT INTO adlist (id, address) VALUES (1, 'https://lists.example/a')")
    connection.execute("INSERT INTO adlist_by_group VALUES (1, 0)")
    rule = connection.execute(
        "INSERT INTO domainlist (type, domain) VALUES (3, ?)", (r"(\.|^)ytimg\.com$",)
    ).lastrowid
    connection.execute("DELETE FROM domainlist_by_group WHERE domainlist_id = ?", (rule,))
    connection.execute("INSERT INTO domainlist_by_group VALUES (?, 2)", (rule,))
    connection.execute(
        "INSERT INTO domainlist (type, domain, comment) VALUES (3, 'x', ?)", (pihole.DOH_MARK,)
    )
    connection.execute("INSERT INTO \"group\" (id, name) VALUES (7, 'curfew-abcd1234')")
    connection.commit()
    connection.close()
    groups = {group["name"]: group for group in pihole.read_pihole_groups(gravity)}
    assert set(groups) == {"Default", "AV"}
    assert groups["AV"]["rules"] == [("ytimg.com", "block")]
    assert groups["Default"]["doh"] == 1 and len(groups["Default"]["lists"]) == 1
    shown = text(network_page.render_pihole_groups(list(groups.values())))
    assert "ytimg.com" in shown and "10.7.2.0/24" in shown
    assert pihole.read_pihole_groups(gravity.parent / "missing.db") is None


def test_readable_rule() -> None:
    """Subdomain regexes read as domains (\\w+ as *); anything else is left as written."""
    assert pihole.readable_rule(r"(\.|^)youtube\.com$") == "youtube.com"
    assert pihole.readable_rule(r"(\.|^)youtube\.\w+$") == "youtube.*"
    assert pihole.readable_rule(r"^ad[0-9]+\.") == r"^ad[0-9]+\."


def test_pihole_scoreboard() -> None:
    """The scoreboard reads the blocked share and each outcome's count; no data, no panel."""
    summary = {
        "queries": {
            "total": 1000,
            "blocked": 340,
            "status": {"GRAVITY": 300, "REGEX": 10, "SPECIAL_DOMAIN": 30, "CACHE": 500},
        },
        "gravity": {"domains_being_blocked": 303743},
    }
    shown = text(network_page.render_pihole_panel(summary))
    assert "340 of 1,000" in shown and "34%" in shown and "303,743" in shown
    assert "300" in shown and "500" in shown
    assert network_page.render_pihole_panel(None) == ""
    assert network_page.render_pihole_panel({"queries": {"total": 0}}) == ""


def test_the_block_rate_is_the_last_ten_minutes_that_are_over() -> None:
    """Blocks a second from the latest finished bucket; none before there's one."""
    from curfew.pihole import block_rate_from  # noqa: PLC0415

    history = [
        {"timestamp": 1000, "blocked": 600},
        {"timestamp": 1600, "blocked": 300},
        {"timestamp": 2200, "blocked": 5},  # still filling
    ]
    assert block_rate_from(history, 2300) == 0.5
    assert block_rate_from(history[-1:], 2300) == 0.0
