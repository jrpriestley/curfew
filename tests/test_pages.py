"""Pages, checked by what they let you do (forms) and say (text), not markup."""

import copy
import datetime as dt
import json
import re
import struct
import zlib

from helpers import (
    FRI_2230,
    KIDS,
    LEASES,
    MEMBER,
    NOW,
    actions,
    forms,
    lease,
    make_state,
    text,
    text_outside_charts,
    traffic_db,
)

from curfew import leases as dhcp
from curfew import policy, traffic
from curfew.web import charts, components, icons, layout
from curfew.web.pages import device as device_page
from curfew.web.pages import devices as devices_page
from curfew.web.pages import home as home_page
from curfew.web.pages import network as network_page
from curfew.web.pages import profile as profile_page
from curfew.web.pages import usage as usage_page


def test_pages_escape_names() -> None:
    """Names typed by people are escaped on every page that shows them."""
    devices = {MEMBER: {"name": "<script>x</script>"}}
    profiles = {"abcd1234": {**KIDS["abcd1234"], "name": "<b>Kids</b>"}}
    state = make_state(devices, profiles)
    leases = {MEMBER: lease(MEMBER)}
    pages = [
        devices_page.render_devices(state, leases, {}, True, False, NOW),
        home_page.render_home(state, leases, {}, True, NOW),
        profile_page.render_profile(state, "abcd1234", leases, {}, NOW),
    ]
    for page in pages:
        assert "<script>x</script>" not in page and "<b>Kids</b>" not in page


def test_devices_page_offers_the_right_actions() -> None:
    """Each device can be renamed and blocked; blocked ones unblocked; private ones allowed."""
    # a8: is a globally assigned MAC; aa: and da: have the private bit set.
    plain, private, blocked = "a8:bb:cc:dd:ee:09", "da:a1:19:00:00:01", "a8:bb:cc:dd:ee:0a"
    state = make_state({blocked: {"blocked": True}}, private=True)
    leases = {mac: lease(mac, name=f"dev-{mac[-2:]}") for mac in (plain, private, blocked)}
    page = devices_page.render_devices(state, leases, {}, True, False, NOW)
    offered = actions(page, "/device")
    for mac in (plain, private, blocked):
        assert ("rename", mac) in offered
    assert ("block", plain) in offered and ("unblock", blocked) in offered
    assert ("allow", private) in offered and ("allow", plain) not in offered
    shown = text(page)
    assert "10.7.1.9" in shown and plain in shown  # IP and MAC are on the page (opened row)
    # Each row opens (its ▸) to a hidden row holding its facts and controls; no ⓘ.
    row, opened = page.split(f'<tr class="dev-row" data-key="{plain}"')[1].split("</tr>", 1)
    assert f'aria-controls="more-{plain.replace(":", "")}"' in row and "info-btn" not in row
    assert 'class="dev-more"' in opened.split("</tr>")[0] and " hidden>" in opened
    assert "/device" in opened.split("</tr>")[0] and "Block" in opened.split("</tr>")[0]
    # The private-address switch is on, so it offers to turn off.
    assert {"block_private": "off"} in [form["fields"] for form in forms(page)]


def test_the_device_list_offers_its_types_to_filter_by() -> None:
    """Only the types listed, by name with how many; each row carries its own, set or guessed."""
    phones, tv = ("a8:bb:cc:dd:ee:01", "a8:bb:cc:dd:ee:02"), "a8:bb:cc:dd:ee:03"
    names = {phones[0]: {"name": "mums-iphone"}, phones[1]: {"name": "odd", "kind": "phone"}}
    state = make_state(names | {tv: {"name": "kitchen-tv"}})
    leases = {mac: lease(mac) for mac in (*phones, tv)}
    page = devices_page.render_devices(state, leases, {}, True, False, NOW)
    menu = page.split('<select id="type-filter">')[1].split("</select>")[0]
    assert re.findall(r">([^<]+)</option>", menu) == ["All types", "Phone (2)", "TV/streamer (1)"]
    assert f'data-key="{phones[1]}" data-kind="phone"' in page
    assert f'data-key="{tv}" data-kind="tv"' in page


