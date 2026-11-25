"""The shared cache: kept for a while, refreshed behind the scenes after, failures kept too."""

import threading

from curfew import cache


def test_recent_keeps_a_value_then_works_it_out_again(monkeypatch) -> None:
    """Within max_age the kept value comes back; after it, compute runs again; None counts."""
    clock = [100.0]
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock[0])
    recent = cache.Recent(5)
    calls = []
    done = threading.Event()

    def compute():
        calls.append(clock[0])
        done.set()
        return None  # e.g. Pi-hole not answering: kept like any value

    assert recent.get(compute) is None and recent.get(compute) is None
    assert len(calls) == 1
    clock[0] += 6
    done.clear()
    recent.get(compute)
    assert done.wait(5) and len(calls) == 2


def test_nobody_waits_for_a_refresh_once_there_is_a_value(monkeypatch) -> None:
    """The caller who finds the value old, and everyone after, gets the previous value
    at once; one refresh runs behind the scenes and its value is served after."""
    clock = [0.0]
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock[0])
    recent = cache.Recent(1)
    recent.get(lambda: "old")
    clock[0] = 10
    started, release = threading.Event(), threading.Event()
    runs = []

    def slow():
        runs.append(1)
        started.set()
        release.wait(5)
        return "new"

    assert recent.get(slow) == "old"  # didn't wait
    started.wait(5)
    assert recent.get(slow) == "old" and len(runs) == 1  # one refresh at a time
    release.set()
    for _ in range(500):
        if not recent.refreshing:
            break
        threading.Event().wait(0.01)
    assert recent.get(lambda: "not asked") == "new"


def test_a_long_stale_value_is_worked_out_in_line(monkeypatch) -> None:
    """After a quiet spell (older than too_old) the caller waits for a fresh value."""
    clock = [0.0]
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock[0])
    recent = cache.Recent(5, too_old=60)
    recent.get(lambda: "old")
    clock[0] = 61
    assert recent.get(lambda: "new") == "new"
