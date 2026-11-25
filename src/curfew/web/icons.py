"""Line icons (SVG), the home-screen icon (PNG drawn in code) and the manifest."""

import functools
import json
import struct
import zlib

from curfew.config import APP_NAME

ICON_SIZES = (180, 192, 512)


ICON_BACKGROUND = (0x33, 0x33, 0x2F)  # --logo-bg


ICON_MOON = (0xF4, 0xF4, 0xF0)  # --moon


def png_bytes(width: int, height: int, rows: list[bytes]) -> bytes:
    """Return an 8-bit RGB PNG from raw pixel rows."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + row for row in rows)  # filter type 0 on every row
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


@functools.cache
def icon_png(size: int) -> bytes:
    """Return the home-screen icon: a pale crescent moon on charcoal.

    The moon is one disc minus an offset disc, with edge pixels shaded by
    their distance to each circle so the curve stays smooth. It sits inside
    the middle 60% so masked (rounded or circular) launchers don't clip it.
    """
    moon_x, moon_y, moon_r = 0.47 * size, 0.53 * size, 0.27 * size
    cut_x, cut_y, cut_r = 0.60 * size, 0.42 * size, 0.23 * size
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            inside = min(
                max(moon_r - ((px - moon_x) ** 2 + (py - moon_y) ** 2) ** 0.5 + 0.5, 0), 1
            )
            cut = min(max(cut_r - ((px - cut_x) ** 2 + (py - cut_y) ** 2) ** 0.5 + 0.5, 0), 1)
            cover = inside * (1 - cut)
            row.extend(
                round(back + (moon - back) * cover)
                for back, moon in zip(ICON_BACKGROUND, ICON_MOON, strict=True)
            )
        rows.append(bytes(row))
    return png_bytes(size, size, rows)


def manifest() -> str:
    """Return the web app manifest, so the page can be added to a home screen."""
    return json.dumps(
        {
            "name": APP_NAME,
            "short_name": APP_NAME,
            "start_url": "/",
            "display": "standalone",
            "background_color": "#f4f4f1",  # --bg
            "theme_color": "#ffffff",  # --surface (the top bar)
            "icons": [
                {"src": f"/icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png"}
                for size in ICON_SIZES[1:]
            ],
        }
    )


# Line icons on a 24-unit grid, drawn with the text colour (see .icon).
# A cloud high in the box, with room beneath for what falls from it.
CLOUD_TOP = "M7.5 15h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 7.5 15z"

ICONS = {
    "home": '<path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
    "devices": '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M6 18h6"/>'
    '<rect x="17.5" y="8" width="4.5" height="10" rx="1.2"/>',
    "usage": '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
    "light": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 '
    '1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    "dark": '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    "system": '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16v4"/>',
    "palette": '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7'
    '-.5-1.2 0-.9.8-1.6 1.7-1.6h2.1A4.5 4.5 0 0 0 21 10.9C21 6.5 17 3 12 3z"/><circle cx="7.5" '
    'cy="11" r=".9"/><circle cx="10" cy="7.3" r=".9"/><circle cx="14.6" cy="7.6" r=".9"/>',
    "flow": '<path d="M3 8c3-3.5 6-3.5 9 0s6 3.5 9 0M3 16c3-3.5 6-3.5 9 0s6 3.5 9 0"/>',
    "exit": '<path d="M14 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h8M10 12h10.5M17 8.5l3.5 '
    '3.5-3.5 3.5"/>',
    "phone": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    "tablet": '<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    "tv": '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8"/>',
    "computer": '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
    "console": '<path d="M7 8h10a4.5 4.5 0 0 1 4.3 5.8l-1 3.3a2.2 2.2 0 0 1-3.8.8L14.7 16H9.3'
    'l-1.8 1.9a2.2 2.2 0 0 1-3.8-.8l-1-3.3A4.5 4.5 0 0 1 7 8z"/><path d="M8 10.8v3M6.5 12.3h3'
    'M15.5 11.5h.01M17 13h.01"/>',
    "speaker": '<rect x="6" y="2.5" width="12" height="19" rx="3"/><circle cx="12" cy="14.5" '
    'r="3.2"/><path d="M12 7h.01"/>',
    "smart": '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1'
    'c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
    "camera": '<rect x="3" y="7" width="12.5" height="10" rx="2"/><path d="m15.5 11 5-3v8l-5-3"/>',
    "printer": '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/>'
    '<rect x="7" y="14" width="10" height="6.5" rx="1"/>',
    "watch": '<rect x="6.5" y="6" width="11" height="12" rx="3"/><path d="m9 6 .5-3h5l.5 3M9 18'
    'l.5 3h5l.5-3"/>',
    "network": '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M10.5 16.5h'
    '.01M17 13V8.5M14.5 6.5a3.5 3.5 0 0 1 5 0"/>',
    "device": '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="2.5"/>',
    # The weather (weather.weather_icon picks one); clear skies are "light" and "dark".
    "partly": '<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1.2M2.5 8h1.2M4.1 4.1l.9.9M11.9'
    ' 4.1l-.9.9M9 20h9a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.4A3 3 0 0 0 9 20z"/>',
    "cloud": '<path d="M7 19h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.7A3.6 3.6 0 0 0 7 19z"/>',
    "fog": '<path d="M4 9h16M6 13h12M4 17h16"/>',
    "rain": f'<path d="{CLOUD_TOP}M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
    "snow": f'<path d="{CLOUD_TOP}M9 18.5h.01M12 20.5h.01M15 18.5h.01M10.5 22h.01M13.5 22h.01"/>',
    "storm": f'<path d="{CLOUD_TOP}M12.5 15.5l-2 3.5h3l-2 3.5"/>',
}


def icon(name: str) -> str:
    """Return a line icon as inline SVG (decorative; the text beside it carries meaning)."""
    return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'
