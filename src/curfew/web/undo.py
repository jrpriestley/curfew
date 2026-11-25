"""Undo for the page's changes: each change said in words, and how to take it back.

A change made on the page is logged with the state before and after it.
The page after the change shows a toast ("Blocked kid-ipad · Undo"); Undo
puts the state back as it was, but only while nothing else has changed it
since, so it can never wipe out someone else's change.
"""

import copy
import html
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from curfew.dhcp import place_name
from curfew.schedules import BONUS_CHOICES, PAUSE_CHOICES
from curfew.web.components import post_form, submit

UNDO_SECONDS = 120  # an Undo button older than this says it's too late


FLASH_COOKIE = "curfew_flash"


@dataclass
class Change:
    """One change: what it did, in words, and the state either side (None: no Undo)."""

    message: str
    before: dict | None
    after: dict | None
    at: float


class UndoLog:
    """Recent changes by token, for the toast and its Undo button."""

    def __init__(self) -> None:
        """Start empty."""
        self.changes: dict[str, Change] = {}
        self.lock = threading.Lock()

    def add(self, message: str, before: dict | None = None, after: dict | None = None) -> str:
        """Log a change (without states: a message only) and return its token."""
        token = secrets.token_urlsafe(16)
        now = time.monotonic()
        undoable = before is not None and before != after
        with self.lock:
            self.changes = {
                key: change
                for key, change in self.changes.items()
                if now - change.at < UNDO_SECONDS
            }
            self.changes[token] = Change(
                message, before if undoable else None, after if undoable else None, now
            )
        return token

    def get(self, token: str) -> Change | None:
        """Return a recent change, or None."""
        with self.lock:
            change = self.changes.get(token)
        return change if change and time.monotonic() - change.at < UNDO_SECONDS else None

    def take(self, token: str) -> Change | None:
        """Remove and return a recent undoable change, so it's undone only once."""
        change = self.get(token)
        if change is None or change.before is None:
            return None
        with self.lock:
            return self.changes.pop(token, None)


def restorer(change: Change) -> Callable[[dict], None]:
    """Return a mutation putting state back to before ``change``; it refuses (ValueError)
    if anything else changed the state since."""

    def restore(state: dict) -> None:
        if state != change.after:
            raise ValueError("Something else has changed since, so that can't be undone.")
        state.clear()
        state.update(copy.deepcopy(change.before))

    return restore


SETTING_WORDS = {
    "block_private": "blocking private addresses",
    "block_unknown": "blocking new devices",
    "require_dhcp": "requiring addresses from homehub",
}


DEVICE_WORDS = {
    "block": "Blocked {name}",
    "unblock": "Unblocked {name}",
    "allow": "Allowed {name}'s private address",
    "disallow": "Revoked {name}'s private address",
    "approve": "Approved {name}",
    "guest": "Let {name} on for a day",
    "forget": "Forgot {name}",
    "rename": "Renamed {name} to {new}",
}


def dhcp_words(action: str, fields: dict[str, str], state: dict, name: str) -> str:
    """Return what a DHCP form post does, in words."""
    pools = state.get("dhcp", {}).get("pools", [])
    pool = next((p["name"] for p in pools if p["id"] == fields.get("id")), "a pool")
    group = fields.get("group", "")
    words = {
        "options": "Saved the DHCP options",
        "add_pool": f"Added pool {fields.get('name', '').strip()}",
        "edit_pool": f"Saved pool {pool}",
        "remove_pool": f"Removed pool {pool}",
        "fix": f"Gave {name} the fixed address {fields.get('ip', '').strip()}",
        "unfix": f"Took away {name}'s fixed address",
        "group": f"Moved {name} to {place_name(state.get('dhcp', {}), group)}",
    }
    return words.get(action, "Saved")


def describe(path: str, fields: dict[str, str], state: dict, name_of: Callable[[str], str]) -> str:
    """Return what a form post does, in words, from the state before it."""
    if path == "/settings":
        key = next(key for key in SETTING_WORDS if key in fields)
        return f"Turned {fields[key]} {SETTING_WORDS[key]}"
    action = fields.get("action", "")
    mac = fields.get("mac", "").lower()
    new = fields.get("name", "").strip()
    if path == "/device":
        return DEVICE_WORDS[action].format(name=name_of(mac), new=new or "its own name")
    if path == "/dhcp":
        return dhcp_words(action, fields, state, name_of(mac) if mac else "")
    profile = state["profiles"].get(fields.get("id", ""), {}).get("name", "")
    minutes = fields.get("minutes", "")
    words = {
        "create": f"Created {new}",
        "pause_all": "Paused every profile",
        "resume_all": "Resumed every profile",
        "rename": f"Renamed {profile} to {new}",
        "delete": f"Deleted {profile}",
        "pause": f"Paused {profile} until resumed",
        "pause_for": f"Paused {profile} until resumed"
        if minutes == "indefinite"
        else f"Paused {profile} for {PAUSE_CHOICES.get(minutes, 'a while')}",
        "resume": f"Resumed {profile}",
        "bonus": f"Gave {profile} {BONUS_CHOICES.get(minutes, 'some')} of bonus time",
        "end_bonus": f"Revoked {profile}'s bonus time",
        "add_site": f"Blocked {fields.get('preset') or fields.get('site', 'sites')} for {profile}",
        "remove_site": f"Unblocked {fields.get('site', 'a site')} for {profile}",
        "add_member": f"Put {name_of(mac)} in {profile}",
        "remove_member": f"Took {name_of(mac)} out of {profile}",
        "add_schedule": f"Added a schedule to {profile}",
        "remove_schedule": f"Removed a schedule from {profile}",
    }
    return words.get(action, "Saved")


def toast_html(change: Change, token: str) -> str:
    """Return the toast for a change: its words, and Undo while it can be undone."""
    undo = (
        post_form("/undo", {"token": token}, submit("Undo", "ghost toast-undo"))
        if change.before is not None
        else ""
    )
    return (
        f'<div class="toast" role="status"><span>{html.escape(change.message)}</span>{undo}</div>'
    )
