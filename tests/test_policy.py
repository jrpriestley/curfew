"""Who gets internet: schedules, pauses, statuses, device and profile actions."""

import copy
import datetime as dt
from zoneinfo import ZoneInfo

from helpers import (
    EST,
    FRI_2230,
    FRI_2230_EST,
    KIDS,
    MEMBER,
    NOW,
    SAT_0630,
    SAT_0630_EST,
    SAT_0730,
    SAT_2230,
    expect_value_error,
    make_state,
)

from curfew import devices, policy, schedules
from curfew.web import components, sky


def test_schedule_active_same_day_and_overnight() -> None:
    """Overnight windows belong to their start day and run into the next."""
    overnight = {"days": [4], "start": "21:00", "end": "07:00"}  # Fri night
    assert schedules.schedule_active(overnight, FRI_2230)
    assert schedules.schedule_active(overnight, SAT_0630)
    assert not schedules.schedule_active(overnight, SAT_0730)
    assert not schedules.schedule_active(overnight, SAT_2230)
    daytime = {"days": [5], "start": "07:00", "end": "08:00"}  # Sat morning
    assert schedules.schedule_active(daytime, SAT_0730)
    assert not schedules.schedule_active(daytime, SAT_0630)


def test_internet_status_precedence() -> None:
    """Blocked by hand beats everything; then new device, profile, private rule."""
    private = "da:a1:19:00:00:01"
    assert policy.internet_status(make_state(private=True), private, FRI_2230) == "private"
    assert policy.internet_status(make_state(), private, FRI_2230) == "allowed"
    allowed = make_state({private: {"allowed": True}}, private=True)
    assert policy.internet_status(allowed, private, FRI_2230) == "allowed"
    both = make_state({private: {"allowed": True, "blocked": True}}, private=True)
    assert policy.internet_status(both, private, FRI_2230) == "blocked"
    state = make_state(profiles=KIDS)
    assert policy.internet_status(state, MEMBER, FRI_2230) == "scheduled"
    assert policy.internet_status(state, MEMBER, SAT_0730) == "allowed"
    state["profiles"]["abcd1234"]["paused"] = True
    assert policy.internet_status(state, MEMBER, SAT_0730) == "paused"
    state["settings"]["block_unknown"] = True
    assert policy.internet_status(state, "aa:bb:cc:dd:ee:09", SAT_0730) == "unknown"


def test_timed_pause_and_bonus_time() -> None:
    """A timed pause ends on its own; bonus time lifts a schedule but not a pause."""
    profile = copy.deepcopy(KIDS["abcd1234"])
    schedules.apply_override(profile, "bonus", "30", FRI_2230_EST)
    assert schedules.profile_block_reason(profile, FRI_2230_EST) is None
    later = FRI_2230_EST + dt.timedelta(minutes=31)
    assert schedules.profile_block_reason(profile, later) == "scheduled"
    morning = SAT_0630_EST + dt.timedelta(hours=2)
    schedules.apply_override(profile, "pause_for", "60", morning)
    assert schedules.profile_block_reason(profile, morning + dt.timedelta(minutes=30)) == "paused"
    assert schedules.profile_block_reason(profile, morning + dt.timedelta(minutes=90)) is None
    schedules.apply_override(profile, "pause_for", "morning", FRI_2230_EST)
    assert schedules.profile_block_reason(profile, SAT_0630_EST) == "paused"
    schedules.apply_override(profile, "resume", "", FRI_2230_EST)
    assert not schedules.is_paused(profile, FRI_2230_EST)
    expect_value_error(schedules.apply_override, profile, "pause_for", "999", FRI_2230_EST)
    expect_value_error(schedules.apply_override, profile, "bonus", "abc", FRI_2230_EST)


