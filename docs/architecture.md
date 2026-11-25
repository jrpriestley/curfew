# Architecture

## Purpose

curfew decides which of the house's devices get internet, and shows what the network is
doing. It runs on homehub, the house router: devices come from isc-dhcp-server's leases;
blocking happens in nftables (internet only, never the LAN) and, for a profile's blocked
sites, in Pi-hole. A web page, a command line and a TV app share one saved state.

## Rules that hold everywhere

- **Standard library only** (Python 3.14). No third-party packages on homehub; the
  wheel installs into a venv at `/opt/curfew`.
- **One change path.** Every change to saved state (page, command line, tools) goes
  through `curfew.sync.change_state`, which takes `state.lock`, applies the change,
  saves atomically and pushes it out (DHCP first, then nftables, then Pi-hole). Nothing
  else writes `devices.json`.
- **Enforcement doesn't depend on the page.** `curfew-sync.timer` runs `curfew sync`
  every minute and re-applies everything, so schedules start and end on time even if the
  page is down. `router-up.sh` runs it at boot.
- **Nothing records where traffic goes.** Only bytes per device and for the connection;
  Pi-hole's query log is off. Diagnostics only ping fixed addresses.
- **homehub's local time** for every schedule and clock shown.
- **Fail safe, not silent.** A Pi-hole push that fails leaves the change standing and
  the next sync retries; a DHCP change dhcpd won't take is refused and nothing is saved;
  if `homehub-router.service` is stopped the page says changes aren't enforced.

## Processes (systemd units in `systemd/`)

| Unit | Runs | Does |
|---|---|---|
| `curfew.service` | `curfew serve` | the HTTPS page on port 8088 (all addresses; WAN is dropped by the router firewall) |
| `curfew-sync.timer` | `curfew sync`, every minute | forget expired guests, push nftables, sample usage and line quality, push Pi-hole (`sync_all`) |
| `curfew-leases.path` | `curfew firewall` | each time dhcpd writes a lease, push nftables within a second (`sync_firewall`), under the lock |
| `curfew-speedtest.timer` | `curfew speedtest --weekly`, Sundays 03:30 | waits for a quiet house, then tests the line |

## Modules (`src/curfew/`)

| Module | Owns |
|---|---|
| `cli.py` | the `curfew` command (status, devices, profiles, block, pause, bonus, dhcp, speedtest, tv-link, serve, sync…) |
| `config.py` | settings: defaults are homehub's; `/etc/curfew/curfew.toml` (or `$CURFEW_CONFIG`) overrides; `curfew.example.toml` lists every key |
| `state.py` | `devices.json` load/save (atomic), read-only SQLite helper |
| `sync.py` | `change_state`, `sync_firewall`, `sync_all` |
| `leases.py` | dhcpd's lease file, dhcpd.conf names, fixed hosts, the neighbour table |
| `devices.py` | device records: names, makers (IEEE registries), kinds, actions, guests |
| `policy.py` | who gets internet (`internet_status`), profiles and their actions, site lists |
| `schedules.py` | schedules, pauses, bonus time, next change |
| `firewall.py` | the nftables sets curfew fills |
| `pihole.py` | profile site groups, DoH rules, Pi-hole groups and stats |
| `dhcp.py` | `curfew.conf`: adopt, render, check with `dhcpd -t`, install, roll back |
| `traffic.py` | usage counting into `traffic.db` |
| `diagnose.py` | the connection path (each hop graded), line quality history, other tools' status cards, the VPN |
| `speedtest.py`, `nearby_speedtest.py` | the weekly speed test, against nearby servers only |
| `weather.py`, `events.py` | the TV screensaver's weather (Open-Meteo) and family calendar (iCalendar) |
| `cache.py` | `Recent`: a value worked out at most every so often, shared by the page's threads |
| `wake.py` | wake-on-LAN |
| `web/` | the page; see [web.md](web.md), [flow.md](flow.md) and [tv.md](tv.md) |
| `data/` | `doh-domains.txt`, `internet-facts.txt` (the screensaver's facts) |

## Saved state

In `[paths] state_dir` (`/var/lib/homehub-router/`):

- `devices.json`: `devices` by MAC (name, `kind` if its type is set by hand, `blocked`, `known`, `allowed`, guest expiry…),
  `profiles` by 8-hex id (name, members, schedules, `paused`, `pause_until`,
  `bonus_until`/bonus start, sites), `settings` (`block_private`, `block_unknown`) and
  `dhcp` (classes, subnet options, pools, fixed hosts). Written only by `change_state`.
- `state.lock`: the lock every change and firewall sync holds.
- `traffic.db`: usage (5-minute buckets for 7 days, hourly to 90 days), line `quality`
  (30 days), `speed` tests (kept for good).
- `pihole-sync.json`: the last plan written to Pi-hole, so unchanged plans aren't
  rewritten.
- `sessions.json`: who is signed in to the page, each token as its hash, root's alone.
- `tv-key`: the TV key (`curfew tv-link`; see [tv.md](tv.md)).
- `tv-frames.jsonl`: the screensavers' frame reports, a line a minute while one shows
  (rotated to `.1` past 1 MB; see [flow.md](flow.md)).
- `speedtest-started`: touched as a speed test begins (Orbit's probe, for 120 s after).

## Settings

Sections: `[web]`, `[paths]`, `[dhcp]`, `[network]` (with `[[network.status]]` cards,
one named "VPN"), `[pihole]`, `[devices]`, `[schedules]`, `[sky]` (latitude and
longitude: sunrise, sunset, the sun and moon), `[refresh]` (each page's poll, with
floors), `[speedtest]`, `[calendar]` (a private link: kept only in homehub's file, never
in the repo). A new setting gets a default in `config.py` and a line in
`curfew.example.toml`.

## Releases

- One release is one commit on `main`: the version bumped in `pyproject.toml`,
  `uv.lock` (line 16) and `src/curfew/__init__.py`; the specs updated with it.
- `./deploy.sh`: ruff, pytest, build the wheel, copy it and the units to homehub,
  install, restart.
- After a release that changes the TV's pages, restart the TV app where it's open (see
  [tv.md](tv.md)).
- The TV app has its own version (`tv/app/build.gradle.kts`: `versionCode`,
  `versionName`); bump `versionCode` whenever it's reinstalled, or launchers keep
  cached icons.

## Tests

`uv run pytest` in `curfew/` (one file per area; `conftest.py` points settings at a
throwaway directory, so tests never touch real state). `uv run ruff check src tests`.
The browser-side code has no test suite: check it in a headless browser (page errors
included) on every theme and after a theme switch.