def test_devices_split_into_unknown_and_known_folds() -> None:
    """Unnamed devices (or ones awaiting approval) fold apart from known ones; Options
    start shut; each fold opens or shuts as the visitor's cookie last left it."""
    named, unnamed, waiting = "a8:bb:cc:dd:ee:09", "a8:bb:cc:dd:ee:0b", "a8:bb:cc:dd:ee:0c"
    state = make_state({named: {"name": "Kitchen TV", "known": True}, waiting: {"name": "Pad"}})
    state["settings"]["block_unknown"] = True
    leases = {mac: lease(mac) for mac in (named, unnamed, waiting)}
    page = devices_page.render_devices(state, leases, {}, True, False, NOW)
    known_part = page.split('data-fold="known"')[1].split('data-fold="unknown"')[0]
    unknown_part = page.split('data-fold="unknown"')[1]  # Known comes first
    assert unnamed in unknown_part and waiting in unknown_part and named not in unknown_part
    assert named in known_part and unnamed not in known_part
    assert '<details class="fold" data-fold="options">' in page  # shut by default
    assert '<details class="fold" data-fold="known" open>' in page
    folds = components.parse_folds("options:1/known:0/bad:x/<b>:1")
    assert folds == {"options": True, "known": False}
    page = devices_page.render_devices(state, leases, {}, True, False, NOW, folds=folds)
    assert 'data-fold="options" open>' in page and 'data-fold="known">' in page
    assert 'role="switch" aria-checked="false"' in page  # "show all" is a switch, off


def test_devices_page_hides_stale_devices_unless_asked() -> None:
    """Old unnamed devices are hidden by default and shown with "all"."""
    leases = dhcp.parse_leases(LEASES, NOW)
    state = make_state()
    assert "58:e4:88:00:00:03" not in devices_page.render_devices(
        state, leases, {}, True, False, NOW
    )
    assert "58:e4:88:00:00:03" in devices_page.render_devices(state, leases, {}, True, True, NOW)
    assert "isn't running" in text(
        devices_page.render_devices(state, leases, {}, False, False, NOW)
    )


def test_devices_sort_orders_rows() -> None:
    """Each sort orders the table as named; sorting by profile groups under headings."""
    member = lease(MEMBER, "10.7.1.5", "zz-tablet")
    other = lease("aa:bb:cc:dd:ee:02", "10.7.1.6", "aa-laptop", online=False)
    leases = {member.mac: member, other.mac: other}
    state = make_state(profiles=KIDS)
    by_name = text_outside_charts(devices_page.render_devices(state, leases, {}, True, False, NOW))
    assert by_name.index("aa-laptop") < by_name.index("zz-tablet")
    render = devices_page.render_devices
    by_profile = text_outside_charts(render(state, leases, {}, True, False, NOW, "profile"))
    assert by_profile.index("zz-tablet") < by_profile.index("No profile")
    assert by_profile.index("No profile") < by_profile.index("aa-laptop")
    assert devices_page.view_from_query("all=1&sort=bogus&dir=up") == (True, "name", False)
    for view in ((True, "seen", True), (False, "seen", False), (True, "name", True)):
        url = devices_page.main_url(*view)
        assert devices_page.view_from_query(url.partition("?")[2]) == view
    assert devices_page.main_url(False, "seen", True) == "/devices?sort=seen"  # natural: no dir
    # The current column's header turns it around; Z-A puts zz-tablet first.
    page = render(state, leases, {}, True, False, NOW, descending=True)
    assert 'aria-sort="descending"' in page and 'href="/devices"' in page
    by_name_back = text_outside_charts(page)
    assert by_name_back.index("zz-tablet") < by_name_back.index("aa-laptop")


def test_today_column_and_usage_pages() -> None:
    """Heavy users sort first by Today; usage pages render for connection, device, profile."""
    connection = traffic_db()
    midnight = traffic.local_midnight(NOW)
    heavy_mac = "aa:bb:cc:dd:ee:02"
    connection.execute("INSERT INTO fine VALUES (?, ?, 5000000, 0)", (midnight, heavy_mac))
    connection.execute("INSERT INTO fine VALUES (?, 'wan', 6000000, 10)", (midnight,))
    leases = {MEMBER: lease(MEMBER, name="aa-light"), heavy_mac: lease(heavy_mac, name="zz-heavy")}
    state = make_state(profiles=KIDS)
    page = text_outside_charts(
        devices_page.render_devices(state, leases, {}, True, False, NOW, "today", connection)
    )
    assert page.index("zz-heavy") < page.index("aa-light") and "5.0 MB" in page
    for target in (("wan", ""), ("profile", "abcd1234")):
        assert "Last 7 days" in text(
            usage_page.render_usage(state, leases, {}, connection, target, "7d", NOW)
        )
    device = text(device_page.render_device(state, heavy_mac, leases, {}, connection, "7d", NOW))
    assert "Last 7 days" in device and "zz-heavy" in device
    wan = text(usage_page.render_usage(state, leases, {}, connection, ("wan", ""), "24h", NOW))
    assert "zz-heavy" in wan  # top devices
    assert usage_page.usage_target(state, {"mac": ["nope"]}) is None
    assert usage_page.usage_target(state, {"profile": ["abcd1234"]}) == ("profile", "abcd1234")


