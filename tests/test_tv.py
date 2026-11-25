"""The TV dashboard: its own key, read-only, and the page it shows."""

import json
import urllib.parse

from helpers import MEMBER, NOW, lease, make_state, text

from curfew import __version__, frames, traffic
from curfew.state import save_state
from curfew.weather import Weather
from curfew.web import auth, layout
from curfew.web import server as web_server
from curfew.web.pages.flow import (
    FLOW_COOKIE,
    SAVER_COOKIE,
    SOUND_COOKIE,
    TV_FLOW,
    TV_FRAMES,
    TV_LIVE,
)
from curfew.web.pages.tv import TV_SETTINGS, render_tv


def test_the_tv_key_is_made_kept_and_replaced(tmp_path) -> None:
    """No key means no TV; a new key replaces the old, which stops working."""
    path = tmp_path / "tv-key"
    assert auth.read_tv_key(path) == "" and not auth.tv_key_valid("", path)
    first = auth.new_tv_key(path)
    assert auth.tv_key_valid(first, path) and path.stat().st_mode & 0o777 == 0o600
    second = auth.new_tv_key(path)
    assert auth.tv_key_valid(second, path) and not auth.tv_key_valid(first, path)


def test_the_tv_link_signs_the_tv_in_to_tv_only(server, monkeypatch, tmp_path, sandbox) -> None:
    """The link's key becomes a /tv-only cookie: the dashboard and its feed, nothing more."""
    _app, request = server
    tv_signed_in(monkeypatch, tmp_path, sandbox)
    path = tmp_path / "tv-key"
    key = auth.new_tv_key(path)
    monkeypatch.setattr(web_server, "tv_key_valid", lambda given: auth.tv_key_valid(given, path))
    response, _ = request("GET", f"/tv?key={key}", signed_in=False)
    cookie = response.getheader("Set-Cookie")
    assert response.status == 303 and response.getheader("Location") == "/tv"
    assert "Path=/tv;" in cookie and "HttpOnly" in cookie and "Secure" in cookie
    # The Fire TV's screensaver signs in the same way, and goes on to the screensaver.
    response, _ = request("GET", f"{TV_FLOW}?key={key}", signed_in=False)
    assert response.status == 303 and response.getheader("Location") == TV_FLOW
    tv = f"{auth.TV_COOKIE}={key}"
    response, body = request("GET", "/tv", signed_in=False, cookie=tv)
    assert response.status == 200 and "Busiest today" in body and 'data-theme="dark"' in body
    monkeypatch.setattr(
        web_server, "current_leases", lambda _now: {MEMBER: lease(MEMBER, "10.7.1.5")}
    )
    monkeypatch.setattr(traffic, "recent_lan_counters_read", lambda: (1, {"10.7.1.5": (900, 100)}))
    feed = json.loads(request("GET", f"{TV_LIVE}?devices=1", signed_in=False, cookie=tv)[1])
    assert feed["devices"] == {MEMBER: [900, 100]}
    # The key opens nothing else: not the pages, not their feeds, not a device's.
    assert request("GET", f"{TV_LIVE}?mac={MEMBER}", signed_in=False, cookie=tv)[0].status == 401
    assert request("GET", "/live.json", signed_in=False, cookie=tv)[0].status == 401
    _response, body = request("GET", "/devices", signed_in=False, cookie=tv)
    assert "/login" in body
    # A wrong or old key, or none, gets nothing.
    assert request("GET", "/tv?key=nope", signed_in=False)[0].status == 403
    assert request("GET", f"{TV_FLOW}?key=nope", signed_in=False)[0].status == 403
    assert request("GET", "/tv", signed_in=False, cookie=f"{auth.TV_COOKIE}=nope")[0].status == 403
    assert request("GET", TV_LIVE, signed_in=False)[0].status == 401
    # Signed in, the dashboard opens without the key too.
    assert request("GET", "/tv")[0].status == 200


def test_the_dashboard_shows_the_house_and_no_controls() -> None:
    """Tiles, the live view on the TV's feed, the busiest devices; no forms."""
    state = make_state()
    page = render_tv(state, {MEMBER: lease(MEMBER, "10.7.1.5")}, {}, NOW)
    assert f'data-src="{TV_LIVE}"' in page and "<form" not in page
    words = text(page)
    assert "Online now" in words and "Bandwidth" in words and "Busiest today" in words
    assert 'class="tv-page"' in page and "Sign out" not in words


