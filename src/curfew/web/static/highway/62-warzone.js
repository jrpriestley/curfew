  // ------------------------------------------------------------- the warzone --
  // Great guns in the middle distance (at the hills' rate), about one in sight at a time:
  // a stepped bunker, an armoured turret, a banded barrel raised on a ram. Every few seconds
  // one charges (bands and vents brightening, the whole gun trembling) and fires a laser
  // pulse into space for PULSE seconds: the barrel slams back and the gun pitches up and
  // sinks on its footing, braced and shaking while the pulse lasts, then eases back. A shot
  // in sight flashes the whole screen a little (`smallFlash`), the light lingering faintly
  // while it fires, and is heard.
  var smallFlash = 0, gunLast = {}, gunCharging = {};
  var GUN_LENGTH = 96, PIVOT_X = 10, PIVOT_Y = -54;
  var CHARGE = 1.6, PULSE = 2.4, PULSE_FADE = 0.6, GUN_SETTLE = 1.6;
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
      // Its shot asked for as it charges, so that it's heard as it fires.
      if (flow.sound && inSight && gun.charge > 0 && gun.charge < 0.5 && !gunCharging[m]) {
        var until = CHARGE * (1 - gun.charge);
        [['charge', 0.2, until - CHARGE], ['cannon', 0.6, until], ['beam', 0.2, until], ['hum', 0.28, until]].forEach(function (part) {
          flow.sound.shot(part[0], part[1], part[2], x / cols * 2 - 1);
        });
      }
      gunCharging[m] = gun.charge > 0;
      gunLast[m] = gun.phase;
      x += gun.shakeX;
      foot += gun.sink + gun.shakeY;
      ctx.save();
      ctx.translate(x, foot);
      ctx.scale(gun.way, 1);
      gunBunker(paint, gun);
      gunTurret(paint, Math.max(gun.charge, gun.power));
      gunBarrel(paint, gun);
      ctx.globalCompositeOperation = 'lighter';
      var blink = Math.sin(t * 3 + seed * 20) > 0.7 ? 1 : 0.15;
      glow(-54, -15, 3.4, [255, 40, 30], blink);
      glow(54, -15, 3.4, [255, 40, 30], 1.15 - blink);
      ctx.restore();
      gunShot(x, foot, gun, m, dim, t);
    }
  }
  // Where a gun is in its cycle (phase 0 is the shot) and how that moves it: trembling as
  // it charges, slammed back and pitched up as it fires, braced and shaking through the
  // pulse, then easing back on its ram.
  function aimGun(seed, t) {
    var gun = {way: seed < 0.4 ? -1 : 1, lift: 0.62 + seed * 0.3, laser: LASERS[seed > 0.62 ? 0 : 1], seed: seed};
    var period = 7 + seed * 5, phase = (t + seed * 13) % period;
    gun.phase = phase;
    gun.charge = phase > period - CHARGE ? (phase - (period - CHARGE)) / CHARGE : 0;
    gun.power = phase < PULSE ? Math.min(1, (PULSE - phase) / PULSE_FADE) : 0;
    var firing = phase < PULSE;
    var after = phase - PULSE;
    if (firing) {
      gun.recoil = 10 + 5 * Math.exp(-phase * 8);
    } else if (after < GUN_SETTLE) {
      gun.recoil = 10 * Math.pow(1 - after / GUN_SETTLE, 2);
    } else {
      gun.recoil = 0;
    }
    var kick = firing ? Math.exp(-phase * 4) : 0;
    gun.lift += 0.07 * kick;
    gun.sink = 1.6 * kick;
    var tremble = 0.5 * gun.charge + 0.6 * gun.power;
    gun.shakeX = Math.sin(t * 83 + seed * 7) * tremble;
    gun.shakeY = Math.sin(t * 71 + seed * 11) * tremble * 0.6;
    return gun;
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
  function gunTurret(paint, charge) {
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
    // Its sight, lit as it charges.
    rect(ctx, -28, -50, 12, 3, '#141218');
    rect(ctx, -27, -49.2, 10, 1.4, css([255, 60, 40], 0.5 + 0.5 * charge));
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
    ctx.restore();
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
        strikes.push({x0: x, y0: y + 2, x1: x + c.way * (20 + Math.random() * 60), y1: RT - 62 - Math.random() * 12, age: 0});
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
    var rate = 0.07, layer = odometer * rate, t = time / 1000, strength = 0.15 + 0.5 * Math.min(1, light.night * 1.6);
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
