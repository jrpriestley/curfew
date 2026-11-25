  // Tiles are made when first wanted and kept. When the light changes they're redrawn,
  // but only `fresh.budget` a frame (one on a computer, one every third frame on the TV),
  // so dusk doesn't stutter; until then the old picture shows. Unused for KEEP they're
  // dropped: the TV is short of memory, and running out cost it frames.
  var tiles = {};
  // `ramp`: {edge, coming, gap} for a tile with a biome's edge in it, thinned toward there
  // (`thinning`). Otherwise whole.
  function tileOf(biome, slot, variant, fresh, now, ramp) {
    var key = biome + '|' + slot.key + '|' + variant + (ramp ? '|' + ramp.edge + ramp.coming + ramp.gap : ''), have = tiles[key];
    if (have && (have.version === version || !fresh.budget)) {
      have.used = now;
      return have.canvas;
    }
    if (have) {
      fresh.budget -= 1;
    }
    var fine = Math.min(k, slot.fine), h = slot.from - slot.to;
    var made = have ? have.canvas : document.createElement('canvas');
    made.width = Math.ceil(TILE * fine);
    made.height = Math.ceil(h * fine);
    var p = made.getContext('2d');
    // Right to its last pixel: a part-filled one at its side or foot showed as a thin gap.
    p.setTransform(made.width / TILE, 0, 0, made.height / h, 0, 0);
    p.clearRect(0, 0, TILE, h);
    if (ramp) {
      thin = thinning(ramp);
    }
    KINDS[BIOMES[biome][slot.key]](p, seeded(hashOf(biome + '|' + slot.key + '|' + variant)), h, slot.haze);
    thin = null;
    tiles[key] = {canvas: made, version: version, used: now};
    return made;
  }
  function easeStep(f) {
    f = Math.max(0, Math.min(1, f));
    return f * f * (3 - 2 * f);
  }
  // How much of a kind is kept across a tile, over EDGE about a biome's edge. Built and ruined
  // never mix (`gap`): the old is gone over the first two fifths, then nothing, then the new
  // comes over the last.
  var EDGE = 120;
  function thinning(ramp) {
    return function (x) {
      var f = (x - ramp.edge) / EDGE + 0.5;
      if (ramp.gap) {
        return ramp.coming ? easeStep((f - 0.6) / 0.4) : 1 - easeStep(f / 0.4);
      }
      return ramp.coming ? easeStep(f) : 1 - easeStep(f);
    };
  }
  var KEEP = sharp ? 30000 : 10000;
  function sweepTiles(now) {
    dropPictures(function (picture) { return now - picture.used > KEEP; });
  }
  // A dropped picture's memory is given back at once (a canvas of no size has none): left for
  // the garbage collector it stayed the graphics chip's, and a TV that ran short of it drew 8
  // frames a second till its app was started again.
  function dropPictures(which) {
    [tiles, blends, riseSprites, bodies].forEach(function (cache) {
      Object.keys(cache).forEach(function (key) {
        if (which(cache[key])) {
          cache[key].canvas.width = cache[key].canvas.height = 0;
          delete cache[key];
        }
      });
    });
  }
  function dropAllPictures() {
    dropPictures(function () { return true; });
  }
  window.addEventListener('pagehide', dropAllPictures);
  // The wind leans what grows and sways it in gusts, the nearer the more: a tile of trees is
  // sheared about its foot. Buildings and rock stand still (not in SWAYS).
  var SWAYS = {woods: 1, copse: 1, hedge: 1, clifftop: 1, downs: 0.5, cacti: 0.15};
  function lean(time, depth) {
    var wind = Math.min(1, ((flow.weather && flow.weather.wind) || 0) / 40);
    var gust = Math.sin(time / 900) * 0.6 + Math.sin(time / 370 + 1.3) * 0.4;
    return -(0.05 * flow.windX + wind * 0.035 * gust) * depth;
  }
  // Where a ruinous biome meets a built one, their tiles leave a gap between them.
  function ruinous(biome) {
    return biome === 'wasteland' || biome === 'aftermath' || biome === 'warzone' || biome === 'asteroids' || biome === 'underworld';
  }
  // Every layer scrolls at its own rate and no other, and nothing in it fades or hides on
  // screen: a biome's pieces come on from the right and scroll off to the left.
  // The pictures to draw at a tile's place, each [picture, from, to] in the tile's units:
  // one, or where a biome's edge is in it the old one's up to there and the new one's from.
  function slotLayers(slot, i, fresh, now, time) {
    var variant = ((i % 2) + 2) % 2, left = i * TILE;
    var alt = glitch && gl.g > 0.2 && altTile(i, slot, time);
    if (alt) {
      return [[alt, 0, TILE]];
    }
    var before = spanOver(left - EDGE / 2, slot.rate), after = spanOver(left + TILE + EDGE / 2, slot.rate);
    var old = spanNow(before), next = spanNow(after);
    if (old === next) {
      return [[tileOf(old, slot, variant, fresh, now), 0, TILE]];
    }
    var edge = Math.round(spanEdge(after, slot.rate) - left), gap = ruinous(old) !== ruinous(next);
    var upTo = Math.min(TILE, edge + EDGE / 2), from = Math.max(0, edge - EDGE / 2);
    var layers = [];
    if (upTo > 0) {
      layers.push([tileOf(old, slot, variant, fresh, now, {edge: edge, coming: false, gap: gap}), 0, upTo]);
    }
    if (from < TILE) {
      layers.push([tileOf(next, slot, variant, fresh, now, {edge: edge, coming: true, gap: gap}), from, TILE]);
    }
    return layers;
  }
  function drawSlot(slot, fresh, now, time) {
    if (slot.rows) {
      drawRows(slot, fresh, now);
      return;
    }
    var along = odometer * slot.rate, first = Math.floor(along / TILE), foot = RT - slot.to, high = slot.from - slot.to;
    for (var i = first; i * TILE - along < cols; i += 1) {
      var sways = SWAYS[BIOMES[biomeAt(i * TILE, slot.rate)][slot.key]] || SWAYS[BIOMES[biomeAt((i + 1) * TILE, slot.rate)][slot.key]];
      var skew = sways ? lean(time + i * 400, sways * slot.rate * 2) : 0;
      if (skew) {
        ctx.save();
        ctx.transform(1, 0, skew, 1, -skew * foot, 0);
      }
      // At a whole pixel: between pixels, fine detail shimmers as it creeps along.
      var left = Math.round((i * TILE - along) * k) / k;
      slotLayers(slot, i, fresh, now, time).forEach(function (layer) {
        drawPart(layer[0], layer[1], layer[2], 0, high, high, left, RT - slot.from);
      });
      if (skew) {
        ctx.restore();
      }
    }
    fogOver(slot);
  }
  // A tile's picture from `from` to `to` across and `top` to `bottom` down, of a tile `high`
  // high, at its place: the tile's left at `left`, its top at `y`.
  function drawPart(picture, from, to, top, bottom, high, left, y) {
    var qx = picture.width / TILE, qy = picture.height / high;
    // A hair over its width, so no seam shows between tiles.
    var head = outward(y + top, -1), foot = outward(y + bottom, 1);
    ctx.drawImage(picture, from * qx, top * qy, (to - from) * qx, (bottom - top) * qy, left + from, head, to - from + 0.5, foot - head);
  }
  // The whole pixel past `y`, up (-1) or down (1). Two edges meeting inside a pixel each cover
  // part of it, and what's behind them both shows through as a thin line: so each thing's edge
  // goes to a whole pixel, over its neighbour's.
  function outward(y, way) {
    return (way < 0 ? Math.floor(y * k + 0.001) : Math.ceil(y * k - 0.001) + 1) / k;
  }
  // The nearest whole pixel, for strips side by side.
  function onPixel(x) {
    return Math.round(x * k) / k;
  }
  // In fog, a wash over each slot fading in from its top, so no edge shows.
  function fogOver(slot) {
    if (!(flow.precip && flow.precip.fog)) {
      return;
    }
    var low = skyColour('low'), top = RT - slot.from;
    rect(ctx, 0, top, cols, slot.from + 4, vertical(ctx, top, top + slot.from * 0.4, [[0, css(low, 0)], [1, css(low, 0.16 * (1 - slot.haze * 0.3))]]));
  }
  // The band, row by row, each at its own rate between the slot's `rows`, and so each with
  // its own place for a biome's edge. It's solid in every biome, so there it can't thin:
  // the new one's is laid over the old one's with a soft left end (`rowJoin`).
  var JOIN = 160;
  function drawRows(slot, fresh, now) {
    var h = slot.from - slot.to, top = RT - slot.from;
    bandRows(h).forEach(function (row, r, rows) {
      var rate = slot.rows[0] + (slot.rows[1] - slot.rows[0]) * ((row[0] + row[1]) / 2) / h, along = odometer * rate;
      // A hair over the next row, so no seam shows.
      var tall = row[1] - row[0] + (r < rows.length - 1 ? 0.35 : 0), bottom = Math.min(row[0] + tall, h);
      var before = spanOver(along - JOIN / 2, rate), after = spanOver(along + cols + JOIN / 2, rate);
      var old = spanNow(before), next = spanNow(after), edge = spanEdge(after, rate);
      var joined = edge + JOIN / 2, changes = old !== next;
      for (var i = Math.floor(along / TILE); i * TILE - along < cols; i += 1) {
        var variant = ((i % 2) + 2) % 2, left = Math.round((i * TILE - along) * k) / k;
        if (!changes || i * TILE < joined) {
          drawPart(tileOf(old, slot, variant, fresh, now), 0, TILE, row[0], bottom, h, left, top);
        }
        if (changes && (i + 1) * TILE > joined) {
          drawPart(tileOf(next, slot, variant, fresh, now), Math.max(0, joined - i * TILE), TILE, row[0], bottom, h, left, top);
        }
      }
      if (changes && joined > along && edge - JOIN / 2 < along + cols) {
        var join = rowJoin(next, slot, r, row[0], bottom, h, edge - JOIN / 2, fresh, now);
        var x = Math.round((edge - JOIN / 2 - along) * k) / k;
        var head = outward(top + row[0], -1);
        ctx.drawImage(join, x, head, JOIN, outward(top + bottom, 1) - head);
      }
    });
    fogOver(slot);
  }
  // A row of the band from `from` in its layer, JOIN wide, coming in from clear at its left.
  var blends = {};
  function rowJoin(biome, slot, r, top, bottom, h, from, fresh, now) {
    var first = Math.floor(from / TILE), key = biome + '|' + r + '|' + Math.round(from), have = blends[key];
    var sources = [first, first + 1].map(function (i) { return tileOf(biome, slot, ((i % 2) + 2) % 2, fresh, now); });
    if (have && have.version === version) {
      have.used = now;
      return have.canvas;
    }
    var q = sources[0].height / h, made = have ? have.canvas : document.createElement('canvas');
    made.width = Math.ceil(JOIN * q);
    made.height = Math.max(1, Math.ceil((bottom - top) * q));
    var p = made.getContext('2d');
    sources.forEach(function (source, s) {
      p.drawImage(source, 0, top * q, source.width, (bottom - top) * q, ((first + s) * TILE - from) * q, 0, source.width, made.height);
    });
    var soft = p.createLinearGradient(0, 0, made.width, 0);
    soft.addColorStop(0, 'rgba(0, 0, 0, 0)');
    soft.addColorStop(1, 'rgba(0, 0, 0, 1)');
    p.globalCompositeOperation = 'destination-in';
    p.fillStyle = soft;
    p.fillRect(0, 0, made.width, made.height);
    p.globalCompositeOperation = 'source-over';
    blends[key] = {canvas: made, version: version, used: now};
    return made;
  }
  // A storm's lightning: now and then a flash over the sky and the scenery, fading fast.
  var flash = {next: 8, k: 0};
  function drawLightning(seconds) {
    if (!(flow.precip && flow.precip.storm)) {
      return;
    }
    flash.next -= seconds;
    flash.k = Math.max(0, flash.k - seconds * 3);
    if (flash.next <= 0) {
      flash.k = 1;
      flash.next = 6 + 18 * Math.random();
      if (flow.sound) {
        flow.sound.shot('thunder', 0.3 + 0.4 * Math.random(), 0.5 + 2.5 * Math.random(), Math.random() * 1.6 - 0.8);
      }
    }
    if (flash.k > 0.01) {
      var flicker = Math.random() < 0.3 ? 0.5 : 1;
      rect(ctx, 0, 0, cols, RT, 'rgba(230, 236, 255, ' + (0.45 * flash.k * flicker).toFixed(3) + ')');
    }
  }
  // Two decks of clouds drifting with the wind; more when overcast, fewer in the desert.
  // Each fades in or out over about six seconds as the count changes.
  var CLOUDS = [];
  (function () {
    var random = seeded(57);
    for (var i = 0; i < 14; i += 1) {
      CLOUDS.push({x: random() * 900, y: 10 + random() * 70, w: 24 + random() * 46, rate: i % 2 ? 0.012 : 0.025, seed: random()});
    }
  })();
  var cloudsAt = 0;
  function drawClouds(time) {
    var biome = BIOMES[biomeAt(odometer + cols * 0.5, 1)];
    var many = Math.min(14, (3 + 11 * flow.overcast) * biome.clouds);
    var lit = blend(STUFF.cloud, [36, 44, 76], light.night * 0.88);
    var shade = blend(STUFF.cloudShade, [20, 26, 54], light.night * 0.88);
    var step = Math.min(1, Math.max(0, time - cloudsAt) / 1000 / 6);
    cloudsAt = time;
    CLOUDS.forEach(function (cloud, i) {
      var want = Math.max(0, Math.min(1, many - i));
      cloud.shown = cloud.shown === undefined ? want : cloud.shown + Math.max(-step, Math.min(step, want - cloud.shown));
      if (cloud.shown < 0.01) {
        return;
      }
      var x = ((cloud.x - odometer * cloud.rate - time / 1000 * 0.8 * (1 + flow.windX)) % 960 + 960) % 960 - 60;
      var w = cloud.w, y = cloud.y;
      // Faded with alpha, not in the gradient, so the gradient stays cached.
      ctx.globalAlpha = cloud.shown;
      ctx.fillStyle = vertical(ctx, y - w * 0.3, y + 3, [[0, css(lit)], [1, css(shade)]]);
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y, w * 0.5, 4, 0, 0, 6.2832);
      ctx.ellipse(x + w * 0.35, y - 3, w * 0.22, w * 0.13, 0, 0, 6.2832);
      ctx.ellipse(x + w * 0.6, y - 4, w * 0.25, w * 0.17, 0, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