def tv_signed_in(monkeypatch, tmp_path, sandbox) -> str:
    """Return the TV's cookie, with a fresh key the server checks against, and a quiet
    house: no leases, no Pi-hole, no dhcpd, no path to measure."""
    (sandbox / "dhcpd.leases").write_text("")
    (sandbox / "dhcpd.conf").write_text("")
    save_state(make_state())
    for name, stub in (
        ("path_now", lambda _leases, _devices: []),
        ("pihole_summary", lambda: None),
        ("read_pihole_groups", lambda: None),
        ("current_lease_records", lambda: {}),
        ("service_state", lambda: None),
        ("current_weather", lambda: Weather(4.2, "Light rain", 1.4, 6.0, 0.6)),
    ):
        monkeypatch.setattr(web_server, name, stub)
    path = tmp_path / "tv-key"
    key = auth.new_tv_key(path)
    monkeypatch.setattr(web_server, "tv_key_valid", lambda given: auth.tv_key_valid(given, path))
    return f"{auth.TV_COOKIE}={key}"


def test_the_tv_has_home_and_settings_only(server, monkeypatch, tmp_path, sandbox) -> None:
    """Home shows with no forms; the tabs are Home and Settings, linking /tv only."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    response, body = request("GET", "/tv", signed_in=False, cookie=tv)
    assert response.status == 200 and "Busiest today" in text(body)
    main = body.split("<main", 1)[1]
    assert "<form" not in main and "<button" not in main and "<input" not in main
    bar = body.split("<main")[0]
    assert 'href="/tv/settings"' in bar and 'href="/devices"' not in bar
    for gone in ("/tv/devices", "/tv/network", "/tv/usage"):
        assert f'href="{gone}"' not in bar
        assert request("GET", gone, signed_in=False, cookie=tv)[0].status != 200, gone


def test_settings_keeps_the_theme_on_the_tv(server, monkeypatch, tmp_path, sandbox) -> None:
    """Dark by default; picking light keeps it (a cookie), and the tabs follow."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    _response, body = request("GET", "/tv/settings", signed_in=False, cookie=tv)
    assert (
        'data-theme="dark"' in body
        and 'value="dark" class="tv-option" aria-pressed="true"' in body
    )
    response, _ = request("POST", TV_SETTINGS, "theme=light", signed_in=False, cookie=tv)
    assert response.status == 303 and response.getheader("Location") == "/tv/settings"
    assert f"{layout.THEME_COOKIE}=light" in response.getheader("Set-Cookie")
    light = f"{tv}; {layout.THEME_COOKIE}=light"
    _response, body = request("GET", "/tv", signed_in=False, cookie=light)
    assert 'data-theme="light"' in body
    # Only the TV (or someone signed in) can, and only to a theme there is.
    assert request("POST", TV_SETTINGS, "theme=light", signed_in=False)[0].status == 403
    assert request("POST", TV_SETTINGS, "theme=pink", signed_in=False, cookie=tv)[0].status == 403


