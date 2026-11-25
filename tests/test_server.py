"""The real request handler: sign-in, redirects, theme, assets."""

import http.client
import json

from helpers import MEMBER, actions, forms, lease, make_state, text

from curfew import config, traffic
from curfew.config import STATE_FILE
from curfew.state import save_state
from curfew.web import layout
from curfew.web import server as web_server
from curfew.web.undo import FLASH_COOKIE


def test_requests_need_a_session(server) -> None:
    """Signed out: pages show the login, the live feed refuses, posts change nothing."""
    app, request = server
    response, body = request("GET", "/devices", signed_in=False)
    assert response.status == 200 and ("login", None) not in actions(body)
    assert any(form["url"] == "/login" for form in forms(body))
    assert request("GET", "/live.json", signed_in=False)[0].status == 401
    response, _ = request("POST", "/device", f"mac={MEMBER}&action=block", signed_in=False)
    assert response.status == 303 and MEMBER not in app.state["devices"]
    assert request("GET", "/nowhere")[0].status == 404


def test_device_post_changes_state_and_returns_to_its_page(server) -> None:
    """A device action applies and redirects back to the page it came from, view kept."""
    app, request = server
    response, _ = request(
        "POST", "/device", f"mac={MEMBER}&action=block", referer="/devices?sort=seen"
    )
    assert app.state["devices"][MEMBER]["blocked"] is True
    assert response.status == 303 and response.getheader("Location") == "/devices?sort=seen"
    # Another site's page, even one with a path like ours, sends you home.
    response, _ = request(
        "POST", "/device", f"mac={MEMBER}&action=unblock", referer="https://evil.example/devices"
    )
    assert response.getheader("Location") == "/"


def test_theme_choice_is_remembered(server) -> None:
    """Choosing a theme sets a cookie; pages then carry it; System clears it."""
    _app, request = server
    response, _ = request("POST", "/theme", "theme=dark", referer="/usage")
    assert response.getheader("Location") == "/usage"
    assert f"{layout.THEME_COOKIE}=dark" in response.getheader("Set-Cookie")
    # Lax, not Strict: iOS Safari reopening the page counts as arriving from
    # elsewhere and would leave a Strict cookie (the session too) behind.
    assert "SameSite=Lax" in response.getheader("Set-Cookie")
    _response, body = request("GET", "/nowhere", cookie=f"{layout.THEME_COOKIE}=dark")
    assert 'data-theme="dark"' in body.split("<head>")[0]
    _response, body = request("GET", "/nowhere", cookie=f"{layout.THEME_COOKIE}=evil")
    assert "data-theme" not in body.split("<head>")[0]
    response, _ = request("POST", "/theme", "theme=system")
    assert "Max-Age=0" in response.getheader("Set-Cookie")


def test_login_page_follows_and_offers_the_theme(server) -> None:
    """Signed out, the login page wears the chosen theme (browser bar too) and can change it."""
    _app, request = server
    _response, body = request("GET", "/", signed_in=False)
    assert any(form["url"] == "/theme" for form in forms(body))
    assert body.count('name="theme-color"') == 2  # no choice: follow the system
    _response, body = request("GET", "/", signed_in=False, cookie=f"{layout.THEME_COOKIE}=light")
    assert 'data-theme="light"' in body.split("<head>")[0]
    assert '<meta name="theme-color" content="#ffffff">' in body
    assert body.count('name="theme-color"') == 1
    response, _ = request("POST", "/theme", "theme=dark", signed_in=False)
    assert response.status == 303 and f"{layout.THEME_COOKIE}=dark" in response.getheader(
        "Set-Cookie"
    )


def test_shared_assets_are_served_publicly(server) -> None:
    """The stylesheet and script load without a session, and pages link to them."""
    _app, request = server
    response, css = request("GET", "/app.css", signed_in=False)
    assert response.status == 200 and css == layout.PAGE_STYLE
    response, script = request("GET", "/app.js", signed_in=False)
    assert response.status == 200 and "/live.json" in script
    _response, login = request("GET", "/", signed_in=False)
    assert "/app.css" in login


def test_fonts_are_served_and_a_missing_ember_is_not_found(server, tmp_path, monkeypatch) -> None:
    """Ember comes from homehub's own copy; only its own file names are served."""
    _app, request = server
    monkeypatch.setattr("curfew.web.server.EMBER_DIR", tmp_path)
    assert request("GET", "/inter.woff2", signed_in=False)[0].status == 200
    assert request("GET", "/ember-400.woff2")[0].status == 404
    (tmp_path / "ember-400.woff2").write_bytes(b"wOF2")
    (tmp_path / "secret.woff2").write_bytes(b"no")
    response, _ = request("GET", "/ember-400.woff2", signed_in=False)
    assert response.status == 200 and response.getheader("Content-Type") == "font/woff2"
    for other in ("/secret.woff2", "/ember-../secret.woff2", "/ember-4000.woff2"):
        assert request("GET", other)[0].status == 404


def test_device_page_and_old_usage_links(server, sandbox) -> None:
    """/device shows a known device; old /usage?mac= links redirect there; posts return."""
    _app, request = server
    (sandbox / "dhcpd.leases").write_text("")
    (sandbox / "dhcpd.conf").write_text("")
    save_state(make_state({MEMBER: {"name": "kid-ipad"}}))
    response, body = request("GET", f"/device?mac={MEMBER}")
    assert response.status == 200 and "kid-ipad" in text(body)
    response, _ = request("GET", f"/usage?mac={MEMBER}&range=7d")
    assert response.status == 303
    assert response.getheader("Location") == f"/device?mac={MEMBER}&range=7d"
    for missing in ("/device", "/device?mac=nope", "/device?mac=aa:bb:cc:dd:ee:99"):
        assert request("GET", missing)[0].getheader("Location") == "/devices"
    response, _ = request(
        "POST", "/device", f"mac={MEMBER}&action=block", referer=f"/device?mac={MEMBER}"
    )
    assert response.getheader("Location") == f"/device?mac={MEMBER}"
    STATE_FILE.unlink()


