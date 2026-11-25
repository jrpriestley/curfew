  // ---------------------------------------------------------------- scenery --
  // The slots, far to near. Heights are over the road's top (from `from` up to `to`); rate is
  // the share of the road's scroll; `fine` is pixels a unit for their tiles (far ones softer);
  // `change` is how much of a tile two biomes share as one gives way to the next. Tile
  // outlines come down to nothing at both ends, so one biome's meets the next's anywhere,
  // except `band` (solid to its floor) and `side` (the verge).
  // The nearer the faster, from the far layer to the road, with nothing drawn between two of them
  // at a rate outside theirs: else what's behind slides past what's in front. The skyline's
  // towers (RISE_RATE) stand between the mid layer and the band's farthest row.
  var RISE_RATE = 0.06;
  var SLOTS = [
    {key: 'far', from: 160, to: 70, rate: 0.05, haze: 0.62, fine: 1.5},
    {key: 'mid', from: 130, to: 70, rate: 0.055, haze: 0.48, fine: 2},
    {key: 'band', from: 70, to: 0, rate: 0.1, haze: 0.4, fine: 2, rows: [0.064, 0.158]},
    {key: 'hills', from: 76, to: 0, rate: 0.16, haze: 0.3, fine: 2.5},
    {key: 'near', from: 64, to: 0, rate: 0.25, haze: 0.2, fine: 3},
    {key: 'nearer', from: 70, to: 0, rate: 0.4, haze: 0.1, fine: 3.5},
    {key: 'side', from: 36, to: 0, rate: 0.62, haze: 0, fine: 4},
  ];
  var BIOMES = {
    country: {far: 'mountains', mid: 'ridges', band: 'fields', hills: 'downs', near: 'woods', nearer: 'copse', side: 'hedge',
      fore: 'tufts', rail: 'rail', lamps: false, verge: 'grass', clouds: 1},
    city: {far: 'skyline', mid: 'skyline', band: 'sprawl', hills: 'towers', near: 'towers', nearer: 'blocks', side: 'shops',
      fore: 'bollards', rail: 'barrier', lamps: true, verge: 'pavement', clouds: 0.8},
    desert: {far: 'mesas', mid: 'dunes', band: 'sands', hills: 'buttes', near: 'dunes', nearer: 'rocks', side: 'cacti',
      fore: 'scrub', rail: 'posts', lamps: false, verge: 'sandDark', clouds: 0.2},
    coast: {far: 'islands', mid: 'none', band: 'sea', hills: 'headlands', near: 'none', nearer: 'lighthouse', side: 'clifftop',
      fore: 'stones', rail: 'rail', lamps: false, verge: 'grass', clouds: 1.2},
    wasteland: {far: 'mesas', mid: 'dunes', band: 'wastes', hills: 'deadTowers', near: 'ruins', nearer: 'wrecks', side: 'junk',
      fore: 'debris', rail: 'broken', lamps: false, verge: 'dustDark', clouds: 0.35},
    future: {far: 'skyline', mid: 'skyline', band: 'grid', hills: 'domes', near: 'monorail', nearer: 'pods', side: 'planters',
      fore: 'markers', rail: 'glow', lamps: 'slim', verge: 'plaza', clouds: 0.6},
    atomic: {far: 'none', mid: 'none', band: 'suburb', hills: 'googie', near: 'none', nearer: 'diner', side: 'picket',
      fore: 'tufts', rail: 'rail', lamps: true, verge: 'grass', clouds: 0.8},
    aftermath: {far: 'deadSky', mid: 'deadSky', band: 'wastes', hills: 'deadTowers', near: 'ruins', nearer: 'wrecks', side: 'junk',
      fore: 'debris', rail: 'broken', lamps: false, verge: 'dustDark', clouds: 0.5},
    warzone: {far: 'none', mid: 'none', band: 'scorched', hills: 'bunkers', near: 'none', nearer: 'none', side: 'sandbags',
      fore: 'debris', rail: 'broken', lamps: false, verge: 'ash', clouds: 0.7},
    underworld: {far: 'none', mid: 'none', band: 'lavaSea', hills: 'blockCliffs', near: 'none', nearer: 'blockRocks', side: 'blockWall',
      fore: 'cinders', rail: 'posts', lamps: false, verge: 'hellDark', clouds: 0},
    asteroids: {far: 'none', mid: 'none', band: 'scorched', hills: 'none', near: 'none', nearer: 'rocks', side: 'junk',
      fore: 'debris', rail: 'broken', lamps: false, verge: 'ash', clouds: 0.5},
    badlands: {far: 'mesas', mid: 'dunes', band: 'salt', hills: 'dunes', near: 'none', nearer: 'stalls', side: 'chainlink',
      fore: 'scrub', rail: 'posts', lamps: false, verge: 'sandDark', clouds: 0.3},
  };
  // The road runs through ORDER in turn, from a random start, SPAN units each. Some spans
  // are swapped for a rarer biome that grows out of the one before it:
  //   after the desert: the wasteland (WASTE) or the badlands (BADLANDS), instead of the coast;
  //   after the city: the future (FUTURE) or the atomic city (ATOMIC), instead of the desert;
  //   after the coast: the warzone (WAR) or the asteroid field (ASTEROIDS), instead of the country;
  //   after the country: the underworld (UNDER), instead of the city.
  // Only after its parent, whose land is still going off as it comes on. The atomic city
  // turns to `aftermath` when the bombs fall, BLAST of the way along.
  var ORDER = ['country', 'city', 'desert', 'coast'], start = Math.floor(Math.random() * ORDER.length);
  var WASTE = 0.3, BADLANDS = 0.3, FUTURE = 0.3, ATOMIC = 0.3, BLAST = 0.42, WAR = 0.3, ASTEROIDS = 0.3, UNDER = 0.3;
  var luck = Math.floor(Math.random() * 1e6), spanOf = {};
  function spanBiome(n) {
    if (!spanOf[n]) {
      spanOf[n] = pickBiome(n);
    }
    return spanOf[n];
  }
  function pickBiome(n) {
    var before = n > 0 ? ORDER[(start + n - 1) % ORDER.length] : null;
    function chance(name) {
      return flow.hash(name + luck + '|' + n);
    }
    if (before === 'desert') {
      var desert = chance('waste');
      if (desert < WASTE) {
        return 'wasteland';
      }
      if (desert < WASTE + BADLANDS) {
        return 'badlands';
      }
    }
    if (before === 'city') {
      var city = chance('future');
      if (city < FUTURE) {
        return 'future';
      }
      if (city < FUTURE + ATOMIC) {
        return 'atomic';
      }
    }
    if (before === 'coast') {
      var coast = chance('war');
      if (coast < WAR) {
        return 'warzone';
      }
      if (coast < WAR + ASTEROIDS) {
        return 'asteroids';
      }
    }
    if (before === 'country' && chance('under') < UNDER) {
      return 'underworld';
    }
    return ORDER[(start + n) % ORDER.length];
  }
  // The span a piece of a layer at `at` is of. Every layer changes over at the same place,
  // passing mid-screen as the road's does, so the layers there are always of one biome.
  function spanOver(at, rate) {
    return spanAt((at - cols / 2) / rate - cols / 2);
  }
  // Where in a layer span `n` begins.
  function spanEdge(n, rate) {
    return (n * SPAN + cols / 2) * rate + cols / 2;
  }
  function spanNow(n) {
    var biome = spanBiome(n);
    return biome === 'atomic' && boomed[n] ? 'aftermath' : biome;
  }
  function biomeAt(at, rate) {
    return spanNow(spanOver(at, rate));
  }

  // Where one biome gives way to the next a tile of each is drawn, thinned toward the edge:
  // the old one's outlines sinking and its things fewer, the new one's rising. `thin(x)` is
  // how much of the kind being drawn is kept at x (0 to 1), or null when all of it is.
  var thin = null;
  function kept(x) {
    return !thin || flow.hash('kept' + Math.round(x)) < thin(x);
  }
  // A tile's skyline: heights 0 to 1 at each unit, down to nothing over `ends` at both ends.
  function outline(random, low, high, spacing, ends) {
    var big = noise(random, spacing), small = noise(random, spacing / 4), out = [];
    for (var x = 0; x <= TILE; x += 1) {
      var h = low + (high - low) * (0.78 * big(x) + 0.22 * small(x));
      var edge = Math.min(x, TILE - x) / ends;
      var eased = edge >= 1 ? h : h * (edge * edge * (3 - 2 * edge));
      out.push(eased * (thin ? thin(x) : 1));
    }
    return out;
  }
  // The area under an outline, down to the tile's floor, as the current path.
  function outlinePath(p, line, h) {
    p.beginPath();
    p.moveTo(0, h);
    for (var x = 0; x <= TILE; x += 2) {
      p.lineTo(x, h - line[x] * h);
    }
    p.lineTo(TILE, h);
    p.closePath();
  }
  function shape(p, line, h, fill) {
    outlinePath(p, line, h);
    p.fillStyle = fill;
    p.fill();
  }
  function rect(p, x, y, w, h, fill) {
    p.fillStyle = fill;
    p.fillRect(x, y, w, h);
  }
  function circle(p, x, y, r, fill) {
    p.fillStyle = fill;
    p.beginPath();
    p.arc(x, y, r, 0, 6.2832);
    p.fill();
  }
  // A block, for the underworld: speckled 4 by 4, seams, a lit top. An ember block glows
  // from within, so keeps its own colours by night.
  function cube(p, random, x, y, s, key, haze) {
    var glowing = key === 'ember', base = glowing ? [236, 190, 90] : tone(key, haze, true), px = s / 4;
    rect(p, x, y, s, s, css(base));
    for (var i = 0; i < 5; i += 1) {
      var shade = random();
      var speckle = shade < 0.5 ? [0, 0, 0] : glowing ? [255, 250, 210] : [255, 220, 200];
      var speckleX = x + Math.floor(random() * 4) * px, speckleY = y + Math.floor(random() * 4) * px;
      rect(p, speckleX, speckleY, px, px, css(blend(base, speckle, 0.18 + 0.12 * shade)));
    }
    rect(p, x, y, s, Math.max(0.3, px * 0.5), css(blend(base, [255, 230, 210], 0.15)));
    p.strokeStyle = css(blend(base, [0, 0, 0], 0.4));
    p.lineWidth = Math.min(0.4, s * 0.06);
    p.strokeRect(x + 0.1, y + 0.1, s - 0.2, s - 0.2);
  }
  function tree(p, random, x, bottom, size, haze, round) {
    if (!kept(x)) {
      return;
    }
    rect(p, x - 0.6, bottom - size * 0.3, 1.2, size * 0.3, stuff('earth', haze));
    if (round) {
      var r = size * 0.38, cy = bottom - size * 0.3 - r * 0.9;
      var leaves = p.createRadialGradient(x - r * 0.4, cy - r * 0.4, r * 0.2, x, cy, r * 1.1);
      leaves.addColorStop(0, stuff('treeLight', haze));
      leaves.addColorStop(0.6, stuff('tree', haze));
      leaves.addColorStop(1, stuff('treeDark', haze));
      circle(p, x, cy, r, leaves);
      return;
    }
    var w = size * 0.32, base = bottom - size * 0.2, top = bottom - size;
    p.beginPath();
    p.moveTo(x, top);
    p.lineTo(x - w, base);
    p.lineTo(x + w, base);
    p.closePath();
    // Pines are evergreen: not toned by the season.
    var needles = p.createLinearGradient(x - w, 0, x + w, 0);
    needles.addColorStop(0, stuff('pine', haze));
    needles.addColorStop(1, stuff('pineDark', haze));
    p.fillStyle = needles;
    p.fill();
  }
  var NEON_SIGNS = ['#ff4890', '#48e8ff', '#f8f048', '#a0ff60'];
  // `flat`: no mast on its roof, as in the band's rows.
  function building(p, random, x, w, h, bottom, haze, near, flat) {
    if (!kept(x + w / 2)) {
      return;
    }
    var face = ['city', 'cityDark', 'cityPale'][Math.floor(random() * 3)];
    var foot = face === 'cityPale' ? 'city' : 'cityDark';
    p.fillStyle = vertical(p, bottom - h, bottom, [[0, stuff(face, haze - 0.05)], [1, stuff(foot, haze)]]);
    p.fillRect(x, bottom - h, w, h);
    var sideWidth = Math.max(1, w * 0.12);
    rect(p, x + w - sideWidth, bottom - h, sideWidth, h, stuff('cityDark', haze, 0.6));
    if (random() < 0.3 && !flat) {
      rect(p, x + w * 0.5, bottom - h - 5, 0.6, 5, stuff('rail', haze));
    }
    var lit = light.night > 0.35, gapX = near ? 3 : 2.2, gapY = near ? 4 : 3;
    var unlit = stuff(lit ? 'cityDark' : 'window', haze + (lit ? 0 : 0.2), lit ? 1 : 0.7);
    for (var wy = bottom - h + 2.5; wy < bottom - 2; wy += gapY) {
      for (var wx = x + 1.6; wx < x + w - 1.6; wx += gapX) {
        // Every window draws the same three numbers lit or not, so the layout holds as
        // they come on one by one at dusk.
        var used = random(), when = random(), warm = random();
        var on = used < 0.4 && light.night > 0.2 + when * 0.4;
        var glass = on ? (warm < 0.7 ? '#f8d888' : '#cfe0fa') : unlit;
        rect(p, wx, wy, near ? 1.5 : 1, near ? 2 : 1.2, glass);
      }
    }
    var neon = random() < 0.35, which = random();
    if (near && lit && neon) {
      rect(p, x + 1.4, bottom - h * 0.7 - 0.8, Math.max(3, w - 2.8), 3.2, css([255, 255, 255], 0.12));
      rect(p, x + 2, bottom - h * 0.7, Math.max(3, w - 4), 1.6, NEON_SIGNS[Math.floor(which * 4)]);
    }
  }
  // One of the future's lights: dim by day, bright by night.
  function neon(which, alpha, haze) {
    var on = 0.45 + 0.55 * Math.min(1, light.night * 1.6);
    return css(blend(tone('steelPale', haze), NEON[which], on), alpha);
  }
  // A building gone to ruin: its top broken off ragged, floors open to the sky with their
  // slabs and bars showing, windows black and scorched above, sometimes a hole blown
  // through, sometimes leaning.
  function ruin(p, random, x, w, h, bottom, haze, near) {
    if (!kept(x + w / 2)) {
      return;
    }
    var face = random() < 0.5 ? 'concrete' : 'ash';
    var left = h * (0.75 + 0.25 * random()), right = h * (0.45 + 0.4 * random());
    var shell = new Path2D();
    shell.moveTo(x, bottom);
    shell.lineTo(x, bottom - left);
    for (var sx = x + 1 + random() * 2; sx < x + w - 1; sx += 1 + random() * (near ? 3 : 2)) {
      var top = left + (right - left) * ((sx - x) / w);
      shell.lineTo(sx, bottom - top * (0.86 + 0.14 * random()));
    }
    shell.lineTo(x + w, bottom - right);
    shell.lineTo(x + w, bottom);
    shell.closePath();
    p.save();
    if (random() < 0.25) {
      p.translate(x + w / 2, bottom);
      p.rotate((random() - 0.5) * 0.12);
      p.translate(-x - w / 2, -bottom);
    }
    p.fillStyle = vertical(p, bottom - h, bottom, [[0, stuff(face, haze - 0.05)], [1, stuff('concreteDark', haze)]]);
    p.fill(shell);
    p.save();
    p.clip(shell);
    var sideWidth = Math.max(1, w * 0.12);
    rect(p, x + w - sideWidth, bottom - h, sideWidth, h, stuff('scorch', haze, 0.45));
    var gapX = near ? 3 : 2.2, gapY = near ? 4 : 3, windowWidth = near ? 1.5 : 1;
    for (var wy = bottom - left + 2.5; wy < bottom - 2; wy += gapY) {
      for (var wx = x + 1.6; wx < x + w - 1.6; wx += gapX) {
        if (random() < 0.12) {
          continue;
        }
        rect(p, wx, wy, windowWidth, near ? 2 : 1.2, stuff('scorch', haze * 0.6));
        if (random() < 0.15) {
          var scorch = vertical(p, wy - gapY * 0.8, wy, [[0, stuff('scorch', haze, 0)], [1, stuff('scorch', haze, 0.55)]]);
          rect(p, wx - 0.2, wy - gapY * 0.8, windowWidth + 0.4, gapY * 0.8, scorch);
        }
      }
    }
    if (w > 12 && random() < 0.5) {
      blowHole(p, random, x, w, h, bottom, haze);
    }
    p.restore();
    // The broken floors sticking out at the top, and their bars.
    p.strokeStyle = stuff('concreteDark', haze);
    p.lineWidth = near ? 0.5 : 0.4;
    p.beginPath();
    for (var fy = bottom - right + gapY; fy < bottom - left * 0.5 && fy < bottom - 4; fy += gapY * (1 + Math.floor(random() * 2))) {
      if (random() < 0.5) {
        p.moveTo(x + w, fy);
        p.lineTo(x + w + 1 + random() * (near ? 3 : 2), fy + random() * 0.6);
      }
    }
    p.stroke();
    if (near) {
      p.strokeStyle = stuff('rustDark', haze);
      p.lineWidth = 0.25;
      p.beginPath();
      for (var b = 0; b < 4; b += 1) {
        var bx = x + 1 + random() * (w - 2);
        var by = bottom - (left + (right - left) * (bx - x) / w) * 0.88;
        p.moveTo(bx, by);
        p.lineTo(bx + (random() - 0.5) * 2, by - 2 - random() * 3);
      }
      p.stroke();
    }
    p.restore();
  }
  function blowHole(p, random, x, w, h, bottom, haze) {
    var hx = x + w * (0.2 + 0.5 * random()), hy = bottom - h * (0.3 + 0.35 * random()), hr = w * (0.12 + 0.12 * random());
    p.fillStyle = stuff('scorch', haze * 0.6);
    p.beginPath();
    for (var a = 0; a < 6.2832; a += 0.8) {
      var r = hr * (0.6 + 0.5 * random());
      p[a ? 'lineTo' : 'moveTo'](hx + Math.cos(a) * r, hy + Math.sin(a) * r * 1.2);
    }
    p.closePath();
    p.fill();
  }
  // The band is drawn as rows, far to near, each deeper than the last and scrolling at its
  // own rate (between SLOTS band's `rows`), so the land in front of the hills slides by in
  // perspective. Nothing drawn in a row may cross into the next: it would tear as they drift.
  var rowsOf = {};
  // The rate of the band's ground at `y`.
  function bandRate(y) {
    var band = SLOTS.filter(function (slot) { return slot.rows; })[0], down = (y - RT + band.from) / (band.from - band.to);
    return band.rows[0] + (band.rows[1] - band.rows[0]) * Math.max(0, Math.min(1, down));
  }
  function bandRows(h) {
    if (!rowsOf[h]) {
      var rows = [];
      for (var y = 0; y < h - 0.5;) {
        var deep = Math.min(2 + y * 0.16, h - y);
        rows.push([y, y + deep]);
        y += deep;
      }
      rowsOf[h] = rows;
    }
    return rowsOf[h];
  }
