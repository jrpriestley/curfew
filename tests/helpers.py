"""Shared test helpers: fixed times, sample data, and layout-free page readers."""

import copy
import datetime as dt
import html
import re
import sqlite3
from html.parser import HTMLParser

import pytest

from curfew import leases as dhcp
from curfew import traffic

NOW = dt.datetime(2026, 11, 7, 20, 30, tzinfo=dt.UTC)
# Local (naive) times for schedule checks; 2026-11-06 is a Friday.
FRI_2230 = dt.datetime(2026, 11, 6, 22, 30)
SAT_0630 = dt.datetime(2026, 11, 7, 6, 30)
SAT_0730 = dt.datetime(2026, 11, 7, 7, 30)
SAT_2230 = dt.datetime(2026, 11, 7, 22, 30)
EST = dt.timezone(dt.timedelta(hours=-5))
FRI_2230_EST = dt.datetime(2026, 11, 6, 22, 30, tzinfo=EST)
SAT_0630_EST = dt.datetime(2026, 11, 7, 6, 30, tzinfo=EST)

LEASES = """
lease 10.7.1.28 {
  starts 5 2026/09/25 00:33:52;
  ends 5 2026/09/25 00:39:26;
  cltt 5 2026/09/25 00:33:52;
  binding state free;
  hardware ethernet 58:e4:88:00:00:03;
}
lease 10.7.1.43 {
  starts 6 2026/11/07 20:19:43;
  ends 6 2026/11/07 20:29:43;
  cltt 6 2026/11/07 20:19:43;
  binding state active;
  hardware ethernet 4c:b9:ea:00:00:04;
  client-hostname "iRobot-0004";
}
lease 10.7.1.44 {
  starts 6 2026/11/07 20:25:00;
  ends 6 2026/11/07 20:35:00;
  cltt 6 2026/11/07 20:25:00;
  binding state active;
  hardware ethernet 4c:b9:ea:00:00:04;
}
"""

CONF = """
subclass "av" 1:58:a8:e8:00:00:01;  # Upstairs TV
subclass "av" 1:d8:be:65:00:00:02;  # Den TV
subclass "av" 1:94:2b:68:26:88:f0;
"""

KIDS = {
    "abcd1234": {
        "name": "Kids",
        "members": ["aa:bb:cc:dd:ee:01"],
        "schedules": [{"id": "s1", "days": [4], "start": "21:00", "end": "07:00"}],
        "paused": False,
    }
}
MEMBER = "aa:bb:cc:dd:ee:01"


def make_state(devices: dict | None = None, profiles: dict | None = None, private: bool = False):
    """Return a state dict with the given parts (deep-copied, so tests can't leak)."""
    return {
        "devices": copy.deepcopy(devices or {}),
        "profiles": copy.deepcopy(profiles or {}),
        "settings": {"block_private": private},
    }


def lease(mac: str, ip: str = "10.7.1.9", name: str = "", online: bool = True, when=NOW):
    """Return a lease for tests."""
    return dhcp.Lease(mac, ip, name, when, online)


def expect_value_error(function, *args) -> None:
    """Assert that ``function(*args)`` raises ValueError."""
    with pytest.raises(ValueError):
        function(*args)


class Forms(HTMLParser):
    """Collect every form on a page: its URL, id and field values."""

    def __init__(self, page: str) -> None:
        super().__init__()
        self.forms: list[dict] = []
        self.inputs_by_form: dict[str, list[dict]] = {}
        self.feed(page)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attributes = dict(attrs)
        if tag == "form":
            self.forms.append(
                {"url": attributes.get("action"), "id": attributes.get("id"), "fields": {}}
            )
        elif tag in {"input", "select", "button"} and attributes.get("name"):
            owner = attributes.get("form")
            if owner:  # a control tied to a form elsewhere by id
                self.inputs_by_form.setdefault(owner, []).append(attributes)
            elif self.forms:
                self.forms[-1]["fields"].setdefault(attributes["name"], attributes.get("value"))


