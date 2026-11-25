"""Fixtures. Settings point at a throwaway directory before curfew is imported,
so no test can touch homehub's real files (state, leases, Pi-hole)."""

import http.client
import http.server
import os
import sqlite3
import tempfile
import threading
from pathlib import Path

_SANDBOX = Path(tempfile.mkdtemp(prefix="curfew-tests-"))
(_SANDBOX / "curfew.toml").write_text(
    f"""
[paths]
state_dir = "{_SANDBOX / "state"}"
ieee_dir = "{_SANDBOX / "ieee"}"
[dhcp]
leases = "{_SANDBOX / "dhcpd.leases"}"
conf = "{_SANDBOX / "dhcpd.conf"}"
curfew_conf = "{_SANDBOX / "curfew.conf"}"
dhcpd = "{_SANDBOX / "no-dhcpd"}"
service = "curfew-test-dhcpd"
[network]
lan = "curfew-test-lan"
[pihole]
gravity_db = "{_SANDBOX / "gravity.db"}"
"""
)
os.environ["CURFEW_CONFIG"] = str(_SANDBOX / "curfew.toml")

import pytest  # noqa: E402
from helpers import GRAVITY_SCHEMA, make_state  # noqa: E402

from curfew.web import auth  # noqa: E402
from curfew.web import server as web_server  # noqa: E402
from curfew.web.undo import UndoLog  # noqa: E402


@pytest.fixture
def gravity(tmp_path):
    """Return the path of a small gravity.db: Default, AV (a subnet client), no rules."""
    path = tmp_path / "gravity.db"
    connection = sqlite3.connect(path)
    connection.executescript(GRAVITY_SCHEMA)
    connection.close()
    return path


@pytest.fixture
def server():
    """Run the real request handler on a local port with a stand-in app (no files, no nft)."""

    class StubApp:
        def __init__(self) -> None:
            self.sessions = auth.Sessions()
            self.state = make_state()
            self.undo = UndoLog()

        def change(self, mutate):
            return mutate(self.state)

    app = StubApp()
    web_server.Handler.app = app
    # Each test's leases, read fresh: no reading kept over from another test.
    web_server._feed_leases = web_server.Recent(0, background=False)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), web_server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    host = f"127.0.0.1:{httpd.server_address[1]}"
    token = app.sessions.create()

    def request(method, path, body="", signed_in=True, referer="", cookie="", agent=""):
        connection = http.client.HTTPConnection(host)
        headers = {"Cookie": (f"{auth.SESSION_COOKIE}={token}; " if signed_in else "") + cookie}
        if body:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        if agent:
            headers["User-Agent"] = agent
        if referer:  # a path on this server, or a full URL elsewhere
            headers["Referer"] = referer if "://" in referer else f"http://{host}{referer}"
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        return response, response.read().decode(errors="replace")

    request.host = host  # for tests that speak raw HTTP
    yield app, request
    httpd.shutdown()


@pytest.fixture
def sandbox() -> Path:
    """Return the directory the settings point at (state, leases, gravity.db)."""
    return _SANDBOX
