  // ---------------------------------------------------------------- the light --
  // Toward night the road and the vehicles go dark except where a light falls. A shade
  // (darkness on a board at a quarter of the screen's pixels on the TV, a half sharp) has
  // the lights cut out of it, and is laid only within the road and the vehicles, so no
  // light shows on the scenery. The road and what's on it keep their true colours by day
  // (`near`) and the shade darkens them, so a light shows them as they are. Then what
  // gives light goes on top: lamps, headlights and tail lights, beams in the air, and
  // reflections on a wet road.
  var shadeBoard = document.createElement('canvas'), shadeKit = shadeBoard.getContext('2d');
  function darkness() {
    return Math.max(0, Math.min(0.86, (light.night - 0.12) * 1.05)) * (1 - 0.3 * flow.snowCover);
  }
  // A pool of light cut out of the shade: one soft disc made once and laid stretched at its
  // strength. A gradient made for each, every frame, cost the TV.
  var puddle = null;
  function pool(p, x, y, rx, ry, strength) {
    if (!puddle) {
      puddle = softDisc('rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)');
    }
    p.globalAlpha = Math.min(1, strength);
    p.drawImage(puddle, x - rx, y - ry, 2 * rx, 2 * ry);
    p.globalAlpha = 1;
  }
  function softDisc(inner, outer, middle) {
    var made = document.createElement('canvas');
    made.width = made.height = 64;
    var q = made.getContext('2d'), g = q.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner);
    if (middle) {
      g.addColorStop(0.15, middle);
    }
    g.addColorStop(1, outer);
    q.fillStyle = g;
    q.fillRect(0, 0, 64, 64);
    return made;
  }
  // A headlight's cone, drawn once: soft at its edges and fading along its length. Laid on
  // the road as the light the shade loses, and in the air (as light) as its beam.
  var cone = null;
  function beamCone() {
    if (cone) {
      return cone;
    }
    cone = document.createElement('canvas');
    cone.width = 256;
    cone.height = 96;
    var p = cone.getContext('2d'), fade = p.createLinearGradient(6, 0, 250, 0);
    fade.addColorStop(0, 'rgba(255, 244, 214, 1)');
    fade.addColorStop(0.45, 'rgba(255, 244, 214, 0.6)');
    fade.addColorStop(1, 'rgba(255, 244, 214, 0)');
    p.filter = 'blur(7px)';
    p.fillStyle = fade;
    p.beginPath();
    p.moveTo(8, 44);
    p.lineTo(250, 18);
    p.lineTo(250, 78);
    p.lineTo(8, 52);
    p.closePath();
    p.fill();
    return cone;
  }
  function beam(p, hx, hy, strength) {
    p.globalAlpha = strength;
    p.drawImage(beamCone(), hx - 2, hy - 9, 124, 22);
    p.globalAlpha = 1;
  }
  // This frame's vehicles.
  var lit = [];
  function inTunnel(x0, x1) {
    return tunnels.some(function (t) { return x1 > t[0] - 30 && x0 < t[1] + 30; });
  }
  // The night is laid in layers as they're drawn, each darkened only within its own
  // outline with only the light that falls on it, so whatever's in front hides the light
  // behind: the roadside and the road; each vehicle, far lane first; then what's in front.
  var night = {dark: 0, on: false, scene: null};
  function nightBegin(scene) {
    var dark = darkness();
    night = {dark: dark, on: dark >= 0.02 || tunnels.length > 0, scene: scene};
    lit.forEach(function (v) { v.on = dark > 0.02 || inTunnel(v.x, v.x + v.length); });
  }
  // The shade, deeper in a tunnel, with `lights` cut out of it.
  function shadeBoardWith(lights) {
    var q = sharp ? 0.5 : 0.25, w = Math.ceil(flow.width * q), h = Math.ceil(flow.height * q);
    var rows = flow.height / k, scene = night.scene;
    if (shadeBoard.width !== w || shadeBoard.height !== h) {
      shadeBoard.width = w;
      shadeBoard.height = h;
    }
    var p = shadeKit;
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.globalCompositeOperation = 'source-over';
    p.clearRect(0, 0, w, h);
    p.fillStyle = 'rgba(4, 6, 18, ' + night.dark + ')';
    p.fillRect(0, 0, w, h);
    p.setTransform(scene.a * q, 0, 0, scene.a * q, scene.e * q, scene.f * q);
    // In a tunnel it's dark by day as by night; each tunnel may say how dark.
    tunnels.forEach(function (t) {
      var gloom = t[2] === undefined ? 0.74 : t[2];
      if (gloom <= night.dark) {
        return;
      }
      p.fillStyle = 'rgba(4, 6, 18, ' + ((gloom - night.dark) / (1 - night.dark)).toFixed(3) + ')';
      p.fillRect(t[0], RT - 46, t[1] - t[0], rows - RT + 46);
    });
    p.globalCompositeOperation = 'destination-out';
    lights(p);
  }
  // The shade, within an outline; `box` ([x0, y0, x1, y1] in units) limits the copy.
  function layShade(outline, box) {
    var scene = night.scene, q = shadeBoard.width / flow.width;
    ctx.save();
    ctx.clip(outline);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!box) {
      ctx.drawImage(shadeBoard, 0, 0, flow.width, flow.height);
      ctx.restore();
      return;
    }
    var x0 = Math.max(0, Math.floor(scene.a * box[0] + scene.e)), y0 = Math.max(0, Math.floor(scene.a * box[1] + scene.f));
    var x1 = Math.min(flow.width, Math.ceil(scene.a * box[2] + scene.e)), y1 = Math.min(flow.height, Math.ceil(scene.a * box[3] + scene.f));
    if (x1 > x0 && y1 > y0) {
      ctx.drawImage(shadeBoard, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.restore();
  }
  // What lights the road from above: the streetlamps and the tunnels' lamps.
  function streetLight(p) {
    lamps.forEach(function (x) {
      pool(p, x + 9, RT + 14, 44, 22, 1);
      pool(p, x + 9, RT - 28, 12, 16, 0.6);
    });
    gives.forEach(function (g) {
      if (g.kind === 'tunnel lamp') {
        pool(p, g.x, RT + 12, 20, 18, 0.7);
      }
    });
  }
  // A vehicle's top edge (roof, hood, deck), found once per kind by probing its outline:
  // in whole units down to it, then to the quarter, so no kind's first frame stalls.
  var probe = document.createElement('canvas').getContext('2d');
  function profileOf(v) {
    var meta = VEHICLES[v.kind];
    if (meta.profile) {
      return meta.profile;
    }
    var out = [];
    for (var x = 0; x <= Math.ceil(meta.length); x += 1) {
      out.push(topAt(v.shape.path, x + 0.5, meta.height));
    }
    return (meta.profile = out);
  }
  function topAt(path, x, height) {
    var top = null;
    for (var y = -8; y < height + 2 && top === null; y += 1) {
      if (probe.isPointInPath(path, x, y)) {
        top = y;
      }
    }
    if (top === null) {
      return null;
    }
    for (var fine = top - 0.75; fine < top; fine += 0.25) {
      if (probe.isPointInPath(path, x, fine)) {
        return fine;
      }
    }
    return top;
  }
  // Light from above on a vehicle's upward faces: the lamps over it, brightest under each
  // and fading between, a strip along its top a little dimmer below.
  function topLight(v, outline) {
    var above = lightsAbove(v);
    if (!above.length) {
      return;
    }
    var line = topLine(v);
    // Across the vehicle, each step the sum of its lamps.
    var bright = ctx.createLinearGradient(v.x, 0, v.x + v.length, 0), soft = ctx.createLinearGradient(v.x, 0, v.x + v.length, 0);
    for (var x = 0; x <= v.length; x += 2) {
      var r = 0, g = 0, b = 0, ax = v.x + x;
      above.forEach(function (l) {
        var d = (ax - l.x) / l.wide, strength = l.k * Math.exp(-d * d);
        r += l.tint[0] * strength;
        g += l.tint[1] * strength;
        b += l.tint[2] * strength;
      });
      var i = Math.max(r, g, b, 1) / 255, tint = [r / i, g / i, b / i], at = Math.min(1, x / v.length);
      bright.addColorStop(at, css(tint, Math.min(0.85, i * 0.75).toFixed(3)));
      soft.addColorStop(at, css(tint, Math.min(0.35, i * 0.3).toFixed(3)));
    }
    ctx.save();
    ctx.clip(outline);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = ctx.lineCap = 'round';
    // Clipped, so only its inner half shows, on the body.
    ctx.strokeStyle = soft;
    ctx.lineWidth = 5;
    ctx.stroke(line);
    ctx.strokeStyle = bright;
    ctx.lineWidth = 1.8;
    ctx.stroke(line);
    ctx.restore();
  }
  function lightsAbove(v) {
    var above = [];
    gives.forEach(function (g) {
      if (g.kind === 'tunnel lamp') {
        above.push({x: g.x, k: 0.9, wide: 16, tint: g.tint || [255, 168, 88]});
      }
    });
    if (night.dark > 0.05) {
      lamps.forEach(function (x) {
        above.push({x: x + 9, k: 0.8 * night.dark, wide: 26, tint: [255, 218, 160]});
      });
    }
    // The adverts light the cars only where they're seen on the road: their reflections,
    // which only a wet road shows, narrow under each advert.
    if (roadWet > 0.01 && night.dark > 0.05) {
      adLights.forEach(function (ad) {
        above.push({x: ad.x + 1.5, k: 0.8 * ad.s * roadWet * Math.min(1, night.dark * 1.5), wide: 5, tint: ad.c});
      });
    }
    return above.filter(function (l) { return l.x > v.x - 3 * l.wide && l.x < v.x + v.length + 3 * l.wide; });
  }
  // The top as one smooth line, broken where it drops or rises sharply: an upright face
  // catches nothing from above.
  function topLine(v) {
    var profile = profileOf(v), s = v.shape, line = new Path2D(), started = false;
    profile.forEach(function (top, x) {
      var steep = x > 0 && profile[x - 1] !== null && top !== null && Math.abs(top - profile[x - 1]) > 1.2;
      if (top === null || steep) {
        started = false;
        if (top === null) {
          return;
        }
      }
      line[started ? 'lineTo' : 'moveTo'](s.x + x + 0.5, s.y + top + bodyDown(v, s.x - v.x + x));
      started = true;
    });
    return line;
  }
  // The roadside and the road.
  function nightRoad() {
    if (!night.on) {
      return;
    }
    shadeBoardWith(roadLights);
    layShade(roadOutline());
    roadGlows(night.dark);
  }
  function roadLights(p) {
    streetLight(p);
    gives.forEach(function (g) {
      if (g.kind === 'station') {
        pool(p, g.x + 31, RT - 10, 36, 16, 0.95);
        pool(p, g.x + 81, RT - 12, 18, 12, 0.8);
      }
    });
    // The fires' light, flickering, round them and on the road.
    var t = performance.now() / 1000;
    fires.forEach(function (f) {
      var flicker = 0.8 + 0.12 * Math.sin(t * 11 + f.seed * 20) + 0.08 * Math.sin(t * 23 + f.seed * 5);
      pool(p, f.x, f.y - 6, f.size * 3 + 22, f.size * 2 + 16, 0.9 * flicker);
      pool(p, f.x, RT + 8, f.size * 3 + 12, 9, 0.6 * flicker);
    });
    // Each sign lit steadily by its own lamps.
    signs.forEach(function (sign) {
      p.fillStyle = 'rgba(0, 0, 0, 0.9)';
      p.fillRect(sign.x - sign.w / 2 - 1, sign.top - 1, sign.w + 2, sign.h + 2);
    });
    lit.forEach(function (v) {
      if (!v.on) {
        return;
      }
      beam(p, v.x + v.length - 0.6, v.ground - VEHICLES[v.kind].head + bodyDown(v, v.length), 0.95);
      // Its spill along the rail and posts ahead, each caught as it passes through.
      pool(p, v.x + v.length + 70, RT - 4, 64, 7, v.ground < RT + 30 ? 0.6 : 0.4);
    });
  }
  function roadOutline() {
    var road = new Path2D();
    if (worldOn) {
      road.rect(0, RT + 1.5, cols, flow.height / k - RT);
      road.rect(0, RT - 8, cols, 9.5);
    } else {
      road.rect(0, RT + 1.5, cols, 43);
    }
    lamps.forEach(function (x) {
      road.rect(x - 0.9, RT - 42, 1.8, 42);
      road.rect(x - 0.4, RT - 44.6, 12.6, 3.6);
    });
    nearShapes.forEach(function (shape) {
      if (shape.length === 4) {
        road.rect(shape[0], shape[1], shape[2], shape[3]);
      } else if (road.addPath) {
        road.addPath(shape);
      }
    });
    return road;
  }
  // What glows on the roadside and the road, as light, over the shade.
  function roadGlows(dark) {
    var shine = sharp && roadWet > 0.01;
    ctx.globalCompositeOperation = 'lighter';
    lamps.forEach(function (x) {
      var slim = BIOMES[biomeAt(x + odometer, 1)].lamps === 'slim';
      glow(x + 9, RT - 42, sharp ? 9 : 4, slim ? [200, 240, 255] : [255, 214, 150], dark);
      if (shine) {
        streak(x + 9, RT + 6, 22, [255, 210, 150], 0.35 * dark * roadWet);
      }
    });
    lightLines(dark);
    // The badlands' line by night: pink and cyan, glowing faintly.
    for (var dx = -(odometer % 24); dx < cols; dx += 24) {
      var tint = deepIn(dx + odometer + 12, 'badlands');
      if (tint) {
        var neonDash = Math.round((dx + odometer) / 24) % 2 ? [255, 90, 200] : [80, 230, 255];
        rect(ctx, dx, RT + 22.4, 12, 1.2, css(neonDash, 0.55 * dark * tint));
      }
    }
    gives.forEach(function (g) { givenGlow(g, dark); });
    lit.forEach(function (v) {
      if (!v.on) {
        return;
      }
      var strength = Math.max(dark, inTunnel(v.x, v.x + v.length) ? 0.85 : 0), hx = v.x + v.length - 0.6;
      // The studs ahead catching its headlights.
      studs.forEach(function (x) {
        var ahead = x - hx;
        if (ahead > 2 && ahead < 130) {
          glow(x, RT + 23, sharp ? 2.2 : 1.4, [255, 230, 170], strength * (1 - ahead / 130));
        }
      });
      if (shine) {
        streak(hx + 6, v.ground + 1, 14, [255, 240, 210], 0.3 * strength);
        streak(v.x + 2, v.ground + 1, 10, [255, 40, 30], 0.3 * strength);
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }
  function givenGlow(g, dark) {
    if (g.kind === 'tunnel lamp') {
      glow(g.x, g.y, sharp ? 6 : 3, g.tint || [255, 170, 80], 0.9);
    } else if (g.kind === 'sign lamp' && dark > 0.1) {
      glow(g.x, g.y, sharp ? 3.2 : 1.8, [255, 244, 220], dark);
    } else if (g.kind === 'station' && dark > 0.1) {
      rect(ctx, g.x + 1, RT - 30, 60, 1, css([255, 246, 220], dark));
      rect(ctx, g.x + 70, RT - 17, 22, 9, css([255, 220, 160], 0.5 * dark));
      glow(g.x + 106, RT - 57, sharp ? 14 : 6, [255, 90, 60], 0.6 * dark);
    } else if (g.kind === 'neon' && dark > 0.1 && sharp) {
      glow(g.x, g.y, 26, [80, 220, 255], 0.35 * dark);
    }
  }
  // A vehicle's sides are lit by its own lights only: the lamps stand over the road's far
  // side, behind it, and reach only its top (topLight).
  function nightVehicle(v) {
    if (!night.on || !v.shape) {
      return;
    }
    var dark = night.dark, s = v.shape;
    shadeBoardWith(function (p) {
      if (v.on) {
        pool(p, v.x + v.length - 2, v.ground - 8, 12, 9, 0.8);
        pool(p, v.x, v.ground - 6, 10, 5, 0.45);
      }
    });
    var outline = new Path2D();
    if (outline.addPath) {
      outline.addPath(s.path, {a: 1, b: v.slope || 0, c: 0, d: 1, e: s.x, f: s.y + bodyDown(v, s.x - v.x)});
    } else {
      outline.rect(v.x, v.top, v.length, v.ground - v.top);
    }
    s.wheels.forEach(function (w) {
      outline.moveTo(s.x + w[0] + w[2] + 1, s.y + w[1]);
      outline.arc(s.x + w[0], s.y + w[1], w[2] + 1, 0, 6.2832);
    });
    layShade(outline, [v.x - 2, v.top - 8, v.x + v.length + 2, v.ground + 2]);
    topLight(v, outline);
    if (!v.on) {
      return;
    }
    var strength = Math.max(dark, inTunnel(v.x, v.x + v.length) ? 0.85 : 0);
    var hx = v.x + v.length - 0.6, hy = v.ground - VEHICLES[v.kind].head + bodyDown(v, v.length);
    var air = flow.ultra || (sharp && precipNow && (precipNow.kind === 'rain' || precipNow.fog));
    ctx.globalCompositeOperation = 'lighter';
    // Soft and small at every level: bigger, it's a blob.
    glow(hx, hy, 3, [255, 246, 220], strength);
    glow(v.x + 0.6, v.ground - VEHICLES[v.kind].tail + bodyDown(v, 0), 2.5, [255, 40, 30], strength * 0.9);
    if (air) {
      beam(ctx, hx, hy, 0.3 * strength);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // What's in front of the traffic: darkened only.
  function nightFront() {
    if (!night.on || !frontShapes.length) {
      return;
    }
    ctx.fillStyle = 'rgba(4, 6, 18, ' + Math.max(night.dark, 0).toFixed(3) + ')';
    frontShapes.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
  }
  // Sharp: the sun's or moon's reflection, a column of glints under it shimmering, wider
  // nearer; on the coast's sea and on a wet road.
  function glitter(top, bottom, strength, time, seed) {
    if (!sharp || !sunAt.shine || !sunAt.x || strength < 0.02) {
      return;
    }
    var t = time / 1000, random = seeded(seed);
    ctx.globalCompositeOperation = 'lighter';
    for (var n = 0; n < 40; n += 1) {
      var y = top + random() * (bottom - top), nearness = (y - top) / (bottom - top), wide = 3 + 14 * nearness;
      var x = sunAt.x + (random() - 0.5) * 2 * wide, on = Math.max(0, Math.sin(t * (2 + random() * 4) + random() * 20));
      rect(ctx, x, y, 1 + 3 * nearness * random(), 0.4 + 0.3 * nearness, css(sunAt.colour, (on * strength * sunAt.shine).toFixed(3)));
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // A soft glow, from one sprite per colour made once: keep the colours few (quantise any
  // that vary), or the sprites pile up.
  var sprites = {};
  function glow(x, y, r, colour, strength) {
    if (strength < 0.02) {
      return;
    }
    var key = colour.join(','), sprite = sprites[key];
    if (!sprite) {
      sprite = sprites[key] = softDisc(css(colour, 1), css(colour, 0), css(colour, 0.7));
    }
    ctx.globalAlpha = Math.min(1, strength);
    ctx.drawImage(sprite, x - r, y - r, 2 * r, 2 * r);
    ctx.globalAlpha = 1;
  }
  // A light's reflection on the wet road, running down from it.
  function streak(x, y, long, colour, strength) {
    var fade = ctx.createLinearGradient(0, y, 0, y + long);
    fade.addColorStop(0, css(colour, strength));
    fade.addColorStop(1, css(colour, 0));
    ctx.fillStyle = fade;
    ctx.fillRect(x - 2, y, 4, long);
  }