def test_usage_chart_reports_totals() -> None:
    """A chart states its totals (legend, accessible label, per-bar tips); empty says so."""
    edges = traffic.range_edges("24h", NOW)
    series = [(start, 0, 0) for start in edges[:-1]]
    series[-1] = (edges[-2], 2_000_000, 300_000)
    block = charts.usage_block(series, "24h", "whole connection")
    assert "2.0 MB" in text(block) and "300 kB" in text(block)
    assert "2.0 MB" in charts.usage_chart_svg(series, "24h", "whole connection")
    empty = charts.usage_block([(start, 0, 0) for start in edges[:-1]], "24h", "x")
    assert "No internet traffic" in text(empty)


def test_home_summary_profiles_and_queue() -> None:
    """Home shows the tiles' figures, each profile's facts and controls, and waiting devices."""
    newcomer = "aa:bb:cc:dd:ee:09"
    state = make_state({MEMBER: {"known": True}}, KIDS)
    state["settings"]["block_unknown"] = True
    leases = {MEMBER: lease(MEMBER, name="tablet"), newcomer: lease(newcomer, name="newphone")}
    page = home_page.render_home(state, leases, {}, True, NOW)
    shown = text(page)
    assert "Online now 2" in shown and "Kids" in shown and "newphone" in shown
    offered = actions(page)
    assert ("pause_for", None) in offered and ("pause_all", None) in offered
    # One Pause per profile, with how long always in words: until resumed, or a while.
    assert ">until resumed</option>" in page and "Pause now" not in page
    assert ("approve", newcomer) in offered and ("create", None) in offered
    # The name box travels with Approve, so a name can be given while approving.
    approve = next(form for form in forms(page) if form["fields"].get("action") == "approve")
    assert "name" in approve["fields"]


def test_profile_page_matches_devices_page_controls() -> None:
    """A profile's devices get the same controls as the Devices page, plus Remove."""
    private = "da:a1:19:00:00:01"
    state = make_state({private: {"blocked": True}}, KIDS, private=True)
    state["profiles"]["abcd1234"]["members"] = [private]
    leases = {private: lease(private, name="tablet")}
    page = profile_page.render_profile(state, "abcd1234", leases, {}, NOW)
    offered = actions(page)
    assert {("unblock", private), ("rename", private), ("set_profile", private)} <= offered
    state["devices"][private]["blocked"] = False
    offered = actions(profile_page.render_profile(state, "abcd1234", leases, {}, NOW))
    assert ("block", private) in offered and ("allow", private) in offered


def test_profile_page_add_device_by_name() -> None:
    """The add-device list shows names, with the IP only to tell duplicates apart."""
    macs = ["aa:bb:cc:dd:ee:01", "aa:bb:cc:dd:ee:02", "aa:bb:cc:dd:ee:03"]
    leases = {mac: lease(mac, f"10.7.1.{index}") for index, mac in enumerate(macs, 1)}
    devices = {macs[0]: {"name": "Tablet"}, macs[1]: {"name": "Lamp"}, macs[2]: {"name": "Lamp"}}
    state = make_state(devices, {"abcd1234": {"name": "Kids", "members": [], "schedules": []}})
    page = profile_page.render_profile(state, "abcd1234", leases, {}, NOW)
    options = re.findall(r"<option[^>]*>([^<]*)</option>", page)
    assert "Tablet" in options and "Lamp · 10.7.1.2" in options and "Lamp · 10.7.1.3" in options
    assert not any(mac in option for option in options for mac in macs)


def test_profile_page_offers_unused_presets() -> None:
    """Quick-add buttons appear only for presets not already fully added."""
    state = make_state(profiles=KIDS)
    state["profiles"]["abcd1234"]["sites"] = list(policy.SITE_PRESETS["Roblox"])
    page = profile_page.render_profile(state, "abcd1234", {}, {}, NOW)
    presets = {form["fields"].get("preset") for form in forms(page)} - {None}
    assert "Roblox" not in presets and "YouTube" in presets


