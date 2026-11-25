# curfew

Device control for a home network, running on a Linux box that is the house router. It decides which
devices get internet and when, shows how the connection is doing, manages DHCP, and has a TV view
with a screensaver drawn from the house's live traffic.

**This is for reading, not installing.** It is a published copy of part of a private project, and it
depends on one house's setup. See [Caveats](#caveats).

## What it does

- **Devices and profiles**: block a device, put several in a profile, give the profile a schedule,
  pause it, or grant bonus time. Overnight windows, guests that expire, approval of new devices.
- **Blocked sites** per profile, through Pi-hole groups, and DNS-over-HTTPS blocking.
- **Connection health**: the path from the house to the internet as a row of hops, with latency and
  loss over time and a weekly speed test once the house is quiet.
- **Usage**: bytes per device and for the connection. Where traffic goes is never recorded.
- **DHCP**: pools, fixed addresses and reservations, each change tested with `dhcpd -t` before it
  goes live and rolled back if the service won't start.
- **One state, three surfaces**: a web page, a command line (`curfew pause kids 30m`) and a TV app.
- **A screensaver** ("flow") in canvas and WebGL: devices as planets, a town, a forest or a highway,
  moved by real traffic, sun and weather, on hardware as weak as a TV stick.

## How it is made

- **Python standard library only**: the web server, sign-in, charts, parsers for lease files and
  `dhcpd.conf`, and the nftables and Pi-hole clients. JavaScript has no build step.
- **One change path.** Every change takes a lock, saves atomically, and pushes DHCP, then nftables,
  then Pi-hole (`sync.change_state`). Nothing else writes the state.
- **Enforcement doesn't depend on the page.** A timer re-applies everything each minute, so a
  schedule starts and ends on time even if the page is down.
- **One answer to "who gets internet"**: `policy.internet_status` is used by the page, the TV and
  the firewall alike.
- **Fail safe, not silent**: a failed push leaves the change standing to be retried; a DHCP change
  the server won't take is refused and nothing is saved.
- A block applies to a MAC *and* the addresses it holds, so a device behind a MAC-rewriting bridge
  is still caught. LAN traffic always flows.

[docs/](docs/) has the specs the code is held to: architecture, policy and the web page.

```sh
uv run pytest -q
uv run ruff check .
```

## Caveats

It expects, and is shaped by:

- **Being the router**: Linux with nftables, with the house's internet on PPPoE. The rules it fills
  (`table inet router`) are loaded separately and aren't included; curfew only edits sets in them.
- **isc-dhcp-server**, **Pi-hole v6** and **unbound** on the same machine, and the IEEE maker
  registries (`ieee-data`).
- **Login-only system accounts** checked against `/etc/shadow`, and a private certificate authority.
- **A particular mesh, modem and VPN tool** on its connection page.
- The Fire TV app that shows the TV pages isn't included, nor are the router's own scripts.

Names, addresses, hardware addresses, the ISP and the place are replaced with made-up ones.

## How it was built

Designed and directed by me, with the code written with
[Claude Code](https://claude.com/claude-code). It has run a real house since November 2026.

## Licence

[MIT](LICENSE) for the code. Sounds are CC0 (see `src/curfew/web/static/sounds/SOURCES.md`); Inter is under the SIL Open Font
License, included beside it.
