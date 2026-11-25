"""The HTTPS server and request handler (pages, forms, live feed, assets)."""

import copy
import datetime as dt
import html
import http.server
import json
import re
import socket
import ssl
import sys
import time
import urllib.parse
import urllib.request
from collections.abc import Callable

from curfew.cache import Recent
from curfew.config import (
    APP_NAME,
    BIND_ADDRESS,
    EMBER_DIR,
    LINE_BPS,
    TLS_DIR,
    TRAFFIC_DB,
    VIEWERS,
)
from curfew.devices import (
    DEVICE_ACTIONS,
    apply_device_action,
    approve_all,
    display_name,
    system_vendors,
)
from curfew.dhcp import (
    DHCP_ACTIONS,
    apply_dhcp_action,
    read_hand_written,
    restart_service,
    service_state,
)
from curfew.diagnose import path_now, vpn_now
from curfew.events import upcoming
from curfew.firewall import router_active
from curfew.frames import keep_report
from curfew.leases import (
    MAC_RE,
    Lease,
    current_conf_names,
    current_lease_records,
    current_leases,
)
from curfew.pihole import block_rate, pihole_summary, read_pihole_groups
from curfew.policy import apply_profile_action, internet_status
from curfew.speedtest import line_speed, testing
from curfew.state import load_state, open_readonly
from curfew.sync import change_state
from curfew.traffic import RANGES, device_payload, devices_payload, live_payload
from curfew.wake import wake
from curfew.weather import current_weather
from curfew.web.auth import (
    SESSION_COOKIE,
    SESSION_SECONDS,
    TV_COOKIE,
    Sessions,
    Shadow,
    tv_key_valid,
)
from curfew.web.components import FOLD_COOKIE, parse_folds
from curfew.web.icons import ICON_SIZES, icon_png, manifest
from curfew.web.layout import (
    FLOW_SCRIPTS,
    FLOW_SOUNDS,
    PAGE_SCRIPT,
    PAGE_STYLE,
    STATIC,
    THEME_COOKIE,
    THEMES,
    page,
    render_login,
)
from curfew.web.pages.device import render_device
from curfew.web.pages.devices import main_url, render_devices, view_from_query
from curfew.web.pages.dhcp import render_dhcp
from curfew.web.pages.home import render_home
from curfew.web.pages.network import (
    QUALITY_RANGES,
    render_network,
    render_path,
    render_pihole_panel,
)
from curfew.web.pages.profile import render_profile
from curfew.web.pages.tv import (
    DEFAULT_PREFS,
    FLOW_COOKIE,
    FLOW_LOOKS,
    SAVER_CHOICES,
    SAVER_COOKIE,
    SOUND_CHOICES,
    SOUND_COOKIE,
    TV_FLOW,
    TV_FRAMES,
    TV_LIVE,
    TV_SETTINGS,
    TV_TABS,
    TV_THEMES,
    TvPrefs,
    render_tv,
    render_tv_flow,
    render_tv_settings,
)
from curfew.web.pages.usage import render_usage, usage_target
from curfew.web.undo import FLASH_COOKIE, UndoLog, describe, restorer, toast_html


class App:
    """What request handlers share: password checks, sessions, and changing state."""

    def __init__(self) -> None:
        """Set up auth and the undo log."""
        self.shadow = Shadow()
        self.sessions = Sessions()
        self.undo = UndoLog()

    def change(self, mutate: object) -> object:
        """Apply ``mutate(state)`` and push it out (see curfew.sync.change_state)."""
        return change_state(mutate)


EMBER_FILE = re.compile(r"/ember-(?:display-)?\d{3}\.woff2")


def read_font(path: str) -> bytes | None:
    """Return a font file: Inter from the package (OFL, inter-LICENSE.txt), Ember from homehub."""
    if path == "/inter.woff2":
        return (STATIC / "inter.woff2").read_bytes()
    if EMBER_FILE.fullmatch(path):
        file = EMBER_DIR / path.lstrip("/")
        return file.read_bytes() if file.is_file() else None
    return None


# Signed-in pages: the routes do_GET renders and where a form post may return.
PAGES = ("/", "/device", "/devices", "/dhcp", "/network", "/profile", "/usage")


MAX_FORM_BYTES = 4096