def test_next_change() -> None:
    """The next switch between blocked and allowed, as a moment and in words."""
    profile = copy.deepcopy(KIDS["abcd1234"])
    friday_evening = dt.datetime(2026, 11, 6, 18, 0, tzinfo=EST)
    assert schedules.next_change(profile, friday_evening) == friday_evening.replace(hour=21)
    assert schedules.format_next_change(profile, friday_evening) == "Blocked from 21:00 (in 3 h)"
    assert schedules.format_next_change(profile, FRI_2230_EST).startswith(
        "Allowed again Sat 07:00"
    )
    assert schedules.next_change({"schedules": [], "paused": True}, FRI_2230_EST) is None
    # The countdown's ring shows only in the last hour: before then it would just be full.
    nine = friday_evening.replace(hour=21)
    assert 'class="countdown far"' in components.countdown(nine, "3 h", friday_evening)
    soon = nine - dt.timedelta(minutes=20)
    assert 'class="countdown"' in components.countdown(nine, "20 min", soon)


def test_day_segments_split_overnight_windows() -> None:
    """An overnight window counts as evening on its day and morning on the next."""
    profile = {"schedules": [{"days": [4], "start": "21:00", "end": "07:00"}]}
    assert [(s, e) for s, e, _ in schedules.day_segments(profile, 4)] == [(21 * 60, 24 * 60)]
    assert [(s, e) for s, e, _ in schedules.day_segments(profile, 5)] == [(0, 7 * 60)]
    assert schedules.day_segments(profile, 6) == []


def test_format_days() -> None:
    """Consecutive days compress into ranges."""
    assert schedules.format_days([0, 1, 2, 3, 4]) == "Mon–Fri"
    assert schedules.format_days([6, 0, 1, 2, 3]) == "Mon–Thu, Sun"
    assert schedules.format_days(list(range(7))) == "Every day"


def test_format_seen() -> None:
    """Recent times read relatively."""
    assert components.format_seen(None, NOW) == "never"
    assert components.format_seen(NOW - dt.timedelta(seconds=30), NOW) == "just now"
    assert components.format_seen(NOW - dt.timedelta(minutes=10), NOW) == "10 min ago"
    assert components.format_seen(NOW - dt.timedelta(hours=5), NOW) == "5 h ago"


def test_sky_follows_the_sun_and_evening_curfews(monkeypatch) -> None:
    """The sky follows sunrise and sunset at homehub (fixed hours without a location);
    an evening curfew brings night early, but a morning one doesn't hold back the day."""
    toronto = ZoneInfo("America/Toronto")
    rise, down = sky.sun_times(dt.date(2026, 6, 21), 43.65, -79.38)
    assert dt.datetime.fromtimestamp(rise, toronto).strftime("%H:%M") in {"05:35", "05:36"}
    assert dt.datetime.fromtimestamp(down, toronto).strftime("%H:%M") in {"21:02", "21:03"}
    monkeypatch.setattr(sky, "LATITUDE", 43.65)
    monkeypatch.setattr(sky, "LONGITUDE", -79.38)

    def phase_at(state: dict, hour: int, minute: int = 0) -> str:
        return sky.sky_phase(state, dt.datetime(2026, 11, 11, hour, minute, tzinfo=toronto))[0]

    quiet = make_state()
    # Sunrise 07:06 and sunset 16:56 that day: dawn from 06:36, day from 08:06.
    assert [phase_at(quiet, *t) for t in ((6, 0), (7, 0), (12, 0), (16, 30), (18, 0))] == [
        "night",
        "dawn",
        "day",
        "dusk",
        "night",
    ]
    monkeypatch.setattr(sky, "LATITUDE", None)
    assert phase_at(quiet, 6) == "dawn"  # fixed hours: dawn from 05:00
    kids = make_state(profiles=KIDS)  # Kids' curfew runs 21:00 to 07:00
    phase, why = sky.sky_phase(kids, FRI_2230)
    assert phase == "night" and "Kids" in why
    phase, why = sky.sky_phase(kids, dt.datetime(2026, 11, 7, 6, 30))
    assert phase == "dawn" and "curfew for Kids" in why  # morning: named, not drawn