def test_week_timeline_describes_windows() -> None:
    """The week chart's text gives each blocked window and the weekly total."""
    week = text(charts.week_timeline_svg(copy.deepcopy(KIDS["abcd1234"]), FRI_2230))
    assert "Fri 21:00–24:00" in week and "Sat 00:00–07:00" in week
    assert "10 h" in charts.week_timeline_svg(KIDS["abcd1234"], FRI_2230)


def test_icon_and_manifest() -> None:
    """The home-screen icon is a PNG of the requested size; the manifest points at icons."""
    data = icons.icon_png(32)
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert struct.unpack(">II", data[16:24]) == (32, 32)
    raw = zlib.decompress(data[data.index(b"IDAT") + 4 : data.index(b"IEND") - 8])
    assert raw[1:4] == bytes(icons.ICON_BACKGROUND)  # corner pixel is background
    manifest = json.loads(icons.manifest())
    assert manifest["display"] == "standalone" and manifest["icons"]


def test_calendar_section_reports_daily_totals() -> None:
    """The usage calendar names days with their totals and has a table version."""
    connection = traffic_db()
    now = dt.datetime(2026, 11, 8, 12, 0).astimezone()
    connection.execute("INSERT INTO fine VALUES (?, 'wan', 4000000, 0)", (int(now.timestamp()),))
    section = charts.render_calendar(connection, ["wan"], now)
    assert "4.0 MB" in text(section) and now.strftime("%b %-d") in text(section)
    assert charts.render_calendar(traffic_db(), ["wan"], now) == ""


def test_constellation_shows_every_device_inside_the_chart() -> None:
    """Every device appears with its state; dots stay inside the chart; layout is stable."""
    stars = [
        charts.Star(
            f"a8:bb:cc:dd:ee:{i:02x}", f"device-{i}", kind, i % 3 != 0, i % 5 != 0, i * 1000
        )
        for i, kind in enumerate(["phone", "tv", "smart", "phone", "computer"] * 12)
    ]
    svg = charts.constellation_svg(stars)
    titles = re.findall(r"<title>([^<]*)</title>", svg)
    assert len(titles) == len(stars)
    assert all(any(f"device-{i} " in title for title in titles) for i in range(len(stars)))
    assert sum("no internet" in title for title in titles) == sum(not s.allowed for s in stars)
    online = sum(s.online for s in stars)
    assert f"{len(stars)} devices: {online} online" in svg
    box = re.search(r'viewBox="([^"]+)"', svg).group(1).split()
    left, top, width, height = map(float, box)
    for x, y in re.findall(r'class="star [^"]*" cx="([\d.]+)" cy="([\d.]+)"', svg):
        assert left < float(x) < left + width and top < float(y) < top + height
    assert charts.constellation_svg(list(reversed(stars))) == svg  # same picture every time
    assert charts.render_constellation([]) == ""


def test_each_page_shows_its_own_things() -> None:
    """Devices is just devices; the constellation and Pi-hole live on Network; Home has neither."""
    state = make_state(profiles=KIDS)
    leases = {MEMBER: lease(MEMBER, name="tablet")}
    summary = {"queries": {"total": 10, "blocked": 4, "status": {"GRAVITY": 4}}}
    groups = [
        {
            "name": "AV",
            "enabled": True,
            "description": "",
            "default": False,
            "clients": [("10.7.2.0/24", "")],
            "lists": [],
            "rules": [],
            "doh": 0,
        }
    ]
    network = text(network_page.render_network(state, leases, {}, NOW, None, summary, groups))
    assert "Constellation" in network and "Pi-hole" in network and "10.7.2.0/24" in network
    devices = text(devices_page.render_devices(state, leases, {}, True, False, NOW))
    assert "Constellation" not in devices and "Pi-hole" not in devices and "tablet" in devices
    home = text(home_page.render_home(state, leases, {}, True, NOW))
    assert "Constellation" not in home and "Pi-hole" not in home and "Right now" in home


