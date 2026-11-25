// curfew's screensaver: Neighbourhood. A town seen at an angle from above: streets laid
// out unevenly, a house for each device on a lot beside one (a device's lot comes from
// its MAC, so it stays put), homehub's tower in its grounds, the internet's across a
// winding river and a bridge. A house is green while its device is about and red while
// it's cut off. The data drives the streets, keeping right. The camera sways slowly and
// leans in on a house that turns very busy. Each frame draws the ground, the traffic, then
// the buildings over it, on the one canvas over a sky painted once a minute: few layers,
// which is what the TV's frames cost. Made by flowView (flow.js) with what scenes share.
var flowScenes = window.flowScenes || (window.flowScenes = {});

flowScenes.town = function (flow) {
  var GLOW = flow.GLOW, TAIL = flow.TAIL, aim = flow.aim, atmosphere = flow.atmosphere,
    busySeen = flow.busySeen, cam = flow.cam, channels = flow.channels, ctx = flow.ctx,
    density = flow.density, devices = flow.devices, dot = flow.dot, glaring = flow.glaring, hash = flow.hash,
    iso = flow.iso, lit3 = flow.lit3, palette = flow.palette, project = flow.project, rgb = flow.rgb,
    rounded = flow.rounded, shadowWay = flow.shadowWay, sharp = flow.sharp, sky = flow.sky,
    skyCanvas = flow.skyCanvas, smoothstep = flow.smoothstep, trailPiece = flow.trailPiece, wan = flow.wan,
    whiten = flow.whiten;
  // Places are in cells. DRIVE: cells a second at full speed.
  var LANE = 0.09, DRIVE = 2.8;
  var ROAD = 0.36, HOUSE = 0.46, BEND = 1.1, WIDE = 18, DEEP = 14;
  // The streets, each a line through crossings a whole number of cells apart.
  var ROADS = [
    [[1, 8], [1, 0], [15, 0], [15, 5]],
    [[9, -6], [9, 13]],
    [[1, 4], [5, 4], [5, 9], [9, 9]],
    [[9, 5], [17, 5], [17, 11], [12, 11], [12, 5]],
    [[2, 13], [2, 11], [9, 11]],
    [[9, 13], [16, 13], [16, 11]],
    [[6, 0], [6, 2]],
    [[12, 0], [12, 2], [13, 2]],
  ];
  var HOMEHUB = {u: 10.5, v: 8, size: 1.5, height: 2.6}, DOOR = {u: 9, v: 8};
  // homehub's grounds: no houses.
  var GROUNDS = {u0: 9, v0: 6, u1: 12, v1: 11};
  // The internet: a city across the river, its tallest tower where the bridge arrives.
  var INTERNET = {u: 9, v: -7.4, size: 1.8, height: 5.6};
  var SKYLINE = [
    {u: 6.6, v: -6.8, size: 1.4, height: 3.2}, {u: 11.4, v: -6.6, size: 1.5, height: 2.4},
    {u: 13.4, v: -6.4, size: 1.2, height: 3.6}, {u: 4.6, v: -6.6, size: 1.2, height: 1.8},
    {u: 7.4, v: -9.2, size: 1.6, height: 4.4}, {u: 10.6, v: -9.4, size: 1.4, height: 3.8},
    {u: 12.8, v: -8.8, size: 1.3, height: 2.8}, {u: 5.2, v: -9, size: 1.3, height: 2.6},
    {u: 9, v: -10.4, size: 1.2, height: 3}, {u: 15.2, v: -7.6, size: 1.1, height: 1.6},
    {u: 3.2, v: -8.4, size: 1, height: 1.4}, {u: 14.4, v: -10, size: 1.2, height: 2.2},
  ];
  var LAND = {u0: -1.2, v0: -11.4, u1: 18.8, v1: 14.6};
  var RIVER = [{u: -3, v: -2.4}, {u: 5, v: -0.9}, {u: 12, v: -5.4}, {u: 21, v: -2.2}];
  // The camera swings SWAY radians either way (some 35 degrees, never so far that the
  // faces seen change) over SWING ms. A device turning BUSY (bits a second) draws it in,
  // NEAR times nearer, for HOLD ms; the same one again only once it has quietened and
  // AGAIN ms have passed.
  var SWAY = 0.6, SWING = 240000, BUSY = 25e6, NEAR = 1.6, HOLD = 20000, AGAIN = 600000;
  var MIDDLE = {u: (LAND.u0 + LAND.u1) / 2, v: (LAND.v0 + LAND.v1) / 2}, townDirty = true;
  // Straight on, the points between that don't turn are dropped.
  function corners(points) {
    return points.filter(function (b, i) {
      var a = points[i - 1], c = points[i + 1];
      if (!a || !c) {
        return true;
      }
      return (b.u - a.u) * (c.v - b.v) !== (b.v - a.v) * (c.u - b.u);
    });
  }
  function cell(pair) {
    return {u: pair[0], v: pair[1]};
  }
  var streets = ROADS.map(function (road) { return rounded(road.map(cell), BEND); });
  // Streetlights: one every two cells along each street at its right-hand kerb, none within
  // a cell of another, none on the bridge or over the river.
  var LAMPS = [];
  ROADS.forEach(function (road) {
    for (var i = 1; i < road.length; i += 1) {
      var a = cell(road[i - 1]), b = cell(road[i]), long = Math.hypot(b.u - a.u, b.v - a.v);
      var side = {u: -(b.v - a.v) / long * 0.27, v: (b.u - a.u) / long * 0.27};
      for (var s = 1; s < long; s += 2) {
        var lamp = {u: a.u + (b.u - a.u) * s / long + side.u, v: a.v + (b.v - a.v) * s / long + side.v};
        var crowded = LAMPS.some(function (other) { return Math.hypot(other.u - lamp.u, other.v - lamp.v) < 1; });
        if (lamp.v > 0 && !crowded) {
          LAMPS.push(lamp);
        }
      }
    }
  });
  function softSprite(stops) {
    var sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    var paint = sprite.getContext('2d'), shade = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(function (stop) { shade.addColorStop(stop[0], stop[1]); });
    paint.fillStyle = shade;
    paint.fillRect(0, 0, 64, 64);
    return sprite;
  }
  // A lamp's pool of light on the ground, drawn in cells so it lies flat.
  var pool = softSprite([[0, 'rgba(255, 196, 120, 0.9)'], [0.4, 'rgba(255, 170, 90, 0.35)'], [1, 'rgba(255, 150, 70, 0)']]);
  // How far a place is from the nearest street, as drawn.
  function offRoad(p) {
    var best = Infinity;
    streets.forEach(function (points) {
      for (var i = 1; i < points.length; i += 1) {
        var a = points[i - 1], b = points[i], du = b.u - a.u, dv = b.v - a.v;
        var f = Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / (du * du + dv * dv || 1)));
        best = Math.min(best, Math.hypot(p.u - a.u - du * f, p.v - a.v - dv * f));
      }
    });
    return best;
  }

  // ------------------------------------------------------- the street map --
  // Each crossing's neighbours a cell along, and the way to each from homehub's door, by
  // the fewest cells.
  var link = {}, cameFrom = {}, hops = {};
  function key(u, v) {
    return u + ',' + v;
  }
  function join(a, b) {
    (link[a] = link[a] || []).push(b);
    (link[b] = link[b] || []).push(a);
  }
  ROADS.forEach(function (road) {
    for (var i = 1; i < road.length; i += 1) {
      var du = Math.sign(road[i][0] - road[i - 1][0]), dv = Math.sign(road[i][1] - road[i - 1][1]);
      for (var u = road[i - 1][0], v = road[i - 1][1]; u !== road[i][0] || v !== road[i][1]; u += du, v += dv) {
        join(key(u, v), key(u + du, v + dv));
      }
    }
  });
  (function fromTheDoor() {
    var queue = [key(DOOR.u, DOOR.v)];
    cameFrom[queue[0]] = null;
    hops[queue[0]] = 0;
    for (var next = 0; next < queue.length; next += 1) {
      var here = queue[next];
      (link[here] || []).forEach(function (there) {
        if (!(there in hops)) {
          cameFrom[there] = here;
          hops[there] = hops[here] + 1;
          queue.push(there);
        }
      });
    }
  })();
  function wayTo(at) {
    var way = [];
    for (; at !== null; at = cameFrom[at]) {
      way.unshift(cell(at.split(',').map(Number)));
    }
    return way;
  }
  // The lots: every cell of the grid beside a street (but in homehub's grounds, or where
  // a bend cuts the corner), each with the end of its kerb nearer the door.
  var lots = [];
  for (var i = 0; i < WIDE; i += 1) {
    for (var j = 0; j < DEEP; j += 1) {
      var lot = lotAt(i, j);
      if (lot) {
        lots.push(lot);
      }
    }
  }
  function lotAt(i, j) {
    var middle = {u: i + 0.5, v: j + 0.5};
    if (i >= GROUNDS.u0 && i < GROUNDS.u1 && j >= GROUNDS.v0 && j < GROUNDS.v1) {
      return null;
    }
    if (offRoad(middle) < 0.45) {
      return null;
    }
    var kerbs = [[i, j, i + 1, j], [i, j + 1, i + 1, j + 1], [i, j, i, j + 1], [i + 1, j, i + 1, j + 1]];
    var best = null;
    kerbs.forEach(function (kerb) {
      var a = key(kerb[0], kerb[1]), b = key(kerb[2], kerb[3]);
      var mid = {u: (kerb[0] + kerb[2]) / 2, v: (kerb[1] + kerb[3]) / 2};
      if (!link[a] || link[a].indexOf(b) < 0 || !(a in hops) || offRoad(mid) > 0.05) {
        return;
      }
      var end = hops[a] <= hops[b] ? a : b;
      if (!best || hops[end] < hops[best.end]) {
        best = {u: middle.u, v: middle.v, end: end, kerb: mid};
      }
    });
    return best;
  }
  // A route: points along the roads, each with the length run so far.
  function measured(points) {
    var total = 0;
    points.forEach(function (point, index) {
      if (index) {
        total += Math.hypot(point.u - points[index - 1].u, point.v - points[index - 1].v);
      }
      point.at = total;
    });
    return {points: points, length: total};
  }
  // Keeping right: each point moved to the right of the way it's driven.
  function keepRight(points) {
    return measured(points.map(function (point, index) {
      var a = points[Math.max(0, index - 1)], b = points[Math.min(points.length - 1, index + 1)];
      var du = b.u - a.u, dv = b.v - a.v, long = Math.hypot(du, dv) || 1;
      return {u: point.u - dv / long * LANE, v: point.v + du / long * LANE};
    }));
  }
  // Where a route is after s cells of it.
  function along(route, s) {
    var points = route.points;
    for (var i = 1; i < points.length; i += 1) {
      if (points[i].at >= s) {
        var a = points[i - 1], b = points[i], span = b.at - a.at || 1, f = (s - a.at) / span;
        return {u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * f};
      }
    }
    var end = points[points.length - 1];
    return {u: end.u, v: end.v, z: end.z || 0};
  }
  // From homehub's door to a house, by the streets: to the kerb, up the drive.
  function homeward(lot) {
    return rounded(corners(wayTo(lot.end).concat([lot.kerb, {u: lot.u, v: lot.v}])), BEND);
  }
  var inbound = [{u: INTERNET.u, v: INTERNET.v + INTERNET.size / 2}, DOOR];
  var wanDown = keepRight(inbound), wanUp = keepRight(inbound.slice().reverse());
  // Sharp: what each route leaves and enters (a device for its house, homehub or the
  // internet), and how much of it is inside them. A house's drive ends at its middle, so a
  // car's last INSIDE cells of it are behind its wall, unlit, so its light doesn't show
  // round the house as if it went under it; the house lights up as it goes in.
  var INSIDE = HOUSE / 2 + 0.02;
  function ends(route, from, outOf, to, into) {
    route.from = from;
    route.outOf = outOf;
    route.to = to;
    route.into = into;
  }
  (function settleHomes() {
    var taken = {};
    devices.slice().sort(function (a, b) { return hash(a.mac + 'lot') - hash(b.mac + 'lot'); })
      .slice(0, lots.length).forEach(function (device) {
        var at = Math.floor(hash(device.mac + 'home') * lots.length);
        while (taken[at]) {
          at = (at + 1) % lots.length;
        }
        taken[at] = true;
        device.lot = lots[at];
        device.route = keepRight(homeward(lots[at]));
        device.routeBack = keepRight(homeward(lots[at]).reverse());
        ends(device.route, HOMEHUB, 0, device, INSIDE);
        ends(device.routeBack, device, INSIDE, HOMEHUB, 0);
      });
    ends(wanDown, INTERNET, 0, HOMEHUB, 0);
    ends(wanUp, HOMEHUB, 0, INTERNET, 0);
  })();
  // A house's height: its use today, a bungalow to a townhouse.
  function storeys(device) {
    return 0.32 + Math.min(0.84, 0.24 * Math.log10(1 + (device.today || 0) / 1e6));
  }
  function quad(paint, corners, fill) {
    paint.fillStyle = fill;
    paint.beginPath();
    corners.forEach(function (corner, index) {
      if (corner.x !== undefined) {
        paint[index ? 'lineTo' : 'moveTo'](corner.x, corner.y);
      }
    });
    paint.closePath();
    paint.fill();
  }

  // ------------------------------------------------------------ the boxes --
  // A building: a box, its top and the two faces we see (facing +v and +u), each light at
  // the top and darker toward the ground, the one turned more to the left (the light) the
  // lighter. Its outline is filled first, so the seams where faces meet show the box, not
  // what's behind it. On the hills, its roof stands at its height over the ground at its
  // middle and its walls run down to the ground at each corner; one standing on something
  // (a chimney, a tower's plant) has its foot's level, `b.level`.
  function box(paint, b, light, strength) {
    var half = b.size / 2, u0 = b.u - half, u1 = b.u + half, v0 = b.v - half, v1 = b.v + half;
    var level = b.level, z = b.height + (level !== undefined ? level : terrain() ? hill(b.u, b.v) : 0);
    function foot(u, v) {
      return level !== undefined ? project(u, v, level) : iso(u, v);
    }
    var near = foot(u1, v1), left = foot(u0, v1), right = foot(u1, v0);
    var high = project(u1, v1, z), leftHigh = project(u0, v1, z), rightHigh = project(u1, v0, z), back = project(u0, v0, z);
    var k = strength || 1;
    quad(paint, [left, near, right, rightHigh, back, leftHigh], rgb(b.shade, 0.45 * k));
    [[left, near, high, leftHigh, light[0]], [right, near, high, rightHigh, light[1]]].forEach(function (face) {
      var fade = paint.createLinearGradient(0, high.y, 0, near.y);
      fade.addColorStop(0, rgb(b.shade, face[4] * 1.2 * k));
      fade.addColorStop(1, rgb(b.shade, face[4] * 0.55 * k));
      quad(paint, face, fade);
    });
    var roof = b.shade.map(function (c) { return c * k; });
    quad(paint, [back, rightHigh, high, leftHigh], rgb(whiten(roof, 0.9 * flow.snowCover), 1 - 0.4 * flow.starry * flow.snowCover));
  }
  // Boxes in the order to draw them, farthest first: a box goes once every box it overlaps
  // on the screen from behind (wholly behind it on either axis) has gone. A sort can't do
  // it: with boxes of different sizes, "behind" doesn't chain. Overlap anywhere in the
  // camera's sway counts, so one order serves the whole sway.
  var TURNS = [-SWAY, -SWAY / 2, 0, SWAY / 2, SWAY].map(function (turn) {
    var cos = Math.cos(turn), sin = Math.sin(turn);
    return {a: cos - sin, c: -(cos + sin), reach: Math.abs(cos - sin) + Math.abs(cos + sin)};
  });
  function backToFront(boxes) {
    var across = boxes.map(function (b) { return TURNS.map(function (t) { return t.a * b.u + t.c * b.v; }); });
    var behind = boxes.map(function (a, i) {
      var ha = a.size / 2, found = [];
      for (var j = 0; j < boxes.length; j += 1) {
        var b = boxes[j], hb = b.size / 2;
        if (j === i || !(b.u + hb <= a.u - ha || b.v + hb <= a.v - ha)) {
          continue;
        }
        for (var k = 0; k < TURNS.length; k += 1) {
          if (Math.abs(across[i][k] - across[j][k]) < (ha + hb) * TURNS[k].reach) {
            found.push(b);
            break;
          }
        }
      }
      return found;
    });
    var order = [], done = new Set();
    while (order.length < boxes.length) {
      var ready = boxes.filter(function (box, index) {
        return !done.has(box) && behind[index].every(function (b) { return done.has(b); });
      });
      // Never happens, but a cycle mustn't hang the page.
      if (!ready.length) {
        ready = boxes.filter(function (box) { return !done.has(box); });
      }
      ready.forEach(function (box) {
        done.add(box);
        order.push(box);
      });
    }
    return order;
  }
  // Draw in the cells' own terms on the ground, the screen turned to match; `z` up, for
  // something lying on a hill.
  function onGround(paint, z) {
    paint.setTransform(cam.a, cam.b, cam.c, cam.d, flow.origin.x - cam.a * cam.pivot.u - cam.c * cam.pivot.v,
      flow.origin.y - cam.b * cam.pivot.u - cam.d * cam.pivot.v - (z || 0) * cam.z);
  }
  function trace(paint, points) {
    paint.beginPath();
    points.forEach(function (point, index) { paint[index ? 'lineTo' : 'moveTo'](point.u, point.v); });
  }
  function traceScreen(paint, points) {
    paint.beginPath();
    points.forEach(function (at, index) { paint[index ? 'lineTo' : 'moveTo'](at.x, at.y); });
  }
  var GREY = {house: '#5c5c5c', tower: '#8c8c8c', city: '#6a6a6a', far: '#505050'};

  // ------------------------------------------------------------- the land --
  // Its depth: its edge all the way round, corners rounded, each piece earth down to
  // LAND_DEPTH below; only the pieces facing us drawn, each lit by which way it faces.
  var LAND_DEPTH = 0.8, RIVER_WIDE = 2.6, RIVER_WATER = 2.2;
  function onRiver(t) {
    var w = 1 - t, R = RIVER;
    return {u: w * w * w * R[0].u + 3 * w * w * t * R[1].u + 3 * w * t * t * R[2].u + t * t * t * R[3].u,
      v: w * w * w * R[0].v + 3 * w * w * t * R[1].v + 3 * w * t * t * R[2].v + t * t * t * R[3].v};
  }
  // The river's line, its curve as drawGround strokes it.
  var riverLine = [];
  for (var bend = 0; bend <= 240; bend += 1) {
    riverLine.push(onRiver(bend / 240));
  }
  // How far a place is from the river's middle.
  function riverWay(mu, mv) {
    var nearest = Infinity;
    for (var j = 1; j < riverLine.length; j += 1) {
      var r0 = riverLine[j - 1], r1 = riverLine[j], du = r1.u - r0.u, dv = r1.v - r0.v;
      var f = Math.max(0, Math.min(1, ((mu - r0.u) * du + (mv - r0.v) * dv) / (du * du + dv * dv || 1)));
      nearest = Math.min(nearest, Math.hypot(mu - r0.u - du * f, mv - r0.v - dv * f));
    }
    return nearest;
  }
  var skirt = (function () {
    var R = 2.5, edge = [], pieces = [];
    // A straight edge, in pieces of about one.
    function side(u0, v0, u1, v1) {
      var steps = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0)));
      for (var k = 0; k < steps; k += 1) {
        edge.push({u: u0 + (u1 - u0) * k / steps, v: v0 + (v1 - v0) * k / steps});
      }
    }
    // A quarter turn about its centre.
    function corner(cu, cv, from) {
      for (var k = 0; k < 6; k += 1) {
        var angle = (from + 90 * k / 6) * Math.PI / 180;
        edge.push({u: cu + R * Math.cos(angle), v: cv + R * Math.sin(angle)});
      }
    }
    side(LAND.u0 + R, LAND.v0, LAND.u1 - R, LAND.v0);
    corner(LAND.u1 - R, LAND.v0 + R, -90);
    side(LAND.u1, LAND.v0 + R, LAND.u1, LAND.v1 - R);
    corner(LAND.u1 - R, LAND.v1 - R, 0);
    side(LAND.u1 - R, LAND.v1, LAND.u0 + R, LAND.v1);
    corner(LAND.u0 + R, LAND.v1 - R, 90);
    side(LAND.u0, LAND.v1 - R, LAND.u0, LAND.v0 + R);
    corner(LAND.u0 + R, LAND.v0 + R, 180);
    edge.forEach(function (a, index) {
      var b = edge[(index + 1) % edge.length], long = Math.hypot(b.u - a.u, b.v - a.v) || 1;
      // Its normal, outward.
      pieces.push({a: a, b: b, nu: (b.v - a.v) / long, nv: -(b.u - a.u) / long});
    });
    return pieces;
  })();
  // The hills (sharp only: a computer can draw the ground as a mesh every frame; the TV's
  // town is flat, its ground one shape through one transform). Rolling and low, down to the
  // river's level along its valley so the river, its banks and the bridge's ends lie flat,
  // and never steeper than HILL_STEEP, under the camera's 17.5 degrees: no slope ever hides
  // ground behind it, so what's painted over the ground is always seen. Kept as heights
  // every HILL_STEP cells, read between them.
  var HILL_STEP = 0.25, HILL_STEEP = 0.27, hillGrid = null;
  function terrain() {
    return flow.town && sharp;
  }
  function buildHills() {
    var cols = Math.ceil((LAND.u1 - LAND.u0 + 2) / HILL_STEP) + 1, rows = Math.ceil((LAND.v1 - LAND.v0 + 2) / HILL_STEP) + 1;
    var heights = new Float32Array(cols * rows), steepest = 0;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var u = LAND.u0 - 1 + c * HILL_STEP, v = LAND.v0 - 1 + r * HILL_STEP;
        // Long, wide swells: under HILL_STEEP they can rise highest.
        var rolling = 0.6 * Math.sin(u * 0.24 + 0.8) * Math.sin(v * 0.26 + 1.9) + 0.35 * Math.sin(u * 0.13 - v * 0.17 + 2.6) + 0.3;
        var valley = smoothstep((riverWay(u, v) - RIVER_WIDE / 2 - 0.4) / 4);
        heights[r * cols + c] = rolling * valley;
      }
    }
    for (r = 1; r < rows; r += 1) {
      for (c = 1; c < cols; c += 1) {
        var h = heights[r * cols + c];
        steepest = Math.max(steepest, Math.hypot(h - heights[r * cols + c - 1], h - heights[(r - 1) * cols + c]) / HILL_STEP);
      }
    }
    var scale = steepest > HILL_STEEP ? HILL_STEEP / steepest : 1;
    for (var k = 0; k < heights.length; k += 1) {
      heights[k] *= scale;
    }
    hillGrid = {cols: cols, rows: rows, heights: heights};
  }
  function hill(u, v) {
    if (!hillGrid) {
      buildHills();
    }
    var g = hillGrid, x = (u - LAND.u0 + 1) / HILL_STEP, y = (v - LAND.v0 + 1) / HILL_STEP;
    var c = Math.floor(x), r = Math.floor(y);
    if (c < 0 || r < 0 || c >= g.cols - 1 || r >= g.rows - 1) {
      return 0;
    }
    var fx = x - c, fy = y - r, at = r * g.cols + c, H = g.heights;
    return (H[at] * (1 - fx) + H[at + 1] * fx) * (1 - fy) + (H[at + g.cols] * (1 - fx) + H[at + g.cols + 1] * fx) * fy;
  }
  function drawSkirt(paint) {
    var tones = {};
    skirt.forEach(function (piece) {
      var nx = cam.a * piece.nu + cam.c * piece.nv, ny = cam.b * piece.nu + cam.d * piece.nv;
      if (ny <= 0) {
        return;
      }
      // In steps, so pieces batch into few fills.
      var light = Math.round((0.75 - 0.2 * nx / Math.hypot(nx, ny)) * 20) / 20;
      (tones[light] = tones[light] || []).push([iso(piece.a.u, piece.a.v), iso(piece.b.u, piece.b.v),
        project(piece.b.u, piece.b.v, -LAND_DEPTH), project(piece.a.u, piece.a.v, -LAND_DEPTH)]);
    });
    paint.lineWidth = 1;
    paint.lineJoin = 'round';
    Object.keys(tones).forEach(function (light) {
      paint.fillStyle = paint.strokeStyle = rgb([104, 74, 50], Number(light) * (1 - 0.35 * flow.starry));
      paint.beginPath();
      tones[light].forEach(function (piece) {
        paint.moveTo(piece[0].x, piece[0].y);
        paint.lineTo(piece[1].x, piece[1].y);
        paint.lineTo(piece[2].x, piece[2].y);
        paint.lineTo(piece[3].x, piece[3].y);
        paint.closePath();
      });
      // Stroked too, so no seams show between pieces.
      paint.fill();
      paint.stroke();
    });
  }
  // On the hills, the streets and the bridge are ribbons over the ground: each one's
  // outline, its kerbs a road's width apart and its ends rounded, every quarter cell or
  // closer, so it follows the hills.
  var ribbons = [];
  function finely(points) {
    var fine = [];
    for (var i = 1; i < points.length; i += 1) {
      var a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / 0.25));
      for (var k = i > 1 ? 1 : 0; k <= steps; k += 1) {
        fine.push({u: a.u + (b.u - a.u) * k / steps, v: a.v + (b.v - a.v) * k / steps});
      }
    }
    return fine;
  }
  function ribbon(points, wide, fill, round) {
    var fine = finely(points);
    var left = [], right = [], half = wide / 2;
    fine.forEach(function (point, index) {
      var a = fine[Math.max(0, index - 1)], b = fine[Math.min(fine.length - 1, index + 1)];
      var du = b.u - a.u, dv = b.v - a.v, long = Math.hypot(du, dv) || 1;
      left.push({u: point.u - dv / long * half, v: point.v + du / long * half});
      right.push({u: point.u + dv / long * half, v: point.v - du / long * half});
    });
    // Half round, about a point, from one kerb to the other.
    function cap(point, from, to) {
      var out = [], a0 = Math.atan2(from.v - point.v, from.u - point.u), a1 = Math.atan2(to.v - point.v, to.u - point.u);
      if (a1 > a0) {
        a1 -= 2 * Math.PI;
      }
      for (var k = 1; k < 6; k += 1) {
        var angle = a0 + (a1 - a0) * k / 6;
        out.push({u: point.u + half * Math.cos(angle), v: point.v + half * Math.sin(angle)});
      }
      return out;
    }
    var end = fine.length - 1, outline = left.slice();
    if (round) {
      outline = outline.concat(cap(fine[end], left[end], right[end]));
    }
    outline = outline.concat(right.slice().reverse());
    if (round) {
      outline = outline.concat(cap(fine[0], right[0], left[0]));
    }
    ribbons.push({outline: outline, fill: fill});
  }
  // Each street on its pavement, a dashed line down its middle (LANES); then the bridge.
  var BRIDGE = [{u: 9, v: -5}, {u: 9, v: -0.6}];
  streets.forEach(function (points) { ribbon(points, ROAD + 0.14, '#353535', true); });
  streets.forEach(function (points) { ribbon(points, ROAD, '#272727', true); });
  var LANES = streets.map(finely).concat([finely(BRIDGE)]);
  ribbon(BRIDGE, ROAD + 0.16, '#333', false);
  ribbon(BRIDGE, ROAD, '#2b2b2b', false);
  // The hills' ground: the land in its own colour, then a mesh every HILL_MESH cells over
  // it, each triangle lit by its slope (from the left, as the buildings), shade by shade:
  // few fills, and none for the level ones, already the land's colour. Filled, not
  // stroked: the land beneath hides the seams, and a stroke or a finer mesh cost most of a
  // frame. FLAT_LIGHT is lit3's light on level ground; a slope is lighter or darker by
  // HILL_SHADE times its difference from it, as a share of HILL_TONE added or taken away
  // (the land is nearly black, so scaling it wouldn't show).
  var HILL_MESH = 1, FLAT_LIGHT = 0.6 + 0.55 * 0.84, HILL_SHADE = 7, HILL_TONE = 46, hillMesh = null;
  function buildHillMesh() {
    var cols = Math.round((LAND.u1 - LAND.u0) / HILL_MESH), rows = Math.round((LAND.v1 - LAND.v0) / HILL_MESH), at = [];
    for (var r = 0; r <= rows; r += 1) {
      for (var c = 0; c <= cols; c += 1) {
        var u = LAND.u0 + (LAND.u1 - LAND.u0) * c / cols, v = LAND.v0 + (LAND.v1 - LAND.v0) * r / rows;
        at.push({u: u, v: v, z: hill(u, v)});
      }
    }
    hillMesh = {points: at, shades: {}};
    for (r = 0; r < rows; r += 1) {
      for (c = 0; c < cols; c += 1) {
        var p = r * (cols + 1) + c, corner = [p, p + 1, p + cols + 2, p + cols + 1];
        [[0, 1, 2], [0, 2, 3]].forEach(function (three) {
          var tri = [corner[three[0]], corner[three[1]], corner[three[2]]];
          var shade = Math.round((lit3(at[tri[0]], at[tri[1]], at[tri[2]]) - FLAT_LIGHT) * HILL_SHADE * 20) / 20;
          if (shade) {
            (hillMesh.shades[shade] = hillMesh.shades[shade] || []).push(tri);
          }
        });
      }
    }
  }
  function drawHills(paint, land, landLight) {
    if (!hillMesh) {
      buildHillMesh();
    }
    paint.save();
    landOutline(paint);
    paint.fillStyle = rgb(land, landLight);
    paint.fill();
    paint.clip();
    var flat = hillMesh.points.map(function (point) { return project(point.u, point.v, point.z); });
    Object.keys(hillMesh.shades).forEach(function (shade) {
      var tone = HILL_TONE * Number(shade);
      paint.fillStyle = rgb(land.map(function (c) { return Math.max(0, c + tone); }), landLight);
      paint.beginPath();
      hillMesh.shades[shade].forEach(function (tri) {
        var a = flat[tri[0]], b = flat[tri[1]], c = flat[tri[2]];
        paint.moveTo(a.x, a.y);
        paint.lineTo(b.x, b.y);
        paint.lineTo(c.x, c.y);
        paint.closePath();
      });
      paint.fill();
    });
    paint.restore();
  }
  // The convex hull of points ({x, y}), anticlockwise.
  function convex(points) {
    points = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    function turn(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }
    var lower = [], upper = [];
    points.forEach(function (p) {
      while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    });
    for (var i = points.length - 1; i >= 0; i -= 1) {
      while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
        upper.pop();
      }
      upper.push(points[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }
  // The land's top edge on the screen, as the current path.
  function landOutline(paint) {
    traceScreen(paint, skirt.map(function (piece) { return iso(piece.a.u, piece.a.v); }));
    paint.closePath();
  }
  // Sharp: the buildings' shadows on the land, away from the sun or moon, longer the lower
  // it is: each footprint swept along the way, softened by a second a little wider and
  // fainter.
  function drawShadows(paint) {
    if (flow.sunlight.strength < 0.02) {
      return;
    }
    var way = shadowWay();
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.fillStyle = '#000000';
    landOutline(paint);
    paint.clip();
    [0.08, 0].forEach(function (soft) {
      paint.globalAlpha = 0.32 * flow.sunlight.strength * (soft ? 0.6 : 1);
      paint.beginPath();
      standing.forEach(function (b) {
        // A house's roof makes it a little taller.
        var half = b.size / 2 + soft, tall = b.base + (b.device ? 0.16 : 0), points = [];
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
          var u = b.u + c[0] * half, v = b.v + c[1] * half;
          points.push({x: u, y: v}, {x: u + way.u * tall, y: v + way.v * tall});
        });
        convex(points).forEach(function (point, index) {
          var at = iso(point.x, point.y);
          paint[index ? 'lineTo' : 'moveTo'](at.x, at.y);
        });
        paint.closePath();
      });
      paint.fill();
    });
    paint.restore();
  }

  // ------------------------------------------------------------ the river --
  // Sharp: the river reflects. Its water takes a little of the sky's colour (`waterShade`);
  // the city stands upside down in it, dark and wavering, its lit windows streaks of
  // light; glints drift down it, brighter by moonlight and low sun.
  var waterShade = '#17202a', GLINTS = [];
  for (var sparkle = 0; sparkle < 90; sparkle += 1) {
    GLINTS.push({f: Math.random(), side: (Math.random() - 0.5) * 0.85 * RIVER_WATER, phase: Math.random() * 6.3,
      long: 0.08 + 0.16 * Math.random()});
  }
  // The water's outline, in cells.
  var riverWater = new Path2D();
  (function () {
    var left = [], right = [], half = RIVER_WATER / 2;
    riverLine.forEach(function (point, index) {
      var a = riverLine[Math.max(0, index - 1)], b = riverLine[Math.min(riverLine.length - 1, index + 1)];
      var du = b.u - a.u, dv = b.v - a.v, long = Math.hypot(du, dv) || 1;
      left.push({u: point.u - dv / long * half, v: point.v + du / long * half});
      right.push({u: point.u + dv / long * half, v: point.v - du / long * half});
    });
    left.concat(right.reverse()).forEach(function (point, index) { riverWater[index ? 'lineTo' : 'moveTo'](point.u, point.v); });
    riverWater.closePath();
  })();
  function drawReflections(paint, time) {
    var t = time / 1000;
    paint.save();
    onGround(paint);
    paint.clip(riverWater);
    paint.setTransform(1, 0, 0, 1, 0, 0);
    // The river's line runs on past the land.
    landOutline(paint);
    paint.clip();
    standing.forEach(function (b) { mirroredTower(paint, b, t); });
    var lit = Math.max(0, Math.min(1, (flow.starry - 0.3) / 0.4));
    if (lit && !flow.internetDown) {
      mirroredWindows(paint, t, lit);
    }
    drawGlints(paint, t);
    paint.restore();
  }
  // Upside down, mirrored in the river's level.
  function mirroredTower(paint, b, t) {
    if (b.device) {
      return;
    }
    var half = b.size / 2, level = terrain() ? hill(b.u, b.v) : 0, wave = Math.sin(t * 0.8 + b.u) * 0.6 * flow.dpr, points = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
      var u = b.u + c[0] * half, v = b.v + c[1] * half;
      points.push(project(u, v, -level), project(u, v, -level - b.base));
    });
    paint.globalAlpha = 0.4;
    paint.fillStyle = rgb(b.shade, 0.3);
    paint.beginPath();
    convex(points).forEach(function (point, index) { paint[index ? 'lineTo' : 'moveTo'](point.x + wave, point.y); });
    paint.closePath();
    paint.fill();
  }
  function mirroredWindows(paint, t, lit) {
    paint.globalCompositeOperation = 'lighter';
    paint.globalAlpha = 0.45 * lit;
    paint.fillStyle = '#ffd9a0';
    paint.beginPath();
    standing.forEach(function (b) {
      (b.panes || []).forEach(function (pane, index) {
        var at = project(pane.u, pane.v, -pane.z), wide = 0.09 * cam.z * (0.8 + 0.5 * Math.sin(t * 2.3 + index));
        paint.rect(at.x - wide / 2 + Math.sin(t * 1.7 + at.y * 0.05) * 1.5 * flow.dpr, at.y, wide, Math.max(1, 0.025 * cam.z));
      });
    });
    paint.fill();
    paint.globalCompositeOperation = 'source-over';
  }
  // Down the river, each glint brightening and fading in turn.
  function drawGlints(paint, t) {
    var moon = flow.moonlit * flow.starry * (1 - flow.overcast), day = 1 - flow.starry, length = riverLine.length - 1;
    var bright = 0.12 + 0.55 * moon + 0.25 * day * (1 - flow.overcast);
    paint.strokeStyle = flow.starry > 0.5 ? '#cfe0ff' : '#ffffff';
    paint.lineWidth = Math.max(1, 0.025 * cam.z);
    paint.lineCap = 'round';
    GLINTS.forEach(function (glint) {
      var f = (glint.f + 0.004 * t) % 1, shine = Math.pow(Math.sin(t * 1.1 + glint.phase), 4) * bright;
      if (shine < 0.03) {
        return;
      }
      var at = riverLine[Math.floor(f * length)], next = riverLine[Math.floor(f * length) + 1];
      var du = next.u - at.u, dv = next.v - at.v, long = Math.hypot(du, dv) || 1;
      var u = at.u - dv / long * glint.side, v = at.v + du / long * glint.side;
      var a = project(u, v, 0), b = project(u + du / long * glint.long, v + dv / long * glint.long, 0);
      paint.globalAlpha = shine;
      paint.beginPath();
      paint.moveTo(a.x, a.y);
      paint.lineTo(b.x, b.y);
      paint.stroke();
    });
  }

  // ------------------------------------------------------------ the ground --
  // Every frame, since the camera moves: land, river, streets, bridge, then the lights.
  function drawGround(paint, time, seconds) {
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = 'source-over';
    drawSkirt(paint);
    var land = whiten([22, 22, 22], 0.85 * flow.snowCover), landLight = 1 - 0.4 * flow.starry * flow.snowCover;
    if (terrain()) {
      drawHills(paint, land, landLight);
    }
    onGround(paint);
    paint.lineCap = paint.lineJoin = 'round';
    paint.fillStyle = rgb(land, landLight);
    landShape(paint);
    // On the hills, drawHills has filled it.
    if (!terrain()) {
      paint.fill();
    }
    paint.save();
    paint.clip();
    drawRiver(paint);
    paint.restore();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    if (sharp && !flow.frozen) {
      drawReflections(paint, time);
    }
    // The boats go under the bridge.
    drawBoats(paint, time, seconds);
    onGround(paint);
    if (terrain()) {
      drawRibbons(paint);
      if (!townScene.ultra) {
        drawShadows(paint);
      }
      onGround(paint);
    } else {
      drawFlatStreets(paint);
    }
    var lit = Math.max(0, Math.min(1, (flow.starry - 0.15) / 0.5));
    if (lit) {
      drawStreetLights(paint, lit);
    }
    paint.setTransform(1, 0, 0, 1, 0, 0);
    if (flow.internetDown) {
      drawClosedBridge(paint);
    }
  }
  // Its corners rounded, by arcTo rather than roundRect: the TVs' WebView may predate it.
  function landShape(paint) {
    paint.beginPath();
    paint.moveTo(LAND.u0 + 2.5, LAND.v0);
    [[LAND.u1, LAND.v0, LAND.u1, LAND.v1], [LAND.u1, LAND.v1, LAND.u0, LAND.v1],
      [LAND.u0, LAND.v1, LAND.u0, LAND.v0], [LAND.u0, LAND.v0, LAND.u1, LAND.v0]].forEach(function (c) {
      paint.arcTo(c[0], c[1], c[2], c[3], 2.5);
    });
  }
  // Winding through the land, within its clip: its banks, then its water.
  function drawRiver(paint) {
    paint.beginPath();
    paint.moveTo(RIVER[0].u, RIVER[0].v);
    paint.bezierCurveTo(RIVER[1].u, RIVER[1].v, RIVER[2].u, RIVER[2].v, RIVER[3].u, RIVER[3].v);
    paint.strokeStyle = flow.frozen ? '#4b5866' : '#1b2633';
    paint.lineWidth = RIVER_WIDE;
    paint.stroke();
    paint.strokeStyle = flow.frozen ? '#43505c' : sharp ? waterShade : '#17202a';
    paint.lineWidth = RIVER_WATER;
    paint.stroke();
  }
  // The streets and the bridge laid over the hills, and the lines down their middles.
  function drawRibbons(paint) {
    paint.setTransform(1, 0, 0, 1, 0, 0);
    ribbons.forEach(function (one) {
      paint.fillStyle = one.fill;
      traceScreen(paint, one.outline.map(function (point) { return iso(point.u, point.v); }));
      paint.closePath();
      paint.fill();
    });
    paint.globalAlpha = 0.45;
    paint.strokeStyle = '#77776a';
    paint.lineCap = 'butt';
    paint.lineWidth = Math.max(1, 0.012 * cam.z);
    paint.setLineDash([0.1 * cam.z, 0.14 * cam.z]);
    paint.beginPath();
    LANES.forEach(function (line) {
      line.forEach(function (point, index) {
        var at = iso(point.u, point.v);
        paint[index ? 'lineTo' : 'moveTo'](at.x, at.y);
      });
    });
    paint.stroke();
    paint.setLineDash([]);
    paint.globalAlpha = 1;
    paint.lineCap = 'round';
  }
  function drawFlatStreets(paint) {
    paint.strokeStyle = '#272727';
    paint.lineWidth = ROAD;
    streets.forEach(function (points) {
      trace(paint, points);
      paint.stroke();
    });
    paint.strokeStyle = '#333';
    paint.lineWidth = ROAD + 0.16;
    paint.lineCap = 'butt';
    trace(paint, BRIDGE);
    paint.stroke();
    paint.strokeStyle = '#2b2b2b';
    paint.lineWidth = ROAD;
    trace(paint, BRIDGE);
    paint.stroke();
  }
  // From dusk: warm pools on the ground (Ultra lights them itself), lit windows' light
  // before each lit face, then each lamp on its post with a halo.
  function drawStreetLights(paint, lit) {
    paint.globalCompositeOperation = 'lighter';
    paint.globalAlpha = 0.6 * lit;
    LAMPS.forEach(function (lamp) {
      if (townScene.ultra) {
        return;
      }
      // Lying on the hill at its foot.
      if (terrain()) {
        onGround(paint, hill(lamp.u, lamp.v));
      }
      paint.drawImage(pool, lamp.u - 0.75, lamp.v - 0.75, 1.5, 1.5);
    });
    if (sharp && !townScene.ultra) {
      windowLightOnGround(paint);
    }
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.globalCompositeOperation = 'source-over';
    paint.globalAlpha = 1;
    var posts = new Path2D(), heads = new Path2D(), r = Math.max(1, 0.045 * cam.z);
    LAMPS.forEach(function (lamp) {
      var foot = iso(lamp.u, lamp.v, 0), top = iso(lamp.u, lamp.v, 0.32);
      posts.moveTo(foot.x, foot.y);
      posts.lineTo(top.x, top.y);
      heads.moveTo(top.x + r, top.y);
      heads.arc(top.x, top.y, r, 0, 6.2832);
    });
    paint.strokeStyle = '#4a4a4a';
    paint.lineWidth = Math.max(1, 0.02 * cam.z);
    paint.stroke(posts);
    paint.globalAlpha = lit;
    paint.fillStyle = '#ffd59a';
    paint.fill(heads);
    if (glaring()) {
      glaring().globalAlpha = lit;
      glaring().fillStyle = '#ffd59a';
      glaring().fill(heads);
    }
    paint.globalCompositeOperation = 'lighter';
    paint.globalAlpha = 0.5 * lit;
    var halo = 0.2 * cam.z;
    LAMPS.forEach(function (lamp) {
      var top = iso(lamp.u, lamp.v, 0.32);
      paint.drawImage(pool, top.x - halo, top.y - halo, 2 * halo, 2 * halo);
    });
    paint.globalCompositeOperation = 'source-over';
    paint.globalAlpha = 1;
  }
  function windowLightOnGround(paint) {
    var awake = Math.max(0, Math.min(1, (flow.starry - 0.3) / 0.4)), now = Date.now();
    paint.globalAlpha = 0.3 * awake;
    standing.forEach(function (b) {
      if (!awake || !b.device || !b.device.online || now - (busySeen[b.device.mac] || 0) >= AWAKE) {
        return;
      }
      onGround(paint, hill(b.u, b.v));
      var out = b.size / 2 + 0.3;
      paint.drawImage(pool, b.u - 0.45, b.v + out - 0.45, 0.9, 0.9);
      paint.drawImage(pool, b.u + out - 0.45, b.v - 0.45, 0.9, 0.9);
    });
  }
  // No internet: the bridge closed, a barrier striped red and white at each end.
  function drawClosedBridge(paint) {
    paint.lineCap = 'butt';
    [-4.6, -1].forEach(function (v) {
      paint.strokeStyle = '#666';
      paint.lineWidth = Math.max(1, 0.05 * cam.z);
      paint.beginPath();
      [8.78, 9.22].forEach(function (u) {
        var foot = iso(u, v, 0), top = iso(u, v, 0.34);
        paint.moveTo(foot.x, foot.y);
        paint.lineTo(top.x, top.y);
      });
      paint.stroke();
      paint.lineWidth = Math.max(2, 0.11 * cam.z);
      for (var k = 0; k < 5; k += 1) {
        var a = iso(8.7 + 0.12 * k, v, 0.28), b = iso(8.7 + 0.12 * (k + 1), v, 0.28);
        paint.strokeStyle = k % 2 ? '#eeeeee' : palette.danger;
        paint.beginPath();
        paint.moveTo(a.x, a.y);
        paint.lineTo(b.x, b.y);
        paint.stroke();
      }
    });
    paint.lineCap = 'round';
  }

  // --------------------------------------------------------- the buildings --
  // Settled again when a house changes: each house's colour and resting height, the
  // towers, and the order to draw them in, which holds whatever their heights and turn.
  function settle() {
    townDirty = false;
    var house = {away: channels(GREY.house), on: channels(palette.ok), cut: channels(palette.danger)};
    var buildings = devices.filter(function (device) { return device.lot; }).map(function (device) {
      var state = !device.online ? 'away' : device.allowed ? 'on' : 'cut';
      return {u: device.lot.u, v: device.lot.v, size: HOUSE, base: storeys(device), shade: house[state], device: device};
    });
    // The city, dark with no internet.
    var dark = flow.internetDown ? 0.45 : 1;
    [HOMEHUB, INTERNET].forEach(function (tower) {
      buildings.push({u: tower.u, v: tower.v, size: tower.size, base: tower.height,
        shade: channels(GREY.tower).map(function (c) { return c * (tower === INTERNET ? dark : 1); }), wan: true, tower: tower});
    });
    SKYLINE.forEach(function (tower) {
      buildings.push({u: tower.u, v: tower.v, size: tower.size, base: tower.height,
        shade: channels(tower.height > 3 ? GREY.city : GREY.far).map(function (c) { return c * dark; })});
    });
    standing = backToFront(buildings);
  }
  // How strong a building's colour is. A house about and let through goes with its
  // traffic: a quiet one dim, a busy one brighter than plain, a burst brighter still,
  // eased so it doesn't flicker. The rest (away, cut off, the towers) as they are.
  function tone(b, seconds) {
    if (!b.device || !b.device.online || !b.device.allowed) {
      return 1;
    }
    var device = b.device, busy = Math.min(1, density(device.down + device.up) / 18), burst = 0;
    device.ripples.forEach(function (age) { burst = Math.max(burst, 1 - age / 1.2); });
    var target = 0.35 + 0.8 * busy + 0.2 * burst;
    device.tone = device.tone === undefined ? target : device.tone + (target - device.tone) * Math.min(1, seconds * 3);
    return device.tone;
  }
  // Every frame, since their heights and the camera move: back to front, over the traffic.
  var standing = [];
  function drawBuilt(paint, seconds) {
    // Each face's light, by how far it's turned to the left, where the light is. A face's
    // normal on the screen: +v's is c, +u's a.
    var long = Math.hypot(cam.a, cam.c) || 1;
    var light = [0.64 - 0.12 * cam.c / long, 0.64 - 0.12 * cam.a / long];
    var lit = Math.max(0, Math.min(1, (flow.starry - 0.3) / 0.4)), now = Date.now();
    standing.forEach(function (b) {
      b.height = b.base;
      var k = tone(b, seconds);
      box(paint, b, light, k);
      if (sharp && !townScene.ultra && carsAt.length) {
        washWalls(paint, b);
      }
      if (sharp) {
        lightUp(paint, b, seconds);
      }
      if (sharp && b.device) {
        gable(paint, b, light, k, seconds);
      }
      if (sharp && !b.device) {
        plant(paint, b, light, lit, now);
      }
      if (b.device) {
        // Its name stays put.
        b.device.roof = iso(b.u, b.v, b.base);
        if (lit && b.device.online && now - (busySeen[b.device.mac] || 0) < AWAKE) {
          drawWindows(paint, b, lit);
        }
      }
    });
    if (sharp) {
      drawSmoke(paint, seconds);
    }
  }
  // The two faces we see of a box (+v, then +u), from its foot to height z.
  function seenFaces(b, z) {
    var half = b.size / 2, u0 = b.u - half, u1 = b.u + half, v0 = b.v - half, v1 = b.v + half;
    return [[iso(u0, v1), iso(u1, v1), project(u1, v1, z), project(u0, v1, z)],
      [iso(u1, v1), iso(u1, v0), project(u1, v0, z), project(u1, v1, z)]];
  }
  // A face washed with light in the data's colour, from its foot fading up `reach` cells.
  function washFace(paint, face, kind, alpha, reach, top) {
    var foot = (face[0].y + face[1].y) / 2, wash = paint.createLinearGradient(0, foot, 0, foot - reach * cam.z);
    var rgb3 = channels(palette[kind]).join(', ');
    wash.addColorStop(0, 'rgba(' + rgb3 + ', ' + alpha.toFixed(3) + ')');
    wash.addColorStop(1, 'rgba(' + rgb3 + ', ' + top.toFixed(3) + ')');
    quad(paint, face, wash);
  }
  // The cars' light on a building's two faces we see: the cars in front of each within
  // CAR_REACH, nearer and bigger brighter, summed by colour; laid on as light from its
  // foot, fading out by 0.7 of its height (or 0.9 cells, if less).
  function washWalls(paint, b) {
    var sums = carsBefore(b);
    if (!sums) {
      return;
    }
    var z = b.height + (terrain() ? hill(b.u, b.v) : 0), reach = Math.min(b.height * 0.7, 0.9);
    var faces = seenFaces(b, z), strength = 0.3 + 0.45 * flow.starry;
    paint.globalCompositeOperation = 'lighter';
    faces.forEach(function (face, index) {
      ['down', 'up'].forEach(function (kind) {
        var alpha = Math.min(0.7, sums[index][kind] * strength);
        if (alpha >= 0.01) {
          washFace(paint, face, kind, alpha, reach, 0);
        }
      });
    });
    paint.globalCompositeOperation = 'source-over';
  }
  // The cars in front of each face we see, by colour; null if none.
  function carsBefore(b) {
    var half = b.size / 2, u0 = b.u - half, u1 = b.u + half, v0 = b.v - half, v1 = b.v + half;
    var sums = [{down: 0, up: 0}, {down: 0, up: 0}], any = false;
    var c0 = Math.floor((b.u - half - CAR_REACH) / CAR_CELL), c1 = Math.floor((b.u + half + CAR_REACH) / CAR_CELL);
    var r0 = Math.floor((b.v - half - CAR_REACH) / CAR_CELL), r1 = Math.floor((b.v + half + CAR_REACH) / CAR_CELL);
    for (var c = c0; c <= c1; c += 1) {
      for (var r = r0; r <= r1; r += 1) {
        (carGrid[c + ',' + r] || []).forEach(function (car) {
          var du = Math.max(u0 - car.u, 0, car.u - u1), dv = Math.max(v0 - car.v, 0, car.v - v1);
          if (car.v > v1 && du < CAR_REACH) {
            var nearV = 1 - Math.hypot(du, car.v - v1) / CAR_REACH;
            if (nearV > 0) {
              sums[0][car.kind] += nearV * nearV * car.size;
              any = true;
            }
          }
          if (car.u > u1 && dv < CAR_REACH) {
            var nearU = 1 - Math.hypot(car.u - u1, dv) / CAR_REACH;
            if (nearU > 0) {
              sums[1][car.kind] += nearU * nearU * car.size;
              any = true;
            }
          }
        });
      }
    }
    return any ? sums : null;
  }
  // The light of the data going into or out of a building (`glowing`, on its device or
  // tower: each car adds its size, eased away over a second or so): its faces we see lit in
  // down's and up's colours, a house's whole wall, a tower's from its foot up to 1.2 cells
  // and fainter, since it carries all the house's traffic. Stronger by night.
  var LIT_FADE = 2.5;
  function lightUp(paint, b, seconds) {
    var owner = b.device || b.tower, glowing = owner && owner.glowing;
    if (!glowing || glowing.down + glowing.up < 0.01) {
      return;
    }
    var z = b.height + (terrain() ? hill(b.u, b.v) : 0), reach = b.device ? b.height : Math.min(b.height, 1.2);
    var faces = seenFaces(b, z);
    var strength = 0.35 + 0.35 * flow.starry, fade = Math.exp(-LIT_FADE * seconds);
    paint.globalCompositeOperation = 'lighter';
    ['down', 'up'].forEach(function (kind) {
      var alpha = Math.min(b.device ? 0.6 : 0.35, glowing[kind] * strength);
      glowing[kind] *= fade;
      if (alpha < 0.01) {
        return;
      }
      faces.forEach(function (face) { washFace(paint, face, kind, alpha, reach, b.device ? 0.4 * alpha : 0); });
    });
    paint.globalCompositeOperation = 'source-over';
  }
  function glow(owner, kind, size) {
    var glowing = owner.glowing = owner.glowing || {down: 0, up: 0};
    glowing[kind] = Math.min(2, glowing[kind] + 0.35 * size);
  }
  // Sharp: a house's pitched roof over its flat top, its ridge one way or the other by its
  // MAC: the gable end and the slope we see, darker than the house. A chimney on the far
  // slope, smoking in the cold (under SMOKY degrees) while its device is about.
  var RIDGE = 0.16, SMOKY = 12, puffs = [];
  function gable(paint, b, light, k, seconds) {
    var half = b.size / 2, u0 = b.u - half, u1 = b.u + half, v0 = b.v - half, v1 = b.v + half, um = b.u, vm = b.v;
    var z = b.height + (terrain() ? hill(b.u, b.v) : 0), top = z + RIDGE, alongU = hash(b.device.mac + 'roof') < 0.5;
    var chimney = {u: alongU ? u0 + 0.25 * b.size : u0 + 0.22 * b.size, v: alongU ? v0 + 0.22 * b.size : v0 + 0.25 * b.size,
      size: 0.075, height: RIDGE + 0.1, level: z, shade: [112, 98, 92]};
    box(paint, chimney, light, 1);
    var roof = whiten(b.shade.map(function (c) { return c * 0.62 * k; }), 0.9 * flow.snowCover);
    var snowLight = 1 - 0.4 * flow.starry * flow.snowCover;
    var wall = b.shade.map(function (c) { return c * k; });
    if (alongU) {
      // The gable end facing +u, the slope facing +v.
      quad(paint, [project(u1, v0, z), project(u1, v1, z), project(u1, vm, top)], rgb(wall, light[1] * 1.15));
      quad(paint, [project(u0, v1, z), project(u1, v1, z), project(u1, vm, top), project(u0, vm, top)], rgb(roof, 1.1 * snowLight));
    } else {
      // The gable facing +v, the slope facing +u.
      quad(paint, [project(u0, v1, z), project(u1, v1, z), project(um, v1, top)], rgb(wall, light[0] * 1.15));
      quad(paint, [project(u1, v0, z), project(u1, v1, z), project(um, v1, top), project(um, v0, top)], rgb(roof, 0.95 * snowLight));
    }
    b.device.chimney = {u: chimney.u, v: chimney.v, z: z + chimney.height};
    if (flow.temp < SMOKY && b.device.online && puffs.length < 240) {
      b.device.smoked = (b.device.smoked || hash(b.device.mac + 'smoke')) + seconds;
      if (b.device.smoked > 0.7) {
        b.device.smoked = 0;
        puffs.push({u: chimney.u, v: chimney.v, z: z + chimney.height, age: 0, drift: 0, seed: Math.random()});
      }
    }
  }
  // The smoke: puffs rising, swelling and fading, carried off by the wind.
  var PUFF_FADES = [0.4, 0.28, 0.16, 0.06];
  function drawSmoke(paint, seconds) {
    var lists = [[], [], [], []];
    puffs = puffs.filter(function (puff) {
      puff.age += seconds;
      if (puff.age > 5) {
        return false;
      }
      puff.z += 0.12 * seconds;
      puff.drift += (0.05 + 0.25 * flow.windX) * seconds;
      lists[Math.min(3, Math.floor(puff.age / 1.25))].push(puff);
      return true;
    });
    paint.fillStyle = rgb([176, 176, 180], 1 - 0.55 * flow.starry);
    lists.forEach(function (list, step) {
      if (!list.length) {
        return;
      }
      paint.globalAlpha = PUFF_FADES[step];
      paint.beginPath();
      list.forEach(function (puff) {
        var at = project(puff.u, puff.v, puff.z), r = (0.035 + 0.03 * puff.age) * cam.z;
        var x = at.x + puff.drift * cam.z + Math.sin(puff.age * 2 + puff.seed * 6) * 0.03 * cam.z;
        paint.moveTo(x + r, at.y);
        paint.arc(x, at.y, r, 0, 6.2832);
      });
      paint.fill();
    });
    paint.globalAlpha = 1;
  }
  // Sharp: a tower's plant on its roof, a mast with a red light blinking on the tall
  // ones, and from dusk its windows, some lit (warm or cool), changing now and then.
  function plant(paint, b, light, lit, now) {
    var level = terrain() ? hill(b.u, b.v) : 0, roof = level + b.base, name = b.u + ',' + b.v;
    for (var i = 0; i < 3; i += 1) {
      var su = (hash(name + 'plant u' + i) - 0.5) * 0.6 * b.size, sv = (hash(name + 'plant v' + i) - 0.5) * 0.6 * b.size;
      box(paint, {u: b.u + su, v: b.v + sv, size: 0.12 + 0.12 * hash(name + 'plant s' + i), height: 0.06 + 0.08 * hash(name + 'plant h' + i),
        level: roof, shade: b.shade.map(function (c) { return c * 0.85; })}, light, 1);
    }
    if (b.base > 3) {
      mast(paint, b, roof, name, now);
    }
    // None in the city with no internet.
    var city = !(b.u === HOMEHUB.u && b.v === HOMEHUB.v);
    if (!lit || (flow.internetDown && city)) {
      b.panes = [];
      return;
    }
    towerWindows(paint, b, level, name, lit, now);
  }
  function mast(paint, b, roof, name, now) {
    var foot = project(b.u, b.v, roof), tip = project(b.u, b.v, roof + 0.7);
    paint.strokeStyle = rgb([120, 120, 124], 1);
    paint.lineWidth = Math.max(1, 0.015 * cam.z);
    paint.beginPath();
    paint.moveTo(foot.x, foot.y);
    paint.lineTo(tip.x, tip.y);
    paint.stroke();
    if ((now / 1000 + hash(name)) % 1.6 < 0.5) {
      dot(tip.x, tip.y, Math.max(1.5, 0.03 * cam.z), '#ff4a3a', 1, paint);
      dot(tip.x, tip.y, Math.max(2, 0.05 * cam.z), '#ff4a3a', 1, glaring());
    }
  }
  // Which are lit is worked out once a minute, each window changing in its own ten
  // minutes; kept as panes, where each is, for the river too.
  function towerWindows(paint, b, level, name, lit, now) {
    var cols = Math.max(3, Math.round(b.size * 4)), rows = Math.max(2, Math.round(b.base / 0.22)), half = b.size / 2;
    var minute = Math.floor(now / 60000), tall = 0.42 * b.base / rows;
    if (!b.lights || b.lights.minute !== minute) {
      b.lights = {minute: minute, list: litWindows(b, level, name, now, cols, rows, tall)};
    }
    var up = project(b.u, b.v, level + 1), base = project(b.u, b.v, level), zx = up.x - base.x, zy = up.y - base.y;
    var faces = [[project(b.u - half, b.v + half, level), project(b.u + half, b.v + half, level)],
      [project(b.u + half, b.v + half, level), project(b.u + half, b.v - half, level)]].map(function (ends) {
      return {x: ends[0].x, y: ends[0].y, ax: (ends[1].x - ends[0].x) / cols, ay: (ends[1].y - ends[0].y) / cols};
    });
    var warm = new Path2D(), cool = new Path2D();
    b.lights.list.forEach(function (one) {
      var face = faces[one.side], x = face.x + face.ax * one.s + zx * one.z, y = face.y + face.ay * one.s + zy * one.z;
      var pane = one.warm ? warm : cool, wx = face.ax * 0.42, wy = face.ay * 0.42;
      pane.moveTo(x, y);
      pane.lineTo(x + wx, y + wy);
      pane.lineTo(x + wx + zx * tall, y + wy + zy * tall);
      pane.lineTo(x + zx * tall, y + zy * tall);
      pane.closePath();
    });
    b.panes = b.lights.panes || (b.lights.panes = b.lights.list.map(function (one) { return {u: one.u, v: one.v, z: one.mid}; }));
    [[warm, '#ffd9a0'], [cool, '#d6e6ff']].forEach(function (kind) {
      paint.globalAlpha = 0.85 * lit;
      paint.fillStyle = kind[1];
      paint.fill(kind[0]);
      if (glaring()) {
        glaring().globalAlpha = 0.35 * lit;
        glaring().fillStyle = kind[1];
        glaring().fill(kind[0]);
      }
    });
    paint.globalAlpha = 1;
  }
  function litWindows(b, level, name, now, cols, rows, tall) {
    var list = [], half = b.size / 2;
    for (var side = 0; side < 2; side += 1) {
      for (var col = 0; col < cols; col += 1) {
        for (var row = 0; row < rows; row += 1) {
          var key = name + side + ' ' + col + ' ' + row;
          if (hash(key + Math.floor(now / 600000 + hash(key + 'when'))) > 0.22) {
            continue;
          }
          var f = (col + 0.5) / cols, z0 = b.base * (row + 0.3) / rows;
          list.push({side: side, s: col + 0.29, z: z0, warm: hash(key + 'tint') < 0.6,
            u: side ? b.u + half : b.u - half + f * b.size, v: side ? b.v + half - f * b.size : b.v + half, mid: level + z0 + tall / 2});
        }
      }
    }
    return list;
  }
  // Lit windows from dusk, in a house whose device has been busy (more than IDLE_BITS)
  // within AWAKE ms: two a face a storey; the house dark once it's been idle that long.
  // Sharp, each window its own light by its MAC: most warm, some a cooler white, some a
  // TV's flickering blue, with their light spilling out round each lit face.
  var AWAKE = 30 * 60000, WINDOW_SPANS = [[0.18, 0.4], [0.6, 0.82]];
  function drawWindows(paint, b, lit) {
    var half = b.size / 2, u0 = b.u - half, u1 = b.u + half, v0 = b.v - half, v1 = b.v + half;
    var level = terrain() ? hill(b.u, b.v) : 0;
    // Its storeys, from its own level.
    function at(u, v, z) {
      return project(u, v, z + level);
    }
    var rows = Math.max(1, Math.round(b.height / 0.3));
    var kinds = sharp ? {'#ffd27a': new Path2D(), '#fff1d6': new Path2D(), '#8fb4ff': new Path2D()} : null;
    paint.fillStyle = '#ffd27a';
    paint.globalAlpha = 0.9 * lit;
    paint.beginPath();
    for (var row = 0; row < rows; row += 1) {
      var z0 = b.height * (row + 0.35) / rows, z1 = Math.min(z0 + 0.12, b.height * (row + 0.7) / rows);
      WINDOW_SPANS.forEach(function (span) {
        var panes = [
          [at(u0 + (u1 - u0) * span[0], v1, z0), at(u0 + (u1 - u0) * span[1], v1, z0), at(u0 + (u1 - u0) * span[1], v1, z1),
            at(u0 + (u1 - u0) * span[0], v1, z1)],
          [at(u1, v1 - (v1 - v0) * span[0], z0), at(u1, v1 - (v1 - v0) * span[1], z0), at(u1, v1 - (v1 - v0) * span[1], z1),
            at(u1, v1 - (v1 - v0) * span[0], z1)],
        ];
        panes.forEach(function (pane, face) {
          var to = paint;
          if (kinds) {
            var pick = hash(b.device.mac + row + ' ' + span[0] + face);
            to = kinds[pick < 0.65 ? '#ffd27a' : pick < 0.85 ? '#fff1d6' : '#8fb4ff'];
          }
          to.moveTo(pane[0].x, pane[0].y);
          for (var k = 1; k < 4; k += 1) {
            to.lineTo(pane[k].x, pane[k].y);
          }
          to.closePath();
        });
      });
    }
    if (!kinds) {
      paint.fill();
    } else {
      fillWindowKinds(paint, b, kinds, lit);
    }
    paint.globalAlpha = 1;
    if (sharp && !townScene.ultra) {
      var spill = flow.glows.warm, size = 1.4 * b.size * cam.z, z = b.height / 2;
      paint.globalCompositeOperation = 'lighter';
      paint.globalAlpha = 0.35 * lit;
      [at((u0 + u1) / 2, v1, z), at(u1, (v0 + v1) / 2, z)].forEach(function (face) {
        paint.drawImage(spill, face.x - size / 2, face.y - size / 2, size, size);
      });
      paint.globalCompositeOperation = 'source-over';
      paint.globalAlpha = 1;
    }
  }
  function fillWindowKinds(paint, b, kinds, lit) {
    Object.keys(kinds).forEach(function (fill) {
      var t = performance.now() / 1000, seed = hash(b.device.mac + 'tv') * 50;
      var flicker = fill === '#8fb4ff' ? 0.6 + 0.4 * Math.abs(Math.sin(t * 2.3 + seed) * Math.sin(t * 5.9 + seed)) : 1;
      paint.globalAlpha = 0.9 * lit * flicker;
      paint.fillStyle = fill;
      paint.fill(kinds[fill]);
      if (glaring()) {
        glaring().globalAlpha = 0.8 * lit * flicker;
        glaring().fillStyle = fill;
        glaring().fill(kinds[fill]);
      }
    });
  }

  // ------------------------------------------------------ vans, lorries, boats --
  // A box on the ground turned along the way it goes (heading du, dv): its sides that face
  // us, each lit by which way it faces, then its top.
  function vehicle(paint, at, du, dv, long, wide, tall, shade, alpha) {
    var f = Math.hypot(du, dv) || 1, fu = du / f, fv = dv / f, z = at.z || 0;
    var base = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(function (c) {
      return {u: at.u + fu * long * c[0] - fv * wide * c[1], v: at.v + fv * long * c[0] + fu * wide * c[1]};
    });
    var night = 1 - 0.35 * flow.starry;
    paint.globalAlpha = alpha;
    base.forEach(function (a, index) {
      var b = base[(index + 1) % 4], nu = (b.v - a.v), nv = -(b.u - a.u);
      var nx = cam.a * nu + cam.c * nv, ny = cam.b * nu + cam.d * nv;
      if (ny <= 0) {
        return;
      }
      var p = [iso(a.u, a.v, z), iso(b.u, b.v, z), iso(b.u, b.v, z + tall), iso(a.u, a.v, z + tall)];
      quad(paint, p, rgb(shade, (0.75 - 0.2 * nx / Math.hypot(nx, ny)) * night));
    });
    quad(paint, base.map(function (c) { return iso(c.u, c.v, z + tall); }), rgb(shade, night));
    paint.globalAlpha = 1;
  }
  // Deliveries: a device downloading hard (over VAN_BITS) has a van come over the bridge
  // to its house, wait a while and go; one uploading hard (over LORRY_BITS) sends a lorry
  // off to the city. A house's next only after CRAFT_AGAIN ms; at most MAX_CRAFT at once.
  var VAN_BITS = 20e6, LORRY_BITS = 5e6, CRAFT_AGAIN = 120000, MAX_CRAFT = 4, craft = [];
  // Two routes as one, with fresh points, since measured marks them.
  function routeThrough(a, b) {
    return measured(a.points.concat(b.points).map(function (point) { return {u: point.u, v: point.v}; }));
  }
  function drawCraft(paint, time, seconds) {
    if (flow.polled > 3 && !flow.internetDown) {
      devices.forEach(function (device) { dispatch(device, time); });
    }
    craft = craft.filter(function (one) {
      if (!moveCraft(one, seconds)) {
        return false;
      }
      var at = along(one.route, one.s), ahead = along(one.route, Math.min(one.route.length, one.s + 0.05));
      var du = ahead.u - at.u, dv = ahead.v - at.v;
      if (!du && !dv) {
        du = one.du || 1;
        dv = one.dv || 0;
      }
      one.du = du;
      one.dv = dv;
      if (one.van) {
        vehicle(paint, at, du, dv, 0.15, 0.08, 0.15, [226, 226, 230], Math.max(0, one.fade));
      } else {
        vehicle(paint, at, du, dv, 0.22, 0.09, 0.2, [196, 92, 60], Math.max(0, one.fade));
      }
      return true;
    });
  }
  function dispatch(device, time) {
    if (!device.lot || !device.online || !device.allowed || craft.length >= MAX_CRAFT) {
      return;
    }
    if (time - (device.craftAt || -Infinity) < CRAFT_AGAIN) {
      return;
    }
    var van = device.down > VAN_BITS;
    if (!van && device.up <= LORRY_BITS) {
      return;
    }
    device.craftAt = time;
    var route = van ? routeThrough(wanDown, device.route) : routeThrough(device.routeBack, wanUp);
    craft.push({route: route, van: van, s: van ? 0 : 0.35, wait: 0, fade: van ? 1 : 0});
  }
  // A van drives to the door, waits there and fades; a lorry fades in out of its drive and
  // out into the city. False once it's gone.
  function moveCraft(one, seconds) {
    var end = one.route.length - (one.van ? 0.35 : 0);
    if (one.s < end) {
      one.s = Math.min(end, one.s + DRIVE * 0.35 * seconds);
      if (!one.van) {
        one.fade = Math.min(1, one.fade + seconds);
      }
      if (!one.van && one.route.length - one.s < 1.5) {
        one.fade = (one.route.length - one.s) / 1.5;
      }
    } else if (one.van) {
      one.wait += seconds;
      if (one.wait > 6) {
        one.fade -= seconds;
      }
    } else {
      return false;
    }
    return !(one.fade <= 0 && (one.van ? one.wait > 6 : true));
  }
  // Boats on the river now and then, more often the busier the line is, sailing from one
  // end to the other under the bridge; none while it's frozen.
  var BOAT_GAP = [20, 70], boats = [], boatDue = 5 + 10 * Math.random();
  function drawBoats(paint, time, seconds) {
    boatDue -= seconds * (1 + (wan.down + wan.up) / 20e6);
    if (boatDue <= 0 && boats.length < 3 && !flow.frozen && !flow.precip.storm) {
      var boat = {t: Math.random() < 0.5 ? 0 : 1, way: 0, speed: 0.012 + 0.008 * Math.random(), bob: Math.random() * 6.3};
      boat.way = boat.t ? -1 : 1;
      boats.push(boat);
      boatDue = BOAT_GAP[0] + Math.random() * (BOAT_GAP[1] - BOAT_GAP[0]);
    }
    boats = boats.filter(function (one) {
      one.t += one.way * one.speed * seconds;
      if (one.t < 0 || one.t > 1) {
        return false;
      }
      sail(paint, one, time);
      return true;
    });
  }
  // A hull and a sail, fading in and out at the land's edges.
  function sail(paint, boat, time) {
    var at = onRiver(boat.t), ahead = onRiver(boat.t + boat.way * 0.01);
    var inside = Math.min(at.u - LAND.u0, LAND.u1 - at.u);
    if (inside <= 0) {
      return;
    }
    var alpha = Math.min(1, inside / 1.2), du = ahead.u - at.u, dv = ahead.v - at.v, long = Math.hypot(du, dv) || 1;
    at.z = 0.01 + 0.015 * Math.sin(time / 600 + boat.bob);
    vehicle(paint, at, du, dv, 0.3, 0.1, 0.08, [124, 84, 54], alpha);
    var mast = iso(at.u, at.v, at.z + 0.08), top = iso(at.u, at.v, at.z + 0.62);
    var clew = iso(at.u - du / long * 0.26, at.v - dv / long * 0.26, at.z + 0.12);
    paint.globalAlpha = alpha;
    paint.fillStyle = rgb([236, 234, 226], 1 - 0.35 * flow.starry);
    paint.beginPath();
    paint.moveTo(mast.x, mast.y);
    paint.lineTo(top.x, top.y);
    paint.lineTo(clew.x, clew.y);
    paint.closePath();
    paint.fill();
    paint.globalAlpha = 1;
  }

  // ------------------------------------------------------------- the camera --
  // Swaying slowly, and in on a house that has just turned very busy (news, not the same
  // busy house over and over) for a while, then back out; that house again only once it
  // has gone quiet and a while has passed.
  var focus = {device: null, since: -Infinity, k: 0, at: MIDDLE};
  function steer(time, seconds) {
    var busiest = busiestNews(time);
    if (focus.device && time - focus.since > HOLD) {
      focus.device = null;
    }
    // Out a while first.
    if (!focus.device && busiest && time - focus.since > 2 * HOLD) {
      focus.device = busiest;
      focus.since = time;
      focus.at = busiest.lot;
      busiest.quiet = false;
      busiest.zoomed = time;
    }
    focus.k = Math.max(0, Math.min(1, focus.k + (focus.device ? 0.3 : -0.25) * seconds));
    var ease = focus.k * focus.k * (3 - 2 * focus.k);
    var pivot = {u: MIDDLE.u + (focus.at.u - MIDDLE.u) * ease, v: MIDDLE.v + (focus.at.v - MIDDLE.v) * ease};
    aim(SWAY * Math.sin(6.2832 * time / SWING), 1 + (NEAR - 1) * ease, pivot);
    flow.hub = iso(HOMEHUB.u, HOMEHUB.v, HOMEHUB.height);
    flow.net = iso(INTERNET.u, INTERNET.v, INTERNET.height);
  }
  // A house that's just turned very busy. Busy as the page opens (it reloads) isn't news;
  // one that's gone quiet is news again when it isn't.
  function busiestNews(time) {
    var busiest = null;
    devices.forEach(function (device) {
      var bits = device.down + device.up;
      if (flow.polled <= 3) {
        if (bits > BUSY / 2) {
          device.quiet = false;
        }
        return;
      }
      if (bits < BUSY / 2) {
        device.quiet = true;
      }
      if (device.lot && device.online && bits > BUSY && device.quiet !== false &&
        !(time - device.zoomed < AGAIN) && (!busiest || bits > busiest.down + busiest.up)) {
        busiest = device;
      }
    });
    return busiest;
  }
  // The town's reach on the screen at a unit of 1 through the whole sway, about the
  // middle (which lands on 0, 0): its land and its towers' tops.
  function townBox() {
    var keep = flow.origin, reach = {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity};
    flow.origin = {x: 0, y: 0};
    flow.unit = 1;
    var points = [];
    [-SWAY, -SWAY / 2, 0, SWAY / 2, SWAY].forEach(function (turn) {
      aim(turn, 1, MIDDLE);
      points.push(iso(LAND.u0, LAND.v0), iso(LAND.u1, LAND.v0), iso(LAND.u1, LAND.v1), iso(LAND.u0, LAND.v1));
      points.push(iso(LAND.u1, LAND.v1, -LAND_DEPTH), iso(LAND.u1, LAND.v0, -LAND_DEPTH), iso(LAND.u0, LAND.v1, -LAND_DEPTH));
      [HOMEHUB, INTERNET].concat(SKYLINE).forEach(function (tower) {
        points.push(iso(tower.u, tower.v, tower.height));
      });
    });
    points.forEach(function (point) {
      reach.left = Math.min(reach.left, point.x);
      reach.right = Math.max(reach.right, point.x);
      reach.top = Math.min(reach.top, point.y);
      reach.bottom = Math.max(reach.bottom, point.y);
    });
    flow.origin = keep;
    return reach;
  }

  // ----------------------------------------------------------- the spaceship --
  // Now and then (SHIP_GAP seconds, at random within) a little spaceship crosses the sky,
  // one side to the other, bobbing, its rim lights chasing round; behind the towers.
  var SHIP_GAP = [60, 180], ship = null, shipDue = 20 + 40 * Math.random();
  var RIM_LIGHTS = ['#ff7a6b', '#7affc8', '#7ab8ff'];
  function drawShip(paint, time, seconds) {
    if (!ship) {
      shipDue -= seconds;
      if (shipDue > 0) {
        return;
      }
      var way = Math.random() < 0.5 ? 1 : -1;
      ship = {way: way, t: 0, span: 14 + 8 * Math.random(), y: 0.08 + 0.2 * Math.random(), size: 0.024 + 0.01 * Math.random()};
    }
    ship.t += seconds / ship.span;
    if (ship.t >= 1) {
      ship = null;
      shipDue = SHIP_GAP[0] + Math.random() * (SHIP_GAP[1] - SHIP_GAP[0]);
      return;
    }
    var s = ship.size * flow.width, run = flow.width + 4 * s;
    var x = ship.way > 0 ? -2 * s + ship.t * run : flow.width + 2 * s - ship.t * run;
    var y = (ship.y + 0.012 * Math.sin(time / 700)) * flow.height;
    paint.save();
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = 'source-over';
    paint.translate(x, y);
    paint.rotate(0.08 * ship.way + 0.03 * Math.sin(time / 500));
    saucer(paint, s, time);
    paint.restore();
  }
  function saucer(paint, s, time) {
    // The dome, the hull, its underside.
    paint.fillStyle = 'rgba(150, 225, 245, 0.75)';
    paint.beginPath();
    paint.ellipse(0, -0.12 * s, 0.32 * s, 0.3 * s, 0, Math.PI, 0);
    paint.fill();
    paint.fillStyle = rgb([176, 182, 196], 1 - 0.3 * flow.starry);
    paint.beginPath();
    paint.ellipse(0, 0, s, 0.24 * s, 0, 0, 6.2832);
    paint.fill();
    paint.fillStyle = rgb([120, 126, 140], 1 - 0.3 * flow.starry);
    paint.beginPath();
    paint.ellipse(0, 0.08 * s, 0.55 * s, 0.12 * s, 0, 0, Math.PI);
    paint.fill();
    var chase = Math.floor(time / 160) % 6;
    for (var i = 0; i < 6; i += 1) {
      paint.fillStyle = i === chase ? '#fff3b0' : RIM_LIGHTS[i % 3];
      paint.globalAlpha = i === chase ? 1 : 0.7;
      paint.beginPath();
      paint.arc((i - 2.5) * 0.32 * s, 0.03 * s, Math.max(1, 0.06 * s), 0, 6.2832);
      paint.fill();
    }
  }

  // ------------------------------------------------------- the cars' light --
  // A headlight's beam: a wedge of warm light along +x, fading out, drawn turned and
  // stretched to each car's.
  var beam = document.createElement('canvas');
  beam.width = 64;
  beam.height = 32;
  (function () {
    var paint = beam.getContext('2d'), shade = paint.createLinearGradient(0, 0, 64, 0);
    shade.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
    shade.addColorStop(1, 'rgba(255, 244, 214, 0)');
    paint.fillStyle = shade;
    paint.beginPath();
    paint.moveTo(0, 13);
    paint.lineTo(64, 0);
    paint.lineTo(64, 32);
    paint.lineTo(0, 19);
    paint.closePath();
    paint.fill();
  })();
  // Sharp, from dusk: each car's headlights, a beam on the road ahead.
  var beams = [];
  // Sharp: each car's light on the street round it, a soft pool in its colour, laid on
  // the ground as it drives so the buildings, drawn after, stand in front of it.
  var carLights = {};
  // And on the walls: each car (`carsAt`, kept by CAR_CELL square in `carGrid`) lights the
  // faces we see of the buildings within CAR_REACH cells in front of it.
  var carsAt = [], carGrid = {}, CAR_REACH = 1.5, CAR_CELL = 1.5;
  ['down', 'up'].forEach(function (kind) {
    var rgb3 = channels(palette[kind]).join(', ');
    carLights[kind] = softSprite([[0, 'rgba(' + rgb3 + ', 0.9)'], [0.35, 'rgba(' + rgb3 + ', 0.35)'], [1, 'rgba(' + rgb3 + ', 0)']]);
  });

  // ---------------------------------------------------------------- Ultra --
  // Sharp, on the hills: the light and shadows worked out on the GPU (flowLighting,
  // flow-light.js) from the ground and the buildings as meshes: soft shadows of the sun or
  // moon on the ground and the buildings, and the light of every lamp, car, lit window and
  // building the data's going into, on whatever faces it. Then the 2D ways of faking those
  // aren't drawn. Made the first time it's wanted; without WebGL, High instead.
  var lighting = null, lightingTried = false, LAND_ROUND = 2.5, GROUND_MESH = 0.25;
  var tints = {down: channels(palette.down), up: channels(palette.up)};
  function ultraOn() {
    if (!flow.ultra || !terrain()) {
      return false;
    }
    if (!lightingTried) {
      lightingTried = true;
      try {
        lighting = window.flowLighting ? window.flowLighting() : null;
      } catch (error) {
        lighting = null;
      }
      if (lighting) {
        lighting.ground(groundMesh());
      }
    }
    return Boolean(lighting) && !lighting.lost;
  }
  // The land on its hills, every GROUND_MESH cells.
  function groundMesh() {
    var made = lighting.mesh(), step = GROUND_MESH;
    for (var u = LAND.u0; u < LAND.u1 - 1e-6; u += step) {
      for (var v = LAND.v0; v < LAND.v1 - 1e-6; v += step) {
        var a = [u, v, hill(u, v)], b = [u + step, v, hill(u + step, v)];
        var c = [u + step, v + step, hill(u + step, v + step)], d = [u, v + step, hill(u, v + step)];
        made.tri(a, b, c);
        made.tri(a, c, d);
      }
    }
    return made;
  }
  // The buildings as drawn: walls down to the ground at each corner, a house's roof.
  function solidsMesh() {
    var made = lighting.mesh();
    standing.forEach(function (b) {
      var half = b.size / 2, u0 = b.u - half, u1 = b.u + half, v0 = b.v - half, v1 = b.v + half;
      var top = b.height + hill(b.u, b.v);
      function foot(u, v) {
        return [u, v, hill(u, v)];
      }
      function up(u, v, z) {
        return [u, v, z];
      }
      made.quad(foot(u0, v1), foot(u1, v1), up(u1, v1, top), up(u0, v1, top), [0, 1, 0]);
      made.quad(foot(u1, v1), foot(u1, v0), up(u1, v0, top), up(u1, v1, top), [1, 0, 0]);
      made.quad(foot(u1, v0), foot(u0, v0), up(u0, v0, top), up(u1, v0, top), [0, -1, 0]);
      made.quad(foot(u0, v0), foot(u0, v1), up(u0, v1, top), up(u0, v0, top), [-1, 0, 0]);
      made.quad(up(u0, v0, top), up(u1, v0, top), up(u1, v1, top), up(u0, v1, top), [0, 0, 1]);
      if (b.device) {
        roofMesh(made, b, u0, u1, v0, v1, top, up);
      }
    });
    return made;
  }
  // As gable draws it, the ridge along u or along v.
  function roofMesh(made, b, u0, u1, v0, v1, top, up) {
    var half = b.size / 2, ridge = top + RIDGE, slope = Math.hypot(RIDGE, half), rise = RIDGE / slope, flat = half / slope;
    if (hash(b.device.mac + 'roof') < 0.5) {
      made.quad(up(u0, v1, top), up(u1, v1, top), up(u1, b.v, ridge), up(u0, b.v, ridge), [0, rise, flat]);
      made.quad(up(u1, v0, top), up(u0, v0, top), up(u0, b.v, ridge), up(u1, b.v, ridge), [0, -rise, flat]);
      made.triN(up(u1, v0, top), up(u1, v1, top), up(u1, b.v, ridge), [1, 0, 0]);
      made.triN(up(u0, v1, top), up(u0, v0, top), up(u0, b.v, ridge), [-1, 0, 0]);
    } else {
      made.quad(up(u1, v1, top), up(u1, v0, top), up(b.u, v0, ridge), up(b.u, v1, ridge), [rise, 0, flat]);
      made.quad(up(u0, v0, top), up(u0, v1, top), up(b.u, v1, ridge), up(b.u, v0, ridge), [-rise, 0, flat]);
      made.triN(up(u0, v1, top), up(u1, v1, top), up(b.u, v1, ridge), [0, 1, 0]);
      made.triN(up(u1, v0, top), up(u0, v0, top), up(b.u, v0, ridge), [0, -1, 0]);
    }
  }
  // As many lights as the GPU takes, the steady ones first: the lamps from dusk, the lit
  // windows (each lit face's light before it), the buildings the data's going into or out
  // of (before their faces we see, in its colours), then the cars.
  function spotsNow() {
    var spots = [], room = lighting.MAX_LIGHTS, now = Date.now();
    var lampLit = Math.max(0, Math.min(1, (flow.starry - 0.15) / 0.5)), lit = Math.max(0, Math.min(1, (flow.starry - 0.3) / 0.4));
    function add(u, v, z, reach, tint, k) {
      if (k < 0.01 || spots.length >= room) {
        return;
      }
      spots.push({u: u, v: v, z: z, reach: reach, r: tint[0] / 255 * k, g: tint[1] / 255 * k, b: tint[2] / 255 * k});
    }
    LAMPS.forEach(function (lamp) { add(lamp.u, lamp.v, hill(lamp.u, lamp.v) + 0.34, 1.7, [255, 190, 120], 1.5 * lampLit); });
    standing.forEach(function (b) {
      var half = b.size / 2, level = hill(b.u, b.v), owner = b.device || b.tower, glowing = owner && owner.glowing;
      var fronts = [[b.u, b.v + half + 0.12], [b.u + half + 0.12, b.v]], out = b.device ? 0.3 : 0.6;
      if (lit && b.device && b.device.online && now - (busySeen[b.device.mac] || 0) < AWAKE) {
        fronts.forEach(function (at) { add(at[0], at[1], level + b.height * 0.5, 1.1, [255, 200, 130], 0.9 * lit); });
      }
      if (glowing) {
        ['down', 'up'].forEach(function (kind) {
          var k = Math.min(1.5, glowing[kind]) * (0.6 + 0.8 * flow.starry), z = level + Math.min(b.height * 0.5, 0.6);
          add(b.u, b.v + half + out, z, b.device ? 1.4 : 2.2, tints[kind], k);
          add(b.u + half + out, b.v, z, b.device ? 1.4 : 2.2, tints[kind], k);
        });
      }
    });
    carsAt.forEach(function (car) {
      add(car.u, car.v, hill(car.u, car.v) + 0.12, 1.4, tints[car.kind], (0.35 + 0.9 * flow.starry) * Math.min(1.5, car.size));
    });
    return spots;
  }
  function drawLighting() {
    lighting.solids(solidsMesh());
    lighting.draw(ctx, {cam: cam, origin: flow.origin, width: flow.width, height: flow.height,
      land: {u0: LAND.u0, v0: LAND.v0, u1: LAND.u1, v1: LAND.v1, round: LAND_ROUND},
      reach: {u0: LAND.u0, v0: LAND.v0, u1: LAND.u1, v1: LAND.v1, low: -1, high: 7}},
    {way: shadowWay(), strength: flow.sunlight.strength, darkest: 0.32}, spotsNow());
  }

  // -------------------------------------------------------------- the scene --
  // A car drives its route, its tail lights behind it. Sharp, it lights the buildings it
  // goes into or out of, and is kept for the walls' light (or Ultra's); unlit while behind
  // a house's wall.
  function driveCar(particle, speed, seconds, pools, beaming, reach) {
    var route = particle.route, was = particle.s;
    particle.s += DRIVE * speed * seconds;
    if (!route) {
      return false;
    }
    var into = route.length - (route.into || 0), outOf = route.outOf || 0;
    if (sharp && route.to && was < into && particle.s >= into) {
      glow(route.to, particle.kind, particle.size);
    }
    if (sharp && route.from && was <= outOf && particle.s > outOf) {
      glow(route.from, particle.kind, particle.size);
    }
    if (particle.s >= route.length) {
      return false;
    }
    var inside = sharp && (particle.s > into || particle.s < outOf);
    var thick = Math.round(particle.size * 2) / 2, gap = 0.07 * particle.size;
    for (var step = 0; step < TAIL; step += 1) {
      var nearer = particle.s - step * gap, farther = nearer - gap;
      if (farther < 0) {
        break;
      }
      var a = along(route, nearer), b = along(route, farther);
      var from = iso(a.u, a.v, a.z + 0.02), to = iso(b.u, b.v, b.z + 0.02);
      trailPiece(particle.kind, thick, step, from.x, from.y, to.x, to.y);
    }
    var spot = along(route, particle.s), head = iso(spot.u, spot.v, spot.z + 0.02);
    if (inside) {
      return true;
    }
    flow.lights.glow(head.x, head.y, flow.glows[particle.kind].width * particle.size * 0.8 * GLOW, particle.kind);
    if (sharp) {
      var car = {u: spot.u, v: spot.v, kind: particle.kind, size: particle.size};
      var square = Math.floor(spot.u / CAR_CELL) + ',' + Math.floor(spot.v / CAR_CELL);
      carsAt.push(car);
      (carGrid[square] = carGrid[square] || []).push(car);
    }
    // Flat on the ground: as wide as the street and more, foreshortened.
    if (pools) {
      var wide = reach * Math.min(1.6, 0.7 + 0.4 * particle.size);
      ctx.globalAlpha = pools;
      ctx.drawImage(carLights[particle.kind], head.x - wide, head.y - 0.42 * wide, 2 * wide, 0.84 * wide);
    }
    if (beaming && particle.s + 0.4 < route.length) {
      var ahead = along(route, particle.s + 0.4);
      beams.push(head, iso(ahead.u, ahead.v, ahead.z + 0.02));
    }
    return true;
  }
  function drawBeams() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, (flow.starry - 0.3) / 0.4) * 0.55;
    var reach = 0.12 * cam.z;
    for (var b = 0; b < beams.length; b += 2) {
      var from = beams[b], to = beams[b + 1], dx = to.x - from.x, dy = to.y - from.y, long = Math.hypot(dx, dy) || 1;
      ctx.setTransform(dx / beam.width, dy / beam.width, -dy / long * reach / beam.height, dx / long * reach / beam.height, from.x, from.y);
      ctx.drawImage(beam, 0, -beam.height / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // flowView's scene: it fits itself to the screen; its light with the sky's; a device's
  // change resettles it; the data's routes are its streets; each frame its camera and
  // ground, the data driving the streets, then what stands over them and the air.
  var townScene = {
    turn: 0,
    // This frame: whether Ultra's light is on.
    ultra: false,
    // Its hills, sharp only.
    lift: sharp ? function (u, v) { return hill(u, v); } : null,
    // The town fills the screen between the corners' words, through its whole sway; low,
    // with the sky above.
    fit: function () {
      var reach = townBox();
      flow.unit = Math.min(flow.width * 0.96 / (reach.right - reach.left), flow.height * 0.76 / (reach.bottom - reach.top));
      flow.origin = {x: flow.width / 2 - flow.unit * (reach.left + reach.right) / 2,
        y: flow.height * 0.56 - flow.unit * (reach.top + reach.bottom) / 2};
      skyCanvas.width = flow.width;
      skyCanvas.height = flow.height;
      townDirty = true;
      steer(performance.now(), 0);
      sky();
    },
    sky: function () {
      var water = [23, 32, 42].map(function (c, i) { return Math.round(c + (flow.skyLow[i] - c) * 0.22 * (1 - 0.5 * flow.starry)); });
      waterShade = 'rgb(' + water + ')';
    },
    changed: function () {
      townDirty = true;
    },
    route: function (from, to, kind) {
      return from.mac ? from.routeBack : to.mac ? to.route : kind === 'down' ? wanDown : wanUp;
    },
    ground: function (time, seconds) {
      townScene.ultra = sharp && ultraOn();
      if (townDirty) {
        settle();
      }
      steer(time, seconds);
      drawGround(ctx, time, seconds);
    },
    drive: function (particles, speed, seconds) {
      var beaming = sharp && flow.starry > 0.3, pools = sharp && !townScene.ultra ? 0.025 + 0.05 * flow.starry : 0, reach = 0.55 * cam.z;
      if (pools) {
        ctx.globalCompositeOperation = 'lighter';
      }
      beams = [];
      carsAt = [];
      carGrid = {};
      var kept = particles.filter(function (particle) { return driveCar(particle, speed, seconds, pools, beaming, reach); });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      return kept;
    },
    over: function (time, seconds) {
      if (beams.length) {
        drawBeams();
      }
      drawShip(ctx, time, seconds);
      drawCraft(ctx, time, seconds);
      ctx.globalAlpha = 1;
      drawBuilt(ctx, seconds);
      if (townScene.ultra) {
        drawLighting();
      }
      // The air: the town's far side hazy, the hour's grade.
      if (sharp) {
        var farEdge = Math.min(iso(LAND.u0, LAND.v0).y, iso(LAND.u1, LAND.v0).y, iso(LAND.u0, LAND.v1).y, iso(LAND.u1, LAND.v1).y);
        atmosphere(ctx, farEdge, iso(MIDDLE.u, MIDDLE.v).y);
      }
    },
  };
  return townScene;
};
