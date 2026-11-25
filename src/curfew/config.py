"""Settings: paths, interfaces and accounts.

The defaults are homehub's. Any of them can be overridden in
/etc/curfew/curfew.toml (or the file named by $CURFEW_CONFIG); see
curfew.example.toml for every key.
"""

import os
import tomllib
from importlib import resources
from pathlib import Path

CONFIG_FILE = Path(os.environ.get("CURFEW_CONFIG", "/etc/curfew/curfew.toml"))


def load_settings(path: Path) -> dict:
    """Return the settings file's contents, or {} if there isn't one."""
    try:
        return tomllib.loads(path.read_text())
    except FileNotFoundError:
        return {}


_settings = load_settings(CONFIG_FILE)


def setting(section: str, key: str, default: object) -> object:
    """Return ``[section] key`` from the settings file, else ``default``."""
    return _settings.get(section, {}).get(key, default)


APP_NAME = "curfew"

# [web]
BIND_ADDRESS = (str(setting("web", "host", "0.0.0.0")), int(setting("web", "port", 8088)))
ALLOWED_USERS = frozenset(setting("web", "users", ["curfew-admin", "al"]))  # no shell, no SSH
# Read-only accounts (also no shell, no SSH): Home and the screensaver, nothing that changes
VIEWERS = frozenset(setting("web", "viewers", ["cy"])) - ALLOWED_USERS
TLS_DIR = Path(setting("web", "tls_dir", "/etc/homehub-router/tls"))
SHADOW_FILE = Path("/etc/shadow")

# [paths]
STATE_DIR = Path(setting("paths", "state_dir", "/var/lib/homehub-router"))
STATE_FILE = STATE_DIR / "devices.json"
FRAMES_LOG = STATE_DIR / "tv-frames.jsonl"  # the screensavers' frame reports
LOCK_FILE = STATE_DIR / "state.lock"
TRAFFIC_DB = STATE_DIR / "traffic.db"
PIHOLE_STAMP = STATE_DIR / "pihole-sync.json"
SPEEDTEST_MARK = STATE_DIR / "speedtest-started"  # when the last test began (Orbit's probe)
SESSIONS_FILE = STATE_DIR / "sessions.json"  # who is signed in, kept over a restart
TV_KEY_FILE = STATE_DIR / "tv-key"  # the read-only TV dashboard's key (curfew tv-link)
IEEE_DIR = Path(setting("paths", "ieee_dir", "/usr/share/ieee-data"))
EMBER_DIR = Path(setting("paths", "ember_dir", "/usr/local/share/ember"))  # not ours to ship

# [dhcp]
LEASES_FILE = Path(setting("dhcp", "leases", "/var/lib/dhcp/dhcpd.leases"))
DHCPD_CONF = Path(setting("dhcp", "conf", "/etc/dhcp/dhcpd.conf"))  # the global settings
CURFEW_DHCP_CONF = Path(setting("dhcp", "curfew_conf", "/etc/dhcp/curfew.conf"))  # curfew's part
DHCP_SERVICE = str(setting("dhcp", "service", "isc-dhcp-server"))
DHCPD = str(setting("dhcp", "dhcpd", "/usr/sbin/dhcpd"))  # for dhcpd -t

# [network]
NFT_TABLE = str(setting("network", "nft_table", "inet router"))
WAN_INTERFACE = str(setting("network", "wan", "ppp0"))
WAN_STATS = Path("/sys/class/net") / WAN_INTERFACE / "statistics"
LAN_INTERFACE = str(setting("network", "lan", "enp5s0"))
ROUTER_ADDRESS = str(setting("network", "address", "10.7.0.1"))  # homehub on the LAN
WAN_LINK = str(setting("network", "wan_link", "eno1"))  # the cable to the modem
MODEM_ADDRESS = str(setting("network", "modem", "10.7.0.254"))  # the ONTbox's management IP
# What the line is sold as (Mb/s, down and up): the most the house can use, which the
# TV's screensaver measures shares against (a speed test can read lower).
LINE_BPS = tuple(float(mbps) * 1e6 for mbps in setting("network", "line_mbps", [1000, 1000]))
PPP_SERVICE = str(setting("network", "ppp_service", "ppp@fibrenet"))
PING_TARGETS = tuple(setting("network", "ping_targets", ["1.1.1.1", "8.8.8.8"]))
DNS_SERVER = str(setting("network", "dns_server", "127.0.0.1"))  # Pi-hole, asked directly
# The pings carry WireGuard's mark, so they leave by ppp0 as the house's
# traffic does, past homehub-vpn's kill switch: they measure Fibrenet, not the VPN.
PROBE_MARK = str(setting("network", "probe_mark", "51820"))  # decimal: ping -m takes no hex
WATCHED_SERVICES = tuple(
    setting("network", "services", ["homehub-router", "isc-dhcp-server", "pihole-FTL", "unbound"])
)
# Other tools' cards on the connection path: [[network.status]] name, command
# (printing one JSON line, see diagnose.read_status) and after (a hop's title;
# the tool's own "after" wins).
STATUS_COMMANDS = tuple(setting("network", "status", []))
QUALITY_DAYS = 30  # minute-by-minute latency and loss kept this long

# [speedtest]: the weekly test (curfew-speedtest.timer). The command reads the servers near
# [sky] (within near_km) on stdin and prints JSON as speedtest-cli --json.
SPEEDTEST_COMMAND = tuple(
    setting(
        "speedtest",
        "command",
        ["/usr/bin/python3", "-I", str(resources.files("curfew") / "nearby_speedtest.py")],
    )
)
SPEEDTEST_NEAR_KM = float(setting("speedtest", "near_km", 100))


def every(key: str, default: int, floor: int) -> int:
    """Return ``[refresh] key``: how often something on the page updates, in seconds.

    The floor keeps a typo from polling homehub (or Pi-hole) too hard.
    """
    return max(floor, int(setting("refresh", key, default)))


# [refresh]
REFRESH_PAGE = every("page", 30, 10)  # the whole page: lists, tiles, charts
REFRESH_PATH = every("path", 10, 5)  # the connection path (pings every hop)
REFRESH_PIHOLE = every("pihole", 30, 10)  # Pi-hole's stats (asks its API)
REFRESH_LIVE = every("live", 2, 1)  # the live throughput charts
REFRESH_STARS = every("stars", 5, 2)  # the constellation's glow

# [pihole]
PIHOLE_DB = Path(setting("pihole", "gravity_db", "/etc/pihole/gravity.db"))
PIHOLE_API = str(setting("pihole", "api", "http://127.0.0.1/api"))
PIHOLE_CLI_PASSWORD = Path(setting("pihole", "cli_password", "/etc/pihole/cli_pw"))
DOH_DOMAINS_FILE = Path(
    setting("pihole", "doh_domains", str(resources.files("curfew") / "data" / "doh-domains.txt"))
)

# [devices] and [schedules]
RECENT_DAYS = int(setting("devices", "recent_days", 30))
MORNING = str(setting("schedules", "morning", "07:00"))  # "pause until morning"

# [sky]: where homehub is, for the top bar's sunrise and sunset (fixed hours without it)
_latitude, _longitude = setting("sky", "latitude", None), setting("sky", "longitude", None)
LATITUDE = None if _latitude is None else float(_latitude)
LONGITUDE = None if _longitude is None else float(_longitude)

# [calendar]: a calendar's public link (iCloud's webcal://), for the screensaver's
# today and tomorrow; none without it
CALENDAR_URL = str(setting("calendar", "url", ""))