def test_the_screensaver_setting_is_kept_and_reaches_the_pages(
    server, monkeypatch, tmp_path, sandbox
) -> None:
    """5 minutes by default; another choice (or off) is kept on the TV and tells the pages."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    _response, body = request("GET", "/tv", signed_in=False, cookie=tv)
    assert 'data-saver="5"' in body
    response, _ = request("POST", TV_SETTINGS, "saver=15", signed_in=False, cookie=tv)
    cookie = response.getheader("Set-Cookie")
    assert response.status == 303 and f"{SAVER_COOKIE}=15; Path=/tv;" in cookie
    _response, body = request("GET", "/tv", signed_in=False, cookie=f"{tv}; {SAVER_COOKIE}=off")
    assert 'data-saver=""' in body
    assert request("POST", TV_SETTINGS, "saver=99", signed_in=False, cookie=tv)[0].status == 403


def test_the_screensaver_sound_is_off_unless_chosen(
    server, monkeypatch, tmp_path, sandbox
) -> None:
    """Off by default; On is kept on the TV and tells the screensaver."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    _response, body = request("GET", TV_FLOW, signed_in=False, cookie=tv)
    assert 'data-sound="off"' in body
    response, _ = request("POST", TV_SETTINGS, "sound=full", signed_in=False, cookie=tv)
    cookie = response.getheader("Set-Cookie")
    assert response.status == 303 and f"{SOUND_COOKIE}=full; Path=/tv;" in cookie
    # "on" is what full was, and a TV may keep it yet.
    for kept, now in (("full", "full"), ("background", "background"), ("on", "full")):
        cookie = f"{tv}; {SOUND_COOKIE}={kept}"
        body = request("GET", TV_FLOW, signed_in=False, cookie=cookie)[1]
        assert f'data-sound="{now}"' in body
    _response, body = request("GET", TV_SETTINGS, signed_in=False, cookie=tv)
    assert "Screensaver sound" in body and "all but the engine" in body
    _response, body = request("GET", TV_FLOW, signed_in=False, cookie=tv)
    assert "<b>▲▼</b> sound" in body


def test_the_tv_shows_curfews_version(server, monkeypatch, tmp_path, sandbox) -> None:
    """The bar says which curfew it is, on every tab."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    _response, body = request("GET", "/tv", signed_in=False, cookie=tv)
    assert f'<span class="tv-version">curfew {__version__}</span>' in body
    assert request("POST", TV_SETTINGS, "sound=loud", signed_in=False, cookie=tv)[0].status == 403


def test_the_screensaver_draws_the_house_and_returns_to_its_tab(
    server, monkeypatch, tmp_path, sandbox
) -> None:
    """The flow page carries the devices to draw and the TV feed; back is a TV tab only."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    response, body = request("GET", "/tv/flow?back=/tv/settings", signed_in=False, cookie=tv)
    assert response.status == 200 and 'id="flow"' in body and f'data-src="{TV_LIVE}"' in body
    assert 'data-back="/tv/settings"' in body and 'class="tv-page tv-saver"' in body
    assert "4°" in text(body) and "Light rain" in text(body) and "high 6°" in text(body)
    assert "calm" in text(body)
    assert 'class="icon"' in body.split('class="flow-weather"')[1].split("</strong>")[0]
    assert 'data-weather="{&quot;code&quot;: 0, &quot;temp&quot;: 4.2,' in body
    _response, body = request("GET", "/tv/flow?back=/devices", signed_in=False, cookie=tv)
    assert 'data-back="/tv"' in body  # not a TV tab: home instead
    # Not signed in: the app says so, as it can't sign in; a browser gets the sign-in page.
    app_agent = "Mozilla/5.0 (Linux; Android 9; AFTMM; wv) AppleWebKit/537.36"
    response, body = request("GET", "/tv/flow", signed_in=False, agent=app_agent)
    assert response.status == 403 and "isn't signed in" in text(body)
    response, _ = request("GET", "/tv/flow?back=%2F", signed_in=False)
    assert (response.status, response.getheader("Location")) == (303, "/flow?back=%2F")
    assert 'action="/login"' in request("GET", "/flow?back=%2F", signed_in=False)[1]


def test_the_screensaver_has_facts_the_house_and_the_internet_in_turn() -> None:
    """The house's own (devices online, the line's speed) between facts about the internet."""
    from curfew.web.pages.devices import collect_rows  # noqa: PLC0415
    from curfew.web.pages.flow import INTERNET_FACTS, flow_facts  # noqa: PLC0415

    state = make_state({MEMBER: {"name": "kid-ipad"}})
    rows, _private = collect_rows(state, {MEMBER: lease(MEMBER, "10.7.1.5")}, {}, NOW, False)
    facts = flow_facts(rows, {}, {}, (357e6, 154e6))
    assert facts[0].startswith("1 device is online right now")
    assert facts[1] in INTERNET_FACTS and facts[2] in INTERNET_FACTS  # house, then two
    assert facts[3].startswith("The last speed test")
    assert any("357 Mb/s down" in fact and "112 seconds" in fact for fact in facts)
    assert set(INTERNET_FACTS) <= set(facts)


