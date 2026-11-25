"""Who gets internet: profiles, the status of each device, site lists."""

import datetime as dt
import re
import secrets

from curfew.config import RECENT_DAYS
from curfew.devices import MAX_NAME, display_name
from curfew.leases import MAC_RE, Lease, is_private, is_router
from curfew.schedules import TIME_RE, apply_override, local_now, profile_block_reason
from curfew.state import macs_with

ID_RE = re.compile(r"^[0-9a-f]{8}$")


DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


# Each service needs more than its main domain: video and images come from
# separate CDN domains.
SITE_PRESETS = {
    "YouTube": ["youtube.com", "youtu.be", "googlevideo.com", "ytimg.com"],
    "TikTok": ["tiktok.com", "tiktokv.com", "tiktokcdn.com", "byteoversea.com"],
    "Roblox": ["roblox.com", "rbxcdn.com"],
    "Fortnite": ["fortnite.com", "epicgames.com"],
}


STATUS_ORDER = ["blocked", "unknown", "paused", "scheduled", "private", "allowed"]


def profile_for(state: dict, mac: str) -> tuple[str | None, dict | None]:
    """Return the (id, profile) a MAC belongs to, or (None, None)."""
    for profile_id, profile in state["profiles"].items():
        if mac in profile.get("members", []):
            return profile_id, profile
    return None, None


def internet_status(state: dict, mac: str, now: dt.datetime) -> str:
    """Return why a device has no internet, or ``allowed``.

    One of ``blocked`` (by hand), ``unknown`` (new device while "block new
    devices" is on), ``paused`` / ``scheduled`` (its profile), ``private``
    (the private-address rule) or ``allowed``.
    """
    if is_router(mac):
        return "allowed"  # homehub itself: the blocks are for the house's devices
    record = state["devices"].get(mac, {})
    if record.get("blocked"):
        return "blocked"
    if state["settings"].get("block_unknown") and not record.get("known"):
        return "unknown"
    _profile_id, profile = profile_for(state, mac)
    reason = profile_block_reason(profile, now) if profile else None
    if reason:
        return reason
    if state["settings"].get("block_private") and is_private(mac) and not record.get("allowed"):
        return "private"
    return "allowed"


def effective_blocked(state: dict, now: dt.datetime) -> list[str]:
    """Return MACs to put in ``blocked_macs``: by hand, paused or scheduled."""
    macs = set(macs_with(state["devices"], "blocked"))
    for profile in state["profiles"].values():
        if profile_block_reason(profile, now):
            macs.update(profile.get("members", []))
    return sorted(macs)


def normalize_site(text: str) -> str:
    """Return the bare domain from ``https://www.YouTube.com/watch`` style input.

    Raises ValueError if what's left isn't a domain name.
    """
    site = text.strip().lower()
    site = re.sub(r"^[a-z][a-z0-9+.-]*://", "", site)
    site = re.split(r"[/?#:]", site, maxsplit=1)[0].rstrip(".")
    site = re.sub(r"^(\*\.|www\.)", "", site)
    if not DOMAIN_RE.match(site):
        raise ValueError(f"{text.strip()[:80]!r} isn't a site name like youtube.com.")
    return site


def pending_macs(
    state: dict, leases: dict[str, Lease], conf_names: dict[str, str], now: dt.datetime
) -> list[str]:
    """Return recently seen unapproved MACs, sorted by name."""
    cutoff = now - dt.timedelta(days=RECENT_DAYS)
    return [
        mac
        for _key, mac in sorted(
            (display_name(mac, state["devices"].get(mac, {}), lease, conf_names).lower(), mac)
            for mac, lease in leases.items()
            if lease.last_seen >= cutoff
            and internet_status(state, mac, now.astimezone()) == "unknown"
        )
    ]


def put_in_profile(state: dict, mac: str, profile: dict | None) -> None:
    """Make ``profile`` (None: no profile) the one a device is in."""
    if not MAC_RE.match(mac) or is_router(mac):
        raise ValueError("Bad device.")
    for other in state["profiles"].values():
        if mac in other.get("members", []):
            other["members"].remove(mac)
    if profile is not None:
        profile.setdefault("members", []).append(mac)
        state["devices"].setdefault(mac, {})["known"] = True


def apply_profile_action(state: dict, fields: dict[str, str]) -> str | None:
    """Apply one profile form post in place.

    Returns the page to show next when the action makes or removes one
    (create, delete); None means back to the page the form was on. Raises
    ValueError for anything malformed.
    """
    action = fields.get("action", "")
    profiles = state["profiles"]
    if action == "create":
        name = fields.get("name", "").strip()[:MAX_NAME]
        if not name:
            raise ValueError("A profile needs a name.")
        profile_id = secrets.token_hex(4)
        profiles[profile_id] = {"name": name, "members": [], "schedules": [], "paused": False}
        return f"/profile?id={profile_id}"
    if action in {"pause_all", "resume_all"}:
        minutes = fields.get("minutes", "")
        for profile in profiles.values():
            if action == "resume_all":
                apply_override(profile, "resume", "", local_now())
            elif minutes == "indefinite":
                apply_override(profile, "pause", "", local_now())
            else:
                apply_override(profile, "pause_for", minutes, local_now())
        return None

    profile_id = fields.get("id", "")
    if action == "set_profile" and not profile_id:
        put_in_profile(state, fields.get("mac", "").lower(), None)
        return None
    if not ID_RE.match(profile_id) or profile_id not in profiles:
        raise ValueError("Unknown profile.")
    profile = profiles[profile_id]
    if action == "set_profile":
        put_in_profile(state, fields.get("mac", "").lower(), profile)
        return None
    if action == "rename":
        name = fields.get("name", "").strip()[:MAX_NAME]
        if not name:
            raise ValueError("A profile needs a name.")
        profile["name"] = name
    elif action == "delete":
        del profiles[profile_id]
        return "/"
    elif action in {"pause", "resume", "pause_for", "bonus", "end_bonus"}:
        minutes = fields.get("minutes", "")
        if action == "pause_for" and minutes == "indefinite":  # the menu's "until resumed"
            action, minutes = "pause", ""
        apply_override(profile, action, minutes, local_now())
    elif action in {"add_site", "remove_site"}:
        sites = profile.setdefault("sites", [])
        if action == "remove_site":
            profile["sites"] = [site for site in sites if site != fields.get("site")]
        elif fields.get("preset") in SITE_PRESETS:
            sites.extend(s for s in SITE_PRESETS[fields["preset"]] if s not in sites)
        else:
            # Several sites may be pasted at once, split by commas or spaces.
            for text in re.split(r"[\s,]+", fields.get("site", "").strip()):
                site = normalize_site(text)
                if site not in sites:
                    sites.append(site)
    elif action == "add_schedule":
        days = [index for index in range(7) if fields.get(f"day{index}") == "1"]
        start, end = fields.get("start", ""), fields.get("end", "")
        if not days:
            raise ValueError("Pick at least one day.")
        if not (TIME_RE.match(start) and TIME_RE.match(end)) or start == end:
            raise ValueError("Times must be HH:MM and different.")
        schedule = {"id": secrets.token_hex(4), "days": days, "start": start, "end": end}
        profile.setdefault("schedules", []).append(schedule)
    elif action == "remove_schedule":
        sid = fields.get("sid", "")
        profile["schedules"] = [s for s in profile.get("schedules", []) if s["id"] != sid]
    else:
        raise ValueError("Unknown action.")
    return None
