"""A value worked out at most every so often, shared between the page's threads."""

import threading
import time
from collections.abc import Callable

_NOTHING = object()


class Recent[Value]:
    """Keep a value for ``max_age`` seconds, then work it out again.

    Once there's a value, nobody waits for a new one: a caller who finds it
    too old gets it anyway and starts working out the next one in the
    background (once, however many ask meanwhile). Only the very first
    callers, before any value, work it out themselves. None is a value like
    any other (say, "Pi-hole isn't answering"), kept as long.

    A value older than ``too_old`` (after a quiet spell) is worked out in line
    too, so a page never shows something long out of date.

    With ``background=False`` the caller who finds it old works the new value
    out itself (the others still get the old one): for a value that's quick
    to get and must be current when it's served, like counters read for a rate.
    """

    def __init__(self, max_age: float, background: bool = True, too_old: float = 60) -> None:
        """Start empty."""
        self.max_age = max_age
        self.background = background
        self.too_old = too_old
        self.lock = threading.Lock()
        self.value: object = _NOTHING
        self.at = 0.0
        self.refreshing = False

    def get(self, compute: Callable[[], Value]) -> Value:
        """Return the kept value, refreshing it behind the scenes when it's too old."""
        with self.lock:
            value = self.value
            age = time.monotonic() - self.at
            if value is not _NOTHING and (age < self.max_age or self.refreshing):
                return value  # type: ignore[return-value]
            self.refreshing = True
        if value is _NOTHING or not self.background or age >= self.too_old:
            return self.refresh(compute)
        threading.Thread(target=self.refresh, args=(compute,), daemon=True).start()
        return value  # type: ignore[return-value]

    def refresh(self, compute: Callable[[], Value]) -> Value:
        """Work the value out now and keep it."""
        try:
            value = compute()
        except BaseException:
            with self.lock:
                self.refreshing = False
            raise
        with self.lock:  # the value lands before anyone may start another refresh
            self.value, self.at, self.refreshing = value, time.monotonic(), False
        return value
