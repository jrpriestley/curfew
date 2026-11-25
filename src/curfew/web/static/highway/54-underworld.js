  // ---------------------------------------------------------- the underworld --
  // A red sky glowing orange low down, eased in and out as the underworld comes and goes
  // (`hell`); embers rising off the lava; mine carts on a trestle; pale spirits drifting
  // high over it now and then.
  var hell = 0;
  function drawHellSky(seconds) {
    var want = biomeAt(odometer + cols * 0.5, 1) === 'underworld' ? 1 : 0;
    hell += (want - hell) * Math.min(1, seconds * 0.25);
    if (hell < 0.01) {
      return;
    }
    var low = RT - 66;
    rect(ctx, 0, 0, cols, low + 4, vertical(ctx, 0, low + 4, [[0, css([30, 4, 8], 0.97 * hell)], [0.6, css([120, 20, 14], 0.92 * hell)], [1, css([255, 110, 40], 0.8 * hell)]]));
  }
  function drawEmbers(time) {
    if (hell < 0.01) {
      return;
    }
    var t = time / 1000;
    for (var i = 0; i < (sharp ? 40 : 18); i += 1) {
      var r = seeded(i * 7919 + 131), rise = 8 + r() * 14;
      var x = ((r() * 900 - odometer * 0.1 + Math.sin(t * 0.7 + i) * 6) % cols + cols) % cols;
      var y = RT - ((t * rise + r() * 130) % 130), fade = Math.min(1, (y - (RT - 130)) / 30);
      rect(ctx, x, y, 0.7, 0.7, css([255, 150 + 80 * r(), 60], 0.8 * hell * fade));
    }
  }
  // The trestle runs in stretches with gaps between, at the near layer's rate. Toward each
  // end of a stretch it slopes down out of sight behind the road (eased over CART_RAMP),
  // so it never stops in the air.
  var CART_RAMP = 110;
  function cartTrack() {
    return RT - 26;
  }
  function cartsRunAt(at, rate) {
    return biomeAt(at, rate) === 'underworld' && Math.floor(at / 400) % 3 !== 2;
  }
  // The trestle's height at `at`. The gaps' ends are found from their pattern; the
  // underworld's own ends are found in steps then narrowed, so the slope is smooth and the
  // carts ride it evenly.
  function trestleHeight(at, rate) {
    var pos = ((at % 1200) + 1200) % 1200, edge = Math.min(CART_RAMP, pos, 800 - pos);
    [-1, 1].forEach(function (way) {
      for (var d = 10; d < edge; d += 10) {
        if (biomeAt(at + way * d, rate) === 'underworld') {
          continue;
        }
        var lo = d - 10, hi = d;
        for (var n = 0; n < 5; n += 1) {
          var mid = (lo + hi) / 2;
          if (biomeAt(at + way * mid, rate) === 'underworld') {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        edge = Math.min(edge, lo);
        break;
      }
    });
    var f = 1 - Math.max(0, edge) / CART_RAMP;
    return cartTrack() + f * f * 34;
  }
  function drawCarts(time) {
    var rate = 0.25, layer = odometer * rate, t = time / 1000, dim = light.night * 0.5;
    var wood = css(blend(STUFF.brickDark, [8, 4, 6], dim)), iron = css(blend([112, 112, 120], [30, 30, 36], dim));
    var deck = function (at) { return trestleHeight(at, rate); };
    var bays = drawTrestle(layer, rate, wood, deck);
    bays.forEach(function (bay) { drawTrack(bay, layer, wood, iron, deck); });
    for (var c = 0; c < 6; c += 1) {
      var r = seeded(c * 7919 + 151), pace = 14 + r() * 20, loop = cols + 400;
      var cx = ((r() * loop + t * pace) % loop) - 40, cat = cx + layer;
      if (!cartsRunAt(cat, rate) || !cartsRunAt(cat + 10, rate)) {
        continue;
      }
      var kind = r(), back = deck(cat), front = deck(cat + 10), y = (back + front) / 2 - 0.6;
      // Gone down out of sight.
      if (y - 13 > RT) {
        continue;
      }
      ctx.save();
      ctx.translate(cx + 5, y);
      ctx.rotate(Math.atan2(front - back, 10));
      ctx.translate(-cx - 5, -y);
      mineCart(cx, y, kind, iron, dim);
      ctx.restore();
    }
  }
  // Legs and a brace in each bay; returns the bays, [x, height at its left, at its right].
  function drawTrestle(layer, rate, wood, deck) {
    ctx.strokeStyle = wood;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    var bays = [];
    for (var m = Math.floor((layer - 20) / 20); m <= Math.floor((layer + cols + 20) / 20); m += 1) {
      var at = m * 20, x = at - layer;
      if (!cartsRunAt(at, rate)) {
        continue;
      }
      var y0 = deck(at), y1 = deck(at + 20);
      if (y0 < RT) {
        ctx.moveTo(x + 1, y0 + 1.6);
        ctx.lineTo(x + 1, RT);
      }
      if (y0 + 12 < RT) {
        ctx.moveTo(x + 1, y0 + 1.6);
        ctx.lineTo(x + 19, Math.min(RT, y1 + 12));
      }
      bays.push([x, y0, y1]);
    }
    ctx.stroke();
    return bays;
  }
  // A bay's deck and rail: one piece where level, in fine steps along the curve where sloping.
  function drawTrack(bay, layer, wood, iron, deck) {
    var steps = bay[1] === bay[2] && bay[1] === cartTrack() ? 1 : 5, ys = [];
    for (var i = 0; i <= steps; i += 1) {
      ys.push(i === 0 ? bay[1] : i === steps ? bay[2] : deck(bay[0] + layer + 20 * i / steps));
    }
    [[wood, 0, 1.6], [iron, -0.6, -0.1]].forEach(function (band) {
      ctx.fillStyle = band[0];
      ctx.beginPath();
      for (i = 0; i <= steps; i += 1) {
        ctx[i ? 'lineTo' : 'moveTo'](bay[0] + 20.3 * i / steps, ys[i] + band[1]);
      }
      for (i = steps; i >= 0; i -= 1) {
        ctx.lineTo(bay[0] + 20.3 * i / steps, ys[i] + band[2]);
      }
      ctx.fill();
    });
  }
  var ORE = [[1.5, '#5a5a62'], [4, '#c8a040'], [6.5, '#5a5a62']];
  // An iron tub on small wheels: some heaped with ore, some carrying a miner with a lamp.
  function mineCart(cx, y, kind, iron, dim) {
    rect(ctx, cx, y - 5, 10, 5, iron);
    rect(ctx, cx, y - 5, 10, 0.8, css(blend([150, 150, 160], [40, 40, 46], dim)));
    rect(ctx, cx + 1, y - 3.6, 8, 0.4, 'rgba(0, 0, 0, 0.3)');
    [2.4, 7.6].forEach(function (wx) { circle(ctx, cx + wx, y, 1.1, '#1c1a1e'); });
    if (kind < 0.35) {
      ORE.forEach(function (o) { rect(ctx, cx + o[0], y - 7, 2.4, 2.4, o[1]); });
    } else if (kind < 0.75) {
      rect(ctx, cx + 3, y - 8, 4, 3, css(blend([60, 64, 80], [14, 14, 20], dim)));
      rect(ctx, cx + 3.4, y - 11.4, 3.2, 3.2, css(blend([206, 160, 120], [60, 44, 36], dim)));
      rect(ctx, cx + 3.2, y - 12.4, 3.6, 1.2, '#d8a820');
      rect(ctx, cx + 6.4, y - 12.2, 0.8, 0.8, '#fff4c0');
      if (light.night > 0.2 || hell > 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        glow(cx + 7.4, y - 11.8, 4, [255, 240, 180], 0.5);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  // Spirits drift in from the right now and then and right across, off the left; none comes
  // once we've left the underworld.
  var spirits = [], spiritDue = 4, SPIRITS = 3, SPIRIT_EDGE = 30;
  function drawSpirits(time, seconds) {
    var here = biomeAt(odometer + cols * 0.5, 1) === 'underworld', t = time / 1000;
    if (here && (spiritDue -= seconds) <= 0 && spirits.length < SPIRITS) {
      spirits.push(newSpirit());
      spiritDue = 10 + 20 * Math.random();
    }
    spirits = spirits.filter(function (ghost) {
      ghost.x -= ghost.speed * seconds;
      var y = ghost.y + Math.sin(t * 0.6 + ghost.sway) * 4;
      spirit(ghost.x, y, ghost.size, 0.75 + 0.25 * Math.sin(t * 1.7 + ghost.sway), t);
      return ghost.x > -SPIRIT_EDGE;
    });
  }
  // SPIRIT_EDGE is past the widest one's glow, so none comes or goes in sight.
  function newSpirit() {
    return {
      x: cols + SPIRIT_EDGE, y: 26 + 50 * Math.random(), size: 7 + 6 * Math.random(),
      speed: 13 + 6 * Math.random(), sway: 6.2832 * Math.random(),
    };
  }
  function spirit(x, y, size, pulse, t) {
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y, size * 2.2, [255, 200, 220], 0.35 * pulse);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css([246, 236, 244], 0.85);
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.75, 0, Math.PI, 0);
    ctx.fill();
    // Its tendrils trailing.
    ctx.strokeStyle = css([240, 220, 236], 0.6);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (var n = 0; n < 5; n += 1) {
      var tx = x - size * 0.8 + n * size * 0.4;
      ctx.moveTo(tx, y);
      for (var d = 1; d <= 4; d += 1) {
        ctx.lineTo(tx + Math.sin(t * 2.4 + n + d) * 1.4, y + d * size * 0.35);
      }
    }
    ctx.stroke();
    // Its heart, a glow within.
    ctx.fillStyle = css([170, 60, 90], 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y - size * 0.3, size * 0.35, size * 0.18, 0, 0, 6.2832);
    ctx.fill();
  }
