  // ------------------------------------------------------------ the atomic blast --
  // BLAST of the way along the atomic city's span, when every layer in sight is the city's,
  // bombs fall far off, one after another: a flash whiting out
  // the screen, a fireball, a mushroom cloud rising and spreading, thinning over minutes, and
  // a haze of dust over the horizon. Under the first flash the city becomes its ruins
  // (`boomed`: its whole span is the aftermath from then), and the road empties.
  // One to three bombs, BOMB_GAP seconds apart (at random within).
  var blast = null, boomed = {}, frameTime = 0, BOMB_GAP = [3, 8], FALL = 2.4;
  function spanAt(at) {
    return Math.floor(Math.max(0, at) / SPAN);
  }
  // The ruins are made ready before the bombs appear, from WARM_LEAD before, one job at the
  // pace of a remake: made all at once as the bombs appeared, they stalled the TV. Every job
  // done is touched each frame after, so the sweep doesn't drop it before the flash.
  var WARM_LEAD = 1500, warmSpan = -1, warmJobs = [], warmDone = 0;
  function warmingRuins() {
    return warmSpan === spanAt(odometer) && !boomed[warmSpan];
  }
  function ruinJobs() {
    var jobs = [];
    SLOTS.forEach(function (slot) {
      [0, 1].forEach(function (variant) {
        jobs.push(function (fresh, now) { tileOf('aftermath', slot, variant, fresh, now); });
      });
    });
    return jobs;
  }
  function warmRuins(n) {
    var due = spanBiome(n) === 'atomic' && !boomed[n] && odometer % SPAN > BLAST * SPAN - WARM_LEAD;
    if (!due) {
      return;
    }
    if (warmSpan !== n) {
      warmSpan = n;
      warmJobs = ruinJobs();
      warmDone = 0;
    }
    var now = Date.now(), touch = {budget: 0};
    for (var i = 0; i < warmDone; i += 1) {
      warmJobs[i](touch, now);
    }
    if (warmDone < warmJobs.length && remakes > 0) {
      warmJobs[warmDone]({budget: 1}, now);
      warmDone += 1;
    }
  }
  function watchBlast(time) {
    frameTime = time;
    var n = spanAt(odometer);
    var due = spanBiome(n) === 'atomic' && (!blast || blast.span !== n) && !boomed[n] && odometer % SPAN > BLAST * SPAN;
    if (due) {
      blast = {span: n, t0: time, boom: null, at: bombsFor(n)};
    }
    warmRuins(n);
    if (blast && !blast.boom && time - blast.t0 > FALL * 1000) {
      blast.boom = time;
      boomed[blast.span] = true;
      other = null;
    }
  }
  // Where and when each falls, the same for a span every time.
  function bombsFor(n) {
    var random = seeded(n * 31 + 7), count = 1 + Math.floor(random() * 3), bombs = [], drop = 0;
    for (var i = 0; i < count; i += 1) {
      if (i) {
        drop += BOMB_GAP[0] + random() * (BOMB_GAP[1] - BOMB_GAP[0]);
      }
      bombs.push({x: cols * (0.25 + 0.55 * random()), drop: drop, size: 0.8 + 0.4 * random()});
    }
    return bombs;
  }
  function drawBombs(time) {
    if (!blast) {
      return;
    }
    blast.at.forEach(function (bomb) {
      var age = (time - blast.t0) / 1000 - bomb.drop - FALL;
      if (age < -FALL || age > 240) {
        return;
      }
      // It drifts with the far land from where it began to fall, so it falls where it was placed.
      if (bomb.from === undefined) {
        bomb.from = odometer;
      }
      var x = bomb.x - (odometer - bomb.from) * 0.04 + flow.windX * Math.max(0, age) * 0.4, horizon = RT - 72;
      // Heard a moment after its flash: it's far off.
      if (age >= 0 && !bomb.heard) {
        bomb.heard = true;
        if (flow.sound) {
          flow.sound.shot('blast', Math.min(1, 0.85 * bomb.size) * heardAt(x), 1 + Math.random(), x / cols * 2 - 1);
        }
      }
      if (age < 0) {
        fallingBomb(x, horizon - (horizon + 4) * (-age / FALL));
      } else {
        mushroomCloud(x, horizon, age, bomb.size);
      }
    });
  }
  function fallingBomb(x, y) {
    ctx.strokeStyle = css(blend([200, 200, 200], [60, 60, 70], light.night), 0.4);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#26262a';
    ctx.beginPath();
    ctx.ellipse(x, y, 0.6, 1.6, 0, 0, 6.2832);
    ctx.fill();
  }
  function mushroomCloud(x, horizon, age, size) {
    var rise = 125 * size * (1 - Math.exp(-age / 6)), cap = (10 + 30 * (1 - Math.exp(-age / 5))) * size;
    var fade = Math.min(1, age * 2) * (age > 40 ? Math.max(0.2, 1 - (age - 40) / 120) : 1);
    var hot = Math.max(0, 1 - age / 10);
    var smoke = smokeColour(blend(blend([104, 88, 78], [255, 170, 90], hot), [16, 14, 20], light.night * 0.6 * (1 - hot)));
    for (var s = 0; s < 10; s += 1) {
      var f = s / 10;
      glow(x + Math.sin(f * 6 + age) * 0.6, horizon - rise * f, (4 + 4 * f) * size + age * 0.06, smoke, 0.6 * fade);
    }
    // Its cap, rolling.
    for (s = 0; s < 14; s += 1) {
      var a = s / 14 * 6.2832 + age * 0.1;
      glow(x + Math.cos(a) * cap * 0.8, horizon - rise + Math.sin(a) * cap * 0.32, cap * 0.5, smoke, 0.7 * fade);
    }
    // Its skirt, along the ground.
    glow(x, horizon - rise * 0.15, cap * 0.7, smoke, 0.4 * fade);
    if (age < 4) {
      ctx.globalCompositeOperation = 'lighter';
      glow(x, horizon - rise * 0.5, (10 + 40 * Math.min(1, age * 3)) * size, [255, 236, 190], Math.max(0, 1 - age / 4));
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // The haze of dust over the horizon, from the first blast till well past the span.
  function drawFallout(time) {
    if (!(blast && blast.boom)) {
      return;
    }
    var n = blast.span;
    var strength = Math.min(1, (time - blast.boom) / 10000) * Math.max(0, Math.min(1, ((n + 1) * SPAN + 2500 - odometer) / 2500));
    if (strength <= 0.01) {
      return;
    }
    var dust = blend([150, 116, 88], [24, 20, 26], light.night * 0.8), top = RT - 170;
    rect(ctx, 0, top, cols, 106, vertical(ctx, top, RT - 64, [[0, css(dust, 0)], [0.55, css(dust, 0.55 * strength)], [1, css(dust, 0.8 * strength)]]));
  }
  // Each blast whites out the whole screen for WHITE_HOLD, then fades over a second and a half.
  var WHITE_HOLD = 0.3;
  function drawFlash(time) {
    if (!blast) {
      return;
    }
    var white = 0;
    blast.at.forEach(function (bomb) {
      var age = (time - blast.t0) / 1000 - bomb.drop - FALL;
      if (age >= 0 && age < WHITE_HOLD + 1.5) {
        white = Math.max(white, age < WHITE_HOLD ? 1 : Math.pow(1 - (age - WHITE_HOLD) / 1.5, 2));
      }
    });
    if (white > 0.01) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + white.toFixed(3) + ')';
      ctx.fillRect(0, 0, flow.width, flow.height);
    }
  }
