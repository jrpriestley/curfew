"""curfew's saved state (devices, profiles, settings) and its database helpers."""

import json
import os
import sqlite3
from pathlib import Path

from curfew.config import STATE_FILE


def open_readonly(path: Path) -> sqlite3.Connection | None:
    """Open a SQLite database read-only, or None if it doesn't exist (yet)."""
    if not path.exists():
        return None
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)


def load_state(path: Path = STATE_FILE) -> dict:
    """Return saved state: ``devices`` by MAC, ``profiles`` by id, ``settings``."""
    try:
        state = json.loads(path.read_text())
    except FileNotFoundError:
        state = {}
    state.setdefault("devices", {})
    state.setdefault("profiles", {})
    state.setdefault("settings", {"block_private": False})
    return state


def save_state(state: dict, path: Path = STATE_FILE) -> None:
    """Write state atomically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1, sort_keys=True) + "\n")
    os.replace(tmp, path)


def macs_with(devices: dict[str, dict], flag: str) -> list[str]:
    """Return the sorted MACs whose record has ``flag`` set."""
    return sorted(mac for mac, record in devices.items() if record.get(flag))
