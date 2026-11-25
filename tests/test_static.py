"""The stylesheet: both routes to dark mode use the same palette."""

import re

from curfew.web.layout import FLOW_SOUNDS, PAGE_STYLE, STATIC


def test_dark_palette_is_defined_once_in_two_places() -> None:
    """The system-dark block and the chosen-dark block must not drift apart."""
    blocks = re.findall(
        r'(?::root:not\(\[data-theme="light"\]\)|:root\[data-theme="dark"\]) \{([^}]*)\}',
        PAGE_STYLE,
    )
    assert len(blocks) == 2 and blocks[0].split() == blocks[1].split()


def test_the_recorded_sounds_are_served_and_credited(server) -> None:
    """Every recording is served to the screensaver, and SOURCES.md says where it's from."""
    _app, request = server
    sources = (STATIC / "sounds" / "SOURCES.md").read_text()
    assert len(FLOW_SOUNDS) == 11
    for path, sound in FLOW_SOUNDS.items():
        response, _body = request("GET", path, signed_in=False)
        assert response.status == 200 and response.getheader("Content-Type") == "audio/mpeg"
        assert f"`{path.rsplit('/', 1)[1]}`" in sources and len(sound) < 200_000