# The live feeds are asked every couple of seconds by every screen showing them (each
# TV's screensaver, the constellations): the leases behind them (dhcpd's file and the
# neighbour table, some 20 ms) are read once a second for all of them.
_feed_leases = Recent[dict[str, Lease]](1, background=False)


def feed_leases() -> dict[str, Lease]:
    """Return the current leases, read at most once a second (for the live feeds)."""
    return _feed_leases.get(lambda: current_leases(dt.datetime.now(dt.UTC)))


def path_part() -> str:
    """Return the connection path panel, measured now (at most every 5 s)."""
    leases = current_leases(dt.datetime.now(dt.UTC))
    return render_path(path_now(leases, load_state()["devices"]))


# Panels that refresh on their own (data-part), between whole-page refreshes.
PARTS = {
    "/network/path": path_part,
    "/network/pihole": lambda: render_pihole_panel(pihole_summary()),
}


QUIET_PATHS = {"/live.json", TV_LIVE, TV_FRAMES, *PARTS}


# Everything the pages load comes from here: no inline scripts or styles,
# nothing from elsewhere, and no framing (clickjacking).
CONTENT_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; "
    "connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; "
    "form-action 'self'; frame-ancestors 'none'"
)


class Handler(http.server.BaseHTTPRequestHandler):
    """HTTP handler for the device page."""

    app: App
    server_version = APP_NAME
    # Keep connections open: the live view polls every 2 s, and each new
    # connection would cost a TLS handshake. Every response sets
    # Content-Length, which keep-alive needs.
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 (stdlib name)
        """Log to stderr (journald) without the default timestamp; the background
        polls (live figures, refreshing panels) every few seconds aren't logged. A
        kept-alive connection that times out before its next request has no path."""
        if urllib.parse.urlsplit(getattr(self, "path", "")).path in QUIET_PATHS:
            return
        sys.stderr.write(f"{self.client_address[0]} {format % args}\n")

    def cookie_value(self, name: str) -> str | None:
        """Return one cookie's value from the request, if present."""
        for part in self.headers.get("Cookie", "").split(";"):
            key, _, value = part.strip().partition("=")
            if key == name:
                return value
        return None

    def signed_in(self) -> bool:
        """Return True if the request carries a live session."""
        return self.app.sessions.valid(self.cookie_value(SESSION_COOKIE))

    def viewer(self) -> bool:
        """Return True for a read-only account's session: Home and the screensaver only."""
        return self.app.sessions.user(self.cookie_value(SESSION_COOKIE)) in VIEWERS

    def send(
        self,
        status: int,
        data: bytes = b"",
        content_type: str = "",
        headers: dict | None = None,
        cache: str = "no-store",
    ) -> None:
        """Send a complete response; every response gets the same safety headers."""
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", CONTENT_POLICY)
        # Referer stays on this site: form posts use it to return to their page.
        self.send_header("Referrer-Policy", "same-origin")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def send_html(self, body: str, status: int = 200, headers: dict | None = None) -> None:
        """Send an HTML page, in the visitor's chosen theme, with the toast for a change
        just made (once: the flash cookie is cleared)."""
        theme = self.cookie_value(THEME_COOKIE)
        if theme in {"light", "dark"}:
            body = body.replace('<html lang="en">', f'<html lang="en" data-theme="{theme}">', 1)
            # The browser's own bar (a phone's status bar) follows the chosen theme
            # too, not the system's: keep only that theme's colour.
            body = re.sub(
                rf'<meta name="theme-color" content="[^"]*" media="\(prefers-color-scheme: '
                rf'(?!{theme})\w+\)">',
                "",
                body,
            ).replace(f' media="(prefers-color-scheme: {theme})"', "", 1)
        token = self.cookie_value(FLASH_COOKIE)
        if token is not None and "</main>" in body and not (headers or {}).get("Set-Cookie"):
            headers = {**(headers or {}), "Set-Cookie": f"{FLASH_COOKIE}=; Path=/; Max-Age=0"}
            change = self.app.undo.get(token) if self.signed_in() else None
            if change:
                body = body.replace("</main>", toast_html(change, token) + "</main>", 1)
        self.send(status, body.encode(), "text/html; charset=utf-8", headers)

    def send_message(self, status: int, message: str) -> None:
        """Send a short error page with a way back."""
        body = f'<main><p>{html.escape(message)}</p><p><a href="/">Back</a></p></main>'
        self.send_html(page(message, body), status)

    def redirect(self, location: str, headers: dict | None = None) -> None:
        """Send a 303 redirect."""
        self.send(303, headers={"Location": location, **(headers or {})})

    def redirect_with_toast(self, location: str, token: str) -> None:
        """Redirect to the page that shows a change's toast (by the flash cookie)."""
        cookie = f"{FLASH_COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60"
        self.redirect(location, {"Set-Cookie": cookie})

    def apply(
        self, path: str, fields: dict[str, str], mutate: Callable[[dict], object]
    ) -> tuple[object, str]:
        """Apply a form's change, logged for Undo; return its result and the toast's token."""
        record: dict = {}

        def tracked(state: dict) -> object:
            record["before"] = copy.deepcopy(state)
            # Names are only for the toast's words: never let them stop the change.
            try:
                leases = current_leases(dt.datetime.now(dt.UTC)) if "mac" in fields else {}
                conf_names = current_conf_names() if "mac" in fields else {}
            except OSError:
                leases, conf_names = {}, {}

            def name_of(mac: str) -> str:
                saved = state["devices"].get(mac, {})
                return display_name(mac, saved, leases.get(mac), conf_names) or mac

            record["message"] = describe(path, fields, state, name_of)
            result = mutate(state)
            record["after"] = copy.deepcopy(state)
            return result

        result = self.app.change(tracked)
        return result, self.app.undo.add(record["message"], record["before"], record["after"])

    def form(self) -> dict[str, str]:
        """Parse a urlencoded POST body (at most MAX_FORM_BYTES).

        A missing, garbled or negative Content-Length reads nothing (a
        negative one would otherwise read until the client hangs up).
        """
        try:
            length = max(0, int(self.headers.get("Content-Length", "0")))
        except ValueError:
            length = 0
        if length > MAX_FORM_BYTES:
            self.close_connection = True  # the rest stays unread, so don't reuse it
        body = self.rfile.read(min(length, MAX_FORM_BYTES)).decode(errors="replace")
        return {key: values[0] for key, values in urllib.parse.parse_qs(body).items()}

    def same_origin(self) -> bool:
        """Reject cross-site form posts."""
        origin = self.headers.get("Origin")
        if origin is None:
            return True  # non-browser client; the session cookie still applies
        return urllib.parse.urlsplit(origin).netloc == self.headers.get("Host", "")

    def back(self) -> str:
        """Return the same-site page the request came from (Devices keeps its view), else Home."""
        referer = urllib.parse.urlsplit(self.headers.get("Referer", ""))
        if referer.netloc != self.headers.get("Host", "") or referer.path not in PAGES:
            return "/"
        if referer.path == "/devices":
            return main_url(*view_from_query(referer.query))
        return referer.path + (f"?{referer.query}" if referer.query else "")

    def send_public(self, path: str) -> bool:
        """Serve the files that need no login; return False if ``path`` isn't one."""
        icons = {f"/icon-{size}.png": size for size in ICON_SIZES}
        day, year = "max-age=86400", "max-age=31536000, immutable"  # assets are versioned
        if path in icons:
            self.send(200, icon_png(icons[path]), "image/png", cache=day)
        elif path == "/app.css":
            self.send(200, PAGE_STYLE.encode(), "text/css; charset=utf-8", cache=year)
        elif path == "/app.js":
            self.send(200, PAGE_SCRIPT.encode(), "text/javascript; charset=utf-8", cache=year)
        elif path.lstrip("/") in FLOW_SCRIPTS:
            script = FLOW_SCRIPTS[path.lstrip("/")]
            self.send(200, script.encode(), "text/javascript; charset=utf-8", cache=year)
        elif path in FLOW_SOUNDS:
            self.send(200, FLOW_SOUNDS[path], "audio/mpeg", cache=year)
        elif path == "/manifest.webmanifest":
            self.send(200, manifest().encode(), "application/manifest+json", cache=day)
        elif font := read_font(path):
            self.send(200, font, "font/woff2", cache=day)
        elif path == "/ca.crt" and (TLS_DIR / "ca.crt").exists():
            disposition = {"Content-Disposition": 'attachment; filename="homehub-ca.crt"'}
            data = (TLS_DIR / "ca.crt").read_bytes()
            self.send(200, data, "application/x-x509-ca-cert", disposition, cache=day)
        else:
            return False
        return True

    def send_live(self, url: urllib.parse.SplitResult) -> None:
        """Send live byte counters: the connection's, one device's (?mac=) or all (?devices)."""
        query = urllib.parse.parse_qs(url.query)
        mac = query.get("mac", [""])[0].lower()
        if "devices" in query:
            payload = devices_payload(feed_leases())
        elif MAC_RE.match(mac):
            payload = device_payload(feed_leases().get(mac))
        else:
            payload = live_payload()
        self.send(200, json.dumps(payload).encode(), "application/json")

    def tv_allowed(self) -> bool:
        """Return True for the TV (its key's cookie) or a signed-in visitor."""
        return tv_key_valid(self.cookie_value(TV_COOKIE)) or self.signed_in()

    def tv_prefs(self) -> TvPrefs:
        """Return what Settings keeps on the TV (its cookies), else the defaults."""
        theme, saver = self.cookie_value(THEME_COOKIE), self.cookie_value(SAVER_COOKIE)
        look, sound = self.cookie_value(FLOW_COOKIE), self.cookie_value(SOUND_COOKIE)
        return TvPrefs(
            theme if theme in TV_THEMES else DEFAULT_PREFS.theme,
            saver if saver in SAVER_CHOICES else DEFAULT_PREFS.saver,
            look if look in FLOW_LOOKS else DEFAULT_PREFS.flow,
            sound if sound in SOUND_CHOICES else DEFAULT_PREFS.sound,
        )

    def send_tv(self, url: urllib.parse.SplitResult) -> None:
        """Serve the TV's tabs and live feeds, to the TV key or a signed-in visitor.

        /tv?key=KEY (the link curfew tv-link prints) checks the key, keeps it in
        a cookie that only /tv sees, and sends the TV on to plain /tv, so the
        key leaves the address; /tv/flow?key=KEY (the TV's own screensaver) does
        the same, on to the screensaver. Nothing here changes anything.
        """
        key = urllib.parse.parse_qs(url.query).get("key", [""])[0]
        if url.path in {"/tv", TV_FLOW} and key:
            if not tv_key_valid(key):
                self.send_message(
                    403, "That TV link is out of date: curfew tv-link has the new one."
                )
                return
            cookie = (
                f"{TV_COOKIE}={key}; Path=/tv; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000"
            )
            self.redirect(url.path, {"Set-Cookie": cookie})
            return
        if (
            url.path not in {TV_FLOW, TV_LIVE}
            and self.viewer()
            and not tv_key_valid(self.cookie_value(TV_COOKIE))
        ):
            self.redirect("/")  # a read-only account sees the screensaver, not the TV's tabs
            return
        if not self.tv_allowed():
            if url.path == TV_LIVE:
                self.send(401)
            else:
                self.send_message(
                    403, "This TV isn't signed in: open the link curfew tv-link prints."
                )
            return
        if url.path == TV_LIVE:
            if "mac" in url.query:
                self.send(401)  # one device's feed belongs to its own page
            elif "devices" in url.query:  # with which are cut off now, for the screensaver
                payload = devices_payload(feed_leases())
                state, local = load_state(), dt.datetime.now().astimezone()
                payload["cut"] = [
                    mac
                    for mac in payload["devices"]
                    if internet_status(state, mac, local) != "allowed"
                ]
                self.send(200, json.dumps(payload).encode(), "application/json")
            elif "vpn" in url.query:  # the screensaver's VPN: for whom, and how it is
                self.send(200, json.dumps(vpn_now()).encode(), "application/json")
            elif "pihole" in url.query:  # the shield (blocks a second); is a speed test on?
                payload = {"t": time.time(), "blocked": block_rate(), "testing": testing()}
                self.send(200, json.dumps(payload).encode(), "application/json")
            else:
                self.send_live(url)
            return
        now = dt.datetime.now(dt.UTC)
        prefs = self.tv_prefs()
        state = load_state()
        if url.path == TV_SETTINGS:
            self.send(
                200, render_tv_settings(state, now, prefs).encode(), "text/html; charset=utf-8"
            )
            return
        leases = current_leases(now)
        conf_names = current_conf_names()
        traffic = open_readonly(TRAFFIC_DB)
        try:
            if url.path == TV_FLOW:
                back = urllib.parse.parse_qs(url.query).get("back", [""])[0]
                tabs = {path for _key, path, _label in TV_TABS} | {"/"}  # (or the web's Home)
                body = render_tv_flow(
                    state,
                    leases,
                    conf_names,
                    now,
                    prefs,
                    back if back in tabs else "/tv",
                    current_weather(),
                    LINE_BPS,
                    traffic,
                    line_speed(traffic),
                    upcoming(now),
                )
            else:
                body = render_tv(state, leases, conf_names, now, traffic, prefs)
        finally:
            if traffic is not None:
                traffic.close()
        self.send(200, body.encode(), "text/html; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        """Serve a page, the live counters, a public file, or the login page."""
        url = urllib.parse.urlsplit(self.path)
        if self.send_public(url.path):
            return
        if url.path in {path for _key, path, _label in TV_TABS} | {TV_LIVE, TV_FLOW}:
            self.send_tv(url)
            return
        if url.path == "/live.json":
            if not self.signed_in():
                self.send(401)
                return
            self.send_live(url)
            return
        if url.path in PARTS:
            if self.signed_in() and not self.viewer():
                self.send(200, PARTS[url.path]().encode(), "text/html; charset=utf-8")
            else:
                self.send(401)
            return
        if url.path not in PAGES:
            self.send_message(404, "Not found.")
            return
        if not self.signed_in():
            self.send_html(render_login())
            return
        if url.path != "/" and self.viewer():
            self.redirect("/")
            return
        now = dt.datetime.now(dt.UTC)
        query = urllib.parse.parse_qs(url.query)
        state = load_state()
        leases = current_leases(now)
        conf_names = current_conf_names()
        traffic = open_readonly(TRAFFIC_DB)
        try:
            if url.path == "/profile":
                profile_id = query.get("id", [""])[0]
                if profile_id not in state["profiles"]:
                    self.redirect("/")
                    return
                self.send_html(render_profile(state, profile_id, leases, conf_names, now, traffic))
            elif url.path in {"/usage", "/device"}:
                range_key = query.get("range", ["24h"])[0]
                range_key = range_key if range_key in RANGES else "24h"
                target = usage_target(state, query)
                if url.path == "/device" or (target and target[0] == "device"):
                    # A device's use lives on its own page (old /usage?mac= links too).
                    mac = target[1] if target and target[0] == "device" else ""
                    if not mac or (mac not in leases and mac not in state["devices"]):
                        self.redirect("/devices")
                    elif url.path == "/usage":
                        self.redirect(f"/device?mac={mac}&range={range_key}")
                    else:
                        self.send_html(
                            render_device(state, mac, leases, conf_names, traffic, range_key, now)
                        )
                    return
                if target is None:
                    self.redirect("/usage")
                    return
                self.send_html(
                    render_usage(state, leases, conf_names, traffic, target, range_key, now)
                )
            elif url.path == "/network":
                quality = query.get("quality", ["24h"])[0]
                self.send_html(
                    render_network(
                        state,
                        leases,
                        conf_names,
                        now,
                        traffic,
                        pihole_summary(),
                        read_pihole_groups(),
                        path_now(leases, state["devices"]),
                        quality if quality in QUALITY_RANGES else "24h",
                        current_lease_records(),
                        service_state(),
                    )
                )
            elif url.path == "/dhcp":
                self.send_html(
                    render_dhcp(
                        state,
                        leases,
                        conf_names,
                        current_lease_records(),
                        service_state(),
                        read_hand_written(),
                        now,
                        parse_folds(self.cookie_value(FOLD_COOKIE)),
                    )
                )
            elif url.path == "/devices":
                show_all, sort, descending = view_from_query(url.query)
                folds = parse_folds(self.cookie_value(FOLD_COOKIE))
                self.send_html(
                    render_devices(
                        state,
                        leases,
                        conf_names,
                        router_active(),
                        show_all,
                        now,
                        sort,
                        traffic,
                        folds,
                        descending,
                    )
                )
            else:
                self.send_html(
                    render_home(
                        state, leases, conf_names, router_active(), now, traffic, self.viewer()
                    )
                )
        finally:
            if traffic is not None:
                traffic.close()

    def do_POST(self) -> None:  # noqa: N802 (http.server naming)
        """Handle login, logout, theme, settings, profile and device changes, and wake-ups."""
        if not self.same_origin():
            self.send_message(403, "Forbidden.")
            return
        path = urllib.parse.urlsplit(self.path).path
        fields = self.form()
        if path == "/login":
            self.login(fields, self.client_address[0])
            return
        # The theme is a display choice, so the login page can change it too.
        if path == "/theme" and fields.get("theme") in THEMES:
            theme = fields["theme"]
            cookie = (
                f"{THEME_COOKIE}=; Path=/; Max-Age=0"
                if theme == "system"
                else f"{THEME_COOKIE}={theme}; Path=/; Secure; SameSite=Lax; Max-Age=31536000"
            )
            self.redirect(self.back(), {"Set-Cookie": cookie})
            return
        if path == TV_SETTINGS:
            # What Settings keeps on the TV, each in its own cookie for a year: the
            # theme (shared with the web pages), when the screensaver starts, its look,
            # its sound.
            theme, saver, look = fields.get("theme"), fields.get("saver"), fields.get("flow")
            sound = fields.get("sound")
            if not self.tv_allowed() or not (
                theme in TV_THEMES
                or saver in SAVER_CHOICES
                or look in FLOW_LOOKS
                or sound in SOUND_CHOICES
            ):
                self.send_message(403, "Forbidden.")
                return
            cookie = (
                f"{THEME_COOKIE}={theme}; Path=/"
                if theme in TV_THEMES
                else f"{SAVER_COOKIE}={saver}; Path=/tv"
                if saver in SAVER_CHOICES
                else f"{FLOW_COOKIE}={look}; Path=/tv"
                if look in FLOW_LOOKS
                else f"{SOUND_COOKIE}={sound}; Path=/tv"
            )
            self.redirect(
                TV_SETTINGS, {"Set-Cookie": f"{cookie}; Secure; SameSite=Lax; Max-Age=31536000"}
            )
            return
        if path == TV_FRAMES:
            # The screensaver's frame report, from a TV (its key) or a signed-in screen.
            if not self.tv_allowed():
                self.send(401)
                return
            kept = keep_report(fields.get("report", ""), self.client_address[0])
            self.send(204 if kept else 400)
            return
        if not self.signed_in():
            self.redirect("/")
            return
        if path == "/logout":
            self.app.sessions.end(self.cookie_value(SESSION_COOKIE))
            self.redirect("/", {"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0"})
            return
        if self.viewer():
            self.send_message(403, "This account can only look.")
            return
        setting = next(
            (
                key
                for key in ("block_private", "block_unknown", "require_dhcp")
                if fields.get(key) in {"on", "off"}
            ),
            None,
        )
        if path == "/settings" and setting:
            enabled = fields[setting] == "on"
            # Turning "block new devices" on first approves everything seen so far
            # (any lease, any time), so it never cuts off a device already in the house.
            approve = setting == "block_unknown" and enabled
            seen = set(current_leases(dt.datetime.now(dt.UTC))) if approve else set()

            def apply_setting(state: dict) -> None:
                if approve:
                    approve_all(state, seen | set(state["devices"]))
                state["settings"][setting] = enabled

            _result, token = self.apply(path, fields, apply_setting)
            self.redirect_with_toast(self.back(), token)
            return
        if path == "/profile":
            try:
                target, token = self.apply(
                    path, fields, lambda state: apply_profile_action(state, fields)
                )
            except ValueError as error:
                self.send_message(400, str(error))
                return
            self.redirect_with_toast(target or self.back(), token)
            return
        mac = fields.get("mac", "").lower()
        action = fields.get("action", "")
        if path == "/device" and MAC_RE.match(mac) and action in DEVICE_ACTIONS:
            name = fields.get("name", "")
            try:
                _result, token = self.apply(
                    path, fields, lambda state: apply_device_action(state, mac, action, name)
                )
            except ValueError as error:
                self.send_message(400, str(error))
                return
            self.redirect_with_toast(self.back(), token)
            return
        if path == "/dhcp" and action == "restart":
            problem = restart_service()
            if problem:
                self.send_message(500, f"dhcpd didn't restart: {problem}")
                return
            self.redirect_with_toast(self.back(), self.app.undo.add("Restarted the DHCP server"))
            return
        if path == "/dhcp" and action in DHCP_ACTIONS:
            try:
                _result, token = self.apply(
                    path, fields, lambda state: apply_dhcp_action(state, fields)
                )
            except ValueError as error:
                self.send_message(400, str(error))
                return
            self.redirect_with_toast(self.back(), token)
            return
        if path == "/wake" and MAC_RE.match(mac):
            state = load_state()
            lease = current_leases(dt.datetime.now(dt.UTC)).get(mac)
            name = display_name(mac, state["devices"].get(mac, {}), lease, current_conf_names())
            try:
                wake(mac)
            except OSError as error:
                self.send_message(500, f"Couldn't send the wake-up: {error.strerror or error}")
                return
            self.redirect_with_toast(
                self.back(), self.app.undo.add(f"Sent {name or mac} a wake-up")
            )
            return
        if path == "/undo":
            change = self.app.undo.take(fields.get("token", ""))
            if change is None:
                self.send_message(410, "Too late to undo that.")
                return
            try:
                self.app.change(restorer(change))
            except ValueError as error:
                self.send_message(409, str(error))
                return
            self.redirect_with_toast(self.back(), self.app.undo.add(f"Undone: {change.message}"))
            return
        self.send_message(400, "Bad request.")

    def login(self, fields: dict[str, str], address: str) -> None:
        """Check credentials and start a session."""
        if self.app.sessions.locked_out(address):
            self.send_html(render_login("Too many attempts. Try again in 10 minutes."), 429)
            return
        if self.app.shadow.verify(fields.get("user", ""), fields.get("password", "")):
            token = self.app.sessions.create(fields.get("user", ""))
            cookie = (
                f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; "
                f"Max-Age={SESSION_SECONDS}"
            )
            self.redirect("/", {"Set-Cookie": cookie})
            return
        self.app.sessions.record_failure(address)
        time.sleep(1)
        self.send_html(render_login("Wrong user or password."), 401)


def plain_http_redirect(connection: socket.socket) -> None:
    """Answer a plain-HTTP request on the HTTPS port with a redirect to https://."""
    request = connection.recv(4096).decode("latin-1")
    host = re.search(r"^Host:\s*([A-Za-z0-9.:-]+)\s*$", request, re.M | re.I)
    location = f"https://{host.group(1) if host else 'homehub:8088'}/"
    connection.sendall(
        f"HTTP/1.1 301 Moved Permanently\r\nLocation: {location}\r\n"
        "Content-Length: 0\r\nConnection: close\r\n\r\n".encode()
    )


class TlsServer(http.server.ThreadingHTTPServer):
    """HTTPS server that also redirects plain HTTP arriving on the same port.

    The TLS handshake runs in the request's own thread, so a slow or stuck
    client can't hold up the others.
    """

    daemon_threads = True

    def __init__(self, address: tuple[str, int], context: ssl.SSLContext) -> None:
        """Bind the port; ``context`` holds the server certificate."""
        super().__init__(address, Handler)
        self.context = context

    def finish_request(self, request: socket.socket, client_address: tuple) -> None:
        """Peek at the first byte: 0x16 starts a TLS handshake, anything else is HTTP."""
        request.settimeout(30)
        try:
            first = request.recv(1, socket.MSG_PEEK)
            if first != b"\x16":
                if first:
                    plain_http_redirect(request)
                return
            secure = self.context.wrap_socket(request, server_side=True)
        except (OSError, ssl.SSLError):
            return  # e.g. a browser refusing the certificate
        try:
            self.RequestHandlerClass(secure, client_address, self)
        finally:
            secure.close()


def serve() -> None:
    """Serve the web page over HTTPS until stopped."""
    Handler.app = App()
    system_vendors()  # load the maker registries now, not on the first page view
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(TLS_DIR / "server.crt", TLS_DIR / "server.key")
    server = TlsServer(BIND_ADDRESS, context)
    print(f"serving on https://{BIND_ADDRESS[0]}:{BIND_ADDRESS[1]}", file=sys.stderr)
    server.serve_forever()