def test_moon_phase() -> None:
    """A known new moon is phase 0; half a cycle later is full; names follow."""
    new = sky.NEW_MOON_EPOCH
    assert sky.moon_phase(new) < 0.001
    full = new + dt.timedelta(days=sky.SYNODIC_DAYS / 2)
    assert abs(sky.moon_phase(full) - 0.5) < 0.001
    assert sky.moon_name(0.5).startswith("Full moon")
    assert sky.moon_name(0.1).startswith("Waxing") and sky.moon_name(0.9).startswith("Waning")


def test_apply_device_action() -> None:
    """Each device action changes the right field; approve and block take it off the queue."""
    state = make_state()
    mac = "aa:bb:cc:dd:ee:ff"
    for action in ("block", "allow"):
        devices.apply_device_action(state, mac, action)
    devices.apply_device_action(state, mac, "rename", "  Kid tablet  ")
    record = state["devices"][mac]
    assert record["blocked"] and record["allowed"] and record["known"]
    assert record["name"] == "Kid tablet"
    devices.apply_device_action(state, mac, "unblock")
    devices.apply_device_action(state, mac, "disallow")
    assert not record["blocked"] and not record["allowed"]
    devices.apply_device_action(state, "aa:bb:cc:dd:ee:02", "approve", " Tablet ")
    assert state["devices"]["aa:bb:cc:dd:ee:02"] == {"known": True, "name": "Tablet"}
    assert devices.approve_all(state, {"aa:bb:cc:dd:ee:02", "aa:bb:cc:dd:ee:04"}) == 1


def test_guest_devices_get_a_day_then_are_forgotten() -> None:
    """A guest is let on with an end time; once it passes, the sync forgets it (and its
    profile place), so it's a new device again. Approving keeps it for good."""
    guest, kept = "aa:bb:cc:dd:ee:05", "aa:bb:cc:dd:ee:06"
    state = make_state(profiles={"p1": {"name": "Kids", "members": [guest], "schedules": []}})
    state["settings"]["block_unknown"] = True
    for mac in (guest, kept):
        devices.apply_device_action(state, mac, "guest")
    devices.apply_device_action(state, kept, "approve")
    assert "guest_until" not in state["devices"][kept]
    until = devices.guest_until(state["devices"][guest])
    assert until is not None and policy.internet_status(state, guest, NOW) != "unknown"
    assert devices.forget_expired_guests(state, until - dt.timedelta(minutes=1)) == []
    assert devices.forget_expired_guests(state, until) == [guest]
    assert guest not in state["devices"] and state["profiles"]["p1"]["members"] == []
    assert policy.internet_status(state, guest, NOW) == "unknown"
    assert state["devices"][kept]["known"]
    devices.apply_device_action(state, kept, "forget")
    assert kept not in state["devices"]


def test_apply_profile_action_flow() -> None:
    """Create, add members and schedules, move a member, validate input, delete."""
    state = make_state()
    first = policy.apply_profile_action(state, {"action": "create", "name": " Kids "})
    profile_id = first.split("=")[1]
    assert state["profiles"][profile_id]["name"] == "Kids"
    mac = "aa:bb:cc:dd:ee:02"
    policy.apply_profile_action(state, {"action": "add_member", "id": profile_id, "mac": mac})
    other_id = policy.apply_profile_action(state, {"action": "create", "name": "Teen"}).split("=")[
        1
    ]
    policy.apply_profile_action(state, {"action": "add_member", "id": other_id, "mac": mac})
    assert state["profiles"][profile_id]["members"] == []  # a device has one profile
    assert state["profiles"][other_id]["members"] == [mac]
    fields = {"action": "add_schedule", "id": profile_id, "day0": "1", "day4": "1"}
    policy.apply_profile_action(state, {**fields, "start": "21:00", "end": "07:00"})
    assert state["profiles"][profile_id]["schedules"][0]["days"] == [0, 4]
    for bad in (
        {**fields, "start": "25:00", "end": "07:00"},
        {**fields, "start": "07:00", "end": "07:00"},
        {"action": "add_schedule", "id": profile_id, "start": "1:00", "end": "2:00"},
        {"action": "pause", "id": "nope"},
    ):
        expect_value_error(policy.apply_profile_action, state, bad)
    # Ordinary actions stay on the page they came from; a stray "back" field can't steer.
    assert policy.apply_profile_action(state, {"action": "pause", "id": profile_id}) is None
    assert (
        policy.apply_profile_action(
            state, {"action": "resume", "id": profile_id, "back": "https://evil.example"}
        )
        is None
    )
    assert policy.apply_profile_action(state, {"action": "delete", "id": profile_id}) == "/"
    assert profile_id not in state["profiles"]


