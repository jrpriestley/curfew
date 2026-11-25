# The web page (`src/curfew/web/`)

## Serving (`server.py`)

- Also `https://curfew` (homehub's firewall sends it here; see the README). HTTPS on
  `[web] port` (8088), certificate from homehub's CA (`make-cert.sh` before
  each start); plain HTTP gets a redirect. HTTP/1.1 keep-alive, so polling doesn't pay
  for a handshake each time.
- Content policy: everything from `'self'`, no inline scripts or styles, no framing.
  New markup must not need inline `style=` or `<script>`.
- `/app.css` and `/app.js` are real files in `static/`, served with a content hash in the
  URL and cached for a year, as are the screensaver's scripts (`FLOW_SCRIPTS`: `flow-light.js`,
  `flow-town.js`, `flow-forest.js`, `flow-highway.js` (joined from `static/highway/`), `flow-sound.js`, `flow.js`), which only its page loads, after app.js; icons, the manifest, the font and `/ca.crt` are public.
- Forms are capped at `MAX_FORM_BYTES`.

## Sign-in (`auth.py`)

- Accounts in `[web] users` (`curfew-admin`, `al`), login-only system accounts, checked
  against `/etc/shadow`. Sessions last 12 h (`hr_session` cookie). Five failures from one
  address lock it out for 10 minutes.
- Read-only accounts in `[web] viewers` (`cy`), made the same way: a session remembers
  who signed in (`Sessions.user`), and a viewer's (`Handler.viewer`) gets Home's figures
  only (the tiles, not links; the live view; today's chart without its link; no sections
  in the top bar, so no tab bar on a phone) and the screensaver (`/tv/flow` and its feeds).
  Any other page or TV tab sends it to `/`; the refreshed parts are 401; every post but
  sign-in, sign-out, the theme and the TV's own settings is 403.
- The TV signs in with its key instead, which opens only `/tv` (see [tv.md](tv.md)). A
  password session can view `/tv` too.
- The top bar links to the screensaver (`FLOW_LINK`, `/tv/flow?back=/`: any key or a
  click comes back to Home); not on a phone (under 600 px), to keep the bar's width, and
  a phone has no keys.

## Routes

| Path | What |
|---|---|
| `/` | Home: tiles, new devices, profile cards, the live view, the last 24 h |
| `/devices` | the two switches and the device table; its filter matches a device's row and facts (name, profile, status, IP, MAC, maker) or its profile's heading, never its opened row's controls, whose menus name every profile (`deviceText`, `applyFilter`) |
| `/device?mac=` | one device: what it is, why it has internet or not, its use, its DHCP |
| `/profile?id=` | one profile: status, week, schedules, sites, use, devices, manage |
| `/network` | the connection path, quality, speed, the constellation, DHCP and Pi-hole cards |
| `/dhcp` | the DHCP server, pools, fixed addresses, leases, options |
| `/usage` | the connection, a device or a profile over 24 h / 7 d / 30 d |
| `/live.json` | ppp0's counters (and `?mac=` one device's; `?devices=1` all), signed in |
| `/network/path`, `/network/pihole` | parts a page refreshes in place (`PARTS`) |
| `/tv…` | the TV; see [tv.md](tv.md) |
| POST `/login`, `/logout`, `/theme`, `/settings`, `/profile`, `/device`, `/dhcp`, `/wake`, `/undo` | changes |

Unknown paths are 404; pages without a session show the sign-in form; feeds without one
are 401.

## Changes and Undo (`undo.py`)

- Every change posts a form, goes through `change_state`, and answers with the page as
  it now is. A toast says what happened in words, with **Undo** for 120 s.
- Undo puts the state back only while nothing else has changed it since, so it can never
  wipe out someone else's change.
- Without JavaScript, every form still works as a normal post.

## Behaviour in the browser (`static/app.js`)

- Forms post in the background; the server's new `<main>` and top bar are swapped in
  with no reload and no jump; changed figures count to their new values.
- Pages refresh every `[refresh] page` seconds (30) unless someone is typing, renaming
  or has a pop-up open. The connection path refreshes every 10 s, Pi-hole every 30 s,
  live charts every 2 s, the constellation's glow every 5 s. Polling stops while the
  tab is hidden. Elements marked `data-keep` (the live chart) survive swaps.
- One tooltip follows the pointer for every hover hint.
- app.js is ES5-compatible JavaScript (`var`, `function`): it also runs in the Fire TV's
  WebView. The screensaver's code is in its own files (docs/tv.md), the same ES5, no build.

## Look (`layout.py`, `components.py`, `charts.py`, `icons.py`, `sky.py`, `app.css`)

- Theme: *System*, *Light* or *Dark*, kept in the `curfew_theme` cookie and applied by
  the server. Every colour is a CSS variable with a light and a dark value.
- Font: Amazon Ember, the standard for the house's web pages (reps too), served from
  homehub's `[paths] ember_dir` and kept out of the repo; the system font (Inter on the TV
  pages) without it. A Fire TV uses its own copy.
- Chart colours: download blue, upload orange (the dataviz categorical steps, validated
  per surface), curfew amber. Charts are server-drawn SVG, each with a table twin.
- The top bar is tinted by homehub's sky (dawn, day, dusk, night from sunrise and
  sunset at `[sky]`, else fixed hours), and night whenever any profile's curfew is on.
  The logo is tonight's moon.
- Below 600 px, table rows become cards and sections move to a bottom tab bar.
- Status pills: Allowed, Scheduled, Paused, Blocked, New device, Private.

## Rules for changes

- Nothing on a page decides who gets internet: it shows `internet_status` and posts
  actions.
- Reads that are slow or shared (leases, Pi-hole, the connection path, the VPN) go
  through `cache.Recent`, so many viewers don't multiply the work.
- The page never reveals where traffic goes, only how much.