def test_the_screensaver_look_is_kept_on_the_tv(server, monkeypatch, tmp_path, sandbox) -> None:
    """Space unless the TV keeps Simple (from Settings, or OK on the screensaver)."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    monkeypatch.setattr(web_server, "block_rate", lambda: 0.25)
    _response, body = request("GET", "/tv/flow", signed_in=False, cookie=tv)
    assert 'data-look="space"' in body and "flow-horizon" in body
    response, _ = request("POST", TV_SETTINGS, "flow=simple", signed_in=False, cookie=tv)
    assert f"{FLOW_COOKIE}=simple; Path=/tv;" in response.getheader("Set-Cookie")
    _response, body = request(
        "GET", "/tv/flow", signed_in=False, cookie=f"{tv}; {FLOW_COOKIE}=simple"
    )
    assert 'data-look="simple"' in body and "flow-horizon" in body  # space behind both
    _response, body = request(
        "GET", "/tv/flow", signed_in=False, cookie=f"{tv}; {FLOW_COOKIE}=forest"
    )
    assert 'data-look="forest"' in body and 'class="tv-flow flow-forest"' in body
    _response, body = request(
        "GET", "/tv/flow", signed_in=False, cookie=f"{tv}; {FLOW_COOKIE}=highway"
    )
    assert 'data-look="highway"' in body and "flow-highway.js" in body
    shield = json.loads(request("GET", f"{TV_LIVE}?pihole=1", signed_in=False, cookie=tv)[1])
    assert shield["blocked"] == 0.25 and shield["testing"] is False


def test_the_tv_feed_says_which_devices_are_cut_off(
    server, monkeypatch, tmp_path, sandbox
) -> None:
    """The screensaver's device feed lists the online devices without internet now."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    save_state(make_state({MEMBER: {"name": "kid-ipad", "blocked": True}}))
    monkeypatch.setattr(
        web_server, "current_leases", lambda _now: {MEMBER: lease(MEMBER, "10.7.1.5")}
    )
    monkeypatch.setattr(traffic, "recent_lan_counters_read", lambda: (1, {"10.7.1.5": (900, 100)}))
    feed = json.loads(request("GET", f"{TV_LIVE}?devices=1", signed_in=False, cookie=tv)[1])
    assert feed["devices"] == {MEMBER: [900, 100]} and feed["cut"] == [MEMBER]


def test_a_read_only_account_sees_home_and_the_screensaver_only(
    server, monkeypatch, tmp_path, sandbox
) -> None:
    """A viewer gets Home's figures (no links, no forms, no sections) and the screensaver;
    every other page sends it Home, the parts and changes are refused."""
    app, request = server
    tv_signed_in(monkeypatch, tmp_path, sandbox)  # (a quiet house; the TV's cookie unused)
    monkeypatch.setattr(traffic, "recent_lan_counters_read", lambda: (1, {}))
    monkeypatch.setattr(web_server, "VIEWERS", frozenset({"cy"}))
    viewer = f"{web_server.SESSION_COOKIE}={app.sessions.create('cy')}"
    response, body = request("GET", "/", signed_in=False, cookie=viewer)
    assert response.status == 200 and "tiles" in body
    assert '<nav class="primary"' not in body and 'class="tile"' in body
    assert '<a class="tile' not in body and 'href="/usage"' not in body
    assert 'action="/device"' not in body and 'action="/profile"' not in body
    assert 'href="/flow?back=%2F"' in body and 'action="/logout"' in body
    for path in ("/devices", "/network", f"/device?mac={MEMBER}", "/tv", "/tv/settings"):
        response, _ = request("GET", path, signed_in=False, cookie=viewer)
        assert (response.status, response.getheader("Location")) == (303, "/"), path
    assert request("GET", "/network/path", signed_in=False, cookie=viewer)[0].status == 401
    response, _ = request(
        "POST", "/device", f"mac={MEMBER}&action=block", signed_in=False, cookie=viewer
    )
    assert response.status == 403 and not app.state["devices"].get(MEMBER, {}).get("blocked")
    seen = f"{viewer}; {FLOW_COOKIE}=town"
    response, body = request("GET", "/flow?back=%2F", signed_in=False, cookie=seen)
    assert response.status == 200 and 'data-back="/"' in body
    assert (
        request("GET", "/tv/live.json?devices=1", signed_in=False, cookie=viewer)[0].status == 200
    )
    # An admin still has every section.
    assert '<nav class="primary"' in request("GET", "/")[1]


