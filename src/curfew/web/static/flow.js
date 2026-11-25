// ------------------------------------------------------------------- flow --
// The screensaver: homehub, the internet above it, the house's devices on their orbits,
// all among the stars. Traffic runs between them as dots with fading trails: blue down
// (internet to homehub to device), orange up, more and bigger the busier the link.
// Pi-hole's blocks are asteroids that break on homehub's shield. Rates come from the
// TV's feeds every POLL seconds (not while the screen is away); each frame is drawn
// afresh, on a canvas for light and a layer above for the rest. Neighbourhood, Forest and
// Highway are scenes of their own (flow-town.js, flow-forest.js, highway/), given what
// they share through `flow`.
function flowView(canvas) {
  // The quality: sharp on a computer (its screen's full sharpness, up to 4K, and more of
  // everything), not in the Fire TV app's WebView (Android's, "; wv)"), which is slow.
  // ?quality=sharp or ?quality=tv sets it, kept on that browser (flow-quality).
  var sharp = !tvApp, asked = /[?&]quality=(sharp|tv)\b/.exec(location.search);
  try {
    if (asked) {
      localStorage.setItem('flow-quality', asked[1]);
    }
    var kept = localStorage.getItem('flow-quality');
    if (kept) {
      sharp = kept === 'sharp';
    }
  } catch (error) {
    if (asked) {
      sharp = asked[1] === 'sharp';
    }
  }
  // Sharp's detail (the Controls' Detail, kept on that browser: flow-detail): High;
  // Ultra, light and shadows worked out on the GPU too, in a scene that has them; or Auto,
  // Ultra until it can't keep ULTRA_FPS (two ULTRA_WATCH-second spells running, after
  // ULTRA_SETTLE, or the pace drops to 30 under it), then High for the rest of the tab's
  // visit (flow-ultra-off).
  var DETAILS = ['auto', 'high', 'ultra'], detail = 'auto', demoted = false;
  var ULTRA_FPS = 50, ULTRA_WATCH = 3, ULTRA_SETTLE = 4;
  try {
    detail = DETAILS.indexOf(localStorage.getItem('flow-detail')) >= 0 ? localStorage.getItem('flow-detail') : 'auto';
    demoted = sessionStorage.getItem('flow-ultra-off') === '1';
  } catch (error) {
    // Not kept: Auto.
  }
  function ultra() {
    return sharp && (detail === 'ultra' || (detail === 'auto' && !demoted));
  }
  var watched = {settle: 0, time: 0, frames: 0, slow: 0};
  // `full`: drawing every frame. At 30, the pacing judges instead.
  function watchUltra(seconds, full) {
    if (document.hidden || seconds >= 0.1) {
      watched.settle = 0;
      watched.time = watched.frames = 0;
      return;
    }
    if ((watched.settle += seconds) < ULTRA_SETTLE || !full) {
      watched.time = watched.frames = 0;
      return;
    }
    watched.time += seconds;
    watched.frames += 1;
    if (watched.time < ULTRA_WATCH) {
      return;
    }
    watched.slow = watched.frames / watched.time < ULTRA_FPS ? watched.slow + 1 : 0;
    // Two slow spells in a row: not a passing hitch.
    if (watched.slow >= 2) {
      demote();
    }
    watched.time = watched.frames = 0;
  }
  function demote() {
    demoted = true;
    try {
      sessionStorage.setItem('flow-ultra-off', '1');
    } catch (error) {
      // This visit only.
    }
  }
  // The page the scenes are laid out for, the TV's (CSS pixels); a bigger window shows the
  // same, scaled up.
  var DESIGN = {width: 960, height: 540};
  // BACKING: the most pixels drawn across (a TV reports 4 a point, and 4K a frame is more
  // than its WebView can paint). ORBIT: ms for the outermost orbit to go round once. TAIL:
  // the segments of each particle's trail. SPEED: how fast data travels, in screen widths
  // a second. TILT: how flat the orbits look. Sharp: longer trails, more glow (GLOW), and
  // the scenes' light eased every SKY_EVERY seconds rather than each minute.
  var POLL = 2, MAX_PARTICLES = sharp ? 800 : 300, TAIL = sharp ? 6 : 3, BACKING = sharp ? 3840 : 1280, SPEED = 0.28, ORBIT = 600000;
  var GLOW = sharp ? 1.6 : 1, SKY_EVERY = sharp ? 5 : 60;
  var TILT = 0.3, TWINKLE = 30;
  // Sharp: bloom. What gives light is stamped again on a canvas a quarter the size
  // (glaring(), in the scene's own pixels), which is halved twice more; each is gathered
  // (GLARE, each's strength) on one more at a quarter and laid over the scene as light: a
  // soft halo round every light, wider from the smaller.
  var GLARE = [0.35, 0.45, 0.75], glare = !sharp ? null : GLARE.concat([0]).map(function () {
    var board = document.createElement('canvas');
    return {board: board, paint: board.getContext('2d')};
  });
  function glaring() {
    return glare && glare[0].paint;
  }
  // SHIELD: the radius of homehub's shield, where Pi-hole's blocks break up.
  var SHIELD = 34, MAX_SPARKS = 40;
  // The look: Orbit (space), Still (simple: flat and still), or a scene under a
  // sky by the clock (scenic): Neighbourhood, Forest, or Highway, which draws its whole
  // frame itself.
  var SCENIC = ['town', 'forest', 'highway'];
  var look = canvas.dataset.look, simple = look === 'simple', town = look === 'town', forest = look === 'forest';
  var scenic = SCENIC.indexOf(look) >= 0, highway = look === 'highway';
  // A name fades in or out in a quarter of a second.
  var FADE = 4;
  var ctx = canvas.getContext('2d');
  // Names and rates go on a layer above, cleared every frame.
  var layer = document.createElement('canvas');
  layer.className = 'flow-labels';
  canvas.after(layer);
  var text = layer.getContext('2d');
  // Space behind it all, in two layers of stars that CSS drifts at different speeds,
  // which costs the TV nothing (a third full-screen layer costs it frames): the far one
  // black with a faint nebula. A few stars twinkle on the clean layer.
  var skies = [0, 1].map(function (depth) {
    var stars = document.createElement('canvas');
    stars.className = 'flow-stars flow-stars-' + depth;
    canvas.before(stars);
    return stars;
  });
  var style = getComputedStyle(document.documentElement);
  function color(name) {
    return style.getPropertyValue(name).trim();
  }
  var palette = {
    text: color('--text'), muted: color('--muted'), down: color('--down'), up: color('--up'),
    ok: color('--ok'), warn: color('--warn'), danger: color('--danger'),
  };
  // Orbits, like planets': far enough apart that dots never touch even where the tilt
  // squeezes them; the inner ones go round faster (a period grows as distance^1.5). A
  // device's orbit and place come from its MAC, so it keeps them; on an orbit, devices are
  // spread unevenly, but never closer than 0.7 of an even share of the way round. PULL:
  // how far a device drifts in when busy and out when idle, under half the gap.
  var ORBITS = [0.42, 0.53, 0.64, 0.75, 0.87, 1];
  var PULL = 0.04;
  // 0 to 1, the same for the same word (FNV-1a).
  function hash(word) {
    var h = 2166136261;
    for (var i = 0; i < word.length; i += 1) {
      h ^= word.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }
  var devices = JSON.parse(canvas.dataset.devices), byMac = {};
  var orbits = ORBITS.map(function () { return []; });
  (function placeOnOrbits() {
    // The outer orbits, longer, take more.
    var room = ORBITS.reduce(function (sum, reach) { return sum + reach; }, 0);
    devices.forEach(function (device) {
      var pick = hash(device.mac) * room, orbit = 0;
      while (orbit < ORBITS.length - 1 && pick > ORBITS[orbit]) {
        pick -= ORBITS[orbit];
        orbit += 1;
      }
      orbits[orbit].push(device);
      device.down = 0;
      device.up = 0;
      device.seed = hash(device.mac + 'seed') * 6.3;
      byMac[device.mac] = device;
    });
    orbits.forEach(function (members, orbit) {
      members.sort(function (a, b) { return hash(a.mac + 'place') - hash(b.mac + 'place'); });
      var start = hash('orbit' + orbit) * 6.2832, share = 6.2832 / Math.max(1, members.length);
      members.forEach(function (device, index) {
        device.angle = start + share * (index + 0.5 + 0.3 * (hash(device.mac + 'nudge') - 0.5));
        device.reach = ORBITS[orbit];
        device.period = pace(device);
        device.ripples = [];
        device.arrive = 1;
        device.announce = 0;
        device.missing = 0;
      });
    });
  })();

  // ----------------------------------------------------- the scenes' common --
  // The sky canvas behind the scenes; the camera and the projection from places in cells
  // to the screen (unit: a cell's size there; origin: where the pivot lands); colours
  // through the scenes' light; a few shapes' helpers. SLOPE: how steeply the ground runs
  // across the screen, unturned: tan 17.5 degrees, a low view across it.
  var skyCanvas = document.createElement('canvas');
  skyCanvas.className = 'flow-sky';
  canvas.before(skyCanvas);
  var SLOPE = 0.315, unit = 1, origin = {x: 0, y: 0};
  // The projection's matrix (a b; c d, as setTransform takes it) for the camera's turn and
  // nearness, about its pivot.
  var cam = {a: 1, b: SLOPE, c: -1, d: SLOPE, z: 1, pivot: {u: 0, v: 0}};
  function aim(turn, near, pivot) {
    var cos = Math.cos(turn), sin = Math.sin(turn), k = unit * near;
    cam.a = k * (cos - sin);
    cam.c = -k * (cos + sin);
    cam.b = k * SLOPE * (cos + sin);
    cam.d = k * SLOPE * (cos - sin);
    cam.z = k;
    cam.pivot = pivot;
  }
  // A place on the screen, z above the ground there: a scene's hills (`lift`, the town's
  // on a computer) lift whatever stands on them. project() is the plain projection, for
  // what keeps its own level (a roof, the land's foot).
  var lift = null;
  function iso(u, v, z) {
    return project(u, v, (z || 0) + (lift ? lift(u, v) : 0));
  }
  function project(u, v, z) {
    var du = u - cam.pivot.u, dv = v - cam.pivot.v;
    return {x: origin.x + cam.a * du + cam.c * dv, y: origin.y + cam.b * du + cam.d * dv - (z || 0) * cam.z};
  }
  // A line's corners rounded: a curve from radius before each to radius after it.
  function rounded(points, radius) {
    var out = [points[0]];
    for (var i = 1; i + 1 < points.length; i += 1) {
      var a = points[i - 1], b = points[i], c = points[i + 1];
      var ab = Math.hypot(b.u - a.u, b.v - a.v), bc = Math.hypot(c.u - b.u, c.v - b.v);
      var r = Math.min(radius, ab / 2, bc / 2);
      var from = {u: b.u + (a.u - b.u) * r / ab, v: b.v + (a.v - b.v) * r / ab};
      var to = {u: b.u + (c.u - b.u) * r / bc, v: b.v + (c.v - b.v) * r / bc};
      for (var k = 0; k <= 6; k += 1) {
        out.push({u: curve(from.u, b.u, to.u, k / 6), v: curve(from.v, b.v, to.v, k / 6)});
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }
  function channels(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  // Through `cast`, the light on the scenes: warm at dawn and dusk, cool under the moon.
  function rgb(shade, light) {
    return 'rgb(' + shade.map(function (channel, i) { return Math.min(255, Math.round(channel * light * cast[i])); }) + ')';
  }
  function smoothstep(x) {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
  }
  // A face's light, 0.6 to 1.15: how squarely it faces the light, from the upper left.
  function lit3(a, b, c) {
    var e = [b.u - a.u, b.v - a.v, b.z - a.z], f = [c.u - a.u, c.v - a.v, c.z - a.z];
    var n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    if (n[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
    }
    var long = Math.hypot(n[0], n[1], n[2]) || 1;
    return 0.6 + 0.55 * Math.max(0, (-0.5 * n[0] - 0.2 * n[1] + 0.84 * n[2]) / long);
  }
  // When each device was last busy (more than IDLE_BITS): a house's windows light from it.
  // Kept on the TV (BUSY_KEY) across the reloads.
  var IDLE_BITS = 100e3, BUSY_KEY = 'flow-busy', busySeen = {};
  try {
    busySeen = JSON.parse(localStorage.getItem(BUSY_KEY) || '{}') || {};
  } catch (error) {
    // None kept.
  }
  // How long a device takes round its orbit: farther is slower, cut off slower still. In
  // Still and the scenes it stands still.
  function pace(device) {
    if (simple || scenic) {
      return Infinity;
    }
    return ORBIT * Math.pow(device.reach, 1.5) * (device.allowed ? 1 : 1.6);
  }
  // Profiles, drawn as constellations: their members joined by faint lines.
  var profiles = JSON.parse(canvas.dataset.profiles || '{}'), groups = {};
  devices.forEach(function (device) {
    if (device.profile) {
      (groups[device.profile] = groups[device.profile] || []).push(device);
    }
  });
  // Today's record: the server's 5-minute peak or the most this TV has seen today, which
  // it keeps; beating it flares homehub.
  var peakKey = 'flow-peak-' + canvas.dataset.day, peak = Number(canvas.dataset.peak) || 0;
  try {
    peak = Math.max(peak, Number(localStorage.getItem(peakKey)) || 0);
  } catch (error) {
    // None kept.
  }
  var recordAt = 0;
  // Pi-hole's blocks a second, and the asteroids they make against the shield.
  var blocks = 0, sparks = [], shield = {flash: 0, angle: 0}, owedSparks = 0;
  // A speed test running: Orbit launches a probe.
  var testingNow = false;
  var wan = {down: 0, up: 0, acc: {}}, particles = [], dpr = 1, glows = {};
  // What the line can carry (curfew.toml's line_mbps), down and up.
  var line = (canvas.dataset.line || '').split(' ').map(Number);
  function brief(bits) {
    if (bits >= 1e6) {
      return (bits / 1e6).toFixed(bits >= 1e8 ? 0 : 1) + ' Mb/s';
    }
    return Math.round(bits / 1e3) + ' kb/s';
  }
  // The line can't carry more than all of it.
  function share(bits, of) {
    if (!of) {
      return '';
    }
    var percent = Math.min(100, 100 * bits / of);
    return percent < 1 ? '<1%' : percent.toFixed(0) + '%';
  }
  var width = 0, height = 0, hub = {}, net = {}, across = 0, deep = 0, twinkles = [];
  // The camera's slow drift.
  var view = {zoom: 1, tilt: 1};
  // 0 to 1: how far into zen (words gone, data slowed), eased.
  var calm = 0;

  // --------------------------------------------------------------- sprites --
  // A particle is a pre-drawn glow, one drawImage rather than two arcs, per colour: a
  // defined core, a short glow.
  function glow(fill) {
    var size = Math.round(12 * dpr), sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    var paint = sprite.getContext('2d'), middle = size / 2;
    var shade = paint.createRadialGradient(middle, middle, 0, middle, middle, middle);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.12, fill);
    shade.addColorStop(0.36, fill);
    shade.addColorStop(0.5, fill + '55');
    shade.addColorStop(1, fill + '00');
    paint.fillStyle = shade;
    paint.fillRect(0, 0, size, size);
    return sprite;
  }
  // Asteroids, for Pi-hole's blocks: a few rocks, each lumpy, shaded and cratered.
  var rocks = [];
  function rock() {
    var size = Math.round(22 * dpr), sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    var paint = sprite.getContext('2d'), middle = size / 2, corners = 9;
    paint.beginPath();
    for (var corner = 0; corner < corners; corner += 1) {
      var turn = 6.2832 * corner / corners, reach = middle * (0.66 + 0.3 * Math.random());
      paint[corner ? 'lineTo' : 'moveTo'](middle + reach * Math.cos(turn), middle + reach * Math.sin(turn));
    }
    paint.closePath();
    var shade = paint.createRadialGradient(middle * 0.7, middle * 0.65, 0, middle, middle, middle);
    shade.addColorStop(0, '#b8aca0');
    shade.addColorStop(0.6, '#7d7268');
    shade.addColorStop(1, '#3f3934');
    paint.fillStyle = shade;
    paint.fill();
    paint.strokeStyle = '#2c2723';
    paint.lineWidth = dpr;
    paint.stroke();
    paint.fillStyle = 'rgba(40, 34, 30, 0.55)';
    for (var crater = 0; crater < 3; crater += 1) {
      paint.beginPath();
      paint.arc(middle + (Math.random() - 0.5) * middle * 0.8, middle + (Math.random() - 0.5) * middle * 0.8,
        (0.6 + Math.random() * 1.4) * dpr, 0, 6.2832);
      paint.fill();
    }
    return sprite;
  }
  // Sharp, in Orbit: homehub as a planet, the same each time, lit from the upper left,
  // its night side dark, in a thin blue air.
  var planet = null, PLANET_PATCHES = [['#5b8f58', 7, 0.34], ['#f4f6fa', 9, 0.22]];
  function world() {
    var r = Math.round(14 * dpr), pad = Math.round(6 * dpr), size = 2 * (r + pad), m = size / 2;
    var sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    var paint = sprite.getContext('2d');
    var air = paint.createRadialGradient(m - 0.2 * r, m - 0.2 * r, 0.85 * r, m, m, r + pad);
    air.addColorStop(0, 'rgba(130, 186, 255, 0.7)');
    air.addColorStop(1, 'rgba(130, 186, 255, 0)');
    paint.fillStyle = air;
    paint.fillRect(0, 0, size, size);
    paint.save();
    paint.beginPath();
    paint.arc(m, m, r, 0, 6.2832);
    paint.clip();
    paint.fillStyle = '#2d5d9c';
    paint.fillRect(0, 0, size, size);
    // Lands, then clouds.
    PLANET_PATCHES.forEach(function (kind, layer) {
      paint.fillStyle = kind[0];
      paint.globalAlpha = layer ? 0.55 : 1;
      for (var i = 0; i < kind[1]; i += 1) {
        var x = m + (hash('world' + layer + 'x' + i) - 0.5) * 2 * r, y = m + (hash('world' + layer + 'y' + i) - 0.5) * 2 * r;
        paint.beginPath();
        paint.ellipse(x, y, r * kind[2] * (0.6 + hash('world' + layer + 'w' + i)), r * kind[2] * (0.25 + 0.4 * hash('world' + layer + 'h' + i)),
          hash('world' + layer + 'a' + i) * 3, 0, 6.2832);
        paint.fill();
      }
    });
    paint.globalAlpha = 1;
    var night = paint.createRadialGradient(m - 0.5 * r, m - 0.55 * r, 0.2 * r, m - 0.2 * r, m - 0.2 * r, 1.6 * r);
    night.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    night.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
    night.addColorStop(0.75, 'rgba(2, 4, 12, 0.75)');
    night.addColorStop(1, 'rgba(2, 4, 12, 0.95)');
    paint.fillStyle = night;
    paint.fillRect(0, 0, size, size);
    paint.restore();
    return sprite;
  }
  // Where homehub and the internet sit: lower in Orbit, so the internet is high above. A
  // scene fills the screen its own way.
  function centre() {
    hub = {x: width / 2, y: height * (simple ? 0.5 : 0.55)};
    net = {x: width / 2, y: height * (simple ? 0.08 : 0.1)};
    if (scene) {
      scene.fit();
    }
  }

  // ---------------------------------------------------------------- the sky --
  // The scenes' sky by the clock: space and its stars by night, blue by day, dawn's and
  // dusk's glow low down, and blends between. The sun's hours (dawn, day, dusk, night)
  // come with the page. `starry`: how much the stars show.
  var starry = 1;
  // The scenes' light (red, green, blue), and the moon's.
  var cast = [1, 1, 1], moonlit = 0;
  var sun = (canvas.dataset.sun || '6 7 18 19').split(' ').map(Number);
  var NIGHT = {top: [5, 7, 15], low: [16, 22, 38], stars: 1};
  var DAWN = {top: [38, 52, 96], low: [226, 140, 96], stars: 0.3};
  var DAY = {top: [34, 84, 150], low: [96, 146, 200], stars: 0};
  var DUSK = {top: [42, 32, 82], low: [220, 118, 80], stars: 0.3};
  var skyStars = [];
  for (var star = 0; star < (sharp ? 520 : 220); star += 1) {
    skyStars.push({x: Math.random(), y: Math.random() * 0.8, r: 0.3 + Math.pow(Math.random(), 3) * 1.2, a: 0.2 + 0.7 * Math.random()});
  }
  // Where the sun and moon are in homehub's sky (data-place: latitude and longitude), for
  // the scenes' moonlight and shadows; neither is drawn. Low precision, within a degree or
  // so: the sunrise equation's sun, the moon's main terms.
  var home = (canvas.dataset.place || '').split(' ').map(Number);
  var RAD = Math.PI / 180, TILT_E = 23.4397 * RAD;
  // Sharp: the shadows' light, the sun's while it's up (coming on as it rises) or else the
  // moon's, weaker under cloud: its bearing (az: from the south, round by the west) and
  // how long a unit of height's shadow is (at most SHADOW_MOST).
  var SHADOW_MOST = 3, sunlight = {az: 0, length: 1, strength: 0};
  function heavens() {
    if (home.length !== 2 || isNaN(home[0])) {
      return;
    }
    // Days from J2000.
    var d = Date.now() / 86400000 - 10957.5;
    var lat = home[0] * RAD, sidereal = (280.16 + 360.9856235 * d) * RAD + home[1] * RAD;
    function fromEcliptic(l, b) {
      return {ra: Math.atan2(Math.sin(l) * Math.cos(TILT_E) - Math.tan(b) * Math.sin(TILT_E), Math.cos(l)),
        dec: Math.asin(Math.sin(b) * Math.cos(TILT_E) + Math.cos(b) * Math.sin(TILT_E) * Math.sin(l))};
    }
    function bearing(body) {
      var h = sidereal - body.ra;
      return {alt: Math.asin(Math.sin(lat) * Math.sin(body.dec) + Math.cos(lat) * Math.cos(body.dec) * Math.cos(h)),
        az: Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(body.dec) * Math.cos(lat))};
    }
    var m = (357.5291 + 0.98560028 * d) * RAD;
    var centre = (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) * RAD;
    var sunAt = m + centre + 102.9372 * RAD + Math.PI;
    var mean = (218.316 + 13.176396 * d) * RAD, anomaly = (134.963 + 13.064993 * d) * RAD;
    var node = (93.272 + 13.22935 * d) * RAD, moonAt = mean + 6.289 * RAD * Math.sin(anomaly);
    var moonSky = bearing(fromEcliptic(moonAt, 5.128 * RAD * Math.sin(node))), alt = moonSky.alt;
    // Moonlight: how full it is (how far round from the sun), as it climbs.
    moonlit = (1 - Math.cos(moonAt - sunAt)) / 2 * Math.max(0, Math.min(1, (alt || 0) / (15 * RAD)));
    var sunSky = bearing(fromEcliptic(sunAt, 0)), by = sunSky.alt > 0 ? sunSky : moonSky;
    sunlight = {az: by.az, length: Math.min(SHADOW_MOST, 1 / Math.tan(Math.max(by.alt, RAD))),
      strength: (sunSky.alt > 0 ? smoothstep(sunSky.alt / (6 * RAD)) : 0.55 * moonlit) * (1 - 0.8 * overcast)};
  }
  // A unit of height's shadow on the scene's ground (u, v), away from the light: the
  // compass from the camera unturned has west to the screen's right, south away from us.
  function shadowWay() {
    var turn = scene.turn, cos = Math.cos(turn), sin = Math.sin(turn);
    var west = {u: cos - sin, v: -(cos + sin)}, south = {u: -(cos + sin), v: -(cos - sin)}, k = sunlight.length / Math.SQRT2;
    var su = Math.cos(sunlight.az), sw = Math.sin(sunlight.az);
    return {u: -(su * south.u + sw * west.u) * k, v: -(su * south.v + sw * west.v) * k};
  }
  // Sharp: the air over a scene, between far and near (heights on the screen): far off it
  // fades into the sky's low colour (skyLow), thicker in fog; then the hour's grades: gold
  // while the sun is low, blue by night, grey under cloud. In one fill: the haze and the
  // grades over it, as one colour a stop.
  var HAZE = 0.22, skyLow = [96, 146, 200], grades = [];
  // `top` laid over `under`, each [colour, alpha], as one.
  function over(under, top) {
    var alpha = 1 - (1 - under[1]) * (1 - top[1]);
    return [under[0].map(function (c, i) {
      return alpha ? (c * under[1] * (1 - top[1]) + top[0][i] * top[1]) / alpha : 0;
    }), alpha];
  }
  function airShade(paint, far, near) {
    var air = paint.createLinearGradient(0, far, 0, near);
    [[0, HAZE + (precip.fog ? 0.35 : 0)], [1, 0]].forEach(function (stop) {
      var shade = grades.reduce(over, [skyLow, stop[1]]);
      air.addColorStop(stop[0], 'rgba(' + shade[0].map(Math.round) + ', ' + shade[1].toFixed(3) + ')');
    });
    return air;
  }
  // Laid only over what's drawn.
  function atmosphere(paint, far, near) {
    paint.save();
    paint.globalCompositeOperation = 'source-atop';
    paint.globalAlpha = 1;
    paint.fillStyle = airShade(paint, far, near);
    paint.fillRect(0, 0, paint.canvas.width, paint.canvas.height);
    paint.restore();
  }

  // ------------------------------------------------------------- the weather --
  // The scenes' weather, from the real weather (data-weather: the WMO code, degrees C, the
  // wind in km/h and the degrees it blows from, cloud %, snow lying in m), refreshed with
  // the page. Rain and snow slant with the wind (seen facing south: a west wind blows to
  // the left) and come in at the top from far enough upwind to cover the screen all the
  // way down; a storm adds now and then a soft flash; fog lays a haze; cloud greys the sky
  // and hides the stars. While it snows the ground and roofs whiten, patch by patch, and
  // above freezing they melt; the cover is kept on the TV (SNOW_KEY), so it carries across
  // reloads, and never shows less than the snow really lying. In a hard frost (FROST) the
  // water freezes; fireflies come out only on mild (MILD), dry nights.
  var FROST = -5, MILD = 10, SNOW_KEY = 'flow-snow', SNOW = [236, 240, 246], ICE = [168, 192, 208];
  var PRECIP = {51: ['rain', 0.15], 53: ['rain', 0.25], 55: ['rain', 0.35], 56: ['rain', 0.2], 57: ['rain', 0.35],
    61: ['rain', 0.4], 63: ['rain', 0.65], 65: ['rain', 1], 66: ['rain', 0.45], 67: ['rain', 0.8],
    80: ['rain', 0.5], 81: ['rain', 0.75], 82: ['rain', 1], 95: ['rain', 0.9], 96: ['rain', 1], 99: ['rain', 1],
    71: ['snow', 0.35], 73: ['snow', 0.65], 75: ['snow', 1], 77: ['snow', 0.25], 85: ['snow', 0.6], 86: ['snow', 1]};
  var weather, precip, overcast, windX, temp, frozen;
  var snowCover = 0, snowPainted = 0, snowSaved = 0, lightning = {next: 10 + 20 * Math.random(), k: 0};
  var fallers = [], fogShade = null;
  // From the page, and again from each quiet refresh.
  function takeWeather(fresh) {
    weather = fresh;
    var found = PRECIP[weather.code] || [null, 0];
    precip = {kind: found[0], amount: found[1], storm: weather.code >= 95, fog: weather.code === 45 || weather.code === 48};
    overcast = weather.cloud !== undefined ? weather.cloud / 100 : ({1: 0.2, 2: 0.5, 3: 1})[weather.code] || 0;
    if (precip.kind) {
      overcast = Math.max(overcast, 0.8);
    }
    if (precip.fog) {
      overcast = 1;
    }
    windX = Math.sin((weather.from || 0) * Math.PI / 180) * Math.min(1, (weather.wind || 0) / 40);
    temp = weather.temp === undefined ? MILD : weather.temp;
    frozen = temp <= FROST;
    // Each drop or flake: a place on the screen (0 to 1), a depth and a pace. Those
    // already falling carry on: a refresh's new temperature mustn't jump them all. Sharp:
    // twice as many, and deeper, the farthest smaller and slower.
    var count = Math.round(precip.amount * (precip.kind === 'snow' ? 260 : 360) * (sharp ? 2 : 1));
    fallers.length = Math.min(fallers.length, count);
    for (var i = fallers.length; i < count; i += 1) {
      fallers.push({x: Math.random(), y: Math.random(), z: (sharp ? 0.2 : 0.4) + (sharp ? 0.8 : 0.6) * Math.random(),
        phase: Math.random() * 6.3});
    }
  }
  takeWeather(JSON.parse(canvas.dataset.weather || '{}'));
  // The cover after so many hours of this weather: building while it snows (a heavy fall
  // whole in 20 minutes), melting above freezing, faster the warmer and in rain.
  function settleSnow(hours) {
    hours = Math.max(0, Math.min(6, hours));
    if (precip.kind === 'snow') {
      snowCover += 3 * precip.amount * hours;
    } else if (temp > 0) {
      snowCover -= (0.3 + 0.15 * temp + (precip.kind === 'rain' ? 1 : 0)) * hours;
    }
    snowCover = Math.max(Math.min(1, (weather.depth || 0) / 0.03), Math.min(1, snowCover));
  }
  try {
    var keptSnow = JSON.parse(localStorage.getItem(SNOW_KEY) || 'null');
    if (keptSnow) {
      snowCover = Number(keptSnow.cover) || 0;
      settleSnow((Date.now() - keptSnow.at) / 3600000);
    }
  } catch (error) {
    // None kept.
  }
  settleSnow(0);
  snowPainted = snowCover;
  function whiten(shade, f) {
    return shade.map(function (c, i) { return c + (SNOW[i] - c) * f; });
  }
  // In front of the scene, every frame: the snow's cover eased on (the forest's ground
  // repainted as it changes), the rain or snow, a storm's flashes, fog.
  function drawWeather(paint, time, seconds) {
    settleSnow(seconds / 3600);
    if (Math.abs(snowCover - snowPainted) > 0.02) {
      snowPainted = snowCover;
      if (forest) {
        sky();
      }
    }
    if (time - snowSaved > 30000) {
      snowSaved = time;
      try {
        localStorage.setItem(SNOW_KEY, JSON.stringify({cover: snowCover, at: Date.now()}));
      } catch (error) {
        // Not kept.
      }
    }
    if (precip.kind === 'rain') {
      drawRain(paint, seconds);
    } else if (precip.kind === 'snow') {
      drawSnow(paint, time, seconds);
    }
    if (precip.storm) {
      drawStormFlash(paint, seconds);
    }
    if (precip.fog && fogShade) {
      paint.globalAlpha = 1;
      paint.fillStyle = fogShade;
      paint.fillRect(0, 0, width, height);
    }
    paint.globalAlpha = 1;
  }
  // Where one comes in at the top: across the screen and, with a wind, that far upwind
  // as it drifts on the way down (drift: across the screen over a whole fall).
  function topX(drift) {
    return Math.min(0, -drift) - 0.05 + Math.random() * (1.1 + Math.abs(drift));
  }
  function drawRain(paint, seconds) {
    paint.strokeStyle = 'rgb(200, 215, 232)';
    paint.lineWidth = Math.max(1, dpr);
    paint.globalAlpha = 0.4 - 0.15 * starry;
    paint.beginPath();
    fallers.forEach(function (drop) {
      var fall = (1.1 + 0.5 * drop.z) * seconds, long = (0.02 + 0.025 * drop.z) * height;
      drop.y += fall;
      drop.x += windX * 0.45 * fall * height / width;
      if (drop.y > 1.05) {
        drop.y -= 1.1;
        drop.x = topX(windX * 0.45 * 1.1 * height / width);
      }
      var x = drop.x * width, y = drop.y * height;
      paint.moveTo(x, y);
      paint.lineTo(x - windX * 0.45 * long, y - long);
    });
    paint.stroke();
  }
  function drawSnow(paint, time, seconds) {
    paint.fillStyle = '#f4f7fb';
    paint.globalAlpha = 0.9 - 0.2 * starry;
    paint.beginPath();
    fallers.forEach(function (flake) {
      var fall = (0.04 + 0.06 * flake.z) * seconds;
      flake.y += fall;
      flake.x += (windX * 0.5 * fall + 0.0025 * Math.sin(time / 900 * (0.6 + flake.z) + flake.phase) * seconds * 4) * height / width;
      if (flake.y > 1.02) {
        flake.y -= 1.04;
        flake.x = topX(windX * 0.5 * 1.04 * height / width);
      }
      var x = flake.x * width, y = flake.y * height, r = (0.8 + 1.6 * flake.z) * dpr;
      paint.moveTo(x + r, y);
      paint.arc(x, y, r, 0, 6.2832);
    });
    paint.fill();
  }
  // Now and then a flash: a flicker, then it fades.
  function drawStormFlash(paint, seconds) {
    lightning.next -= seconds;
    if (lightning.next <= 0) {
      lightning.k = 1;
      lightning.next = 12 + 25 * Math.random();
    }
    if (lightning.k > 0) {
      lightning.k = Math.max(0, lightning.k - seconds / 0.45);
      paint.fillStyle = '#e8eeff';
      paint.globalAlpha = 0.22 * lightning.k * (lightning.k > 0.6 && lightning.k < 0.75 ? 0.3 : 1);
      paint.fillRect(0, 0, width, height);
    }
  }
  // Cloud, on the sky canvas with it: no clouds drawn, but the sky greyed under a heavy
  // one and the stars dimmed. And fog's shade, made here for the frames to lay.
  function paintClouds(paint) {
    var w = paint.canvas.width, h = paint.canvas.height;
    var grey = [150, 156, 166].map(function (c, i) { return c + ([26, 28, 36][i] - c) * starry; });
    paint.globalAlpha = 0.75 * Math.max(0, (overcast - 0.2) / 0.8);
    paint.fillStyle = rgb(grey, 1);
    paint.fillRect(0, 0, w, h);
    paint.globalAlpha = 1;
    if (precip.fog) {
      fogShade = ctx.createLinearGradient(0, 0, 0, height);
      var mist = [206, 210, 216].map(function (c, i) { return c + ([46, 50, 58][i] - c) * starry; }).join(', ');
      fogShade.addColorStop(0, 'rgba(' + mist + ', 0.25)');
      fogShade.addColorStop(1, 'rgba(' + mist + ', 0.6)');
    }
  }
  // A rise and fall: 0 up to `from`, 1 at `top`, 0 again from `to`.
  function bump(x, from, top, to) {
    if (x <= from || x >= to) {
      return 0;
    }
    return x < top ? (x - from) / (top - from) : (to - x) / (to - top);
  }
  // The light for now, checked every SKY_EVERY seconds: the sky painted, the scenes' cast
  // and grades, and the scene's own light (and the Forest's ground, painted).
  function sky() {
    heavens();
    keepBusySeen();
    if (!scenic) {
      starry = 1;
      cast = [1, 1, 1];
      return;
    }
    var now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
    var keys = [[0, NIGHT], [sun[0], NIGHT], [(sun[0] + sun[1]) / 2, DAWN], [sun[1] + 0.5, DAY],
      [sun[2] - 0.5, DAY], [(sun[2] + sun[3]) / 2, DUSK], [sun[3], NIGHT], [24, NIGHT]];
    var at = 1;
    while (at < keys.length - 1 && keys[at][0] <= hour) {
      at += 1;
    }
    var a = keys[at - 1], b = keys[at], f = Math.max(0, Math.min(1, (hour - a[0]) / (b[0] - a[0] || 1)));
    starry = a[1].stars + (b[1].stars - a[1].stars) * f;
    var paint = skyCanvas.getContext('2d');
    paintSky(paint, a[1], b[1], f);
    paintClouds(paint);
    // The light on the scene: warm while the sun is low, at dawn and dusk; by night the
    // moon's, cool and brighter the fuller and higher it is; either softened by cloud.
    var warm = Math.max(bump(hour, sun[0], (sun[0] + sun[1]) / 2, sun[1] + 1), bump(hour, sun[2] - 1, (sun[2] + sun[3]) / 2, sun[3]));
    warm *= 1 - 0.6 * overcast;
    var moon = moonlit * starry * (1 - overcast);
    cast = [1 + 0.22 * warm + 0.25 * moon, 1 + 0.04 * warm + 0.32 * moon, 1 - 0.14 * warm + 0.45 * moon];
    skyLow = a[1].low.map(function (c, i) { return c + (b[1].low[i] - c) * f; });
    grades = !sharp ? [] : [[[255, 168, 88], 0.13 * warm], [[26, 44, 112], 0.16 * starry * (1 - 0.5 * overcast)],
      [[150, 156, 166], 0.12 * overcast * (1 - 0.6 * starry)]].filter(function (grade) { return grade[1] > 0.01; });
    scene.sky(paint, hour, warm);
  }
  // When each house was last busy, kept for the windows; a day's worth.
  function keepBusySeen() {
    var stamp = Date.now();
    Object.keys(busySeen).forEach(function (mac) {
      if (stamp - busySeen[mac] > 86400000) {
        delete busySeen[mac];
      }
    });
    try {
      localStorage.setItem(BUSY_KEY, JSON.stringify(busySeen));
    } catch (error) {
      // Can't keep it.
    }
  }
  // Between two of the day's keys, `f` of the way.
  function paintSky(paint, a, b, f) {
    function mix(x, y) {
      return 'rgb(' + x.map(function (c, i) { return Math.round(c + (y[i] - c) * f); }) + ')';
    }
    var shade = paint.createLinearGradient(0, 0, 0, skyCanvas.height * 0.62);
    shade.addColorStop(0, mix(a.top, b.top));
    shade.addColorStop(1, mix(a.low, b.low));
    paint.globalAlpha = 1;
    paint.fillStyle = shade;
    paint.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    paint.fillStyle = '#ffffff';
    skyStars.forEach(function (point) {
      if (starry < 0.02) {
        return;
      }
      paint.globalAlpha = point.a * starry * (1 - overcast);
      paint.beginPath();
      paint.arc(point.x * skyCanvas.width, point.y * skyCanvas.height, point.r * dpr, 0, 6.2832);
      paint.fill();
    });
  }
  // dpr: canvas pixels to a pixel of the design (the TV's page), so a bigger window draws
  // the same scene, its words and lines scaled with it; the words over the canvas are
  // zoomed to match (--flow-zoom).
  function fit() {
    var pixels = Math.min(window.devicePixelRatio || 1, BACKING / canvas.clientWidth);
    var zoom = Math.max(1, Math.min(canvas.clientWidth / DESIGN.width, canvas.clientHeight / DESIGN.height));
    canvas.closest('main').style.setProperty('--flow-zoom', zoom);
    dpr = pixels * zoom;
    width = Math.round(canvas.clientWidth * pixels);
    height = Math.round(canvas.clientHeight * pixels);
    canvas.width = layer.width = width;
    canvas.height = layer.height = height;
    // The last, gathering them, a quarter.
    (glare || []).forEach(function (level, index) {
      var scale = 4 << Math.min(index, GLARE.length) % GLARE.length;
      level.board.width = Math.ceil(width / scale);
      level.board.height = Math.ceil(height / scale);
    });
    glows = {down: glow(palette.down), up: glow(palette.up), stop: glow(palette.danger), firefly: glow('#e4f58c'), warm: glow('#ffd27a')};
    rocks = [rock(), rock(), rock(), rock(), rock()];
    planet = sharp && !scenic && !simple ? world() : null;
    centre();
    // The outermost orbit's half-widths.
    across = width * 0.42;
    deep = across * TILT;
    skies.forEach(paintSpace);
    twinkles = [];
    for (var twinkle = 0; twinkle < TWINKLE; twinkle += 1) {
      twinkles.push({x: Math.random() * width, y: Math.random() * height, radius: (0.6 + Math.random()) * dpr, seed: Math.random() * 6.3});
    }
  }
  var STAR_TINTS = ['#ffffff', '#ffffff', '#ffffff', '#cfe0ff', '#ffe9c4'];
  var NEBULAE = [['#3b2a6b', 0.22, 0.3], ['#1f4a6b', 0.74, 0.6], ['#4a2350', 0.55, 0.16]];
  function paintSpace(stars, depth) {
    stars.width = Math.round(width * 1.12);
    stars.height = Math.round(height * 1.12);
    var paint = stars.getContext('2d');
    if (depth === 0) {
      paint.fillStyle = '#000';
      paint.fillRect(0, 0, stars.width, stars.height);
      NEBULAE.forEach(function (cloud) {
        var x = cloud[1] * stars.width, y = cloud[2] * stars.height, reach = stars.width * 0.34;
        var shade = paint.createRadialGradient(x, y, 0, x, y, reach);
        shade.addColorStop(0, cloud[0] + '38');
        shade.addColorStop(1, cloud[0] + '00');
        paint.fillStyle = shade;
        paint.fillRect(0, 0, stars.width, stars.height);
      });
      if (sharp) {
        galaxy(paint, stars.width, stars.height);
      }
    }
    var count = (sharp ? [900, 60] : [300, 30])[depth], biggest = [0.9, 1.7][depth];
    for (var star = 0; star < count; star += 1) {
      paint.globalAlpha = 0.2 + 0.7 * Math.random();
      paint.fillStyle = STAR_TINTS[star % STAR_TINTS.length];
      paint.beginPath();
      paint.arc(Math.random() * stars.width, Math.random() * stars.height, (0.3 + biggest * Math.pow(Math.random(), 3)) * dpr, 0, 6.2832);
      paint.fill();
    }
  }
  // Sharp: the far sky's galaxy, a band across it at a slant, thick with faint stars, its
  // middle crossed by dark lanes of dust; more nebulae, rose and teal; in Still,
  // a fine grain over it all, as film has.
  var GALAXY_NEBULAE = [['#7a3a6b', 0.12, 0.78, 0.22], ['#1f6b6b', 0.88, 0.2, 0.26], ['#3a3a8a', 0.4, 0.62, 0.3]];
  function galaxy(paint, w, h) {
    GALAXY_NEBULAE.forEach(function (cloud) {
      var x = cloud[1] * w, y = cloud[2] * h, reach = w * cloud[3], shade = paint.createRadialGradient(x, y, 0, x, y, reach);
      shade.addColorStop(0, cloud[0] + '30');
      shade.addColorStop(1, cloud[0] + '00');
      paint.fillStyle = shade;
      paint.fillRect(0, 0, w, h);
    });
    paint.save();
    paint.translate(w / 2, h / 2);
    paint.rotate(-0.45);
    var long = Math.hypot(w, h) / 2, wide = h * 0.11;
    galaxyGlow(paint, long, wide);
    paint.fillStyle = '#ffffff';
    // Its stars, thickest in the middle.
    for (var star = 0; star < 2600; star += 1) {
      var along = (Math.random() - 0.5) * 2 * long, aside = (Math.random() + Math.random() + Math.random() - 1.5) * wide * 0.8;
      paint.globalAlpha = 0.15 + 0.45 * Math.random();
      paint.fillRect(along, aside, 0.7 * dpr, 0.7 * dpr);
    }
    galaxyDust(paint, long, wide);
    paint.restore();
    paint.globalAlpha = 1;
    if (simple) {
      filmGrain(paint, w, h);
    }
  }
  // In soft patches along it.
  function galaxyGlow(paint, long, wide) {
    for (var i = 0; i < 16; i += 1) {
      var x = (i / 15 - 0.5) * 2 * long, y = (hash('band' + i) - 0.5) * wide * 0.6, reach = wide * (1 + hash('band r' + i));
      paint.save();
      paint.translate(x, y);
      paint.scale(2.4, 1);
      var glowing = paint.createRadialGradient(0, 0, 0, 0, 0, reach);
      glowing.addColorStop(0, 'rgba(176, 168, 210, 0.1)');
      glowing.addColorStop(1, 'rgba(176, 168, 210, 0)');
      paint.fillStyle = glowing;
      paint.fillRect(-reach, -reach, 2 * reach, 2 * reach);
      paint.restore();
    }
  }
  // Soft-edged, along its middle.
  function galaxyDust(paint, long, wide) {
    for (var lane = 0; lane < 22; lane += 1) {
      var lx = (hash('lane' + lane) - 0.5) * 1.6 * long, ly = (hash('lane y' + lane) - 0.5) * wide;
      var lw = wide * (0.5 + 0.8 * hash('lane w' + lane));
      paint.save();
      paint.translate(lx, ly);
      paint.scale(1, 0.18 * (0.6 + hash('lane h' + lane)));
      var dust = paint.createRadialGradient(0, 0, 0, 0, 0, lw);
      dust.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
      dust.addColorStop(1, 'rgba(0, 0, 0, 0)');
      paint.globalAlpha = 1;
      paint.fillStyle = dust;
      paint.fillRect(-lw, -lw, 2 * lw, 2 * lw);
      paint.restore();
    }
  }
  function filmGrain(paint, w, h) {
    var tile = document.createElement('canvas'), grain = tile.getContext('2d');
    tile.width = tile.height = 192;
    var dots = grain.createImageData(192, 192);
    for (var at = 0; at < dots.data.length; at += 4) {
      var tint = Math.random() * 255;
      dots.data[at] = dots.data[at + 1] = dots.data[at + 2] = tint;
      dots.data[at + 3] = 14;
    }
    grain.putImageData(dots, 0, 0);
    paint.fillStyle = paint.createPattern(tile, 'repeat');
    paint.fillRect(0, 0, w, h);
  }

  // ----------------------------------------------------------- the devices --
  // Which side of a device its name goes: out, away from homehub.
  function facesRight(device, spot) {
    return scenic ? spot.x >= hub.x : Math.cos(device.at) >= 0;
  }
  // Where a device is now on its orbit, and how near: depth runs from -1, behind homehub,
  // to 1, in front, where things are larger and brighter. A device arriving flies in from
  // beyond the orbits to its own.
  function place(device, time) {
    device.at = device.angle + 6.2832 * time / device.period;
    if (scenic) {
      var roof = device.roof || hub;
      return {x: roof.x, y: roof.y, depth: 1, near: 1};
    }
    var arriving = 1 + 1.6 * Math.pow(1 - device.arrive, 2);
    // Flat, seen from above: nothing nearer or farther.
    if (simple) {
      var out = device.reach * arriving;
      return {x: hub.x + width * 0.4 * out * Math.cos(device.at), y: hub.y + height * 0.34 * out * Math.sin(device.at), depth: 0, near: 1};
    }
    var depth = Math.sin(device.at);
    var reach = (device.reach + PULL * (device.pull || 0)) * arriving * view.zoom;
    return {
      x: hub.x + across * reach * Math.cos(device.at),
      y: hub.y + deep * view.tilt * reach * depth,
      depth: depth, near: 0.72 + 0.14 * (depth + 1),
    };
  }
  // Particles a second for a link carrying `bits` a second: none when idle, then by order
  // of magnitude, so a stream and a trickle both show.
  function density(bits) {
    return bits < 2000 ? 0 : Math.min(28, 3.2 * Math.log10(bits / 1000));
  }
  // How big each of its particles is: about 1 at a megabit, half at 100 kb/s, over twice
  // at a gigabit.
  function heft(bits) {
    return Math.max(0.5, Math.min(2.4, 0.95 + 0.42 * Math.log10(bits / 1e6)));
  }
  // Each link carries over the fraction of a particle it owes, so a stream is evenly
  // spaced rather than bursty. The forest's trees are its traffic; the highway has none.
  function stream(owed, key, bits, seconds, kind, from, to) {
    if (forest || highway) {
      return;
    }
    owed[key] = (owed[key] || 0) + density(bits) * seconds;
    while (owed[key] >= 1) {
      owed[key] -= 1;
      if (particles.length < MAX_PARTICLES) {
        particles.push({kind: kind, from: from, to: to, t: 0, bend: Math.random() - 0.5, size: heft(bits), s: 0,
          route: scene && scene.route ? scene.route(from, to, kind) : null});
      }
    }
  }
  // A new pace for a device, from where it is now, so it doesn't jump.
  function repace(device) {
    device.period = pace(device);
    if (device.at === undefined) {
      return;
    }
    device.angle = device.at - (device.period === Infinity ? 0 : 6.2832 * performance.now() / device.period);
  }
  // Another theme: the scene fades to black under a veil, changes once it's all black, and
  // fades in once the new one has drawn, keeping everything it knows (rates, names,
  // pulses); the theme's name shows again.
  var veil = null;
  var LOOK_NAMES = {space: 'Orbit', simple: 'Still', town: 'Neighbourhood', forest: 'Forest', highway: 'Highway'};
  canvas.switchLook = function (look) {
    throughBlack(function (main, name) { becomeLook(look, main, name); });
  };
  // Highway's next biome by name, or (-1) the one before, for trying them out.
  window.flowBiome = function (way) {
    if (!scene || !scene.toBiome || canvas.closest('main').classList.contains('switching')) {
      return;
    }
    throughBlack(function (main, name) {
      name.textContent = scene.toBiome(way);
      replay(name);
    });
  };
  // The scene fades to black, `change` happens unseen, and it fades back.
  function throughBlack(change) {
    var main = canvas.closest('main'), name = main.querySelector('.flow-look');
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'flow-black';
      main.appendChild(veil);
      void veil.offsetWidth;
    }
    main.classList.add('switching');
    setTimeout(function () {
      change(main, name);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { main.classList.remove('switching'); });
      });
    }, 600);
  }
  function becomeLook(look, main, name) {
    if (staleDevices) {
      location.reload();  // (the cookie says which theme)
      return;
    }
    simple = look === 'simple';
    town = look === 'town';
    forest = look === 'forest';
    scenic = SCENIC.indexOf(look) >= 0;
    highway = look === 'highway';
    current = look;
    choose();
    startTempo(performance.now());
    ['space', 'simple'].concat(SCENIC).forEach(function (each) {
      main.classList.toggle('flow-' + each, each === look);
    });
    canvas.dataset.look = look;
    devices.forEach(repace);
    view.zoom = 1;
    view.tilt = 1;
    // Traffic set out in one scene doesn't fit the next.
    particles = [];
    sparks = [];
    centre();
    sky();
    name.textContent = LOOK_NAMES[look];
    replay(name);
  }
  // Its CSS animation, run again.
  function replay(element) {
    element.style.animation = 'none';
    void element.offsetWidth;
    element.style.animation = '';
  }

  // ------------------------------------------------------ Orbit's moments --
  // A record: a comet streaking across the sky, its tail streaming behind it.
  var comet = null;
  function launchComet() {
    var way = Math.random() < 0.5 ? 1 : -1, y0 = (0.05 + 0.15 * Math.random()) * height;
    comet = {t: 0, x0: way > 0 ? -0.05 * width : 1.05 * width, y0: y0, x1: way > 0 ? 1.05 * width : -0.05 * width,
      y1: y0 + (0.15 + 0.2 * Math.random()) * height};
  }
  function drawComet(paint, seconds) {
    if (!comet) {
      return;
    }
    comet.t += seconds / 3.2;
    if (comet.t >= 1) {
      comet = null;
      return;
    }
    var dx = comet.x1 - comet.x0, dy = comet.y1 - comet.y0, long = Math.hypot(dx, dy), tail = 0.22 * width;
    var x = comet.x0 + dx * comet.t, y = comet.y0 + dy * comet.t, tx = x - dx / long * tail, ty = y - dy / long * tail;
    paint.save();
    paint.globalCompositeOperation = 'lighter';
    paint.lineCap = 'round';
    var shade = paint.createLinearGradient(x, y, tx, ty);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    shade.addColorStop(0.3, 'rgba(170, 210, 255, 0.45)');
    shade.addColorStop(1, 'rgba(120, 170, 255, 0)');
    paint.strokeStyle = shade;
    // A soft wide tail, then a bright narrow one.
    [[8, 0.3], [3, 1]].forEach(function (pass) {
      paint.globalAlpha = pass[1];
      paint.lineWidth = pass[0] * dpr;
      paint.beginPath();
      paint.moveTo(x, y);
      paint.lineTo(tx, ty);
      paint.stroke();
    });
    var head = 30 * dpr;
    paint.globalAlpha = 1;
    paint.drawImage(glows.down, x - head / 2, y - head / 2, head, head);
    paint.restore();
  }
  // A speed test running: a probe flies out from homehub to the internet and back, over
  // and over while it runs.
  var probe = null;
  function drawProbe(paint, seconds) {
    if (!probe && testingNow) {
      probe = {t: 0};
    }
    if (!probe) {
      return;
    }
    probe.t += seconds / 2.4;
    if (probe.t >= 1) {
      probe = testingNow ? {t: 0} : null;
      if (!probe) {
        return;
      }
    }
    var f = probe.t < 0.5 ? 2 * probe.t : 2 - 2 * probe.t, e = smoothstep(f);
    var x = hub.x + (net.x - hub.x) * e + Math.sin(Math.PI * f) * 40 * dpr * (probe.t < 0.5 ? 1 : -1);
    var y = hub.y + (net.y - hub.y) * e, r = 3 * dpr;
    paint.save();
    paint.globalCompositeOperation = 'lighter';
    var halo = 26 * dpr;
    paint.drawImage(glows.up, x - halo / 2, y - halo / 2, halo, halo);
    paint.globalCompositeOperation = 'source-over';
    // Its solar panels, and its body.
    paint.fillStyle = '#7ab8ff';
    paint.fillRect(x - 3.4 * r, y - 0.6 * r, 2.2 * r, 1.2 * r);
    paint.fillRect(x + 1.2 * r, y - 0.6 * r, 2.2 * r, 1.2 * r);
    paint.fillStyle = '#e8e8e8';
    paint.fillRect(x - r, y - r, 2 * r, 2 * r);
    paint.restore();
  }
  // A new record for the day: homehub flares (Orbit's is a comet), the figure glows, the
  // TV remembers it.
  function record() {
    peak = wan.down;
    recordAt = Date.now();
    if (simple || scenic) {
      hub.flare = 1;
    } else {
      launchComet();
    }
    try {
      localStorage.setItem(peakKey, String(peak));
    } catch (error) {
      // Not kept.
    }
    var rates = document.querySelector('.flow-rates');
    rates.classList.add('record');
    setTimeout(function () { rates.classList.remove('record'); }, 4000);
  }

  // ------------------------------------------------------------- the feeds --
  // Nothing is fetched while the app is in the background: there's nothing to show.
  function feed(query, take) {
    if (document.hidden) {
      return;
    }
    fetch(canvas.dataset.src + query, {cache: 'no-store', credentials: 'same-origin'})
      .then(function (response) { return response.json(); })
      .then(take)
      .catch(function () {});
  }
  function pollShield() {
    feed('?pihole=1', function (data) {
      blocks = Number(data.blocked) || 0;
      testingNow = !!data.testing;
    });
  }
  // The VPN, under homehub's name: for whom (homehub's own traffic, or the whole
  // house's), green while it carries traffic, amber when patchy, red when down.
  var vpn = {};
  function pollVpn() {
    feed('?vpn=1', function (data) { vpn = data || {}; });
  }
  function vpnLine() {
    var whom = {homehub: 'homehub only', 'whole house': 'whole house'}[vpn.for];
    if (!whom) {
      return null;
    }
    var how = {ok: ['VPN · ', palette.ok], warn: ['VPN patchy · ', palette.warn],
      bad: ['VPN down · ', palette.danger]}[vpn.status] || ['VPN ? · ', palette.muted];
    return [how[0] + whom, how[1]];
  }
  // The connection's last three minutes, beside its rates: a bar a reading, down rising
  // from the middle and up hanging below it, each against its own busiest (at least a
  // megabit down and 200 kb/s up, so a quiet line stays low).
  var history = [], HISTORY = 90, chart = document.querySelector('.flow-history');
  function drawHistory() {
    history.push([wan.down, wan.up]);
    if (history.length > HISTORY) {
      history.shift();
    }
    if (!chart) {
      return;
    }
    // As shown: zoomed.
    var scale = window.devicePixelRatio || 1, box = chart.getBoundingClientRect();
    var w = Math.round(box.width * scale), h = Math.round(box.height * scale);
    if (chart.width !== w || chart.height !== h) {
      chart.width = w;
      chart.height = h;
    }
    var paint = chart.getContext('2d'), middle = Math.round(h * 0.62), bar = w / HISTORY;
    var most = [1e6, 2e5];
    history.forEach(function (point) {
      most[0] = Math.max(most[0], point[0]);
      most[1] = Math.max(most[1], point[1]);
    });
    paint.clearRect(0, 0, w, h);
    paint.fillStyle = palette.muted;
    paint.globalAlpha = 0.35;
    paint.fillRect(0, middle, w, Math.max(1, scale));
    history.forEach(function (point, index) {
      var x = w - (history.length - index) * bar;
      // Older, fainter.
      paint.globalAlpha = 0.5 + 0.5 * (index + 1) / history.length;
      paint.fillStyle = palette.down;
      var up = (middle - 2 * scale) * point[0] / most[0];
      paint.fillRect(x, middle - up, Math.max(1, bar - scale), up);
      paint.fillStyle = palette.up;
      paint.fillRect(x, middle + 2 * scale, Math.max(1, bar - scale), (h - middle - 2 * scale) * point[1] / most[1]);
    });
  }
  // Rates: each feed's counters against its last reading, smoothed a little. No ppp0
  // (rx null) means the internet's down.
  var last = {}, lastWan = null, polled = 0, internetDown = false;
  function smooth(old, fresh) {
    return old * 0.35 + fresh * 0.65;
  }
  function poll() {
    feed('?devices=1', takeDevices);
    feed('', takeWan);
  }
  function takeDevices(data) {
    polled += 1;
    Object.keys(data.devices).forEach(function (mac) {
      var device = byMac[mac], now = {t: data.t, rx: data.devices[mac][0], tx: data.devices[mac][1]};
      var rates = device && bitRates(now, last[mac]);
      if (rates) {
        rateDevice(device, mac, rates);
      }
      last[mac] = now;
    });
    noteCuts(data);
    noteComings(data);
  }
  function rateDevice(device, mac, rates) {
    // A burst (a stream starting, a download kicking off): a ripple.
    var before = device.down + device.up, fresh = rates.down + rates.up;
    if (fresh > 1e6 && fresh > 4 * before + 2e5) {
      device.ripples.push(0);
    }
    // The first rates as they are.
    if (device.rated) {
      device.down = smooth(device.down, rates.down);
      device.up = smooth(device.up, rates.up);
    } else {
      device.down = rates.down;
      device.up = rates.up;
      device.rated = true;
    }
    if (device.down + device.up > IDLE_BITS) {
      busySeen[mac] = Date.now();
    }
    // Orbit: busy, it drifts in toward homehub; idle, out (all the way at 10 Mb/s).
    var busy = Math.min(1, Math.log10(1 + (device.down + device.up) / 1e4) / 3);
    device.pull = (device.pull || 0) + (1 - 2 * busy - (device.pull || 0)) * 0.15;
  }
  // Cut off or let back in (a schedule, a pause, a block by hand): its colour, ring and
  // pace change at once, and it says so.
  function noteCuts(data) {
    var cut = {};
    (data.cut || []).forEach(function (mac) { cut[mac] = true; });
    devices.forEach(function (device) {
      var allowed = !cut[device.mac];
      if (!data.devices[device.mac] || allowed === device.allowed) {
        return;
      }
      if (polled > 1) {
        device.announce = 4;
        device.event = allowed ? 'back online' : 'cut off';
        device.ripples.push(0);
      }
      device.allowed = allowed;
      changed();
      repace(device);
    });
  }
  // Arrivals and departures: the first two readings set the scene; after them, a device
  // that appears flies in, and one gone for three readings leaves.
  function noteComings(data) {
    devices.forEach(function (device) {
      if (data.devices[device.mac]) {
        if (!device.online && polled > 2) {
          device.arrive = 0;
          device.announce = 5;
          device.event = 'joined';
        }
        if (!device.online) {
          changed();
        }
        device.online = true;
        device.missing = 0;
      } else if (polled <= 2) {
        if (device.online) {
          changed();
        }
        device.online = false;
      } else if (device.online && (device.missing += 1) >= 3) {
        device.online = false;
        device.announce = 4;
        device.event = 'left';
        changed();
        device.ripples.push(0);
      }
    });
  }
  function takeWan(data) {
    if ((data.rx === null) !== internetDown) {
      internetDown = data.rx === null;
      changed();
    }
    var rates = data.rx !== null && bitRates(data, lastWan);
    if (rates) {
      var first = !wan.rated;
      wan.rated = true;
      wan.down = first ? rates.down : smooth(wan.down, rates.down);
      wan.up = first ? rates.up : smooth(wan.up, rates.up);
      if (wan.down > 5e6 && wan.down > peak * 1.05 && Date.now() - recordAt > 30000) {
        record();
      }
      var downShare = share(wan.down, line[0]), upShare = share(wan.up, line[1]);
      document.querySelector('[data-flow=down]').textContent = rate(wan.down) + (downShare ? ' · ' + downShare : '');
      document.querySelector('[data-flow=up]').textContent = rate(wan.up) + (upShare ? ' · ' + upShare : '');
      drawHistory();
    }
    if (data.rx !== null) {
      lastWan = data;
    }
  }

  // ------------------------------------------------------- the traffic's light --
  // A point along a particle's curve (a quadratic from a through m to b), one axis at a
  // time, so the hundreds drawn a frame make no garbage.
  function curve(a, m, b, u) {
    var v = 1 - u;
    return v * v * a + 2 * v * u * m + u * u * b;
  }
  // Every particle's dot and trail, and the asteroids' dust, added up as light is. On the
  // GPU (WebGL), one batch of quads a frame drawn off the page and laid on the scene in one
  // go, where the 2D drawing had them (under the town's buildings), so the TV's GPU thread
  // gets one draw, not hundreds of strokes. Without WebGL, or once it's lost, in 2D.
  function fractions(hex) {
    var full = hex.length === 4 ? hex.replace(/\w/g, '$&$&') : hex;
    return [1, 3, 5].map(function (at) { return parseInt(full.substr(at, 2), 16) / 255; });
  }
  // Each corner: where it is (pixels), where it is on its shape, its colour and strength,
  // and its shape: a dot's glow (-1), or a stroke's half-length and radius.
  var LIGHT_VERTEX = [
    'attribute vec2 place; attribute vec2 local; attribute vec4 colour; attribute vec2 shape;',
    'uniform vec2 size; varying vec2 at; varying vec4 tint; varying vec2 form;',
    'void main() {',
    '  gl_Position = vec4(place.x / size.x * 2.0 - 1.0, 1.0 - place.y / size.y * 2.0, 0.0, 1.0);',
    '  at = local; tint = colour; form = shape;',
    '}'].join('\n');
  // A dot: a white core, its colour, a short glow, as glow() draws it. A stroke: round at
  // both ends, its edge smoothed.
  var LIGHT_FRAGMENT = [
    'precision mediump float;',
    'varying vec2 at; varying vec4 tint; varying vec2 form;',
    'void main() {',
    '  vec3 light = tint.rgb; float strength;',
    '  if (form.x < 0.0) {',
    '    float t = length(at);',
    '    if (t > 1.0) { discard; }',
    '    light = mix(vec3(1.0), light, clamp(t / 0.12, 0.0, 1.0));',
    '    strength = t < 0.36 ? 1.0 : t < 0.5 ? mix(1.0, 0.333, (t - 0.36) / 0.14)',
    '      : mix(0.333, 0.0, (t - 0.5) / 0.5);',
    '  } else {',
    '    float d = length(vec2(max(abs(at.x) - form.x, 0.0), at.y));',
    '    strength = clamp(form.y - d + 0.5, 0.0, 1.0);',
    '  }',
    '  strength *= tint.a;',
    '  gl_FragColor = vec4(light * strength, strength);',
    '}'].join('\n');
  var DUST = '#8a8078';
  var lights = gpuLights() || flatLights();
  function flatLights() {
    return {
      begin: function () {
        ctx.lineCap = 'round';
      },
      segment: function (x0, y0, x1, y1, wide, fill, alpha) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fill;
        ctx.lineWidth = wide;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      },
      glow: function (x, y, size, kind) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        ctx.drawImage(glows[kind], x - size / 2, y - size / 2, size, size);
        bloomed(x, y, size, kind);
      },
      end: function () {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      },
    };
  }
  function gpuLights() {
    var board = document.createElement('canvas'), gl = null;
    try {
      gl = board.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false});
    } catch (error) {
      gl = null;
    }
    if (!gl) {
      return null;
    }
    function shader(kind, source) {
      var made = gl.createShader(kind);
      gl.shaderSource(made, source);
      gl.compileShader(made);
      return made;
    }
    var program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, LIGHT_VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, LIGHT_FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return null;
    }
    gl.useProgram(program);
    // Floats a corner; quads a frame at most (16-bit indices allow 16384).
    var STRIDE = 10, MOST = sharp ? 8192 : 4096;
    var data = new Float32Array(MOST * 4 * STRIDE), count = 0;
    var corners = gl.createBuffer(), order = gl.createBuffer(), indices = new Uint16Array(MOST * 6);
    for (var quad = 0; quad < MOST; quad += 1) {
      indices.set([0, 1, 2, 2, 1, 3].map(function (i) { return quad * 4 + i; }), quad * 6);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, order);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    [['place', 2, 0], ['local', 2, 2], ['colour', 4, 4], ['shape', 2, 8]].forEach(function (field) {
      var at = gl.getAttribLocation(program, field[0]);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, field[1], gl.FLOAT, false, STRIDE * 4, field[2] * 4);
    });
    var size = gl.getUniformLocation(program, 'size');
    // Light adds up.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    var lost = false;
    board.addEventListener('webglcontextlost', function () {
      lost = true;
      lights = flatLights();
    });
    var colours = {};
    function colour(fill) {
      return colours[fill] || (colours[fill] = fractions(fill));
    }
    function corner(x, y, lx, ly, tint, alpha, s0, s1) {
      var at = count * STRIDE;
      data[at] = x;
      data[at + 1] = y;
      data[at + 2] = lx;
      data[at + 3] = ly;
      data[at + 4] = tint[0];
      data[at + 5] = tint[1];
      data[at + 6] = tint[2];
      data[at + 7] = alpha;
      data[at + 8] = s0;
      data[at + 9] = s1;
      count += 1;
    }
    return {
      begin: function () {
        count = 0;
      },
      segment: function (x0, y0, x1, y1, wide, fill, alpha) {
        if (count >= MOST * 4) {
          return;
        }
        var dx = x1 - x0, dy = y1 - y0, long = Math.hypot(dx, dy) || 0.001;
        var r = wide / 2, half = long / 2, ux = dx / long, uy = dy / long, cx = x0 + dx / 2, cy = y0 + dy / 2;
        var along = half + r + 1, aside = r + 1, tint = colour(fill);
        for (var k = 0; k < 4; k += 1) {
          var a = k & 1 ? along : -along, c = k & 2 ? aside : -aside;
          corner(cx + ux * a - uy * c, cy + uy * a + ux * c, a, c, tint, alpha, half, r);
        }
      },
      glow: function (x, y, wide, kind) {
        if (count >= MOST * 4) {
          return;
        }
        bloomed(x, y, wide, kind);
        var tint = colour(kind === 'down' ? palette.down : kind === 'up' ? palette.up : palette.danger);
        for (var k = 0; k < 4; k += 1) {
          var a = k & 1 ? 1 : -1, c = k & 2 ? 1 : -1;
          corner(x + a * wide / 2, y + c * wide / 2, a, c, tint, 1, -1, 0);
        }
      },
      end: function () {
        if (lost) {
          return;
        }
        if (board.width !== width || board.height !== height) {
          board.width = width;
          board.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (count) {
          gl.uniform2f(size, width, height);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * STRIDE));
          gl.drawElements(gl.TRIANGLES, count / 4 * 6, gl.UNSIGNED_SHORT, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(board, 0, 0);
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  }
  // A particle's bloom: its glow again, twice the size, on the bloom's canvas. Not in the
  // scenes: the bloom goes on last, over the buildings and trees the traffic passes
  // behind, and there it swamped the streets.
  function bloomed(x, y, size, kind) {
    var paint = glaring();
    if (!paint || scenic) {
      return;
    }
    paint.globalAlpha = 0.7;
    paint.drawImage(glows[kind], x - size, y - size, 2 * size, 2 * size);
  }
  // A trail's piece: thinner and fainter the further back (step) it is.
  function trailPiece(kind, thick, step, x0, y0, x1, y1) {
    var fill = kind === 'down' ? palette.down : kind === 'up' ? palette.up : DUST;
    lights.segment(x0, y0, x1, y1, thick * dpr * (1.6 - step * 1.2 / TAIL), fill, 0.55 * (1 - step / TAIL));
  }
  function ring(x, y, radius, stroke, alpha) {
    text.globalAlpha = alpha;
    text.strokeStyle = stroke;
    text.lineWidth = 1.5 * dpr;
    text.beginPath();
    text.arc(x, y, radius, 0, 6.2832);
    text.stroke();
  }
  // A device: lit by its traffic; red when cut off, faint when away. Its dot's size is its
  // use today (a megabyte small, gigabytes large, never so big it could touch the next
  // orbit); a busy device glows and pulses, faster and deeper the more it moves now. In the
  // scenes there's nothing to draw here (the house or tree is the device), but the pulse
  // and bursts are kept.
  function drawDevice(device, spot, seconds) {
    var busy = density(device.down + device.up);
    var size = Math.min(8, 2.4 + 2.1 * Math.log10(1 + (device.today || 0) / 1e6)) * spot.near;
    var fill = !device.online ? palette.muted : device.allowed ? palette.ok : palette.danger;
    var light = 0.55 + 0.45 * (spot.depth + 1) / 2;
    device.phase = (device.phase || device.seed) + seconds * 6.2832 * (0.25 + busy / 30);
    var pulse = busy ? 1 + (0.12 + busy / 70) * Math.sin(device.phase) : 1;
    if (scenic) {
      device.ripples = device.ripples.map(function (age) { return age + seconds; }).filter(function (age) { return age < 1.2; });
      return;
    }
    if (busy) {
      dot(spot.x, spot.y, (size + 4 + busy) * pulse * dpr, fill, (0.1 + 0.06 * pulse) * light, text);
    }
    dot(spot.x, spot.y, size * pulse * dpr, fill, (device.online ? 0.9 : 0.3) * light, text);
    if (sharp) {
      roundedDot(device, spot, size * pulse * dpr, fill, busy, light);
    }
    // Cut off: a dim red ring.
    if (device.online && !device.allowed) {
      ring(spot.x, spot.y, (size + 3.5) * dpr, palette.danger, 0.55 * light);
    }
    // Bursts, spreading.
    device.ripples = device.ripples.filter(function (age, index) {
      device.ripples[index] = age + seconds;
      ring(spot.x, spot.y, (size + 4 + age * 55) * dpr, fill, 0.6 * (1 - age / 1.2) * light);
      return age + seconds < 1.2;
    });
  }
  // Sharp: rounded by a light from the upper left, and blooming while it's about.
  function roundedDot(device, spot, r, fill, busy, light) {
    var lit = text.createRadialGradient(spot.x - 0.4 * r, spot.y - 0.45 * r, 0, spot.x, spot.y, r);
    lit.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    lit.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    lit.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
    lit.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    text.globalAlpha = (device.online ? 1 : 0.4) * light;
    text.fillStyle = lit;
    text.beginPath();
    text.arc(spot.x, spot.y, r, 0, 6.2832);
    text.fill();
    if (device.online) {
      dot(spot.x, spot.y, 1.3 * r, fill, Math.min(1, 0.45 + busy / 20) * light, glaring());
    }
  }
  // The labels' backing: a near-black at VEIL, as the panels are (app.css), fixed.
  var VEIL = 0.3;
  function roundBox(paint, x, y, w, h, r) {
    paint.beginPath();
    paint.moveTo(x + r, y);
    paint.arcTo(x + w, y, x + w, y + h, r);
    paint.arcTo(x + w, y + h, x, y + h, r);
    paint.arcTo(x, y + h, x, y, r);
    paint.arcTo(x, y, x + w, y, r);
    paint.fill();
  }
  // `on` null is glaring() on the TV, which has no bloom: nothing to draw.
  function dot(x, y, radius, fill, alpha, on) {
    if (on === null) {
      return;
    }
    var paint = on || ctx;
    paint.globalAlpha = alpha;
    paint.fillStyle = fill;
    paint.beginPath();
    paint.arc(x, y, radius, 0, 6.2832);
    paint.fill();
  }

  // ------------------------------------------------------------- the tempo --
  // Two seconds at 60 that don't come near it (54) drop it to a steady 30: an even 30 looks
  // smoother than an uneven 40-odd. It tries 60 once more after RETRY ms, in case the drop
  // was a passing load; dropping again, 30 is kept for that theme on that screen for
  // PACE_DAYS (flow-pace) and not retried, since each try stutters. On a computer it's
  // judged from START_GRACE ms in: the first frames, while the page sets up, are slow on
  // any machine.
  var before = performance.now();
  var START_GRACE = 3000, RETRY = 120000, PACE_KEY = 'flow-pace', PACE_DAYS = 7;
  var tempo = {fps: 60, since: 0, frames: 0, retry: Infinity, drops: 0};
  function paceKey() {
    return current + (sharp ? '-sharp' : '-tv');
  }
  function keptPaces() {
    try {
      return JSON.parse(localStorage.getItem(PACE_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }
  function keepSlowPace() {
    var paces = keptPaces();
    paces[paceKey()] = Date.now();
    try {
      localStorage.setItem(PACE_KEY, JSON.stringify(paces));
    } catch (error) {
      // This visit only.
    }
  }
  // At the start and on a change of theme: 30 if that's what this theme kept here lately.
  function startTempo(time) {
    var kept = keptPaces()[paceKey()];
    var slow = kept && Date.now() - kept < PACE_DAYS * 86400000;
    tempo = {fps: slow ? 30 : 60, since: time + (sharp ? START_GRACE : 0), frames: 0, retry: Infinity, drops: slow ? 2 : 0};
  }
  function pacing(time) {
    if (tempo.fps === 30) {
      if (time < tempo.retry) {
        return;
      }
      tempo.fps = 60;
      tempo.since = time;
      tempo.frames = 0;
    }
    if (time < tempo.since) {
      return;
    }
    tempo.frames += 1;
    var spell = time - tempo.since;
    if (spell < 2000) {
      return;
    }
    // Longer than 4 s: the page was hidden, so it doesn't count.
    if (spell < 4000 && tempo.frames * 1000 / spell < 54) {
      slowDown(time);
    }
    tempo.since = time;
    tempo.frames = 0;
  }
  function slowDown(time) {
    tempo.fps = 30;
    tempo.drops += 1;
    report.drops += 1;
    if (tempo.drops >= 2) {
      tempo.retry = Infinity;
      keepSlowPace();
    } else {
      tempo.retry = time + RETRY;
    }
    // Ultra's doing.
    if (scene && scene.ultra && detail === 'auto' && watched.settle >= ULTRA_SETTLE) {
      demote();
    }
  }

  // ------------------------------------------------------------ the report --
  // Once a minute while it shows (the first after REPORT_FIRST, and one as it's left), how smoothly it ran, sent to curfew (/tv/frames) so the
  // TVs' frame rates can be read on homehub: the frames drawn, their spacing, what each
  // cost the script (the rest of a late frame is the GPU's), the pace's drops, how often the
  // screen itself refreshes (`tick`: a TV left at 24 or 50 Hz can't show 30 evenly) and the
  // keys pressed.
  var REPORT_EVERY = 60000, REPORT_FIRST = 15000, REPORT_LEAST = 5000, REPORT_PATH = '/tv/frames', lastDrawn = 0, lastTick = 0, reported = false;
  var report = newReport(before);
  function newReport(time) {
    return {since: time, gaps: [], costs: [], ticks: [], drops: 0};
  }
  function noteTick(time) {
    if (report.ticks.length < 600) {
      report.ticks.push(time - lastTick);
    }
    lastTick = time;
  }
  function noteFrame(time, cost) {
    var gap = time - lastDrawn;
    lastDrawn = time;
    // A long gap is the page having been hidden: not a frame's lateness.
    if (gap > 5000) {
      report = newReport(time);
      return;
    }
    report.gaps.push(gap);
    report.costs.push(cost);
    if (time - report.since >= (reported ? REPORT_EVERY : REPORT_FIRST)) {
      sendReport(time);
      report = newReport(time);
      reported = true;
    }
  }
  window.addEventListener('pagehide', function () {
    var time = performance.now();
    if (time - report.since > REPORT_LEAST && time - lastDrawn < 5000) {
      sendReport(time);
    }
  });
  function percentile(sorted, share) {
    return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] * 10) / 10 : 0;
  }
  function sendReport(time) {
    var gaps = report.gaps.slice().sort(function (a, b) { return a - b; });
    var costs = report.costs.slice().sort(function (a, b) { return a - b; });
    var ticks = report.ticks.slice().sort(function (a, b) { return a - b; });
    var due = 1000 / tempo.fps;
    var summary = {
      look: current, quality: sharp ? 'sharp' : 'tv', app: tvApp, ultra: Boolean(scene && scene.ultra),
      seconds: Math.round((time - report.since) / 1000), frames: gaps.length, fps: tempo.fps, drops: report.drops,
      late: gaps.filter(function (gap) { return gap > due * 1.5; }).length,
      stalls: gaps.filter(function (gap) { return gap > 150; }).length,
      gap50: percentile(gaps, 0.5), gap95: percentile(gaps, 0.95), gapMax: percentile(gaps, 1),
      cost50: percentile(costs, 0.5), cost95: percentile(costs, 0.95), costMax: percentile(costs, 1),
      where: scene && scene.where ? scene.where() : '', width: width, height: height,
      tick: percentile(ticks, 0.5), keys: window.flowKeys ? window.flowKeys.join(' ') : '', sound: Boolean(sound && sound.on),
    };
    fetch(REPORT_PATH, {method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'report=' + encodeURIComponent(JSON.stringify(summary))}).catch(function () {});
  }
  // Where the words on the screen sit on the canvas, so no device's name goes under them;
  // looked up every two seconds, not each frame.
  var panels = [], panelsFound = -Infinity;
  function panelsAt(time) {
    if (time - panelsFound < 2000) {
      return panels;
    }
    panelsFound = time;
    var box = canvas.getBoundingClientRect(), scale = width / (box.width || 1);
    var words = canvas.closest('main').querySelectorAll('.flow-top, .flow-calendar, .flow-bar');
    panels = Array.prototype.map.call(words, function (word) {
      var at = word.getBoundingClientRect();
      return {left: (at.left - box.left) * scale, right: (at.right - box.left) * scale,
        top: (at.top - box.top) * scale, bottom: (at.bottom - box.top) * scale};
    }).filter(function (panel) { return panel.right > panel.left; });
    return panels;
  }

  // -------------------------------------------------------------- the frame --
  // As many frames as the TV can keep evenly: 60 a second, or a steady 30 when it can't (an
  // even 30 looks smoother than an uneven 40-odd). A frame due within 4 ms is drawn now.
  // The next frame is asked for first, so a frame that throws doesn't stop the screensaver
  // for good (every theme with it, till a reload); its error is logged once.
  var frameFailed = false;
  function frame(time) {
    requestAnimationFrame(frame);
    noteTick(time);
    try {
      var start = performance.now();
      if (drawFrame(time)) {
        noteFrame(time, performance.now() - start);
      }
    } catch (error) {
      if (!frameFailed) {
        frameFailed = true;
        console.error(error);
      }
    }
  }
  function drawFrame(time) {
    if (time - before < 1000 / tempo.fps - 4) {
      return false;
    }
    pacing(time);
    if (scene && scene.ultra && detail === 'auto' && !demoted) {
      watchUltra((time - before) / 1000, tempo.fps === 60);
    }
    var seconds = Math.min(0.1, (time - before) / 1000);
    before = time;
    var zen = document.documentElement.classList.contains('zen') ? 1 : 0;
    calm += (zen - calm) * Math.min(1, seconds * 2.5);
    // Words' strength, and the data's speed (a fifth, in zen).
    var say = 1 - calm, speed = 1 - 0.8 * calm;
    // Every frame starts clean: trails are drawn, not left behind. Fading the frame before
    // never quite reaches nothing, and leaves grey ghosts on the black.
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    // Highway's whole frame is its own: no devices, names or traffic.
    if (highway && scene) {
      text.clearRect(0, 0, width, height);
      scene.frame(time, seconds, calm);
      return true;
    }
    if (glare) {
      clearGlare();
    }
    drawTwinkles(time);
    ctx.globalAlpha = 1;
    // The camera breathes: a little nearer and farther, a little more and less tilted.
    if (!simple) {
      view.zoom = 1 + 0.03 * Math.sin(6.2832 * time / 240000);
      view.tilt = 1 + 0.12 * Math.sin(6.2832 * time / 180000 + 1);
    }
    devices.forEach(function (device) {
      device.arrive = Math.min(1, device.arrive + seconds / 3);
      device.announce = Math.max(0, device.announce - seconds);
    });
    var spots = {};
    devices.forEach(function (device) { spots[device.mac] = place(device, time); });
    if (sharp && !scenic && !simple) {
      drawOrbits();
    }
    streamAll(seconds);
    // The camera, then the ground under everything.
    if (scene && scene.ground) {
      scene.ground(time, seconds);
    }
    lights.begin();
    // The town's data drives its streets.
    if (scene) {
      particles = scene.drive ? scene.drive(particles, speed, seconds) : [];
    }
    if (!scenic) {
      particles = particles.filter(function (particle) { return flyParticle(particle, spots, speed, seconds); });
    }
    drawAsteroids(seconds, calm);
    // The traffic's light, over the asteroids.
    lights.end();
    if (!scenic && !simple) {
      drawComet(ctx, seconds);
      drawProbe(ctx, seconds);
    }
    // The buildings or the trees, over the traffic; the air.
    if (scene) {
      scene.over(time, seconds);
    }
    if (scenic) {
      drawWeather(ctx, time, seconds);
    }
    if (glare) {
      layGlare();
    }
    // The clean layer: the devices, homehub and names.
    text.clearRect(0, 0, width, height);
    drawConstellations(spots, say);
    devices.forEach(function (device) {
      if (spots[device.mac].depth < 0) {
        drawDevice(device, spots[device.mac], seconds);
      }
    });
    drawHubs(seconds);
    devices.forEach(function (device) {
      if (spots[device.mac].depth >= 0) {
        drawDevice(device, spots[device.mac], seconds);
      }
    });
    placeLabels(spots, time);
    devices.forEach(function (device) { drawLabel(device, spots, seconds, say); });
    drawHubNames(say);
    text.globalAlpha = 1;
    ctx.globalAlpha = 1;
    return true;
  }
  function clearGlare() {
    var shine = glare[0].paint;
    shine.setTransform(1, 0, 0, 1, 0, 0);
    shine.globalCompositeOperation = 'source-over';
    shine.clearRect(0, 0, shine.canvas.width, shine.canvas.height);
    shine.setTransform(0.25, 0, 0, 0.25, 0, 0);
    shine.globalCompositeOperation = 'lighter';
    shine.globalAlpha = 1;
  }
  // A few stars breathing slowly behind all else, fewer by day. The forest's ground is
  // behind the canvas, so there the sky's own stars do.
  function drawTwinkles(time) {
    twinkles.forEach(function (star) {
      if (!starry || forest) {
        return;
      }
      ctx.globalAlpha = starry * (1 - overcast) * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(time / 1700 + star.seed * 7)));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, 6.2832);
      ctx.fill();
    });
  }
  // Sharp, in Orbit: the orbits that have devices, faintly.
  function drawOrbits() {
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    orbits.forEach(function (members, index) {
      if (!members.length) {
        return;
      }
      var reach = ORBITS[index] * view.zoom;
      ctx.moveTo(hub.x + across * reach, hub.y);
      ctx.ellipse(hub.x, hub.y, across * reach, deep * view.tilt * reach, 0, 0, 6.2832);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // New particles, by each link's rate.
  function streamAll(seconds) {
    stream(wan.acc, 'down', wan.down, seconds, 'down', net, hub);
    stream(wan.acc, 'up', wan.up, seconds, 'up', hub, net);
    devices.forEach(function (device) {
      device.acc = device.acc || {};
      stream(device.acc, 'down', device.down, seconds, 'down', hub, device);
      stream(device.acc, 'up', device.up, seconds, 'up', device, hub);
    });
  }
  // Along a gentle curve from one end to the other, at the same speed on screen whatever
  // the link's length: a dot sized by its stream, a trail behind it thinning and fading.
  function flyParticle(particle, spots, speed, seconds) {
    var a = particle.from.mac ? spots[particle.from.mac] : particle.from;
    var b = particle.to.mac ? spots[particle.to.mac] : particle.to;
    var length = Math.max(1, Math.abs(b.x - a.x) + Math.abs(b.y - a.y));
    particle.t += SPEED * speed * width * seconds / length;
    if (particle.t >= 1) {
      return false;
    }
    var mx = (a.x + b.x) / 2 - (b.y - a.y) * particle.bend * 0.18;
    var my = (a.y + b.y) / 2 + (b.x - a.x) * particle.bend * 0.18;
    var gap = 10 * dpr * particle.size / length, thick = Math.round(particle.size * 2) / 2;
    for (var step = 0; step < TAIL; step += 1) {
      var nearer = particle.t - step * gap, farther = nearer - gap;
      if (farther < 0) {
        break;
      }
      trailPiece(particle.kind, thick, step, curve(a.x, mx, b.x, nearer), curve(a.y, my, b.y, nearer),
        curve(a.x, mx, b.x, farther), curve(a.y, my, b.y, farther));
    }
    lights.glow(curve(a.x, mx, b.x, particle.t), curve(a.y, my, b.y, particle.t), glows[particle.kind].width * particle.size * GLOW, particle.kind);
    return true;
  }
  // Pi-hole's blocks: asteroids tumbling in from deep space with a faint trail of dust,
  // breaking up against homehub's shield. None come in zen or in the scenes, and those
  // there fade away.
  function drawAsteroids(seconds, calmness) {
    var rocky = 1 - calmness;
    owedSparks += blocks * seconds * (calmness > 0.5 || scenic ? 0 : 1);
    while (owedSparks >= 1) {
      owedSparks -= 1;
      if (sparks.length < MAX_SPARKS) {
        sparks.push({angle: Math.random() * 6.2832, distance: Math.max(width, height) * 0.62,
          rock: Math.floor(Math.random() * rocks.length), size: 0.8 + Math.random() * 0.6,
          turn: Math.random() * 6.2832, spin: (Math.random() - 0.5) * 3, fade: 1, bit: false});
      }
    }
    var broken = [];
    // Rock, not light.
    ctx.globalCompositeOperation = 'source-over';
    sparks = sparks.filter(function (spark) { return moveAsteroid(spark, broken, seconds, rocky); });
    sparks = sparks.concat(broken);
  }
  function moveAsteroid(spark, broken, seconds, rocky) {
    var wall = SHIELD * dpr;
    spark.turn += spark.spin * seconds;
    if (spark.bit) {
      // A fragment, flying off and fading.
      spark.distance += spark.speed * seconds;
      spark.fade -= seconds * 1.1;
      if (spark.fade <= 0) {
        return false;
      }
    } else {
      spark.distance -= width * 0.22 * seconds;
      asteroidDust(spark, rocky);
      // The hit: the shield flashes, the rock breaks up.
      if (spark.distance <= wall) {
        shield.flash = 1;
        shield.angle = spark.angle;
        for (var bit = 0; bit < 4; bit += 1) {
          broken.push({angle: spark.angle + (Math.random() - 0.5) * 1.6, distance: wall,
            rock: Math.floor(Math.random() * rocks.length), size: 0.3 + Math.random() * 0.2,
            turn: Math.random() * 6.2832, spin: (Math.random() - 0.5) * 8, fade: 1, bit: true,
            speed: width * (0.06 + Math.random() * 0.08)});
        }
        return false;
      }
    }
    var sprite = rocks[spark.rock], size = sprite.width * spark.size;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = spark.fade * rocky;
    ctx.translate(hub.x + Math.cos(spark.angle) * spark.distance, hub.y + Math.sin(spark.angle) * spark.distance);
    ctx.rotate(spark.turn);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
    return true;
  }
  function asteroidDust(spark, rocky) {
    for (var step = 0; step < TAIL; step += 1) {
      var nearer = spark.distance + (step + 0.6) * 9 * dpr, farther = nearer + 9 * dpr;
      if (rocky < 0.05) {
        break;
      }
      trailPiece('dust', 1, step, hub.x + Math.cos(spark.angle) * nearer, hub.y + Math.sin(spark.angle) * nearer,
        hub.x + Math.cos(spark.angle) * farther, hub.y + Math.sin(spark.angle) * farther);
    }
  }
  // The bloom: each level halved from the one before, all gathered, then laid on as light
  // (less by day in the scenes).
  function layGlare() {
    for (var g = 1; g < GLARE.length; g += 1) {
      var smaller = glare[g].paint;
      smaller.clearRect(0, 0, smaller.canvas.width, smaller.canvas.height);
      smaller.drawImage(glare[g - 1].board, 0, 0, smaller.canvas.width, smaller.canvas.height);
    }
    var gather = glare[GLARE.length].paint, wide = gather.canvas.width, tall = gather.canvas.height;
    gather.globalCompositeOperation = 'source-over';
    gather.globalAlpha = 1;
    gather.clearRect(0, 0, wide, tall);
    gather.globalCompositeOperation = 'lighter';
    GLARE.forEach(function (strength, index) {
      gather.globalAlpha = strength;
      gather.drawImage(glare[index].board, 0, 0, wide, tall);
    });
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = scenic ? 0.55 + 0.45 * starry : 1;
    ctx.drawImage(gather.canvas, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // Each profile's members joined as stars are, each to its nearest (the shortest links
  // that join them all), faintly; the profile's name at their middle.
  function drawConstellations(spots, say) {
    text.lineWidth = dpr;
    text.textAlign = 'center';
    text.font = '500 ' + 8.5 * dpr + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
    Object.keys(simple || scenic ? {} : groups).forEach(function (id) {
      var members = groups[id];
      if (members.length < 2) {
        return;
      }
      var points = members.map(function (device) { return spots[device.mac]; });
      text.globalAlpha = 0.09;
      text.strokeStyle = palette.text;
      text.beginPath();
      joinNearest(points);
      text.stroke();
      var middle = {x: 0, y: 0};
      points.forEach(function (spot) {
        middle.x += spot.x / points.length;
        middle.y += spot.y / points.length;
      });
      text.globalAlpha = 0.38 * say;
      text.fillStyle = palette.text;
      text.fillText(profiles[id] || '', middle.x, middle.y);
    });
  }
  // Prim's: the nearest waiting star to any joined one, next.
  function joinNearest(points) {
    var joined = [points[0]], waiting = points.slice(1);
    while (waiting.length) {
      var best = Infinity, from = null, pick = 0;
      joined.forEach(function (a) {
        waiting.forEach(function (b, index) {
          var gap = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
          if (gap < best) {
            best = gap;
            from = a;
            pick = index;
          }
        });
      });
      var to = waiting.splice(pick, 1)[0];
      text.moveTo(from.x, from.y);
      text.lineTo(to.x, to.y);
      joined.push(to);
    }
  }
  // homehub and the internet, pulsing with the connection as a device does with its own;
  // the shield, lit where a block just hit it; a record's ring of light.
  function drawHubs(seconds) {
    var flowing = density(wan.down + wan.up);
    hub.phase = (hub.phase || 0) + seconds * 6.2832 * (0.2 + flowing / 30);
    var beat = flowing ? 1 + (0.1 + flowing / 80) * Math.sin(hub.phase) : 1;
    if (!scenic) {
      dot(hub.x, hub.y, (16 + flowing) * beat * dpr, palette.text, 0.06 + 0.03 * beat, text);
    }
    // Sharp, in Orbit: homehub a planet.
    if (!scenic && planet && !simple) {
      var size = planet.width * beat;
      text.globalAlpha = 1;
      text.drawImage(planet, hub.x - size / 2, hub.y - size / 2, size, size);
      glaring().globalAlpha = 0.6;
      glaring().drawImage(planet, hub.x - size / 2, hub.y - size / 2, size, size);
    } else if (!scenic) {
      dot(hub.x, hub.y, 9 * beat * dpr, palette.text, 0.9, text);
      if (sharp) {
        dot(hub.x, hub.y, 12 * beat * dpr, palette.text, 0.5, glaring());
      }
    }
    shield.flash = Math.max(0, shield.flash - seconds * 2);
    if (!scenic) {
      ring(hub.x, hub.y, SHIELD * dpr, palette.text, 0.05 + 0.1 * shield.flash);
    }
    if (shield.flash && !scenic) {
      text.globalAlpha = 0.7 * shield.flash;
      text.strokeStyle = palette.danger;
      text.lineWidth = 2.5 * dpr;
      text.beginPath();
      text.arc(hub.x, hub.y, SHIELD * dpr, shield.angle - 0.5, shield.angle + 0.5);
      text.stroke();
    }
    // The forest has no homehub.
    if (hub.flare && !forest) {
      hub.flare = Math.max(0, hub.flare - seconds / 1.6);
      var spread = 1 - hub.flare;
      ring(hub.x, hub.y, (14 + spread * 180) * dpr, palette.down, 0.8 * hub.flare);
      dot(hub.x, hub.y, (20 + spread * 30) * dpr, palette.text, 0.25 * hub.flare, text);
    }
    if (!scenic) {
      dot(net.x, net.y, (10 + flowing / 2) * beat * dpr, palette.text, 0.05 + 0.03 * beat, text);
      dot(net.x, net.y, 6 * beat * dpr, palette.text, 0.7, text);
    }
  }
  // Which names show: the busiest eight, those already showing first, each only where no
  // other name sits nor the corners' words. In the scenes, where houses stand close, a
  // name whose place is taken tries the other side, then a step above or below (held to its
  // house by a line), and keeps where it was while that's free; homehub's and the
  // internet's names are kept clear too.
  function placeLabels(spots, time) {
    var busiest = devices.filter(function (device) {
      return device.down + device.up > 20000 || device.announce > 0;
    }).sort(function (a, b) {
      return (b.announce > 0) - (a.announce > 0) || ((b.label || 0) > 0) - ((a.label || 0) > 0) ||
        b.down + b.up - a.down - a.up;
    }).slice(0, 8);
    var covered = panelsAt(time), labelled = [], held = !scenic || forest ? [] : [
      {left: hub.x - 80 * dpr, right: hub.x + 80 * dpr, top: hub.y - 26 * dpr, bottom: hub.y + 22 * dpr},
      {left: net.x - 40 * dpr, right: net.x + 40 * dpr, top: net.y - 26 * dpr, bottom: net.y - 6 * dpr}];
    function opening(spot, perch) {
      var x = spot.x + (perch.right ? 10 : -190) * dpr, y = spot.y + perch.lift;
      var box = {left: x, right: x + 180 * dpr, top: y - 14 * dpr, bottom: y + 22 * dpr};
      var taken = held.concat(covered).some(function (other) {
        return box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top;
      });
      return !taken && box;
    }
    busiest.forEach(function (device) {
      var spot = spots[device.mac], right = facesRight(device, spot);
      if (scenic) {
        var step = 34 * dpr, perches = [device.perch || {right: right, lift: 0}, {right: right, lift: 0}, {right: !right, lift: 0}];
        [-1, 1, -2, 2].forEach(function (k) {
          perches.push({right: right, lift: k * step}, {right: !right, lift: k * step});
        });
        for (var i = 0; i < perches.length; i += 1) {
          var box = opening(spot, perches[i]);
          if (box) {
            held.push(box);
            labelled.push({mac: device.mac});
            device.perch = perches[i];
            return;
          }
        }
        return;
      }
      var clash = labelled.some(function (other) {
        return other.right === right && Math.abs(other.y - spot.y) < 30 * dpr && Math.abs(other.x - spot.x) < 160 * dpr;
      }) || !opening(spot, {right: right, lift: 0});
      if (!clash) {
        labelled.push({x: spot.x, y: spot.y, right: right, mac: device.mac});
        device.perch = {right: right, lift: 0};
      }
    });
    named = {};
    labelled.forEach(function (label) { named[label.mac] = true; });
  }
  var named = {};
  // A name, fading in or out (FADE a second): the name, kept on the screen, and beneath it
  // its throughput, down then up, each in its stream's colour; or, just joined or left,
  // that. Each figure has a slot as wide as its widest reading, so a label keeps its size
  // whatever the rates, and nothing in it moves: a figure that changes just changes.
  function drawLabel(device, spots, seconds, say) {
    var target = named[device.mac] ? 1 : 0, step = FADE * seconds;
    device.label = Math.max(0, Math.min(1, (device.label || 0) + (target ? step : -step)));
    if (!device.label) {
      return;
    }
    var perch = device.perch || {right: facesRight(device, spots[device.mac]), lift: 0}, right = perch.right;
    var house = spots[device.mac], spot = {x: house.x, y: house.y + perch.lift};
    var x = spot.x + (right ? 15 : -15) * dpr, under = 12 * dpr;
    // Moved off its house: a line back to it.
    if (perch.lift) {
      text.globalAlpha = 0.5 * device.label * say;
      text.strokeStyle = palette.text;
      text.lineWidth = dpr;
      text.beginPath();
      text.moveTo(house.x, house.y);
      text.lineTo(x - (right ? 4 : -4) * dpr, spot.y + (perch.lift > 0 ? -12 : 19) * dpr);
      text.stroke();
    }
    var nameFont = '600 ' + 10 * dpr + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
    var rateFont = '500 ' + 8.5 * dpr + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
    text.font = nameFont;
    var nameWidth = text.measureText(device.name).width;
    var nameLeft = right ? Math.min(x, width - nameWidth - 8 * dpr) : Math.max(x, nameWidth + 8 * dpr) - nameWidth;
    text.font = rateFont;
    var said = device.announce > 0 && ({left: 'left the network', joined: 'joined the network'}[device.event] || device.event);
    var downWidth = text.measureText('↓ 88.8 Mb/s').width + 2 * dpr, upWidth = text.measureText(' ↑ 88.8 Mb/s').width;
    var whole = Math.max(said ? text.measureText(said).width : 0, downWidth + upWidth);
    var start = right ? Math.min(x, width - whole - 8 * dpr) : Math.max(8 * dpr, x - whole);
    // On a dark, see-through backing, over whatever passes behind.
    var left = Math.min(nameLeft, start) - 4 * dpr, wide = Math.max(nameLeft + nameWidth, start + whole) + 4 * dpr - left;
    text.globalAlpha = VEIL * device.label * say;
    text.fillStyle = '#0b0d12';
    roundBox(text, left, spot.y - 9 * dpr, wide, under + 12 * dpr, 2 * dpr);
    text.globalAlpha = 0.9 * device.label * say;
    text.fillStyle = palette.text;
    text.font = nameFont;
    text.textAlign = 'left';
    text.fillText(device.name, nameLeft, spot.y + 1 * dpr);
    text.font = rateFont;
    if (said) {
      text.fillStyle = palette.muted;
      text.fillText(said, start, spot.y + under);
      return;
    }
    // Each arrow at its slot's start, each figure flush with its slot's end, so the units
    // hold still too.
    [['↓ ', brief(device.down), palette.down, start, start + downWidth - 2 * dpr],
      [' ↑ ', brief(device.up), palette.up, start + downWidth, start + downWidth + upWidth]].forEach(function (figure) {
      if (!figure[1]) {
        return;
      }
      text.globalAlpha = 0.9 * device.label * say;
      text.fillStyle = figure[2];
      text.textAlign = 'left';
      text.fillText(figure[0], figure[3], spot.y + under);
      text.textAlign = 'right';
      text.fillText(figure[1], figure[4], spot.y + under);
    });
    text.textAlign = 'left';
  }
  // homehub's and the internet's names, on the devices' backing; homehub's with the VPN
  // under it. The forest names only the devices.
  function drawHubNames(say) {
    text.textAlign = 'center';
    text.font = '600 ' + 11 * dpr + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
    [['homehub', hub.x, hub.y + (scenic ? -12 : 30) * dpr, 0.9],
      ['internet', net.x + (scenic ? 0 : 46) * dpr, net.y + (scenic ? -12 : 4) * dpr, 0.6]].forEach(function (name) {
      if (forest) {
        return;
      }
      var extra = name[0] === 'homehub' && vpnLine(), small = '500 ' + 8.5 * dpr + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
      var wide = text.measureText(name[0]).width + 12 * dpr;
      if (extra) {
        text.font = small;
        wide = Math.max(wide, text.measureText(extra[0]).width + 12 * dpr);
      }
      var tall = (extra ? 26 : 14) * dpr;
      text.globalAlpha = VEIL * say;
      text.fillStyle = '#0b0d12';
      roundBox(text, name[1] - wide / 2, name[2] - 10 * dpr, wide, tall, 2 * dpr);
      text.globalAlpha = (scenic ? 0.9 : name[3]) * say;
      if (extra) {
        text.fillStyle = extra[1];
        text.fillText(extra[0], name[1], name[2] + 12 * dpr);
        text.font = '600 ' + 11 * dpr + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
      }
      text.fillStyle = palette.text;
      text.fillText(name[0], name[1], name[2]);
    });
  }

  // ------------------------------------------------------------- the sound --
  // Highway's sound (flow-sound.js), if chosen (the curfew_sound cookie, as the page says:
  // data-sound): started by the first click or key where a browser holds it back.
  var SOUND_LEVELS = ['off', 'background', 'full'];
  var SOUND_NAMES = {off: 'No sound', background: 'Background sound', full: 'Full sound'};
  var sound = window.flowSound ? window.flowSound(canvas.dataset.sound) : null;
  if (sound) {
    ['pointerdown', 'keydown'].forEach(function (kind) {
      document.addEventListener(kind, function () { sound.wake(); });
    });
    window.addEventListener('pagehide', function () { sound.hush(); });
    // The TV's app, as it goes to the background.
    window.flowHush = function () { sound.hush(); };
    // A stage louder or quieter (up and down on the remote; Controls' Sound goes round them):
    // kept as Settings keeps it; said where the theme's name shows.
    window.flowSoundStep = function (way) {
      sound.set(SOUND_LEVELS[Math.max(0, Math.min(SOUND_LEVELS.length - 1, SOUND_LEVELS.indexOf(sound.level) + way))]);
      flowKeep('curfew_sound', sound.level);
      var name = canvas.closest('main').querySelector('.flow-look');
      if (name) {
        name.textContent = SOUND_NAMES[sound.level];
        replay(name);
      }
    };
  }

  // ------------------------------------------------- Highway's minimum speed --
  // In km/h, 0 for none: the car goes no slower, however quiet the house. Set with left and
  // right on the remote, or at a computer in Controls, MIN_STEP at a time; kept on this
  // device (flow-min-speed); on the TV said where the theme's name shows; marked on the dial.
  var MIN_STEP = 10, MIN_MOST = 240, MIN_KEY = 'flow-min-speed', minSpeed = 0;
  try {
    minSpeed = Math.max(0, Math.min(MIN_MOST, Number(localStorage.getItem(MIN_KEY)) || 0));
  } catch (error) {
    // None.
  }
  window.flowMinSpeed = function (steps) {
    minSpeed = Math.max(0, Math.min(MIN_MOST, minSpeed + steps * MIN_STEP));
    try {
      localStorage.setItem(MIN_KEY, String(minSpeed));
    } catch (error) {
      // This visit only.
    }
    var name = canvas.closest('main').querySelector('.flow-look');
    // At a computer the Controls say it, over where this shows.
    if (name && tvApp) {
      name.textContent = minSpeed ? 'Minimum ' + minSpeed + ' km/h' : 'No minimum speed';
      replay(name);
    }
  };

  // ------------------------------------------------------------ the scenes --
  // What the scenes are given: the helpers and constants as they are, and the live state
  // through getters (setters for the few a scene sets: its camera's unit and origin,
  // homehub's and the internet's places). Each scene is made at the start, as any may be
  // switched to, and chosen again when the theme changes, with its hills (lift).
  var flow = {
    GLOW: GLOW, ICE: ICE, MILD: MILD, TAIL: TAIL, aim: aim, airShade: airShade, atmosphere: atmosphere,
    bump: bump, busySeen: busySeen, cam: cam, channels: channels, ctx: ctx, density: density,
    devices: devices, dot: dot, glaring: glaring, hash: hash, iso: iso, lit3: lit3, palette: palette,
    project: project, rgb: rgb, rounded: rounded, shadowWay: shadowWay, sharp: sharp, sky: sky,
    skyCanvas: skyCanvas, smoothstep: smoothstep, sound: sound, trailPiece: trailPiece, wan: wan, whiten: whiten,
  };
  Object.defineProperties(flow, {
    dpr: {get: function () { return dpr; }},
    frozen: {get: function () { return frozen; }},
    glows: {get: function () { return glows; }},
    height: {get: function () { return height; }},
    hub: {get: function () { return hub; }, set: function (value) { hub = value; }},
    internetDown: {get: function () { return internetDown; }},
    line: {get: function () { return line; }},
    lights: {get: function () { return lights; }},
    minSpeed: {get: function () { return minSpeed; }},
    moonlit: {get: function () { return moonlit; }},
    net: {get: function () { return net; }, set: function (value) { net = value; }},
    origin: {get: function () { return origin; }, set: function (value) { origin = value; }},
    overcast: {get: function () { return overcast; }},
    polled: {get: function () { return polled; }},
    precip: {get: function () { return precip; }},
    skyLow: {get: function () { return skyLow; }},
    snowCover: {get: function () { return snowCover; }},
    starry: {get: function () { return starry; }},
    sun: {get: function () { return sun; }},
    sunlight: {get: function () { return sunlight; }},
    temp: {get: function () { return temp; }},
    town: {get: function () { return town; }},
    ultra: {get: ultra},
    unit: {get: function () { return unit; }, set: function (value) { unit = value; }},
    weather: {get: function () { return weather; }},
    width: {get: function () { return width; }},
    windX: {get: function () { return windX; }},
  });
  var scenes = {}, scene = null, current = look;
  SCENIC.forEach(function (each) {
    if (flowScenes[each]) {
      scenes[each] = flowScenes[each](flow);
    }
  });
  function choose() {
    scene = scenes[current] || null;
    lift = scene && scene.lift;
  }
  choose();
  startTempo(before);
  function changed() {
    if (scene && scene.changed) {
      scene.changed();
    }
  }
  fit();
  sky();
  setInterval(sky, SKY_EVERY * 1000);
  window.addEventListener('resize', fit);
  poll();
  // A second reading soon, for the first rates, and the steady ones from it: over a second
  // on, because homehub keeps the devices' counters a second, and one read sooner comes
  // back the same, stamped later, so every device's first rate would be 0.
  setTimeout(function () {
    poll();
    setInterval(poll, POLL * 1000);
  }, 1500);
  pollShield();
  setInterval(pollShield, 30000);
  pollVpn();
  setInterval(pollVpn, 60000);
  requestAnimationFrame(frame);
  var clock = document.querySelector('.flow-clock time');
  setInterval(function () {
    var now = new Date();
    clock.textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  }, 10000);

  // ---------------------------------------------------------- the controls --
  // At a computer or a tablet (not the TV's app): the desk's sizes (flow-desk), and the
  // remote's buttons on the screen. A small button at the top bar's right (⋯, Controls) slides
  // Theme, Zen, Detail (sharp's), Sound, Highway's minimum speed and biome, and Back out
  // along the bar, or under it where it's narrow, and in again after CONTROLS
  // seconds untouched (not while the pointer's on them), a second press, or a press
  // elsewhere. No keys (app.js), no hint, and a click or tap on the scene does nothing. In
  // zen the button fades out while nothing moves.
  function deskControls(hint) {
    var CONTROLS = 6;
    var root = document.documentElement;
    root.classList.add('flow-desk');
    if (hint) {
      hint.remove();
    }
    var menu = document.createElement('div'), items = document.createElement('div');
    var toggle = document.createElement('button'), hideAt = 0, stillAt = 0, held = false;
    menu.className = 'flow-menu';
    items.className = 'flow-menu-items';
    var press = function (button, act) {
      button.type = 'button';
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        button.blur();
        hideAt = Date.now() + CONTROLS * 1000;
        act();
      });
    };
    var detailButton = null, soundButton = null;
    var showDetail = function () {
      detailButton.textContent = 'Detail ' + detail.charAt(0).toUpperCase() + detail.slice(1);
    };
    // Auto, High, Ultra, and round again: a fresh Auto is tried again.
    var nextDetail = function () {
      detail = DETAILS[(DETAILS.indexOf(detail) + 1) % DETAILS.length];
      demoted = false;
      watched.settle = 0;
      try {
        localStorage.setItem('flow-detail', detail);
        sessionStorage.removeItem('flow-ultra-off');
      } catch (error) {
        // This visit only.
      }
      showDetail();
    };
    var heard = function () {
      soundButton.textContent = SOUND_NAMES[sound.level];
    };
    var nextSound = function () {
      window.flowSoundStep(sound.level === 'full' ? -SOUND_LEVELS.length : 1);
      heard();
    };
    var minText = null;
    var showMin = function () {
      minText.textContent = 'Min ' + (minSpeed || 'none');
    };
    // Down, what it's of, up: only while Highway's on (app.css).
    var stepper = function (label, names, act) {
      var box = document.createElement('div');
      box.className = 'flow-menu-steps';
      box.appendChild(label);
      [-1, 1].forEach(function (way, n) {
        var button = document.createElement('button');
        button.textContent = names[n][0];
        button.setAttribute('aria-label', names[n][1]);
        button.tabIndex = -1;
        press(button, function () { act(way); });
        box.insertBefore(button, n ? null : label);
      });
      return box;
    };
    var minSteps = function () {
      minText = document.createElement('span');
      showMin();
      return stepper(minText, [['−', 'Lower the minimum speed'], ['+', 'Raise the minimum speed']], function (way) {
        window.flowMinSpeed(way);
        showMin();
      });
    };
    var biomeSteps = function () {
      var label = document.createElement('span');
      label.textContent = 'Biome';
      return stepper(label, [['‹', 'Previous biome'], ['›', 'Next biome']], window.flowBiome);
    };
    [['Theme', tvNextLook], ['Zen', tvZen], sharp ? ['Detail', nextDetail] : null, sound ? ['Sound', nextSound] : null, ['Min', null], ['Biome', null], ['Back', tvBack]].forEach(function (one) {
      if (!one) {
        return;
      }
      if (!one[1]) {
        items.appendChild(one[0] === 'Min' ? minSteps() : biomeSteps());
        return;
      }
      var button = document.createElement('button');
      button.textContent = one[0];
      button.tabIndex = -1;
      press(button, one[1]);
      items.appendChild(button);
      if (one[0] === 'Detail') {
        detailButton = button;
        showDetail();
      }
      if (one[0] === 'Sound') {
        soundButton = button;
        heard();
      }
    });
    var open = function (on) {
      root.classList.toggle('flow-menu-open', on);
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      items.querySelectorAll('button').forEach(function (button) { button.tabIndex = on ? 0 : -1; });
    };
    toggle.className = 'flow-menu-toggle';
    toggle.textContent = '⋯';
    toggle.title = 'Controls';
    toggle.setAttribute('aria-label', 'Controls');
    press(toggle, function () { open(!root.classList.contains('flow-menu-open')); });
    open(false);
    menu.appendChild(items);
    menu.appendChild(toggle);
    menu.addEventListener('pointerenter', function () { held = true; });
    menu.addEventListener('pointerleave', function () {
      held = false;
      hideAt = Date.now() + CONTROLS * 1000;
    });
    canvas.closest('main').appendChild(menu);
    levelWithBar(menu);
    var stir = function () {
      stillAt = Date.now() + CONTROLS * 1000;
      root.classList.remove('flow-still');
    };
    stir();
    setInterval(function () {
      if (!held && Date.now() > hideAt) {
        open(false);
      }
      if (!held && Date.now() > stillAt) {
        root.classList.add('flow-still');
      }
    }, 500);
    // A press, not a click: an iPhone gives the page no click for a tap on the scene.
    document.addEventListener('pointerdown', function (event) {
      stir();
      if (!menu.contains(event.target)) {
        open(false);
      }
    });
    document.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'mouse') {
        stir();
      }
    });
  }
  // As tall as the top bar, whatever it holds, so the buttons sit in its middle, and as far in
  // from its right end as they are from its top and foot (--flow-edge).
  function levelWithBar(menu) {
    var bar = document.querySelector('.flow-top');
    var level = function () {
      var mine = menu.getBoundingClientRect().height, local = parseFloat(getComputedStyle(menu).height);
      if (bar && mine) {
        menu.style.height = (local * bar.getBoundingClientRect().height / mine).toFixed(2) + 'px';
        var inner = bar.getBoundingClientRect().height - parseFloat(getComputedStyle(menu).paddingTop);
        menu.style.setProperty('--flow-edge', ((inner - menu.querySelector('.flow-menu-toggle').offsetHeight) / 2).toFixed(2) + 'px');
      }
    };
    level();
    window.addEventListener('resize', level);
    if (bar && window.ResizeObserver) {
      new ResizeObserver(level).observe(bar);
    }
  }

  // --------------------------------------------------- the facts, the refresh --
  // A fact at the foot, a new one every FACT seconds: out, change, back in.
  var FACT = 15, fact = null, facts = [], factAt = 0;
  function showFacts() {
    fact = document.querySelector('.flow-fact');
    facts = JSON.parse(fact.dataset.facts || '[]');
    factAt = Math.floor(Math.random() * facts.length);
    nextFact();
    setInterval(nextFact, FACT * 1000);
  }
  function nextFact() {
    if (!facts.length) {
      return;
    }
    fact.classList.remove('shown');
    setTimeout(function () {
      fact.textContent = facts[factAt++ % facts.length];
      fact.classList.add('shown');
    }, 900);
  }
  // Every REFRESH minutes the page as it is now, fetched quietly (no reload: the scene
  // carries on): the weather, the calendar and the facts swapped in, the sky's hours and
  // today's record taken. Only a change in the devices (one new, renamed, moved to another
  // profile) or a new curfew reloads it, as that changes the scene itself.
  var REFRESH = 15;
  function refreshQuietly() {
    setInterval(function () {
      if (document.hidden) {
        return;
      }
      fetch(location.href, {cache: 'no-store', credentials: 'same-origin'})
        .then(function (response) { return response.ok ? response.text() : null; })
        .then(takePage)
        .catch(function () {});
    }, REFRESH * 60000);
  }
  function roster(list) {
    return JSON.stringify(JSON.parse(list || '[]').map(function (d) { return [d.mac, d.name, d.kind, d.profile]; }));
  }
  // A new curfew's script and style come with a new version in their URLs.
  function build(doc) {
    return Array.prototype.map.call(doc.querySelectorAll('script[src], link[rel=stylesheet]'), function (tag) {
      return tag.getAttribute('src') || tag.getAttribute('href');
    }).join(' ');
  }
  var staleDevices = false;
  function takePage(page) {
    var fresh = page && new DOMParser().parseFromString(page, 'text/html'), next = fresh && fresh.getElementById('flow');
    if (!next) {
      return;
    }
    if (roster(next.dataset.devices) !== roster(canvas.dataset.devices) || next.dataset.profiles !== canvas.dataset.profiles) {
      staleDevices = true;
    }
    // Highway shows no device: those wait till another theme's on.
    if (build(fresh) !== build(document) || (staleDevices && !highway)) {
      location.reload();
      return;
    }
    // Today's use (a house's height, a dot's size) and what the line carries, as now.
    JSON.parse(next.dataset.devices || '[]').forEach(function (d) {
      if (byMac[d.mac] && byMac[d.mac].today !== d.today) {
        byMac[d.mac].today = d.today;
        changed();
      }
    });
    canvas.dataset.devices = next.dataset.devices;
    line = (next.dataset.line || '').split(' ').map(Number);
    swapCorners(fresh);
    var nextFacts = fresh.querySelector('.flow-fact');
    if (nextFacts) {
      fact.dataset.facts = nextFacts.dataset.facts;
      facts = JSON.parse(fact.dataset.facts || '[]');
    }
    // A new day: a new record.
    if (next.dataset.day !== canvas.dataset.day) {
      peakKey = 'flow-peak-' + next.dataset.day;
      peak = 0;
      canvas.dataset.day = next.dataset.day;
    }
    peak = Math.max(peak, Number(next.dataset.peak) || 0);
    sun = (next.dataset.sun || '6 7 18 19').split(' ').map(Number);
    canvas.dataset.sun = next.dataset.sun;
    if (next.dataset.weather !== canvas.dataset.weather) {
      canvas.dataset.weather = next.dataset.weather;
      takeWeather(JSON.parse(next.dataset.weather || '{}'));
      changed();
    }
    sky();
  }
  function swapCorners(fresh) {
    var main = canvas.closest('main'), top = main.querySelector('.flow-top');
    ['.flow-weather', '.flow-calendar'].forEach(function (part) {
      var old = main.querySelector(part), now = fresh.querySelector(part);
      if (old && now) {
        old.replaceWith(now);
      } else if (old) {
        old.remove();
      } else if (now && part === '.flow-weather') {
        top.insertBefore(now, top.firstChild);
      } else if (now) {
        top.after(now);
      }
    });
    var horizon = main.querySelector('.flow-horizon'), nextHorizon = fresh.querySelector('.flow-horizon');
    if (horizon && nextHorizon) {
      horizon.className = nextHorizon.className;
    }
  }
  // Started last, once every part's variables are set.
  if (!tvApp) {
    deskControls(document.querySelector('.flow-hint'));
  }
  showFacts();
  refreshQuietly();
}

var flowCanvas = document.getElementById('flow');
if (flowCanvas) {
  flowView(flowCanvas);
}
