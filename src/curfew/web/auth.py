"""Sign-in: passwords checked against /etc/shadow, sessions and lockout."""

import ctypes
import ctypes.util
import hmac
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


class Sessions:
    """In-memory login sessions and per-address failure lockout."""

    def __init__(self) -> None:
        """Start with no sessions."""
        self.lock = threading.Lock()
        self.tokens: dict[str, tuple[float, str]] = {}  # token -> expiry, who signed in
        self.failures: dict[str, list[float]] = {}

    def create(self, user: str = "") -> str:
        """Return a new session token for ``user`` (and forget expired ones)."""
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self.lock:
            self.tokens = {key: kept for key, kept in self.tokens.items() if kept[0] > now}
            self.tokens[token] = (now + SESSION_SECONDS, user)
        return token

    def user(self, token: str | None) -> str | None:
        """Return who a live session token belongs to, or None."""
        with self.lock:
            expiry, user = self.tokens.get(token or "", (0.0, ""))
            if expiry < time.time():
                self.tokens.pop(token or "", None)
                return None
            return user

    def valid(self, token: str | None) -> bool:
        """Return True for a live session token."""
        return self.user(token) is not None

    def end(self, token: str | None) -> None:
        """Forget a session token."""
        with self.lock:
            self.tokens.pop(token or "", None)

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
