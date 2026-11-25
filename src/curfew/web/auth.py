"""Sign-in: passwords checked against /etc/shadow, sessions and lockout."""

import ctypes
import ctypes.util
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

from curfew.config import ALLOWED_USERS, SHADOW_FILE, TV_KEY_FILE, VIEWERS

SESSION_COOKIE = "hr_session"


TV_COOKIE = "hr_tv"  # the TV dashboard's key, sent only to /tv


SESSION_SECONDS = 12 * 3600


MAX_FAILURES = 5


LOCKOUT_SECONDS = 600


class Shadow:
    """Check passwords against /etc/shadow via the system libcrypt."""

    def __init__(self, path: Path = SHADOW_FILE) -> None:
        """Load libcrypt; crypt() is not thread-safe, so calls share a lock."""
        self.path = path
        self.lock = threading.Lock()
        self.libcrypt = ctypes.CDLL(ctypes.util.find_library("crypt") or "libcrypt.so.1")
        self.libcrypt.crypt.restype = ctypes.c_char_p
        self.libcrypt.crypt.argtypes = [ctypes.c_char_p, ctypes.c_char_p]

    def verify(self, user: str, password: str) -> bool:
        """Return True if the password matches the user's shadow hash."""
        if user not in ALLOWED_USERS | VIEWERS:
            return False
        stored = ""
        for line in self.path.read_text().splitlines():
            parts = line.split(":")
            if parts[0] == user and len(parts) > 1:
                stored = parts[1]
        if not stored.startswith("$"):
            return False  # locked or passwordless account
        with self.lock:
            computed = self.libcrypt.crypt(password.encode(), stored.encode())
        return bool(computed) and hmac.compare_digest(computed.decode(), stored)


def _hashed(token: str | None) -> str:
    return hashlib.sha256((token or "").encode()).hexdigest()


class Sessions:
    """Login sessions and per-address failure lockout.

    The sessions are kept in ``path`` (when given), so a restart (every update) doesn't sign
    everyone out: only each token's hash, so the file can't be used to sign in. Failures are
    kept in memory only.
    """

    def __init__(self, path: Path | None = None) -> None:
        """Start with the sessions kept, if any."""
        self.lock = threading.Lock()
        self.path = path
        self.tokens: dict[str, tuple[float, str]] = {}  # token's hash -> expiry, who signed in
        self.failures: dict[str, list[float]] = {}
        try:
            kept = json.loads(path.read_text()) if path else {}
            now = time.time()
            self.tokens = {
                key: (float(at), str(who)) for key, (at, who) in kept.items() if at > now
            }
        except (OSError, ValueError, TypeError):
            self.tokens = {}

    def save(self) -> None:
        """Write the sessions out, readable by root alone (called with the lock held)."""
        if self.path is None:
            return
        try:
            spare = self.path.with_suffix(".tmp")
            spare.write_text(json.dumps(self.tokens))
            os.chmod(spare, 0o600)
            os.replace(spare, self.path)
        except OSError:
            pass  # then they last till the next restart, as they always did

    def create(self, user: str = "") -> str:
        """Return a new session token for ``user`` (and forget expired ones)."""
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self.lock:
            self.tokens = {key: kept for key, kept in self.tokens.items() if kept[0] > now}
            self.tokens[_hashed(token)] = (now + SESSION_SECONDS, user)
            self.save()
        return token

    def user(self, token: str | None) -> str | None:
        """Return who a live session token belongs to, or None."""
        with self.lock:
            expiry, user = self.tokens.get(_hashed(token), (0.0, ""))
            if expiry < time.time():
                return None
            return user

    def valid(self, token: str | None) -> bool:
        """Return True for a live session token."""
        return self.user(token) is not None

    def end(self, token: str | None) -> None:
        """Forget a session token."""
        with self.lock:
            if self.tokens.pop(_hashed(token), None):
                self.save()

    def locked_out(self, address: str) -> bool:
        """Return True if this address failed too often recently."""
        cutoff = time.time() - LOCKOUT_SECONDS
        with self.lock:
            recent = [stamp for stamp in self.failures.get(address, []) if stamp > cutoff]
            self.failures[address] = recent
            return len(recent) >= MAX_FAILURES

    def record_failure(self, address: str) -> None:
        """Note a failed login from this address (and forget other addresses' old ones)."""
        now = time.time()
        with self.lock:
            self.failures = {
                key: recent
                for key, stamps in self.failures.items()
                if (recent := [stamp for stamp in stamps if stamp > now - LOCKOUT_SECONDS])
            }
            self.failures.setdefault(address, []).append(now)


def read_tv_key(path: Path = TV_KEY_FILE) -> str:
    """Return the TV dashboard's key, or '' when there's none (the link is off)."""
    try:
        return path.read_text().strip()
    except FileNotFoundError:
        return ""


def new_tv_key(path: Path = TV_KEY_FILE) -> str:
    """Make a new TV key, replacing any old one (whose link stops working); return it."""
    key = secrets.token_urlsafe(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(mode=0o600)
    path.chmod(0o600)
    path.write_text(key + "\n")
    return key


def tv_key_valid(given: str | None, path: Path = TV_KEY_FILE) -> bool:
    """Return True if ``given`` is the TV key (never when the link is off)."""
    key = read_tv_key(path)
    return bool(key and given) and hmac.compare_digest(key.encode(), (given or "").encode())
