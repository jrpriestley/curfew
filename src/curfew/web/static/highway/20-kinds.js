  // The kinds of tile a slot can hold, by name (BIOMES). Each draws one TILE-wide tile of
  // height h with its own seeded `random`, so the same tile always comes out the same:
  // the order of random() calls is the layout, and changing it changes the scenery.

  // The side of each peak turned from the light. `foot`: how far along the slope its shade
  // meets the ground.
  function shadeSlopes(p, line, h, fill, foot) {
    p.fillStyle = fill;
    for (var x = 2; x < TILE - 2; x += 1) {
      var peak = line[x] > line[x - 1] && line[x] >= line[x + 1];
      if (!peak) {
        continue;
      }
      var end = x;
      while (end < TILE && line[end + 1] <= line[end]) {
        end += 1;
      }
      p.beginPath();
      p.moveTo(x, h - line[x] * h);
      for (var e = x; e <= end; e += 2) {
        p.lineTo(e, h - line[e] * h);
      }
      p.lineTo(end, h);
      p.lineTo(x + (end - x) * foot, h);
      p.closePath();
      p.fill();
      x = end;
    }
  }
  function ellipse(p, x, y, rx, ry, fill) {
    p.fillStyle = fill;
    p.beginPath();
    p.ellipse(x, y, rx, ry, 0, 0, 6.2832);
    p.fill();
  }
  function triangle(p, ax, ay, bx, by, cx, cy) {
    p.beginPath();
    p.moveTo(ax, ay);
    p.lineTo(bx, by);
    p.lineTo(cx, cy);
    p.closePath();
  }
  function segment(p, ax, ay, bx, by) {
    p.moveTo(ax, ay);
    p.lineTo(bx, by);
  }
  // A small house with a pitched roof, its foot at y.
  function farmstead(p, x, y, size, haze) {
    rect(p, x, y - size * 1.6, size * 3, size * 1.6, stuff('wall', haze));
    triangle(p, x - 0.4, y - size * 1.6, x + size * 1.5, y - size * 2.6, x + size * 3 + 0.4, y - size * 1.6);
    p.fillStyle = stuff('roof', haze);
    p.fill();
  }
  // A strip of fields in perspective, its far edge at y; the hedges between run toward us.
  var FIELD_CROPS = ['field', 'field2', 'grass', 'earth', 'field', 'grassDark'];
  function fieldRow(p, random, y, deep, mist) {
    var lean = deep * 0.6;
    for (var x = -random() * 60 - lean; x < TILE;) {
      var wide = 24 + random() * 60 + deep * 2;
      var crop = FIELD_CROPS[Math.floor(random() * FIELD_CROPS.length)], base = tone(crop, mist);
      p.beginPath();
      p.moveTo(x, y);
      p.lineTo(x + wide + 0.6, y);
      p.lineTo(x + wide + lean + 0.6, y + deep + 0.4);
      p.lineTo(x + lean, y + deep + 0.4);
      p.closePath();
      p.fillStyle = vertical(p, y, y + deep, [[0, css(blend(base, [255, 255, 255], 0.08))], [1, css(blend(base, [0, 0, 0], 0.08))]]);
      p.fill();
      if (crop === 'earth' || crop === 'field2') {
        furrows(p, x, y, wide, deep, lean, mist);
      } else if (crop === 'grass' && deep > 5) {
        p.fillStyle = css([255, 255, 255], 0.05);
        for (var stripe = y + deep * 0.25; stripe < y + deep; stripe += deep * 0.5) {
          p.fillRect(x + lean * 0.5, stripe, wide, deep * 0.22);
        }
      }
      p.strokeStyle = stuff('treeDark', mist, 0.75);
      p.lineWidth = Math.min(1.2, 0.3 + deep * 0.05);
      p.beginPath();
      segment(p, x + wide, y, x + wide + lean, y + deep);
      p.stroke();
      x += wide;
    }
  }
  // Within the field just filled (the current path).
  function furrows(p, x, y, wide, deep, lean, mist) {
    p.save();
    p.clip();
    p.strokeStyle = stuff('treeDark', mist, 0.16);
    p.lineWidth = 0.3;
    p.beginPath();
    for (var f = x + 1; f < x + wide + lean; f += 1.6 + deep * 0.08) {
      segment(p, f, y, f + lean, y + deep);
    }
    p.stroke();
    p.restore();
  }
  // A row of the band fades less into the haze the nearer it is.
  function rowHaze(haze, row, h, depth) {
    return haze * (1 - (row[0] / h) * depth);
  }

  var KINDS = {
    none: function () {},

    // ------------------------------------------------------------- country --
    mountains: function (p, random, h, haze) {
      var ridge = outline(random, 0.05, 1, 55, 60).map(function (t) { return Math.pow(t, 1.5); });
      shape(p, ridge, h, vertical(p, 0, h, [[0, stuff('rock', haze - 0.1)], [1, stuff('rockDark', haze)]]));
      p.save();
      outlinePath(p, ridge, h);
      p.clip();
      var snowLine = h * 0.38, snow = stuff('snow', haze * 0.6);
      rect(p, 0, 0, TILE, snowLine, vertical(p, 0, snowLine, [[0, snow], [0.85, snow], [1, stuff('snow', haze, 0)]]));
      shadeSlopes(p, ridge, h, stuff('rockDark', haze, 0.45), 0.25);
      p.restore();
    },
    ridges: function (p, random, h, haze) {
      var ridge = outline(random, 0.2, 0.75, 70, 50);
      shape(p, ridge, h, vertical(p, 0, h, [[0, stuff('tree', haze)], [1, stuff('treeDark', haze)]]));
      p.save();
      outlinePath(p, ridge, h);
      p.clip();
      shadeSlopes(p, ridge, h, stuff('treeDark', haze, 0.55), 0.3);
      for (var n = 0; n < 7; n += 1) {
        var cx = random() * TILE, cy = h - ridge[Math.round(cx)] * h * (0.3 + 0.4 * random());
        ellipse(p, cx, cy, 4 + random() * 7, 1.2 + random() * 1.5, stuff('grass', haze, 0.45));
      }
      p.restore();
      // The trees along the crest: small points against the sky.
      p.fillStyle = stuff('treeDark', haze);
      for (var x = 1; x < TILE; x += 1.6) {
        var t = ridge[Math.round(x)];
        if (t < 0.05) {
          continue;
        }
        var y = h - t * h, tall = 1.2 + random() * 1.6;
        triangle(p, x - 0.9, y + 0.6, x, y - tall, x + 0.9, y + 0.6);
        p.fill();
      }
    },
    fields: function (p, random, h, haze) {
      bandRows(h).forEach(function (row, n) {
        var y = row[0], deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.7);
        fieldRow(p, random, y, deep, mist);
        var hedge = Math.min(1, 0.3 + deep * 0.04);
        p.fillStyle = stuff('treeDark', mist, 0.8);
        p.fillRect(0, y + deep - hedge, TILE, hedge + 0.2);
        for (var t = 0; t < 3 + n; t += 1) {
          tree(p, random, random() * TILE, y + deep, Math.min(deep * 0.95, 1.5 + deep * 0.35), mist, true);
        }
        if (random() < 0.5) {
          var fx = 40 + random() * (TILE - 80);
          farmstead(p, fx, y + deep, Math.min(1.2 + deep * 0.3, deep * 0.36), mist);
        }
      });
    },
    downs: function (p, random, h, haze) {
      var ridge = outline(random, 0.25, 0.8, 110, 70);
      shape(p, ridge, h, vertical(p, 0, h, [[0, stuff('field', haze)], [0.4, stuff('grass', haze)], [1, stuff('grassDark', haze)]]));
      for (var n = 0; n < 12; n += 1) {
        var x = 80 + random() * (TILE - 160);
        tree(p, random, x, h - ridge[Math.round(x)] * h * (0.3 + 0.6 * random()) + 2, 7 + random() * 6, haze, random() < 0.5);
      }
    },
    woods: function (p, random, h, haze) {
      var ridge = outline(random, 0.2, 0.55, 60, 50);
      shape(p, ridge.map(function (t) { return t * 0.5; }), h, stuff('treeDark', haze));
      for (var x = 10; x < TILE - 10; x += 3 + random() * 4) {
        var t = ridge[Math.round(x)];
        if (t > 0.08) {
          tree(p, random, x, h - t * h * 0.3, 8 + random() * t * 34, haze, random() < 0.35);
        }
      }
    },
    copse: function (p, random, h, haze) {
      for (var x = 60; x < TILE - 60; x += 70 + random() * 120) {
        if (!kept(x)) {
          continue;
        }
        if (random() < 0.3) {
          farmhouse(p, random, x, h, haze);
          continue;
        }
        for (var n = 0; n < 3 + random() * 4; n += 1) {
          tree(p, random, x + n * 6, h, 14 + random() * 22, haze, random() < 0.5);
        }
      }
    },
    hedge: function (p, random, h, haze) {
      rect(p, 0, h - 5, TILE, 5, stuff('grass', haze));
      shape(p, outline(random, 0.12, 0.3, 40, 1e9).map(function (t) { return t * 0.5 + 5 / h; }), h, stuff('grassDark', haze));
      for (var x = 20; x < TILE - 20; x += 40 + random() * 90) {
        tree(p, random, x, h - 5, 16 + random() * 14, haze, random() < 0.6);
      }
    },

    // ---------------------------------------------------------------- city --
    skyline: function (p, random, h, haze) {
      for (var x = 8; x < TILE - 8;) {
        var w = 8 + random() * 14;
        var tall = h * (0.25 + 0.75 * random()) * Math.min(1, Math.min(x, TILE - x) / 60);
        if (tall > 4) {
          building(p, random, x, w, tall, h, haze, false);
        }
        x += w + random() * 3;
      }
    },
    sprawl: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('city', haze)], [1, stuff('cityDark', haze * 0.6)]]));
      bandRows(h).forEach(function (row) {
        var deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.5);
        for (var x = random() * 8; x < TILE; x += 3 + random() * 6 + deep * 0.6) {
          var w = 2 + deep * (0.4 + random() * 0.6), tall = deep * (0.35 + random() * 0.55);
          if (tall > 1.2) {
            building(p, random, x, w, tall, row[1], mist, false, true);
          }
          x += w;
        }
      });
    },
    towers: function (p, random, h, haze) {
      for (var x = 20; x < TILE - 30;) {
        var w = 14 + random() * 20, tall = h * (0.3 + 0.7 * random());
        building(p, random, x, w, tall, h, haze, true);
        x += w + 6 + random() * 30;
      }
    },
    blocks: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 50;) {
        var w = 24 + random() * 26, tall = h * (0.5 + 0.5 * random());
        building(p, random, x, w, tall, h, haze, true);
        x += w + 20 + random() * 60;
      }
    },
    shops: function (p, random, h, haze) {
      rect(p, 0, h - 3, TILE, 3, stuff('pavement', haze));
      for (var x = 10; x < TILE - 40;) {
        var w = 30 + random() * 24, tall = 20 + random() * 12;
        if (!kept(x)) {
          x += w + 4;
          continue;
        }
        shop(p, random, x, w, tall, h, haze);
        x += w + 4;
        if (random() < 0.5) {
          tree(p, random, x + 6, h - 3, 18, haze, true);
          x += 14;
        }
      }
    },

    // -------------------------------------------------------------- desert --
    mesas: function (p, random, h, haze) {
      for (var x = 40; x < TILE - 80; x += 90 + random() * 100) {
        if (kept(x)) {
          mesa(p, random, x, h, haze);
        }
      }
    },
    dunes: function (p, random, h, haze) {
      var ridge = outline(random, 0.15, 0.6, 90, 60);
      shape(p, ridge, h, vertical(p, 0, h, [[0, stuff('sand', haze - 0.05)], [1, stuff('sandDark', haze)]]));
      p.strokeStyle = stuff('sand', Math.max(0, haze - 0.2));
      p.lineWidth = 0.8;
      p.beginPath();
      for (var x = 0; x <= TILE; x += 2) {
        p[x ? 'lineTo' : 'moveTo'](x, h - ridge[x] * h + 0.5);
      }
      p.stroke();
    },
    sands: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('sand', haze)], [1, stuff('sandDark', haze * 0.5)]]));
      p.strokeStyle = stuff('sandDark', haze, 0.5);
      p.lineWidth = 0.6;
      for (var n = 0; n < 60; n += 1) {
        var y = random() * h, x = random() * TILE;
        p.beginPath();
        p.moveTo(x, y);
        p.quadraticCurveTo(x + 6, y - 1, x + 12, y);
        p.stroke();
      }
    },
    buttes: function (p, random, h, haze) {
      KINDS.mesas(p, random, h, haze);
    },
    rocks: function (p, random, h, haze) {
      for (var x = 40; x < TILE - 60; x += 80 + random() * 140) {
        if (!kept(x)) {
          continue;
        }
        var w = 12 + random() * 20, tall = 8 + random() * 26;
        p.beginPath();
        p.moveTo(x, h);
        p.bezierCurveTo(x, h - tall * 1.2, x + w, h - tall * 1.2, x + w, h);
        p.closePath();
        var shade = p.createLinearGradient(x, 0, x + w, 0);
        shade.addColorStop(0, stuff('mesa', haze));
        shade.addColorStop(1, stuff('mesaDark', haze));
        p.fillStyle = shade;
        p.fill();
        if (tall > 24 && random() < 0.5) {
          // An arch, cut out so what's behind shows through.
          p.save();
          p.globalCompositeOperation = 'destination-out';
          p.beginPath();
          p.ellipse(x + w / 2, h, w * 0.3, tall * 0.5, 0, Math.PI, 0);
          p.fill();
          p.restore();
        }
      }
    },
    cacti: function (p, random, h, haze) {
      rect(p, 0, h - 4, TILE, 4, stuff('sandDark', haze));
      p.lineCap = 'round';
      for (var x = 20; x < TILE - 20; x += 30 + random() * 70) {
        if (!kept(x)) {
          continue;
        }
        if (random() < 0.6) {
          cactus(p, random, x, h - 4, haze);
        } else {
          p.beginPath();
          p.ellipse(x + 4, h - 4, 5, 3.5, 0, Math.PI, 0);
          p.fillStyle = stuff('mesaDark', haze);
          p.fill();
        }
      }
    },

    // --------------------------------------------------------------- coast --
    islands: function (p, random, h, haze) {
      for (var x = 60; x < TILE - 100; x += 120 + random() * 160) {
        if (!kept(x)) {
          continue;
        }
        var w = 30 + random() * 60, tall = 4 + random() * 10;
        p.beginPath();
        p.moveTo(x, h);
        p.bezierCurveTo(x + w * 0.2, h - tall * 1.3, x + w * 0.7, h - tall * 1.4, x + w, h);
        p.closePath();
        p.fillStyle = stuff('rock', haze + 0.1);
        p.fill();
      }
    },
    sea: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('sea', haze + 0.15)], [0.3, stuff('sea', haze * 0.6)], [1, stuff('seaDark', 0)]]));
      rect(p, 0, 0, TILE, 0.8, stuff('foam', 0.5, 0.7));
      p.lineWidth = 0.5;
      for (var n = 0; n < 260; n += 1) {
        var y = 2 + Math.pow(random(), 0.7) * (h - 2), long = 2 + y / 5, x = random() * TILE;
        p.strokeStyle = random() < 0.5 ? stuff('foam', haze * (1 - y / h) + 0.2, 0.7) : stuff('seaDark', 0, 0.5);
        p.beginPath();
        p.moveTo(x, y);
        p.quadraticCurveTo(x + long / 2, y - 0.6, x + long, y);
        p.stroke();
      }
    },
    headlands: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 120; x += 140 + random() * 160) {
        if (kept(x)) {
          headland(p, random, x, h, haze);
        }
      }
    },
    lighthouse: function (p, random, h, haze) {
      var x = 200 + random() * 240;
      if (kept(x)) {
        lighthouse(p, x, h, haze);
      }
    },
    clifftop: function (p, random, h, haze) {
      rect(p, 0, h - 6, TILE, 6, vertical(p, h - 6, h, [[0, stuff('field', haze)], [0.3, stuff('grass', haze)], [1, stuff('grassDark', haze)]]));
      p.strokeStyle = stuff('earth', haze);
      p.lineWidth = 1;
      for (var x = 4; x < TILE; x += 14) {
        p.beginPath();
        segment(p, x, h - 5, x, h - 13);
        p.stroke();
      }
      p.lineWidth = 0.7;
      p.beginPath();
      segment(p, 0, h - 12, TILE, h - 12);
      segment(p, 0, h - 9, TILE, h - 9);
      p.stroke();
      for (var n = 0; n < 6; n += 1) {
        tree(p, random, 40 + random() * (TILE - 80), h - 6, 10 + random() * 8, haze, true);
      }
    },

    // -------------------------------------------------------------- future --
    // Its lights are dim by day and brighter as it darkens (`neon`). Spires: drawRises.
    grid: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('plaza', haze)], [1, stuff('plazaDark', haze * 0.5)]]));
      bandRows(h).forEach(function (row) {
        var y = row[0], deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.6), lean = deep * 0.6;
        for (var n = 0; n < 2; n += 1) {
          var sx = random() * TILE, wide = 16 + random() * 30 + deep * 3;
          if (!kept(sx) || deep < 3) {
            continue;
          }
          var top = y + deep * 0.2, foot = y + deep * 0.85;
          p.fillStyle = vertical(p, top, foot, [[0, stuff('glass', mist)], [1, stuff('glassDark', mist)]]);
          p.beginPath();
          p.moveTo(sx, top);
          p.lineTo(sx + wide, top);
          p.lineTo(sx + wide + lean * 0.65, foot);
          p.lineTo(sx + lean * 0.65, foot);
          p.closePath();
          p.fill();
        }
        p.fillStyle = neon(0, 0.25, mist);
        p.fillRect(0, row[1] - 0.3, TILE, 0.3);
        for (var lx = random() * 30; lx < TILE; lx += 24 + random() * 30) {
          p.strokeStyle = neon(random() < 0.8 ? 0 : 1, 0.3, mist);
          p.lineWidth = 0.3;
          p.beginPath();
          segment(p, lx, y + 0.3, lx + lean, row[1] - 0.3);
          p.stroke();
        }
      });
    },
    domes: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 60; x += 50 + random() * 90) {
        if (!kept(x)) {
          continue;
        }
        var pick = random();
        if (pick < 0.45) {
          x += glassDome(p, random, x, h, haze);
        } else if (pick < 0.75) {
          x += archedHall(p, random, x, h, haze);
        } else {
          windTurbine(p, random, x, h, haze);
        }
      }
    },
    monorail: function (p, random, h, haze) {
      for (var x = 20; x < TILE - 20; x += 14 + random() * 26) {
        if (kept(x)) {
          tree(p, random, x, h, 8 + random() * 8, haze, true);
        }
      }
      var track = h - 36;
      // Pylon by pylon, each with the beam either side, so a change of biome thins it.
      for (var px = 40; px < TILE - 40; px += 80) {
        if (!kept(px)) {
          continue;
        }
        p.fillStyle = vertical(p, track, h, [[0, stuff('steelPale', haze)], [1, stuff('steel', haze)]]);
        p.beginPath();
        p.moveTo(px - 2.4, h);
        p.lineTo(px - 1.2, track + 4);
        p.lineTo(px - 5, track + 1.6);
        p.lineTo(px + 5, track + 1.6);
        p.lineTo(px + 1.2, track + 4);
        p.lineTo(px + 2.4, h);
        p.closePath();
        p.fill();
        var from = Math.max(0, px - 40), to = Math.min(TILE, px + 40);
        rect(p, from, track - 1.4, to - from, 3, vertical(p, track - 1.4, track + 1.6, [[0, stuff('steelPale', haze)], [1, stuff('steel', haze)]]));
        rect(p, from, track + 1.2, to - from, 0.4, neon(0, 0.6, haze));
      }
    },
    pods: function (p, random, h, haze) {
      for (var x = 40; x < TILE - 60; x += 70 + random() * 110) {
        if (!kept(x)) {
          continue;
        }
        var w = 24 + random() * 30, tall = 14 + random() * 14, band = Math.floor(random() * 3);
        var lit = light.night > 0.25 + random() * 0.3;
        var pod = new Path2D();
        pod.moveTo(x, h);
        pod.lineTo(x, h - tall + 6);
        pod.quadraticCurveTo(x, h - tall, x + 6, h - tall);
        pod.lineTo(x + w - 8, h - tall);
        pod.quadraticCurveTo(x + w, h - tall, x + w, h - tall + 8);
        pod.lineTo(x + w, h);
        pod.closePath();
        p.fillStyle = vertical(p, h - tall, h, [[0, stuff('steelPale', haze)], [1, stuff('plazaDark', haze)]]);
        p.fill(pod);
        rect(p, x + 3, h - tall + 4, w - 6, tall * 0.35, lit ? css(blend([255, 236, 200], NEON[band], 0.25)) : stuff('glassDark', haze));
        rect(p, x, h - 3, w, 0.8, neon(band, 0.9, haze));
        if (random() < 0.6) {
          tree(p, random, x + w + 6, h, 12 + random() * 8, haze, true);
        }
      }
    },
    planters: function (p, random, h, haze) {
      rect(p, 0, h - 5, TILE, 5, stuff('plaza', haze));
      for (var x = 16; x < TILE - 20; x += 34 + random() * 30) {
        if (!kept(x)) {
          continue;
        }
        rect(p, x, h - 9, 14, 4, vertical(p, h - 9, h - 5, [[0, stuff('steelPale', haze)], [1, stuff('steel', haze)]]));
        circle(p, x + 7, h - 15, 6, stuff('trim', haze));
        circle(p, x + 5, h - 17, 3, stuff('treeLight', haze, 0.5));
        // A bollard, lit at its top.
        rect(p, x + 22, h - 13, 1.6, 8, stuff('steel', haze));
        rect(p, x + 22, h - 13, 1.6, 2, neon(0, 1, haze));
      }
    },

    // -------------------------------------------------------------- atomic --
    // Tomorrow as the fifties saw it. Its towers: drawRises.
    suburb: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('grass', haze)], [1, stuff('grassDark', haze * 0.5)]]));
      bandRows(h).forEach(function (row) {
        var deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.7), foot = row[1] - deep * 0.15;
        var street = Math.max(0.3, deep * 0.12);
        rect(p, 0, row[1] - street, TILE, street, stuff('pavement', mist, 0.8));
        for (var x = random() * 10; x < TILE; x += deep * (1.2 + random() * 1.2)) {
          if (random() < 0.3) {
            tree(p, random, x, foot, Math.min(deep * 0.8, 1 + deep * 0.6), mist, true);
            x += deep * 0.6;
            continue;
          }
          x += suburbanHouse(p, random, x, foot, deep, mist);
        }
      });
    },
    googie: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 60; x += 60 + random() * 90) {
        if (!kept(x)) {
          continue;
        }
        var pick = random();
        if (pick < 0.3) {
          x += saucerOnStilts(p, random, x, h, haze);
        } else if (pick < 0.6) {
          x += boomerangRoof(p, random, x, h, haze);
        } else if (pick < 0.8) {
          needleTower(p, random, x, h, haze);
        } else {
          atomOnPole(p, random, x, h, haze);
        }
      }
    },
    diner: function (p, random, h, haze) {
      for (var x = 40; x < TILE - 80; x += 90 + random() * 120) {
        if (!kept(x)) {
          continue;
        }
        if (random() < 0.55) {
          x += diner(p, random, x, h, haze);
        } else {
          rocket(p, random, x, h, haze);
        }
        tree(p, random, x - 14, h, 14 + random() * 8, haze, true);
      }
    },
    picket: function (p, random, h, haze) {
      rect(p, 0, h - 5, TILE, 5, stuff('grass', haze));
      for (var x = 0; x < TILE; x += 24) {
        if (!kept(x + 12)) {
          continue;
        }
        p.fillStyle = stuff('white', haze);
        for (var pale = x; pale < x + 24; pale += 2.4) {
          p.beginPath();
          p.moveTo(pale, h - 5);
          p.lineTo(pale, h - 10);
          p.lineTo(pale + 0.7, h - 11);
          p.lineTo(pale + 1.4, h - 10);
          p.lineTo(pale + 1.4, h - 5);
          p.closePath();
          p.fill();
        }
        rect(p, x, h - 9, 24, 0.7, stuff('white', haze));
        rect(p, x, h - 6.6, 24, 0.7, stuff('white', haze));
        if (random() < 0.6) {
          circle(p, x + 6 + random() * 12, h - 9, 3 + random() * 2, stuff('tree', haze));
        }
      }
    },

    // ------------------------------------------------------------- warzone --
    // Its city: drawRises; its guns and gunships: drawGuns, drawCraft.
    scorched: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('ash', haze)], [1, stuff('scorch', haze * 0.5)]]));
      var burning = 'rgba(255, 120, 40, ' + (0.25 + 0.5 * Math.min(1, light.night * 1.6)).toFixed(2) + ')';
      bandRows(h).forEach(function (row) {
        var deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.7);
        for (var n = 0; n < 3; n += 1) {
          var cx = random() * TILE, rx = 3 + deep * (1 + random());
          ellipse(p, cx, row[0] + deep * 0.55, rx, deep * 0.35, stuff('scorch', mist, 0.7));
          p.fillStyle = stuff('ash', mist * 0.6, 0.6);
          p.beginPath();
          p.ellipse(cx, row[0] + deep * 0.62, rx, deep * 0.3, 0, 0, Math.PI);
          p.fill();
        }
        for (n = 0; n < 2; n += 1) {
          var bx = random() * TILE;
          if (kept(bx)) {
            ellipse(p, bx, row[1] - deep * 0.3, 1 + deep * 0.3, deep * 0.18, burning);
          }
        }
      });
    },
    bunkers: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 40; x += 40 + random() * 70) {
        if (!kept(x)) {
          continue;
        }
        if (random() < 0.4) {
          var bw = 26 + random() * 14;
          p.fillStyle = vertical(p, h - 10, h, [[0, stuff('concrete', haze)], [1, stuff('concreteDark', haze)]]);
          p.beginPath();
          p.moveTo(x, h);
          p.lineTo(x + 5, h - 10);
          p.lineTo(x + bw - 5, h - 10);
          p.lineTo(x + bw, h);
          p.closePath();
          p.fill();
          rect(p, x + 8, h - 7, bw - 16, 1.6, '#100e0e');
          x += bw;
        } else {
          tankTraps(p, x, h, haze);
          x += 27;
        }
      }
    },
    sandbags: function (p, random, h, haze) {
      rect(p, 0, h - 5, TILE, 5, stuff('ash', haze));
      for (var x = 10; x < TILE - 40; x += 40 + random() * 60) {
        if (!kept(x)) {
          continue;
        }
        var wide = 16 + random() * 20, rows = 2 + Math.floor(random() * 2);
        for (var r = 0; r < rows; r += 1) {
          for (var b = x + (r % 2) * 2; b < x + wide - r * 2; b += 4) {
            var bag = vertical(p, h - 5 - (r + 1) * 2.4, h - 5 - r * 2.4, [[0, stuff('sand', haze)], [1, stuff('sandDark', haze)]]);
            ellipse(p, b + 2, h - 6.2 - r * 2.4, 2.1, 1.3, bag);
          }
        }
        x += wide;
      }
    },

    // ------------------------------------------------------------ badlands --
    // Its megacity and adverts: drawRises, drawAdverts; its wind farm: drawMills.
    salt: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('salt', haze)], [1, stuff('saltDark', haze * 0.5)]]));
      bandRows(h).forEach(function (row) {
        var y0 = row[0], deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.7);
        // The plates' edges: across, and down to the next row.
        p.strokeStyle = stuff('saltDark', mist, 0.55);
        p.lineWidth = Math.min(0.5, 0.15 + deep * 0.03);
        p.beginPath();
        for (var cx = random() * 10; cx < TILE; cx += 6 + random() * 10 + deep) {
          var cy = y0 + deep * (0.3 + 0.4 * random());
          segment(p, cx, cy, cx + 4 + random() * (6 + deep), cy + (random() - 0.5) * deep * 0.3);
          segment(p, cx + 2, y0 + 0.2, cx + 2 + (random() - 0.5) * 3, row[1] - 0.2);
        }
        p.stroke();
        for (var n = 0; n < 2; n += 1) {
          ellipse(p, random() * TILE, y0 + deep / 2, 8 + deep * 2, deep * 0.3, stuff('saltDark', mist, 0.25));
        }
        for (n = 0; n < 4; n += 1) {
          var sx = random() * TILE;
          if (kept(sx)) {
            circle(p, sx, row[1] - deep * 0.15, Math.min(deep * 0.3, 0.4 + deep * 0.1), stuff('earth', mist));
          }
        }
      });
    },
    stalls: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 60; x += 60 + random() * 100) {
        if (!kept(x)) {
          continue;
        }
        var pick = random();
        if (pick < 0.55) {
          containers(p, random, x, h, haze);
          x += 30;
        } else if (pick < 0.8) {
          x += stall(p, random, x, h, haze);
        } else {
          saggingFence(p, x, h, haze);
          x += 50;
        }
      }
    },
    chainlink: function (p, random, h, haze) {
      rect(p, 0, h - 5, TILE, 5, stuff('sandDark', haze));
      for (var x = 0; x < TILE; x += 28) {
        if (!kept(x + 14)) {
          continue;
        }
        var top = h - 17 + random() * 1.5;
        p.strokeStyle = stuff('ash', haze, 0.35);
        p.lineWidth = 0.3;
        p.beginPath();
        for (var m = x; m < x + 28; m += 2) {
          segment(p, m, top + 1, m + 3, h - 5);
          segment(p, m + 3, top + 1, m, h - 5);
        }
        p.stroke();
        p.strokeStyle = stuff('ash', haze);
        p.lineWidth = 0.8;
        p.beginPath();
        segment(p, x, h - 5, x, top - 1);
        p.stroke();
        p.lineWidth = 0.4;
        p.beginPath();
        p.moveTo(x, top);
        p.quadraticCurveTo(x + 14, top + 1.5, x + 28, top);
        p.stroke();
        if (random() < 0.4) {
          circle(p, x + 6 + random() * 16, h - 6, 2 + random() * 2, stuff('earth', haze));
        }
      }
    },

    // ----------------------------------------------- wasteland and aftermath --
    deadSky: function (p, random, h, haze) {
      for (var x = 8; x < TILE - 8;) {
        var w = 8 + random() * 14;
        var tall = h * (0.2 + 0.6 * random()) * Math.min(1, Math.min(x, TILE - x) / 60);
        if (tall > 4 && random() < 0.8) {
          ruin(p, random, x, w, tall, h, haze, false);
        }
        x += w + random() * 8;
      }
    },
    deadTowers: function (p, random, h, haze) {
      for (var x = 20; x < TILE - 30;) {
        var w = 14 + random() * 20, tall = h * (0.3 + 0.65 * random());
        ruin(p, random, x, w, tall, h, haze, true);
        x += w + 10 + random() * 40;
      }
    },
    wastes: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, stuff('dust', haze)], [1, stuff('dustDark', haze * 0.5)]]));
      bandRows(h).forEach(function (row, r) {
        var y0 = row[0], deep = row[1] - row[0], mist = rowHaze(haze, row, h, 0.7);
        for (var n = 0; n < 2; n += 1) {
          var scarX = random() * TILE;
          ellipse(p, scarX, y0 + deep / 2, 6 + deep * 3 + random() * 10, deep * 0.3, stuff('scorch', mist, 0.3));
        }
        p.lineWidth = 0.4;
        p.strokeStyle = stuff('dustDark', mist, 0.6);
        for (n = 0; n < 5; n += 1) {
          crack(p, random, row, deep);
        }
        // Far wrecks and stumps, only in the far rows.
        if (r > 3) {
          return;
        }
        for (n = 0; n < 7; n += 1) {
          var jx = random() * TILE;
          if (!kept(jx)) {
            continue;
          }
          if (random() < 0.7) {
            rect(p, jx, row[1] - 1, 2 + random() * 3, Math.min(deep * 0.9, 1 + random() * 0.6), stuff('ash', haze));
          } else {
            rect(p, jx, row[0] + 0.2, 0.4, deep - 0.2, stuff('scorch', haze));
          }
        }
      });
    },
    ruins: function (p, random, h, haze) {
      for (var x = 30; x < TILE - 60; x += 60 + random() * 110) {
        if (!kept(x)) {
          continue;
        }
        var pick = random();
        if (pick < 0.55) {
          burntShell(p, random, x, h, haze);
        } else if (pick < 0.8) {
          fallenPylon(p, random, x, h, haze);
        } else {
          deadTree(p, random, x, h, haze);
        }
      }
    },
    wrecks: function (p, random, h, haze) {
      for (var x = 40; x < TILE - 60; x += 70 + random() * 120) {
        if (!kept(x)) {
          continue;
        }
        var pick = random();
        if (pick < 0.5) {
          rustedHulk(p, random, x, h, haze);
        } else if (pick < 0.8) {
          tyrePile(p, 3 + Math.floor(random() * 3), x, h, haze);
        } else {
          drums(p, random, x, h, haze);
        }
      }
    },
    junk: function (p, random, h, haze) {
      rect(p, 0, h - 4, TILE, 4, stuff('dustDark', haze));
      var posts = [];
      for (var x = 4; x < TILE - 4; x += 10 + random() * 6) {
        posts.push(random() < 0.22 ? null : {x: x, lean: (random() - 0.5) * 0.3, tall: 10 + random() * 4});
      }
      brokenFence(p, posts, h, haze);
      for (var n = 0; n < 5; n += 1) {
        var jx = 20 + random() * (TILE - 40);
        if (!kept(jx)) {
          continue;
        }
        if (random() < 0.5) {
          rect(p, jx, h - 9, 5, 7, stuff('rust', haze));
          rect(p, jx + 3.4, h - 9, 1.6, 7, stuff('rustDark', haze));
        } else {
          p.strokeStyle = stuff('scorch', haze);
          p.lineWidth = 1.6;
          p.beginPath();
          p.ellipse(jx, h - 4.5, 3, 2.4, 0, 0, 6.2832);
          p.stroke();
        }
      }
    },

    // ---------------------------------------------------------- underworld --
    // All in blocks (`cube`). The lava keeps its own colours by night.
    lavaSea: function (p, random, h, haze) {
      rect(p, 0, 0, TILE, h, vertical(p, 0, h, [[0, css(blend([255, 140, 40], skyColour('low'), haze * 0.4))], [1, css([238, 86, 18])]]));
      bandRows(h).forEach(function (row) {
        var deep = row[1] - row[0], b = Math.max(1, deep / 2), mist = rowHaze(haze, row, h, 0.7);
        for (var x = 0; x < TILE; x += b) {
          var pick = random();
          if (pick < 0.3) {
            rect(p, x, row[0] + b * 0.5, b, b, css(blend([60, 14, 10], [255, 120, 30], 0.2 + 0.2 * random()), 0.8));
          } else if (pick < 0.38) {
            rect(p, x, row[0] + b * 0.6, b, b * 0.4, 'rgba(255, 236, 140, 0.7)');
          }
        }
        // Islands: mounds of blocks, two high at most.
        for (var n = 0; n < 3; n += 1) {
          var ix = Math.floor(random() * TILE / b) * b, wide = 3 + Math.floor(random() * 6);
          if (!kept(ix)) {
            continue;
          }
          for (var c = 0; c < wide; c += 1) {
            cube(p, random, ix + c * b, row[1] - b, b, 'hellrock', mist);
            if (c > 0 && c < wide - 1 && random() < 0.6) {
              cube(p, random, ix + c * b, row[1] - 2 * b, b, 'hellrock', mist);
            }
          }
        }
      });
    },
    blockCliffs: function (p, random, h, haze) {
      var ridge = outline(random, 0.12, 0.8, 200, 90), B = 6;
      for (var x = 0; x < TILE; x += B) {
        var top = Math.round(ridge[Math.min(TILE, x + 3)] * h / B) * B;
        if (top <= 0) {
          continue;
        }
        for (var y = h - top; y < h; y += B) {
          cube(p, random, x, y, B, y < h - top + B ? 'hellrock' : 'hellDark', haze * (0.6 + 0.4 * (y - h + top) / top));
        }
        rect(p, x, h - 7, B, 7, vertical(p, h - 7, h, [[0, 'rgba(255, 110, 30, 0)'], [1, 'rgba(255, 110, 30, 0.45)']]));
        if (top > 24 && random() < 0.08) {
          lavaFall(p, random, x, top, h, B);
        }
      }
    },
    blockRocks: function (p, random, h, haze) {
      for (var x = 16; x < TILE - 30; x += 30 + random() * 70) {
        if (!kept(x)) {
          continue;
        }
        var B = 4 + Math.round(random() * 2), wide = 2 + Math.floor(random() * 4);
        for (var c = 0; c < wide; c += 1) {
          var up = 1 + Math.floor(random() * (c === 0 || c === wide - 1 ? 2 : 4));
          for (var r = 0; r < up; r += 1) {
            cube(p, random, x + c * B, h - (r + 1) * B, B, random() < 0.12 ? 'ember' : random() < 0.4 ? 'brick' : 'hellrock', haze);
          }
        }
        x += wide * B;
      }
    },
    blockWall: function (p, random, h, haze) {
      rect(p, 0, h - 4, TILE, 4, css(tone('hellDark', haze, true)));
      for (var x = 0; x < TILE;) {
        var run = 18 + Math.floor(random() * 12) * 3.2, gap = 8 + random() * 22;
        for (var b = x; b < Math.min(TILE, x + run); b += 3.2) {
          if (!kept(b)) {
            continue;
          }
          cube(p, random, b, h - 7, 3.2, 'brick', haze);
          if (random() < 0.7) {
            cube(p, random, b, h - 10.2, 3.2, 'brick', haze);
          }
        }
        x += run;
        if (kept(x + gap / 2)) {
          ellipse(p, x + gap / 2, h - 3.4, gap * 0.4, 1.1, 'rgba(255, 120, 30, 0.85)');
        }
        x += gap;
      }
    },
  };

  // ------------------------------------------------- pieces the kinds share --
  function farmhouse(p, random, x, h, haze) {
    var w = 18 + random() * 10, tall = 12 + random() * 6;
    rect(p, x, h - tall, w, tall, vertical(p, h - tall, h, [[0, stuff('wall', haze)], [1, stuff('cliffDark', haze)]]));
    triangle(p, x - 2, h - tall, x + w / 2, h - tall - 7, x + w + 2, h - tall);
    p.fillStyle = stuff('roof', haze);
    p.fill();
    // Each window comes on at its own time of the evening.
    [x + 4, x + w - 7].forEach(function (wx) {
      var on = light.night > 0.22 + flow.hash('farm' + Math.round(wx)) * 0.3;
      rect(p, wx, h - tall + 4, 2.5, 3, on ? '#f8d878' : stuff('cityDark', haze));
    });
  }
  var AWNINGS = ['#c83838', '#3868c8', '#38a058', '#d8a030'];
  function shop(p, random, x, w, tall, h, haze) {
    var lit = light.night > 0.35;
    var wall = stuff(random() < 0.5 ? 'wall' : 'cityPale', haze);
    rect(p, x, h - 3 - tall, w, tall, vertical(p, h - 3 - tall, h - 3, [[0, wall], [1, stuff('cityDark', haze)]]));
    rect(p, x + 3, h - 15, w - 6, 9, lit ? '#f6dca0' : stuff('window', 0.15));
    var awning = AWNINGS[Math.floor(random() * 4)];
    for (var s = 0; s < w; s += 4) {
      p.fillStyle = s % 8 ? '#ececec' : awning;
      p.beginPath();
      p.moveTo(x + s, h - 19);
      p.lineTo(x + s + 4, h - 19);
      p.lineTo(x + s + 4, h - 16);
      p.arc(x + s + 2, h - 16, 2, 0, Math.PI);
      p.closePath();
      p.fill();
    }
  }
  function mesa(p, random, x, h, haze) {
    var w = 40 + random() * 50, tall = h * (0.35 + 0.5 * random()), slope = 6 + random() * 8;
    p.beginPath();
    p.moveTo(x, h);
    p.lineTo(x + slope, h - tall);
    p.lineTo(x + slope + w, h - tall);
    p.lineTo(x + 2 * slope + w, h);
    p.closePath();
    var sunlit = p.createLinearGradient(x, 0, x + 2 * slope + w, 0);
    sunlit.addColorStop(0, stuff('mesa', haze - 0.05));
    sunlit.addColorStop(0.7, stuff('mesa', haze));
    sunlit.addColorStop(1, stuff('mesaDark', haze));
    p.fillStyle = sunlit;
    p.fill();
    p.save();
    p.clip();
    // Gullies worn down its face, darkest just below the rim.
    p.fillStyle = vertical(p, h - tall, h, [[0, stuff('mesaDark', haze, 0)], [0.25, stuff('mesaDark', haze, 0.35)], [1, stuff('mesaDark', haze, 0.15)]]);
    for (var gx = x + slope + 2; gx < x + slope + w; gx += 3 + random() * 5) {
      p.fillRect(gx, h - tall + 1, 0.8 + random() * 1.2, tall);
    }
    p.fillStyle = stuff('sand', haze, 0.35);
    p.fillRect(x + slope, h - tall, w, 1.2);
    p.restore();
  }
  function cactus(p, random, x, ground, haze) {
    var tall = 14 + random() * 16, arm = tall * 0.45;
    p.strokeStyle = stuff('cactus', haze);
    p.lineWidth = 3;
    p.beginPath();
    segment(p, x, ground, x, ground - tall);
    p.stroke();
    p.lineWidth = 2;
    p.beginPath();
    p.moveTo(x, ground - arm);
    p.lineTo(x - 4, ground - arm);
    p.lineTo(x - 4, ground - arm - 7);
    p.stroke();
    if (random() < 0.6) {
      p.beginPath();
      p.moveTo(x, ground - arm - 3);
      p.lineTo(x + 4, ground - arm - 3);
      p.lineTo(x + 4, ground - arm - 11);
      p.stroke();
    }
    p.strokeStyle = stuff('treeDark', haze, 0.5);
    p.lineWidth = 0.8;
    p.beginPath();
    segment(p, x + 0.8, ground, x + 0.8, ground + 0.5 - tall);
    p.stroke();
  }
  function headland(p, random, x, h, haze) {
    var w = 60 + random() * 60, tall = h * (0.35 + 0.4 * random());
    p.beginPath();
    p.moveTo(x, h);
    p.lineTo(x + 6, h - tall * 0.7);
    p.lineTo(x + 14, h - tall);
    p.lineTo(x + w - 8, h - tall * 0.97);
    p.lineTo(x + w - 3, h - tall * 0.5);
    p.lineTo(x + w, h);
    p.closePath();
    var face = p.createLinearGradient(x, 0, x + w, 0);
    face.addColorStop(0, stuff('cliff', haze - 0.05));
    face.addColorStop(0.8, stuff('cliff', haze));
    face.addColorStop(1, stuff('cliffDark', haze));
    p.fillStyle = face;
    p.fill();
    p.save();
    p.clip();
    p.fillStyle = vertical(p, h - tall, h, [[0, stuff('cliffDark', haze, 0.1)], [1, stuff('cliffDark', haze, 0.45)]]);
    for (var gx = x + 8; gx < x + w - 4; gx += 3 + random() * 6) {
      p.fillRect(gx, h - tall + 2, 0.7 + random(), tall);
    }
    p.restore();
    p.strokeStyle = stuff('grass', haze);
    p.lineWidth = 2;
    p.beginPath();
    segment(p, x + 13, h - tall + 0.8, x + w - 8, h - tall * 0.97 + 0.8);
    p.stroke();
    rect(p, x - 3, h - 1.5, w + 6, 1.5, stuff('foam', haze, 0.8));
  }
  function lighthouse(p, x, h, haze) {
    p.beginPath();
    p.moveTo(x - 18, h);
    p.quadraticCurveTo(x + 7, h - 14, x + 32, h);
    p.closePath();
    p.fillStyle = stuff('cliff', haze);
    p.fill();
    p.save();
    p.beginPath();
    p.moveTo(x + 2, h - 8);
    p.lineTo(x + 4, h - 46);
    p.lineTo(x + 10, h - 46);
    p.lineTo(x + 12, h - 8);
    p.closePath();
    p.clip();
    for (var y = 0; y < 40; y += 6) {
      rect(p, x, h - 8 - y - 6, 14, 6, (y / 6) % 2 ? '#e8e8e8' : '#c83838');
    }
    rect(p, x + 7, h - 48, 6, 40, 'rgba(0, 0, 0, 0.18)');
    p.restore();
    rect(p, x + 2.5, h - 48, 9, 1.5, stuff('cityDark', 0));
    rect(p, x + 4, h - 53, 6, 5, light.night > 0.35 ? '#fff4b0' : stuff('window', 0.1));
    triangle(p, x + 3.5, h - 53, x + 7, h - 57, x + 10.5, h - 53);
    p.fillStyle = stuff('cityDark', 0);
    p.fill();
  }
  // Returns how wide it was, to step past it.
  function glassDome(p, random, x, h, haze) {
    var dw = 16 + random() * 22, dh = dw * (0.45 + 0.25 * random());
    p.fillStyle = vertical(p, h - dh, h, [[0, stuff('glass', haze - 0.05)], [1, stuff('glassDark', haze)]]);
    p.beginPath();
    p.ellipse(x + dw, h, dw, dh, 0, Math.PI, 0);
    p.fill();
    p.strokeStyle = stuff('steelPale', haze, 0.6);
    p.lineWidth = 0.3;
    p.beginPath();
    for (var rib = -2; rib <= 2; rib += 1) {
      p.ellipse(x + dw, h, Math.abs(rib) * dw / 3 + 0.01, dh, 0, Math.PI, 0);
    }
    segment(p, x + dw * 0.25, h - dh * 0.66, x + dw * 1.75, h - dh * 0.66);
    p.stroke();
    rect(p, x, h - 1.2, dw * 2, 1.2, neon(Math.floor(random() * 3), 0.7, haze));
    return dw;
  }
  function archedHall(p, random, x, h, haze) {
    var hw = 30 + random() * 30, hh = 10 + random() * 8;
    rect(p, x, h - hh, hw, hh, vertical(p, h - hh, h, [[0, stuff('steelPale', haze)], [1, stuff('steel', haze)]]));
    p.fillStyle = stuff('steelPale', haze - 0.05);
    p.beginPath();
    p.ellipse(x + hw / 2, h - hh, hw / 2, hh * 0.45, 0, Math.PI, 0);
    p.fill();
    rect(p, x + 2, h - hh * 0.6, hw - 4, 2, stuff('glassDark', haze));
    rect(p, x + 2, h - hh * 0.6 + 2, hw - 4, 0.6, neon(0, 0.8, haze));
    return hw;
  }
  function windTurbine(p, random, x, h, haze) {
    var tall = h * (0.55 + 0.35 * random()), turn = random() * 6.28;
    p.strokeStyle = stuff('steelPale', haze);
    p.lineWidth = 0.9;
    p.beginPath();
    segment(p, x, h, x, h - tall);
    p.stroke();
    p.lineWidth = 0.6;
    p.beginPath();
    for (var b = 0; b < 3; b += 1) {
      var a = turn + b * 2.094;
      segment(p, x, h - tall, x + Math.cos(a) * tall * 0.4, h - tall + Math.sin(a) * tall * 0.4);
    }
    p.stroke();
    circle(p, x, h - tall, 1, stuff('steel', haze));
  }
  var HOUSE_PAINTS = ['cream', 'teal', 'salmon', 'mustard', 'white'];
  function suburbanHouse(p, random, x, foot, deep, mist) {
    var w = deep * (1.4 + random() * 0.8), wall = deep * 0.38, roof = deep * 0.24;
    var paint = HOUSE_PAINTS[Math.floor(random() * HOUSE_PAINTS.length)];
    rect(p, x, foot - wall, w, wall, stuff(paint, mist));
    p.fillStyle = stuff(random() < 0.5 ? 'roof' : 'cityDark', mist);
    triangle(p, x - deep * 0.08, foot - wall, x + w * 0.5, foot - wall - roof, x + w + deep * 0.08, foot - wall);
    p.fill();
    if (deep > 4) {
      var lit = light.night > 0.25 + random() * 0.3;
      rect(p, x + w * 0.2, foot - wall * 0.7, w * 0.22, wall * 0.4, lit ? '#f8d888' : stuff('window', mist));
    }
    return w;
  }
  function saucerOnStilts(p, random, x, h, haze) {
    var sw = 24 + random() * 10, deck = h - 16 - random() * 8;
    p.strokeStyle = stuff('steelPale', haze);
    p.lineWidth = 1;
    p.beginPath();
    segment(p, x + sw * 0.3, h, x + sw * 0.45, deck);
    segment(p, x + sw * 0.7, h, x + sw * 0.55, deck);
    p.stroke();
    p.fillStyle = vertical(p, deck - 5, deck + 2, [[0, stuff('glass', haze)], [1, stuff('glassDark', haze)]]);
    p.beginPath();
    p.ellipse(x + sw / 2, deck - 1, sw * 0.28, 5, 0, Math.PI, 0);
    p.fill();
    ellipse(p, x + sw / 2, deck, sw / 2, 2.2, vertical(p, deck - 1.5, deck + 2.5, [[0, stuff('cream', haze)], [1, stuff('teal', haze)]]));
    var lamp = light.night > 0.3 ? '#fff0b8' : stuff('window', haze);
    for (var n = 0; n < 6; n += 1) {
      circle(p, x + sw * (0.12 + n * 0.15), deck + 0.4, 0.4, lamp);
    }
    return sw;
  }
  var BOOMERANG_PAINTS = ['salmon', 'teal', 'mustard'];
  function boomerangRoof(p, random, x, h, haze) {
    var bw = 30 + random() * 16, bh = 8 + random() * 4, paint = BOOMERANG_PAINTS[Math.floor(random() * 3)];
    rect(p, x + 2, h - bh, bw - 4, bh, vertical(p, h - bh, h, [[0, stuff('glass', haze)], [1, stuff('glassDark', haze)]]));
    if (light.night > 0.3) {
      rect(p, x + 3, h - bh + 1.5, bw - 6, bh - 3, 'rgba(255, 226, 160, 0.55)');
    }
    p.fillStyle = stuff(paint, haze);
    p.beginPath();
    p.moveTo(x - 4, h - bh - 4);
    p.lineTo(x + bw * 0.55, h - bh + 0.5);
    p.lineTo(x + bw + 4, h - bh - 6);
    p.lineTo(x + bw + 4, h - bh - 4.6);
    p.lineTo(x + bw * 0.55, h - bh + 2);
    p.lineTo(x - 4, h - bh - 2.6);
    p.closePath();
    p.fill();
    return bw;
  }
  function needleTower(p, random, x, h, haze) {
    var nt = h * (0.65 + 0.25 * random());
    p.fillStyle = vertical(p, h - nt, h, [[0, stuff('cream', haze)], [1, stuff('steel', haze)]]);
    p.beginPath();
    p.moveTo(x - 2.4, h);
    p.lineTo(x - 0.8, h - nt);
    p.lineTo(x + 0.8, h - nt);
    p.lineTo(x + 2.4, h);
    p.closePath();
    p.fill();
    ellipse(p, x, h - nt * 0.82, 7, 1.8, stuff('teal', haze));
    rect(p, x - 5, h - nt * 0.82 - 2.6, 10, 1.6, light.night > 0.3 ? '#ffe6a8' : stuff('glassDark', haze));
    circle(p, x, h - nt - 1.6, 1.8, stuff('salmon', haze));
  }
  function atomOnPole(p, random, x, h, haze) {
    var ay = h - 30 - random() * 12, glowing = light.night > 0.3;
    rect(p, x - 0.4, ay, 0.8, h - ay, stuff('steel', haze));
    p.strokeStyle = glowing ? '#7ef0ff' : stuff('steelPale', haze);
    p.lineWidth = 0.6;
    p.beginPath();
    [0, 1.05, 2.1].forEach(function (a) { p.ellipse(x, ay - 6, 6, 2.2, a, 0, 6.2832); });
    p.stroke();
    circle(p, x, ay - 6, 1.3, glowing ? '#ff8a6a' : stuff('salmon', haze));
  }
  // A chrome diner with its starburst sign on a pole beyond it. Returns the room it takes.
  function diner(p, random, x, h, haze) {
    var dw = 44 + random() * 10, dh = 12, lit = light.night > 0.25;
    var shell = new Path2D();
    shell.moveTo(x + 5, h - dh);
    shell.lineTo(x + dw - 5, h - dh);
    shell.quadraticCurveTo(x + dw, h - dh, x + dw, h - dh + 5);
    shell.lineTo(x + dw, h);
    shell.lineTo(x, h);
    shell.lineTo(x, h - dh + 5);
    shell.quadraticCurveTo(x, h - dh, x + 5, h - dh);
    shell.closePath();
    p.fillStyle = vertical(p, h - dh, h, [[0, stuff('steelPale', haze)], [0.5, stuff('cream', haze)], [1, stuff('steel', haze)]]);
    p.fill(shell);
    rect(p, x + 3, h - dh + 3, dw - 6, 4, lit ? '#ffe2a0' : stuff('glassDark', haze));
    rect(p, x, h - 3.4, dw, 1.2, stuff('salmon', haze));
    rect(p, x, h - dh + 1.4, dw, 0.6, stuff('teal', haze));
    dinerSign(p, x + dw + 8, h - 46, h, haze);
    return dw + 20;
  }
  function dinerSign(p, sx, sy, h, haze) {
    var on = 0.35 + 0.65 * Math.min(1, light.night * 1.6);
    rect(p, sx - 0.6, sy, 1.2, h - sy, stuff('steel', haze));
    p.strokeStyle = css(blend(tone('mustard', haze), [255, 214, 90], on));
    p.lineWidth = 0.6;
    p.beginPath();
    for (var ray = 0; ray < 12; ray += 1) {
      var a = ray * 0.5236, reach = ray % 2 ? 4 : 6;
      segment(p, sx + Math.cos(a) * 1.5, sy - 4 + Math.sin(a) * 1.5, sx + Math.cos(a) * reach, sy - 4 + Math.sin(a) * reach);
    }
    p.stroke();
    rect(p, sx - 9, sy + 4, 18, 7, stuff('teal', haze));
    rect(p, sx - 8, sy + 5, 16, 5, '#1a2028');
    // Its letters, as blocks of light.
    for (var bulb = 0; bulb < 6; bulb += 1) {
      rect(p, sx - 7 + bulb * 2.6, sy + 6.6, 1.6, 1.8, css(blend([150, 130, 120], [255, 90, 120], on)));
    }
    // An arrow pointing in.
    p.fillStyle = css(blend(tone('salmon', haze), [255, 120, 90], on));
    p.beginPath();
    p.moveTo(sx - 9, sy + 14);
    p.lineTo(sx + 6, sy + 14);
    p.lineTo(sx + 6, sy + 12);
    p.lineTo(sx + 11, sy + 15.5);
    p.lineTo(sx + 6, sy + 19);
    p.lineTo(sx + 6, sy + 17);
    p.lineTo(sx - 9, sy + 17);
    p.closePath();
    p.fill();
  }
  function rocket(p, random, x, h, haze) {
    var rh = 30 + random() * 10;
    rect(p, x - 5, h - 4, 10, 4, stuff('cream', haze));
    p.fillStyle = vertical(p, h - 4 - rh, h - 4, [[0, stuff('steelPale', haze)], [1, stuff('steel', haze)]]);
    p.beginPath();
    p.moveTo(x, h - 4 - rh);
    p.quadraticCurveTo(x + 4, h - 4 - rh * 0.7, x + 3.4, h - 10);
    p.lineTo(x - 3.4, h - 10);
    p.quadraticCurveTo(x - 4, h - 4 - rh * 0.7, x, h - 4 - rh);
    p.fill();
    p.fillStyle = stuff('salmon', haze);
    [-1, 1].forEach(function (side) {
      triangle(p, x + side * 3.2, h - 16, x + side * 7, h - 5, x + side * 2.4, h - 9);
      p.fill();
    });
    circle(p, x, h - 4 - rh * 0.62, 1.3, stuff('glassDark', haze));
  }
  function tankTraps(p, x, h, haze) {
    p.strokeStyle = stuff('rustDark', haze);
    p.lineWidth = 1;
    p.beginPath();
    for (var t = 0; t < 3; t += 1) {
      var tx = x + t * 9;
      segment(p, tx - 3, h, tx + 3, h - 6);
      segment(p, tx + 3, h, tx - 3, h - 6);
      segment(p, tx, h, tx, h - 6.5);
    }
    p.stroke();
  }
  var CONTAINER_PAINTS = [[150, 74, 40], [52, 92, 120], [120, 110, 60], [110, 50, 48]];
  // Rusted shipping containers, now and then one on another.
  function containers(p, random, x, h, haze) {
    var stack = random() < 0.35 ? 2 : 1, cw = 30, ch = 12;
    var dusty = [200, 180, 160];
    for (var c = 0; c < stack; c += 1) {
      var cy = h - ch * (c + 1), paint = CONTAINER_PAINTS[Math.floor(random() * 4)], cx = x + c * (random() * 6 - 3);
      var top = css(blend(paint, dusty, haze * 0.5)), foot = css(blend(blend(paint, [0, 0, 0], 0.3), dusty, haze * 0.5));
      rect(p, cx, cy, cw, ch, vertical(p, cy, cy + ch, [[0, top], [1, foot]]));
      p.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (var rib = cx + 1.5; rib < cx + cw - 1; rib += 1.8) {
        p.fillRect(rib, cy + 0.6, 0.5, ch - 1.2);
      }
      rect(p, cx, cy, cw, 0.6, 'rgba(255, 255, 255, 0.12)');
      ellipse(p, cx + random() * cw, cy + ch * 0.7, 3 + random() * 4, 1.6, 'rgba(70, 30, 12, 0.35)');
    }
  }
  var STALL_NEON = [[255, 70, 180], [70, 230, 255], [255, 210, 70]];
  // A shack under an awning, its neon sign on the roof. Returns its width.
  function stall(p, random, x, h, haze) {
    var sw = 18 + random() * 6, shh = 11, which = Math.floor(random() * 3), lit = light.night > 0.2 + random() * 0.2;
    rect(p, x, h - shh, sw, shh, vertical(p, h - shh, h, [[0, stuff('rust', haze)], [1, stuff('rustDark', haze)]]));
    rect(p, x + 3, h - shh + 4, sw - 6, 4, lit ? '#f8c878' : stuff('glassDark', haze));
    p.fillStyle = stuff('ash', haze);
    p.beginPath();
    p.moveTo(x - 3, h - shh + 3);
    p.lineTo(x + sw + 3, h - shh + 3);
    p.lineTo(x + sw, h - shh);
    p.lineTo(x, h - shh);
    p.closePath();
    p.fill();
    var sign = css(blend([120, 110, 120], STALL_NEON[which], 0.35 + 0.65 * Math.min(1, light.night * 1.6)));
    rect(p, x + 2, h - shh - 7, sw - 4, 6, '#16121c');
    p.strokeStyle = sign;
    p.lineWidth = 0.6;
    p.strokeRect(x + 2.6, h - shh - 6.4, sw - 5.2, 4.8);
    for (var g = 0; g < 3; g += 1) {
      rect(p, x + 4 + g * (sw - 8) / 3, h - shh - 4.6, (sw - 8) / 4, 1.4, sign);
    }
    return sw;
  }
  function saggingFence(p, x, h, haze) {
    p.strokeStyle = stuff('ash', haze);
    p.lineWidth = 0.6;
    p.beginPath();
    for (var post = 0; post < 50; post += 12) {
      segment(p, x + post, h, x + post, h - 10);
    }
    p.stroke();
    p.strokeStyle = stuff('ash', haze, 0.3);
    p.lineWidth = 0.25;
    p.beginPath();
    for (var m = 0; m < 48; m += 1.6) {
      segment(p, x + m, h - 9.5, x + m + 3, h - 0.5);
      segment(p, x + m + 3, h - 9.5, x + m, h - 0.5);
    }
    p.stroke();
  }
  // A crack across a row, kept within it.
  function crack(p, random, row, deep) {
    var y0 = row[0];
    var cy = y0 + deep * (0.2 + 0.6 * random()), cx = random() * TILE;
    p.beginPath();
    p.moveTo(cx, cy);
    for (var seg = 0; seg < 4; seg += 1) {
      cx += 3 + random() * 8;
      cy = Math.max(y0 + 0.3, Math.min(row[1] - 0.3, cy + (random() - 0.5) * deep * 0.3));
      p.lineTo(cx, cy);
    }
    p.stroke();
  }
  function burntShell(p, random, x, h, haze) {
    var w = 20 + random() * 22, tall = h * (0.35 + 0.45 * random());
    var shell = new Path2D();
    shell.moveTo(x, h);
    shell.lineTo(x, h - tall * (0.7 + 0.3 * random()));
    for (var sx = x + 2 + random() * 3; sx < x + w; sx += 2 + random() * 4) {
      shell.lineTo(sx, h - tall * (0.55 + 0.45 * random()));
    }
    shell.lineTo(x + w, h - tall * (0.4 + 0.4 * random()));
    shell.lineTo(x + w, h);
    shell.closePath();
    p.fillStyle = vertical(p, h - tall, h, [[0, stuff('concrete', haze)], [1, stuff('concreteDark', haze)]]);
    p.fill(shell);
    p.save();
    p.clip(shell);
    for (var wy = h - tall + 3; wy < h - 3; wy += 5) {
      for (var wx = x + 2; wx < x + w - 3; wx += 4) {
        rect(p, wx, wy, 2, 2.6, stuff('scorch', haze));
        if (random() < 0.3) {
          rect(p, wx - 0.3, wy - 3, 2.6, 3, vertical(p, wy - 3, wy, [[0, stuff('scorch', haze, 0)], [1, stuff('scorch', haze, 0.6)]]));
        }
      }
    }
    rect(p, x + w - 3, h - tall, 3, tall, stuff('scorch', haze, 0.35));
    p.restore();
    p.strokeStyle = stuff('rustDark', haze);
    p.lineWidth = 0.3;
    p.beginPath();
    for (var b = 0; b < 3; b += 1) {
      var bx = x + 2 + random() * (w - 4), top = h - tall * 0.5;
      segment(p, bx, top, bx + (random() - 0.5) * 3, top - 3 - random() * 4);
    }
    p.stroke();
  }
  function fallenPylon(p, random, x, h, haze) {
    var lean = (random() - 0.5) * 0.5, pt = h * (0.6 + 0.3 * random());
    p.save();
    p.translate(x, h);
    p.rotate(lean);
    p.strokeStyle = stuff('ash', haze);
    p.lineWidth = 0.5;
    p.beginPath();
    segment(p, -5, 0, -1, -pt);
    segment(p, 5, 0, 1, -pt);
    for (var t = 0; t < pt; t += 5) {
      var w0 = 5 - 4 * t / pt, w1 = 5 - 4 * (t + 5) / pt;
      segment(p, -w0, -t, w1, -t - 5);
      segment(p, w0, -t, -w1, -t - 5);
    }
    segment(p, -7, -pt * 0.85, 7, -pt * 0.85);
    p.stroke();
    p.restore();
  }
  function deadTree(p, random, x, h, haze) {
    p.strokeStyle = stuff('scorch', haze);
    p.lineCap = 'round';
    var dt = 14 + random() * 14;
    p.lineWidth = 1.4;
    p.beginPath();
    segment(p, x, h, x + 1, h - dt);
    p.stroke();
    p.lineWidth = 0.6;
    p.beginPath();
    for (var br = 0; br < 5; br += 1) {
      var by = h - dt * (0.4 + 0.6 * random()), side = random() < 0.5 ? -1 : 1;
      segment(p, x + 0.5, by, x + side * (3 + random() * 5), by - 3 - random() * 5);
    }
    p.stroke();
    p.lineCap = 'butt';
  }
  // On its rims, tilted a little.
  function rustedHulk(p, random, x, h, haze) {
    var w = 30 + random() * 10, tall = 9 + random() * 3;
    var hulk = new Path2D();
    hulk.moveTo(x, h - 1.5);
    hulk.lineTo(x + 0.8, h - 6.5);
    hulk.lineTo(x + w * 0.25, h - 7.5);
    hulk.lineTo(x + w * 0.36, h - tall);
    hulk.lineTo(x + w * 0.64, h - tall);
    hulk.lineTo(x + w * 0.76, h - 7.5);
    hulk.lineTo(x + w, h - 6);
    hulk.lineTo(x + w, h - 1.5);
    hulk.closePath();
    p.save();
    p.translate(x + w / 2, h);
    p.rotate((random() - 0.5) * 0.12);
    p.translate(-x - w / 2, -h);
    p.fillStyle = vertical(p, h - tall, h, [[0, stuff('rust', haze)], [1, stuff('rustDark', haze)]]);
    p.fill(hulk);
    p.save();
    p.clip(hulk);
    for (var spot = 0; spot < 5; spot += 1) {
      var patch = stuff(random() < 0.5 ? 'scorch' : 'rustDark', haze, 0.5);
      var px = x + random() * w, py = h - random() * tall;
      ellipse(p, px, py, 2 + random() * 3, 1 + random() * 1.5, patch);
    }
    p.restore();
    rect(p, x + w * 0.38, h - tall + 1, w * 0.1, 2.6, stuff('scorch', haze));
    rect(p, x + w * 0.51, h - tall + 1, w * 0.1, 2.6, stuff('scorch', haze));
    [0.2, 0.78].forEach(function (at) {
      p.fillStyle = stuff('scorch', haze);
      p.beginPath();
      p.arc(x + w * at, h - 1.5, 3.2, Math.PI, 0);
      p.fill();
    });
    p.restore();
  }
  function tyrePile(p, high, x, h, haze) {
    for (var row = 0; row < high; row += 1) {
      for (var c = 0; c < high - row; c += 1) {
        var tx = x + c * 6.2 + row * 3.1, ty = h - 2 - row * 3.6;
        ellipse(p, tx, ty, 3.2, 2, stuff('scorch', haze));
        p.strokeStyle = stuff('ash', haze);
        p.lineWidth = 0.4;
        p.beginPath();
        p.ellipse(tx, ty, 1.6, 1, 0, 0, 6.2832);
        p.stroke();
      }
    }
  }
  function drums(p, random, x, h, haze) {
    for (var d = 0, many = 2 + Math.floor(random() * 3); d < many; d += 1) {
      var dx = x + d * 5.4;
      if (random() < 0.25) {
        ellipse(p, dx + 3, h - 2.4, 4, 2.4, stuff('rust', haze));
        continue;
      }
      rect(p, dx, h - 7, 4.4, 7, stuff('rust', haze));
      rect(p, dx + 3, h - 7, 1.4, 7, stuff('rustDark', haze));
      rect(p, dx, h - 5, 4.4, 0.5, stuff('rustDark', haze));
      rect(p, dx, h - 2.6, 4.4, 0.5, stuff('rustDark', haze));
    }
  }
  // Leaning posts with gaps, and barbed wire sagging between those still standing.
  function brokenFence(p, posts, h, haze) {
    p.strokeStyle = stuff('scorch', haze);
    p.lineWidth = 1.1;
    posts.forEach(function (post) {
      if (!post || !kept(post.x)) {
        return;
      }
      p.beginPath();
      segment(p, post.x, h - 3, post.x + Math.sin(post.lean) * post.tall, h - 3 - post.tall);
      p.stroke();
    });
    p.lineWidth = 0.3;
    p.strokeStyle = stuff('ash', haze);
    for (var i = 1; i < posts.length; i += 1) {
      var a = posts[i - 1], b = posts[i];
      if (!a || !b || !kept(b.x)) {
        continue;
      }
      barbedWire(p, a, b, h, 0.45);
      barbedWire(p, a, b, h, 0.8);
    }
  }
  function barbedWire(p, a, b, h, up) {
    var ax = a.x + Math.sin(a.lean) * a.tall * up, ay = h - 3 - a.tall * up;
    var bx = b.x + Math.sin(b.lean) * b.tall * up, by = h - 3 - b.tall * up;
    p.beginPath();
    p.moveTo(ax, ay);
    p.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 1.6, bx, by);
    p.stroke();
    for (var along = 0.25; along < 1; along += 0.25) {
      var kx = ax + (bx - ax) * along, ky = ay + (by - ay) * along + 1.2 * along * (1 - along) * 2;
      p.beginPath();
      segment(p, kx - 0.5, ky - 0.5, kx + 0.5, ky + 0.5);
      p.stroke();
    }
  }
  function lavaFall(p, random, x, top, h, B) {
    rect(p, x + 1, h - top + 2, B - 2, top - 2, vertical(p, h - top, h, [[0, 'rgba(255, 210, 90, 0.95)'], [1, 'rgba(255, 110, 20, 0.95)']]));
    for (var d = h - top + 4; d < h; d += 5) {
      rect(p, x + 1.5 + random() * (B - 4), d, 1, 2, 'rgba(255, 250, 200, 0.8)');
    }
  }
