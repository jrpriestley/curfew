"""The Pi-hole side: profile site blocks, encrypted-DNS rules, groups and stats."""

import datetime as dt
import ipaddress
import json
import re
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

from curfew.cache import Recent
from curfew.config import (
    PIHOLE_API,
    PIHOLE_CLI_PASSWORD,
    PIHOLE_DB,
    PIHOLE_STAMP,
    RECENT_DAYS,
    REFRESH_PIHOLE,
)
from curfew.leases import Lease
from curfew.state import open_readonly

PIHOLE_MARK = "curfew"  # comment on the client and domain rows curfew owns


DOH_MARK = "curfew-doh"  # comment on the encrypted-DNS rules (see doh-domains.txt)


CURFEW_GROUP_PREFIX = "curfew-"  # Pi-hole groups curfew owns, one per profile


PIHOLE_REGEX_DENY = 3  # domainlist.type


def site_regex(site: str) -> str:
    """Return the Pi-hole regex matching a domain and all its subdomains."""
    return r"(\.|^)" + site.replace(".", r"\.") + "$"


def pihole_plan(state: dict, leases: dict[str, Lease], now: dt.datetime) -> dict:
    """Return what Pi-hole should hold: per profile with sites, its member IPs and sites.

    Members are matched by their current DHCP address: Pi-hole tries exact
    IPs before subnets, so this also wins over subnet clients such as the
    TV/iPad pool. Devices without a recent lease are left out until they
    get one.
    """
    cutoff = now - dt.timedelta(days=RECENT_DAYS)
    plan = {}
    for profile_id, profile in sorted(state["profiles"].items()):
        ips = sorted(
            {
                leases[mac].ip
                for mac in profile.get("members", [])
                if mac in leases and leases[mac].last_seen >= cutoff
            }
        )
        if profile.get("sites") and ips:
            plan[profile_id] = {
                "name": profile["name"],
                "ips": ips,
                "sites": sorted(profile["sites"]),
            }
    return plan


def subnet_groups(connection: sqlite3.Connection, ip: str) -> set[int]:
    """Return the groups of every subnet client (e.g. ``10.7.2.0/24``) containing ``ip``."""
    groups: set[int] = set()
    address = ipaddress.ip_address(ip)
    for client_id, network in connection.execute(
        "SELECT id, ip FROM client WHERE ip LIKE '%/%'"
    ).fetchall():
        try:
            inside = address in ipaddress.ip_network(network, strict=False)
        except ValueError:
            continue
        if inside:
            groups.update(
                row[0]
                for row in connection.execute(
                    "SELECT group_id FROM client_by_group WHERE client_id = ?", (client_id,)
                )
            )
    return groups


def ensure_regex_rule(connection: sqlite3.Connection, regex: str, mark: str) -> tuple[int, bool]:
    """Return (id, created) of the regex deny rule for ``regex``, adding it if missing.

    A new rule is commented ``mark`` and unlinked from Default, which Pi-hole's
    insert trigger adds (it would otherwise apply to everyone); an existing
    rule (perhaps someone else's) is returned untouched.
    """
    row = connection.execute(
        "SELECT id FROM domainlist WHERE domain = ? AND type = ?", (regex, PIHOLE_REGEX_DENY)
    ).fetchone()
    if row:
        return row[0], False
    rule_id = connection.execute(
        "INSERT INTO domainlist (type, domain, comment) VALUES (?, ?, ?)",
        (PIHOLE_REGEX_DENY, regex, mark),
    ).lastrowid
    connection.execute(
        "DELETE FROM domainlist_by_group WHERE domainlist_id = ? AND group_id = 0", (rule_id,)
    )
    return rule_id, True


def link_rule(connection: sqlite3.Connection, rule_id: int, group_id: int) -> None:
    """Apply a domain rule to a group."""
    connection.execute(
        "INSERT OR IGNORE INTO domainlist_by_group VALUES (?, ?)", (rule_id, group_id)
    )


