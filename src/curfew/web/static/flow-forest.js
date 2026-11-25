// curfew's screensaver: Forest. A wood on rolling ground, seen at the town's angle, a tree
// for each device: its trunk and branches grow with its traffic over the last half-minute
// or so, its leaves come out with what it does now, and it shrinks back to a sapling as
// it quietens. Leaves are green while it's busy, browning as it quietens, red while it's
// cut off. homehub is the great tree alone in the meadow, growing with the whole house.
// The camera holds still, so the ground is painted with the sky, behind the canvas, and a
// frame draws only what moves. Made by flowView (flow.js) with what the scenes share (flow).
var flowScenes = window.flowScenes || (window.flowScenes = {});

flowScenes.forest = function (flow) {
  var GLOW = flow.GLOW, ICE = flow.ICE, MILD = flow.MILD, aim = flow.aim, airShade = flow.airShade,
    atmosphere = flow.atmosphere, bump = flow.bump, cam = flow.cam, channels = flow.channels, ctx = flow.ctx,
    devices = flow.devices, glaring = flow.glaring, hash = flow.hash, iso = flow.iso, lit3 = flow.lit3,
    rgb = flow.rgb, rounded = flow.rounded, shadowWay = flow.shadowWay, sharp = flow.sharp, sky = flow.sky,
    skyCanvas = flow.skyCanvas, smoothstep = flow.smoothstep, wan = flow.wan, whiten = flow.whiten;
  var WOOD = {u0: 0, v0: 0, u1: 22, v1: 16, step: 0.5, turn: 0.22, base: 0.7};
  var WOOD_MIDDLE = {u: 11, v: 7.5};
  // The meadow, where homehub's tree stands alone.
  var GLADE = {u: 13.5, v: 8, r: 2.1};
  var BROOK = [{u: 4.5, v: -1}, {u: 8.5, v: 3.5}, {u: 7, v: 8.5}, {u: 10.5, v: 12.5}, {u: 9, v: 17}];
  var LEAF = {green: [88, 158, 82], brown: [156, 108, 60], red: [198, 74, 60]};
  // How many times a trunk forks out to its twigs; sharp, once more and finer.
  var FORKS = sharp ? 5 : 4;
  // A leaf its tree no longer needs browns over WITHER seconds, then falls. SHED of the
  // falling leaves are drawn coming down; the rest just go. A fallen leaf lies LITTER
  // seconds, fading over its last LEAF_FADE. One that comes down off the land keeps
  // falling past the edge, fading over ASTRAY pixels; one on the brook floats down it at
  // DRIFT units a second and off the edge.
  var WITHER = 20, SHED = 0.4, LITTER = 20, LEAF_FADE = 4, MAX_LITTER = sharp ? 300 : 120, ASTRAY = 60, DRIFT = 0.4;
  var litter = [], landEdge = [];
  var brookLine = rounded(BROOK, 2.5), trees = [], fireflies = [], woodLight = 1;
  // homehub's tree is ELDER times a device's size, whole at ELDER_BITS of the house's traffic.
  var ELDER = 1.7, ELDER_BITS = 50e6;
  var elder = {mac: 'homehub', online: true, allowed: true, down: 0, up: 0, ripples: [], grow: 0, bloom: 0};
  // One duck at a time, DUCK_GAP seconds (at random within) after the last left; ducklings
  // follow DUCK_BROOD of the time.
  var DUCK_GAP = [40, 120], DUCK_BROOD = 0.4;
  var OWLS = 3;
  var DUCK = {
    adult: {body: [128, 104, 80], head: [44, 112, 72], beak: [222, 150, 52]},
    young: {body: [206, 178, 96], head: [222, 196, 104], beak: [208, 140, 64]},
  };
  var duck = null, duckDue = 15 + Math.random() * 30;
  // The brook's line inside the land, each point with how far along it is.
  var brookRun = (function () {
    var run = [], d = 0;
    brookLine.forEach(function (point) {
      if (point.u < WOOD.u0 + 0.5 || point.u > WOOD.u1 - 0.5 || point.v < WOOD.v0 + 0.5 || point.v > WOOD.v1 - 0.5) {
        return;
      }
      if (run.length) {
        d += Math.hypot(point.u - run[run.length - 1].u, point.v - run[run.length - 1].v);
      }
      run.push({u: point.u, v: point.v, d: d});
    });
    return run;
  })();
  function brookLength() {
    return brookRun[brookRun.length - 1].d;
  }
  // The place d along the brook, and which way it runs there.
  function alongBrook(d) {
    for (var i = 1; i < brookRun.length; i += 1) {
      var a = brookRun[i - 1], b = brookRun[i];
      if (d <= b.d || i === brookRun.length - 1) {
        var f = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1))), long = (b.d - a.d) || 1;
        return {u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f, du: (b.u - a.u) / long, dv: (b.v - a.v) / long};
      }
    }
    return brookRun[0];
  }
  function fromBrook(u, v) {
    var best = Infinity;
    for (var i = 1; i < brookLine.length; i += 1) {
      var a = brookLine[i - 1], b = brookLine[i], du = b.u - a.u, dv = b.v - a.v;
      var f = Math.max(0, Math.min(1, ((u - a.u) * du + (v - a.v) * dv) / (du * du + dv * dv || 1)));
      best = Math.min(best, Math.hypot(u - a.u - du * f, v - a.v - dv * f));
    }
    return best;
  }
  // The ground's height: hills rising toward the back, a valley down to the brook, the
  // meadow level.
  function rise(u, v) {
    var h = 0.34 * Math.sin(u * 0.42 + 1.1) * Math.sin(v * 0.47 + 0.3) +
      0.24 * Math.sin(u * 0.21 - v * 0.33 + 2.2) + 0.1 * Math.sin(u * 1.1 + v * 0.7) +
      0.32 + 0.3 * (1 - v / WOOD.v1);
    h = -0.14 + (h + 0.14) * smoothstep((fromBrook(u, v) - 0.6) / 2);
    var r = Math.hypot(u - GLADE.u, v - GLADE.v);
    return 0.42 + (h - 0.42) * smoothstep((r - 1.3) / 1.6);
  }
  // How lively a device is (0 to 1), by orders of magnitude: 1 kb/s a fifth, 100 kb/s
  // nearly three quarters, 1 Mb/s all.
  function vigour(bits) {
    return Math.max(0, Math.min(1, Math.log10(1 + bits / 200) / 3.7));
  }
  // Toward the viewer: things are drawn farthest first.
  function depthAt(u, v) {
    var cos = Math.cos(WOOD.turn), sin = Math.sin(WOOD.turn);
    return (cos + sin) * u + (cos - sin) * v;
  }
  // A tree's shape, fixed by its MAC, in its own terms (its full height 1, up +y): a trunk
  // forking `forks` times, two ways or three, each branch shorter than the last; leaves
  // along the branches, each with the share of the tree's vigour at which it comes out
  // (when) and how far along its branch it sits (at).
  function sprout(mac, forks) {
    var branches = [], leaves = [], n = 0;
    function chance() {
      n += 1;
      return hash(mac + 'branch' + n);
    }
    (function fork(x, y, angle, length, depth) {
      var x1 = x + Math.sin(angle) * length, y1 = y + Math.cos(angle) * length;
      var branch = {x0: x, y0: y, x1: x1, y1: y1, depth: depth};
      branches.push(branch);
      // Every branch but the trunk carries leaves; a twig, one.
      if (depth) {
        for (var leaf = 0; leaf < (depth === forks ? 1 : 2); leaf += 1) {
          var side = leaf ? 1 : -1;
          leaves.push({branch: branch, at: 0.45 + 0.55 * chance(), angle: angle + side * (0.6 + 0.5 * chance()), when: chance()});
        }
      }
      if (depth === forks) {
        return;
      }
      var count = chance() < 0.3 ? 3 : 2, spread = 0.45 + 0.3 * chance();
      for (var i = 0; i < count; i += 1) {
        fork(x1, y1, angle + spread * (i - (count - 1) / 2) + (chance() - 0.5) * 0.35, length * (0.66 + 0.14 * chance()), depth + 1);
      }
    })(0, 0, (chance() - 0.5) * 0.12, 0.32, 0);
    return {branches: branches, leaves: leaves};
  }
  // Each device's tree somewhere its MAC picks, clear of the brook, the meadow and the
  // edges, never crowding another; then homehub's; then the owls and the fireflies.
  (function plant() {
    devices.slice().sort(function (a, b) { return hash(a.mac + 'tree') - hash(b.mac + 'tree'); })
      .forEach(plantTree);
    var crown = sprout('homehub', FORKS + 1);
    trees.push({u: GLADE.u, v: GLADE.v, h: rise(GLADE.u, GLADE.v), device: elder, seed: 1.7,
      branches: crown.branches, leaves: crown.leaves, forks: FORKS + 1, great: ELDER});
    trees.sort(function (a, b) { return depthAt(a.u, a.v) - depthAt(b.u, b.v); });
    perchOwls();
    for (var i = 0; i < 48; i += 1) {
      fireflies.push({u: WOOD.u0 + 1 + Math.random() * (WOOD.u1 - WOOD.u0 - 2),
        v: WOOD.v0 + 1 + Math.random() * (WOOD.v1 - WOOD.v0 - 2), phase: Math.random() * 6.3,
        speed: 0.2 + Math.random() * 0.3});
    }
  })();
  function plantTree(device) {
    for (var k = 0; k < 80; k += 1) {
      var u = WOOD.u0 + 0.8 + hash(device.mac + 'u' + k) * (WOOD.u1 - WOOD.u0 - 1.6);
      var v = WOOD.v0 + 0.8 + hash(device.mac + 'v' + k) * (WOOD.v1 - WOOD.v0 - 1.6);
      if (fromBrook(u, v) < 1.2 || Math.hypot(u - GLADE.u, v - GLADE.v) < GLADE.r) {
        continue;
      }
      var crowded = trees.some(function (tree) { return Math.hypot(tree.u - u, tree.v - v) < 1; });
      if (crowded) {
        continue;
      }
      var shape = sprout(device.mac, FORKS);
      trees.push({u: u, v: v, h: rise(u, v), device: device, seed: hash(device.mac + 'sway') * 6.3, wet: fromBrook(u, v) < 3,
        branches: shape.branches, leaves: shape.leaves, forks: FORKS, great: 1});
      return;
    }
  }
  // One tree in four has an owl (at most OWLS), on its widest-spreading first branch.
  function perchOwls() {
    trees.slice().sort(function (a, b) { return hash(a.device.mac + 'owl') - hash(b.device.mac + 'owl'); })
      .slice(0, Math.min(OWLS, Math.ceil(trees.length / 4))).forEach(function (tree) {
        var perch = tree.branches.filter(function (branch) { return branch.depth === 1; })
          .sort(function (a, b) { return Math.abs(b.x1 - b.x0) - Math.abs(a.x1 - a.x0); })[0];
        tree.owl = {branch: perch, turn: 0, aim: 0, next: 4 * Math.random(), blink: 3 * Math.random(), shut: 0};
      });
  }
  // The wood's reach on the screen at a unit of 1: its land, and room for its trees.
  function woodBox() {
    var keep = flow.origin, reach = {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity};
    flow.origin = {x: 0, y: 0};
    flow.unit = 1;
    aim(WOOD.turn, 1, WOOD_MIDDLE);
    var points = [iso(WOOD.u0, WOOD.v0, 6), iso(WOOD.u1, WOOD.v0, 6), iso(WOOD.u1, WOOD.v1, -WOOD.base),
      iso(WOOD.u0, WOOD.v1, -WOOD.base), iso(WOOD.u1, WOOD.v0, -WOOD.base), iso(WOOD.u0, WOOD.v1, 1.2)];
    points.forEach(function (point) {
      reach.left = Math.min(reach.left, point.x);
      reach.right = Math.max(reach.right, point.x);
      reach.top = Math.min(reach.top, point.y);
      reach.bottom = Math.max(reach.bottom, point.y);
    });
    flow.origin = keep;
    return reach;
  }
  // Stroked as well as filled, so no seams show between facets.
  function facet(paint, points, fill) {
    paint.fillStyle = paint.strokeStyle = fill;
    paint.beginPath();
    points.forEach(function (point, index) {
      var at = iso(point.u, point.v, point.z);
      paint[index ? 'lineTo' : 'moveTo'](at.x, at.y);
    });
    paint.closePath();
    paint.fill();
    paint.stroke();
  }
  function tracePath(paint, points) {
    paint.beginPath();
    points.forEach(function (at, index) { paint[index ? 'lineTo' : 'moveTo'](at.x, at.y); });
    paint.closePath();
  }

  // ------------------------------------------------------------- the ground --
  // Painted with the sky, behind the canvas: a low-poly patchwork lit by each facet's
  // slope, farthest first; the brook in its valley; the land's edge, earth, beneath;
  // dimmer by night.
  function paintWood(paint) {
    paint.save();
    paint.lineWidth = 0.6 * flow.dpr;
    paint.lineJoin = 'round';
    paint.globalAlpha = 1;
    var L = woodLight;
    var low = [58, 100, 56], high = [132, 152, 86], water = [70, 122, 150];
    // The sky in the water.
    if (sharp) {
      water = water.map(function (c, i) { return c + (flow.skyLow[i] - c) * 0.3; });
    }
    brookClip = new Path2D();
    groundFacets().forEach(function (f) {
      var mid = {u: (f[0].u + f[1].u + f[2].u) / 3, v: (f[0].v + f[1].v + f[2].v) / 3};
      var z = (f[0].z + f[1].z + f[2].z) / 3, light = lit3(f[0], f[1], f[2]);
      var wet = fromBrook(mid.u, mid.v) < 0.7;
      var shade = wet ? (flow.frozen ? ICE : water) : low.map(function (c, i) {
        return c + (high[i] - c) * Math.max(0, Math.min(1, (z + 0.1) / 1.1));
      });
      // Snow comes patch by patch as it deepens.
      if (!wet && flow.snowCover) {
        shade = whiten(shade, smoothstep((flow.snowCover - 0.5 * hash(mid.u.toFixed(2) + ' ' + mid.v.toFixed(2))) / 0.5));
      }
      facet(paint, f, rgb(shade, light * L));
      if (wet) {
        f.forEach(function (point, index) {
          var at = iso(point.u, point.v, point.z);
          brookClip[index ? 'lineTo' : 'moveTo'](at.x, at.y);
        });
        brookClip.closePath();
      }
    });
    if (sharp) {
      drawRocks(paint, L);
    }
    paintEdges(paint, L);
    // The air over the land's top.
    if (sharp) {
      tracePath(paint, woodEdge());
      paint.clip();
      var air = woodAir();
      paint.globalCompositeOperation = 'source-over';
      paint.fillStyle = airShade(paint, air[0], air[1]);
      paint.fillRect(0, 0, paint.canvas.width, paint.canvas.height);
    }
    paint.restore();
  }
  // The ground's triangles, farthest first.
  function groundFacets() {
    var facets = [], s = WOOD.step;
    for (var u = WOOD.u0; u < WOOD.u1 - 1e-6; u += s) {
      for (var v = WOOD.v0; v < WOOD.v1 - 1e-6; v += s) {
        var p = [{u: u, v: v}, {u: u + s, v: v}, {u: u + s, v: v + s}, {u: u, v: v + s}];
        p.forEach(function (point) { point.z = rise(point.u, point.v); });
        facets.push([p[0], p[1], p[2]], [p[0], p[2], p[3]]);
      }
    }
    facets.forEach(function (f) { f.depth = depthAt(f[0].u + f[1].u + f[2].u, f[0].v + f[1].v + f[2].v); });
    facets.sort(function (a, b) { return a.depth - b.depth; });
    return facets;
  }
  // The land's two near edges (+v, then +u), earth down to its foot.
  function paintEdges(paint, L) {
    var earth = [104, 74, 50], s = WOOD.step;
    [[WOOD.v1, 0.9, false], [WOOD.u1, 0.7, true]].forEach(function (edge) {
      var alongU = !edge[2], length = alongU ? WOOD.u1 - WOOD.u0 : WOOD.v1 - WOOD.v0;
      for (var t = 0; t < length - 1e-6; t += s) {
        var a = alongU ? {u: WOOD.u0 + t, v: edge[0]} : {u: edge[0], v: WOOD.v0 + t};
        var b = alongU ? {u: a.u + s, v: edge[0]} : {u: edge[0], v: a.v + s};
        facet(paint, [{u: a.u, v: a.v, z: rise(a.u, a.v)}, {u: b.u, v: b.v, z: rise(b.u, b.v)},
          {u: b.u, v: b.v, z: -WOOD.base}, {u: a.u, v: a.v, z: -WOOD.base}], rgb(earth, edge[1] * L));
      }
    });
  }
  // The land's top edge on the screen, all the way round.
  function woodEdge() {
    var edge = [], s = WOOD.step, u, v;
    for (u = WOOD.u0; u < WOOD.u1; u += s) {
      edge.push(iso(u, WOOD.v0, rise(u, WOOD.v0)));
    }
    for (v = WOOD.v0; v < WOOD.v1; v += s) {
      edge.push(iso(WOOD.u1, v, rise(WOOD.u1, v)));
    }
    for (u = WOOD.u1; u > WOOD.u0; u -= s) {
      edge.push(iso(u, WOOD.v1, rise(u, WOOD.v1)));
    }
    for (v = WOOD.v1; v > WOOD.v0; v -= s) {
      edge.push(iso(WOOD.u0, v, rise(WOOD.u0, v)));
    }
    return edge;
  }
  // Where the air thins on the screen, from the land's farthest corner to its middle.
  function woodAir() {
    return [Math.min(iso(WOOD.u0, WOOD.v0, 1).y, iso(WOOD.u1, WOOD.v0, 1).y, iso(WOOD.u0, WOOD.v1, 1).y),
      iso(WOOD_MIDDLE.u, WOOD_MIDDLE.v, 0).y];
  }
  // Sharp: stones along the brook's banks, lumpy, lit from the upper left.
  var ROCKS = [], brookClip = null, dawnMist = 0, shafting = 0;
  for (var stone = 0; stone < 34; stone += 1) {
    ROCKS.push({
      d: hash('rock d' + stone),
      side: (hash('rock s' + stone) < 0.5 ? -1 : 1) * (0.62 + 0.3 * hash('rock o' + stone)),
      r: 0.07 + 0.13 * Math.pow(hash('rock r' + stone), 2),
      seed: 'rock' + stone,
    });
  }
  var ROCK_LAYERS = [[[112, 110, 104], 1, 0], [[156, 152, 142], 0.6, 0.35]];
  function drawRocks(paint, L) {
    if (brookRun.length < 2) {
      return;
    }
    var length = brookLength();
    ROCKS.forEach(function (one) {
      var at = alongBrook(one.d * length), u = at.u - at.dv * one.side, v = at.v + at.du * one.side, z = rise(u, v);
      ROCK_LAYERS.forEach(function (layer) {
        paint.fillStyle = paint.strokeStyle = rgb(whiten(layer[0], 0.8 * flow.snowCover), L);
        paint.beginPath();
        for (var k = 0; k < 7; k += 1) {
          var angle = 6.2832 * k / 7, reach = one.r * layer[1] * (0.75 + 0.4 * hash(one.seed + k));
          var offset = layer[2] * one.r * 0.4;
          var p = iso(u + reach * Math.cos(angle) - offset, v + reach * Math.sin(angle) - offset, z + layer[2] * one.r * 0.8);
          paint[k ? 'lineTo' : 'moveTo'](p.x, p.y);
        }
        paint.closePath();
        paint.fill();
      });
    });
  }

  // ------------------------------------------------------- the live details --
  // Sharp: grass in tufts over the land, swaying in the wind; some flowering, spring to
  // autumn on a mild day; none under deep snow. Where each is on the screen is kept while
  // the camera holds (`tuftsAt`).
  var TUFTS = [], tuftsAt = null, BLOOMS = ['#f2efe6', '#f4d35e', '#b58ad6'];
  for (var tuft = 0; tuft < 900; tuft += 1) {
    var tu = WOOD.u0 + 0.3 + Math.random() * (WOOD.u1 - WOOD.u0 - 0.6), tv = WOOD.v0 + 0.3 + Math.random() * (WOOD.v1 - WOOD.v0 - 0.6);
    if (fromBrook(tu, tv) < 0.8) {
      continue;
    }
    TUFTS.push({u: tu, v: tv, seed: Math.random() * 6.3, tall: 0.6 + 0.6 * Math.random(),
      flower: Math.random() < 0.18 ? Math.floor(Math.random() * BLOOMS.length) : -1});
  }
  function drawGrass(paint, time) {
    if (flow.snowCover > 0.7) {
      return;
    }
    if (tuftsAt !== flow.unit + ' ' + flow.width) {
      tuftsAt = flow.unit + ' ' + flow.width;
      TUFTS.forEach(function (one) { one.at = iso(one.u, one.v, rise(one.u, one.v)); });
    }
    var k = cam.z, t = time / 1000, wind = flow.weather.wind || 0, blades = new Path2D();
    var flowers = BLOOMS.map(function () { return []; });
    var month = new Date().getMonth(), flowering = month >= 3 && month <= 9 && flow.temp > 4 && flow.snowCover < 0.2;
    TUFTS.forEach(function (one) {
      var lean = (0.25 * flow.windX + Math.sin(t * (1.3 + wind / 30) + one.seed) * 0.12 * (1 + wind / 20)) * 0.06 * k;
      var high = 0.07 * k * one.tall;
      for (var b = -1; b <= 1; b += 1) {
        blades.moveTo(one.at.x + b * 0.018 * k, one.at.y);
        blades.lineTo(one.at.x + b * 0.035 * k + lean, one.at.y - high * (b ? 0.8 : 1));
      }
      if (flowering && one.flower >= 0) {
        flowers[one.flower].push(one.at.x + lean, one.at.y - high);
      }
    });
    paint.strokeStyle = rgb(whiten([70, 120, 60], 0.6 * flow.snowCover), woodLight);
    paint.lineWidth = Math.max(1, 0.009 * k);
    paint.globalAlpha = 1;
    paint.stroke(blades);
    flowers.forEach(function (list, index) {
      if (!list.length) {
        return;
      }
      paint.fillStyle = rgb(channels(BLOOMS[index]), woodLight);
      paint.beginPath();
      for (var i = 0; i < list.length; i += 2) {
        paint.moveTo(list[i] + 0.012 * k, list[i + 1]);
        paint.arc(list[i], list[i + 1], Math.max(1, 0.012 * k), 0, 6.2832);
      }
      paint.fill();
    });
  }
  // Sharp: mist lying low along the brook at dawn (`dawnMist`), drifting slowly down it;
  // and sunbeams slanting down through the air (`shafting`) the way the light comes.
  var mistBlob = document.createElement('canvas');
  mistBlob.width = mistBlob.height = 64;
  (function () {
    var paint = mistBlob.getContext('2d'), shade = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
    shade.addColorStop(0, 'rgba(232, 236, 240, 0.9)');
    shade.addColorStop(1, 'rgba(232, 236, 240, 0)');
    paint.fillStyle = shade;
    paint.fillRect(0, 0, 64, 64);
  })();
  function drawMist(paint, time) {
    if (dawnMist < 0.02 || brookRun.length < 2) {
      return;
    }
    var length = brookLength(), k = cam.z, t = time / 1000;
    paint.globalAlpha = 0.3 * dawnMist * (0.4 + 0.6 * woodLight);
    for (var i = 0; i < 22; i += 1) {
      var d = (i / 22 * length + 0.05 * t) % length, at = alongBrook(d), side = (hash('mist' + i) - 0.5) * 2.4;
      var spot = iso(at.u - at.dv * side, at.v + at.du * side, 0.05), wide = (2.2 + 1.4 * hash('mist w' + i)) * k;
      paint.drawImage(mistBlob, spot.x - wide / 2, spot.y - 0.3 * k, wide, 0.6 * k);
    }
    paint.globalAlpha = 1;
  }
  function drawShafts(paint, time) {
    if (shafting < 0.03) {
      return;
    }
    var way = shadowWay(), sx = cam.a * way.u + cam.c * way.v, sy = cam.b * way.u + cam.d * way.v;
    var slant = Math.max(-0.8, Math.min(0.8, sx / (Math.abs(sy) + 0.5 * Math.abs(sx) + 0.01))), t = time / 1000;
    paint.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 6; i += 1) {
      var x = flow.width * (0.1 + 0.16 * i + 0.05 * hash('shaft' + i)), wide = flow.width * (0.025 + 0.03 * hash('shaft w' + i));
      var fall = paint.createLinearGradient(0, 0, 0, flow.height);
      fall.addColorStop(0, 'rgba(255, 236, 196, 0)');
      fall.addColorStop(0.3, 'rgba(255, 236, 196, 1)');
      fall.addColorStop(1, 'rgba(255, 236, 196, 0)');
      paint.globalAlpha = 0.05 * shafting * (0.6 + 0.4 * Math.sin(t * 0.25 + i * 1.7));
      paint.fillStyle = fall;
      paint.beginPath();
      paint.moveTo(x, 0);
      paint.lineTo(x + wide, 0);
      paint.lineTo(x + wide * 1.8 + slant * flow.height, flow.height);
      paint.lineTo(x + slant * flow.height, flow.height);
      paint.closePath();
      paint.fill();
    }
    paint.globalCompositeOperation = 'source-over';
    paint.globalAlpha = 1;
  }
  // Whether a point on the screen lies on the brook's water (iso undone at the water's
  // level): if so, how far along the brook and to which side ({d, side}, as for the duck).
  function inBrook(x, y) {
    if (brookRun.length < 2) {
      return null;
    }
    var px = x - flow.origin.x, py = y - flow.origin.y + AFLOAT * cam.z, det = cam.a * cam.d - cam.c * cam.b;
    var u = cam.pivot.u + (px * cam.d - cam.c * py) / det, v = cam.pivot.v + (cam.a * py - cam.b * px) / det;
    var best = null, nearest = 0.6;
    for (var i = 1; i < brookRun.length; i += 1) {
      var a = brookRun[i - 1], b = brookRun[i], long = (b.d - a.d) || 1, du = (b.u - a.u) / long, dv = (b.v - a.v) / long;
      var f = Math.max(0, Math.min(long, (u - a.u) * du + (v - a.v) * dv));
      var off = Math.hypot(u - a.u - du * f, v - a.v - dv * f);
      if (off < nearest) {
        nearest = off;
        // Where it came down, so it doesn't jump.
        best = {d: a.d + f, side: -(u - a.u) * dv + (v - a.v) * du};
      }
    }
    return best;
  }
  // Sharp: the brook flowing, glints drifting down it at DRIFT as the leaves do, each
  // brightening and fading as it goes, fainter by night.
  var RIPPLES = [];
  for (var glint = 0; glint < 70; glint += 1) {
    RIPPLES.push({d: Math.random(), side: (Math.random() - 0.5) * 0.9, phase: Math.random() * 6.3, long: 0.15 + 0.2 * Math.random()});
  }
  function drawRipples(paint, time) {
    if (brookRun.length < 2) {
      return;
    }
    var length = brookLength(), t = time / 1000;
    paint.strokeStyle = rgb([200, 226, 240], woodLight);
    paint.lineCap = 'round';
    paint.lineWidth = Math.max(1, 0.035 * cam.z);
    for (var i = 0; i < RIPPLES.length; i += 1) {
      var one = RIPPLES[i], d = (one.d * length + DRIFT * t) % length;
      var shine = Math.pow(Math.sin(t * 0.9 + one.phase), 2) * Math.min(1, d / 0.8, (length - d) / 0.8);
      if (shine < 0.05) {
        continue;
      }
      var a = floatAt({d: d, side: one.side}), b = floatAt({d: d + one.long, side: one.side});
      paint.globalAlpha = 0.45 * shine;
      paint.beginPath();
      paint.moveTo(a.x, a.y);
      paint.lineTo(b.x, b.y);
      paint.stroke();
    }
    paint.globalAlpha = 1;
  }
  // Where something afloat is on the screen: down the brook, and on past its end to the
  // edge. At the water's level, AFLOAT: the ground within 0.6 of the brook is flat, so no
  // rise() and its walk along the brook for every leaf, every frame.
  var AFLOAT = -0.12;
  function floatAt(afloat) {
    var length = brookLength(), at = alongBrook(Math.min(afloat.d, length));
    var over = Math.max(0, afloat.d - length);
    var u = at.u + at.du * over - at.dv * afloat.side, v = at.v + at.dv * over + at.du * afloat.side;
    return iso(u, v, AFLOAT);
  }
  // Whether a point on the screen is on the land's top (inside landEdge).
  function onLand(x, y) {
    var inside = false;
    for (var i = 0, j = landEdge.length - 1; i < landEdge.length; j = i, i += 1) {
      var a = landEdge[i], b = landEdge[j];
      if ((a.y > y) !== (b.y > y) && x < a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ------------------------------------------------------------- the trees --
  var TALL = 5;
  // Each tree's growth eased to its traffic: up in about 6 s, down in about 20; its
  // leafiness to the last few seconds'. The first readings set the scene as they are.
  function growTrees(seconds) {
    // Vigour is whole at 1 Mb/s: the house's rates scaled so homehub's is at ELDER_BITS.
    elder.down = wan.down * 1e6 / ELDER_BITS;
    elder.up = wan.up * 1e6 / ELDER_BITS;
    trees.forEach(function (tree) {
      var device = tree.device, lively = device.online ? vigour(device.down + device.up) : 0;
      if (flow.polled < 3 || device.grow === undefined) {
        device.grow = device.bloom = lively;
        return;
      }
      device.grow += (lively - device.grow) * Math.min(1, seconds / (lively > device.grow ? 6 : 20));
      device.bloom += (lively - device.bloom) * Math.min(1, seconds / 4);
    });
  }
  function drawWood(paint, time, seconds) {
    var L = woodLight, bark = rgb([108, 86, 66], L);
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = 'source-over';
    paint.lineCap = 'round';
    growTrees(seconds);
    // Until the second reading there are no trees: they come in as they are then, not
    // bare and then growing.
    if (flow.polled < 2) {
      return;
    }
    drawTreeShadows(paint);
    if (sharp) {
      drawGrass(paint, time);
    }
    if (!landEdge.length) {
      landEdge = woodEdge();
    }
    drawLitter(paint, time, seconds, L);
    if (sharp && !flow.frozen) {
      drawRipples(paint, time);
    }
    drawDuck(paint, seconds);
    if (sharp) {
      drawMist(paint, time);
    }
    // Sharp: the trees near the brook stand upside down in it, dim: their branches and
    // leaves gathered as they're drawn, then laid beneath everything (destination-over),
    // on the water only.
    var reflected = sharp && !flow.frozen && brookClip ? {branches: new Path2D(), leaves: new Path2D()} : null;
    var visited = false;
    // The visitor is drawn among the trees at its depth.
    function visit() {
      if (!visited) {
        visited = true;
        drawVisitor(paint, seconds);
      }
    }
    var owly = Math.max(0, Math.min(1, (flow.starry - 0.3) / 0.4));
    trees.forEach(function (tree) {
      if (!visitor || depthAt(tree.u, tree.v) > depthAt(visitor.u, visitor.v)) {
        visit();
      }
      drawTree(paint, tree, time, seconds, reflected, bark, owly, L);
    });
    visit();
    if (reflected) {
      paint.save();
      paint.clip(brookClip);
      paint.globalCompositeOperation = 'destination-over';
      paint.globalAlpha = 0.3;
      paint.fillStyle = rgb(LEAF.green.map(function (c) { return c * 0.7; }), L);
      paint.fill(reflected.leaves);
      paint.strokeStyle = bark;
      paint.lineWidth = Math.max(1, 0.012 * cam.z * TALL);
      paint.stroke(reflected.branches);
      paint.restore();
    }
    drawFireflies(paint, time);
  }
  // Beneath each tree, in one go. Sharp, with the sun or moon up, cast away from it as a
  // soft pool, longer the lower the light, on the land only.
  function drawTreeShadows(paint) {
    var k = cam.z;
    var away = sharp && flow.sunlight.strength > 0.02 ? shadowWay() : null;
    var awayX = away ? cam.a * away.u + cam.c * away.v : 0, awayY = away ? cam.b * away.u + cam.d * away.v : 0;
    paint.save();
    if (away) {
      if (!landEdge.length) {
        landEdge = woodEdge();
      }
      tracePath(paint, landEdge);
      paint.clip();
    }
    paint.fillStyle = 'rgb(10, 20, 10)';
    paint.globalAlpha = away ? 0.1 + 0.18 * flow.sunlight.strength : 0.24;
    paint.beginPath();
    trees.forEach(function (tree) {
      var foot = iso(tree.u, tree.v, tree.h), size = (0.1 + 0.4 * tree.device.grow) * tree.great * k;
      if (!away) {
        paint.moveTo(foot.x + size * 1.1, foot.y);
        paint.ellipse(foot.x + 0.1 * size, foot.y, size * 1.1, size * 0.42, 0, 0, 6.2832);
        return;
      }
      var long = Math.hypot(awayX, awayY) || 1, reach = Math.min(2.5 * size, 0.6 * size * long / k);
      var turn = Math.atan2(awayY, awayX), cx = foot.x + Math.cos(turn) * reach * 0.7, cy = foot.y + Math.sin(turn) * reach * 0.7;
      var rx = 1.1 * size + 0.4 * reach;
      paint.moveTo(cx + Math.cos(turn) * rx, cy + Math.sin(turn) * rx);
      paint.ellipse(cx, cy, rx, size * 0.45, turn, 0, 6.2832);
    });
    paint.fill();
    paint.restore();
    paint.globalAlpha = 1;
  }
  // Fallen leaves drift down to the ground and lie there, fading; off the land's edge
  // they fall on past it; on the brook they float away. Drawn in four steps of fade.
  function drawLitter(paint, time, seconds, L) {
    var piles = [[], [], [], []];
    litter = litter.filter(function (bit) {
      if (bit.y < bit.ground) {
        fallLeaf(bit, time, seconds);
      } else if (bit.afloat) {
        floatLeaf(bit, seconds);
      } else {
        bit.rest += seconds;
      }
      var gone = bit.astray ? (bit.y - bit.astray) / (ASTRAY * flow.dpr) : (bit.rest - LITTER + LEAF_FADE) / LEAF_FADE;
      if (gone >= 1) {
        return false;
      }
      piles[Math.max(0, Math.min(3, Math.floor(4 * gone)))].push(bit);
      return true;
    });
    var FADES = [1, 0.65, 0.35, 0.12];
    piles.forEach(function (pile, step) {
      if (!pile.length) {
        return;
      }
      paint.globalAlpha = FADES[step];
      paint.fillStyle = rgb(LEAF.brown, 0.85 * L);
      paint.beginPath();
      pile.forEach(function (bit) {
        // Lying down, it's seen at a slant.
        var flat = bit.y < bit.ground ? 1 : 0.55;
        paint.moveTo(bit.x + bit.long, bit.y);
        paint.ellipse(bit.x, bit.y, bit.long, bit.wide * flat, bit.angle, 0, 6.2832);
      });
      paint.fill();
    });
    paint.globalAlpha = 1;
  }
  function fallLeaf(bit, time, seconds) {
    bit.y = Math.min(bit.ground, bit.y + bit.speed * seconds);
    bit.x += (Math.sin(time / 500 + bit.phase) * 0.6 + 2 * flow.windX) * bit.speed * seconds;
    bit.angle += bit.spin * seconds;
    if (bit.y < bit.ground) {
      return;
    }
    if (!onLand(bit.x, bit.y)) {
      bit.astray = bit.y;
      bit.ground = Infinity;
    } else if (!flow.frozen) {
      bit.afloat = inBrook(bit.x, bit.y);
    }
  }
  // Carried down the brook, turning slowly, and off the edge.
  function floatLeaf(bit, seconds) {
    bit.afloat.d += DRIFT * seconds;
    var spot = floatAt(bit.afloat);
    bit.x = spot.x;
    bit.y = bit.ground = spot.y;
    bit.angle += 0.15 * bit.spin * seconds;
    if (!onLand(bit.x, bit.y)) {
      bit.afloat = null;
      bit.astray = bit.y;
      bit.ground = Infinity;
    }
  }
  // A tree: its branches grow out in turn, trunk first, each once the one it grows from is
  // whole; its leaves come out one by one on the grown branches. Lines, thinner further
  // out, swaying in the wind, more at the top and when it's busy.
  function drawTree(paint, tree, time, seconds, reflected, bark, owly, L) {
    var device = tree.device, grow = device.grow, burst = 0, k = cam.z;
    device.ripples.forEach(function (age) { burst = Math.max(burst, 1 - age / 1.2); });
    // How far out it has grown (the trunk 0 to 1, its first branches 1 to 2...): a quiet
    // one a sapling with a few leaves, a busy one whole and full.
    var age = 2.2 + Math.pow(grow, 0.5) * (tree.forks - 1.2);
    var leafy = Math.min(1, 0.2 + 0.8 * grow + 0.15 * burst);
    var fenced = device.online && !device.allowed;
    var leaf = fenced ? LEAF.red : LEAF.brown.map(function (c, i) {
      return c + (LEAF.green[i] - c) * (device.online ? smoothstep((grow - 0.04) / 0.2) : 0);
    });
    // A busy one stands up to 1.6 times as tall.
    var tall = TALL * (0.7 + 0.9 * Math.sqrt(grow)) * tree.great * k, foot = iso(tree.u, tree.v, tree.h);
    // The wind leans it downwind in gusts and sways it faster and further; a busy tree
    // sways more.
    var wind = flow.weather.wind || 0, gust = 0.7 + 0.3 * Math.sin(time / 3700 + tree.seed * 0.4);
    var sway = 0.1 * flow.windX * gust + Math.sin(time / 1500 * (1 + wind / 40) + tree.seed) * 0.035 * (0.4 + device.bloom) * (1 + wind / 25);
    var form = {
      x: function (px, py) { return foot.x + (px + sway * py * py) * tall; },
      y: function (py) { return foot.y - py * tall; },
      // Mirrored about the water's level beneath it.
      mirror: reflected && tree.wet ? 2 * iso(tree.u, tree.v, AFLOAT).y : 0,
      top: foot.y,
    };
    if (fenced) {
      drawFence(paint, tree, false, L);
    }
    drawBranches(paint, tree, age, tall, bark, form, reflected);
    drawLeaves(paint, tree, age, leafy, leaf, burst, tall, foot, form, reflected, seconds, L);
    if (tree.owl && owly) {
      drawOwl(paint, tree.owl, form.x, form.y, tall / Math.sqrt(tree.great) * (FORKS > 4 ? 0.75 : 1), seconds, owly);
    }
    if (fenced) {
      drawFence(paint, tree, true, L);
    }
    paint.lineCap = 'round';
    // Its name goes above its top.
    device.roof = {x: foot.x, y: form.top - 4 * flow.dpr};
  }
  function drawBranches(paint, tree, age, tall, bark, form, reflected) {
    paint.strokeStyle = bark;
    for (var depth = 0; depth <= tree.forks; depth += 1) {
      var grown = Math.max(0, Math.min(1, age - depth));
      if (!grown) {
        break;
      }
      paint.lineWidth = Math.max(1, 0.03 * tall * Math.pow(0.62, depth));
      paint.beginPath();
      for (var b = 0; b < tree.branches.length; b += 1) {
        var branch = tree.branches[b];
        if (branch.depth !== depth) {
          continue;
        }
        var ex = branch.x0 + (branch.x1 - branch.x0) * grown, ey = branch.y0 + (branch.y1 - branch.y0) * grown;
        var x0 = form.x(branch.x0, branch.y0), y0 = form.y(branch.y0), x1 = form.x(ex, ey), y1 = form.y(ey);
        paint.moveTo(x0, y0);
        paint.lineTo(x1, y1);
        if (form.mirror) {
          reflected.branches.moveTo(x0, form.mirror - y0);
          reflected.branches.lineTo(x1, form.mirror - y1);
        }
        form.top = Math.min(form.top, y1);
      }
      paint.stroke();
    }
  }
  // A leaf comes out, growing to size, when the tree wants it and its branch reaches it.
  // One no longer wanted browns over WITHER seconds (greening if wanted back meanwhile),
  // then falls; it holds on until its branch has died well back past it, so a tree whose
  // traffic wavers keeps its leaves. While the first readings settle the scene, leaves
  // come and go at once, none falling.
  function drawLeaves(paint, tree, age, leafy, leaf, burst, tall, foot, form, reflected, seconds, L) {
    var device = tree.device, settling = flow.polled < 3;
    // homehub's are a little bigger, not ELDER times; sharp's are more and smaller.
    var leafSize = tall / Math.sqrt(tree.great) * (FORKS > 4 ? 0.75 : 1);
    var long = 0.034 * leafSize, wide = 0.016 * leafSize, tints = [[], [], [], []];
    tree.leaves.forEach(function (one) {
      var branch = one.branch, out = Math.max(0, Math.min(1, age - branch.depth)), reached = out >= one.at;
      var wanted = reached && one.when <= leafy, held = out > 0 && out >= one.at - 0.25;
      if (!one.on) {
        if (!wanted) {
          return;
        }
        one.on = true;
        one.size = settling ? 1 : 0;
        one.dying = 0;
      }
      one.size = Math.min(1, one.size + seconds * 1.5);
      one.dying = wanted ? Math.max(0, one.dying - seconds / 4) : Math.min(1, one.dying + seconds / WITHER);
      var at = Math.min(one.at, out), px = branch.x0 + (branch.x1 - branch.x0) * at, py = branch.y0 + (branch.y1 - branch.y0) * at;
      var reach = long * one.size, cx = form.x(px, py) + Math.sin(one.angle) * reach, cy = form.y(py) - Math.cos(one.angle) * reach;
      if (!held || one.dying >= 1 || (settling && !wanted)) {
        one.on = false;
        if (!settling) {
          dropLeaf(device, one, cx, cy, foot, tall, long, wide);
        }
        return;
      }
      tints[Math.min(3, Math.floor(one.dying * 4))].push([cx, cy, one.angle - Math.PI / 2, reach]);
      if (form.mirror) {
        reflected.leaves.moveTo(cx + reach, form.mirror - cy);
        reflected.leaves.ellipse(cx, form.mirror - cy, reach, wide * reach / long, -(one.angle - Math.PI / 2), 0, 6.2832);
      }
      form.top = Math.min(form.top, cy - long);
    });
    // Fresh to nearly fallen: the tree's colour, browning.
    tints.forEach(function (list, step) {
      if (!list.length) {
        return;
      }
      var f = step / 3, tint = leaf.map(function (c, i) { return c + (LEAF.brown[i] - c) * f; });
      paint.fillStyle = rgb(tint, (0.95 + 0.15 * burst) * L);
      paint.beginPath();
      list.forEach(function (one) {
        paint.moveTo(one[0] + one[3], one[1]);
        paint.ellipse(one[0], one[1], one[3], wide * one[3] / long, one[2], 0, 6.2832);
      });
      paint.fill();
    });
  }
  function dropLeaf(device, one, cx, cy, foot, tall, long, wide) {
    var drop = hash(device.mac + one.when);
    if (drop >= SHED || litter.length >= MAX_LITTER) {
      return;
    }
    drop /= SHED;
    litter.push({x: cx, y: cy, ground: foot.y + (drop - 0.35) * 0.1 * tall, long: long, wide: wide,
      angle: one.angle - Math.PI / 2, spin: (drop - 0.5) * 3, phase: drop * 6.3,
      speed: (0.12 + 0.08 * drop) * tall, rest: 0});
  }
  // By night, on mild dry nights: more the busier the house, drifting and blinking low
  // among the trees.
  function drawFireflies(paint, time) {
    var lit = Math.max(0, Math.min(1, (flow.starry - 0.15) / 0.5));
    var count = Math.round(lit * Math.min(fireflies.length, 6 + 12 * Math.log10(1 + (wan.down + wan.up) / 1e5)));
    if (flow.temp < MILD || flow.precip.kind) {
      count = 0;
    }
    if (!count) {
      return;
    }
    paint.globalCompositeOperation = 'lighter';
    var spark = flow.glows.firefly, size = spark.width * 0.9 * GLOW, t = time / 1000;
    for (var i = 0; i < count; i += 1) {
      var fly = fireflies[i];
      var u = fly.u + 0.5 * Math.sin(t * fly.speed + fly.phase), v = fly.v + 0.5 * Math.cos(t * fly.speed * 0.8 + fly.phase);
      var at = iso(u, v, rise(u, v) + 0.35 + 0.2 * Math.sin(t * 0.9 + fly.phase));
      paint.globalAlpha = Math.max(0, Math.sin(t * 1.3 + fly.phase * 3));
      paint.drawImage(spark, at.x - size / 2, at.y - size / 2, size, size);
      if (glaring()) {
        glaring().globalAlpha = paint.globalAlpha;
        glaring().drawImage(spark, at.x - size, at.y - size, 2 * size, 2 * size);
      }
    }
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = 'source-over';
  }
  // A cut-off device's tree is fenced in: a low ring of posts and two rails round its
  // foot, the far side drawn before the tree and the near side after.
  var FENCE = 0.5, POSTS = 10;
  function drawFence(paint, tree, near, L) {
    var middle = depthAt(tree.u, tree.v), ring = [], k = cam.z;
    for (var i = 0; i < POSTS; i += 1) {
      var angle = 6.2832 * i / POSTS, u = tree.u + FENCE * Math.cos(angle), v = tree.v + FENCE * Math.sin(angle);
      ring.push({u: u, v: v, z: rise(u, v)});
    }
    paint.strokeStyle = rgb([150, 118, 82], L);
    paint.lineCap = 'butt';
    paint.lineWidth = Math.max(1, 0.03 * k);
    paint.beginPath();
    ring.forEach(function (a, i) {
      var b = ring[(i + 1) % POSTS];
      if ((depthAt((a.u + b.u) / 2, (a.v + b.v) / 2) > middle) !== near) {
        return;
      }
      [0.12, 0.24].forEach(function (z) {
        var p = iso(a.u, a.v, a.z + z), q = iso(b.u, b.v, b.z + z);
        paint.moveTo(p.x, p.y);
        paint.lineTo(q.x, q.y);
      });
    });
    paint.stroke();
    paint.lineWidth = Math.max(1, 0.05 * k);
    paint.beginPath();
    ring.forEach(function (a) {
      if ((depthAt(a.u, a.v) > middle) !== near) {
        return;
      }
      var p = iso(a.u, a.v, a.z), q = iso(a.u, a.v, a.z + 0.3);
      paint.moveTo(p.x, p.y);
      paint.lineTo(q.x, q.y);
    });
    paint.stroke();
  }

  // ------------------------------------------------------------ the visitors --
  // A visitor for a new device (first seen within the hour; once a TV, kept in
  // VISIT_KEY): a deer or a fox steps out into the meadow, walks a little way, grazes and
  // looks about, then walks on and fades away. One at a time, after the scene settles.
  var VISIT_KEY = 'flow-met', met = {}, visitors = [], visitor = null, visitDue = 8;
  try {
    met = JSON.parse(localStorage.getItem(VISIT_KEY) || '{}') || {};
  } catch (error) {
    // None kept.
  }
  devices.forEach(function (device) {
    if (device.new && !met[device.mac]) {
      visitors.push(device);
    }
  });
  var VISIT_WALK = 6, VISIT_STAND = 14;
  function drawVisitor(paint, seconds) {
    if (!visitor) {
      visitDue -= seconds;
      if (visitDue > 0 || !visitors.length || flow.polled < 3 || flow.precip.storm) {
        return;
      }
      visitor = newVisitor();
    }
    var me = visitor;
    me.t += seconds;
    var walking = me.t < VISIT_WALK || me.t > VISIT_WALK + VISIT_STAND;
    if (me.t > 2 * VISIT_WALK + VISIT_STAND) {
      visitor = null;
      visitDue = 20;
      return;
    }
    if (walking) {
      me.u += me.du * 0.12 * seconds;
      me.v += me.dv * 0.12 * seconds;
      me.phase += seconds * 7;
    }
    drawAnimal(paint, me, walking);
  }
  function newVisitor() {
    var device = visitors.shift(), now = Date.now();
    met[device.mac] = now;
    Object.keys(met).forEach(function (mac) {
      if (now - met[mac] > 86400000) {
        delete met[mac];
      }
    });
    try {
      localStorage.setItem(VISIT_KEY, JSON.stringify(met));
    } catch (error) {
      // Can't keep it.
    }
    // A spot in the meadow, this side of the tree, out of the brook.
    for (var tries = 0; tries < 20; tries += 1) {
      var angle = Math.random() * Math.PI / 2, u = GLADE.u + 0.7 * GLADE.r * Math.cos(angle);
      var v = GLADE.v + 0.7 * GLADE.r * Math.sin(angle);
      if (fromBrook(u, v) > 1.2) {
        break;
      }
    }
    // Along the meadow's edge, one way or the other.
    var way = Math.random() < 0.5 ? 1 : -1;
    return {u: u, v: v, du: -Math.sin(angle) * way, dv: Math.cos(angle) * way, t: 0, deer: Math.random() < 0.6, phase: 0, look: 0};
  }
  // Standing, it grazes (head down) a while, then looks up and about, and again.
  function drawAnimal(paint, me, walking) {
    var fade = Math.min(1, me.t / 2, (2 * VISIT_WALK + VISIT_STAND - me.t) / 2);
    var foot = iso(me.u, me.v, rise(me.u, me.v)), ahead = iso(me.u + me.du, me.v + me.dv, rise(me.u, me.v));
    var face = ahead.x >= foot.x ? 1 : -1, s = (me.deer ? 0.55 : 0.36) * cam.z, L = 0.4 + 0.6 * woodLight;
    var grazing = !walking && Math.sin((me.t - VISIT_WALK) * 0.8) > -0.2;
    paint.save();
    paint.globalAlpha = fade;
    paint.translate(foot.x, foot.y);
    paint.scale(face, 1);
    paint.lineCap = 'round';
    var coat = me.deer ? [182, 124, 74] : [212, 108, 42], legs = me.deer ? [96, 70, 48] : [60, 40, 30];
    var tall = me.deer ? 1 : 0.55, swing = walking ? 0.18 * Math.sin(me.phase) : 0;
    paint.strokeStyle = rgb(legs, L);
    paint.lineWidth = Math.max(1, 0.09 * s);
    paint.beginPath();
    [[0.5, 1], [0.6, -1], [-0.5, -1], [-0.4, 1]].forEach(function (leg) {
      paint.moveTo(leg[0] * s, -0.95 * tall * s);
      paint.lineTo((leg[0] + swing * leg[1]) * s, 0);
    });
    paint.stroke();
    if (!me.deer) {
      foxBrush(paint, s, coat, L);
    }
    paint.fillStyle = rgb(coat, L);
    paint.beginPath();
    paint.ellipse(0, -1.15 * tall * s, 0.75 * s, 0.3 * s, 0, 0, 6.2832);
    paint.fill();
    // The neck and head: up and turning to look about, or down to graze.
    var headX = grazing ? 1.0 : 0.95, headY = grazing ? -0.25 : (me.deer ? -2.0 : -1.25);
    paint.strokeStyle = rgb(coat, L);
    paint.lineWidth = 0.22 * s;
    paint.beginPath();
    paint.moveTo(0.55 * s, -1.2 * tall * s);
    paint.lineTo(headX * s, headY * s);
    paint.stroke();
    // Looking toward us, and away.
    var turn = !walking && !grazing ? Math.sin(me.t * 0.9) : 0;
    paint.beginPath();
    paint.ellipse((headX + 0.12 - 0.08 * Math.abs(turn)) * s, headY * s, 0.24 * s, 0.13 * s, grazing ? 1.1 : 0.15, 0, 6.2832);
    paint.fill();
    // Its ears.
    paint.beginPath();
    paint.moveTo((headX - 0.05) * s, (headY - 0.08) * s);
    paint.lineTo((headX - 0.12) * s, (headY - 0.3) * s);
    paint.lineTo((headX + 0.06) * s, (headY - 0.1) * s);
    paint.fill();
    if (me.deer) {
      antlersAndTail(paint, s, headX, headY, L);
    }
    paint.restore();
  }
  // White-tipped.
  function foxBrush(paint, s, coat, L) {
    paint.fillStyle = rgb(coat, L);
    paint.beginPath();
    paint.ellipse(-1.15 * s, -0.75 * s, 0.5 * s, 0.17 * s, -0.25, 0, 6.2832);
    paint.fill();
    paint.fillStyle = rgb([236, 230, 220], L);
    paint.beginPath();
    paint.ellipse(-1.55 * s, -0.66 * s, 0.14 * s, 0.1 * s, -0.25, 0, 6.2832);
    paint.fill();
  }
  function antlersAndTail(paint, s, headX, headY, L) {
    paint.strokeStyle = rgb([200, 180, 150], L);
    paint.lineWidth = Math.max(1, 0.05 * s);
    paint.beginPath();
    paint.moveTo(headX * s, (headY - 0.1) * s);
    paint.lineTo((headX - 0.1) * s, (headY - 0.55) * s);
    paint.moveTo((headX - 0.05) * s, (headY - 0.32) * s);
    paint.lineTo((headX + 0.12) * s, (headY - 0.5) * s);
    paint.stroke();
    paint.fillStyle = rgb([236, 230, 220], L);
    paint.beginPath();
    paint.ellipse(-0.75 * s, -1.25 * s, 0.1 * s, 0.14 * s, 0, 0, 6.2832);
    paint.fill();
  }
  // An owl on its perch, three quarters along its branch: brown, a paler front and face,
  // ear tufts, big amber eyes that glow (lit by nothing). It blinks now and then and turns
  // its head to look about, but never leaves; shown as much as it's night.
  var OWL_LOOKS = [-1, -0.5, 0, 0, 0.5, 1];
  function drawOwl(paint, owl, x, y, size, seconds, shown) {
    owl.next -= seconds;
    if (owl.next <= 0) {
      owl.aim = OWL_LOOKS[Math.floor(6 * Math.random())];
      owl.next = 2 + 6 * Math.random();
    }
    owl.turn += (owl.aim - owl.turn) * Math.min(1, seconds * 5);
    owl.blink -= seconds;
    if (owl.blink <= 0) {
      owl.shut = 0.2;
      owl.blink = 2 + 6 * Math.random();
    }
    owl.shut = Math.max(0, owl.shut - seconds);
    var branch = owl.branch, px = branch.x0 + (branch.x1 - branch.x0) * 0.75, py = branch.y0 + (branch.y1 - branch.y0) * 0.75;
    var bx = x(px, py), by = y(py), o = 0.045 * size, L = 0.4 + 0.6 * woodLight, turn = owl.turn;
    var hx = bx + 0.12 * o * turn, hy = by - 2.75 * o, look = hx + 0.35 * o * turn, narrow = 1 - 0.3 * Math.abs(turn);
    paint.save();
    paint.globalAlpha = shown;
    // The body, head and tufts.
    paint.fillStyle = rgb([92, 72, 54], L);
    paint.beginPath();
    paint.ellipse(bx, by - 1.3 * o, o, 1.4 * o, 0, 0, 6.2832);
    paint.moveTo(hx + 0.85 * o, hy);
    paint.ellipse(hx, hy, 0.85 * o, 0.75 * o, 0, 0, 6.2832);
    [-1, 1].forEach(function (side) {
      var tx = hx + side * 0.55 * o * narrow + 0.2 * o * turn;
      paint.moveTo(tx - 0.22 * o, hy - 0.45 * o);
      paint.lineTo(tx + side * 0.12 * o, hy - 1.15 * o);
      paint.lineTo(tx + 0.22 * o, hy - 0.45 * o);
    });
    paint.fill();
    // The front and the face.
    paint.fillStyle = rgb([156, 134, 104], L);
    paint.beginPath();
    paint.ellipse(bx + 0.1 * o * turn, by - 1.1 * o, 0.6 * o, o, 0, 0, 6.2832);
    paint.moveTo(look + 0.7 * o * narrow, hy);
    paint.ellipse(look, hy, 0.7 * o * narrow, 0.55 * o, 0, 0, 6.2832);
    paint.fill();
    [-1, 1].forEach(function (side) { owlEye(paint, owl, look + side * 0.3 * o * narrow, hy - 0.05 * o, o, narrow, turn, L); });
    // The beak.
    paint.fillStyle = rgb([70, 58, 38], L);
    paint.beginPath();
    paint.moveTo(look + 0.1 * o * turn - 0.08 * o, hy + 0.12 * o);
    paint.lineTo(look + 0.1 * o * turn + 0.08 * o, hy + 0.12 * o);
    paint.lineTo(look + 0.15 * o * turn, hy + 0.38 * o);
    paint.fill();
    paint.restore();
  }
  function owlEye(paint, owl, ex, ey, o, narrow, turn, L) {
    if (owl.shut) {
      paint.strokeStyle = rgb([60, 46, 34], L);
      paint.lineWidth = Math.max(1, 0.08 * o);
      paint.beginPath();
      paint.moveTo(ex - 0.18 * o, ey);
      paint.lineTo(ex + 0.18 * o, ey);
      paint.stroke();
      return;
    }
    paint.fillStyle = '#ffc23a';
    paint.beginPath();
    paint.ellipse(ex, ey, 0.2 * o * narrow, 0.2 * o, 0, 0, 6.2832);
    paint.fill();
    paint.fillStyle = '#1a1208';
    paint.beginPath();
    paint.arc(ex + 0.05 * o * turn, ey, 0.1 * o, 0, 6.2832);
    paint.fill();
  }

  // ---------------------------------------------------------------- the duck --
  // It fades in at the top of the brook and paddles down it, now and then dabbling (tail
  // up, head under, a splash of drops and rings spreading), and fades out at the bottom.
  // Sometimes two to four ducklings follow in a line, quacking now and then.
  function drawDuck(paint, seconds) {
    var length = brookRun.length > 1 ? brookLength() : 0;
    if (!duck) {
      duckDue -= seconds;
      if (duckDue > 0 || length < 3 || flow.frozen || flow.precip.storm) {
        return;
      }
      duck = newDuck();
    }
    var dipping = duck.dip >= 0;
    duck.d += (dipping ? 0.05 : 0.3) * seconds;
    followDuck(seconds);
    if ((duck.young.length ? duck.young[duck.young.length - 1].d : duck.d) > length) {
      duck = null;
      duckDue = DUCK_GAP[0] + Math.random() * (DUCK_GAP[1] - DUCK_GAP[0]);
      return;
    }
    // Dimmed less by night.
    var L = 0.4 + 0.6 * woodLight;
    var here = onBrook(duck.d, duck.side, length), s = here.s;
    duck.nextDip -= seconds;
    if (!dipping && duck.nextDip <= 0 && here.fade >= 1) {
      dabble(s);
    }
    if (dipping) {
      duck.dip += seconds / 1.6;
      if (duck.dip >= 1) {
        duck.dip = -1;
      }
    }
    paint.save();
    paint.lineCap = 'round';
    paint.strokeStyle = rgb([235, 245, 250], L);
    // The ducklings, the last first: they're farther up.
    for (var i = duck.young.length - 1; i >= 0; i -= 1) {
      var chick = duck.young[i], at = onBrook(chick.d, chick.side, length);
      if (chick.d <= 0 || !at.fade) {
        continue;
      }
      // Two quacks.
      var open = chick.quacking ? Math.abs(Math.sin((0.5 - chick.quacking) * 4 * Math.PI)) : 0;
      drawBird(paint, at, 0.55 * at.s, 0, DUCK.young, open, at.fade, L);
    }
    drawSplash(paint, here, s, seconds, L);
    // Tipped forward while it dabbles, its head then under.
    if (here.fade) {
      drawBird(paint, here, s, dipping ? Math.sin(Math.PI * duck.dip) * 1.1 : 0, DUCK.adult, 0, here.fade, L);
    }
    paint.restore();
  }
  function newDuck() {
    var young = [], brood = Math.random() < DUCK_BROOD ? 2 + Math.floor(Math.random() * 3) : 0;
    for (var b = 0; b < brood; b += 1) {
      young.push({d: -0.5 * (b + 1), side: (Math.random() - 0.5) * 0.3, quackIn: 1 + 3 * Math.random(), quacking: 0});
    }
    return {d: 0, side: (Math.random() - 0.5) * 0.4, dip: -1, nextDip: 3 + 4 * Math.random(), rings: [], drops: [], young: young};
  }
  // Each duckling keeps half a step behind the one ahead.
  function followDuck(seconds) {
    duck.young.forEach(function (chick, i) {
      var ahead = i ? duck.young[i - 1].d : duck.d;
      chick.d += Math.max(0, Math.min(0.45, 2 * (ahead - 0.5 - chick.d))) * seconds;
      chick.quackIn -= seconds;
      if (chick.quackIn <= 0) {
        chick.quacking = 0.5;
        chick.quackIn = 1.5 + 3 * Math.random();
      }
      chick.quacking = Math.max(0, chick.quacking - seconds);
    });
  }
  function dabble(s) {
    duck.dip = 0;
    duck.nextDip = 4 + 6 * Math.random();
    duck.rings.push(0, -0.25);
    for (var n = 0; n < 7; n += 1) {
      duck.drops.push({x: (Math.random() - 0.5) * 0.6 * s, y: -0.1 * s, vx: (Math.random() - 0.5) * 2.2 * s, vy: -(1.4 + Math.random()) * s});
    }
  }
  // Where a bird d along the brook is on the screen; its size, the same all the way (half
  // a unit across the screen, not the brook's step there, which shrinks where it turns
  // toward us); which way it faces; how faded, in at the top and out at the bottom.
  function onBrook(d, side, length) {
    var at = alongBrook(Math.max(0, Math.min(length, d))), u = at.u - at.dv * side, v = at.v + at.du * side;
    var z = rise(u, v) + 0.02, here = iso(u, v, z), ahead = iso(u + at.du, v + at.dv, z);
    return {x: here.x, y: here.y, s: 0.5 * Math.SQRT2 * cam.z, f: ahead.x >= here.x ? 1 : -1,
      fade: Math.max(0, Math.min(1, d / 0.6, (length - d) / 0.6))};
  }
  function drawSplash(paint, here, s, seconds, L) {
    duck.rings = duck.rings.map(function (age) { return age + seconds; }).filter(function (age) { return age < 1.6; });
    duck.rings.forEach(function (age) {
      if (age < 0) {
        return;
      }
      var r = (0.4 + 1.1 * age) * s;
      paint.lineWidth = Math.max(1, 0.06 * s);
      paint.globalAlpha = 0.55 * (1 - age / 1.6) * here.fade;
      paint.beginPath();
      paint.ellipse(here.x, here.y, r, r * 0.38, 0, 0, 6.2832);
      paint.stroke();
    });
    paint.fillStyle = rgb([225, 240, 248], L);
    paint.globalAlpha = 0.85 * here.fade;
    paint.beginPath();
    duck.drops = duck.drops.filter(function (drop) {
      drop.vy += 6 * s * seconds;
      drop.x += drop.vx * seconds;
      drop.y += drop.vy * seconds;
      if (drop.y > 0) {
        return false;
      }
      var r = Math.max(1, 0.06 * s);
      paint.moveTo(here.x + drop.x + r, here.y + drop.y);
      paint.arc(here.x + drop.x, here.y + drop.y, r, 0, 6.2832);
      return true;
    });
    paint.fill();
  }
  // A duck or duckling, size s: its body and tail, and (unless tipped over) its neck, head
  // and beak, the beak opened (0 to 1) and the head lifted a little with it.
  function drawBird(paint, at, s, tip, colours, open, fade, L) {
    paint.save();
    paint.globalAlpha = fade;
    paint.translate(at.x, at.y - 0.12 * s);
    paint.scale(at.f, 1);
    paint.rotate(tip);
    paint.fillStyle = rgb(colours.body, L);
    paint.beginPath();
    paint.ellipse(0, 0, 0.5 * s, 0.2 * s, 0, 0, 6.2832);
    // The tail.
    paint.moveTo(-0.38 * s, -0.08 * s);
    paint.lineTo(-0.66 * s, -0.2 * s);
    paint.lineTo(-0.42 * s, 0.08 * s);
    paint.fill();
    if (tip < 0.6) {
      var lift = -0.12 * s * open;
      paint.fillStyle = rgb(colours.head, L);
      paint.beginPath();
      paint.ellipse(0.3 * s, -0.2 * s + lift / 2, 0.09 * s, 0.16 * s, 0.3, 0, 6.2832);
      paint.moveTo(0.53 * s, -0.36 * s + lift);
      paint.arc(0.38 * s, -0.36 * s + lift, 0.15 * s, 0, 6.2832);
      paint.fill();
      var gape = 0.16 * s * open;
      paint.fillStyle = rgb(colours.beak, L);
      paint.beginPath();
      // The upper bill, then the lower.
      paint.moveTo(0.48 * s, -0.4 * s + lift);
      paint.lineTo(0.72 * s, -0.35 * s + lift - gape);
      paint.lineTo(0.49 * s, -0.34 * s + lift);
      paint.moveTo(0.49 * s, -0.34 * s + lift);
      paint.lineTo(0.7 * s, -0.31 * s + lift + gape);
      paint.lineTo(0.48 * s, -0.29 * s + lift);
      paint.fill();
    }
    paint.restore();
  }

  // ------------------------------------------------------------- the scene --
  // Fits itself to the screen; with the sky, its light, mist and sunbeams and its ground
  // painted; each frame the trees, then the air and sunbeams. No traffic: the trees are it.
  var forestScene = {
    turn: WOOD.turn,
    // The wood fills the screen, still.
    fit: function () {
      var spread = woodBox();
      flow.unit = Math.min(flow.width * 0.96 / (spread.right - spread.left), flow.height * 0.78 / (spread.bottom - spread.top));
      flow.origin = {x: flow.width / 2 - flow.unit * (spread.left + spread.right) / 2,
        y: flow.height * 0.57 - flow.unit * (spread.top + spread.bottom) / 2};
      aim(WOOD.turn, 1, WOOD_MIDDLE);
      // Where they lay was on the old screen.
      litter = [];
      landEdge = [];
      // Neither drawn here: the names face out from the middle.
      flow.hub = {x: flow.width / 2, y: flow.height / 2};
      flow.net = {x: flow.width / 2, y: 0};
      skyCanvas.width = flow.width;
      skyCanvas.height = flow.height;
      sky();
    },
    sky: function (paint, hour, warm) {
      // Mist in the valley from first light until a couple of hours after sunrise, or in
      // fog; sunbeams while the sun is low, or through fog or broken cloud.
      dawnMist = Math.max(bump(hour, flow.sun[0] - 0.5, flow.sun[1], flow.sun[1] + 2.5), flow.precip.fog ? 0.7 : 0);
      shafting = (1 - flow.starry) * Math.max(warm, flow.precip.fog ? 0.8 : 0, flow.overcast > 0.3 && flow.overcast < 0.85 ? 0.4 : 0);
      woodLight = (1 - 0.5 * flow.starry) * (1 - 0.15 * flow.overcast);
      paintWood(paint);
    },
    over: function (time, seconds) {
      drawWood(ctx, time, seconds);
      if (sharp) {
        var air = woodAir();
        atmosphere(ctx, air[0], air[1]);
        drawShafts(ctx, time);
      }
    },
  };
  return forestScene;
};
