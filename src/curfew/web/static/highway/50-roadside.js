  // ------------------------------------------------------------- the roadside --
  // What stands along the far verge, at road positions (the road under the screen's x is
  // x + odometer): each biome's set pieces at fixed shares of its SPAN, a sign where each
  // biome begins, and every SIGN_GAP between them a sign of the house's data. Their
  // outlines (`nearShapes`) are kept for the night's shade and the lights they give
  // (`gives`) for after it.
  var SIGN_GAP = 1500, TUNNEL = 620, BRIDGE = 520;
  var WELCOME = {
    country: 'WELCOME TO THE COUNTRY', city: 'CITY LIMITS', desert: 'ENTERING THE DESERT', coast: 'COAST ROAD',
    underworld: 'THE UNDERWORLD', wasteland: 'THE WASTELAND', future: 'WELCOME TO TOMORROW', badlands: 'THE BADLANDS',
    atomic: 'ATOMIC CITY', warzone: 'CONFLICT ZONE', asteroids: 'ASTEROID FIELD',
  };
  // Where the roadside fires burn, as shares of the span. The atomic city's are after the blast.
  var FIRE_SHARES = {
    wasteland: [0.1, 0.26, 0.4, 0.55, 0.71, 0.88],
    atomic: [0.5, 0.62, 0.76, 0.9],
    warzone: [0.15, 0.4, 0.65, 0.85],
    asteroids: [0.15, 0.4, 0.65, 0.85],
  };
  var nearShapes = [], frontShapes = [], gives = [], tunnels = [], signs = [], fires = [], bridges = [];
  // The pieces between road positions `from` and `to`.
  function pieces(from, to) {
    var out = [];
    for (var n = Math.max(0, Math.floor((from - cols) / SPAN) - 1); n <= Math.floor((to - cols) / SPAN) + 1; n += 1) {
      spanPieces(n, out);
    }
    for (var m = Math.floor(from / SIGN_GAP); m <= Math.floor(to / SIGN_GAP); m += 1) {
      var at = m * SIGN_GAP;
      var clear = !out.some(function (piece) { return at > piece.at - 260 && at < (piece.end || piece.at) + 260; });
      if (clear && m > 0) {
        out.push({kind: m % 2 ? 'now' : 'today', at: at, biome: biomeAt(at, 1)});
      }
    }
    return out.filter(function (piece) { return (piece.end || piece.at + 130) > from && piece.at - 60 < to; });
  }
  function spanPieces(n, out) {
    var base = cols + n * SPAN, biome = spanBiome(n);
    out.push({kind: 'welcome', at: base + 160, biome: biome});
    if (biome === 'country' || biome === 'coast') {
      out.push({kind: 'tunnel', at: base + 0.45 * SPAN, end: base + 0.45 * SPAN + TUNNEL, biome: biome});
    }
    if (biome === 'city') {
      out.push({kind: 'overpass', at: base + 0.3 * SPAN}, {kind: 'overpass', at: base + 0.7 * SPAN});
    }
    if (biome === 'future') {
      out.push({kind: 'tube', at: base + 0.45 * SPAN, end: base + 0.45 * SPAN + TUNNEL, biome: biome});
    }
    if (biome === 'badlands') {
      out.push({kind: 'bridge', at: base + 0.6 * SPAN, end: base + 0.6 * SPAN + BRIDGE, biome: biome});
    }
    if (sharp && (biome === 'country' || biome === 'desert')) {
      out.push({kind: 'station', at: base + 0.78 * SPAN});
    }
    (FIRE_SHARES[biome] || []).forEach(function (share, i) {
      var seed = flow.hash('fire' + n + '|' + i);
      out.push({kind: 'fire', at: base + share * SPAN + seed * 300, wreck: seed < 0.5, seed: seed});
    });
  }
  function todayText() {
    var bytes = 0;
    flow.devices.forEach(function (device) { bytes += device.today || 0; });
    return 'TODAY  ' + (bytes / 1e9).toFixed(1) + ' GB';
  }
  function rateText() {
    var bits = flow.wan.down + flow.wan.up;
    return bits >= 1e6 ? (bits / 1e6).toFixed(1) + ' Mb/s' : Math.round(bits / 1e3) + ' kb/s';
  }
  function keep(x, y, w, h) {
    nearShapes.push([x, y, w, h]);
  }
  // A sign's two lamps on arms over its top. Their light is the sign's own, steady
  // whatever passes.
  function lights(x, wide, top) {
    [0.28, 0.72].forEach(function (at) {
      var lx = x + wide * at;
      rect(ctx, lx - 0.3, top - 3.4, 0.6, 3.4, near('rail'));
      rect(ctx, lx - 2, top - 3.6, 4, 1.2, near('cityDark'));
      keep(lx - 2, top - 3.6, 4, 3.6);
      gives.push({kind: 'sign lamp', x: lx, y: top - 2.4});
    });
  }
  function text(p, words, x, y, size, fill, align) {
    // Scrambled in a glitch, but never in a tile: the tile would keep it.
    if (p === ctx && gl.g > 0) {
      words = scrambled(words);
    }
    p.fillStyle = fill;
    p.textAlign = align || 'center';
    p.font = '700 ' + size + 'px amazon-ember, "Amazon Ember", Inter, sans-serif';
    p.fillText(words, x, y);
    p.textAlign = 'left';
  }
  function clearRoadside() {
    nearShapes = [];
    frontShapes = [];
    gives = [];
    tunnels = [];
    signs = [];
    fires = [];
    bridges = [];
  }
  function drawFar(along) {
    clearRoadside();
    pieces(along - 140, along + cols + 140).forEach(function (piece) {
      var x = piece.at - along;
      if (piece.kind === 'tunnel') {
        drawTunnel(piece, x, along);
      } else if (piece.kind === 'tube') {
        drawTube(piece, x, along);
      } else if (piece.kind === 'bridge') {
        drawBridge(piece, x, along);
      } else if (piece.kind === 'fire') {
        if (piece.wreck) {
          burntCar(x, piece.seed);
        } else {
          drum(x, piece.seed, 5.5);
        }
      } else if (piece.kind === 'overpass') {
        // Its far pier; the deck is drawn over the road (overpasses).
        ctx.fillStyle = vertical(ctx, RT - 36, RT, [[0, near('cityPale')], [1, near('city')]]);
        ctx.fillRect(x + 16, RT - 36, 14, 36);
        keep(x + 16, RT - 36, 14, 36);
      } else if (piece.kind === 'station') {
        drawStation(x);
      } else {
        drawSign(piece, x);
      }
    });
  }
  // A tunnel through a hill (a cliff on the coast): its mouth, its lamps, its portals.
  function drawTunnel(piece, x, along) {
    var x1 = piece.end - along, coast = piece.biome === 'coast', middle = (x + x1) / 2;
    var hill = new Path2D();
    hill.moveTo(x - 60, RT - 2);
    hill.bezierCurveTo(x - 34, RT - 4, x - 20, RT - 64, x + 12, RT - 66);
    hill.bezierCurveTo(middle - 60, RT - 72, middle + 60, RT - 60, x1 - 12, RT - 66);
    hill.bezierCurveTo(x1 + 20, RT - 64, x1 + 34, RT - 4, x1 + 60, RT - 2);
    hill.closePath();
    var ground = coast ? [[0, near('cliff')], [1, near('cliffDark')]] : [[0, near('field')], [0.15, near('grass')], [1, near('grassDark')]];
    ctx.fillStyle = vertical(ctx, RT - 72, RT, ground);
    ctx.fill(hill);
    nearShapes.push(hill);
    ctx.fillStyle = vertical(ctx, RT - 46, RT + 2, [[0, near('rockDark')], [0.3, near('cityDark')], [1, css(blend(tone('cityDark', 0, true), [0, 0, 0], 0.4))]]);
    ctx.fillRect(x, RT - 46, x1 - x, 48);
    keep(x, RT - 46, x1 - x, 48);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (var t = Math.ceil(piece.at / 30) * 30; t < piece.end; t += 30) {
      ctx.moveTo(t - along, RT - 30);
      ctx.lineTo(t - along, RT);
    }
    ctx.stroke();
    for (t = Math.ceil(piece.at / 40) * 40 + 20; t < piece.end - 10; t += 40) {
      rect(ctx, t - along - 2.5, RT - 41, 5, 1.4, '#ffb050');
      gives.push({kind: 'tunnel lamp', x: t - along, y: RT - 40.3});
    }
    [x, x1].forEach(function (face) {
      ctx.fillStyle = vertical(ctx, RT - 50, RT + 2, [[0, near('cityPale')], [1, near('city')]]);
      ctx.fillRect(face - 4, RT - 50, 8, 52);
      keep(face - 4, RT - 50, 8, 52);
    });
    tunnels.push([x, x1]);
  }
  // The future's tunnel: a long shell of steel with a band of glass, dark panels and
  // lines of light within.
  function drawTube(piece, x, along) {
    var end = piece.end - along, shell = new Path2D();
    shell.moveTo(x - 30, RT);
    shell.bezierCurveTo(x - 30, RT - 40, x - 12, RT - 58, x + 18, RT - 58);
    shell.lineTo(end - 18, RT - 58);
    shell.bezierCurveTo(end + 12, RT - 58, end + 30, RT - 40, end + 30, RT);
    shell.closePath();
    ctx.fillStyle = vertical(ctx, RT - 58, RT, [[0, near('steelPale')], [0.45, near('steel')], [1, near('plazaDark')]]);
    ctx.fill(shell);
    nearShapes.push(shell);
    rect(ctx, x - 8, RT - 55, end - x + 16, 3.4, vertical(ctx, RT - 55, RT - 51.6, [[0, near('glass')], [1, near('glassDark')]]));
    rect(ctx, x - 8, RT - 51.6, end - x + 16, 0.5, neon(0, 0.8, 0));
    ctx.fillStyle = vertical(ctx, RT - 46, RT + 2, [[0, '#1e2432'], [1, '#0b0e16']]);
    ctx.fillRect(x, RT - 46, end - x, 48);
    keep(x, RT - 46, end - x, 48);
    for (var rib = Math.ceil(piece.at / 30) * 30; rib < piece.end; rib += 30) {
      rect(ctx, rib - along, RT - 46, 1.2, 48, 'rgba(120, 140, 172, 0.22)');
    }
    rect(ctx, x, RT - 9, end - x, 0.5, neon(1, 0.7, 0));
    for (rib = Math.ceil(piece.at / 40) * 40 + 20; rib < piece.end - 10; rib += 40) {
      rect(ctx, rib - along - 4, RT - 42, 8, 0.9, '#c8f4ff');
      gives.push({kind: 'tunnel lamp', x: rib - along, y: RT - 41.6, tint: [150, 230, 255]});
    }
    [x, end].forEach(function (face) {
      ctx.fillStyle = vertical(ctx, RT - 50, RT + 2, [[0, near('steelPale')], [1, near('steel')]]);
      ctx.fillRect(face - 3, RT - 50, 6, 52);
      keep(face - 3, RT - 50, 6, 52);
      rect(ctx, face - 0.4, RT - 50, 0.8, 52, neon(0, 0.9, 0));
    });
    tunnels.push([x, end]);
  }
  // The badlands' girder bridge over a gorge: the gorge and the girders under the deck,
  // in front of the road, and an arch of girders over it behind.
  function drawBridge(piece, x, along) {
    var far = piece.end - along, rows = flow.height / k, low = RT + 44, gorge = new Path2D();
    gorge.moveTo(x - 30, low);
    gorge.lineTo(far + 30, low);
    gorge.lineTo(far + 6, rows);
    gorge.lineTo(x - 6, rows);
    gorge.closePath();
    ctx.fillStyle = vertical(ctx, low, rows, [[0, near('mesaDark')], [0.35, near('towerDark')], [1, css(blend(tone('towerDark', 0, true), [0, 0, 0], 0.7))]]);
    ctx.fill(gorge);
    // The gorge's far edge, falling away behind the road too.
    rect(ctx, x - 30, RT - 2, far - x + 60, 4, near('towerDark'));
    [x - 24, far + 24].forEach(function (pier) {
      rect(ctx, pier - 3, low, 6, rows - low, vertical(ctx, low, rows, [[0, near('concrete')], [1, near('concreteDark')]]));
    });
    rect(ctx, x - 26, low, far - x + 52, 2.6, near('rustDark'));
    rect(ctx, x - 26, low + 10, far - x + 52, 1.2, near('rust'));
    ctx.strokeStyle = near('rust');
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    var firstGirder = Math.ceil((piece.at - 26) / 14) * 14;
    for (var g = firstGirder; g < piece.end + 26; g += 14) {
      var gx = g - along;
      ctx.moveTo(gx, low + 2.6);
      ctx.lineTo(gx + 7, low + 10);
      ctx.lineTo(gx + 14, low + 2.6);
      ctx.moveTo(gx, low + 2.6);
      ctx.lineTo(gx, low + 10);
    }
    ctx.stroke();
    var arch = function (ax) {
      return RT - 2 - 26 * Math.sin(Math.PI * Math.max(0, Math.min(1, (ax - x + 26) / (far - x + 52)))) - 4;
    };
    var truss = new Path2D();
    truss.moveTo(x - 26, RT - 2);
    for (var tx = x - 26; tx <= far + 26; tx += 4) {
      truss.lineTo(tx, arch(tx));
    }
    // Darkened by hand: it stands above the road's shade.
    ctx.strokeStyle = css(blend(tone('rust', 0, true), [10, 8, 14], darkness() * 0.9));
    ctx.lineWidth = 1.6;
    ctx.stroke(truss);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 26, RT - 3);
    ctx.lineTo(far + 26, RT - 3);
    for (g = firstGirder; g < piece.end + 26; g += 14) {
      var lx = g - along;
      if (lx + 14 > far + 26) {
        break;
      }
      ctx.moveTo(lx, RT - 3);
      ctx.lineTo(lx, arch(lx));
      ctx.moveTo(lx, RT - 3);
      ctx.lineTo(lx + 14, arch(lx + 14));
    }
    ctx.stroke();
    bridges.push([x - 30, far + 30]);
  }
  function drawStation(x) {
    rect(ctx, x - 4, RT - 3, 104, 3, near('pavement'));
    keep(x - 4, RT - 3, 104, 3);
    [8, 52].forEach(function (post) {
      rect(ctx, x + post, RT - 30, 2, 28, near('white'));
      keep(x + post, RT - 30, 2, 28);
    });
    [18, 36].forEach(function (pump) {
      rect(ctx, x + pump, RT - 11, 5, 9, '#c83030');
      rect(ctx, x + pump + 1, RT - 9.5, 3, 2.5, near('window'));
      keep(x + pump, RT - 11, 5, 9);
    });
    ctx.fillStyle = vertical(ctx, RT - 36, RT - 30, [[0, near('white')], [1, near('cityPale')]]);
    ctx.fillRect(x, RT - 36, 62, 6);
    rect(ctx, x, RT - 33.5, 62, 1.6, '#c83030');
    keep(x, RT - 36, 62, 6);
    ctx.fillStyle = vertical(ctx, RT - 22, RT - 2, [[0, near('wall')], [1, near('cliffDark')]]);
    ctx.fillRect(x + 66, RT - 22, 30, 20);
    rect(ctx, x + 64, RT - 24, 34, 2.4, near('roof'));
    rect(ctx, x + 70, RT - 17, 22, 9, near('window'));
    keep(x + 64, RT - 24, 34, 22);
    rect(ctx, x + 105, RT - 52, 1.6, 50, near('rail'));
    rect(ctx, x + 96, RT - 64, 20, 13, '#1a2a4a');
    keep(x + 96, RT - 64, 20, 13);
    keep(x + 105, RT - 52, 1.6, 50);
    text(ctx, 'GAS', x + 106, RT - 55, 7, '#ff5a3a');
    gives.push({kind: 'station', x: x});
  }
  function drawSign(piece, x) {
    var biome = piece.biome;
    var waste = biome === 'wasteland' || biome === 'aftermath' || biome === 'warzone' || biome === 'asteroids';
    var words = piece.kind === 'welcome' ? WELCOME[biome] : piece.kind === 'today' ? todayText() : 'NOW  ' + rateText();
    if (biome === 'future') {
      hologramSign(piece, x, words);
    } else if (biome === 'city' && piece.kind === 'now') {
      billboard(x);
    } else {
      roadSign(piece, x, words, waste);
    }
  }
  // The future's: a panel of light floating over an emitter. It's its own light, never shaded.
  function hologramSign(piece, x, words) {
    var span = Math.max(40, words.length * 3.1 + 8);
    var top = RT - 32 + Math.sin(performance.now() / 900 + piece.at) * 0.5;
    rect(ctx, x + span / 2 - 3, RT - 2.4, 6, 2.4, near('steel'));
    ctx.globalCompositeOperation = 'lighter';
    var c = piece.kind === 'welcome' ? NEON[1] : NEON[0], strength = 0.5 + 0.4 * Math.min(1, light.night * 1.6);
    ctx.fillStyle = css(c, 0.1 * strength);
    ctx.beginPath();
    ctx.moveTo(x + span / 2 - 2, RT - 2.4);
    ctx.lineTo(x, top + 13);
    ctx.lineTo(x + span, top + 13);
    ctx.lineTo(x + span / 2 + 2, RT - 2.4);
    ctx.fill();
    rect(ctx, x, top, span, 13, css(c, 0.25 * strength));
    ctx.strokeStyle = css(c, 0.9 * strength);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, top, span, 13);
    for (var scan = 1; scan < 13; scan += 2) {
      rect(ctx, x, top + scan, span, 0.3, css(c, 0.12 * strength));
    }
    ctx.globalCompositeOperation = 'source-over';
    text(ctx, words, x + span / 2, top + 8.4, 5, css(blend([255, 255, 255], c, 0.25), 0.95));
  }
  // The city's: the rate now, in neon.
  function billboard(x) {
    [10, 50].forEach(function (post) {
      rect(ctx, x + post, RT - 34, 1.8, 32, near('cityDark'));
      keep(x + post, RT - 34, 1.8, 32);
    });
    ctx.fillStyle = '#121624';
    ctx.fillRect(x, RT - 60, 62, 27);
    keep(x, RT - 60, 62, 27);
    ctx.strokeStyle = near('rail');
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, RT - 60, 62, 27);
    text(ctx, rateText(), x + 31, RT - 43, 11, '#58f0ff');
    text(ctx, 'THE HOUSE, RIGHT NOW', x + 31, RT - 37, 3.6, '#ff58a0');
    gives.push({kind: 'neon', x: x + 31, y: RT - 46});
    signs.push({x: x + 31, y: RT - 46, w: 62, top: RT - 60, h: 27});
    lights(x, 62, RT - 60);
  }
  // Green for data, blue for a welcome. In the ruinous biomes rusted through, the words
  // painted on by hand, and with no power: lit by a fire in a drum beside it.
  function roadSign(piece, x, words, waste) {
    var wide = Math.max(40, words.length * 3.1 + 8), green = piece.kind !== 'welcome';
    [6, wide - 8].forEach(function (post) {
      rect(ctx, x + post, RT - 18, 1.6, 16, near(waste ? 'scorch' : 'rail'));
      keep(x + post, RT - 18, 1.6, 16);
    });
    ctx.fillStyle = waste ? vertical(ctx, RT - 31, RT - 18, [[0, '#6e3c22'], [1, '#4a2614']]) : green ? '#1d6b3a' : '#2a4f8c';
    ctx.fillRect(x, RT - 31, wide, 13);
    keep(x, RT - 31, wide, 13);
    if (waste) {
      ctx.fillStyle = 'rgba(20, 10, 6, 0.55)';
      [0.2, 0.55, 0.85].forEach(function (at) {
        ctx.beginPath();
        ctx.arc(x + wide * at, RT - 31, 1.6, 0, Math.PI);
        ctx.fill();
      });
      ctx.save();
      ctx.translate(x + wide / 2, RT - 22.6);
      ctx.rotate(-0.03);
      text(ctx, words, 0, 0, 5, '#ecdcc0');
      ctx.restore();
      drum(x - 7, flow.hash('sign' + piece.at), 4.5);
      return;
    }
    ctx.strokeStyle = '#f2f2ea';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x + 1, RT - 30, wide - 2, 11);
    text(ctx, words, x + wide / 2, RT - 22.6, 5, '#f4f4ec');
    signs.push({x: x + wide / 2, y: RT - 24.5, w: wide, top: RT - 31, h: 13});
    lights(x, wide, RT - 31);
  }
  // A drum on the verge, a fire in it.
  function drum(x, seed, size) {
    ctx.fillStyle = vertical(ctx, RT - 8, RT, [[0, near('rust')], [1, near('rustDark')]]);
    ctx.fillRect(x - 2.6, RT - 8, 5.2, 8);
    rect(ctx, x - 2.6, RT - 5.4, 5.2, 0.5, near('scorch'));
    rect(ctx, x - 2.6, RT - 2.6, 5.2, 0.5, near('scorch'));
    keep(x - 2.6, RT - 8, 5.2, 8);
    fires.push({x: x, y: RT - 7.6, size: size, seed: seed});
  }
  // A sedan burnt out on the verge and burning still: roof sagging, windows empty, down on
  // its rims and leaning, a scrap of its old paint left. Facing either way, the fire in its
  // engine or its cabin, by its seed.
  var OLD_PAINTS = [[120, 104, 78], [70, 86, 96], [126, 72, 54]];
  function burntCar(x, seed) {
    var random = seeded(Math.round(seed * 1e6) + 3);
    var L = 60 + random() * 10, flip = random() < 0.5, sag = (random() - 0.5) * 0.07, cave = 0.6 + random() * 1.6;
    function at(px, py) {
      return [x + (flip ? L - px : px), RT + py + sag * (px - L / 2)];
    }
    function path(points) {
      var made = new Path2D();
      points.forEach(function (q, i) {
        var a = at(q[0], q[1]);
        made[i ? 'lineTo' : 'moveTo'](a[0], a[1]);
      });
      made.closePath();
      return made;
    }
    var hood = 0.36 + random() * 0.06, nose = L * (1 - 0.02);
    var body = path([[0, -1.5], [0.4, -6.4], [1.6, -9], [L * 0.2, -9.6], [L * 0.31, -15.2], [L * 0.42, -15.6 + cave], [L * 0.5, -15.8 + cave * 0.7],
      [L * 0.58, -15.2], [L * (1 - hood) + 1, -10], [L * 0.9, -8.8], [nose, -7.4], [L - 0.3, -5.4], [L - 1.6, -3.2], [L - 1.2, -1.5]]);
    var lowRust = css(blend(tone('rustDark', 0, true), tone('rust', 0, true), 0.4));
    ctx.fillStyle = vertical(ctx, RT - 16, RT, [[0, near('scorch')], [0.5, near('rustDark')], [0.85, lowRust], [1, near('scorch')]]);
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    var paint = OLD_PAINTS[Math.floor(random() * 3)], patch = at(L * (0.06 + random() * 0.1), -6);
    ctx.fillStyle = css(blend(paint, tone('scorch', 0, true), 0.3), 0.7);
    ctx.beginPath();
    ctx.ellipse(patch[0], patch[1], 5 + random() * 4, 2.6, 0, 0, 6.2832);
    ctx.fill();
    for (var b = 0; b < 6; b += 1) {
      var spot = at(random() * L, -2 - random() * 12);
      ctx.fillStyle = css(tone(random() < 0.5 ? 'scorch' : 'rust', 0, true), 0.6);
      ctx.beginPath();
      ctx.ellipse(spot[0], spot[1], 2 + random() * 4, 0.8 + random() * 1.4, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#0e0a08';
    ctx.fill(path([[L * 0.33, -14.2], [L * 0.43, -14.6 + cave], [L * 0.43, -10.4], [L * 0.28, -10.4]]));
    ctx.fill(path([[L * 0.45, -14.6 + cave * 0.8], [L * 0.57, -14.4], [L * (1 - hood) - 0.4, -10.4], [L * 0.45, -10.4]]));
    // A door's seam and the hood's line.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    var d0 = at(L * 0.44, -10.2), d1 = at(L * 0.44, -2.4), h0 = at(L * (1 - hood) + 1, -9.4), h1 = at(L * 0.9, -8.4);
    ctx.moveTo(d0[0], d0[1]);
    ctx.lineTo(d1[0], d1[1]);
    ctx.moveTo(h0[0], h0[1]);
    ctx.lineTo(h1[0], h1[1]);
    ctx.stroke();
    // Down on its rims. Both wheels draw a number, though the back one doesn't use it.
    [L * 0.2, L * 0.8].forEach(function (wx, i) {
      var c = at(wx, -1.6 + (i ? 0.4 : 0) * random());
      ctx.fillStyle = '#16120f';
      ctx.beginPath();
      ctx.arc(c[0], c[1], 4, Math.PI, 0);
      ctx.fill();
      circle(ctx, c[0], c[1] + 0.4, 2.4, '#3a3430');
      circle(ctx, c[0], c[1] + 0.4, 1, '#1c1814');
    });
    nearShapes.push(body);
    var engine = random() < 0.6, fire = at(engine ? L * 0.82 : L * 0.46, engine ? -9 : -14);
    fires.push({x: fire[0], y: fire[1] + 2, size: engine ? 8 : 9, seed: seed});
  }
  // Flames flickering, each tongue at its own pace and leaning with the wind; the glow;
  // smoke rising and drifting off; sparks on Ultra. Drawn after the night's shade: it's a light.
  var FLAME_COLOURS = [[255, 70, 20], [255, 140, 30], [255, 220, 110]];
  function flame(x, base, size, time, seed, smoky) {
    var t = time / 1000;
    if (smoky) {
      smokeRising(x, base, size, t, seed);
    }
    var flicker = 0.85 + 0.1 * Math.sin(t * 11 + seed * 20) + 0.05 * Math.sin(t * 27 + seed * 7);
    ctx.globalCompositeOperation = 'lighter';
    glow(x, base - size * 0.45, size * (sharp ? 3.2 : 2.2), [255, 130, 40], (0.35 + 0.35 * light.night) * flicker);
    ctx.globalCompositeOperation = 'source-over';
    FLAME_COLOURS.forEach(function (c, j) {
      var w = size * (0.42 - j * 0.1);
      var high = size * (1.35 - j * 0.3) * (0.82 + 0.22 * Math.sin(t * (8 + j * 3.3) + seed * 10 + j * 2));
      var lean = Math.sin(t * 5.2 + j + seed * 7) * size * 0.16 + flow.windX * size * 0.25;
      ctx.fillStyle = vertical(ctx, base - high, base, [[0, css(c, 0)], [0.45, css(c, 0.85)], [1, css(c, 1)]]);
      ctx.beginPath();
      ctx.moveTo(x - w, base);
      ctx.quadraticCurveTo(x - w * 1.15, base - high * 0.45, x + lean, base - high);
      ctx.quadraticCurveTo(x + w * 1.15, base - high * 0.45, x + w, base);
      ctx.closePath();
      ctx.fill();
    });
    if (flow.ultra) {
      for (var e = 0; e < 4; e += 1) {
        var up = (t * 0.7 + e / 4 + seed * 3) % 1;
        var sparkX = x + Math.sin(t * 3 + e * 1.7) * size * 0.5 + flow.windX * up * size;
        circle(ctx, sparkX, base - size - up * size * 3, 0.25, css([255, 200, 90], (1 - up).toFixed(3)));
      }
    }
  }
  function smokeRising(x, base, size, t, seed) {
    var puffs = sharp ? 12 : 6, haze = smokeColour(blend([62, 56, 52], [14, 14, 18], light.night * 0.8));
    for (var s = 0; s < puffs; s += 1) {
      var age = (t * 0.32 + s / puffs + seed) % 1, r = size * (0.6 + age * 2);
      var sx = x + (flow.windX * 14 + 4) * age * size / 5 + Math.sin(t * 0.8 + s * 2 + seed * 9) * size * 0.15;
      var sy = base - size * 1.1 - age * size * 7;
      glow(sx, sy, r, haze, 0.55 * (1 - age) * Math.min(1, age * 8));
    }
  }
  // In steps, so each colour's puff is a sprite made once.
  function smokeColour(c) {
    return c.map(function (v) { return Math.round(v / 6) * 6; });
  }
  function drawFires(time) {
    fires.forEach(function (f) { flame(f.x, f.y, f.size, time, f.seed, true); });
  }