def test_flow_is_at_flow_for_whoever_is_signed_in(server, monkeypatch, tmp_path, sandbox) -> None:
    """Not at /tv/flow, which is a TV's: that sends a browser on, with what it kept there."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    kept = f"{FLOW_COOKIE}=highway; {SOUND_COOKIE}=on; curfew_zen=1"
    # An old bookmark, or the first visit to /flow, which comes by way of it.
    response, _ = request("GET", "/flow?back=%2F")
    assert (response.status, response.getheader("Location")) == (303, "/tv/flow?back=%2F")
    response, _ = request("GET", "/tv/flow?back=%2F", cookie=kept)
    assert (response.status, response.getheader("Location")) == (303, "/flow?back=%2F")
    cookies = response.headers.get_all("Set-Cookie")
    moved = kept.replace("=on", "=full")  # (as it was called)
    assert [cookie.split(";")[0] for cookie in cookies] == moved.split("; ")
    assert all("Path=/flow;" in cookie for cookie in cookies)
    # With none kept, the theme still is, or the two would send it to and fro.
    response, _ = request("GET", "/tv/flow")
    assert response.getheader("Set-Cookie").startswith(f"{FLOW_COOKIE}=space; Path=/flow;")
    response, body = request("GET", "/flow?back=%2F", cookie=kept)
    assert response.status == 200 and 'data-look="highway"' in body and 'data-sound="full"' in body
    assert 'data-back="/"' in body and "<title>Flow · curfew</title>" in body
    assert 'data-back="/"' in request("GET", "/flow?back=/evil", cookie=kept)[1]
    # A TV keeps its own address, though it's signed in too; its key doesn't open /flow.
    response, body = request("GET", "/tv/flow", cookie=tv)
    assert response.status == 200 and 'data-back="/tv"' in body
    body = request("GET", "/flow", signed_in=False, cookie=f"{tv}; {kept}")[1]
    assert 'id="flow"' not in body and 'action="/login"' in body


def test_the_highway_is_served_joined_from_its_parts() -> None:
    """Highway's parts, in their names' order, make the one script: its factory, whole."""
    script = layout.FLOW_SCRIPTS["flow-highway.js"]
    names = [part.name for part in layout.HIGHWAY_PARTS]
    assert names == sorted(names) and len(names) >= 10
    assert script.startswith("// curfew's screensaver: Highway")
    assert "flowScenes.highway = function (flow) {" in script and script.rstrip().endswith("};")


def test_the_screensaver_reports_its_frames(server, monkeypatch, tmp_path, sandbox) -> None:
    """A TV's report is kept a line at a time, known fields only; others are refused."""
    _app, request = server
    tv = tv_signed_in(monkeypatch, tmp_path, sandbox)
    log = tmp_path / "frames.jsonl"
    monkeypatch.setattr(
        web_server, "keep_report", lambda report, address: frames.keep_report(report, address, log)
    )
    report = {"look": "highway", "fps": 30, "frames": 1790, "gap95": 41.2, "app": True}
    report |= {"tick": 41.7, "keys": "ArrowUp " * 40}
    report["evil"] = "x" * 900
    body = "report=" + urllib.parse.quote(json.dumps(report))
    assert request("POST", TV_FRAMES, body, signed_in=False, cookie=tv)[0].status == 204
    kept = json.loads(log.read_text().splitlines()[-1])
    assert kept["look"] == "highway" and kept["fps"] == 30
    assert kept["gap95"] == 41.2 and kept["app"] is True
    assert kept["tick"] == 41.7 and len(kept["keys"]) == 120
    assert "evil" not in kept and "at" in kept and "from" in kept
    assert request("POST", TV_FRAMES, body, signed_in=False)[0].status == 401
    garbled = request("POST", TV_FRAMES, "report=nonsense", signed_in=False, cookie=tv)
    assert garbled[0].status == 400
