  // -------------------------------------------------------------- life about --
  // Now and then a plane crossing the sky (by night its lights blinking), or in the future
  // a delivery drone; birds over the country and gulls over the coast by day (sharp); a
  // train alongside in the country (Ultra); the future's monorail train gliding by.
  var plane = null, planeDue = 20 + 40 * Math.random(), flock = null, flockDue = 10, train = null, glider = null;
  var NO_PLANES = {wasteland: 1, aftermath: 1, warzone: 1, asteroids: 1, underworld: 1};
  function drawPlane(seconds, time) {
    if (!plane) {
      var here = biomeAt(odometer + cols, 1);
      if ((planeDue -= seconds) > 0 || NO_PLANES[here]) {
        return;
      }
      var right = Math.random() < 0.5, drone = here === 'future';
      plane = {x: right ? cols + 10 : -10, y: drone ? 50 + Math.random() * 40 : 16 + Math.random() * 26, way: right ? -1 : 1, drone: drone};
    }
    plane.x += plane.way * (plane.drone ? 34 : 18) * seconds;
    if (plane.x < -20 || plane.x > cols + 20) {
      plane = null;
      planeDue = (biomeAt(odometer + cols, 1) === 'future' ? 6 : 40) + 60 * Math.random();
      return;
    }
    if (plane.drone) {
      drawDrone(plane, time);
    } else if (light.night > 0.4) {
      circle(ctx, plane.x, plane.y, 0.5, '#f0f0f0');
      if (Math.floor(time / 600) % 2) {
        circle(ctx, plane.x - plane.way * 1.6, plane.y, 0.6, '#ff4040');
      }
    } else {
      ctx.strokeStyle = css(blend([90, 96, 110], skyColour('low'), 0.3));
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(plane.x - 2, plane.y);
      ctx.lineTo(plane.x + 2, plane.y);
      ctx.moveTo(plane.x, plane.y - 1);
      ctx.lineTo(plane.x - plane.way * 0.6, plane.y + 1);
      ctx.stroke();
    }
  }
  // Four rotors blurring, a parcel slung under, a light blinking.
  function drawDrone(craft, time) {
    var x = craft.x, y = craft.y + Math.sin(time / 400) * 0.8, dim = light.night * 0.8;
    var dark = css(blend([60, 64, 74], [12, 14, 24], dim));
    rect(ctx, x - 3, y - 0.6, 6, 1.4, dark);
    rect(ctx, x - 1.2, y + 1.4, 2.4, 2, css(blend([196, 150, 96], [30, 26, 30], dim)));
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x - 0.8, y + 0.8);
    ctx.lineTo(x - 0.8, y + 1.4);
    ctx.moveTo(x + 0.8, y + 0.8);
    ctx.lineTo(x + 0.8, y + 1.4);
    ctx.stroke();
    [-3.6, 3.6].forEach(function (rx) {
      rect(ctx, x + rx - 1.6, y - 1.2, 3.2, 0.4, css(blend([120, 126, 140], [20, 24, 40], dim), 0.6));
    });
    if (Math.floor(time / 500) % 2) {
      circle(ctx, x + craft.way * 3, y, 0.45, light.night > 0.3 ? '#60f0ff' : '#ff4040');
    }
  }
  function drawBirds(seconds, time) {
    var biome = biomeAt(odometer + cols, 1);
    if (!flock) {
      if ((flockDue -= seconds) > 0 || light.night > 0.4 || (biome !== 'country' && biome !== 'coast')) {
        return;
      }
      flock = {x: cols + 20, y: RT - 120 + Math.random() * 30, gulls: biome === 'coast', birds: []};
      for (var b = 0; b < 7; b += 1) {
        flock.birds.push({dx: b * 6 + Math.random() * 4, dy: Math.abs(b - 3) * 2.5 + Math.random() * 2, phase: Math.random() * 6});
      }
    }
    flock.x -= (velocity * 0.08 + 14) * seconds;
    if (flock.x < -60) {
      flock = null;
      flockDue = 25 + 40 * Math.random();
      return;
    }
    ctx.strokeStyle = flock.gulls ? '#f4f4f0' : '#30343c';
    ctx.lineWidth = 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    flock.birds.forEach(function (bird) {
      var x = flock.x + bird.dx, y = flock.y + bird.dy + Math.sin(time / 700 + bird.phase);
      var flap = Math.sin(time / 120 + bird.phase) * 1.4;
      ctx.moveTo(x - 2.4, y - flap);
      ctx.quadraticCurveTo(x - 1, y - 1, x, y);
      ctx.quadraticCurveTo(x + 1, y - 1, x + 2.4, y - flap);
    });
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  function drawTrain(seconds) {
    var rate = 0.4, layer = odometer * rate;
    if (!train) {
      if (biomeAt(layer + cols, rate) !== 'country' || Math.random() > seconds / 20) {
        return;
      }
      train = {at: layer + cols + 10};
    }
    train.at += 70 * seconds;
    var x = train.at - layer;
    if (x > cols + 260 || x < -260) {
      train = null;
      return;
    }
    var bright = light.night > 0.35, top = RT - 18;
    var unlit = css(blend([150, 180, 210], [20, 26, 40], light.night));
    for (var c = 0; c < 5; c += 1) {
      var cx = x - c * 40;
      ctx.fillStyle = vertical(ctx, top, top + 12, c === 0 ? [[0, '#3c4a5c'], [1, '#1c2430']] : [[0, '#8a3030'], [1, '#4a1818']]);
      ctx.fillRect(cx - 38, top, 38, 12);
      rect(ctx, cx - 38, top - 1, 38, 1.4, css(blend([60, 60, 66], [0, 0, 0], light.night * 0.6)));
      for (var w = 4; w < 34; w += 5) {
        rect(ctx, cx - 38 + w, top + 3, 3, 3, bright ? '#f8d888' : unlit);
      }
    }
    if (bright) {
      glow(x, RT - 12, 6, [255, 240, 200], 0.8);
    }
  }
  // The future's monorail train, gliding along the near layer's track.
  function drawGlider(seconds) {
    var rate = 0.25, layer = odometer * rate;
    if (!glider) {
      if (biomeAt(layer + cols, rate) !== 'future' || Math.random() > seconds / 12) {
        return;
      }
      glider = {at: layer + cols + 10};
    }
    glider.at += 90 * seconds;
    var x = glider.at - layer, top = RT - 46, bright = light.night > 0.3;
    if (x > cols + 200 || x < -200) {
      glider = null;
      return;
    }
    var body = vertical(ctx, top, top + 9, [[0, css(blend([236, 240, 244], [20, 24, 40], light.night * 0.7))], [1, css(blend([170, 180, 192], [12, 14, 26], light.night * 0.7))]]);
    for (var c = 0; c < 3; c += 1) {
      gliderCar(x - c * 34, top, c === 0, body, bright);
    }
    if (bright) {
      ctx.globalCompositeOperation = 'lighter';
      glow(x + 3, top + 6, 5, [200, 240, 255], 0.8 * light.night);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  function gliderCar(cx, top, nose, body, bright) {
    var car = new Path2D();
    car.moveTo(cx - 32, top + 9);
    car.lineTo(cx - 32, top + 2);
    car.quadraticCurveTo(cx - 32, top, cx - 29, top);
    car.lineTo(nose ? cx - 8 : cx - 2, top);
    car.quadraticCurveTo(nose ? cx + 2 : cx, top + 1, nose ? cx + 4 : cx, nose ? top + 9 : top + 3);
    car.lineTo(cx, top + 9);
    car.closePath();
    ctx.fillStyle = body;
    ctx.fill(car);
    rect(ctx, cx - 30, top + 2.4, nose ? 26 : 28, 2.4, bright ? '#f0f4ff' : '#2a3a50');
    rect(ctx, cx - 32, top + 7, 32, 0.6, css(NEON[0], 0.5 + 0.5 * light.night));
  }
  // Small fires among the wasteland's ruins (at the near layer's rate).
  function drawBlazes(time) {
    var rate = 0.25, layer = odometer * rate;
    for (var m = Math.floor((layer - 40) / 150); m <= Math.floor((layer + cols + 40) / 150); m += 1) {
      var seed = seeded(m * 7919 + 67)(), at = m * 150 + seed * 90, biome = biomeAt(at, rate);
      if (seed > 0.4 || !/wasteland|aftermath/.test(biome)) {
        continue;
      }
      var x = at - layer, foot = RT - 1 - seed * 10;
      ctx.fillStyle = stuff('scorch', 0.2, 1);
      ctx.beginPath();
      ctx.ellipse(x, foot, 4, 1.6, 0, 0, 6.2832);
      ctx.fill();
      flame(x, foot, 3 + seed * 5, time, seed, true);
    }
  }
