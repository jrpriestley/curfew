"""The page frame: head, top bar, footer, and the shared stylesheet and script."""

import hashlib
import html
from importlib import resources

from curfew.config import APP_NAME, REFRESH_PAGE
from curfew.schedules import local_now
from curfew.web.components import post_form, submit
from curfew.web.icons import icon
from curfew.web.sky import logo_svg, sky_track

# The stylesheet and scripts are real files in static/, served as /app.css, /app.js and
# the screensaver's (see web.server) and versioned by asset_version(). The screensaver's
# scripts (FLOW_SCRIPTS: Ultra's light, each scene's, then flow.js, which makes them) load
# only on its page. Highway's is one script kept in parts (static/highway/, a section of
# it each, in their names' order: pieces of one function, not scripts of their own),
# served joined as flow-highway.js.
STATIC = resources.files("curfew.web") / "static"
PAGE_STYLE = (STATIC / "app.css").read_text()
PAGE_SCRIPT = (STATIC / "app.js").read_text()
HIGHWAY_PARTS = sorted(
    (part for part in (STATIC / "highway").iterdir() if part.name.endswith(".js")),
    key=lambda part: part.name,
)
# The screensaver's recordings (static/sounds/, where each came from in SOURCES.md), fetched
# by flow-shots.js only with the sound on.
FLOW_SOUNDS = {
    f"/sounds/{file.name}": file.read_bytes()
    for file in (STATIC / "sounds").iterdir()
    if file.name.endswith(".mp3")
}
FLOW_SCRIPTS = {
    name: "".join(part.read_text() for part in HIGHWAY_PARTS)
    if name == "flow-highway.js"
    else (STATIC / name).read_text()
    for name in (
        "flow-light.js",
        "flow-town.js",
        "flow-forest.js",
        "flow-highway.js",
        "flow-shots.js",
        "flow-sound.js",
        "flow.js",
    )
}


CERT_NOTE = '<footer><a href="/ca.crt">homehub.local CA certificate</a></footer>'


NAV_ITEMS = (
    ("home", "/", "Home"),
    ("devices", "/devices", "Devices"),
    ("network", "/network", "Network"),
    ("usage", "/usage", "Usage"),
)


THEMES = ("light", "dark", "system")


THEME_COOKIE = "curfew_theme"


def theme_switch() -> str:
    """Return the light / dark / system buttons (the page script marks the one in force)."""
    themes = "".join(
        submit(
            icon(theme),
            "ghost",
            f' name="theme" value="{theme}" title="{theme.title()} theme" '
            f'aria-label="{theme.title()} theme"',
        )
        for theme in THEMES
    )
    return f'<form method="post" action="/theme" class="theme" aria-label="Theme">{themes}</form>'


# The TV's screensaver in this browser, coming back to Home (any key, or a click)
FLOW_LINK = (
    '<a class="flow-link" href="/tv/flow?back=%2F" title="Screensaver" aria-label="Screensaver">'
    f"{icon('tv')}</a>"
)


def chrome(
    active: str, content: str, sky: tuple[str, str] = ("day", ""), viewer: bool = False
) -> str:
    """Return the signed-in page frame: top bar (brand, sections, the screensaver, theme,
    sign out), the page content and the footer. ``active`` is the current NAV_ITEMS key;
    ``sky`` (from sky_phase) tints the top bar. A read-only account (``viewer``) has
    Home alone, so no sections."""
    nav = "".join(
        f'<a href="{href}"{" aria-current=page" if key == active else ""}>'
        f"{icon(key)}<span>{label}</span></a>"
        for key, href, label in NAV_ITEMS
    )
    sections = "" if viewer else f'<nav class="primary" aria-label="Sections">{nav}</nav>'
    tip = f' title="{html.escape(sky[1])}"' if sky[1] else ""
    return (
        f'<header class="topbar sky-{sky[0]}{" viewer" if viewer else ""}">'
        # The sky's tooltip sits on a layer behind the bar's contents, so it
        # shows over the bar's empty space and never over a link or button.
        + f'<span class="sky-tip"{tip}><span class="sky-stars" aria-hidden="true"></span></span>'
        + '<div class="topbar-inner">'
        f'<a class="brand" href="/">{logo_svg(local_now())}<span>{APP_NAME}</span></a>'
        f"{sections}{sky_track(sky[0])}"
        f'<div class="topbar-tools">{FLOW_LINK}'
        f"{theme_switch()}"
        f"{post_form('/logout', {}, submit('Sign out', 'ghost'))}</div></div></header>"
        # The page script refreshes the whole page every data-every seconds.
        f'<main data-every="{REFRESH_PAGE}">{content}</main>{CERT_NOTE}'
    )


def asset_version() -> str:
    """Return a short hash of the stylesheet and scripts, to version their URLs."""
    every = PAGE_STYLE + PAGE_SCRIPT + "".join(FLOW_SCRIPTS.values())
    sounds = b"".join(FLOW_SOUNDS[name] for name in sorted(FLOW_SOUNDS))
    return hashlib.sha256(every.encode() + sounds).hexdigest()[:10]


def page(title: str, body: str, script: bool = False, flow: bool = False) -> str:
    """Wrap body HTML in the page shell, linking the shared stylesheet and script.

    Both are served from /app.css and /app.js with a version in the URL, so
    browsers cache them and fetch again only after an update; ``flow`` adds the
    screensaver's scripts after the page's. The theme
    isn't known here: Handler.send_html adds ``data-theme`` to the ``<html>``
    tag from the visitor's cookie, so pages never flash.
    """
    version = asset_version()
    names = (["app.js"] if script else []) + (list(FLOW_SCRIPTS) if flow else [])
    tail = "".join(f'<script src="/{name}?v={version}" defer></script>' for name in names)
    return (
        f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1, '
        'viewport-fit=cover">'
        '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">'
        '<meta name="theme-color" content="#1c1c1b" media="(prefers-color-scheme: dark)">'
        f'<meta name="apple-mobile-web-app-title" content="{APP_NAME}">'
        '<link rel="manifest" href="/manifest.webmanifest">'
        '<link rel="icon" href="/icon-192.png">'
        '<link rel="apple-touch-icon" href="/icon-180.png">'
        f'<link rel="stylesheet" href="/app.css?v={version}">'
        f"<title>{html.escape(title)}</title></head>"
        f"<body>{body}{tail}</body></html>"
    )


def render_login(error: str = "") -> str:
    """Return the login page."""
    message = f'<p class="error" role="alert">{html.escape(error)}</p>' if error else ""
    body = (
        f'<main class="login"><div class="brand">{logo_svg(local_now())}'
        f"<h1>{APP_NAME}</h1></div>"
        f'<div class="card">{message}<form method="post" action="/login">'
        '<label>User <input type="text" name="user" autocomplete="username" required></label>'
        '<label>Password <input type="password" name="password" '
        'autocomplete="current-password" required></label>'
        f"<button type=submit>Sign in</button></form></div>{theme_switch()}</main>{CERT_NOTE}"
    )
    return page(f"{APP_NAME} · homehub", body, script=True)