def test_pause_all_and_resume_all() -> None:
    """Pause all covers every profile, for a while or until resumed."""
    profiles = {**KIDS, "ffff0000": {"name": "Teen", "members": [], "schedules": []}}
    state = make_state(profiles=profiles)
    policy.apply_profile_action(state, {"action": "pause_all", "minutes": "60"})
    assert all(schedules.is_paused(p, schedules.local_now()) for p in state["profiles"].values())
    policy.apply_profile_action(state, {"action": "resume_all"})
    assert not any(
        schedules.is_paused(p, schedules.local_now()) for p in state["profiles"].values()
    )
    policy.apply_profile_action(state, {"action": "pause_all", "minutes": "indefinite"})
    assert all(p["paused"] for p in state["profiles"].values())
    expect_value_error(
        policy.apply_profile_action, state, {"action": "pause_all", "minutes": "999"}
    )


def test_normalize_site() -> None:
    """Pasted URLs reduce to a domain; junk is refused."""
    assert policy.normalize_site(" https://www.YouTube.com/watch?v=1 ") == "youtube.com"
    assert policy.normalize_site("*.tiktok.com") == "tiktok.com"
    assert policy.normalize_site("roblox.com:443") == "roblox.com"
    for bad in ("youtube", "a b.com", "-x.com", "http://"):
        expect_value_error(policy.normalize_site, bad)


def test_site_actions_and_presets() -> None:
    """Sites are added singly, several at once or by preset (without repeats), and removed."""
    state = make_state(profiles=KIDS)
    fields = {"id": "abcd1234", "action": "add_site"}
    policy.apply_profile_action(state, {**fields, "site": "tiktok.com, www.roblox.com"})
    policy.apply_profile_action(state, {**fields, "preset": "Roblox"})
    sites = state["profiles"]["abcd1234"]["sites"]
    assert set(policy.SITE_PRESETS["Roblox"]) <= set(sites)
    assert len(sites) == len(set(sites)) and "tiktok.com" in sites
    policy.apply_profile_action(state, {**fields, "action": "remove_site", "site": "tiktok.com"})
    assert "tiktok.com" not in state["profiles"]["abcd1234"]["sites"]


def test_bonus_given_ahead_pushes_the_block_back_and_can_be_revoked() -> None:
    """Before Friday's 21:00 block, 30 min of bonus moves it to 21:30; 15 more to 21:45.
    Given during bonus, more pushes the end out. Revoking puts the block back."""
    profile = copy.deepcopy(KIDS["abcd1234"])
    fri_2000 = FRI_2230_EST - dt.timedelta(hours=2, minutes=30)
    at = fri_2000.replace
    assert schedules.can_give_bonus(profile, fri_2000)
    schedules.apply_override(profile, "bonus", "30", fri_2000)
    assert schedules.profile_block_reason(profile, at(hour=21, minute=10)) is None
    assert schedules.profile_block_reason(profile, at(hour=21, minute=30)) == "scheduled"
    assert schedules.next_change(profile, fri_2000) == at(hour=21, minute=30)
    assert "Blocked from 21:30" in schedules.format_next_change(profile, fri_2000)

    schedules.apply_override(profile, "bonus", "15", fri_2000)  # more, ahead of time
    assert schedules.next_change(profile, fri_2000) == at(hour=21, minute=45)

    during = at(hour=21, minute=40)
    schedules.apply_override(profile, "bonus", "60", during)  # more, while it runs
    assert schedules.next_change(profile, during) == at(hour=22, minute=45)

    schedules.apply_override(profile, "end_bonus", "", during)
    assert schedules.profile_block_reason(profile, during) == "scheduled"
    assert "bonus_from" not in profile and "bonus_until" not in profile