def flash_token(response) -> str:
    """Return the toast's token from a change's redirect."""
    cookie = response.getheader("Set-Cookie")
    assert cookie.startswith(f"{FLASH_COOKIE}=")
    return cookie.split(";")[0].split("=", 1)[1]


def test_a_change_shows_a_toast_and_can_be_undone_once(server) -> None:
    """The page after a change says what it did; Undo restores the state, only once."""
    app, request = server
    response, _ = request("POST", "/device", f"mac={MEMBER}&action=block", referer="/devices")
    token = flash_token(response)
    assert app.state["devices"][MEMBER]["blocked"] is True
    response, body = request("GET", "/nowhere", cookie=f"{FLASH_COOKIE}={token}")
    assert "Max-Age=0" in response.getheader("Set-Cookie")  # shown once
    page = request("GET", "/devices", cookie=f"{FLASH_COOKIE}={token}")[1]
    assert f"Blocked {MEMBER}" in text(page)
    assert any(form["url"] == "/undo" for form in forms(page))
    response, _ = request("POST", "/undo", f"token={token}", referer="/devices")
    assert response.status == 303 and MEMBER not in app.state["devices"]
    undone = request("GET", "/devices", cookie=f"{FLASH_COOKIE}={flash_token(response)}")[1]
    assert f"Undone: Blocked {MEMBER}" in text(undone)
    assert not any(form["url"] == "/undo" for form in forms(undone))
    assert request("POST", "/undo", f"token={token}")[0].status == 410


def test_undo_refuses_when_something_else_changed_since(server) -> None:
    """Undo never overwrites a later change."""
    app, request = server
    token = flash_token(request("POST", "/device", f"mac={MEMBER}&action=block")[0])
    request("POST", "/profile", "action=create&name=Kids")
    response, body = request("POST", "/undo", f"token={token}")
    assert response.status == 409 and "changed since" in text(body)
    assert app.state["devices"][MEMBER]["blocked"] is True


def test_live_feeds_for_a_device_and_every_device(server, monkeypatch) -> None:
    """/live.json gives one device's counters by MAC, or every online device's."""
    _app, request = server
    monkeypatch.setattr(
        web_server, "current_leases", lambda _now: {MEMBER: lease(MEMBER, "10.7.1.5")}
    )
    monkeypatch.setattr(traffic, "recent_lan_counters_read", lambda: (1, {"10.7.1.5": (900, 100)}))
    one = json.loads(request("GET", f"/live.json?mac={MEMBER}")[1])
    assert (one["rx"], one["tx"]) == (900, 100)
    every = json.loads(request("GET", "/live.json?devices=1")[1])
    assert every["devices"] == {MEMBER: [900, 100]}
    gone = json.loads(request("GET", "/live.json?mac=aa:bb:cc:dd:ee:99")[1])
    assert gone["rx"] is None


def test_pages_carry_a_strict_content_policy_and_no_inline_styles(server) -> None:
    """Scripts and styles load only from the site itself, and the pages need nothing else."""
    _app, request = server
    response, body = request("GET", "/nowhere")
    policy = response.getheader("Content-Security-Policy")
    assert "script-src 'self'" in policy and "frame-ancestors 'none'" in policy
    assert response.getheader("Referrer-Policy") == "same-origin"
    for path in ("/", "/devices", "/network", "/usage"):
        page = request("GET", path)[1]
        assert ' style="' not in page and "<script>" not in page


def test_a_bad_content_length_reads_nothing(server) -> None:
    """A negative or garbled length can't make the server read until the client hangs up."""
    _app, request = server
    for length in ("-1", "lots"):
        connection = http.client.HTTPConnection(request.host, timeout=5)
        connection.putrequest("POST", "/device")
        connection.putheader("Content-Length", length)
        connection.endheaders()
        assert connection.getresponse().status in {303, 400}


def test_panels_refresh_on_their_own_pace(server, monkeypatch) -> None:
    """The page and its self-refreshing panels carry their intervals; parts are served."""
    _app, request = server
    monkeypatch.setattr(web_server, "PARTS", {**web_server.PARTS, "/network/pihole": lambda: ""})
    page = request("GET", "/")[1]
    assert f'<main data-every="{config.REFRESH_PAGE}">' in page
    response, body = request("GET", "/network/pihole")
    assert response.status == 200 and body == ""  # no Pi-hole: nothing to swap in
    assert request("GET", "/network/pihole", signed_in=False)[0].status == 401
    assert config.every("nope", 1, 10) == 10  # floors hold against a typo


def test_wake_sends_a_magic_packet_and_says_so(server, monkeypatch) -> None:
    """Wake broadcasts for that MAC only, changes nothing, and the toast has no Undo."""
    app, request = server
    sent = []
    monkeypatch.setattr(web_server, "wake", sent.append)
    before = json.dumps(app.state, sort_keys=True)
    response, _ = request("POST", "/wake", f"mac={MEMBER}", referer=f"/device?mac={MEMBER}")
    assert response.status == 303 and sent == [MEMBER]
    assert json.dumps(app.state, sort_keys=True) == before
    change = app.undo.get(flash_token(response))
    assert change and "wake-up" in change.message and change.before is None
    assert request("POST", "/wake", "mac=nonsense")[0].status == 400 and sent == [MEMBER]
    assert request("POST", "/wake", f"mac={MEMBER}", signed_in=False)[0].status == 303
    assert sent == [MEMBER]
