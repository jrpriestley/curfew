  // -------------------------------------------------------------- the frame --
  var framed = 0, skyDue = 0, swept = 0, lead = 0, ours = {kind: 'continental', length: VEHICLES.continental.length, paint: [12, 12, 15]};
  // What's drawn just in front of each slot, at its depth.
  var SLOT_EXTRAS = {
    mid: function (time, seconds, now) {
      drawPlumes(time);
      drawFallout(time);
      drawSearchlights(time);
      drawRises(now);
      drawBombs(time);
      drawAdverts(time);
    },
    band: function (time, seconds) {
      // The sea's glitter, under the headlands.
      glitter(RT - 66, RT - 2, biomeAt(odometer * 0.1 + sunAt.x, 0.1) === 'coast' ? 1 : 0, time, 31);
      drawImpacts(time, seconds);
    },
    hills: function (time) {
      drawMills(time, 0.16, 0.6, 60, 71);
      drawGuns(time);
    },
    near: function (time, seconds) {
      drawMills(time, 0.25, 1, 95, 83);
      drawCarts(time);
      if (sharp) {
        drawGlider(seconds);
        drawBlazes(time);
      }
    },
    nearer: function (time, seconds) {
      drawHolos(time);
      drawEmbers(time);
      if (flow.ultra) {
        drawTrain(seconds);
      }
    },
  };
  // The sky's tint follows the biome we're in, remade at most twice a second while it shifts.
  function easeTint(seconds) {
    var want = TINTS[biomeAt(odometer + cols * 0.5, 1)];
    if (want.some(function (c, i) { return Math.abs(tint[i] - c) > 0.5; })) {
      tint = tint.map(function (c, i) { return c + (want[i] - c) * Math.min(1, seconds * 0.15); });
      if ((skyDue -= seconds) <= 0) {
        skyDue = 0.5;
        makeSky();
      }
    }
  }
  // Glitching, the scenery sticks a moment now and then while the road runs on.
  function holdScenery(time, seconds) {
    if (!glitch) {
      return;
    }
    if (glitch.hold === null && gl.g > 0.25 && Math.random() < seconds * gl.g * 1.2) {
      glitch.hold = odometer;
      glitch.holdUntil = time + 120 + Math.random() * 260;
    }
    if (glitch.hold !== null && time > glitch.holdUntil) {
      glitch.hold = null;
    }
    if (glitch.hold !== null) {
      odometer = glitch.hold;
    }
  }
  function drawSkyLayers(time, seconds) {
    drawClouds(time);
    drawPlane(seconds, time);
    drawCraft(seconds, time);
    drawHellSky(seconds);
    drawSpirits(time, seconds);
  }
  function drawScenery(time, seconds, now) {
    // How many pictures may be remade for the light this frame: on the TV one every third
    // frame, so dusk doesn't stutter.
    remakes = sharp ? 3 : ++framed % 3 === 0 ? 1 : 0;
    var fresh = {budget: Math.min(1, remakes)};
    SLOTS.forEach(function (slot, j) {
      if (!layerOn(j + 1)) {
        return;
      }
      drawSlot(slot, fresh, now, time);
      if (SLOT_EXTRAS[slot.key]) {
        SLOT_EXTRAS[slot.key](time, seconds, now);
      }
    });
  }
  // Where our car is: ahead of its place as it speeds up, behind as it slows (never a zoom:
  // rescaled every frame, the scenery's fine detail shimmered); out to the far lane to
  // overtake a slower one ahead in ours, and back once clear. One that's faster than us
  // goes round us instead (`passUs`).
  function placeOurCar(seconds) {
    var carX = cols * 0.26 + Math.max(-14, Math.min(24, lead));
    var ground = RT + 39;
    lane = towards(lane, other && other.ourLane && !other.passing && inOurWay(carX) ? 1 : 0, seconds);
    passUs(carX, seconds);
    ground -= outBy(lane);
    ours.x = carX;
    ours.ground = ground;
    ours.wheel = wheel;
    ride(ours, velocity, seconds);
    if (other) {
      ride(other, other.speed, seconds);
    }
  }
  // A slower one ahead; once alongside, till it's clear, whichever's the faster.
  function inOurWay(carX) {
    var nose = carX + ours.length;
    if (other.x < nose + 24 && lane > 0.1) {
      return other.x + other.length > carX - 24;
    }
    return other.speed < velocity && other.x > nose && other.x < nose + 40 + velocity * 0.35;
  }
  // One coming up behind in our lane, as it can once we've slowed: out to the far lane,
  // past, and back in once clear.
  function passUs(carX, seconds) {
    if (!other || !other.ourLane) {
      return;
    }
    var tail = carX - (other.x + other.length), room = other.x - (carX + ours.length);
    if (!other.passing && lane < 0.1 && other.speed > velocity && tail > 0 && tail < 60 + (other.speed - velocity) * 1.5) {
      other.passing = true;
    } else if (other.passing && (room > 30 || (tail > 30 && other.speed < velocity))) {
      other.passing = false;
    }
    other.lane = towards(other.lane, other.passing ? 1 : 0, seconds);
    other.ground = LANES[0] - outBy(other.lane);
  }
  function towards(at, want, seconds) {
    return at + Math.max(-seconds / 1.1, Math.min(seconds / 1.1, want - at));
  }
  // How far out toward the far lane, eased.
  function outBy(share) {
    return (LANES[0] - LANES[1]) * share * share * (3 - 2 * share);
  }
  // The nearer lane is drawn last. Glitching, the other vehicle blinks out.
  function drawTraffic(time, seconds, pushing) {
    var behind = other && other.ground > ours.ground;
    var shown = other && !(gl.g > 0.4 && seeded(Math.floor(frameTime / 333) * 7919 + 77)() < gl.g * 0.4);
    if (shown && !behind) {
      drawVehicle(other, ctx);
      nightVehicle(other);
    }
    drawExhaust(seconds, ours.x, ours.ground, pushing);
    weatherOurCar(seconds, odometer + cols * 0.5);
    drawVehicle(ours, ctx);
    drawWear(ours);
    drawWiper(ours, time);
    nightVehicle(ours);
    if (shown && behind) {
      drawVehicle(other, ctx);
      nightVehicle(other);
    }
    return shown;
  }
  // A car closing on us is heard going by, once, from a few seconds off.
  function hearPass(gap) {
    if (!gap || other.heard) {
      return;
    }
    var soon = -gap / (other.speed - velocity);
    if (soon > 0 && soon < 4) {
      other.heard = true;
      flow.sound.pass(soon, gap > 0 ? 1 : -1);
    }
  }
  // What's heard (flow-sound.js).
  function soundOf(shown, throttle) {
    var middle = ours.x + ours.length / 2, gap = shown ? other.x + other.length / 2 - middle : 0, wind = flow.weather && flow.weather.wind;
    hearPass(gap);
    flow.sound.drive({
      speed: velocity / TOP,
      tunnel: inTunnel(ours.x, ours.x + ours.length),
      wind: Math.min(1, (wind || 0) / 40),
      rain: precipNow && precipNow.kind === 'rain' ? Math.min(1, precipNow.amount || 0.5) : 0,
      passing: shown ? Math.max(0, 1 - Math.abs(gap) / 160) : 0,
      passAt: gap / 160,
      passSpeed: shown ? (other.speed - velocity) / TOP : 0,
      rpm: box.rpm, throttle: throttle, shift: box.shift,
      war: worldOn ? deepIn(odometer + cols * 0.5, 'warzone') : 0,
      lava: worldOn ? hell : 0,
      glitch: gl.g,
      world: gl.blank ? Math.max(0, gl.p) : 1,
      flash: gl.flash,
    });
  }
  // The flashes go over the speedometer too: the whole screen.
  function drawOverlays(seconds, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawGlitch(seconds);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawSpeedo();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawFlash(time);
    drawSmallFlash(seconds);
    drawWhiteout();
  }
  // flowView (flow.js) draws nothing else for this theme: each frame is all of it.
  function highwayFrame(time, seconds, calm) {
    if (!sky) {
      return;
    }
    highwayScene.ultra = Boolean(flow.ultra);
    var driving = drive(seconds, calm);
    watchBlast(time);
    watchGlitch(time);
    precipNow = rainNow();
    adLights = [];
    wetRoad(seconds);
    easeTint(seconds);
    var now = Date.now();
    if (now - swept > KEEP / 3) {
      swept = now;
      sweepTiles(now);
    }
    lead += ((driving.target - velocity) / TOP * 40 - lead) * Math.min(1, seconds * 1.2);
    var scene = {a: k, e: 0, f: 0};
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    var skyOn = layerOn(0), real = odometer;
    if (gl.blank) {
      ctx.fillStyle = css(voidColour());
      ctx.fillRect(0, 0, flow.width, flow.height);
    }
    if (skyOn) {
      ctx.drawImage(sky, 0, 0, cols * skyScale, RT * skyScale, 0, 0, flow.width, RT * k);
    }
    ctx.setTransform(scene.a, 0, 0, scene.a, scene.e, scene.f);
    holdScenery(time, seconds);
    if (skyOn) {
      drawSkyLayers(time, seconds);
    }
    drawScenery(time, seconds, now);
    odometer = real;
    drawWire();
    worldOn = layerOn(8);
    if (sharp && worldOn) {
      drawBirds(seconds, time);
    }
    if (skyOn) {
      drawLightning(seconds);
    }
    drawRoad(worldOn);
    moveOther(seconds);
    placeOurCar(seconds);
    lit = [ours].concat(other ? [other] : []);
    lit.forEach(function (v) { v.top = v.ground - VEHICLES[v.kind].height - 1; });
    // Low, at the road's near edge: lit as the road is.
    if (worldOn) {
      drawFore();
    }
    nightBegin(scene);
    nightRoad();
    wetNeon();
    if (worldOn) {
      glitter(RT + 4, RT + 42, 0.7 * roadWet, time, 37);
    }
    drawFires(time);
    var shown = drawTraffic(time, seconds, driving.pushing);
    if (flow.sound) {
      soundOf(shown, driving.throttle);
    }
    box.shift = null;
    if (worldOn) {
      overpasses(odometer, true);
    }
    nightFront();
    streaks();
    if (skyOn) {
      drawWeather(seconds);
    }
    drawOverlays(seconds, time);
    ctx.restore();
  }
  var highwayScene = {
    turn: 0,
    lift: null,
    ultra: false,
    fit: function () {
      k = flow.height / ROWS;
      cols = flow.width / k;
      RT = ROWS - 62;
      tiles = {};
      sprites = {};
      bodies = {};
      grain = null;
      flow.skyCanvas.width = 1;
      flow.skyCanvas.height = 1;
      flow.sky();
    },
    sky: function (unused, hour, warm) {
      var was = [light.night, light.warm];
      light = {night: flow.starry, warm: warm, hour: hour};
      if (Math.abs(was[0] - light.night) > 0.03 || Math.abs(was[1] - light.warm) > 0.05 || !sky) {
        version += 1;
      }
      makeSky();
    },
    changed: function () {},
    route: function () { return null; },
    // For the frame report: the biome at the middle of the screen.
    where: function () { return biomeAt(odometer + cols * 0.5, 1); },
    frame: highwayFrame,
    ground: function () {},
    drive: function () { return []; },
    over: function () {},
  };
  return highwayScene;
};
