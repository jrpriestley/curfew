  // ----------------------------------------------------------------- the road --
  // `lamps`: where each streetlamp is this frame, for the light.
  var grain = null, lamps = [], VERGE_BLEND = 2000;
  function makeGrain() {
    var made = document.createElement('canvas'), p = made.getContext('2d'), random = seeded(91);
    made.width = made.height = 64;
    for (var n = 0; n < 900; n += 1) {
      p.fillStyle = random() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)';
      p.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), 1, 1);
    }
    return ctx.createPattern(made, 'repeat');
  }
  // `world`: false in the glitch's void, where there's only the road.
  function drawRoad(world) {
    var along = odometer;
    if (world) {
      drawRoadside(along);
      drawFar(along);
    } else {
      clearRoadside();
    }
    rect(ctx, 0, RT + 2, cols, 42, vertical(ctx, RT + 2, RT + 44, [[0, near('road')], [1, css(blend(tone('road', 0, true), [0, 0, 0], 0.15))]]));
    if (sharp) {
      drawGrain(along);
    }
    drawKerbs(along);
    drawLine(along);
    lightLines(1);
    drawStuds(along);
    lamps = [];
    if (world) {
      drawLamps(along);
      overpasses(along, false);
    }
  }
  // The verges and the rail, in 16-unit steps.
  function drawRoadside(along) {
    var rows = flow.height / k;
    for (var v = -(along % 16) - 16; v < cols + 16; v += 16) {
      var at = v + along, biome = BIOMES[biomeAt(at, 1)], verge = vergeAt(at, biome);
      // All the way down, under the road, whose edges then have it behind them.
      var left = onPixel(v);
      rect(ctx, left, outward(RT - 2, -1), onPixel(v + 16) - left, rows - RT + 3, verge);
      drawRail(v, at, biome.rail);
    }
  }
  // The ground's colour is the average of the ground over the VERGE_BLEND of road behind,
  // so wherever it changes (a new biome, the blast's aftermath) it ramps from one to the
  // other rather than switching.
  var VERGE_SAMPLES = 8;
  function vergeAt(at, biome) {
    var sum = [0, 0, 0], step = VERGE_BLEND / VERGE_SAMPLES, same = true;
    for (var i = 0; i < VERGE_SAMPLES; i += 1) {
      var key = BIOMES[biomeAt(at - i * step, 1)].verge;
      same = same && key === biome.verge;
      var c = tone(key, 0, true);
      sum[0] += c[0];
      sum[1] += c[1];
      sum[2] += c[2];
    }
    if (same) {
      return near(biome.verge);
    }
    return css(sum.map(function (v) { return v / VERGE_SAMPLES; }));
  }
  function drawRail(v, at, rail) {
    var left = onPixel(v), wide = onPixel(v + 16) - left;
    var post = Math.round(at) % 48 === 0;
    if (rail === 'rail') {
      rect(ctx, left, RT - 7, wide, 2.2, near('rail'));
      rect(ctx, v, RT - 5, 1.2, 5, near('rail'));
    } else if (rail === 'barrier') {
      rect(ctx, left, RT - 6, wide, 6, vertical(ctx, RT - 6, RT, [[0, near('white')], [1, near('cityDark')]]));
    } else if (rail === 'glow') {
      rect(ctx, left, RT - 6, wide, 1.4, near('steelPale'));
      rect(ctx, left, RT - 4.6, wide, 0.5, neon(0, 0.9, 0));
      if (post) {
        rect(ctx, v, RT - 6, 0.8, 6, near('steel'));
      }
    } else if (rail === 'broken') {
      // What's left of the posts, leaning.
      var stump = flow.hash('post' + Math.round(at));
      if (stump < 0.4) {
        ctx.strokeStyle = near('scorch');
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(v + 8, RT);
        ctx.lineTo(v + 8 + (stump - 0.2) * 14, RT - 3 - stump * 14);
        ctx.stroke();
      }
    } else if (post) {
      rect(ctx, v, RT - 8, 1.4, 8, near('white'));
      rect(ctx, v, RT - 7, 1.4, 1.2, near('kerb'));
    }
  }
  // The asphalt's grain, moving with the road.
  function drawGrain(along) {
    if (!grain) {
      grain = makeGrain();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, RT + 2, cols, 42);
    ctx.clip();
    ctx.translate(-(along % 32), RT + 2);
    ctx.scale(0.5, 0.5);
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, (cols + 64) * 2, 84);
    ctx.restore();
  }
  // Red and white kerbs; broken in the ruinous biomes, guide strips in the future.
  var WORN_KERBS = {wasteland: 1, aftermath: 1, warzone: 1, asteroids: 1};
  function drawKerbs(along) {
    for (var x = -(along % 8); x < cols; x += 8) {
      var at = x + along + 4, here = biomeAt(at, 1);
      var red = Math.floor((x + along) / 8) % 2 === 0;
      var sleek = here === 'future' ? deepIn(at, 'future') : 0;
      var worn = WORN_KERBS[here] ? deepIn(at, here) : 0;
      if (sleek) {
        guides(x, red, sleek);
        continue;
      }
      if (!worn) {
        var left = onPixel(x), wide = onPixel(x + 8) - left;
        rect(ctx, left, RT + 2, wide, 2, red ? near('kerb') : near('white'));
        rect(ctx, left, RT + 42, wide, 2, red ? near('kerb') : near('white'));
        continue;
      }
      brokenKerb(x, RT + 2, red, worn, Math.round(x + along) * 2);
      brokenKerb(x, RT + 42, red, worn, Math.round(x + along) * 2 + 1);
    }
  }
  // The dashed centre line. The future's is a line of light (lightLines) instead; the
  // badlands' dashes are pink and cyan by night.
  function drawLine(along) {
    for (var x = -(along % 24); x < cols; x += 24) {
      var at = x + along + 12;
      var lightLine = deepIn(at, 'future'), tinted = deepIn(at, 'badlands') * light.night;
      var dash = near('line');
      if (tinted) {
        var neonDash = Math.round((x + along) / 24) % 2 ? [255, 90, 200] : [80, 230, 255];
        dash = css(blend(tone('line', 0, true), neonDash, 0.6 * tinted));
      }
      if (lightLine < 1) {
        ctx.globalAlpha = 1 - lightLine;
        rect(ctx, x, RT + 22.4, 12, 1.2, dash);
        ctx.globalAlpha = 1;
      }
    }
  }
  // A lamp every LAMP_GAP of road in biomes that have them; none under an overpass, and
  // dark once the bombs have fallen.
  function drawLamps(along) {
    var overpassesNear = pieces(along - LAMP_GAP, along + cols + LAMP_GAP).filter(function (piece) { return piece.kind === 'overpass'; });
    for (var x = -(along % LAMP_GAP) - LAMP_GAP; x < cols + LAMP_GAP; x += LAMP_GAP) {
      var at = x + along, style = BIOMES[biomeAt(at, 1)].lamps;
      if (!style) {
        continue;
      }
      if (overpassesNear.some(function (piece) { return Math.abs(at - piece.at - 20) < 50; })) {
        continue;
      }
      lamps.push(x);
      if (style === 'slim') {
        slimLamp(x);
      } else {
        streetLamp(x);
      }
    }
  }
  function streetLamp(x) {
    ctx.fillStyle = vertical(ctx, RT - 42, RT, [[0, near('rail')], [1, near('cityDark')]]);
    ctx.fillRect(x - 0.8, RT - 42, 1.6, 42);
    ctx.strokeStyle = near('rail');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, RT - 41);
    ctx.quadraticCurveTo(x + 1, RT - 44, x + 8, RT - 43);
    ctx.stroke();
    rect(ctx, x + 6, RT - 43, 6, 1.8, near('cityDark'));
  }
  // The future's: a slim pole and a bar of light.
  function slimLamp(x) {
    rect(ctx, x - 0.5, RT - 42, 1, 42, vertical(ctx, RT - 42, RT, [[0, near('steelPale')], [1, near('steel')]]));
    rect(ctx, x - 0.5, RT - 43, 12, 1.4, near('steelPale'));
    rect(ctx, x + 4, RT - 41.8, 7, 0.6, css([220, 246, 255]));
  }
  // How far into a biome the road at `at` is, 0 to 1: easing in over the first 300 units
  // and out over the last, so the road changes from one biome's to the next and back.
  function deepIn(at, biome) {
    if (biomeAt(at, 1) !== biome) {
      return 0;
    }
    var into = ((at - cols) % SPAN + SPAN) % SPAN;
    return Math.max(0, Math.min(1, into / 300, (SPAN - into) / 300));
  }
  // The future's kerb gives way to a dark guide strip; its light is lightLines'.
  function guides(x, red, sleek) {
    var left = onPixel(x), wide = onPixel(x + 8) - left;
    [RT + 2, RT + 42].forEach(function (y) {
      if (sleek < 1) {
        rect(ctx, left, y, wide, 2, near(red ? 'kerb' : 'white', 1 - sleek));
      }
      rect(ctx, left, y, wide, 2, css([28, 32, 42], sleek));
    });
  }
  // The future's lines of light, brighter about each vehicle and with a pulse running along.
  // Drawn by day with the road and again by night over the shade, as light.
  function lightLines(strength) {
    var along = odometer, t = performance.now() / 1000;
    for (var x = -(along % 8); x < cols; x += 8) {
      var sleek = deepIn(x + along + 4, 'future');
      if (!sleek) {
        continue;
      }
      var nearest = 0;
      lit.forEach(function (v) {
        nearest = Math.max(nearest, 1 - Math.abs(x + 4 - v.x - v.length / 2) / (v.length / 2 + 30));
      });
      var pulse = 0.75 + 0.25 * Math.sin((x + along) / 30 - t * 4);
      var on = sleek * strength * Math.min(1, pulse + 0.5 * nearest);
      var left = onPixel(x), wide = onPixel(x + 8) - left;
      rect(ctx, left, RT + 22.6, wide, 0.8, css(NEON[0], on));
      rect(ctx, left, RT + 2.7, wide, 0.6, css(NEON[0], 0.8 * on));
      rect(ctx, left, RT + 42.7, wide, 0.6, css(NEON[1], 0.7 * on));
    }
  }
  // The ruinous biomes' kerbs: faded and dirtied, chipped short, crumbled lower, some gone.
  function brokenKerb(x, y, red, worn, n) {
    var gone = flow.hash('kerb' + n), chip = flow.hash('chip' + n), low = flow.hash('low' + n);
    var colour = blend(tone(red ? 'kerb' : 'white', 0, true), tone('dust', 0, true), worn * (0.45 + 0.25 * low));
    var alpha = gone < 0.22 ? 1 - worn : 1;
    var wide = 8.2 - (chip < 0.45 ? worn * (1.5 + chip * 7) : 0);
    var drop = low < 0.35 ? worn * 0.8 : 0;
    if (alpha > 0.01) {
      rect(ctx, x + (chip < 0.2 ? 8.2 - wide : 0), y + drop, wide, 2 - drop, css(colour, alpha));
    }
  }
  // The foreground: low things passing in front, faster than the road.
  function drawFore() {
    var rate = 1.5, along = odometer * rate, gap = 26;
    for (var x = -(along % gap) - gap; x < cols + gap; x += gap) {
      var n = Math.round((x + along) / gap), random = seeded(n * 7919 + 17), r = random(), mix = random(), y = RT + 50;
      // Where the biome changes, a stretch of both mixed, each thing taking the biome
      // behind or ahead of it, rather than a line where one gives way.
      var reach = 260 * (mix < 0.5 ? mix * 2 : (mix - 0.5) * 2) * (mix < 0.5 ? -1 : 1);
      var kind = BIOMES[biomeAt(x + along + reach, rate)].fore;
      if (r < 0.45 || bridges.some(function (b) { return x + 12 > b[0] && x < b[1]; })) {
        continue;
      }
      (FORE[kind] || FORE.stones)(x, y, r);
    }
  }
  var FORE = {
    tufts: function (x, y, r) {
      ctx.strokeStyle = near('grassDark');
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var bend = -lean(performance.now() + x * 30, 1) * 60;
      for (var b = 0; b < 9; b += 1) {
        var bx = x + b * 1.6;
        ctx.moveTo(bx, y + 4);
        ctx.quadraticCurveTo(bx + 1 + bend * 0.4, y - 4, bx + (b % 2 ? 3 : -2) + bend, y - 7 - (b % 3) * 2);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
      if (r > 0.85) {
        circle(ctx, x + 6, y - 9, 1.2, '#f8e070');
      }
    },
    scrub: function (x, y) {
      circle(ctx, x + 5, y + 1, 5, near('earth'));
      circle(ctx, x + 9, y + 2, 4, near('sandDark'));
    },
    debris: function (x, y, r) {
      if (r > 0.8) {
        // A tyre, half buried.
        ctx.fillStyle = '#1a1818';
        ctx.beginPath();
        ctx.ellipse(x + 6, y + 3, 5, 4.4, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = near('scorch');
        ctx.beginPath();
        ctx.ellipse(x + 6, y + 3, 2.4, 2, 0, Math.PI, 0);
        ctx.fill();
        return;
      }
      ctx.fillStyle = vertical(ctx, y - 5, y + 3, [[0, near('rust')], [1, near('scorch')]]);
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x + 2, y - 3);
      ctx.lineTo(x + 7, y - 5);
      ctx.lineTo(x + 10, y - 1);
      ctx.lineTo(x + 11, y + 3);
      ctx.fill();
    },
    // A cracked, glowing block of rock; now and then an ember beside it.
    cinders: function (x, y, r) {
      rect(ctx, x, y - 4, 6, 6, near('hellrock'));
      rect(ctx, x, y - 4, 6, 1, near('brick'));
      rect(ctx, x + 2, y - 2, 2.2, 0.6, '#ff8a30');
      rect(ctx, x + 3.4, y - 1.4, 0.6, 2, '#ff8a30');
      if (r > 0.8) {
        rect(ctx, x + 8, y, 4, 4, near('hellDark'));
        rect(ctx, x + 9, y + 1, 1, 1, '#ffd060');
      }
    },
    // Low lights set in the verge.
    markers: function (x, y, r) {
      ctx.fillStyle = vertical(ctx, y - 3, y + 3, [[0, near('steelPale')], [1, near('steel')]]);
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 2, 4, 2, 0, Math.PI, 0);
      ctx.fill();
      rect(ctx, x + 2.5, y + 0.6, 5, 0.6, neon(r > 0.8 ? 1 : 0, 1, 0));
    },
    bollards: function (x, y) {
      ctx.fillStyle = vertical(ctx, y - 12, y + 4, [[0, near('cityPale')], [1, near('cityDark')]]);
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y - 10);
      ctx.arc(x + 2, y - 10, 2, Math.PI, 0);
      ctx.lineTo(x + 4, y + 4);
      ctx.fill();
      rect(ctx, x, y - 8, 4, 1.6, '#f8c848');
    },
    stones: function (x, y) {
      ctx.fillStyle = vertical(ctx, y - 7, y + 3, [[0, near('cliff')], [1, near('rockDark')]]);
      ctx.beginPath();
      ctx.ellipse(x + 6, y + 2, 7, 6, 0, Math.PI, 0);
      ctx.fill();
    },
  };
  // The overpasses: behind the traffic (front false) only their shade on the road by day;
  // in front of it (front true) their decks and near piers.
  function overpasses(along, front) {
    pieces(along - 60, along + cols + 60).forEach(function (piece) {
      if (piece.kind !== 'overpass') {
        return;
      }
      var x = piece.at - along;
      if (front) {
        overpassDeck(x);
      } else if (light.night < 0.6) {
        rect(ctx, x + 2, RT + 2, 44, 42, 'rgba(0, 0, 0, ' + (0.28 * (1 - light.night / 0.6)).toFixed(3) + ')');
      }
    });
  }
  function overpassDeck(x) {
    var rows = flow.height / k;
    ctx.fillStyle = vertical(ctx, RT - 47, RT - 33, [[0, near('cityPale')], [0.7, near('city')], [1, near('cityDark')]]);
    ctx.fillRect(x - 4, RT - 47, 54, 14);
    frontShapes.push([x - 4, RT - 50, 54, 17]);
    rect(ctx, x - 4, RT - 47, 54, 0.8, near('white'));
    ctx.strokeStyle = near('rail');
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - 4, RT - 49.5);
    ctx.lineTo(x + 50, RT - 49.5);
    for (var r = x - 2; r < x + 50; r += 4) {
      ctx.moveTo(r, RT - 49.5);
      ctx.lineTo(r, RT - 47);
    }
    ctx.stroke();
    ctx.fillStyle = vertical(ctx, RT + 44, rows, [[0, near('city')], [1, near('cityDark')]]);
    ctx.fillRect(x + 16, RT + 44, 14, rows - RT - 44);
    frontShapes.push([x + 16, RT + 44, 14, rows - RT - 44]);
  }
  // Studs along the middle line between the dashes, catching the headlights by night.
  var studs = [];
  function drawStuds(along) {
    studs = [];
    for (var x = -(along % 24) + 18; x < cols; x += 24) {
      if (deepIn(x + along, 'future') > 0.5) {
        continue;
      }
      circle(ctx, x, RT + 23, 0.5, near('rail'));
      studs.push(x);
    }
  }