def write_pihole(plan: dict, db_path: Path) -> None:
    """Replace curfew's groups, clients and regex rules in gravity.db with ``plan``.

    Only rows curfew created (``curfew-`` groups, rows commented ``curfew``)
    are removed; existing Pi-hole clients and rules are only linked to.
    """
    connection = sqlite3.connect(db_path, timeout=10)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            connection.execute(
                'DELETE FROM "group" WHERE name LIKE ?', (CURFEW_GROUP_PREFIX + "%",)
            )
            connection.execute("DELETE FROM client WHERE comment = ?", (PIHOLE_MARK,))
            connection.execute(
                "DELETE FROM domainlist WHERE comment = ? AND id NOT IN "
                "(SELECT domainlist_id FROM domainlist_by_group)",
                (PIHOLE_MARK,),
            )
            for profile_id, item in plan.items():
                group_id = connection.execute(
                    'INSERT INTO "group" (name, description) VALUES (?, ?)',
                    (CURFEW_GROUP_PREFIX + profile_id, f"curfew profile: {item['name']}"),
                ).lastrowid
                for ip in item["ips"]:
                    row = connection.execute(
                        "SELECT id FROM client WHERE ip = ?", (ip,)
                    ).fetchone()
                    if row:
                        client_id = row[0]
                    else:
                        # The insert trigger adds Default; keep any subnet groups too.
                        client_id = connection.execute(
                            "INSERT INTO client (ip, comment) VALUES (?, ?)", (ip, PIHOLE_MARK)
                        ).lastrowid
                        for extra in subnet_groups(connection, ip):
                            connection.execute(
                                "INSERT OR IGNORE INTO client_by_group VALUES (?, ?)",
                                (client_id, extra),
                            )
                    connection.execute(
                        "INSERT OR IGNORE INTO client_by_group VALUES (?, ?)",
                        (client_id, group_id),
                    )
                for site in item["sites"]:
                    rule_id, _created = ensure_regex_rule(
                        connection, site_regex(site), PIHOLE_MARK
                    )
                    link_rule(connection, rule_id, group_id)
    finally:
        connection.close()


def read_domains(text: str) -> list[str]:
    """Return the domains in a list file, skipping blanks and # comments."""
    domains = []
    for line in text.splitlines():
        domain = line.split("#", 1)[0].strip().lower()
        if domain and domain not in domains:
            domains.append(domain)
    return domains


def write_doh_rules(domains: list[str], db_path: Path) -> int:
    """Replace the encrypted-DNS rules with ``domains`` across Pi-hole's groups.

    Each domain gets a regex deny rule commented DOH_MARK, applied to every
    group except curfew's own (their members are in Default too). A domain
    someone already blocks keeps their rule. Returns how many rules are ours.
    """
    connection = sqlite3.connect(db_path, timeout=10)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            connection.execute("DELETE FROM domainlist WHERE comment = ?", (DOH_MARK,))
            groups = [
                row[0]
                for row in connection.execute(
                    'SELECT id FROM "group" WHERE name NOT LIKE ?', (CURFEW_GROUP_PREFIX + "%",)
                )
            ]
            for domain in domains:
                rule_id, created = ensure_regex_rule(connection, site_regex(domain), DOH_MARK)
                if created:
                    for group_id in groups:
                        link_rule(connection, rule_id, group_id)
        return connection.execute(
            "SELECT count(*) FROM domainlist WHERE comment = ?", (DOH_MARK,)
        ).fetchone()[0]
    finally:
        connection.close()


def sync_pihole(
    state: dict,
    leases: dict[str, Lease],
    now: dt.datetime | None = None,
    db_path: Path = PIHOLE_DB,
    stamp: Path = PIHOLE_STAMP,
) -> bool:
    """Push profile site blocks into Pi-hole if they changed; return True if written.

    The last plan written is kept in ``stamp`` so the every-minute sync only
    touches gravity.db (and reloads Pi-hole) when something changed, such as
    a member getting a new IP.
    """
    if not db_path.exists():
        return False
    plan = pihole_plan(state, leases, now or dt.datetime.now(dt.UTC))
    text = json.dumps(plan, sort_keys=True)
    try:
        if stamp.read_text() == text:
            return False
    except FileNotFoundError:
        if not plan:
            return False  # nothing to add and nothing of ours to remove
    write_pihole(plan, db_path)
    subprocess.run(["pihole", "reloadlists"], capture_output=True, check=False)
    stamp.write_text(text)
    return True


PIHOLE_RULE_KINDS = {0: "allow", 1: "block", 2: "allow", 3: "block"}


# A "domain and its subdomains" regex, as curfew and Pi-hole's UI write them;
# \w+ stands for any one label (youtube.\w+ is every youtube TLD).
SUBDOMAIN_REGEX_RE = re.compile(
    r"\(\\\.\|\^\)((?:(?:[a-z0-9-]+|\\w\+)\\\.)+(?:[a-z0-9-]+|\\w\+))\$"
)


def readable_rule(domain: str) -> str:
    """Return ``youtube.com`` for ``(\\.|^)youtube\\.com$`` and ``youtube.*`` for ``\\w+``.

    Anything else (exact domains, other regexes) is shown as written.
    """
    match = SUBDOMAIN_REGEX_RE.fullmatch(domain)
    if not match:
        return domain
    return match.group(1).replace("\\.", ".").replace("\\w+", "*")


