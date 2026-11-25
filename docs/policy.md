# Policy and enforcement

## Devices

- A device is a MAC. The list comes from dhcpd's leases (the last 30 days, `[devices]
  recent_days`, or all), plus records in `devices.json`. homehub's own MAC is never a
  device to block.
- Name: the saved name, else a dhcpd.conf comment, else the DHCP hostname
  (`display_name`). Maker: the local IEEE registries, longest prefix first; nothing
  looked up online. Type (phone, TV,
  console…, `KIND_LABELS`): the one set on the device (`kind` on its record), else guessed from the name,
  then the maker (`device_kind`, `guess_kind`).
- Private (locally administered) MACs are tagged *private*.
- Actions (`DEVICE_ACTIONS`): block, unblock, rename, type (set, or back to the guess), allow, disallow (the private
  rule), approve, guest (on for `GUEST_HOURS` = 24, then forgotten by the sync), forget
  (the record goes; it's new again). Also wake (wake-on-LAN), which changes nothing.

## Who gets internet: `policy.internet_status`

The first reason that applies, in this order, is the device's status:

1. homehub itself: always `allowed`.
2. `blocked`: blocked by hand.
3. `unknown`: *Block new devices* is on and it was never approved (`known`).
4. `paused` / `scheduled`: its profile is paused, or inside a schedule window, and not
   lifted by bonus time.
5. `private`: *Block private Wi-Fi addresses* is on, its MAC is private, and it wasn't
   allowed.
6. `allowed`.

Every surface (page pills, the TV's `cut` list, the firewall) uses this one function;
nothing decides blocking any other way. Display order is `STATUS_ORDER`.

## Profiles, schedules and overrides (`schedules.py`)

- A profile is a named group; a device is in at most one. Adding a device approves it.
- A schedule: days and a from/to window, local time. A window whose end is at or before
  its start runs overnight and belongs to the day it starts (Fri 21:00–07:00 covers
  Friday night to Saturday 07:00).
- Pause: until resumed, or for 30 min / 1 h / 2 h / until `[schedules] morning`
  (07:00). *Pause all* / *Resume all* act on every profile; devices outside profiles are
  untouched.
- Bonus time (15/30/60 min) lifts a block that's on now, or, given up to 24 h before a
  block starts, moves its start back. More bonus extends it; *Revoke* takes it all back.
- Timed overrides expire on their own; nothing has to clear them.
- Each profile shows its next change ("Blocked from Sun 21:00 (in 3 h 30 min)").
- Blocked sites: domains (a pasted URL is trimmed to its domain) or presets
  (`SITE_PRESETS`, with the CDN domains each needs). Sites are blocked at all times, not
  on the schedule.

## nftables (`firewall.py`, rules in `homehub/router.nft`)

- curfew fills sets in table `inet router`; the rules are in `router.nft`, loaded by
  `homehub-router.service`. curfew never edits rules, only set contents.
- Blocking cuts the WAN only: LAN traffic still flows.
- A block applies to the MAC and to the addresses that MAC holds (its leases, and its
  fixed address), so a device behind a MAC-rewriting bridge is still caught. An address
  belongs to whoever holds its newest lease.
- *Block new devices* is an allowlist: known MACs pass, anything else is dropped from its
  first packet.
- Leased addresses are pushed within a second of a new lease (`curfew-leases.path`).
- Usage counters are per-IP sets updated after the block rules, so dropped traffic
  isn't counted.

## Pi-hole (`pihole.py`)

- Each profile with sites is a group `curfew-<profile id>`: one client per member by
  current DHCP IP (members with no lease in 30 days left out), one regex deny rule per
  site, linked to that group only.
- Written straight into `gravity.db`, then `pihole reloadlists`. curfew owns only rows it
  made (groups `curfew-*`, rows commented `curfew`); everything else is left alone.
- Written only when the plan differs from `pihole-sync.json`.
- New clients copy the groups of any subnet client they sit in (the *AV* group's
  `10.7.2.0/24`), so those rules keep applying.
- `curfew doh` writes the encrypted-DNS blocklist (`data/doh-domains.txt`) as regex rules
  commented `curfew-doh`.
- Stats (the page's scoreboard, the TV's shield) come from Pi-hole's API with its local
  CLI password, cached.

## DHCP (`dhcp.py`)

- dhcpd.conf keeps the global settings and includes `curfew.conf`, which curfew writes
  from `state["dhcp"]`: classes and members, the house subnet's options and pools, fixed
  hosts. What it doesn't model is carried over word for word (`extra`).
- `curfew dhcp adopt` moves them out of dhcpd.conf once; a block it can't model stops it.
- Every change is checked (pools don't overlap; a fixed address is outside the pools and
  not homehub's or another device's), then tested with `dhcpd -t` on copies in
  `/etc/dhcp`, then swapped in and the service restarted. If dhcpd won't start, the old
  file goes back. A refused change saves nothing.
- Never edit `curfew.conf` by hand; changes go through the page or `curfew dhcp`.

## Usage, quality and speed

- `sync` reads the per-IP counters and ppp0's byte counts each minute and adds the
  difference to 5-minute buckets under the MAC holding the IP (a counter that went
  backwards was reset). Buckets fold to hourly after 7 days; hours drop after 90.
- Not counted: traffic inside the house, homehub's own, and anything blocked.
- Line quality: the sync pings Fibrenet's gateway and the first ping target every
  minute; kept 30 days. Pings carry `probe_mark` so they leave by ppp0, not the VPN.
- Speed: weekly, after waiting (up to three times, 15 minutes apart) for the house to
  be under 5 Mb/s; results kept for good.
- Speed tests only use servers within `[speedtest] near_km` (100) of `[sky]`, at most
  the 10 nearest, keeping the one that answers fastest. curfew lists them itself
  (speedtest.net's server API, distances worked out from each server's place) and hands
  them to the command on stdin (`nearby_speedtest.py`, run with the system's python3
  and `-I`, which has speedtest-cli). Never let speedtest-cli choose: its old server
  list places homehub by address and has put it in Venezuela and Maine. No `[sky]`, or
  no server near, and the test is a failure saying so, not a test from far away.
