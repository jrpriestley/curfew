  // ------------------------------------------------------------ the skyline --
  // What rises on the skyline where a biome has its own, in front of the far layers. Each
  // building is a sprite placed by a seeded generator per position, not flow.hash:
  // flow.hash runs too alike over neighbouring keys (`future34`, `future35`...), so a run of
  // them all fell in the share left empty.

  // The wasteland's distance: columns of black smoke from fires over the horizon, their
  // glow at the foot by night.
  function drawPlumes(time) {
    var rate = 0.06, layer = odometer * rate, t = time / 1000, puffs = sharp ? 22 : 10;
    var haze = smokeColour(blend(blend([52, 46, 44], skyColour('low'), 0.35), [10, 10, 16], light.night * 0.7));
    for (var m = Math.floor((layer - 120) / 230); m <= Math.floor((layer + cols + 40) / 230); m += 1) {
      var seed = seeded(m * 7919 + 41)(), at = m * 230 + seed * 120, biome = biomeAt(at, rate);
      if (seed > 0.5 || !/wasteland|aftermath/.test(biome)) {
        continue;
      }
      var x = at - layer, base = RT - 70 - seed * 8;
      for (var s = 0; s < puffs; s += 1) {
        var age = (t * 0.04 + s / puffs + seed) % 1;
        var px = x + (flow.windX * 30 + 10) * age * age + Math.sin(age * 7 + seed * 9) * 2;
        glow(px, base - age * 95, 9 + age * 22, haze, 0.7 * Math.pow(1 - age, 0.8) * Math.min(1, age * 10));
      }
      if (light.night > 0.2) {
        ctx.globalCompositeOperation = 'lighter';
        glow(x, base, 7, [255, 120, 40], 0.5 * Math.min(1, (light.night - 0.2) * 1.6));
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  // Each biome's skyline: its buildings' spacing, the share of places left empty, the
  // salt for its seeds, and how one is made (its size, and a draw for the sprite).
  var RISES = {
    underworld: {gap: 34, empty: 0.25, salt: 113, make: function (p, random) {
      var w = 18 + random() * 26, tall = 14 + random() * 26;
      return {width: w + 34, height: tall + 22, draw: function () { fortress(p, random, 2, w, tall, tall + 22); }};
    }},
    wasteland: {gap: 17, empty: 0.15, salt: 13, make: function (p, random) {
      var w = 8 + random() * 16, tall = 10 + Math.pow(random(), 1.4) * 48;
      return {width: w + 6, height: tall + 4, draw: function () { ruin(p, random, 1, w, tall, tall + 4, 0.45, false); }};
    }},
    atomic: {gap: 10, empty: 0.08, salt: 89, make: function (p, random) {
      var w = 6 + random() * 12, tall = 28 + Math.pow(random(), 1.2) * 84;
      return {width: w + 16, height: tall + 12, draw: function () { atomTower(p, random, 8, w, tall, tall + 12); }};
    }},
    warzone: {gap: 13, empty: 0.2, salt: 97, make: function (p, random) {
      var w = 6 + random() * 12, tall = 18 + Math.pow(random(), 1.6) * 62;
      return {width: w + 6, height: tall + 6, draw: function () { warTower(p, random, 2, w, tall, tall + 6); }};
    }},
    asteroids: {gap: 12, empty: 0.15, salt: 61, make: function (p, random) {
      var w = 7 + random() * 12, tall = 16 + Math.pow(random(), 1.4) * 58;
      return {width: w + 4, height: tall + 4, draw: function () { building(p, random, 2, w, tall, tall + 4, 0.45, false, true); }};
    }},
    // The same tower once a rock has hit it: the same draws, so the same size and place,
    // its lower part left standing.
    asteroidsHit: {make: function (p, random) {
      var w = 7 + random() * 12, tall = 16 + Math.pow(random(), 1.4) * 58;
      return {width: w + 4, height: tall + 4, draw: function () { ruin(p, random, 2, w, tall * HIT_LEFT, tall + 4, 0.45, false); }};
    }},
    badlands: {gap: 8, empty: 0.12, salt: 47, make: function (p, random) {
      var w = 4 + random() * 10, tall = 12 + Math.pow(random(), 1.6) * 62;
      return {width: w + 4, height: tall + 6, draw: function () { megablock(p, random, 1, w, tall, tall + 6); }};
    }},
    future: {gap: 26, empty: 0.3, salt: 31, make: futureSpires},
  };
  // One spire, or two with a sky bridge between them, or now and then a great one.
  function futureSpires(p, random) {
    var w = 5 + random() * 8, tall = 34 + Math.pow(random(), 1.2) * 70;
    var twin = random() < 0.35, mega = !twin && random() < 0.12;
    if (mega) {
      w *= 1.8;
      tall = 100 + random() * 10;
    }
    var w2 = twin ? 4 + random() * 6 : 0, gap = twin ? 6 + random() * 6 : 0, tall2 = tall * (0.6 + 0.3 * random());
    return {width: w + gap + w2 + 8, height: tall + 8, draw: function () {
      var bottom = tall + 8;
      if (twin) {
        spire(p, random, 4 + w + gap, w2, tall2, bottom, 0.45, false);
        var by = bottom - tall2 * (0.55 + 0.3 * random());
        rect(p, 4 + w - 0.5, by, gap + 1, 2.2, vertical(p, by, by + 2.2, [[0, stuff('steelPale', 0.45)], [1, stuff('glassDark', 0.45)]]));
        rect(p, 4 + w, by + 0.8, gap, 0.6, neon(0, 0.9, 0.45));
      }
      spire(p, random, 4, w, tall, bottom, 0.45, mega);
    }};
  }
  var ATOMIC_PAINTS = ['cream', 'teal', 'salmon', 'cream'];
  // The atomic city's towers: stepped and ribbed, a needle, a rocket on its fins, or a
  // dome. Their windows come on through dusk.
  function atomTower(p, random, x, w, tall, bottom) {
    var haze = 0.42, pick = random(), paint = ATOMIC_PAINTS[Math.floor(random() * 4)];
    // Draws a second number only when the first says it's dark enough, as it always has.
    var lit = function () {
      return light.night > 0.2 + random() * 0.4 && random() < 0.5;
    };
    var face = vertical(p, bottom - tall, bottom, [[0, stuff(paint, haze - 0.05)], [1, stuff(paint, haze + 0.1)]]);
    if (pick < 0.4) {
      steppedTower(p, x, w, tall, bottom, haze, face, lit);
    } else if (pick < 0.65) {
      needle(p, x, w, tall, bottom, haze, face);
    } else if (pick < 0.85) {
      rocketTower(p, x, w, tall, bottom, haze, face, lit);
    } else {
      ribbedDome(p, x, w, bottom, haze);
    }
  }
  function steppedTower(p, x, w, tall, bottom, haze, face, lit) {
    var tiers = 3, tw = w;
    for (var t = 0; t < tiers; t += 1) {
      var y0 = bottom - tall * (t + 1) / tiers, y1 = bottom - tall * t / tiers, xl = x + (w - tw) / 2;
      rect(p, xl, y0, tw, y1 - y0, face);
      p.fillStyle = stuff('cityDark', haze, 0.25);
      for (var rib = xl + 1.2; rib < xl + tw - 0.6; rib += 1.8) {
        p.fillRect(rib, y0 + 1, 0.4, y1 - y0 - 1);
      }
      for (var wy = y0 + 2; wy < y1 - 1; wy += 2.6) {
        if (lit()) {
          rect(p, xl + 1, wy, tw - 2, 0.7, '#ffe0a0');
        }
      }
      tw *= 0.72;
    }
    p.strokeStyle = stuff('steelPale', haze);
    p.lineWidth = 0.5;
    p.beginPath();
    p.moveTo(x + w / 2, bottom - tall);
    p.lineTo(x + w / 2, bottom - tall - 9);
    p.stroke();
    circle(p, x + w / 2, bottom - tall - 9, 0.7, stuff('salmon', haze));
  }
  function needle(p, x, w, tall, bottom, haze, face) {
    var mid = x + w / 2;
    p.fillStyle = face;
    p.beginPath();
    p.moveTo(mid - 2.6, bottom);
    p.lineTo(mid - 0.9, bottom - tall);
    p.lineTo(mid + 0.9, bottom - tall);
    p.lineTo(mid + 2.6, bottom);
    p.closePath();
    p.fill();
    var deck = bottom - tall * 0.85;
    p.fillStyle = stuff('teal', haze);
    p.beginPath();
    p.ellipse(mid, deck, w * 0.6 + 3, 2, 0, 0, 6.2832);
    p.fill();
    rect(p, mid - w * 0.4 - 1.5, deck - 2.8, w * 0.8 + 3, 1.6, light.night > 0.25 ? '#ffe6a8' : stuff('glassDark', haze));
    circle(p, mid, bottom - tall - 1.4, 1.6, stuff('salmon', haze));
  }
  function rocketTower(p, x, w, tall, bottom, haze, face, lit) {
    var cx = x + w / 2, rw = w * 0.42;
    p.fillStyle = face;
    p.beginPath();
    p.moveTo(cx - rw, bottom);
    p.lineTo(cx - rw, bottom - tall * 0.75);
    p.quadraticCurveTo(cx - rw, bottom - tall, cx, bottom - tall);
    p.quadraticCurveTo(cx + rw, bottom - tall, cx + rw, bottom - tall * 0.75);
    p.lineTo(cx + rw, bottom);
    p.closePath();
    p.fill();
    for (var ry = bottom - tall * 0.7; ry < bottom - 3; ry += 3) {
      circle(p, cx, ry, 0.6, lit() ? '#ffe0a0' : stuff('glassDark', haze));
    }
    p.fillStyle = stuff('salmon', haze);
    [-1, 1].forEach(function (side) {
      p.beginPath();
      p.moveTo(cx + side * rw, bottom - tall * 0.3);
      p.lineTo(cx + side * (rw + 6), bottom);
      p.lineTo(cx + side * rw, bottom);
      p.closePath();
      p.fill();
    });
  }
  function ribbedDome(p, x, w, bottom, haze) {
    p.fillStyle = vertical(p, bottom - w * 0.7, bottom, [[0, stuff('glass', haze)], [1, stuff('glassDark', haze)]]);
    p.beginPath();
    p.ellipse(x + w / 2, bottom, w / 2 + 4, w * 0.7, 0, Math.PI, 0);
    p.fill();
    p.strokeStyle = stuff('cream', haze, 0.6);
    p.lineWidth = 0.3;
    p.beginPath();
    for (var d = -2; d <= 2; d += 1) {
      p.ellipse(x + w / 2, bottom, Math.abs(d) * (w / 2 + 4) / 3 + 0.01, w * 0.7, 0, Math.PI, 0);
    }
    p.stroke();
  }
  // The underworld's fortresses: a keep of dark brick with battlements, a tower at one
  // end or both, windows glowing with fire, and a bridge on arches running off from it.
  function fortress(p, random, x, w, tall, bottom) {
    var haze = 0.4, B = 3, keepTop = bottom - Math.round(tall / B) * B;
    function wall(x0, top, wide) {
      for (var bx = x0; bx < x0 + wide - 0.1; bx += B) {
        for (var by = top; by < bottom - 0.1; by += B) {
          cube(p, random, bx, by, B, by < top + B ? 'brick' : 'brickDark', haze);
        }
      }
      for (bx = x0; bx < x0 + wide - 0.1; bx += 2 * B) {
        cube(p, random, bx, top - B, B, 'brick', haze);
      }
    }
    var deck = bottom - Math.round(tall * 0.45 / B) * B, bridge = 30;
    for (var a = x + w; a < x + w + bridge; a += 12) {
      rect(p, a, deck, 12, B, css(tone('brick', haze, true)));
      rect(p, a + 9, deck, B, bottom - deck, css(tone('brickDark', haze, true)));
    }
    var keepWidth = Math.round(w / B) * B;
    wall(x, keepTop, keepWidth);
    var towers = random() < 0.5 ? [x] : [x, x + keepWidth - 2 * B];
    towers.forEach(function (tx) {
      wall(tx, keepTop - Math.round((8 + random() * 12) / B) * B, 2 * B);
    });
    for (var win = 0; win < 4; win += 1) {
      var wx = x + B + Math.floor(random() * (w / B - 2)) * B + 0.8;
      var wy = keepTop + B * (1 + Math.floor(random() * Math.max(1, tall / B - 2))) + 0.6;
      rect(p, wx, wy, 1.4, 1.8, 'rgba(255, 150, 50, 0.9)');
    }
  }
  // The warzone city's towers: dark slabs angled at the top, bands of cold light, a mast;
  // some hit, a bite out of the top and fire in the holes.
  function warTower(p, random, x, w, tall, bottom) {
    var haze = 0.5, cut = random() < 0.4, slant = w * (0.2 + 0.4 * random()), top = bottom - tall;
    var shape = new Path2D();
    shape.moveTo(x, bottom);
    shape.lineTo(x, top + slant);
    shape.lineTo(x + w * 0.6, top);
    if (cut) {
      shape.lineTo(x + w * 0.7, top + tall * 0.12);
      shape.lineTo(x + w * 0.85, top + tall * 0.06);
    }
    shape.lineTo(x + w, top + (cut ? tall * 0.1 : 0));
    shape.lineTo(x + w, bottom);
    shape.closePath();
    p.fillStyle = vertical(p, top, bottom, [[0, stuff('cityDark', haze)], [1, stuff('towerDark', haze * 0.6)]]);
    p.fill(shape);
    p.save();
    p.clip(shape);
    var band = css([120, 180, 230], 0.25 + 0.35 * Math.min(1, light.night * 1.6));
    for (var bx = x + 1.5; bx < x + w - 1; bx += 3 + random() * 2) {
      rect(p, bx, top + slant, 0.5, tall, band);
    }
    if (cut) {
      for (var f = 0; f < 3; f += 1) {
        var fy = top + tall * (0.12 + 0.3 * random()), fx = x + random() * w;
        p.fillStyle = 'rgba(255, 130, 40, 0.8)';
        p.beginPath();
        p.ellipse(fx, fy, 1.2 + random(), 0.8, 0, 0, 6.2832);
        p.fill();
      }
    }
    p.restore();
    if (random() < 0.4) {
      mast(p, x + w * 0.6, top, 7, haze, '#ff3030', 0.5);
    }
  }
  function mast(p, x, top, high, haze, lamp, lampSize) {
    p.strokeStyle = stuff('cityDark', haze);
    p.lineWidth = 0.3;
    p.beginPath();
    p.moveTo(x, top);
    p.lineTo(x, top - high);
    p.stroke();
    circle(p, x, top - high, lampSize, lamp);
  }
  var MEGA_WINDOWS = ['#f8d890', '#ff70c8', '#70e8ff'];
  // The megacity's towers far off: dark in the haze, set back near the top, an antenna
  // now and then, windows a scatter of warm, pink and cyan as it darkens.
  function megablock(p, random, x, w, tall, bottom) {
    var haze = 0.55, step = random() < 0.5 ? tall * (0.15 + 0.15 * random()) : 0, inset = w * (0.15 + 0.15 * random());
    var setBack = inset * (step ? 1 : 0), shoulder = bottom - tall + step;
    var shape = new Path2D();
    shape.moveTo(x, bottom);
    shape.lineTo(x, shoulder);
    shape.lineTo(x + inset, shoulder);
    shape.lineTo(x + inset, bottom - tall);
    shape.lineTo(x + w - setBack, bottom - tall);
    shape.lineTo(x + w - setBack, shoulder);
    shape.lineTo(x + w, shoulder);
    shape.lineTo(x + w, bottom);
    shape.closePath();
    p.fillStyle = vertical(p, bottom - tall, bottom, [[0, stuff('cityDark', haze)], [1, stuff('cityDark', haze * 0.7)]]);
    p.fill(shape);
    p.save();
    p.clip(shape);
    // By day, its glass catches the sky.
    var glass = stuff('cityPale', haze, 0.3 * (1 - light.night));
    for (var wy = bottom - tall + 2; wy < bottom - 1; wy += 1.8) {
      for (var wx = x + 0.8; wx < x + w - 0.8; wx += 1.6) {
        // The second draw only when the first lands, as it always has: the order is the layout.
        var on = random() < 0.22 && light.night > 0.15 + random() * 0.45, hue = random();
        if (on) {
          rect(p, wx, wy, 0.7, 0.8, MEGA_WINDOWS[hue < 0.6 ? 0 : hue < 0.8 ? 1 : 2]);
        } else if (hue < 0.5) {
          rect(p, wx, wy, 0.7, 0.8, glass);
        }
      }
    }
    p.restore();
    if (random() < 0.3) {
      mast(p, x + w / 2, bottom - tall, 5, haze, '#ff4040', 0.45);
    }
  }
  // A spire tapering to a point: glass in bands lit floor by floor through dusk, a seam
  // of light up it, an antenna; a great one crowned in light.
  function spire(p, random, x, w, tall, bottom, haze, mega) {
    var taper = w * (0.15 + 0.2 * random()), top = bottom - tall, body = new Path2D();
    body.moveTo(x, bottom);
    body.lineTo(x + taper, top + w * 0.6);
    body.lineTo(x + w / 2, top);
    body.lineTo(x + w - taper, top + w * 0.6);
    body.lineTo(x + w, bottom);
    body.closePath();
    var glass = p.createLinearGradient(x, 0, x + w, 0);
    glass.addColorStop(0, stuff('glass', haze - 0.1));
    glass.addColorStop(0.45, stuff('steelPale', haze));
    glass.addColorStop(1, stuff('glassDark', haze));
    p.fillStyle = glass;
    p.fill(body);
    p.save();
    p.clip(body);
    var floorGlass = stuff('glassDark', haze, light.night > 0.3 ? 0.9 : 0.35);
    for (var y = top + w; y < bottom - 2; y += 2.4) {
      var on = random() < 0.45 && light.night > 0.2 + random() * 0.4;
      var from = random() * w * 0.6, part = w * (0.15 + 0.3 * random()), warm = random();
      rect(p, x, y, w, 0.9, floorGlass);
      if (on) {
        rect(p, x + from, y, part, 0.9, css(blend([255, 230, 190], [200, 230, 255], warm), 0.85));
      }
    }
    rect(p, x + w * 0.5 - 0.3, top, 0.6, tall, neon(random() < 0.7 ? 0 : 1, 0.8, haze));
    p.restore();
    p.strokeStyle = stuff('steel', haze);
    p.lineWidth = 0.35;
    p.beginPath();
    p.moveTo(x + w / 2, top);
    p.lineTo(x + w / 2, top - 6);
    p.stroke();
    circle(p, x + w / 2, top - 6, 0.6, '#ff5050');
    if (mega) {
      for (var c = 0; c < 3; c += 1) {
        rect(p, x + taper + 0.5, top + w * 0.7 + c * 2.2, w - 2 * taper - 1, 0.8, neon(c === 1 ? 1 : 0, 0.9, haze));
      }
    }
  }
  var riseSprites = {};
  function riseSprite(key, rise, seed, fine) {
    var have = riseSprites[key], canvas = have ? have.canvas : document.createElement('canvas'), p = canvas.getContext('2d');
    var built = rise.make(p, seeded(Math.round(seed * 1e6)));
    canvas.width = Math.ceil(built.width * fine);
    canvas.height = Math.ceil(built.height * fine);
    p.setTransform(fine, 0, 0, fine, 0, 0);
    p.clearRect(0, 0, built.width, built.height);
    built.draw();
    return (riseSprites[key] = {canvas: canvas, width: built.width, height: built.height, version: version, used: Date.now()});
  }
  // Each building stands where its piece of the layer is of its biome (`spanOver`).
  // Sprites are remade for the light at the `remakes` pace.
  function drawRises(now) {
    var rate = 0.07, layer = odometer * rate, fine = Math.min(k, 2), made = 0;
    Object.keys(RISES).forEach(function (biome) {
      var rise = RISES[biome];
      if (!rise.gap) {
        return;
      }
      for (var m = Math.floor((layer - 40) / rise.gap); m <= Math.floor((layer + cols) / rise.gap); m += 1) {
        var seed = seeded(m * 7919 + rise.salt)(), at = m * rise.gap + seed * rise.gap * 0.35;
        var where = biomeAt(at, rate);
        var ruined = (biome === 'atomic' && where === 'aftermath') || (biome === 'asteroids' && smashed[m]);
        // The atomic city's skyline stays on through its span's aftermath, in ruins.
        if (seed > 1 - rise.empty || (where !== biome && !(ruined && where === 'aftermath'))) {
          continue;
        }
        var key = biome + (ruined ? '-ruined' : '') + m, have = riseSprites[key];
        if (!have || (have.version !== version && made < remakes)) {
          made += 1;
          have = riseSprite(key, ruined ? (biome === 'asteroids' ? RISES.asteroidsHit : RISES.wasteland) : rise, seed, fine);
        }
        if (biome === 'atomic' && warmingRuins()) {
          made += warmRuin(biome + '-ruined' + m, seed, fine, now, made);
        }
        have.used = now;
        ctx.drawImage(have.canvas, Math.round((at - layer) * k) / k, RT - 66 - have.height, have.width, have.height);
      }
    });
  }
  // A tower's ruin made ready before the bombs, at the pace of a remake, and kept. Returns
  // how many it made.
  function warmRuin(key, seed, fine, now, made) {
    if (riseSprites[key]) {
      riseSprites[key].used = now;
      return 0;
    }
    if (made >= remakes) {
      return 0;
    }
    riseSprite(key, RISES.wasteland, seed, fine).used = now;
    return 1;
  }
  // The future's holograms: panels of light over the pods (at the nearer layer's rate),
  // their colours turning, scan lines rolling, a flicker now and then.
  function drawHolos(time) {
    var rate = 0.4, layer = odometer * rate, t = time / 1000;
    ctx.globalCompositeOperation = 'lighter';
    for (var m = Math.floor((layer - 60) / 190); m <= Math.floor((layer + cols + 10) / 190); m += 1) {
      var seed = seeded(m * 7919 + 53)(), at = m * 190 + seed * 80;
      if (seed > 0.65 || biomeAt(at, rate) !== 'future') {
        continue;
      }
      var x = at - layer, w = 22 + seed * 30, high = 12 + seed * 8;
      var y = RT - 44 - seed * 10 + Math.sin(t * 0.8 + seed * 9) * 0.6;
      var hue = (t * 0.05 + seed) % 1, c = blend(NEON[0], NEON[1], 0.5 + 0.5 * Math.sin(hue * 6.2832));
      var flicker = Math.sin(t * 31 + seed * 50) > 0.97 ? 0.4 : 1;
      var strength = (0.35 + 0.35 * Math.min(1, light.night * 1.6)) * flicker;
      rect(ctx, x, y, w, high, css(c, 0.22 * strength));
      ctx.strokeStyle = css(c, 0.8 * strength);
      ctx.lineWidth = 0.4;
      ctx.strokeRect(x, y, w, high);
      for (var scan = (t * 6) % 2; scan < high; scan += 2) {
        rect(ctx, x, y + scan, w, 0.3, css(c, 0.18 * strength));
      }
      // What it shows: bars, turning over.
      rect(ctx, x + w * 0.15, y + high * 0.3, w * (0.3 + 0.4 * ((t * 0.2 + seed) % 1)), 1.6, css(c, 0.7 * strength));
      rect(ctx, x + w * 0.15, y + high * 0.6, w * 0.5, 1, css(c, 0.5 * strength));
      // Its beam from the emitter.
      ctx.fillStyle = css(c, 0.12 * strength);
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 1.5, RT - 4);
      ctx.lineTo(x, y + high);
      ctx.lineTo(x + w, y + high);
      ctx.lineTo(x + w / 2 + 1.5, RT - 4);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // The badlands' adverts: tall banners of light hung over the megacity, adverts scrolling up
  // or down each without end (invented shapes, no words), brighter as it darkens. They're
  // dimmer toward the badlands' ends, over ADVERT_FADE of road.
  var ADS = [[255, 60, 170], [60, 230, 255], [255, 200, 60], [150, 90, 255], [90, 255, 150]], ADVERT_FADE = 1200;
  var AD_WIDE = 16, AD_TALL = 25, AD_GAP = 2, STRIP_TALL = ADS.length * (AD_TALL + AD_GAP), STRIPS = 3;
  function drawAdverts(time) {
    var rate = 0.07, layer = odometer * rate, t = time / 1000, bright = 0.4 + 0.6 * Math.min(1, light.night * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    for (var m = Math.floor((layer - 60) / 62); m <= Math.floor((layer + cols + 30) / 62); m += 1) {
      // Neighbouring seeds draw alike, and the banners stood in a row: scattered first.
      var random = seeded((Math.abs(Math.sin(m * 12.9898 + 59) * 43758.5453) % 1) * 2e9), seed = random(), at = m * 62 + seed * 34;
      if (seed > 0.75 || biomeAt(at, rate) !== 'badlands') {
        continue;
      }
      var into = (at - spanEdge(spanOver(at, rate), rate)) / rate;
      var present = flow.smoothstep(Math.min(into, SPAN - into) / ADVERT_FADE);
      var flicker = Math.sin(t * 27 + seed * 40) > 0.97 ? 0.5 : 1;
      banner(at - layer, random, bright * flicker * present, t);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function banner(x, random, s, t) {
    var strip = adStrip(Math.floor(random() * STRIPS)), wide = AD_WIDE * (0.8 + 0.5 * random());
    var top = 10 + random() * 46, base = RT - 66, bottom = base - 8 - random() * 14, tall = bottom - top;
    var speed = (5 + 5 * random()) * (random() < 0.7 ? 1 : -1), start = random() * STRIP_TALL;
    var offset = (((start + t * speed) % STRIP_TALL) + STRIP_TALL) % STRIP_TALL;
    var px = Math.round((x - wide / 2) * k) / k;
    // The strip from its offset on, round again from its top as often as the banner's tall.
    ctx.globalAlpha = s;
    for (var down = 0, from = offset; down < tall; from = 0) {
      var part = Math.min(STRIP_TALL - from, tall - down), q = strip.height / STRIP_TALL;
      ctx.drawImage(strip, 0, from * q, strip.width, part * q, px, top + down, wide, part);
      down += part;
    }
    ctx.globalAlpha = 1;
    // Its light is the advert's at its middle, easing into the next. In eighths: each
    // colour's glow is a sprite made once.
    var place = (offset + tall / 2) / (AD_TALL + AD_GAP), ad = Math.floor(place);
    var next = Math.round(flow.smoothstep((place - ad - 0.75) / 0.25) * 8) / 8;
    var c = blend(ADS[ad % ADS.length], ADS[(ad + 1) % ADS.length], next).map(Math.round);
    bannerFrame(px, top, wide, tall, c, s, t);
    rect(ctx, x - 0.3, bottom, 0.6, base - bottom, css(c, 0.3 * s));
    if (light.night > 0.2) {
      glow(x, base, 8, c, 0.5 * s * Math.min(1, (light.night - 0.2) * 2));
    }
    adLights.push({x: x, c: c, s: s});
  }
  // A line down each side, a light running along it, and a cap at each end.
  function bannerFrame(px, top, wide, tall, c, s, t) {
    var run = (t * 22) % (tall + 20) - 20;
    [px - 0.9, px + wide + 0.4].forEach(function (side) {
      rect(ctx, side, top, 0.5, tall, css(c, 0.5 * s));
      rect(ctx, side, top + Math.max(0, run), 0.5, Math.max(0, Math.min(20, tall - run, run + 20)), css([255, 255, 255], 0.35 * s));
    });
    rect(ctx, px - 1.6, top - 1, wide + 3.2, 1, css(c, 0.8 * s));
    rect(ctx, px - 1.6, top + tall, wide + 3.2, 1, css(c, 0.8 * s));
  }
  // A strip of the adverts, one in each colour, drawn once at the screen's pixels.
  var adStrips = {};
  function adStrip(which) {
    if (adStrips[which] && adStrips[which].k === k) {
      return adStrips[which].canvas;
    }
    var made = document.createElement('canvas'), p = made.getContext('2d'), random = seeded(which * 7919 + 241);
    made.width = Math.ceil(AD_WIDE * k);
    made.height = Math.ceil(STRIP_TALL * k);
    p.setTransform(made.width / AD_WIDE, 0, 0, made.height / STRIP_TALL, 0, 0);
    ADS.forEach(function (c, n) {
      advertPanel(p, n * (AD_TALL + AD_GAP) + AD_GAP / 2, c, (n * 2 + which) % AD_PICTURES.length, random);
    });
    adStrips[which] = {canvas: made, k: k};
    return made;
  }
  function advertPanel(p, y, c, picture, random) {
    p.fillStyle = vertical(p, y, y + AD_TALL, [[0, css(c, 0.34)], [1, css(c, 0.12)]]);
    p.fillRect(0, y, AD_WIDE, AD_TALL);
    p.strokeStyle = css(c, 0.55);
    p.lineWidth = 0.3;
    p.strokeRect(0.15, y + 0.15, AD_WIDE - 0.3, AD_TALL - 0.3);
    p.fillStyle = p.strokeStyle = css(c, 0.8);
    AD_PICTURES[picture](p, AD_WIDE / 2, y + 9, 5);
    // Small print: blocks, no letters.
    for (var line = 0; line < 3; line += 1) {
      for (var x = 1.6; x < AD_WIDE - 2;) {
        var long = 0.8 + random() * 2.2;
        if (random() < 0.75) {
          rect(p, x, y + 17 + line * 2.4, Math.min(long, AD_WIDE - 1.6 - x), 1.1, css(c, line ? 0.4 : 0.75));
        }
        x += long + 0.6;
      }
    }
    for (var scan = y; scan < y + AD_TALL; scan += 1.5) {
      rect(p, 0, scan, AD_WIDE, 0.25, 'rgba(0, 0, 0, 0.25)');
    }
  }
  // Each fills about `r` round its middle, in the current fill and stroke.
  var AD_PICTURES = [
    function ring(p, cx, cy, r) {
      p.beginPath();
      p.arc(cx, cy, r, 0, 6.2832);
      p.arc(cx, cy, r * 0.6, 0, 6.2832, true);
      p.fill();
    },
    function bars(p, cx, cy, r) {
      [0.5, 0.9, 0.65, 1.2].forEach(function (tall, b) {
        p.fillRect(cx - r + b * r * 0.53, cy + r - tall * r * 1.5, r * 0.4, tall * r * 1.5);
      });
    },
    function triangle(p, cx, cy, r) {
      p.beginPath();
      p.moveTo(cx, cy - r);
      p.lineTo(cx + r, cy + r * 0.8);
      p.lineTo(cx - r, cy + r * 0.8);
      p.closePath();
      p.fill();
    },
    function eye(p, cx, cy, r) {
      p.lineWidth = 0.8;
      p.beginPath();
      p.moveTo(cx - r * 1.2, cy);
      p.quadraticCurveTo(cx, cy - r * 1.4, cx + r * 1.2, cy);
      p.quadraticCurveTo(cx, cy + r * 1.4, cx - r * 1.2, cy);
      p.stroke();
      circle(p, cx, cy, r * 0.42, p.fillStyle);
    },
    function waves(p, cx, cy, r) {
      p.lineWidth = 0.9;
      p.beginPath();
      for (var w = -1; w <= 1; w += 1) {
        p.moveTo(cx - r, cy + w * r * 0.6);
        p.quadraticCurveTo(cx - r * 0.5, cy + w * r * 0.6 - r * 0.6, cx, cy + w * r * 0.6);
        p.quadraticCurveTo(cx + r * 0.5, cy + w * r * 0.6 + r * 0.6, cx + r, cy + w * r * 0.6);
      }
      p.stroke();
    },
  ];
  // The badlands' wind farm: old many-bladed windmills on lattice towers, turning with the
  // wind. Two rows (at the hills' and the near layer's rates). Drawn live as they turn, so
  // darkened by hand for the night.
  function drawMills(time, rate, size, gap, salt) {
    var layer = odometer * rate, t = time / 1000, dim = light.night * 0.85, foot = RT - 1;
    var metal = css(blend(blend(STUFF.tower, [190, 170, 150], 0.35 - size * 0.25), [10, 10, 20], dim));
    var dark = css(blend(STUFF.towerDark, [6, 6, 14], dim));
    for (var m = Math.floor((layer - 40) / gap); m <= Math.floor((layer + cols + 40) / gap); m += 1) {
      var seed = seeded(m * 7919 + salt)(), at = m * gap + seed * gap * 0.4;
      if (seed > 0.75 || biomeAt(at, rate) !== 'badlands') {
        continue;
      }
      var x = at - layer, tall = (34 + seed * 10) * size, hub = foot - tall, r = 9 * size;
      var spin = t * (0.8 + seed * 1.2) * (1 + 0.5 * Math.abs(flow.windX)) + seed * 9;
      millTower(x, foot, tall, hub, r, size, metal);
      // The tail vane.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x + r * 0.9, hub - r * 0.45);
      ctx.lineTo(x + r * 1.3, hub - r * 0.3);
      ctx.lineTo(x + r * 1.3, hub + r * 0.3);
      ctx.lineTo(x + r * 0.9, hub + r * 0.2);
      ctx.closePath();
      ctx.fill();
      millFan(x, hub, r, spin, size, metal, dark);
    }
  }
  function millTower(x, foot, tall, hub, r, size, metal) {
    ctx.strokeStyle = metal;
    ctx.lineWidth = 0.5 * size + 0.2;
    ctx.beginPath();
    ctx.moveTo(x - 4 * size, foot);
    ctx.lineTo(x - 0.8 * size, hub + 1);
    ctx.moveTo(x + 4 * size, foot);
    ctx.lineTo(x + 0.8 * size, hub + 1);
    for (var h0 = 0; h0 < tall - 4 * size; h0 += 5 * size) {
      var w0 = 4 * size - 3.2 * size * h0 / tall, w1 = 4 * size - 3.2 * size * (h0 + 5 * size) / tall;
      ctx.moveTo(x - w0, foot - h0);
      ctx.lineTo(x + w1, foot - h0 - 5 * size);
      ctx.moveTo(x + w0, foot - h0);
      ctx.lineTo(x - w1, foot - h0 - 5 * size);
    }
    // The tail's boom.
    ctx.moveTo(x, hub);
    ctx.lineTo(x + r * 1.1, hub);
    ctx.stroke();
  }
  function millFan(x, hub, r, spin, size, metal, dark) {
    ctx.fillStyle = metal;
    ctx.beginPath();
    for (var b = 0; b < 18; b += 1) {
      var a = spin + b * 0.349, a1 = a + 0.13;
      ctx.moveTo(x + Math.cos(a) * r * 0.2, hub + Math.sin(a) * r * 0.2);
      ctx.lineTo(x + Math.cos(a) * r, hub + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a1) * r, hub + Math.sin(a1) * r);
      ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.4 * size + 0.15;
    ctx.beginPath();
    ctx.arc(x, hub, r, 0, 6.2832);
    ctx.moveTo(x + r * 0.55, hub);
    ctx.arc(x, hub, r * 0.55, 0, 6.2832);
    ctx.stroke();
    circle(ctx, x, hub, r * 0.16, dark);
  }