def test_constellation_labels_never_overlap() -> None:
    """Many small neighbouring groups still get labels that don't sit on each other."""
    kinds = list(charts.KIND_LABELS)
    for counts in ([1] * len(kinds), [40, 1, 1, 2, 1, 1, 3, 1, 1, 1, 1, 1], [3, 4, 3, 28, 2, 1]):
        stars = [
            charts.Star(f"a8:bb:cc:00:{g:02x}:{i:02x}", f"d{g}-{i}", kind, True, True, i)
            for g, (kind, count) in enumerate(zip(kinds, counts, strict=False))
            for i in range(count)
        ]
        svg = charts.constellation_svg(stars)
        boxes = [
            charts.label_box(float(x), float(y), anchor, label)
            for x, y, anchor, label in re.findall(
                r'<text class="c-label" x="([\d.-]+)" y="([\d.-]+)" text-anchor="(\w+)" '
                r'font-size="11">([^<]+)</text>',
                svg,
            )
        ]
        assert len(boxes) == len({star.kind for star in stars})
        for index, box in enumerate(boxes):
            assert not any(charts.boxes_overlap(box, other) for other in boxes[index + 1 :])


def test_device_page_explains_status_and_offers_controls() -> None:
    """A device page says why it is blocked, when that ends, and offers its controls."""
    connection = traffic_db()
    start = int(NOW.timestamp()) // 300 * 300 - 3600
    for offset in (0, 300, 600, 1500):  # 15 min apart at most: one spell
        connection.execute(
            "INSERT INTO fine VALUES (?, ?, 400000, 100000)", (start + offset, MEMBER)
        )
    connection.execute("INSERT INTO seen VALUES (?, ?)", (MEMBER, start - 86400 * 3))
    state = make_state(profiles=KIDS)
    leases = {MEMBER: lease(MEMBER, ip="10.7.1.77", name="kid-ipad")}
    page = device_page.render_device(state, MEMBER, leases, {}, connection, "24h", FRI_2230)
    words = text_outside_charts(page)
    assert "Scheduled" in words and "Allowed again" in words and "Kids" in words
    assert "10.7.1.77" in words and MEMBER in words and "Tablet" in words
    assert "2.0 MB" in words  # the one spell: four buckets of 0.5 MB
    assert {("block", MEMBER), ("set_profile", MEMBER)} <= actions(page)
    assert ("rename", MEMBER) in actions(page, "/device")
    assert ("type", MEMBER) in actions(page, "/device")
    assert "Automatic (Tablet)" in page and "(a guess)" in words
    menu = page.split('<select name="kind">')[1].split("</select>")[0]
    labels = re.findall(r">([^<]+)</option>", menu)
    assert labels[1:] == sorted(labels[1:], key=str.lower) and len(labels) == 13
    chosen = make_state({MEMBER: {"kind": "tv"}}, profiles=KIDS)
    page = device_page.render_device(chosen, MEMBER, leases, {}, connection, "24h", FRI_2230)
    assert '<option value="tv" selected>' in page and "(a guess)" not in page
    # One drop-down sets its profile, or none.
    profiles = page.split('<select name="id">')[1].split("</select>")[0]
    assert '<option value="">None</option>' in profiles and "selected>Kids" in profiles
    assert 'class="dev-icon" title="TV/streamer"' in page
    blocked = make_state({MEMBER: {"blocked": True}}, profiles=KIDS)
    words = text(device_page.render_device(blocked, MEMBER, leases, {}, None, "24h", FRI_2230))
    assert "Blocked by hand" in words and "Allowed again" not in words
    assert "Not in use" in words


def test_device_names_link_to_their_page() -> None:
    """A device's opened row links to its page; the Today figure does too."""
    connection = traffic_db()
    midnight = traffic.local_midnight(NOW)
    connection.execute("INSERT INTO fine VALUES (?, ?, 5000000, 0)", (midnight, MEMBER))
    leases = {MEMBER: lease(MEMBER, name="kid-ipad")}
    page = devices_page.render_devices(
        make_state(), leases, {}, True, False, NOW, "name", connection
    )
    assert page.count(f'href="/device?mac={MEMBER}"') == 2
    assert "/usage?mac=" not in page


def test_top_bar_tip_stays_off_its_controls() -> None:
    """The sky's tooltip is on a layer behind the bar, not on anything holding controls."""
    bar = layout.chrome("home", "", ("day", "Day at homehub (12:00)"))
    assert '<span class="sky-tip" title="Day at homehub (12:00)">' in bar
    # the tip, Flow's link, the theme menu and signing out
    assert bar.count("title=") == bar.count('title="') == 4