def read_pihole_groups(db_path: Path = PIHOLE_DB) -> list[dict] | None:
    """Return Pi-hole's own groups (not curfew's) with their clients, lists and rules.

    Read-only. Rules curfew adds for encrypted DNS (``curfew-doh``) are
    counted, not listed. None when Pi-hole isn't installed.
    """
    connection = open_readonly(db_path)
    if connection is None:
        return None
    try:
        groups = []
        for group_id, name, enabled, description in connection.execute(
            'SELECT id, name, enabled, description FROM "group" WHERE name NOT LIKE ? ORDER BY id',
            (CURFEW_GROUP_PREFIX + "%",),
        ):
            clients = [
                (ip, comment or "")
                for ip, comment in connection.execute(
                    "SELECT c.ip, c.comment FROM client c JOIN client_by_group g "
                    "ON g.client_id = c.id WHERE g.group_id = ? AND coalesce(c.comment, '') "
                    "NOT LIKE 'curfew%' ORDER BY c.ip",
                    (group_id,),
                )
            ]
            lists = [
                address
                for (address,) in connection.execute(
                    "SELECT a.address FROM adlist a JOIN adlist_by_group g "
                    "ON g.adlist_id = a.id WHERE g.group_id = ? AND a.enabled ORDER BY a.id",
                    (group_id,),
                )
            ]
            rules, doh = [], 0
            for domain, kind, comment in connection.execute(
                "SELECT d.domain, d.type, d.comment FROM domainlist d JOIN domainlist_by_group g "
                "ON g.domainlist_id = d.id WHERE g.group_id = ? AND d.enabled ORDER BY d.id",
                (group_id,),
            ):
                if comment == DOH_MARK:
                    doh += 1
                else:
                    rules.append((readable_rule(domain), PIHOLE_RULE_KINDS.get(kind, "block")))
            groups.append(
                {
                    "name": name,
                    "enabled": bool(enabled),
                    "description": description or "",
                    "default": group_id == 0,
                    "clients": clients,
                    "lists": lists,
                    "rules": rules,
                    "doh": doh,
                }
            )
        return groups
    finally:
        connection.close()


# Asked at most once per refresh, however many pages are open.
_summary = Recent[dict | None](REFRESH_PIHOLE)


def pihole_request(
    path: str, method: str = "GET", sid: str = "", body: dict | None = None
) -> dict:
    """Call Pi-hole's local API and return its JSON (empty for no content)."""
    request = urllib.request.Request(
        PIHOLE_API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", **({"X-FTL-SID": sid} if sid else {})},
    )
    with urllib.request.urlopen(request, timeout=3) as response:
        text = response.read()
    return json.loads(text) if text else {}


def pihole_summary() -> dict | None:
    """Return Pi-hole's 24-hour query totals, kept for a refresh; None if unavailable.

    Signs in with Pi-hole's local CLI password (what the ``pihole api``
    command uses) and signs out again, since Pi-hole allows few sessions.
    Only totals are read: query logging is off here, so there are no
    per-domain figures to show anyway.
    """
    return _summary.get(fetch_summary)


def fetch_summary() -> dict | None:
    """Return Pi-hole's 24-hour query totals from its API, or None if it doesn't answer."""
    try:
        password = PIHOLE_CLI_PASSWORD.read_text().strip()
        sid = pihole_request("/auth", "POST", body={"password": password})["session"]["sid"]
        try:
            return pihole_request("/stats/summary", sid=sid)
        finally:
            pihole_request("/auth", "DELETE", sid=sid)
    except (OSError, ValueError, KeyError, TypeError):
        return None


HISTORY_SECONDS = 600  # Pi-hole's history comes in 10-minute buckets


def block_rate_from(history: list[dict], now: float) -> float:
    """Return blocked lookups a second in the latest bucket that's over, or 0."""
    done = [bucket for bucket in history if bucket.get("timestamp", 0) + HISTORY_SECONDS <= now]
    return int(done[-1].get("blocked", 0)) / HISTORY_SECONDS if done else 0.0


def fetch_block_rate() -> float | None:
    """Return Pi-hole's blocked lookups a second just now, or None if it doesn't answer."""
    try:
        password = PIHOLE_CLI_PASSWORD.read_text().strip()
        sid = pihole_request("/auth", "POST", body={"password": password})["session"]["sid"]
        try:
            history = pihole_request("/history", sid=sid)["history"]
        finally:
            pihole_request("/auth", "DELETE", sid=sid)
        return block_rate_from(history, time.time())
    except (OSError, ValueError, KeyError, TypeError):
        return None


_block_rate = Recent[float | None](60)


def block_rate() -> float | None:
    """Return blocked lookups a second (kept a minute): the TV screensaver's shield."""
    return _block_rate.get(fetch_block_rate)
