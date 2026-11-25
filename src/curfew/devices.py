"""Device records: names, makers (IEEE registries), types, and changes to them."""

import csv
import datetime as dt
import functools
from pathlib import Path

from curfew.config import IEEE_DIR
from curfew.leases import Lease, is_private, is_router

IEEE_FILES = ("oui.csv", "mam.csv", "oui36.csv", "iab.csv")


MAX_NAME = 60


DEVICE_ACTIONS = {"block", "unblock", "rename", "allow", "disallow", "approve", "guest", "forget"}


GUEST_HOURS = 24  # a guest device is let on this long, then forgotten


def display_name(mac: str, record: dict, lease: Lease | None, conf_names: dict[str, str]) -> str:
    """Pick the best name: saved name, dhcpd.conf comment, hostname, else blank."""
    return (
        record.get("name") or conf_names.get(mac) or (lease.hostname if lease else "") or ""
    ).strip()


KIND_LABELS = {
    "phone": "Phone",
    "tablet": "Tablet",
    "tv": "TV/streamer",
    "computer": "Computer",
    "console": "Games console",
    "speaker": "Speaker",
    "smart": "Smart home",
    "camera": "Camera",
    "printer": "Printer",
    "watch": "Watch",
    "network": "Network",
    "device": "Device",
}


# A device's type is guessed from its name, then its maker; the first match
# wins, so more specific words come first (a "galaxy-tab" is a tablet).
NAME_KINDS = (
    ("console", ("xbox", "playstation", "ps4", "ps5", "nintendo", "switch-oled", "steamdeck")),
    ("tablet", ("ipad", "tablet", "kindle", "fire-hd", "galaxy-tab")),
    ("watch", ("watch",)),
    ("phone", ("iphone", "phone", "pixel", "galaxy", "android", "oneplus", "ipod")),
    ("tv", ("tv", "roku", "chromecast", "bravia", "shield", "firestick", "fire-stick")),
    (
        "computer",
        ("macbook", "laptop", "imac", "mac-mini", "desktop", "thinkpad", "chromebook", "-pc"),
    ),
    ("speaker", ("echo", "sonos", "homepod", "speaker", "alexa", "google-home", "nest-", "yoto")),
    ("camera", ("camera", "doorbell", "-cam", "cam-")),
    ("printer", ("printer", "epson", "officejet", "laserjet", "brother")),
    (
        "smart",
        (
            "light",
            "bulb",
            "lamp",
            "hue",
            "plug",
            "bridge",
            "thermostat",
            "ecobee",
            "nest",
            "irobot",
            "roomba",
            "robot",
            "myq",
            "garage",
            "lock",
            "sensor",
            "kasa",
            "shelly",
        ),
    ),
    ("network", ("eero", "router", "switch", "synology", "nas", "homehub")),
)


MAKER_KINDS = (
    ("sonos", "speaker"),
    ("roku", "tv"),
    ("nintendo", "console"),
    ("sony interactive", "console"),
    ("signify", "smart"),
    ("philips lighting", "smart"),
    ("irobot", "smart"),
    ("espressif", "smart"),
    ("tuya", "smart"),
    ("ecobee", "smart"),
    ("eero", "network"),
    ("synology", "network"),
    ("seiko epson", "printer"),
    ("brother", "printer"),
    ("ring", "camera"),
    ("wyze", "camera"),
)


def device_kind(name: str, mac: str) -> str:
    """Return a device type (a key of KIND_LABELS) guessed from its name or maker."""
    words = name.lower().replace(" ", "-").replace("_", "-")
    for kind, needles in NAME_KINDS:
        if any(needle in words for needle in needles):
            return kind
    maker = vendor_for(mac).lower()
    for needle, kind in MAKER_KINDS:
        if needle in maker:
            return kind
    return "device"