def test_bonus_ahead_only_against_a_block_soon() -> None:
    """Bonus ahead needs a block within 24 hours; an earlier window doesn't lift a later
    schedule; a pause takes bonus away and refuses more."""
    profile = copy.deepcopy(KIDS["abcd1234"])  # Friday 21:00-07:00 only
    sat_noon = SAT_0630_EST.replace(hour=12)
    assert not schedules.can_give_bonus(profile, sat_noon)  # next block is 6 days off
    expect_value_error(schedules.apply_override, profile, "bonus", "30", sat_noon)

    profile["schedules"].append({"id": "s2", "days": [4], "start": "16:00", "end": "17:00"})
    fri_1500 = FRI_2230_EST.replace(hour=15, minute=0)
    schedules.apply_override(profile, "bonus", "30", fri_1500)  # for the 16:00 block
    assert schedules.profile_block_reason(profile, fri_1500.replace(hour=16, minute=10)) is None
    assert schedules.profile_block_reason(profile, fri_1500.replace(hour=21, minute=5)) == (
        "scheduled"  # the bonus was spent on the afternoon block
    )
    schedules.apply_override(profile, "pause", "", fri_1500)
    expect_value_error(schedules.apply_override, profile, "bonus", "30", fri_1500)
    schedules.apply_override(profile, "pause_for", "30", fri_1500)
    assert "bonus_until" not in profile


def test_old_bonus_without_a_start_still_counts() -> None:
    """Bonus saved before it could be given ahead (no bonus_from) lifts from the start."""
    profile = copy.deepcopy(KIDS["abcd1234"])
    profile["bonus_until"] = (FRI_2230_EST + dt.timedelta(minutes=20)).isoformat()
    assert schedules.profile_block_reason(profile, FRI_2230_EST) is None
    schedules.apply_override(profile, "bonus", "15", FRI_2230_EST)
    assert schedules.next_change(profile, FRI_2230_EST) == FRI_2230_EST + dt.timedelta(minutes=35)


def test_bonus_buttons_follow_the_state() -> None:
    """Ahead of a block: Bonus time. With bonus due: More bonus and Revoke. Paused: neither."""
    from curfew.web.components import override_controls, profile_state_html

    profile = copy.deepcopy(KIDS["abcd1234"])
    fri_2000 = FRI_2230_EST - dt.timedelta(hours=2, minutes=30)
    assert "Bonus time" in override_controls("abcd1234", profile, fri_2000)
    schedules.apply_override(profile, "bonus", "30", fri_2000)
    buttons = override_controls("abcd1234", profile, fri_2000)
    assert "More bonus" in buttons and "Revoke bonus" in buttons
    assert "bonus time 21:00–21:30" in profile_state_html(profile, fri_2000)
    schedules.apply_override(profile, "pause", "", fri_2000)
    assert "bonus" not in override_controls("abcd1234", profile, fri_2000).lower()


def test_the_pause_menus_until_resumed_is_an_open_pause() -> None:
    """Pause with "until resumed" pauses with no end, like the CLI's plain pause."""
    state = make_state({}, KIDS)
    profile_id = next(iter(state["profiles"]))
    policy.apply_profile_action(
        state, {"action": "pause_for", "id": profile_id, "minutes": "indefinite"}
    )
    profile = state["profiles"][profile_id]
    assert profile.get("paused") is True and not profile.get("pause_until")