def forms(page: str) -> list[dict]:
    """Return the page's forms, each with linked controls merged into its fields."""
    parser = Forms(page)
    for form in parser.forms:
        for control in parser.inputs_by_form.get(form["id"] or "", []):
            form["fields"].setdefault(control["name"], control.get("value"))
    return parser.forms


def actions(page: str, url: str | None = None) -> set[tuple[str, str | None]]:
    """Return (action, mac) for each form on the page, optionally only those posting to url."""
    return {
        (form["fields"].get("action"), form["fields"].get("mac"))
        for form in forms(page)
        if url is None or form["url"] == url
    }


def text(page: str) -> str:
    """Return the page's visible text, tags stripped and whitespace collapsed."""
    page = re.sub(r"<(script|style)\b.*?</\1>", " ", page, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page))).strip()


def text_outside_charts(page: str) -> str:
    """Return the page's visible text without SVG charts (their hover labels repeat names)."""
    return text(re.sub(r"<svg\b.*?</svg>", " ", page, flags=re.S))


def section(page: str, title: str) -> str:
    """Return the page from a heading's text to the next heading (rough, but layout-free)."""
    start = text(page).index(title)
    rest = text(page)[start:]
    return rest


GRAVITY_SCHEMA = """
CREATE TABLE "group" (id INTEGER PRIMARY KEY AUTOINCREMENT, enabled BOOLEAN NOT NULL DEFAULT 1,
    name TEXT UNIQUE NOT NULL, description TEXT);
CREATE TABLE client (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL UNIQUE, comment TEXT);
CREATE TABLE client_by_group (
    client_id INTEGER NOT NULL REFERENCES client (id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES "group" (id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, group_id));
CREATE TABLE domainlist (id INTEGER PRIMARY KEY AUTOINCREMENT, type INTEGER NOT NULL DEFAULT 0,
    domain TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT 1, comment TEXT,
    UNIQUE(domain, type));
CREATE TABLE domainlist_by_group (
    domainlist_id INTEGER NOT NULL REFERENCES domainlist (id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES "group" (id) ON DELETE CASCADE,
    PRIMARY KEY (domainlist_id, group_id));
CREATE TABLE adlist (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT UNIQUE NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT 1, comment TEXT);
CREATE TABLE adlist_by_group (
    adlist_id INTEGER NOT NULL REFERENCES adlist (id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES "group" (id) ON DELETE CASCADE,
    PRIMARY KEY (adlist_id, group_id));
CREATE TRIGGER tr_client_add AFTER INSERT ON client BEGIN
    INSERT INTO client_by_group (client_id, group_id) VALUES (NEW.id, 0); END;
CREATE TRIGGER tr_domainlist_add AFTER INSERT ON domainlist BEGIN
    INSERT INTO domainlist_by_group (domainlist_id, group_id) VALUES (NEW.id, 0); END;
INSERT INTO "group" (id, name) VALUES (0, 'Default'), (2, 'AV');
INSERT INTO client (id, ip) VALUES (3, '10.7.2.0/24');
INSERT INTO client_by_group VALUES (3, 2);
"""


def groups_of_rule(connection: sqlite3.Connection, regex: str) -> set[int]:
    """Return the groups a domain rule applies to."""
    return {
        row[0]
        for row in connection.execute(
            "SELECT g.group_id FROM domainlist d JOIN domainlist_by_group g "
            "ON g.domainlist_id = d.id WHERE d.domain = ?",
            (regex,),
        )
    }


def nft_sets(script: str) -> dict[str, set[str]]:
    """Return each set's elements after an nft script runs (flush, then adds)."""
    sets: dict[str, set[str]] = {}
    for line in script.splitlines():
        if line.startswith("flush set"):
            sets[line.split()[-1]] = set()
        elif match := re.match(r"add element \S+ \S+ (\w+) \{ (.*) \}", line):
            sets[match.group(1)].update(match.group(2).split(", "))
    return sets


def traffic_db() -> sqlite3.Connection:
    """Return an in-memory usage database."""
    connection = sqlite3.connect(":memory:")
    connection.executescript(traffic.TRAFFIC_SCHEMA)
    return connection
