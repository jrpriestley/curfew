  // ---------------------------------------------------------------- the glitch --
  // Now and then (GLITCH of the spans, not the atomic city's nor near the bombs) the world
  // shows itself to be a projection. It glitches worse and worse over ONSET seconds: strips
  // slipping, colour splitting, blocks misplaced, other biomes' tiles flashing in, the
  // wireframe showing through, words scrambling, the traffic blinking out. Then it whites
  // out to a void: nothing but the road and our car for VOID seconds. It comes back over
  // RETURN seconds, the far layers first, and whites out again, whole, in the biome it left.
  // Its flicker is no more than three times a second.
  // `gl` is this frame's state: g, how badly it glitches (0 to 1); blank, in the void; p,
  // how far back it's come (-1 before it starts); flash, the whiteout.
  var GLITCH = 0.05, ONSET = 12, VOID = 30, RETURN = 8, glitch = null, glitchFree = 0, worldOn = true;
  var gl = {g: 0, blank: false, p: -1, flash: 0}, ALTS = ['country', 'city', 'desert', 'coast', 'future', 'badlands', 'wasteland'];
  function glitchDue(n) {
    var into = odometer % SPAN;
    return !glitch && odometer > glitchFree && into > 0.5 * SPAN && into < 0.6 * SPAN
      && flow.hash('glitch' + luck + '|' + n) < GLITCH
      && spanBiome(n) !== 'atomic' && (!blast || odometer > (blast.span + 3) * SPAN);
  }
  function watchGlitch(time) {
    var n = spanAt(odometer);
    if (glitchDue(n)) {
      var random = seeded(n * 53 + 11), home = spanBiome(n);
      var alts = ALTS.filter(function (b) { return b !== home; });
      glitch = {t0: time, home: home, seed: Math.floor(random() * 1e6), warm: 0, events: [], hold: null, back: false,
        alts: [alts[Math.floor(random() * alts.length)], alts[Math.floor(random() * alts.length)]]};
    }
    gl = {g: 0, blank: false, p: -1, flash: 0};
    if (!glitch) {
      return;
    }
    var t = (time - glitch.t0) / 1000, whiteOut = ONSET + 0.4, whole = whiteOut + VOID + RETURN;
    // The road ahead is the biome it left, unseen till it's reached.
    spanOf[n + 1] = glitch.home;
    if (t < ONSET) {
      gl.g = Math.pow(t / ONSET, 1.6);
    } else if (t < whiteOut) {
      gl.g = 1;
    } else if (t < whole) {
      gl.blank = true;
      gl.p = t < whiteOut + VOID ? -1 : (t - whiteOut - VOID) / RETURN;
      gl.g = gl.p < 0 ? 0 : 0.5 + 0.5 * gl.p;
      if (gl.p >= 0 && !glitch.back) {
        // And behind: the far layers show the spans gone by.
        glitch.back = true;
        for (var j = Math.max(0, n - 6); j <= n; j += 1) {
          spanOf[j] = glitch.home;
        }
      }
    } else {
      gl.g = 0.5 * Math.max(0, 1 - (t - whole) / 3);
    }
    gl.flash = Math.max(whiteness(t, whiteOut), whiteness(t, whole));
    if (t >= whiteOut - 0.2) {
      other = null;
    }
    warmAltTiles(t);
    if (t > whole + 3) {
      glitch = null;
      glitchFree = (n + 2) * SPAN;
    }
  }
  // A whiteout peaking at `peak`: up over 0.4 s, wholly white for WHITE_HOLD, then down.
  function whiteness(t, peak) {
    if (t > peak - 0.4 && t < peak) {
      return (t - peak + 0.4) / 0.4;
    }
    if (t >= peak && t < peak + WHITE_HOLD) {
      return 1;
    }
    if (t >= peak + WHITE_HOLD && t < peak + WHITE_HOLD + 1.4) {
      return Math.pow(1 - (t - peak - WHITE_HOLD) / 1.4, 2);
    }
    return 0;
  }
  // The other biomes' tiles made ready to flash in, one a frame.
  function warmAltTiles(t) {
    if (t >= ONSET || glitch.warm >= glitch.alts.length * SLOTS.length) {
      return;
    }
    var slot = SLOTS[glitch.warm % SLOTS.length], biome = glitch.alts[Math.floor(glitch.warm / SLOTS.length)];
    glitch.warm += 1;
    if (!slot.rows) {
      tileOf(biome, slot, 0, {budget: 1}, Date.now());
    }
  }
  // Whether layer j shows: in the void, none; coming back, from the far ones in (0 the sky,
  // 1 to 7 the slots, 8 the roadside), each flickering on before it stays.
  function layerOn(j) {
    if (!gl.blank) {
      return true;
    }
    var v = gl.p * 10.5 - j;
    return gl.p >= 0 && (v >= 1 || (v > 0 && seeded(Math.floor(frameTime / 333) * 7919 + j * 31 + glitch.seed)() < v));
  }
  function voidColour() {
    return blend([250, 250, 248], [112, 114, 120], light.night);
  }
  // Now and then another biome's tile in place of a slot's: only those made ready.
  function altTile(i, slot, time) {
    var r = seeded(Math.round(i * 131 + slot.rate * 1e4 + Math.floor(time / 333) * 7919 + glitch.seed));
    if (r() > gl.g * 0.15) {
      return null;
    }
    var have = tiles[glitch.alts[r() < 0.5 ? 0 : 1] + '|' + slot.key + '|0'];
    return have ? have.canvas : null;
  }
  var GLYPHS = '#%&@$/|<>?!01';
  function scrambled(words) {
    var r = seeded(Math.floor(frameTime / 120) * 7919 + words.length);
    return words.split('').map(function (ch) {
      return ch !== ' ' && r() < gl.g * 0.35 ? GLYPHS.charAt(Math.floor(r() * GLYPHS.length)) : ch;
    }).join('');
  }
  // The world's bare wireframe: the horizon, a skyline's blocks, a ridge, the ground's grid
  // with each row at its own rate.
  function drawWire() {
    if (!glitch) {
      return;
    }
    var r = seeded(Math.floor(frameTime / 333) * 7919 + glitch.seed + 5)();
    var alpha;
    if (gl.blank && gl.p < 0) {
      alpha = r < 0.08 ? 0.35 : 0;
    } else if (gl.blank) {
      alpha = 0.6 * (1 - gl.p);
    } else {
      alpha = r < gl.g * 0.2 ? 0.6 : 0;
    }
    if (alpha < 0.02) {
      return;
    }
    var horizon = RT - 66, layer = odometer * RISE_RATE, hills = odometer * 0.16;
    ctx.strokeStyle = css(blend([40, 50, 70], [190, 225, 255], light.night), alpha);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(cols, horizon);
    for (var m = Math.floor((layer - 40) / 36); m <= Math.floor((layer + cols) / 36); m += 1) {
      var random = seeded(m * 7919 + 211);
      var x = m * 36 + random() * 14 - layer, w = 12 + random() * 18, h = 14 + random() * random() * 80;
      if (random() < 0.3) {
        continue;
      }
      ctx.rect(x, horizon - h, w, h);
      for (var f = 8; f < h; f += 8) {
        ctx.moveTo(x, horizon - f);
        ctx.lineTo(x + w, horizon - f);
      }
    }
    for (x = 0; x <= cols; x += 6) {
      var u = x + hills;
      ctx[x ? 'lineTo' : 'moveTo'](x, RT - 34 - 10 * Math.sin(u / 70) - 6 * Math.sin(u / 23 + 1));
    }
    [4, 9, 16, 26, 40, 58].forEach(function (d, i, all) {
      var y = horizon + d, next = horizon + (all[i + 1] || 66), rate = bandRate(y);
      ctx.moveTo(0, y);
      ctx.lineTo(cols, y);
      for (var gx = -((odometer * rate) % 30); gx < cols; gx += 30) {
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, next);
      }
    });
    ctx.stroke();
  }
  // Its faults, on the screen as drawn, above the road and below it but never on it. Each
  // lasts a moment, more as it worsens. The colour split is faked: the strip copied,
  // tinted red and cyan, and added back shifted each way.
  var tintBoard = document.createElement('canvas'), tintKit = tintBoard.getContext('2d');
  var SOLID_FAULTS = ['#ff2ad4', '#22ff88', '#101014', '#30e0ff'];
  function drawGlitch(seconds) {
    if (!glitch) {
      return;
    }
    var g = gl.g, now = frameTime;
    if (g > 0 && Math.random() < seconds * g * (sharp ? 16 : 8)) {
      glitch.events.push(newFault(g, now));
    }
    glitch.events = glitch.events.filter(function (e) { return e.until > now; });
    glitch.events.forEach(drawFault);
  }
  function newFault(g, now) {
    var W = flow.width, top = RT * k, low = (RT + 44) * k, H = flow.height;
    var kinds = sharp ? ['slip', 'slip', 'chroma', 'chroma', 'block', 'tear', 'solid'] : ['slip', 'slip', 'block', 'tear', 'solid'];
    var kind = kinds[Math.floor(Math.random() * kinds.length)], below = Math.random() < 0.15 && H > low + 4;
    var y0 = below ? low : 0, y1 = below ? H : top;
    var h = Math.min(y1 - y0 - 1, (kind === 'tear' ? 0.6 + Math.random() : 3 + Math.random() * 26 * g) * k);
    return {kind: kind, y: y0 + Math.random() * (y1 - y0 - h), h: h, x: Math.random() * W * 0.8, w: W * (0.1 + Math.random() * 0.3),
      dx: (Math.random() - 0.5) * 40 * k * g, until: now + 80 + Math.random() * 260, seed: Math.random()};
  }
  function drawFault(e) {
    var W = flow.width, y = Math.round(e.y), h = Math.max(1, Math.round(e.h));
    if (e.kind === 'slip') {
      ctx.drawImage(ctx.canvas, 0, y, W, h, e.dx, y, W, h);
    } else if (e.kind === 'block') {
      ctx.drawImage(ctx.canvas, e.x, y, e.w, h, e.x + e.dx * 3, y, e.w, h);
    } else if (e.kind === 'tear') {
      ctx.fillStyle = e.seed < 0.5 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, y, W, h);
    } else if (e.kind === 'solid') {
      ctx.fillStyle = SOLID_FAULTS[Math.floor(e.seed * 4)];
      ctx.fillRect(e.x, y, e.w * 0.3, h);
    } else {
      colourSplit(e, y, h, W);
    }
  }
  function colourSplit(e, y, h, W) {
    if (tintBoard.width !== W || tintBoard.height < h) {
      tintBoard.width = W;
      tintBoard.height = Math.max(h, tintBoard.height);
    }
    [[255, 0, 0], [0, 255, 255]].forEach(function (c, i) {
      tintKit.globalCompositeOperation = 'source-over';
      tintKit.clearRect(0, 0, W, h);
      tintKit.drawImage(ctx.canvas, 0, y, W, h, 0, 0, W, h);
      tintKit.globalCompositeOperation = 'multiply';
      tintKit.fillStyle = css(c);
      tintKit.fillRect(0, 0, W, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tintBoard, 0, 0, W, h, i ? -e.dx : e.dx, y, W, h);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  function drawWhiteout() {
    if (gl.flash > 0.01) {
      ctx.fillStyle = css([255, 255, 255], Math.min(1, gl.flash));
      ctx.fillRect(0, 0, flow.width, flow.height);
    }
  }
