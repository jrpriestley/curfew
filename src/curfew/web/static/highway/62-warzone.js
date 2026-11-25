  // ------------------------------------------------------------- the warzone --
  // Great guns in the middle distance (at the hills' rate), about one in sight at a time:
  // a stepped bunker, an armoured turret, a banded barrel raised on a ram. Every few seconds
  // one charges (bands and vents brightening) and fires a laser
  // pulse into space for PULSE seconds: the barrel slams back and the gun pitches up and
  // is braced back while the pulse lasts, then eases back as steam bursts from its vents. A shot
  // in sight flashes the whole screen a little (`smallFlash`), the light lingering faintly
  // while it fires, and is heard.
  var smallFlash = 0, gunLast = {}, gunCharging = {};
  var GUN_LENGTH = 96, PIVOT_X = 10, PIVOT_Y = -54;
  var CHARGE = 1.6, PULSE = 2.4, PULSE_FADE = 0.6, GUN_SETTLE = 1.6, COOLS = 2.6;
  // Cyan or red, by the gun.
  var LASERS = [[150, 230, 255], [255, 96, 72]];
  function drawGuns(time) {
    var rate = 0.16, layer = odometer * rate, t = time / 1000, dim = light.night * 0.8;
    var paint = {
      steel: css(blend([96, 100, 112], [14, 14, 22], dim)),
      steelLight: css(blend([140, 146, 160], [24, 24, 34], dim)),
      dark: css(blend([50, 52, 60], [6, 6, 12], dim)),
      concrete: css(blend([58, 56, 58], [9, 9, 14], dim)),
      band: css(blend([62, 64, 74], [8, 8, 14], dim)),
      shadowSide: css(blend([34, 34, 40], [4, 4, 8], dim)),
    };
    for (var m = Math.floor((layer - 160) / 420); m <= Math.floor((layer + cols + 160) / 420); m += 1) {
      var seed = seeded(m * 7919 + 101)(), at = m * 420 + seed * 160;
      if (seed > 0.85 || biomeAt(at, rate) !== 'warzone') {
        continue;
      }
      var x = at - layer, foot = RT - 1;
      var gun = aimGun(seed, t);
      var inSight = x > -40 && x < cols + 40;
      if (gunLast[m] !== undefined && gun.phase < gunLast[m] && inSight) {
        smallFlash = Math.max(smallFlash, 0.22);
      }
      if (inSight && gun.power > 0) {
        smallFlash = Math.max(smallFlash, 0.05 * gun.power);
      }
      if (flow.sound && gun.charge > 0 && gun.charge < 0.5 && !gunCharging[m]) {
        hearGun(x, CHARGE * (1 - gun.charge), velocity * rate);
      }
      gunCharging[m] = gun.charge > 0;
      gunLast[m] = gun.phase;
      ctx.save();
      ctx.translate(x, foot);
      ctx.scale(gun.way, 1);
      gunBunker(paint, gun);
      gunTurret(paint, gun, t);
      gunBarrel(paint, gun);
      ctx.globalCompositeOperation = 'lighter';
      var blink = Math.sin(t * 3 + seed * 20) > 0.7 ? 1 : 0.15;
      glow(-54, -15, 3.4, [255, 40, 30], blink);
      glow(54, -15, 3.4, [255, 40, 30], 1.15 - blink);
      ctx.restore();
      gunShot(x, foot, gun, m, dim, t);
    }
  }
  // Its shot asked for as it charges, so that it's heard as it fires (`until` seconds on), from
  // where it will have scrolled to by then, or by halfway through its pulse.
  function hearGun(x, until, scroll) {
    var fires = x - scroll * until, halfway = fires - scroll * PULSE / 2;
    [['charge', 0.2, until - CHARGE, x], ['cannon', 0.6, until, fires], ['beam', 0.2, until, halfway], ['hum', 0.28, until, halfway],
      ['vent', 0.34, until + VENT, fires - scroll * VENT]].forEach(function (part) {
      var loud = part[1] * heardAt(part[3]);
      if (loud > 0.01) {
        flow.sound.shot(part[0], loud, part[2], part[3] / cols * 2 - 1);
      }
    });
  }
  // Where a gun is in its cycle (phase 0 is the shot) and how that moves its barrel, and only
  // that: hunting for a target and settling on it, following it as it charges,
  // slammed back and pitched up as it fires, braced through the pulse, then easing back on
  // its ram.
  function aimGun(seed, t) {
    var gun = {way: seed < 0.4 ? -1 : 1, laser: LASERS[seed > 0.62 ? 0 : 1], seed: seed};
    var period = 10 + seed * 4, phase = (t + seed * 13) % period;
    gun.phase = phase;
    seekTarget(gun, Math.floor((t + seed * 13) / period), phase, period);
    gun.charge = phase > period - CHARGE ? (phase - (period - CHARGE)) / CHARGE : 0;
    gun.power = phase < PULSE ? Math.min(1, (PULSE - phase) / PULSE_FADE) : 0;
    var firing = phase < PULSE;
    var after = phase - PULSE;
    // Heated by the pulse, over what's left from the one before.
    gun.heat = Math.max(firing ? Math.pow(phase / PULSE, 0.6) : 0, Math.exp(-Math.max(0, firing ? after + period : after) / COOLS));
    if (firing) {
      gun.recoil = 10 + 5 * Math.exp(-phase * 8);
    } else if (after < GUN_SETTLE) {
      gun.recoil = 10 * Math.pow(1 - after / GUN_SETTLE, 2);
    } else {
      gun.recoil = 0;
    }
    gun.lift += firing ? 0.07 * Math.exp(-phase * 4) : 0;
    return gun;
  }
  // Its aim: where it last shot till it's settled, then swung in stages, a look and a pause at
  // each of SEEKS, to its next target, far off and out of sight, which it follows as it drifts.
  var SEEKS = 3, DRIFT = 0.018;
  function seekTarget(gun, n, phase, period) {
    var from = PULSE + GUN_SETTLE, locked = period - CHARGE - 0.5;
    var leg = (phase - from) / (locked - from) * SEEKS, at = Math.max(0, Math.min(SEEKS - 1, Math.floor(leg)));
    function stop(i) {
      if (i === 0) {
        return 0.5 + 0.5 * flow.hash('gun' + gun.seed + '|' + n);
      }
      if (i === SEEKS) {
        return 0.5 + 0.5 * flow.hash('gun' + gun.seed + '|' + (n + 1));
      }
      return 0.42 + 0.66 * flow.hash('seek' + gun.seed + '|' + n + '|' + i);
    }
    // Where the target will be when it's shot; before then it's on its way there.
    var next = stop(SEEKS);
    gun.seeking = phase > from && phase < locked;
    gun.lift = leg <= 0 ? stop(0) : leg >= SEEKS ? next + DRIFT * (phase - period)
      : stop(at) + ((at === SEEKS - 1 ? next + DRIFT * (locked - period) : stop(at + 1)) - stop(at)) * flow.smoothstep((leg - at) / 0.6);
  }
  // Stepped and dark, vents glowing with heat as it charges.
  function gunBunker(paint, gun) {
    var charge = Math.max(gun.charge, gun.power);
    ctx.fillStyle = paint.concrete;
    ctx.beginPath();
    ctx.moveTo(-58, 0);
    ctx.lineTo(-52, -14);
    ctx.lineTo(-42, -14);
    ctx.lineTo(-38, -28);
    ctx.lineTo(40, -28);
    ctx.lineTo(44, -14);
    ctx.lineTo(54, -14);
    ctx.lineTo(60, 0);
    ctx.closePath();
    ctx.fill();
    // Its side away from us.
    ctx.fillStyle = paint.shadowSide;
    ctx.beginPath();
    ctx.moveTo(40, -28);
    ctx.lineTo(44, -14);
    ctx.lineTo(54, -14);
    ctx.lineTo(60, 0);
    ctx.lineTo(30, 0);
    ctx.lineTo(30, -28);
    ctx.closePath();
    ctx.fill();
    rect(ctx, -38, -28, 78, 0.8, paint.steelLight);
    rect(ctx, -52, -14, 106, 0.6, paint.steelLight);
    var heat = 0.35 + 0.65 * charge;
    [-30, -17, -4, 9].forEach(function (vx) {
      rect(ctx, vx, -22, 8, 2.6, '#141010');
      rect(ctx, vx + 0.5, -21.3, 7, 1.2, css([255, 120 + 60 * charge, 40], 0.5 + 0.5 * heat));
    });
  }
  function gunTurret(paint, gun, t) {
    ctx.fillStyle = paint.steel;
    ctx.fillRect(-20, -38, 40, 10);
    ctx.fillStyle = paint.dark;
    ctx.beginPath();
    ctx.moveTo(-36, -36);
    ctx.lineTo(-31, -60);
    ctx.lineTo(12, -67);
    ctx.lineTo(32, -56);
    ctx.lineTo(34, -36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = paint.steelLight;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-31, -60);
    ctx.lineTo(12, -67);
    ctx.lineTo(32, -56);
    ctx.moveTo(-10, -63.6);
    ctx.lineTo(-12, -36);
    ctx.moveTo(10, -66.4);
    ctx.lineTo(11, -36);
    ctx.stroke();
    // Its sight: a light running to and fro while it hunts, all lit once it has its target.
    rect(ctx, -28, -50, 12, 3, '#141218');
    rect(ctx, -27, -49.2, 10, 1.4, css([255, 60, 40], gun.seeking ? 0.25 : 1));
    if (gun.seeking) {
      rect(ctx, -23.5 + 3.5 * Math.sin(t * 5), -49.2, 3, 1.4, '#ff6a50');
    }
  }
  // Raised on its pivot and slammed back as it fires; a heavy jacket at the breech.
  function gunBarrel(paint, gun) {
    var L = GUN_LENGTH, recoil = gun.recoil, ca = Math.cos(gun.lift), sa = Math.sin(gun.lift);
    // The ram.
    ctx.strokeStyle = paint.steel;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-8, -38);
    ctx.lineTo(PIVOT_X + ca * (30 - recoil), PIVOT_Y - sa * (30 - recoil));
    ctx.stroke();
    ctx.save();
    ctx.translate(PIVOT_X, PIVOT_Y);
    ctx.rotate(-gun.lift);
    ctx.translate(-recoil, 0);
    ctx.fillStyle = paint.steel;
    ctx.beginPath();
    ctx.moveTo(-14, -6.5);
    ctx.lineTo(L, -4.6);
    ctx.lineTo(L, 4.6);
    ctx.lineTo(-14, 6.5);
    ctx.closePath();
    ctx.fill();
    rect(ctx, -14, -6.5, L - 6, 1.4, paint.steelLight);
    rect(ctx, -14, 4.6, L, 1.6, paint.shadowSide);
    ctx.fillStyle = paint.dark;
    ctx.fillRect(-18, -9.5, 38, 19);
    rect(ctx, -18, -9.5, 38, 1.4, paint.steelLight);
    for (var b = 28; b < L - 10; b += 16) {
      rect(ctx, b, -5.6, 4, 11.2, paint.band);
      rect(ctx, b + 1, -1.2, 2, 2.4, css(gun.laser, 0.15 + 0.85 * Math.max(gun.charge, gun.power)));
    }
    // The muzzle brake.
    rect(ctx, L - 2, -7.5, 14, 15, paint.dark);
    rect(ctx, L + 2, -7.5, 1.4, 15, '#141218');
    rect(ctx, L + 7, -7.5, 1.4, 15, '#141218');
    hotBarrel(gun.heat);
    ctx.restore();
  }
  // Steel's glow by how hot it is, 0 to 1: none, a dull red, red, orange.
  function hotSteel(heat) {
    var red = Math.min(1, heat / 0.55), orange = Math.max(0, (heat - 0.55) / 0.45);
    return css(blend(blend([96, 8, 4], [232, 36, 14], red), [255, 138, 52], orange), 0.95 * Math.min(1, heat * 2.2));
  }
  // The barrel red hot from its pulse, most at the muzzle and least by its jacket, cooling
  // from there outward.
  function hotBarrel(heat) {
    if (heat < 0.03) {
      return;
    }
    var L = GUN_LENGTH, along = ctx.createLinearGradient(20, 0, L + 12, 0);
    [0, 0.25, 0.5, 0.75, 1].forEach(function (at) {
      along.addColorStop(at, hotSteel(heat * (0.12 + 0.88 * at)));
    });
    ctx.fillStyle = along;
    ctx.beginPath();
    ctx.moveTo(20, -6);
    ctx.lineTo(L - 2, -4.7);
    ctx.lineTo(L - 2, -7.5);
    ctx.lineTo(L + 12, -7.5);
    ctx.lineTo(L + 12, 7.5);
    ctx.lineTo(L - 2, 7.5);
    ctx.lineTo(L - 2, 4.7);
    ctx.lineTo(20, 6);
    ctx.closePath();
    ctx.fill();
    // Round still: hottest along its middle, its underside in shadow.
    rect(ctx, 20, 2.6, L - 8, 3.4, 'rgba(20, 0, 0, 0.28)');
    ctx.globalCompositeOperation = 'lighter';
    rect(ctx, 34, -1.6, L - 26, 2, css([255, 150, 70], 0.28 * heat * heat));
    [[0.55, 12, 0.22], [0.8, 16, 0.32], [1.02, 20, 0.42]].forEach(function (spot) {
      glow(spot[0] * L, 0, spot[1], [255, 70, 24], spot[2] * heat);
    });
    ctx.globalCompositeOperation = 'source-over';
  }
  // The charge, the pulse and its smoke, in the road's units from where the muzzle is now.
  function gunShot(x, foot, gun, m, dim, t) {
    var L = GUN_LENGTH, phase = gun.phase, ca = Math.cos(gun.lift), sa = Math.sin(gun.lift);
    var dx = gun.way * ca, dy = -sa;
    var mx = x + gun.way * (PIVOT_X + ca * (L + 10 - gun.recoil)), my = foot + PIVOT_Y - sa * (L + 10 - gun.recoil);
    if (gun.charge > 0) {
      glow(mx, my, 4 + 8 * gun.charge, gun.laser, 0.6 * gun.charge);
    }
    if (gun.power > 0) {
      laserPulse(mx, my, dx, dy, gun, t);
    }
    if (phase < 1.4) {
      muzzleSmoke(mx, my, dx, dy, phase / 1.4, m, dim);
    }
    if (phase > VENT && phase < VENT + VENTING + STEAM_LASTS) {
      steamBurst(x, foot, gun, dim);
    }
  }
  // Its pressure let go as the pulse ends (VENT into it): steam shot out of it for VENTING
  // seconds, hard at first, from both sides of its jacket, the turret's back and the bunker's
  // vents; each puff of it slowed by the air, spreading, rising and blown off over STEAM_LASTS.
  var VENT = PULSE - 0.25, VENTING = 1.6, STEAM_LASTS = 3, STEAM_PUFFS = sharp ? 15 : 9;
  function steamBurst(x, foot, gun, dim) {
    var ca = Math.cos(gun.lift), sa = Math.sin(gun.lift), steam = smokeColour(blend([238, 241, 246], [74, 80, 96], dim));
    // Each jet: from where, which way, how far, and how big its puffs get, facing right.
    var jets = [
      {x: PIVOT_X + 12 * ca - 9 * sa, y: PIVOT_Y - 12 * sa - 9 * ca, dx: -sa - 0.25 * ca, dy: -ca + 0.25 * sa, far: 118, big: 38},
      {x: PIVOT_X + 14 * ca + 9 * sa, y: PIVOT_Y - 14 * sa + 9 * ca, dx: sa + 0.2 * ca, dy: ca * 0.5 - 0.2 * sa, far: 92, big: 32},
      {x: -34, y: -50, dx: -1, dy: -0.22, far: 128, big: 40},
      {x: -52, y: -10, dx: -1, dy: -0.1, far: 78, big: 26},
      {x: 54, y: -10, dx: 1, dy: -0.1, far: 78, big: 26},
    ];
    jets.forEach(function (jet, j) {
      for (var n = 0; n < STEAM_PUFFS; n += 1) {
        var out = n / STEAM_PUFFS, age = gun.phase - VENT - out * VENTING;
        if (age <= 0 || age >= STEAM_LASTS) {
          continue;
        }
        var a = flow.hash('puff' + j + '|' + n), b = flow.hash('wisp' + j + '|' + n), push = 1 - 0.5 * out;
        var gone = 1 - Math.exp(-age * 3.2), far = jet.far * push * (0.75 + 0.4 * a) * gone, wide = (b - 0.5) * far * 0.34;
        var px = jet.x + jet.dx * far - jet.dy * wide, py = jet.y + jet.dy * far + jet.dx * wide - 9 * age * age;
        var size = 4 + jet.big * (0.7 + 0.5 * b) * Math.sqrt(gone) * (0.45 + 0.3 * age);
        glow(x + gun.way * px + flow.windX * 16 * age * age, Math.min(foot, foot + py), size, steam, 0.8 * push * Math.pow(1 - age / STEAM_LASTS, 1.4));
      }
    });
  }
  // Up out of sight: a wide glow round a white-hot core, shimmering, thinning as it ends.
  function laserPulse(mx, my, dx, dy, gun, t) {
    var power = gun.power, shimmer = 1 + 0.12 * Math.sin(t * 60 + gun.seed * 5);
    var ex = mx + dx * 600, ey = my + dy * 600;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    [[11, 0.22], [5.5, 0.5], [2.2, 0.95]].forEach(function (layer, i) {
      ctx.strokeStyle = css(i === 2 ? [245, 252, 255] : gun.laser, layer[1] * power);
      ctx.lineWidth = layer[0] * power * shimmer + 0.4;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    });
    glow(mx, my, (22 + 8 * Math.exp(-gun.phase * 5)) * power * shimmer + 4, gun.laser, power);
    ctx.restore();
  }
  // A ring of shock, and smoke rolling off the muzzle.
  function muzzleSmoke(mx, my, dx, dy, sp, m, dim) {
    ctx.strokeStyle = css([255, 255, 255], 0.35 * (1 - sp));
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(mx, my, 6 + 40 * sp, 0, 6.2832);
    ctx.stroke();
    var smoke = css(blend([150, 146, 140], [30, 30, 36], dim), 0.35 * (1 - sp));
    for (var puff = 0; puff < 4; puff += 1) {
      var pr = seeded(m * 31 + puff)(), pd = 6 + sp * (14 + pr * 18);
      circle(ctx, mx + dx * pd * (0.4 + pr) + (pr - 0.5) * 8, my + dy * pd * (0.4 + pr) - sp * 8, 3 + sp * 9 * (0.6 + pr), smoke);
    }
  }
  // A partial white flash over the whole screen, for the guns' shots and the asteroids'
  // impacts. Gone in about a third of a second.
  function drawSmallFlash(seconds) {
    smallFlash = Math.max(0, smallFlash - seconds * 0.75);
    if (smallFlash <= 0.01) {
      return;
    }
    ctx.fillStyle = 'rgba(255, 255, 255, ' + smallFlash.toFixed(3) + ')';
    ctx.fillRect(0, 0, flow.width, flow.height);
  }
  // Gunships crossing the sky, raking the far ground with bolts that strike in a flash, a
  // fireball and rising smoke: a dark wedge, or a heavy carrier, high and slow.
  var craft = [], strikes = [], craftDue = 2;
  function drawCraft(seconds, time) {
    var here = biomeAt(odometer + cols * 0.5, 1) === 'warzone', t = time / 1000, dim = light.night * 0.8;
    if (here && (craftDue -= seconds) <= 0 && craft.length < 3) {
      launchCraft();
    }
    craft = craft.filter(function (c) { return c.x > -60 && c.x < cols + 60; });
    var hull = css(blend([58, 62, 74], [10, 10, 18], dim));
    craft.forEach(function (c) {
      c.x += c.way * c.speed * seconds;
      c.fire -= seconds;
      var x = c.x, y = c.y + Math.sin(t + c.x * 0.02) * 0.6, s = c.heavy ? 2.2 : 1;
      gunship(x, y, c.way * s, s, hull);
      ctx.globalCompositeOperation = 'lighter';
      glow(x - c.way * 11 * s, y + 0.4, 3 * s, [120, 200, 255], 0.9);
      ctx.globalCompositeOperation = 'source-over';
      if (c.fire <= 0 && c.x > 20 && c.x < cols - 20) {
        c.fire = c.heavy ? 1.4 : 0.5 + Math.random() * 1.2;
        strikes.push({x0: x, y0: y + 2, x1: x + c.way * (20 + Math.random() * 60), y1: RT - 56 - Math.random() * 12, age: 0, from: odometer});
      }
    });
    strikes = strikes.filter(function (b) { return b.age < 5; });
    strikes.forEach(function (b) { drawStrike(b, seconds, dim); });
  }
  function launchCraft() {
    var right = Math.random() < 0.5, heavy = Math.random() < 0.3;
    craft.push({
      x: right ? cols + 40 : -40,
      y: heavy ? 18 + Math.random() * 14 : 30 + Math.random() * 40,
      way: right ? -1 : 1,
      speed: heavy ? 10 : 26 + Math.random() * 20,
      heavy: heavy,
      fire: 0.5,
    });
    craftDue = 4 + Math.random() * 6;
  }
  function gunship(x, y, scaleX, scaleY, hull) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-7, -3);
    ctx.lineTo(-9, -1);
    ctx.lineTo(-11, -3.4);
    ctx.lineTo(-11, 2);
    ctx.lineTo(-6, 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-4, 2, 6, 1.2);
    ctx.fillStyle = '#ff3a30';
    ctx.fillRect(4, -0.6, 2, 0.6);
    ctx.restore();
  }
  function drawStrike(b, seconds, dim) {
    b.age += seconds;
    // What it struck goes by with the ground there.
    b.x1 -= (odometer - b.from) * bandRate(b.y1);
    b.from = odometer;
    var f = Math.min(1, b.age / 0.25), bx = b.x0 + (b.x1 - b.x0) * f, by = b.y0 + (b.y1 - b.y0) * f;
    ctx.globalCompositeOperation = 'lighter';
    if (b.age < 0.3) {
      ctx.strokeStyle = 'rgba(255, 80, 60, 0.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(bx - (b.x1 - b.x0) * 0.15, by - (b.y1 - b.y0) * 0.15);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    if (b.age >= 0.25 && b.age < 1.6) {
      var e = (b.age - 0.25) / 1.35;
      glow(b.x1, b.y1, 4 + 12 * Math.sqrt(e), [255, 170, 80], 1 - e);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (b.age >= 0.4) {
      var r = (b.age - 0.4) / 4.6;
      glow(b.x1, b.y1 - r * 30, 5 + r * 10, smokeColour(blend([70, 64, 62], [14, 14, 20], dim)), 0.6 * (1 - r));
    }
  }
  // Searchlights sweeping slowly over the sky from among the city's towers; faint by day.
  function drawSearchlights(time) {
    var rate = RISE_RATE, layer = odometer * rate, t = time / 1000, strength = 0.15 + 0.5 * Math.min(1, light.night * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    for (var m = Math.floor((layer - 60) / 90); m <= Math.floor((layer + cols + 60) / 90); m += 1) {
      var seed = seeded(m * 7919 + 113)(), at = m * 90 + seed * 50;
      if (seed > 0.6 || biomeAt(at, rate) !== 'warzone') {
        continue;
      }
      var x = at - layer, base = RT - 70, a = Math.sin(t * (0.15 + seed * 0.2) + seed * 9) * 0.6, len = 220, w = 7;
      var tipX = x + Math.sin(a) * len, tipY = base - Math.cos(a) * len, nx = Math.cos(a) * w, ny = Math.sin(a) * w;
      var beam = ctx.createLinearGradient(x, base, tipX, tipY);
      beam.addColorStop(0, css([200, 220, 255], 0.35 * strength));
      beam.addColorStop(1, css([200, 220, 255], 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 0.6, base);
      ctx.lineTo(tipX - nx, tipY - ny);
      ctx.lineTo(tipX + nx, tipY + ny);
      ctx.lineTo(x + 0.6, base);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