def load_vendors(directory: Path = IEEE_DIR) -> dict[str, str]:
    """Return IEEE assignment prefix (upper-case hex) -> organisation name."""
    vendors: dict[str, str] = {}
    for name in IEEE_FILES:
        try:
            with open(directory / name, newline="", encoding="utf-8", errors="replace") as handle:
                for row in csv.DictReader(handle):
                    prefix = (row.get("Assignment") or "").strip().upper()
                    organisation = (row.get("Organization Name") or "").strip()
                    if prefix and organisation:
                        vendors[prefix] = organisation
        except FileNotFoundError:
            continue
    return vendors


@functools.cache
def system_vendors() -> dict[str, str]:
    """Return the installed IEEE registries, read once on first use."""
    return load_vendors()


def vendor_for(mac: str, vendors: dict[str, str] | None = None) -> str:
    """Return the registered maker for a MAC, '' if unregistered or private.

    Tries the longest assignments first (MA-S/IAB, then MA-M, then MA-L).
    """
    if vendors is None:
        vendors = system_vendors()
    if is_private(mac):
        return ""
    digits = mac.replace(":", "").upper()
    for length in (9, 7, 6):
        if digits[:length] in vendors:
            return vendors[digits[:length]]
    return ""


def maker_text(mac: str, vendors: dict[str, str] | None = None) -> str:
    """Return the pop-up's maker line text."""
    if is_private(mac):
        return "none (private address)"
    maker = vendor_for(mac, vendors)
    if maker == "Private":
        # An IEEE "private" listing: the company paid to keep its name hidden.
        return "hidden by the maker"
    return maker or "unknown"


def approve_all(state: dict, macs: set[str]) -> int:
    """Mark every given MAC known (approved); return how many were new."""
    added = 0
    for mac in macs:
        record = state["devices"].setdefault(mac, {})
        if not record.get("known"):
            record["known"] = True
            added += 1
    return added


def forget_device(state: dict, mac: str) -> None:
    """Drop a device's record and profile places: it's a new device again."""
    state["devices"].pop(mac, None)
    for profile in state["profiles"].values():
        if mac in profile.get("members", []):
            profile["members"].remove(mac)


def guest_until(record: dict) -> dt.datetime | None:
    """Return when a guest device's day ends, or None if it isn't a guest."""
    until = record.get("guest_until")
    return dt.datetime.fromisoformat(until) if until else None


def expired_guests(state: dict, now: dt.datetime) -> list[str]:
    """Return the guest devices whose time is up."""
    return [
        mac
        for mac, record in state["devices"].items()
        if (until := guest_until(record)) is not None and until <= now
    ]


def forget_expired_guests(state: dict, now: dt.datetime) -> list[str]:
    """Forget every guest device whose time is up; return their MACs."""
    macs = expired_guests(state, now)
    for mac in macs:
        forget_device(state, mac)
    return macs


def apply_device_action(state: dict, mac: str, action: str, name: str = "") -> None:
    """Change one device record in place (homehub itself can only be renamed)."""
    if is_router(mac) and action != "rename":
        raise ValueError("homehub is the router: blocks and approvals are for other devices.")
    if action == "forget":
        forget_device(state, mac)
        return
    record = state["devices"].setdefault(mac, {})
    if action in {"approve", "block", "guest"}:
        record["known"] = True  # any of these takes it out of the new-device queue
        if action != "block" and name.strip():
            record["name"] = name.strip()[:MAX_NAME]
    if action == "guest":
        until = dt.datetime.now(dt.UTC) + dt.timedelta(hours=GUEST_HOURS)
        record["guest_until"] = until.isoformat(timespec="seconds")
    elif action in {"approve", "block"}:
        record.pop("guest_until", None)  # approved (or blocked) for good
    if action == "block":
        record["blocked"] = True
    elif action == "unblock":
        record["blocked"] = False
    elif action == "allow":
        record["allowed"] = True
    elif action == "disallow":
        record["allowed"] = False
    elif action == "rename":
        record["name"] = name.strip()[:MAX_NAME]
