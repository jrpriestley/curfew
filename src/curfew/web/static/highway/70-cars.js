  // ------------------------------------------------------------------ the cars --
  // Side on, as the big American cars of the seventies and eighties were: long hoods,
  // chrome, whitewalls with turbine hubcaps. Ours is a black 1968 Lincoln Continental.
  // Each draws with x at its back and its wheels on `ground`, in real proportions (about
  // 13.5 units a metre), and returns its outline (for the night's shade) and its wheels.
  var COLOURS = [[104, 122, 52], [206, 150, 40], [188, 84, 30], [116, 160, 204], [112, 70, 40], [230, 218, 180], [40, 84, 60], [150, 36, 40], [128, 20, 34]];
  // A closed outline from steps: ['M', x, y] to move, ['L', x, y] for a line, ['Q', cx, cy,
  // x, y] for a curve.
  function traced(steps) {
    var path = new Path2D();
    steps.forEach(function (s) {
      if (s[0] === 'M') {
        path.moveTo(s[1], s[2]);
      } else if (s[0] === 'L') {
        path.lineTo(s[1], s[2]);
      } else {
        path.quadraticCurveTo(s[1], s[2], s[3], s[4]);
      }
    });
    path.closePath();
    return path;
  }
  // Paint shaded as a gloss: a bright shoulder, the sky's reflection, darker below.
  function gloss(p, y0, y1, paint) {
    return vertical(p, y0, y1, [
      [0, css(blend(paint, [255, 255, 255], 0.25))],
      [0.28, css(blend(paint, [255, 255, 255], 0.55))],
      [0.36, css(paint)],
      [0.55, css(blend(paint, [200, 220, 255], 0.12))],
      [0.72, css(blend(paint, [0, 0, 0], 0.22))],
      [1, css(blend(paint, [0, 0, 0], 0.55))],
    ]);
  }
  function chrome(p, y0, y1) {
    return vertical(p, y0, y1, [[0, '#f8f8fc'], [0.45, '#9aa0ac'], [0.55, '#e8eaf0'], [1, '#6a707c']]);
  }
  // Glass, with a sheen slanting across it.
  function glassOf(p, path, y0, y1) {
    p.fillStyle = vertical(p, y0, y1, [[0, '#b0cce8'], [1, '#22344c']]);
    p.fill(path);
    p.save();
    p.clip(path);
    p.fillStyle = 'rgba(255, 255, 255, 0.22)';
    p.beginPath();
    p.moveTo(0, y1 + 2);
    p.lineTo(400, y0 - 400);
    p.lineTo(404, y0 - 400);
    p.lineTo(4, y1 + 2);
    p.fill();
    p.restore();
  }
  function bumper(p, x, y, w, h) {
    p.fillStyle = chrome(p, y, y + h);
    p.beginPath();
    p.moveTo(x + 0.8, y);
    p.lineTo(x + w - 0.8, y);
    p.quadraticCurveTo(x + w, y, x + w, y + h / 2);
    p.quadraticCurveTo(x + w, y + h, x + w - 0.8, y + h);
    p.lineTo(x + 0.8, y + h);
    p.quadraticCurveTo(x, y + h, x, y + h / 2);
    p.quadraticCurveTo(x, y, x + 0.8, y);
    p.fill();
  }
  function trim(p, x0, x1, y) {
    p.strokeStyle = 'rgba(240, 242, 248, 0.85)';
    p.lineWidth = 0.45;
    p.beginPath();
    p.moveTo(x0, y);
    p.lineTo(x1, y);
    p.stroke();
  }
  // A door's front and back seams.
  function door(p, x0, x1, top, bottom) {
    p.strokeStyle = 'rgba(0, 0, 0, 0.38)';
    p.lineWidth = 0.32;
    p.beginPath();
    p.moveTo(x0, top);
    p.lineTo(x0, bottom);
    p.moveTo(x1, top);
    p.lineTo(x1, bottom);
    p.stroke();
  }
  function handle(p, x, y) {
    rect(p, x, y, 1.8, 0.55, '#e4e6ec');
    rect(p, x, y + 0.55, 1.8, 0.25, 'rgba(0, 0, 0, 0.3)');
  }
  // Wheel arches, above the axle only: the tyre fills below.
  function arches(p, at, cy, r) {
    if (held) {
      held.arched = true;
    }
    arched = true;
    p.fillStyle = '#0c0c10';
    at.forEach(function (wx) {
      p.beginPath();
      p.arc(wx, cy, r + 1, Math.PI, 0);
      p.closePath();
      p.fill();
    });
  }
  // The rocker along the bottom, in shadow.
  function rocker(p, x, y, w) {
    p.fillStyle = 'rgba(16, 16, 20, 0.5)';
    p.fillRect(x, y, w, 1.4);
  }
  function wheelsOf(at, cy, r) {
    return at.map(function (wx) { return [wx, cy, r]; });
  }

  // Ours, a 1968 Lincoln Continental: long and slab-sided, its fenders' edge a straight line
  // of chrome with a slight kick up over the rear wheel, a low formal roof on a thick rear
  // pillar, the rear doors hinged at the back so each pair of handles meets in the middle.
  var CONTINENTAL_WHEELS = [21.2, 64.2];
  var CONTINENTAL_BODY = traced([['M', 1.4, 17], ['L', 0.8, 14.6], ['L', 0.5, 9.2], ['Q', 0.6, 8.3, 1.8, 8.2], ['L', 15.6, 7.7],
    ['Q', 18.2, 7.5, 20.4, 7], ['L', 24.8, 2.9], ['Q', 25.8, 2, 27.8, 1.9], ['L', 43.4, 1.8], ['Q', 45.4, 1.8, 46.6, 2.7],
    ['L', 52.4, 7.9], ['L', 73.4, 8.4], ['Q', 75.6, 8.5, 75.8, 9.4], ['L', 75.4, 14.6], ['Q', 75.3, 16.8, 74, 17]]);
  var CONTINENTAL_BACK = traced([['M', 27.6, 7.3], ['L', 29, 3.6], ['L', 36.6, 3.4], ['L', 36.6, 7.4]]);
  var CONTINENTAL_FRONT = traced([['M', 37.8, 7.4], ['L', 37.8, 3.4], ['L', 43.9, 3.3], ['Q', 45, 3.3, 45.7, 3.9], ['L', 49.8, 7.5]]);
  // Black shows its gloss as the sky in its shoulder and a dark mirror below, not as grey.
  function blackGloss(p, y0, y1, paint) {
    return vertical(p, y0, y1, [
      [0, css(blend(paint, [255, 255, 255], 0.2))],
      [0.34, css(paint)],
      [0.43, css(blend(paint, [190, 210, 240], 0.5))],
      [0.52, css(blend(paint, [190, 210, 240], 0.26))],
      [0.6, css(blend(paint, [190, 210, 240], 0.08))],
      [0.7, css(paint)],
      [0.84, css(blend(paint, [190, 210, 240], 0.1))],
      [1, css(blend(paint, [0, 0, 0], 0.6))],
    ]);
  }
  // Dark seams don't show on black: each has its edge catching the light.
  function blackSeams(p, at) {
    at.forEach(function (seam) {
      rect(p, seam, 8.6, 0.3, 6.9, '#000000');
      rect(p, seam + 0.3, 8.6, 0.2, 6.9, 'rgba(190, 210, 240, 0.28)');
    });
  }
  function continental(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 38, ground, 37);
    p.save();
    p.translate(x, y);
    p.fillStyle = blackGloss(p, 1.8, 17, paint);
    p.fill(CONTINENTAL_BODY);
    glassOf(p, CONTINENTAL_BACK, 3.4, 7.4);
    glassOf(p, CONTINENTAL_FRONT, 3.3, 7.5);
    chromeEdges(p);
    blackSeams(p, [26.4, 37.2, 51.4]);
    handle(p, 34.6, 9.5);
    handle(p, 38, 9.5);
    rocker(p, 1.8, 15.6, 72.6);
    // The rocker's bright molding, between the wheels.
    rect(p, 27, 15.5, 31.6, 0.9, chrome(p, 15.5, 16.4));
    arches(p, CONTINENTAL_WHEELS, 16, 4.6);
    bumper(p, -0.4, 12.6, 4.2, 2.6);
    bumper(p, 72.4, 12.8, 4, 2.6);
    // Lights: the tail's and the side markers, the turn signal in the fender's front edge.
    rect(p, 0.5, 9.4, 1, 2.9, '#c81818');
    rect(p, 5, 11.6, 1.6, 0.6, '#b01818');
    rect(p, 69.4, 11.6, 1.6, 0.6, '#f0a020');
    rect(p, 74.6, 9.4, 0.9, 2.8, chrome(p, 9.4, 12.2));
    rect(p, 75.2, 9.8, 0.6, 1.8, '#f4f0dc');
    // The hood's star.
    rect(p, 73.2, 7.3, 0.35, 1.2, '#e4e6ec');
    p.restore();
    wheels(p, x, y, CONTINENTAL_WHEELS, 16, 4.6, turn);
    return {path: CONTINENTAL_BODY, x: x, y: y, wheels: wheelsOf(CONTINENTAL_WHEELS, 16, 4.6)};
  }
  // The chrome along the fenders' edge, the roof's drip rail (a black roof is lost against
  // the road without it) and round the windows.
  function chromeEdges(p) {
    p.strokeStyle = 'rgba(240, 242, 248, 0.9)';
    p.lineWidth = 0.5;
    p.beginPath();
    p.moveTo(0.8, 8.5);
    p.lineTo(13, 8.1);
    p.quadraticCurveTo(17, 7.9, 20, 7.6);
    p.quadraticCurveTo(22.4, 7.4, 25, 7.9);
    p.quadraticCurveTo(27, 8.2, 30, 8.1);
    p.lineTo(52, 8.2);
    p.lineTo(75, 8.8);
    p.stroke();
    p.lineWidth = 0.22;
    p.beginPath();
    p.moveTo(23.4, 6.6);
    p.lineTo(26, 3.4);
    p.quadraticCurveTo(26.8, 2.6, 28, 2.5);
    p.lineTo(43.6, 2.4);
    p.quadraticCurveTo(45.2, 2.4, 46.2, 3.2);
    p.lineTo(51.4, 7.7);
    p.stroke();
    p.stroke(CONTINENTAL_BACK);
    p.stroke(CONTINENTAL_FRONT);
  }
  // A coupé like the eighties' Monte Carlo: a long hood, a formal roof with a landau vinyl
  // top over its back, a small opera window behind its one long door, a short deck.
  var MONTE_BODY = traced([['M', 1.2, 17.4], ['L', 0.4, 11.4], ['Q', 0.5, 8.9, 2.2, 8.5], ['L', 15.2, 7.8],
    ['Q', 17.6, 4.6, 19.6, 2.6], ['Q', 20.6, 2, 22.5, 2], ['L', 37.5, 2], ['Q', 39.2, 2.1, 40.4, 3], ['L', 45.4, 7.9],
    ['L', 65.5, 8.7], ['Q', 68.4, 9, 68.8, 10.4], ['L', 69, 15.2], ['Q', 69, 17.2, 67.6, 17.4]]);
  var MONTE_LANDAU = traced([['M', 15.4, 7.8], ['Q', 17.6, 4.6, 19.6, 2.6], ['Q', 20.6, 2, 22.5, 2], ['L', 31, 2],
    ['L', 31, 3.3], ['L', 25.4, 3.4], ['L', 22.4, 7.8]]);
  var MONTE_OPERA = traced([['M', 23.6, 7.5], ['L', 25.9, 4.1], ['L', 29.6, 4], ['L', 29.6, 7.5]]);
  var MONTE_SIDE = traced([['M', 31.6, 7.6], ['L', 31.6, 3.5], ['L', 38.5, 3.4], ['Q', 39.4, 3.5, 40, 4], ['L', 43.5, 7.6]]);
  function monte(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 35, ground, 34);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2, 17.5, paint);
    p.fill(MONTE_BODY);
    p.fillStyle = vertical(p, 2, 8, [[0, '#3c3638'], [1, '#1a1618']]);
    p.fill(MONTE_LANDAU);
    // The vinyl's edge, in chrome.
    rect(p, 30.6, 2.1, 0.5, 1.2, '#d8dae0');
    glassOf(p, MONTE_OPERA, 4, 7.5);
    glassOf(p, MONTE_SIDE, 3.4, 7.6);
    door(p, 30.9, 45.2, 8.1, 16.8);
    handle(p, 32.2, 9.3);
    trim(p, 2.2, 45, 8.05);
    // The side molding.
    rect(p, 1, 11.9, 67.4, 1, '#1c1c22');
    trim(p, 1, 68.4, 11.9);
    rocker(p, 1.4, 16, 66.4);
    arches(p, [16.5, 54], 16, 4.6);
    bumper(p, -0.6, 12, 3.2, 2.6);
    bumper(p, 66.6, 12.2, 3.2, 2.8);
    rect(p, 0.1, 9.2, 1.3, 2.6, '#c81818');
    rect(p, 66, 10.8, 1.5, 0.9, '#f0a020');
    rect(p, 68.4, 10.4, 0.8, 1.4, '#f4f0dc');
    rect(p, 68.6, 11.8, 0.7, 0.5, '#e4e6ec');
    p.restore();
    wheels(p, x, y, [16.5, 54], 16, 4.6, turn);
    return {path: MONTE_BODY, x: x, y: y, wheels: wheelsOf([16.5, 54], 16, 4.6)};
  }
  // A four-door sedan: a longer roof, two doors a side, a short deck.
  var SEDAN_BODY = traced([['M', 1.2, 17.4], ['L', 0.4, 11.4], ['Q', 0.5, 8.9, 2.2, 8.5], ['L', 13.8, 7.9],
    ['Q', 16.4, 4.8, 18.6, 2.6], ['Q', 19.6, 2, 21.5, 2], ['L', 40.4, 2], ['Q', 42, 2.1, 43.2, 3], ['L', 47.6, 7.9],
    ['L', 66.6, 8.6], ['Q', 69.5, 8.9, 69.8, 10.3], ['L', 70, 15.2], ['Q', 70, 17.2, 68.6, 17.4]]);
  var SEDAN_BACK = traced([['M', 17.2, 7.6], ['L', 20, 3.6], ['L', 31.2, 3.5], ['L', 31.2, 7.6]]);
  var SEDAN_FRONT = traced([['M', 32.4, 7.6], ['L', 32.4, 3.5], ['L', 41.2, 3.4], ['Q', 42, 3.5, 42.6, 4], ['L', 45.8, 7.6]]);
  // `rim`: the raider's steel wheels.
  function sedan(p, x, ground, paint, turn, rim) {
    var y = ground - 20.6;
    shadow(p, x + 35.5, ground, 35);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2, 17.5, paint);
    p.fill(SEDAN_BODY);
    glassOf(p, SEDAN_BACK, 3.5, 7.6);
    glassOf(p, SEDAN_FRONT, 3.4, 7.6);
    door(p, 18.6, 31.8, 8.1, 16.8);
    door(p, 31.8, 47.4, 8.1, 16.8);
    handle(p, 19.6, 9.3);
    handle(p, 33, 9.3);
    trim(p, 2.2, 47, 8.05);
    rect(p, 1, 11.9, 68.4, 1, '#1c1c22');
    trim(p, 1, 69.4, 11.9);
    rocker(p, 1.4, 16, 67.4);
    arches(p, [15, 55.5], 16, 4.6);
    bumper(p, -0.6, 12, 3.2, 2.6);
    bumper(p, 67.6, 12.2, 3.2, 2.8);
    rect(p, 0.1, 9.2, 1.3, 2.6, '#c81818');
    rect(p, 67, 10.8, 1.5, 0.9, '#f0a020');
    rect(p, 69.4, 10.3, 0.8, 1.4, '#f4f0dc');
    p.restore();
    wheels(p, x, y, [15, 55.5], 16, 4.6, turn, rim);
    return {path: SEDAN_BODY, x: x, y: y, wheels: wheelsOf([15, 55.5], 16, 4.6)};
  }
  // A 1978 Chevrolet Nova sedan, as Irving drives in Severance: a long hood, a light roof
  // falling away fast at the back, little chrome, small hubcaps.
  var NOVA_WHEELS = [16.8, 54.9];
  var NOVA_BODY = traced([['M', 1.2, 17.2], ['L', 0.5, 11.6], ['Q', 0.4, 8.9, 2, 8.6], ['L', 10.6, 8.1],
    ['L', 18.2, 2.9], ['Q', 19.4, 2.2, 21, 2.2], ['L', 35.6, 2.2], ['Q', 37.2, 2.3, 38.2, 3.1], ['L', 44, 7.9],
    ['L', 64.4, 8.5], ['Q', 66.8, 8.7, 67, 10], ['L', 66.8, 15.2], ['Q', 66.8, 17, 65.6, 17.2]]);
  var NOVA_VENT = traced([['M', 14.2, 7.6], ['L', 18.2, 4.4], ['L', 18.2, 7.6]]);
  var NOVA_BACK = traced([['M', 18.8, 7.6], ['L', 18.8, 3.9], ['Q', 19.4, 3.5, 20.4, 3.4], ['L', 27, 3.4], ['L', 27, 7.6]]);
  var NOVA_FRONT = traced([['M', 27.8, 7.6], ['L', 27.8, 3.4], ['L', 36, 3.4], ['Q', 37, 3.5, 37.6, 4], ['L', 41.9, 7.6]]);
  function nova(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 34, ground, 33);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2.2, 17.2, paint);
    p.fill(NOVA_BODY);
    glassOf(p, NOVA_VENT, 4.4, 7.6);
    glassOf(p, NOVA_BACK, 3.4, 7.6);
    glassOf(p, NOVA_FRONT, 3.4, 7.6);
    door(p, 18, 27.4, 8.1, 16.4);
    door(p, 27.4, 43, 8.1, 16.4);
    handle(p, 19, 9.4);
    handle(p, 28.6, 9.4);
    trim(p, 12, 43.6, 8);
    rect(p, 1, 12.7, 65.4, 0.4, '#d8dae0');
    rocker(p, 1.4, 15.8, 64.6);
    arches(p, NOVA_WHEELS, 16, 4.6);
    bumper(p, -0.6, 12.2, 3, 2.4);
    bumper(p, 64.6, 12.4, 3, 2.4);
    rect(p, 0.3, 9.4, 1.4, 2.2, '#c81818');
    rect(p, 63.4, 11, 1.6, 0.8, '#f0a020');
    rect(p, 66.3, 9.6, 0.8, 1.8, '#f4f0dc');
    p.restore();
    wheels(p, x, y, NOVA_WHEELS, 16, 4.6, turn, 'cap');
    return {path: NOVA_BODY, x: x, y: y, wheels: wheelsOf(NOVA_WHEELS, 16, 4.6)};
  }
  // A 1982 Volkswagen Rabbit, as Ms. Cobel drives in Severance: a small upright hatchback
  // on little wheels, four doors, a thick rear pillar, black bumpers and rubbing strip.
  var RABBIT_WHEELS = [10.6, 43];
  var RABBIT_BODY = traced([['M', 2, 17], ['L', 1.3, 13], ['L', 1.4, 9.4], ['Q', 1.5, 8.2, 2.2, 7.4], ['L', 7, 2.6],
    ['Q', 7.8, 1.8, 9.2, 1.7], ['L', 27, 1.6], ['Q', 28.4, 1.6, 29.3, 2.5], ['L', 35, 8], ['L', 49.6, 9],
    ['Q', 51.4, 9.2, 51.6, 10.2], ['L', 51.8, 15], ['Q', 51.8, 16.8, 50.6, 17]]);
  var RABBIT_BACK = traced([['M', 10.4, 7.6], ['L', 10.8, 3.3], ['L', 19.4, 3.1], ['L', 19.4, 7.6]]);
  var RABBIT_FRONT = traced([['M', 20.4, 7.6], ['L', 20.4, 3.1], ['L', 26.8, 3], ['Q', 27.8, 3, 28.4, 3.6], ['L', 32.6, 7.7]]);
  function rabbit(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 26.5, ground, 26);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 1.6, 17, paint);
    p.fill(RABBIT_BODY);
    glassOf(p, RABBIT_BACK, 3.1, 7.6);
    glassOf(p, RABBIT_FRONT, 3, 7.7);
    p.strokeStyle = '#1c1c20';
    p.lineWidth = 0.35;
    p.stroke(RABBIT_BACK);
    p.stroke(RABBIT_FRONT);
    door(p, 10.4, 19.9, 8, 11.4);
    door(p, 19.9, 33.8, 8, 16.2);
    rect(p, 11.2, 9.2, 2, 0.6, '#1c1c20');
    rect(p, 21.2, 9.2, 2, 0.6, '#1c1c20');
    rect(p, 1.5, 12.2, 49.8, 0.8, '#1c1c20');
    rocker(p, 2.2, 15.6, 48.8);
    arches(p, RABBIT_WHEELS, 16.5, 4.1);
    // The American bumpers: rubber, standing out on their rams, a bright strip along.
    rect(p, -0.4, 13.2, 4.4, 2, '#1c1c20');
    rect(p, -0.4, 13.8, 4.4, 0.4, '#b8bcc4');
    rect(p, 49.2, 13.2, 3.4, 2, '#1c1c20');
    rect(p, 49.2, 13.8, 3.4, 0.4, '#b8bcc4');
    rect(p, 1.3, 9.2, 2, 2.4, '#c81818');
    rect(p, 1.3, 10.6, 2, 0.5, '#f0a020');
    // Its lamps: the signal wrapped round the corner from the square headlight.
    rect(p, 49, 10, 1.6, 1.7, '#f0a020');
    rect(p, 50.8, 10, 0.9, 1.7, '#f4f0dc');
    p.restore();
    wheels(p, x, y, RABBIT_WHEELS, 16.5, 4.1, turn, 'cap');
    return {path: RABBIT_BODY, x: x, y: y, wheels: wheelsOf(RABBIT_WHEELS, 16.5, 4.1)};
  }
  // A black 1982 Ford LTD, as a government agency would drive: square-cut and upright, no
  // trim to speak of, plain steel wheels, a whip aerial on its deck.
  var LTD_WHEELS = [20.2, 59.6];
  var LTD_BODY = traced([['M', 1.4, 17.2], ['L', 0.7, 13], ['L', 0.6, 9], ['Q', 0.7, 8.3, 1.6, 8.2], ['L', 15.8, 7.9],
    ['L', 20.6, 2.8], ['Q', 21.4, 2, 23, 2], ['L', 41.6, 1.9], ['Q', 43.2, 1.9, 44, 2.7], ['L', 48.8, 7.9],
    ['L', 70.6, 8.3], ['Q', 71.6, 8.4, 71.7, 9.2], ['L', 71.8, 15.4], ['Q', 71.8, 17, 70.8, 17.2]]);
  var LTD_VENT = traced([['M', 20.4, 7.5], ['L', 22.6, 3.6], ['L', 24, 3.5], ['L', 24, 7.5]]);
  var LTD_BACK = traced([['M', 24.6, 7.5], ['L', 24.6, 3.4], ['L', 32.6, 3.3], ['L', 32.6, 7.5]]);
  var LTD_FRONT = traced([['M', 33.6, 7.5], ['L', 33.6, 3.3], ['L', 42, 3.2], ['Q', 42.8, 3.2, 43.3, 3.8], ['L', 46.6, 7.5]]);
  function ltd(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 36, ground, 35);
    p.save();
    p.translate(x, y);
    p.fillStyle = blackGloss(p, 1.9, 17.2, paint);
    p.fill(LTD_BODY);
    [LTD_VENT, LTD_BACK, LTD_FRONT].forEach(function (pane) {
      glassOf(p, pane, 3.2, 7.5);
      p.strokeStyle = 'rgba(220, 224, 232, 0.8)';
      p.lineWidth = 0.22;
      p.stroke(pane);
    });
    blackSeams(p, [22.6, 33.1, 47.8]);
    handle(p, 24, 9.5);
    handle(p, 34.4, 9.5);
    trim(p, 16.4, 48.4, 8);
    rect(p, 1, 12.8, 70.4, 0.5, '#c4c8d0');
    rocker(p, 1.8, 15.8, 69.4);
    arches(p, LTD_WHEELS, 16, 4.6);
    bumper(p, -0.5, 13, 3.4, 2.4);
    bumper(p, 69.4, 13, 3.4, 2.4);
    rect(p, 0.6, 9.2, 1.2, 3, '#c81818');
    rect(p, 69.2, 9.4, 1.3, 2.2, '#f0a020');
    rect(p, 70.9, 9.4, 0.9, 2.2, '#f4f0dc');
    rect(p, 7, 1.4, 0.2, 6.7, '#5a5e68');
    p.restore();
    wheels(p, x, y, LTD_WHEELS, 16, 4.6, turn, 'cap');
    return {path: LTD_BODY, x: x, y: y, wheels: wheelsOf(LTD_WHEELS, 16, 4.6)};
  }
  // A New York cab of the seventies, as in Taxi: a Checker Marathon, tall and round-shouldered,
  // its shape the fifties', yellow with a band of checks along its side and a lit sign on its
  // roof, bumpers like girders.
  var TAXI_WHEELS = [15.9, 57];
  var TAXI_BODY = traced([['M', 1.6, 18.4], ['L', 0.8, 15], ['Q', 0.3, 10.6, 2.6, 9.6], ['Q', 6, 8.2, 13.2, 8.3],
    ['L', 18.6, 3.4], ['Q', 20, 2, 22.6, 1.9], ['Q', 31, 1.4, 38.8, 1.9], ['Q', 41, 2, 42.2, 3.1], ['L', 47, 8.3],
    ['Q', 56, 7.9, 61.8, 8.8], ['Q', 67, 9.6, 67.6, 12], ['L', 68.2, 15], ['L', 67.6, 18.4]]);
  var TAXI_QUARTER = traced([['M', 16.6, 8], ['L', 19.9, 4.4], ['Q', 20.8, 3.5, 22, 3.4], ['L', 22.8, 3.4], ['L', 22.8, 8]]);
  var TAXI_BACK = traced([['M', 24.2, 8], ['L', 24.2, 3.3], ['L', 32.4, 3.2], ['L', 32.4, 8]]);
  var TAXI_FRONT = traced([['M', 33.8, 8], ['L', 33.8, 3.2], ['L', 39.8, 3.3], ['Q', 40.9, 3.4, 41.6, 4.1], ['L', 45.2, 8]]);
  var CHECK = 1.15;
  function taxi(p, x, ground, paint, turn) {
    var y = ground - 22;
    shadow(p, x + 34.5, ground, 33);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 1.6, 18.4, paint);
    p.fill(TAXI_BODY);
    p.save();
    p.clip(TAXI_BODY);
    for (var c = 0; c * CHECK < 66; c += 1) {
      rect(p, 1.4 + c * CHECK, 9.5 + (c % 2) * CHECK, CHECK, CHECK, '#16140f');
    }
    p.restore();
    [TAXI_QUARTER, TAXI_BACK, TAXI_FRONT].forEach(function (pane) {
      glassOf(p, pane, 3.2, 8);
      p.strokeStyle = 'rgba(232, 234, 240, 0.8)';
      p.lineWidth = 0.28;
      p.stroke(pane);
    });
    rect(p, 40.3, 3.4, 0.35, 4.6, '#c4c8d0');
    door(p, 23.4, 33.1, 8.2, 16.6);
    door(p, 33.1, 46.4, 8.2, 16.6);
    handle(p, 24.6, 12.3);
    handle(p, 34.4, 12.3);
    text(p, 'TAXI', 39.4, 15.6, 2.5, '#16140f');
    // The fenders' bulge over each wheel.
    p.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    p.lineWidth = 0.4;
    TAXI_WHEELS.forEach(function (wx) {
      p.beginPath();
      p.arc(wx, 17.2, 7.2, Math.PI * 1.08, -Math.PI * 0.08);
      p.stroke();
    });
    trim(p, 9, 46.6, 8.6);
    rocker(p, 2, 17, 65.4);
    arches(p, TAXI_WHEELS, 17.2, 4.8);
    bumper(p, -1.2, 14.6, 4.6, 2.8);
    bumper(p, 65.6, 14.6, 4.6, 2.8);
    rect(p, 0.4, 13.4, 1.1, 3.6, '#d4d8e0');
    rect(p, 67.8, 13.4, 1.1, 3.6, '#d4d8e0');
    rect(p, 0.7, 10.6, 1.3, 2.6, '#c81818');
    circle(p, 66.2, 11.4, 1.5, '#b4b8c2');
    circle(p, 66.5, 11.4, 1.1, '#f4f0dc');
    rect(p, 66, 13.2, 1.3, 0.9, '#f0a020');
    rect(p, 28.6, 1, 8.8, 0.8, '#3a3830');
    p.fillStyle = vertical(p, -1.8, 1.2, [[0, '#fff6d0'], [1, '#ffd24a']]);
    p.fillRect(29.2, -1.8, 7.6, 2.9);
    text(p, 'TAXI', 33, 0.6, 2.5, '#2a2008');
    p.restore();
    wheels(p, x, y, TAXI_WHEELS, 17.2, 4.8, turn, 'cap');
    return {path: TAXI_BODY, x: x, y: y, wheels: wheelsOf(TAXI_WHEELS, 17.2, 4.8)};
  }
  // A DMC-12 as in Back to the Future Part II: a low steel wedge, louvres down its back, a
  // gullwing door, and the time machine's works: vents rising off its tail, the reactor
  // between them, cables along its side. On its wheels on an everyday road; over the future's
  // it flies, its wheels folded flat beneath it (`flyingDmc`).
  var DMC_WHEELS = [13, 45.8], DMC_FLUX = [120, 200, 255];
  var DMC_BODY = traced([['M', 1.8, 17], ['L', 1, 14.6], ['L', 0.9, 12.4], ['L', 1.9, 9.5], ['L', 3.2, 8.9], ['L', 6.4, 8.8], ['L', 20, 5.6],
    ['Q', 21.6, 5.1, 23.4, 5.05], ['L', 27.2, 5.1], ['Q', 28.6, 5.2, 29.8, 5.7], ['L', 38.4, 9.4], ['L', 53.4, 11.4],
    ['Q', 56.2, 11.8, 56.9, 12.7], ['L', 57.5, 14.4], ['L', 56.8, 17]]);
  var DMC_QUARTER = traced([['M', 13.2, 9.1], ['L', 18.9, 6.7], ['L', 17.2, 9.2]]);
  var DMC_GLASS = traced([['M', 18.4, 9.2], ['L', 20.7, 6.4], ['Q', 21, 6.1, 21.6, 6.1], ['L', 27.8, 6.1], ['Q', 28.4, 6.1, 29, 6.4], ['L', 35.8, 9.5]]);
  var DMC_VENT = traced([['M', 10.4, 8], ['L', 3.4, 9.1], ['L', -0.2, 5.4], ['L', 6.2, 3.4]]);
  var DMC_FAR_VENT = traced([['M', 10.6, 6.8], ['L', 4, 7.6], ['L', 1.3, 4.9], ['L', 7.4, 2.9]]);
  var DMC_REACTOR = new Path2D();
  DMC_REACTOR.rect(11.2, 4.4, 2.5, 3.4);
  var DMC_OUTLINE = new Path2D();
  [DMC_BODY, DMC_FAR_VENT, DMC_VENT, DMC_REACTOR].forEach(function (part) { DMC_OUTLINE.addPath(part); });
  function dmcBody(p) {
    p.fillStyle = '#2c2f36';
    p.fill(DMC_FAR_VENT);
    dmcReactor(p);
    // Brushed steel: no gloss, a pale band along the shoulder.
    p.fillStyle = vertical(p, 5.05, 17, [[0, '#c8ccd2'], [0.3, '#b2b6bd'], [0.4, '#d6d9de'], [0.46, '#a6aab2'], [0.64, '#8f939b'], [0.66, '#aaaeb6'], [1, '#787c84']]);
    p.fill(DMC_BODY);
    p.save();
    p.clip(DMC_BODY);
    // The bumpers and the sill, grey; the black strip round it all.
    rect(p, 0, 12.5, 4.4, 5, '#4c4f56');
    rect(p, 53.2, 11.6, 5, 6, '#4c4f56');
    rect(p, 0, 15.7, 58, 1.4, '#2a2c32');
    rect(p, 0, 12.6, 58, 0.75, '#17181d');
    p.restore();
    dmcLouvres(p);
    [DMC_QUARTER, DMC_GLASS].forEach(function (pane) {
      p.fillStyle = vertical(p, 6.1, 9.5, [[0, '#6f8aa6'], [1, '#141c28']]);
      p.fill(pane);
      p.strokeStyle = '#15161b';
      p.lineWidth = 0.5;
      p.stroke(pane);
    });
    // The little window that opens, within the window.
    p.lineWidth = 0.28;
    p.strokeRect(22.2, 7.7, 7.2, 1.5);
    // The gullwing door, up into the roof.
    p.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    p.lineWidth = 0.3;
    p.beginPath();
    p.moveTo(20.4, 5.5);
    p.lineTo(17.8, 9.4);
    p.lineTo(18.6, 15.5);
    p.lineTo(36.6, 15.5);
    p.lineTo(37.4, 11.6);
    p.lineTo(36.4, 9.2);
    // The hood's and the nose's seams.
    segment(p, 38.6, 10, 53, 12);
    segment(p, 53.2, 11.5, 53.2, 15.6);
    p.stroke();
    rect(p, 19.4, 13.5, 2.2, 0.6, '#3a3d44');
    dmcWorks(p);
    rect(p, 0.9, 10.4, 0.9, 1.9, '#c81818');
    rect(p, 54, 13.6, 1.4, 0.7, '#f0a020');
    rect(p, 56, 12.9, 0.9, 0.9, '#f4f0dc');
  }
  // Black slats down its back window, stepping out of its outline.
  function dmcLouvres(p) {
    p.fillStyle = '#1b1c21';
    for (var slat = 0; slat < 6; slat += 1) {
      var lx = 8 + slat * 2, ly = 8.45 - slat * 0.47;
      p.beginPath();
      p.moveTo(lx, ly + 0.5);
      p.lineTo(lx + 0.2, ly - 0.35);
      p.lineTo(lx + 2, ly - 0.35);
      p.lineTo(lx + 2, ly + 0.1);
      p.fill();
    }
  }
  function dmcReactor(p) {
    p.fillStyle = vertical(p, 4.4, 7.8, [[0, '#f2f2ee'], [1, '#b8bac0']]);
    p.fill(DMC_REACTOR);
    rect(p, 11.5, 3.8, 1.9, 0.7, '#8c9098');
    rect(p, 11.2, 5.4, 2.5, 0.35, '#70747e');
    rect(p, 11.2, 6.6, 2.5, 0.35, '#70747e');
  }
  // The time machine's works: the vents on its tail, their grilles up and back, and the
  // cables along under its windows with the coils' light.
  function dmcWorks(p) {
    var side = p.createLinearGradient(3, 3.4, 6, 9);
    side.addColorStop(0, '#a4a8b0');
    side.addColorStop(1, '#5c6068');
    p.fillStyle = side;
    p.fill(DMC_VENT);
    p.strokeStyle = '#2c2f36';
    p.lineWidth = 0.35;
    p.stroke(DMC_VENT);
    p.lineWidth = 0.8;
    p.strokeStyle = '#17181d';
    p.beginPath();
    segment(p, -0.1, 5.5, 6.2, 3.5);
    p.stroke();
    p.lineWidth = 0.3;
    p.beginPath();
    for (var fin = 1; fin < 4; fin += 1) {
      segment(p, 0.2 + fin * 1.55, 5 - fin * 0.48, 3.6 + fin * 1.6, 8.7 - fin * 0.25);
    }
    p.stroke();
    p.strokeStyle = '#3a3e48';
    p.lineWidth = 0.45;
    p.beginPath();
    p.moveTo(6, 9.4);
    p.quadraticCurveTo(8, 10.5, 14, 10.5);
    p.lineTo(38, 10.6);
    p.lineTo(50, 12);
    p.stroke();
    for (var coil = 21; coil < 36; coil += 3.4) {
      rect(p, coil, 10.35, 1.2, 0.45, css(DMC_FLUX, 0.9));
    }
  }
  function dmc(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 29, ground, 28);
    p.save();
    p.translate(x, y);
    dmcBody(p);
    arches(p, DMC_WHEELS, 16.3, 4.3);
    p.restore();
    wheels(p, x, y, DMC_WHEELS, 16.3, 4.3, turn, 'turbine');
    return {path: DMC_OUTLINE, x: x, y: y, wheels: wheelsOf(DMC_WHEELS, 16.3, 4.3)};
  }
  var DMC_FLIES = 8;
  function flyingDmc(p, x, ground) {
    shadow(p, x + 29, ground, 24);
    var y = ground - 20.6 - DMC_FLIES - floating(p, x, ground, 58, DMC_FLUX);
    p.save();
    p.translate(x, y);
    p.globalCompositeOperation = 'lighter';
    var thrust = p.createLinearGradient(-9, 0, 2, 0), pulse = 0.5 + 0.12 * Math.sin(performance.now() / 70);
    thrust.addColorStop(0, css(DMC_FLUX, 0));
    thrust.addColorStop(1, css(DMC_FLUX, pulse));
    p.fillStyle = thrust;
    p.beginPath();
    p.moveTo(-9, 11);
    p.lineTo(0, 6.4);
    p.lineTo(3, 9.8);
    p.fill();
    p.globalCompositeOperation = 'source-over';
    dmcBody(p);
    DMC_WHEELS.forEach(function (wx) {
      ellipse(p, wx, 17.2, 4.6, 1.3, '#141418');
      ellipse(p, wx, 17.5, 3, 0.7, css(DMC_FLUX, 0.95));
    });
    p.globalCompositeOperation = 'lighter';
    DMC_WHEELS.forEach(function (wx) {
      var soft = p.createRadialGradient(wx, 18, 0, wx, 18, 8);
      soft.addColorStop(0, css(DMC_FLUX, 0.45));
      soft.addColorStop(1, css(DMC_FLUX, 0));
      p.fillStyle = soft;
      p.fillRect(wx - 8, 17.4, 16, 9);
    });
    p.restore();
    return {path: DMC_OUTLINE, x: x, y: y, wheels: []};
  }
  // A station wagon: its roof run back to the tailgate, wood down its sides, a roof rack.
  var WAGON_BODY = traced([['M', 1.2, 17.4], ['L', 0.5, 11], ['L', 0.8, 3.6], ['Q', 1, 2.3, 2.6, 2.2], ['L', 42.8, 2.2],
    ['Q', 44.4, 2.3, 45.6, 3.2], ['L', 50, 7.9], ['L', 70.6, 8.6], ['Q', 73.5, 8.9, 73.8, 10.3], ['L', 74, 15.2],
    ['Q', 74, 17.2, 72.6, 17.4]]);
  var WAGON_LONG = traced([['M', 2.6, 7.6], ['L', 2.6, 3.7], ['L', 20.6, 3.6], ['L', 20.6, 7.6]]);
  var WAGON_BACK = traced([['M', 21.8, 7.6], ['L', 21.8, 3.6], ['L', 33.2, 3.6], ['L', 33.2, 7.6]]);
  var WAGON_FRONT = traced([['M', 34.4, 7.6], ['L', 34.4, 3.6], ['L', 43.4, 3.5], ['Q', 44.2, 3.6, 44.8, 4.1], ['L', 48.2, 7.6]]);
  function wagon(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 37.5, ground, 37);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2.2, 17.5, paint);
    p.fill(WAGON_BODY);
    glassOf(p, WAGON_LONG, 3.6, 7.6);
    glassOf(p, WAGON_BACK, 3.6, 7.6);
    glassOf(p, WAGON_FRONT, 3.5, 7.6);
    woodPanel(p);
    door(p, 21.2, 33.8, 8.1, 16.8);
    door(p, 33.8, 49.6, 8.1, 16.8);
    handle(p, 22.2, 8.5);
    handle(p, 35, 8.5);
    trim(p, 2.4, 49, 8.05);
    // The roof rack.
    rect(p, 6, 1.2, 34, 0.7, '#c8ccd4');
    [8, 22, 37].forEach(function (r) { rect(p, r, 1.2, 0.6, 1.1, '#9aa0aa'); });
    rocker(p, 1.4, 16, 71.4);
    arches(p, [19, 59.5], 16, 4.6);
    bumper(p, -0.6, 12.4, 3.2, 2.6);
    bumper(p, 71.6, 12.2, 3.2, 2.8);
    rect(p, 0.1, 8.8, 1.2, 3, '#c81818');
    rect(p, 71, 10.8, 1.5, 0.9, '#f0a020');
    rect(p, 73.4, 10.3, 0.8, 1.4, '#f4f0dc');
    p.restore();
    wheels(p, x, y, [19, 59.5], 16, 4.6, turn);
    return {path: WAGON_BODY, x: x, y: y, wheels: wheelsOf([19, 59.5], 16, 4.6)};
  }
  function woodPanel(p) {
    p.fillStyle = vertical(p, 9.2, 14, [[0, '#a8743c'], [1, '#6e4520']]);
    p.fillRect(1.4, 9.2, 70, 4.8);
    p.strokeStyle = '#e6d2a6';
    p.lineWidth = 0.45;
    p.strokeRect(1.4, 9.2, 70, 4.8);
    p.strokeStyle = 'rgba(60, 34, 14, 0.3)';
    p.lineWidth = 0.22;
    p.beginPath();
    for (var g = 2.5; g < 71; g += 2.8) {
      p.moveTo(g, 9.4);
      p.lineTo(g + 1.2, 13.8);
    }
    p.stroke();
  }
  // A pickup: its bed, the cab with one door, the hood.
  var PICKUP_BODY = traced([['M', 1, 19.8], ['L', 0.6, 9.6], ['L', 26.2, 9.6], ['L', 26.6, 2.6], ['Q', 26.8, 1.8, 28, 1.8],
    ['L', 36, 1.8], ['Q', 37, 1.9, 37.6, 2.8], ['L', 40.8, 9.2], ['L', 63.6, 9.6], ['Q', 65.6, 9.8, 65.8, 11],
    ['L', 66, 18.2], ['Q', 66, 19.6, 64.6, 19.8]]);
  var PICKUP_SIDE = traced([['M', 28, 8.6], ['L', 28, 3.3], ['L', 35.8, 3.2], ['Q', 36.6, 3.3, 37, 3.9], ['L', 39.4, 8.6]]);
  function pickup(p, x, ground, paint, turn) {
    var y = ground - 23.6;
    shadow(p, x + 33, ground, 33);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 1.8, 19.8, paint);
    p.fill(PICKUP_BODY);
    // The bed's rail.
    rect(p, 0.8, 9.6, 25.2, 0.9, css(blend(paint, [0, 0, 0], 0.35)));
    glassOf(p, PICKUP_SIDE, 3.2, 8.6);
    door(p, 27.2, 40.4, 9.2, 18.6);
    handle(p, 28.4, 10.2);
    p.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    p.lineWidth = 0.32;
    p.beginPath();
    p.moveTo(26.4, 9.6);
    p.lineTo(26.4, 18.6);
    p.stroke();
    trim(p, 1, 64, 13.4);
    rocker(p, 1.2, 18.4, 63.6);
    arches(p, [14, 53], 18.6, 5);
    bumper(p, -0.6, 14.4, 3, 3);
    bumper(p, 64.6, 14, 3.2, 3.2);
    rect(p, 0.1, 10.8, 1.2, 3, '#c81818');
    rect(p, 63, 12, 1.5, 0.9, '#f0a020');
    rect(p, 65.4, 11, 0.8, 1.8, '#f4f0dc');
    p.restore();
    wheels(p, x, y, [14, 53], 18.6, 5, turn);
    return {path: PICKUP_BODY, x: x, y: y, wheels: wheelsOf([14, 53], 18.6, 5)};
  }
  // A semi at its true height: a short box trailer, a long-nosed tractor with its chrome
  // stack, tank and grille.
  var SEMI_TRACTOR = traced([['M', 98, 50], ['L', 98, 40.5], ['L', 113, 40.5], ['L', 113, 12], ['Q', 113, 10, 115, 10],
    ['L', 134, 10], ['Q', 136, 10, 136.6, 12.4], ['L', 138, 27], ['L', 164, 28], ['Q', 167, 28.4, 167, 31], ['L', 167, 50]]);
  var SEMI_CAB = traced([['M', 124, 13], ['L', 134.4, 13], ['L', 135.6, 24], ['L', 124, 24]]);
  var SEMI_OUTLINE = new Path2D();
  SEMI_OUTLINE.rect(0, 0, 115, 43);
  SEMI_OUTLINE.addPath(SEMI_TRACTOR);
  SEMI_OUTLINE.rect(137.6, 0, 2, 27);
  function semi(p, x, ground, paint, turn) {
    var y = ground - 55;
    shadow(p, x + 84, ground, 84);
    p.save();
    p.translate(x, y);
    p.fillStyle = vertical(p, 0, 37.5, [[0, '#f4f4ee'], [1, '#b0b0aa']]);
    p.fillRect(0, 0, 115, 37.5);
    p.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    p.lineWidth = 0.6;
    for (var r = 7; r < 115; r += 7) {
      p.beginPath();
      p.moveTo(r, 0.5);
      p.lineTo(r, 37);
      p.stroke();
    }
    rect(p, 6, 12, 103, 8, '#b8402c');
    rect(p, 6, 21, 103, 1.6, '#e8a030');
    rect(p, 0, 37.5, 115, 2.6, '#3c3c44');
    // Its running gear.
    rect(p, 2, 40, 34, 3, '#2c2c34');
    p.fillStyle = gloss(p, 10, 50, [30, 84, 150]);
    p.fill(SEMI_TRACTOR);
    glassOf(p, SEMI_CAB, 13, 24);
    door(p, 122.6, 137.4, 25, 44);
    handle(p, 124, 26);
    // The stack, the grille's edge, the tank.
    p.fillStyle = chrome(p, 0, 27);
    p.fillRect(137.6, 0, 2, 27);
    p.fillStyle = chrome(p, 28, 46);
    p.fillRect(165.2, 29, 2.6, 17);
    rect(p, 140, 40, 18, 5, chrome(p, 40, 45));
    trim(p, 138, 164, 33);
    bumper(p, 164, 45, 4.4, 3.4);
    rect(p, 0.2, 30, 1.4, 4, '#c81818');
    rect(p, 165.6, 31, 1, 2.4, '#f4f0dc');
    p.restore();
    wheels(p, x, y, [14, 29, 106, 120, 155], 48.2, 6.8, turn);
    return {path: SEMI_OUTLINE, x: x, y: y, wheels: wheelsOf([14, 29, 106, 120, 155], 48.2, 6.8)};
  }
  // A soft shadow under a vehicle. The lower the sun, the longer it is, thrown away from
  // the sun along the road; straight under at noon, under cloud and by night. While a body
  // is being cached (`held`) it's noted to be laid live instead, as the sun moves.
  function shadow(p, x, ground, half) {
    if (held) {
      held.shadows.push([x, ground, half]);
      return;
    }
    if (riding) {
      var ridden = riding;
      onRoad(p, function () {
        riding = null;
        shadow(p, x, ground, half);
        riding = ridden;
      });
      return;
    }
    var low = sunAt.up > 0 ? (1 - sunAt.up) * (1 - light.night) * (1 - 0.7 * flow.overcast) : 0;
    x -= sunAt.side * low * half * 0.45;
    half *= 1 + 0.5 * low;
    if (!sharp) {
      p.fillStyle = 'rgba(0, 0, 0, 0.35)';
      p.beginPath();
      p.ellipse(x, ground, half, 2, 0, 0, 6.2832);
      p.fill();
      return;
    }
    var soft = p.createRadialGradient(x, ground, 0, x, ground, half);
    soft.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    soft.addColorStop(1, 'rgba(0, 0, 0, 0)');
    p.save();
    p.translate(x, ground);
    p.scale(1, 0.09);
    p.translate(-x, -ground);
    p.fillStyle = soft;
    p.beginPath();
    p.arc(x, ground, half, 0, 6.2832);
    p.fill();
    p.restore();
  }
  // A dark arch, the tyre, its whitewall, a turbine hubcap turning. `rim`: 'steel', a plain
  // black tyre on a dull steel rim, its lugs turning; 'cap', on a silver one. While a body is being cached they're noted
  // to be drawn live instead, since they turn.
  function wheels(p, x, y, at, cy, r, turn, rim) {
    if (held) {
      held.wheels.push([x, y, at, cy, r, rim]);
      return;
    }
    if (riding) {
      var ridden = riding, tucked = arched;
      onRoad(p, function () {
        if (tucked) {
          clipToArches(p, x, y + cy, at, r, ridden.slope, ridden.down);
        }
        riding = null;
        wheels(p, x, y, at, cy, r, turn, rim);
        riding = ridden;
      });
      return;
    }
    at.forEach(function (wx) {
      var cx = x + wx, my = y + cy;
      p.fillStyle = '#0c0c10';
      p.beginPath();
      p.arc(cx, my, r + 0.9, Math.PI, 0);
      p.fill();
      circle(p, cx, my, r, '#141418');
      (RIMS[rim] || whitewall)(p, cx, my, r, turn);
    });
  }
  function steelRim(p, cx, my, r, turn) {
    circle(p, cx, my, r * 0.55, '#4a4846');
    circle(p, cx, my, r * 0.3, '#2a2826');
    for (var l = 0; l < 5; l += 1) {
      var la = turn + l * 1.2566;
      circle(p, cx + Math.cos(la) * r * 0.42, my + Math.sin(la) * r * 0.42, r * 0.06, '#8a8680');
    }
  }
  // A plain steel wheel, painted silver, its slots turning round a small chrome cap.
  function hubcap(p, cx, my, r, turn) {
    circle(p, cx, my, r * 0.66, '#8c9098');
    for (var s = 0; s < 8; s += 1) {
      var a = turn + s * 0.7854;
      circle(p, cx + Math.cos(a) * r * 0.5, my + Math.sin(a) * r * 0.5, r * 0.07, '#2c2e34');
    }
    var cap = p.createRadialGradient(cx - 0.5, my - 0.6, 0.1, cx, my, r * 0.36);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(0.6, '#c4c8d0');
    cap.addColorStop(1, '#787e8a');
    circle(p, cx, my, r * 0.34, cap);
  }
  // A grey alloy wheel of thin spokes in a bright rim.
  function turbineRim(p, cx, my, r, turn) {
    circle(p, cx, my, r * 0.72, '#c2c6cc');
    circle(p, cx, my, r * 0.63, '#34373e');
    p.strokeStyle = '#9ca0a8';
    p.lineWidth = r * 0.06;
    p.beginPath();
    for (var s = 0; s < 14; s += 1) {
      var a = turn + s * 0.4488;
      segment(p, cx + Math.cos(a) * r * 0.2, my + Math.sin(a) * r * 0.2, cx + Math.cos(a) * r * 0.63, my + Math.sin(a) * r * 0.63);
    }
    p.stroke();
    circle(p, cx, my, r * 0.22, '#8c9098');
  }
  var RIMS = {steel: steelRim, cap: hubcap, turbine: turbineRim};
  function whitewall(p, cx, my, r, turn) {
    p.strokeStyle = '#ecebe4';
    p.lineWidth = r * 0.22;
    p.beginPath();
    p.arc(cx, my, r * 0.7, 0, 6.2832);
    p.stroke();
    var cap = p.createRadialGradient(cx - 0.7, my - 0.8, 0.2, cx, my, r * 0.55);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(0.6, '#b8bcc8');
    cap.addColorStop(1, '#6c7280');
    circle(p, cx, my, r * 0.52, cap);
    // The turbine's vanes.
    p.strokeStyle = 'rgba(60, 64, 74, 0.8)';
    p.lineWidth = 0.35;
    p.beginPath();
    for (var s = 0; s < 8; s += 1) {
      var a = turn + s * 0.7854;
      p.moveTo(cx + Math.cos(a) * r * 0.16, my + Math.sin(a) * r * 0.16);
      p.quadraticCurveTo(cx + Math.cos(a + 0.4) * r * 0.36, my + Math.sin(a + 0.4) * r * 0.36, cx + Math.cos(a + 0.5) * r * 0.5, my + Math.sin(a + 0.5) * r * 0.5);
    }
    p.stroke();
    circle(p, cx, my, r * 0.14, '#e8eaf0');
  }

  // ------------------------------------------------- the wasteland's machines --
  // A pursuit car with a blower, a pursuit bike, a spiked dune buggy, a plated raider, a
  // rusted tanker rig. All on steel wheels.
  function spikes(p, x, y0, y1, long) {
    p.fillStyle = '#a8a49c';
    p.beginPath();
    for (var sy = y0; sy < y1 - 0.5; sy += 1.6) {
      p.moveTo(x, sy);
      p.lineTo(x + long, sy + 0.5);
      p.lineTo(x, sy + 1.2);
    }
    p.fill();
  }
  var BLOWER_BODY = traced([['M', 1, 17.2], ['L', 0.4, 10.4], ['Q', 0.6, 8.6, 2.6, 8.2], ['L', 10, 7.6],
    ['Q', 16, 6.4, 21, 3.2], ['Q', 23, 2.2, 26, 2.2], ['L', 33.5, 2.2], ['Q', 35, 2.3, 36.2, 3.2], ['L', 41, 7.6],
    ['L', 61, 8.6], ['Q', 63.6, 9, 63.8, 10.6], ['L', 63.6, 14.6], ['Q', 63.4, 17, 62, 17.2]]);
  var BLOWER_SIDE = traced([['M', 23.6, 7.2], ['L', 25.8, 3.6], ['L', 33.4, 3.5], ['Q', 34.4, 3.6, 35, 4.1], ['L', 38.4, 7.2]]);
  var BLOWER_SCOOP = new Path2D();
  BLOWER_SCOOP.rect(47.4, 5.2, 6.8, 3.6);
  BLOWER_SCOOP.rect(48.4, 3.4, 4.8, 1.9);
  var BLOWER_OUTLINE = new Path2D();
  BLOWER_OUTLINE.addPath(BLOWER_BODY);
  BLOWER_OUTLINE.addPath(BLOWER_SCOOP);
  function blower(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 32, ground, 32);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2.2, 17.4, [26, 26, 30]);
    p.fill(BLOWER_BODY);
    // The spoiler.
    rect(p, 0.6, 7.2, 6, 1, '#16161a');
    glassOf(p, BLOWER_SIDE, 3.5, 7.2);
    door(p, 23.2, 41, 7.8, 15.6);
    handle(p, 24.6, 8.8);
    // A gold pinstripe.
    rect(p, 1, 11.4, 62.4, 0.5, '#8a6a2c');
    p.fillStyle = chrome(p, 3.4, 8.8);
    p.fill(BLOWER_SCOOP);
    rect(p, 48.4, 3.4, 4.8, 0.7, '#202024');
    p.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    p.lineWidth = 0.3;
    p.beginPath();
    for (var f = 48.2; f < 54; f += 1.1) {
      p.moveTo(f, 5.6);
      p.lineTo(f, 8.6);
    }
    p.stroke();
    // The side pipes.
    rect(p, 26, 14.4, 20, 0.9, chrome(p, 14.4, 15.3));
    rect(p, 26, 15.5, 20, 0.9, chrome(p, 15.5, 16.4));
    rect(p, 60.4, 14.4, 3.4, 2.4, '#141416');
    rect(p, -0.4, 13.6, 2.6, 2, '#2a2a2e');
    rect(p, 0.1, 9, 1.2, 2.4, '#c81818');
    rect(p, 63, 10.2, 0.8, 1.4, '#f4f0dc');
    rocker(p, 1.4, 16, 60.4);
    arches(p, [14, 51.5], 15.6, 5);
    p.restore();
    // Fat tyres at the back.
    wheels(p, x, y, [14], 15.6, 5, turn, 'steel');
    wheels(p, x, y, [51.5], 16, 4.6, turn, 'steel');
    return {path: BLOWER_OUTLINE, x: x, y: y, wheels: [[14, 15.6, 5], [51.5, 16, 4.6]]};
  }
  // The tail and seat, the tank, the fairing round the headlamp.
  var BIKE_BODY = traced([['M', 2.4, 10], ['L', 6, 10.8], ['L', 11.6, 10.8], ['Q', 13, 8.6, 17, 8.4],
    ['L', 21.4, 8.6], ['L', 23.4, 5.6], ['L', 25.8, 4.6], ['Q', 28.2, 6.6, 27.6, 10],
    ['L', 25.4, 11.2], ['L', 21, 12.4], ['L', 8, 12.6], ['L', 3.4, 11.6]]);
  // Only the bike and its engine: a box round the rider would shade the air about them,
  // so the rider is darkened by hand instead.
  var BIKE_OUTLINE = new Path2D();
  BIKE_OUTLINE.addPath(BIKE_BODY);
  BIKE_OUTLINE.rect(12, 12.2, 8, 4.4);
  function bike(p, x, ground, paint, turn) {
    var y = ground - 22.6;
    shadow(p, x + 15, ground, 15);
    p.save();
    p.translate(x, y);
    [5.6, 26.4].forEach(function (wx) { spokedWheel(p, wx, 18.4, turn); });
    var leather = css(blend([30, 28, 30], [8, 8, 14], night.dark));
    // The forks and the swingarm.
    p.strokeStyle = '#6a6a70';
    p.lineWidth = 0.8;
    p.beginPath();
    p.moveTo(24.4, 6.8);
    p.lineTo(26.4, 18.4);
    p.moveTo(12.6, 14.6);
    p.lineTo(5.6, 18.4);
    p.stroke();
    // The engine, finned.
    rect(p, 12, 12.2, 8, 4.4, '#2a2a2e');
    p.fillStyle = '#5a5a60';
    for (var fin = 12.8; fin < 16; fin += 1.1) {
      p.fillRect(12.6, fin, 6.8, 0.4);
    }
    // The pipe.
    p.strokeStyle = chrome(p, 15, 18);
    p.lineWidth = 0.8;
    p.beginPath();
    p.moveTo(18.6, 16.4);
    p.quadraticCurveTo(14, 17.6, 2.6, 15.6);
    p.stroke();
    p.fillStyle = gloss(p, 4.6, 12.6, [44, 46, 54]);
    p.fill(BIKE_BODY);
    // The screen.
    rect(p, 23.6, 4.6, 1.6, 1.6, 'rgba(150, 180, 210, 0.55)');
    crouchedRider(p, leather);
    rect(p, 27.2, 7, 0.9, 1.6, '#f4f0dc');
    rect(p, 2, 9.8, 1, 1.2, '#c81818');
    p.restore();
    return {path: BIKE_OUTLINE, x: x, y: y, wheels: [[5.6, 18.4, 4.2], [26.4, 18.4, 4.2]]};
  }
  // No arches, thin tyres, cast spokes turning.
  function spokedWheel(p, wx, wy, turn) {
    circle(p, wx, wy, 4.2, '#141418');
    circle(p, wx, wy, 2.9, '#3a3a40');
    circle(p, wx, wy, 2.3, '#18181c');
    p.strokeStyle = '#7a7a82';
    p.lineWidth = 0.55;
    p.beginPath();
    for (var sp = 0; sp < 5; sp += 1) {
      var a = turn + sp * 1.2566;
      p.moveTo(wx, wy);
      p.lineTo(wx + Math.cos(a) * 2.5, wy + Math.sin(a) * 2.5);
    }
    p.stroke();
    circle(p, wx, wy, 0.6, '#9a9aa2');
  }
  function crouchedRider(p, leather) {
    p.strokeStyle = leather;
    p.lineCap = 'round';
    p.lineJoin = 'round';
    // The leg, knee to the peg.
    p.lineWidth = 1.7;
    p.beginPath();
    p.moveTo(10.4, 9.4);
    p.lineTo(15.6, 11.4);
    p.lineTo(14.2, 15.4);
    p.stroke();
    p.lineWidth = 2.6;
    p.beginPath();
    p.moveTo(10, 9.2);
    p.lineTo(17.2, 4.6);
    p.stroke();
    p.lineWidth = 1;
    p.beginPath();
    p.moveTo(16.8, 5.2);
    p.lineTo(20.4, 6.4);
    p.lineTo(23.2, 6.8);
    p.stroke();
    // A boot; the helmet and its visor.
    rect(p, 13.2, 15, 2.4, 1, '#141416');
    circle(p, 19, 2.8, 2, '#1a1a1e');
    rect(p, 19.6, 2.2, 1.6, 0.9, 'rgba(160, 190, 220, 0.6)');
    p.lineCap = 'butt';
    p.lineJoin = 'miter';
  }
  var BUGGY_BODY = traced([['M', 2, 16], ['L', 1, 11], ['L', 12, 10.2], ['L', 20, 12.6], ['L', 38, 13], ['L', 45, 12],
    ['L', 46.4, 15], ['L', 44, 17.2], ['L', 4, 17.6]]);
  var BUGGY_OUTLINE = new Path2D();
  BUGGY_OUTLINE.addPath(BUGGY_BODY);
  BUGGY_OUTLINE.rect(2, 6.6, 7.4, 4);
  BUGGY_OUTLINE.rect(17.4, 4, 4.6, 7.6);
  function buggy(p, x, ground, paint, turn) {
    var y = ground - 22;
    shadow(p, x + 24, ground, 24);
    // The roll cage is too thin for the night's shade: darkened by hand.
    var steel = css(blend([70, 70, 78], [8, 8, 14], night.dark));
    p.save();
    p.translate(x, y);
    p.strokeStyle = steel;
    p.lineWidth = 0.9;
    p.lineJoin = 'round';
    p.beginPath();
    p.moveTo(7, 10.6);
    p.lineTo(12, 1.6);
    p.lineTo(26, 1.6);
    p.lineTo(33, 12.6);
    p.moveTo(12, 1.6);
    p.lineTo(15, 10.6);
    p.moveTo(26, 1.6);
    p.lineTo(24, 12.6);
    p.stroke();
    // The driver, in goggles.
    circle(p, 19.5, 6, 1.9, '#2a2420');
    rect(p, 17.4, 7.6, 4.6, 4, '#3a2e26');
    rect(p, 18.4, 5.4, 3, 0.8, '#c8a050');
    p.fillStyle = gloss(p, 10, 17.6, paint);
    p.fill(BUGGY_BODY);
    // The engine behind, its pipes.
    rect(p, 2, 7.2, 7.4, 3.4, '#2c2a28');
    rect(p, 2.4, 6.6, 6.6, 0.8, '#55524e');
    p.strokeStyle = chrome(p, 1, 8);
    p.lineWidth = 0.7;
    p.beginPath();
    p.moveTo(3.6, 7.2);
    p.lineTo(2.6, 1.4);
    p.moveTo(5.6, 7.2);
    p.lineTo(5, 2);
    p.stroke();
    p.fillStyle = 'rgba(30, 14, 8, 0.4)';
    [9, 26, 38].forEach(function (rx) {
      p.beginPath();
      p.ellipse(rx, 15, 2.6, 1.2, 0, 0, 6.2832);
      p.fill();
    });
    spikes(p, 46, 12.4, 16.6, 4);
    rect(p, 45.6, 11.6, 1.2, 1.4, '#f4f0dc');
    rect(p, 0.4, 11, 1, 1.6, '#c81818');
    arches(p, [9, 40], 17.4, 4.6);
    p.restore();
    wheels(p, x, y, [9], 17.4, 4.6, turn, 'steel');
    wheels(p, x, y, [40], 18.4, 3.6, turn, 'steel');
    return {path: BUGGY_OUTLINE, x: x, y: y, wheels: [[9, 17.4, 4.6], [40, 18.4, 3.6]]};
  }
  var RUST_PATCHES = [[8, 13, 4], [27, 10, 3], [44, 14, 5], [62, 11, 3]];
  var DOOR_PLATES = [[19, 8.6, 11, 6.4], [33.6, 8.6, 12, 6.4]];
  // A sedan rusted through, plated and spiked, a spare on its roof.
  function raider(p, x, ground, paint, turn) {
    var shape = sedan(p, x, ground, paint, turn, 'steel');
    p.save();
    p.translate(x, shape.y);
    p.fillStyle = 'rgba(40, 18, 8, 0.45)';
    RUST_PATCHES.forEach(function (r) {
      p.beginPath();
      p.ellipse(r[0], r[1], r[2], r[2] * 0.45, 0, 0, 6.2832);
      p.fill();
    });
    DOOR_PLATES.forEach(function (plate) {
      rect(p, plate[0], plate[1], plate[2], plate[3], 'rgba(88, 84, 78, 0.92)');
      for (var rivet = plate[0] + 1; rivet < plate[0] + plate[2]; rivet += 2.4) {
        rect(p, rivet, plate[1] + 0.6, 0.4, 0.4, '#c8c4bc');
        rect(p, rivet, plate[1] + plate[3] - 1, 0.4, 0.4, '#c8c4bc');
      }
    });
    p.fillStyle = '#141416';
    p.beginPath();
    p.ellipse(30, 0.4, 6, 1.6, 0, 0, 6.2832);
    p.fill();
    rect(p, 22, 1.4, 16, 0.6, '#55524e');
    spikes(p, 70.2, 11.6, 15.4, 3.6);
    p.restore();
    return shape;
  }
  var RIG_TANK = traced([['M', 14, 12], ['L', 90, 12], ['Q', 102, 12, 102, 25], ['Q', 102, 38, 90, 38],
    ['L', 14, 38], ['Q', 2, 38, 2, 25], ['Q', 2, 12, 14, 12]]);
  var RIG_TRACTOR = traced([['M', 104, 47], ['L', 104, 38], ['L', 112, 38], ['L', 112, 10], ['Q', 112, 8.4, 114, 8.4],
    ['L', 129, 8.4], ['Q', 131, 8.4, 131.4, 10.6], ['L', 132.6, 24], ['L', 146, 25], ['Q', 149, 25.4, 149, 28], ['L', 149, 47]]);
  var RIG_CAB = traced([['M', 118, 11.4], ['L', 129.2, 11.4], ['L', 130.4, 22], ['L', 118, 22]]);
  var RIG_OUTLINE = new Path2D();
  RIG_OUTLINE.addPath(RIG_TANK);
  RIG_OUTLINE.rect(0, 38, 104, 6);
  RIG_OUTLINE.addPath(RIG_TRACTOR);
  RIG_OUTLINE.rect(132.4, 0, 4.4, 25);
  RIG_OUTLINE.rect(148, 30, 3.2, 15);
  function rig(p, x, ground, paint, turn) {
    var y = ground - 52;
    shadow(p, x + 76, ground, 76);
    p.save();
    p.translate(x, y);
    p.fillStyle = vertical(p, 12, 38, [[0, '#a8a090'], [0.25, '#d0c8b4'], [0.6, '#8a8272'], [1, '#4a4238']]);
    p.fill(RIG_TANK);
    p.save();
    p.clip(RIG_TANK);
    // Rust running down it, and its bands.
    p.fillStyle = 'rgba(110, 50, 22, 0.5)';
    for (var st = 8; st < 100; st += 7) {
      p.fillRect(st, 20 + (st % 3) * 3, 1.2, 20);
    }
    [24, 52, 80].forEach(function (b) { rect(p, b, 12, 1.6, 26, 'rgba(40, 36, 30, 0.6)'); });
    p.restore();
    rect(p, 0, 38, 104, 3, '#2c2a28');
    rect(p, 4, 41, 30, 2.6, '#22201e');
    p.fillStyle = gloss(p, 8.4, 47, [118, 48, 30]);
    p.fill(RIG_TRACTOR);
    glassOf(p, RIG_CAB, 11.4, 22);
    // Bars over the glass.
    p.strokeStyle = '#2a2826';
    p.lineWidth = 0.5;
    p.beginPath();
    for (var g = 119.5; g < 130; g += 2.2) {
      p.moveTo(g, 11.4);
      p.lineTo(g, 22);
    }
    p.stroke();
    door(p, 116.6, 132, 23, 42);
    handle(p, 118, 24);
    // Twin stacks.
    p.fillStyle = chrome(p, 0, 25);
    p.fillRect(132.4, 0, 1.8, 25);
    p.fillRect(135, 2, 1.8, 23);
    // The bull bar.
    rect(p, 148, 30, 3.2, 15, '#3a3836');
    spikes(p, 151, 30, 45, 5);
    rect(p, 0.2, 28, 1.4, 4, '#c81818');
    rect(p, 148, 28.4, 1, 2.4, '#f4f0dc');
    p.restore();
    wheels(p, x, y, [14, 28, 108, 138], 45.4, 6.6, turn, 'steel');
    return {path: RIG_OUTLINE, x: x, y: y, wheels: wheelsOf([14, 28, 108, 138], 45.4, 6.6)};
  }

  // ---------------------------------------------------- the future's machines --
  // All floating on a glow over lift pads, no wheels.
  // How high it floats (a slow bob); draws the glow it floats on.
  function floating(p, x, ground, length, colour) {
    var lift = 4 + Math.sin(performance.now() / 500 + x * 0.01) * 0.5, mid = x + length / 2;
    p.save();
    p.globalCompositeOperation = 'lighter';
    var under = p.createRadialGradient(mid, ground - 1, 0, mid, ground - 1, length * 0.45);
    under.addColorStop(0, css(colour, 0.35));
    under.addColorStop(1, css(colour, 0));
    p.translate(mid, ground - 1);
    p.scale(1, 0.22);
    p.translate(-mid, -ground + 1);
    p.fillStyle = under;
    p.fillRect(x - 4, ground - length * 0.5, length + 8, length);
    p.restore();
    return lift;
  }
  function pads(p, at, y, colour) {
    at.forEach(function (px) {
      rect(p, px - 4, y, 8, 1.1, '#2a2e38');
      rect(p, px - 3, y + 1, 6, 0.4, css(colour, 0.9));
    });
  }
  function neonStrength() {
    return 0.4 + 0.6 * Math.min(1, light.night * 1.6);
  }
  var WEDGE_BODY = traced([['M', 0.6, 12.6], ['L', 0.4, 6.4], ['L', 6, 5.6], ['L', 24, 2.2], ['Q', 30, 0.6, 36, 2],
    ['L', 64, 9.2], ['Q', 66.4, 10, 66, 11.6], ['L', 65, 13], ['L', 1.4, 13.2]]);
  var WEDGE_CANOPY = traced([['M', 21, 4.4], ['L', 28, 2], ['L', 35, 2.6], ['L', 47, 6], ['L', 24, 5.4]]);
  // A wedge coupé, a bar of light across its nose.
  function wedge(p, x, ground, paint) {
    shadow(p, x + 33, ground, 28);
    var y = ground - 13.2 - floating(p, x, ground, 66, NEON[0]);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 1, 13.2, paint);
    p.fill(WEDGE_BODY);
    glassOf(p, WEDGE_CANOPY, 2, 6);
    // Its one door's seam.
    p.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    p.lineWidth = 0.3;
    p.beginPath();
    p.moveTo(36, 5.8);
    p.lineTo(38, 12.4);
    p.stroke();
    rect(p, 6, 10.2, 54, 0.5, css(NEON[0], neonStrength()));
    rect(p, 61.6, 9.4, 4.4, 0.8, '#f4fbff');
    rect(p, 0.2, 6.6, 0.9, 4.6, '#ff3048');
    pads(p, [12, 53], 13, NEON[0]);
    p.restore();
    return {path: WEDGE_BODY, x: x, y: y, wheels: []};
  }
  var BUBBLE_BODY = traced([['M', 0, 9], ['Q', 0, 1.6, 8, 1.6], ['L', 38, 1.6], ['Q', 46, 1.6, 46, 10],
    ['L', 46, 16.6], ['L', 0, 16.6]]);
  var BUBBLE_BAND = traced([['M', 4, 9.8], ['Q', 4, 4.4, 9, 4.4], ['L', 37, 4.4], ['Q', 42.4, 4.4, 42.4, 9.8]]);
  // A rounded pod car with a sliding door.
  function bubble(p, x, ground, paint) {
    shadow(p, x + 23, ground, 19);
    var y = ground - 16.6 - floating(p, x, ground, 46, NEON[2]);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 1.6, 16.6, paint);
    p.fill(BUBBLE_BODY);
    glassOf(p, BUBBLE_BAND, 4.4, 9.8);
    p.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    p.lineWidth = 0.3;
    p.beginPath();
    p.moveTo(19, 4.4);
    p.lineTo(19, 16);
    p.moveTo(28, 4.4);
    p.lineTo(28, 16);
    p.stroke();
    rect(p, 1, 13.4, 44, 0.5, css(NEON[2], neonStrength()));
    rect(p, 45, 11, 1, 2.6, '#f4fbff');
    rect(p, 0, 11, 0.9, 2.6, '#ff3048');
    pads(p, [10, 36], 16.4, NEON[2]);
    p.restore();
    return {path: BUBBLE_BODY, x: x, y: y, wheels: []};
  }
  var HOVER_BODY = new Path2D();
  HOVER_BODY.moveTo(0.4, 11);
  HOVER_BODY.lineTo(1.4, 6.6);
  HOVER_BODY.quadraticCurveTo(14, 5, 22, 1.6);
  HOVER_BODY.quadraticCurveTo(30, -0.4, 38, 2.4);
  HOVER_BODY.lineTo(56, 9);
  HOVER_BODY.quadraticCurveTo(58.4, 10.4, 57, 12.4);
  HOVER_BODY.quadraticCurveTo(40, 15, 4, 14.6);
  HOVER_BODY.closePath();
  var HOVER_CANOPY = traced([['M', 19, 5.4], ['Q', 28, 0.8, 37, 3.4], ['L', 45, 6.6], ['L', 21, 6.6]]);
  function hover(p, x, ground, paint) {
    shadow(p, x + 29, ground, 22);
    var y = ground - 15 - floating(p, x, ground, 58, NEON[0]);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 0, 15, paint);
    p.fill(HOVER_BODY);
    glassOf(p, HOVER_CANOPY, 1.4, 6.6);
    [[6, 12.6], [44, 13.4]].forEach(function (pad) {
      rect(p, pad[0], pad[1], 9, 1.2, '#2a2e38');
      rect(p, pad[0] + 1, pad[1] + 1, 7, 0.4, css(NEON[0], 0.9));
    });
    rect(p, 54.6, 9.2, 2.4, 0.8, '#f4fbff');
    rect(p, 0.6, 7.6, 0.8, 3, '#ff3048');
    p.restore();
    return {path: HOVER_BODY, x: x, y: y, wheels: []};
  }
  // A cargo hauler driving itself: pods linked behind a windowless nose.
  var HAULER_SHELL = new Path2D();
  [[0, 44], [47, 91]].forEach(function (pod) {
    HAULER_SHELL.moveTo(pod[0], 32);
    HAULER_SHELL.lineTo(pod[0], 9);
    HAULER_SHELL.quadraticCurveTo(pod[0], 5, pod[0] + 4, 5);
    HAULER_SHELL.lineTo(pod[1] - 4, 5);
    HAULER_SHELL.quadraticCurveTo(pod[1], 5, pod[1], 9);
    HAULER_SHELL.lineTo(pod[1], 32);
    HAULER_SHELL.closePath();
  });
  HAULER_SHELL.addPath(traced([['M', 94, 32], ['L', 94, 10], ['Q', 94, 6, 98, 6], ['L', 128, 6], ['Q', 136, 6, 142, 14],
    ['L', 149.6, 24], ['Q', 150.4, 26, 150, 28], ['L', 149, 32]]));
  function hauler(p, x, ground) {
    shadow(p, x + 75, ground, 68);
    var y = ground - 34 - floating(p, x, ground, 150, NEON[0]);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 5, 32, [222, 228, 234]);
    p.fill(HAULER_SHELL);
    rect(p, 44, 25, 3, 3, '#30343c');
    rect(p, 91, 25, 3, 3, '#30343c');
    var strip = css(NEON[0], neonStrength());
    [[1, 43], [48, 90], [95, 148]].forEach(function (run) { rect(p, run[0], 27.4, run[1] - run[0], 0.7, strip); });
    p.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    p.lineWidth = 0.3;
    p.beginPath();
    for (var seam = 11; seam < 90; seam += 11) {
      if (seam % 47 > 3) {
        p.moveTo(seam, 6);
        p.lineTo(seam, 31);
      }
    }
    p.stroke();
    // Its sensors where windows would be.
    rect(p, 132, 12.4, 9, 1.4, '#1a1e26');
    rect(p, 134, 12.8, 5, 0.5, '#ff5068');
    rect(p, 146, 24.4, 3.4, 0.9, '#f4fbff');
    rect(p, 0, 16, 0.8, 4, '#ff3048');
    rect(p, 0, 32, 150, 2, '#262a32');
    pads(p, [12, 36, 58, 80, 106, 136], 33.4, NEON[0]);
    p.restore();
    return {path: HAULER_SHELL, x: x, y: y, wheels: []};
  }
  var EBIKE_BODY = traced([['M', 1, 12], ['Q', 4, 6.8, 12, 7.4], ['L', 20, 6.6], ['Q', 27, 6, 29.6, 10.6], ['L', 28, 13], ['L', 3, 13.6]]);
  // A hover bike in its shell, its rider crouched (darkened by hand, as the bike's rider).
  function ebike(p, x, ground, paint) {
    shadow(p, x + 15, ground, 12);
    var y = ground - 13.6 - floating(p, x, ground, 30, NEON[1]);
    p.save();
    p.translate(x, y);
    p.strokeStyle = css(blend([36, 38, 46], [8, 8, 14], night.dark));
    p.lineCap = 'round';
    p.lineJoin = 'round';
    p.lineWidth = 2.4;
    p.beginPath();
    p.moveTo(11, 7.4);
    p.lineTo(17.6, 3);
    p.stroke();
    p.lineWidth = 1;
    p.beginPath();
    p.moveTo(17, 3.6);
    p.lineTo(23.4, 6.4);
    p.stroke();
    p.lineCap = 'butt';
    p.lineJoin = 'miter';
    circle(p, 19.6, 1.9, 1.9, css(blend([238, 242, 246], [16, 18, 28], night.dark)));
    rect(p, 20.2, 1.2, 1.6, 0.9, '#1a2030');
    p.fillStyle = gloss(p, 6.6, 13.6, paint);
    p.fill(EBIKE_BODY);
    rect(p, 4, 11.6, 23, 0.5, css(NEON[1], 0.5 + 0.5 * Math.min(1, light.night * 1.6)));
    rect(p, 28.6, 9.2, 1, 1.2, '#f4fbff');
    rect(p, 1, 10, 0.8, 1.4, '#ff3048');
    pads(p, [7, 23], 13.2, NEON[1]);
    p.restore();
    return {path: EBIKE_BODY, x: x, y: y, wheels: []};
  }

  // --------------------------------------------------- the badlands' machines --
  // (With the pursuit bike and the semi.)
  var ARMOURED_BODY = traced([['M', 1, 20.4], ['L', 1, 9], ['L', 6, 8.4], ['L', 13, 2.6], ['L', 50, 2.6], ['L', 59, 8.4],
    ['L', 70, 9.4], ['L', 71.6, 12], ['L', 71.4, 20.4]]);
  // Boxy, slits for windows, plated and riveted, a bar across its front.
  function armoured(p, x, ground, paint, turn) {
    var y = ground - 24.6;
    shadow(p, x + 36, ground, 36);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2.6, 20.4, paint);
    p.fill(ARMOURED_BODY);
    [[16, 31], [33, 48]].forEach(function (slit) {
      rect(p, slit[0], 4.8, slit[1] - slit[0], 2.2, '#121418');
      rect(p, slit[0], 4.8, slit[1] - slit[0], 0.5, 'rgba(160, 190, 220, 0.4)');
    });
    p.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    p.lineWidth = 0.3;
    p.beginPath();
    [14, 32, 50].forEach(function (seam) {
      p.moveTo(seam, 8.4);
      p.lineTo(seam, 19.6);
    });
    p.moveTo(2, 13.6);
    p.lineTo(70, 13.6);
    p.stroke();
    for (var rivet = 3; rivet < 70; rivet += 3.2) {
      rect(p, rivet, 14.2, 0.4, 0.4, 'rgba(220, 220, 220, 0.5)');
    }
    rect(p, 70.4, 11.6, 2.6, 7.6, '#2a2a2e');
    rect(p, 66, 10, 3.6, 0.9, '#f4f0dc');
    rect(p, 0.2, 10, 1, 2.6, '#c81818');
    arches(p, [14, 57], 20.2, 5);
    p.restore();
    wheels(p, x, y, [14, 57], 20.2, 5, turn, 'steel');
    return {path: ARMOURED_BODY, x: x, y: y, wheels: wheelsOf([14, 57], 20.2, 5)};
  }
  // A lowered sedan glowing underneath, a line of neon along its side, more as it darkens.
  function glowcoupe(p, x, ground, paint, turn) {
    var hue = NEON[Math.round(paint[0] + paint[2]) % 2], on = 0.35 + 0.55 * Math.min(1, light.night * 1.6);
    p.save();
    p.globalCompositeOperation = 'lighter';
    var under = p.createRadialGradient(x + 35, ground - 1, 0, x + 35, ground - 1, 38);
    under.addColorStop(0, css(hue, 0.4 * on));
    under.addColorStop(1, css(hue, 0));
    p.translate(x + 35, ground - 1);
    p.scale(1, 0.16);
    p.translate(-x - 35, -ground + 1);
    p.fillStyle = under;
    p.fillRect(x - 4, ground - 40, 78, 80);
    p.restore();
    var shape = sedan(p, x, ground, paint, turn);
    rect(p, x + 3, shape.y + 15.2, 64, 0.5, css(hue, on));
    return shape;
  }

  // ----------------------------------------------- the atomic city's machines --
  // A reactor under a glass dome, glowing by day and brighter by night, pulsing.
  function reactor(p, cx, cy, r, colour) {
    var on = 0.55 + 0.45 * Math.min(1, light.night * 1.6), pulse = 0.85 + 0.15 * Math.sin(performance.now() / 400 + cx);
    var core = p.createRadialGradient(cx, cy, 0, cx, cy, r);
    core.addColorStop(0, css(blend([255, 255, 255], colour, 0.3), on * pulse));
    core.addColorStop(0.5, css(colour, 0.8 * on * pulse));
    core.addColorStop(1, css(colour, 0.1));
    p.fillStyle = core;
    p.beginPath();
    p.arc(cx, cy, r, Math.PI, 0);
    p.closePath();
    p.fill();
    p.strokeStyle = 'rgba(240, 244, 250, 0.7)';
    p.lineWidth = 0.35;
    p.beginPath();
    p.arc(cx, cy, r, Math.PI, 0);
    p.stroke();
    rect(p, cx - r - 0.6, cy - 0.2, 2 * r + 1.2, 1, chrome(p, cy - 0.2, cy + 0.8));
  }
  function secondTone(paint) {
    return css(blend([244, 238, 222], paint, 0.15));
  }
  var ATOMCAR_BODY = traced([['M', 1, 17], ['L', 0.4, 10.6], ['L', 1.6, 4.4], ['L', 4, 4.6], ['L', 15, 8.4], ['L', 21, 8.2],
    ['Q', 25, 2.6, 32, 2.4], ['L', 42, 2.4], ['Q', 48, 2.6, 52, 8], ['L', 66, 8.8], ['Q', 70, 9.4, 70, 12], ['L', 69.6, 17]]);
  var ATOMCAR_SIDE = traced([['M', 25, 7.8], ['Q', 27, 3.6, 32, 3.4], ['L', 42, 3.4], ['Q', 46, 3.6, 49, 7.8]]);
  var ATOMCAR_OUTLINE = new Path2D();
  ATOMCAR_OUTLINE.addPath(ATOMCAR_BODY);
  ATOMCAR_OUTLINE.rect(5, 4, 9.4, 4.6);
  // A long finned coupé in two tones, a chrome spear down its side, a skirt over its back
  // wheel, a reactor on its deck glowing green.
  function atomcar(p, x, ground, paint, turn) {
    var y = ground - 20.6;
    shadow(p, x + 35, ground, 35);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 2.4, 17, paint);
    p.fill(ATOMCAR_BODY);
    p.save();
    p.clip(ATOMCAR_BODY);
    rect(p, 0, 0, 72, 9, secondTone(paint));
    p.restore();
    glassOf(p, ATOMCAR_SIDE, 3.4, 7.8);
    rect(p, 36.6, 3.4, 0.8, 4.4, secondTone(paint));
    door(p, 24, 50, 8.6, 15.6);
    handle(p, 26, 10);
    rect(p, 6, 11.4, 58, 0.6, chrome(p, 11.4, 12));
    p.fillStyle = chrome(p, 10.6, 13);
    p.beginPath();
    p.moveTo(40, 11.4);
    p.lineTo(64, 11);
    p.lineTo(64, 12.4);
    p.lineTo(40, 12);
    p.closePath();
    p.fill();
    bumper(p, 66.4, 13.4, 4, 2.6);
    bumper(p, -0.4, 13.6, 4, 2.4);
    rect(p, 0.2, 5.6, 1, 4.6, '#d01818');
    circle(p, 69.4, 10.6, 0.9, '#f4f0dc');
    reactor(p, 9.6, 8.4, 4.2, [110, 255, 160]);
    arches(p, [57], 16, 5);
    p.fillStyle = gloss(p, 10, 17, paint);
    p.fillRect(7, 11.2, 14, 4.8);
    p.restore();
    wheels(p, x, y, [57], 16, 5, turn);
    wheels(p, x, y, [14], 16.6, 4.4, turn);
    // The skirt again over the wheel's top, with its chrome edge.
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 10, 17, paint);
    p.fillRect(7.6, 11.2, 12.8, 3.6);
    rect(p, 7.6, 14.6, 12.8, 0.5, chrome(p, 14.6, 15.1));
    p.restore();
    return {path: ATOMCAR_OUTLINE, x: x, y: y, wheels: [[57, 16, 5], [14, 16.6, 4.4]]};
  }
  var ATOMVAN_BODY = traced([['M', 1, 22], ['L', 0.6, 11], ['Q', 1, 5, 8, 5], ['L', 46, 5], ['Q', 56, 5, 58.6, 14],
    ['L', 59.4, 18], ['L', 59, 22]]);
  var ATOMVAN_SCREEN = traced([['M', 46, 7.4], ['Q', 53, 7.6, 55.4, 12.4], ['L', 46, 12.4]]);
  var ATOMVAN_OUTLINE = new Path2D();
  ATOMVAN_OUTLINE.addPath(ATOMVAN_BODY);
  ATOMVAN_OUTLINE.rect(14, -1, 18, 6);
  // A rounded van, a reactor drum on its roof glowing blue.
  function atomvan(p, x, ground, paint, turn) {
    var y = ground - 26;
    shadow(p, x + 30, ground, 30);
    p.save();
    p.translate(x, y);
    p.fillStyle = gloss(p, 5, 22, paint);
    p.fill(ATOMVAN_BODY);
    p.save();
    p.clip(ATOMVAN_BODY);
    rect(p, 0, 15, 62, 8, secondTone(paint));
    p.restore();
    [[6, 16], [18, 28], [30, 40]].forEach(function (pane) {
      var glass = new Path2D();
      glass.rect(pane[0], 7.4, pane[1] - pane[0], 5);
      glassOf(p, glass, 7.4, 12.4);
    });
    glassOf(p, ATOMVAN_SCREEN, 7.4, 12.4);
    door(p, 42, 42, 7, 21);
    rect(p, 1, 14.6, 58, 0.5, chrome(p, 14.6, 15.1));
    bumper(p, 56, 19.4, 4, 2.4);
    bumper(p, -0.6, 19.4, 4, 2.4);
    rect(p, 0.2, 13, 1, 3, '#d01818');
    circle(p, 58.4, 16, 0.9, '#f4f0dc');
    rect(p, 14, 2.6, 18, 2.6, chrome(p, 2.6, 5.2));
    reactor(p, 23, 2.8, 3.6, [110, 200, 255]);
    arches(p, [12, 48], 22, 4.6);
    p.restore();
    wheels(p, x, y, [12, 48], 22, 4.6, turn);
    return {path: ATOMVAN_OUTLINE, x: x, y: y, wheels: wheelsOf([12, 48], 22, 4.6)};
  }

  // ---------------------------------------------------------- all of them --
  // Each kind's drawer, and how long and tall it is and how high its head and tail lights.
  var DRAWERS = {
    continental: continental, monte: monte, nova: nova, rabbit: rabbit, ltd: ltd, taxi: taxi, dmc: dmc, flyingDmc: flyingDmc, sedan: sedan, wagon: wagon, pickup: pickup, semi: semi, blower: blower, bike: bike, buggy: buggy,
    raider: raider, rig: rig, wedge: wedge, bubble: bubble, hover: hover, hauler: hauler, ebike: ebike,
    armoured: armoured, glowcoupe: glowcoupe, atomcar: atomcar, atomvan: atomvan,
  };
  var VEHICLES = {
    continental: {length: 76.4, height: 18.8, head: 9.9, tail: 9.8},
    monte: {length: 69.5, height: 18.6, head: 9.5, tail: 10.1},
    nova: {length: 67.6, height: 18.4, head: 10.1, tail: 10.1},
    dmc: {length: 57.6, height: 18.6, head: 7.3, tail: 9.1},
    flyingDmc: {length: 57.6, height: 30.6, head: 19.3, tail: 21.1},
    ltd: {length: 72.6, height: 18.7, head: 10.1, tail: 9.9},
    taxi: {length: 69, height: 24, head: 10.6, tail: 10.2, sign: [33, 22.4]},
    rabbit: {length: 52.4, height: 19, head: 9.7, tail: 10.2},
    sedan: {length: 70.5, height: 18.6, head: 9.5, tail: 10.1},
    wagon: {length: 74.5, height: 18.4, head: 9.5, tail: 10.3},
    pickup: {length: 66.5, height: 21.8, head: 11.7, tail: 11.3},
    semi: {length: 168.5, height: 55, head: 22.8, tail: 23},
    blower: {length: 64, height: 18.4, head: 9.7, tail: 10.4},
    bike: {length: 28.2, height: 22.6, head: 14.8, tail: 12.2},
    buggy: {length: 50.5, height: 20.4, head: 9.7, tail: 10.2},
    raider: {length: 74, height: 20.6, head: 9.5, tail: 10.1},
    rig: {length: 156, height: 52, head: 22.4, tail: 22},
    wedge: {length: 66.4, height: 17.2, head: 7.4, tail: 8.3},
    bubble: {length: 46, height: 20.6, head: 8.3, tail: 8.3},
    hover: {length: 58, height: 19, head: 9.4, tail: 10},
    hauler: {length: 150, height: 38, head: 13.2, tail: 20},
    ebike: {length: 29.6, height: 17.6, head: 7.8, tail: 6.9},
    armoured: {length: 73, height: 24.6, head: 14.2, tail: 13.3},
    glowcoupe: {length: 70.5, height: 18.6, head: 9.5, tail: 10.1},
    atomcar: {length: 70, height: 20.6, head: 10, tail: 12.6},
    atomvan: {length: 60, height: 27.4, head: 10, tail: 11.5},
  };
  // Who drives where, and in what paint.
  var EVERYDAY = ['sedan', 'wagon', 'pickup', 'semi', 'monte', 'nova', 'rabbit', 'ltd', 'dmc'];
  // Those always in their own colour.
  var OWN_PAINT = {nova: [78, 106, 72], rabbit: [236, 236, 230], ltd: [14, 14, 17], taxi: [244, 178, 22]};
  var WASTED = ['blower', 'bike', 'buggy', 'raider', 'buggy', 'raider', 'rig'], RUST = [[140, 74, 40], [110, 92, 70], [96, 60, 44], [150, 110, 60]];
  var ATOMS = ['atomcar', 'atomcar', 'atomvan'], PASTEL = [[104, 184, 176], [232, 146, 124], [222, 184, 84], [150, 170, 220], [196, 52, 58]];
  var GANGS = ['armoured', 'glowcoupe', 'armoured', 'glowcoupe', 'semi', 'bike'], DUSK = [[40, 42, 48], [150, 30, 90], [30, 110, 130], [180, 150, 40], [90, 90, 96]];
  var SLEEK = ['wedge', 'bubble', 'hover', 'wedge', 'hover', 'hauler', 'ebike', 'flyingDmc'], SHEEN = [[236, 240, 244], [40, 44, 52], [180, 188, 200], [30, 140, 150], [220, 100, 40]];
  var TRAFFIC = {
    city: {kinds: EVERYDAY.concat(['taxi', 'taxi', 'taxi', 'taxi', 'taxi', 'taxi']), paints: COLOURS},
    wasteland: {kinds: WASTED, paints: RUST},
    future: {kinds: SLEEK, paints: SHEEN},
    badlands: {kinds: GANGS, paints: DUSK},
    atomic: {kinds: ATOMS, paints: PASTEL},
  };
  // The still kinds' bodies (all but their turning wheels and their shadows) are drawn once
  // at the screen's pixels and kept (`bodies`, by kind and paint; again when the size
  // changes, and the glowing coupé when the light does), at FINER times the screen's pixels:
  // laid where its ride puts it, between them, it would shimmer. Its shadow and wheels are
  // drawn live round it. Those that move as they go (the floating
  // ones, the bikes, the reactors' pulse) are drawn whole every frame.
  var STILL = {continental: 1, monte: 1, nova: 1, rabbit: 1, ltd: 1, taxi: 1, dmc: 1, sedan: 1, wagon: 1, pickup: 1, semi: 1, blower: 1, buggy: 1, raider: 1, rig: 1, armoured: 1, glowcoupe: 1};
  var bodies = {}, held = null, PAD = 8, FINER = sharp ? 1.5 : 2;
  function bodyOf(v) {
    var key = v.kind + '|' + v.paint, have = bodies[key], meta = VEHICLES[v.kind];
    if (have && (v.kind !== 'glowcoupe' || have.version === version)) {
      have.used = Date.now();
      return have;
    }
    var w = meta.length + 2 * PAD, h = meta.height + 2 * PAD, made = have ? have.canvas : document.createElement('canvas');
    made.width = Math.ceil(w * k * FINER);
    made.height = Math.ceil(h * k * FINER);
    var p = made.getContext('2d');
    p.setTransform(k * FINER, 0, 0, k * FINER, 0, 0);
    p.clearRect(0, 0, w, h);
    held = {wheels: [], shadows: [], arched: false};
    var shape = shapeOf(v, p, PAD, meta.height + PAD, 0);
    have = bodies[key] = {canvas: made, w: w, h: h, shape: shape, wheels: held.wheels, shadows: held.shadows, arched: held.arched, version: version, used: Date.now()};
    held = null;
    return have;
  }
  // v.shape is kept: the night's shade and the top light need the true outline.
  function drawVehicle(v, p) {
    var slope = v.slope || 0, down = (v.lift || 0) - slope * v.x;
    if (!STILL[v.kind]) {
      arched = false;
      riding = {slope: slope, down: down};
      p.save();
      p.transform(1, slope, 0, 1, 0, down);
      v.shape = shapeOf(v, p, v.x, v.ground, v.wheel);
      p.restore();
      riding = null;
      return;
    }
    var body = bodyOf(v);
    var height = VEHICLES[v.kind].height;
    var left = Math.round((v.x - PAD) * k) / k;
    var top = v.ground - height - PAD;
    body.shadows.forEach(function (s) { shadow(p, s[0] + left, s[1] + top, s[2]); });
    p.save();
    p.transform(1, slope, 0, 1, 0, down);
    p.drawImage(body.canvas, left, top, body.w, body.h);
    p.restore();
    body.wheels.forEach(function (w) {
      if (body.arched) {
        p.save();
        clipToArches(p, w[0] + left, w[1] + top + w[3], w[2], w[4], slope, down);
      }
      wheels(p, w[0] + left, w[1] + top, w[2], w[3], w[4], v.wheel, w[5]);
      if (body.arched) {
        p.restore();
      }
    });
    v.shape = {path: body.shape.path, x: body.shape.x + left, y: body.shape.y + top, wheels: body.shape.wheels};
  }
  function shapeOf(v, p, x, ground, turn) {
    return (DRAWERS[v.kind] || monte)(p, x, ground, v.paint, turn);
  }

  // Our car carries the road with it: dust from the wastes, frost from the snow. Drawn live
  // over the cached body so it can build and fade without remaking it.
  var wear = {dust: 0, frost: 0};
  var DUST_COLOUR = [150, 126, 92], FROST_COLOUR = [228, 238, 248];
  var DUSTY = {wasteland: 1, aftermath: 1, warzone: 0.8, asteroids: 0.7, desert: 0.4, badlands: 0.4};
  function weatherOurCar(seconds, where) {
    var dustWanted = 0;
    Object.keys(DUSTY).forEach(function (biome) {
      dustWanted = Math.max(dustWanted, DUSTY[biome] * deepIn(where, biome));
    });
    var raining = precipNow && precipNow.kind === 'rain';
    var snowing = precipNow && precipNow.kind === 'snow';
    if (dustWanted > wear.dust) {
      wear.dust += (dustWanted - wear.dust) * Math.min(1, seconds / 40);
    } else {
      // Rain washes it off in under a minute; dry, it blows away over a few.
      wear.dust = Math.max(0, wear.dust - seconds / (raining ? 40 : 240));
    }
    if (snowing) {
      var frostWanted = Math.min(1, 0.4 + precipNow.amount);
      wear.frost += Math.max(0, frostWanted - wear.frost) * Math.min(1, seconds / 60);
    } else {
      // Below freezing it lingers; above, it melts.
      wear.frost = Math.max(0, wear.frost - seconds / (flow.temp <= 0 ? 900 : 180));
    }
  }
  function drawWear(v) {
    if (wear.dust < 0.01 && wear.frost < 0.01) {
      return;
    }
    var s = v.shape;
    var notWheels = new Path2D();
    notWheels.rect(-PAD, -PAD, v.length + 2 * PAD, 30);
    s.wheels.forEach(function (w) {
      notWheels.moveTo(w[0] + w[2] + 1, w[1]);
      notWheels.arc(w[0], w[1], w[2] + 1, 0, 6.2832);
    });
    ctx.save();
    ctx.transform(1, v.slope || 0, 0, 1, s.x, s.y + bodyDown(v, s.x - v.x));
    ctx.clip(s.path);
    ctx.clip(notWheels, 'evenodd');
    if (wear.dust >= 0.01) {
      ctx.fillStyle = vertical(ctx, 2, 18, [[0, css(DUST_COLOUR, 0)], [0.45, css(DUST_COLOUR, 0.12)], [1, css(DUST_COLOUR, 0.5)]]);
      ctx.globalAlpha = wear.dust;
      ctx.fillRect(0, 0, v.length, 18);
    }
    if (wear.frost >= 0.01) {
      ctx.fillStyle = vertical(ctx, 2, 13, [[0, css(FROST_COLOUR, 0.8)], [0.6, css(FROST_COLOUR, 0.25)], [1, css(FROST_COLOUR, 0)]]);
      ctx.globalAlpha = wear.frost;
      ctx.fillRect(0, 0, v.length, 13);
    }
    ctx.restore();
  }
  // The wiper seen side on: an arm rising up the windscreen's rake and back, set just proud
  // of the glass so it shows against what's behind the car rather than the pillar.
  var WIPER_BASE = [52.4, 7.4], WIPER_TOP = [47.5, 3], WIPE_SECONDS = 1.4;
  function drawWiper(v, time) {
    if (!precipNow || !precipNow.kind) {
      return;
    }
    var phase = (time / 1000 / WIPE_SECONDS) % 1;
    var reach = 0.15 + 0.75 * Math.pow(Math.sin(phase * Math.PI), 2);
    var s = v.shape;
    var baseX = s.x + WIPER_BASE[0], baseY = s.y + WIPER_BASE[1] + bodyDown(v, s.x - v.x + WIPER_BASE[0]);
    ctx.save();
    ctx.strokeStyle = '#0a0a0c';
    ctx.lineWidth = 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(baseX + (WIPER_TOP[0] - WIPER_BASE[0]) * reach, baseY + (WIPER_TOP[1] - WIPER_BASE[1]) * reach);
    ctx.stroke();
    ctx.restore();
  }

  // Another vehicle now and then, well faster or slower than us: a faster one passes us in
  // the far lane; a slower one's met ahead there or (half the time) in ours, so we catch it
  // up and overtake. Ours moves out to the far lane as it nears (`lane`, eased), and back
  // once clear; if we slow and it's the faster, it goes round us. Behind us it comes on and
  // goes off BEAMS back, past where its headlights reach, so by night its light slides on
  // and off the screen with it.
  var other = null, otherDue = 4, lane = 0, LANES = [RT + 39, RT + 20], BEAMS = 150;
  var NO_TRAFFIC = {aftermath: 1, warzone: 1, asteroids: 1, underworld: 1};
  function moveOther(seconds) {
    if (!other) {
      otherDue -= seconds;
      if (otherDue > 0) {
        return;
      }
      other = newOther();
      if (!other) {
        return;
      }
    }
    dontLinger(seconds);
    other.x += (other.speed - velocity) * seconds;
    other.wheel += other.speed * seconds / 5;
    if (other.x < -other.length - BEAMS || other.x > cols + 40) {
      other = null;
      otherDue = 2 + 5 * Math.random();
    }
  }
  // One whose speed ours has come close to would stay by us for minutes, keeping others off
  // the road: after LINGER seconds it picks up, or drops back if it's the slower.
  var MIN_GAP = 55, LINGER = 5, FASTEST = 0.75 * TOP;
  function dontLinger(seconds) {
    var gap = other.speed - velocity;
    other.beside = Math.abs(gap) < MIN_GAP ? other.beside + seconds : 0;
    if (other.beside > LINGER) {
      var slower = (gap < 0 || other.speed > FASTEST) && velocity > MIN_GAP;
      other.speed += (slower ? -1 : 1) * 25 * seconds;
    }
  }
  // A new vehicle, at a speed well off ours but no more than FASTEST (180 km/h: at any more
  // than that ours passes everyone), or none for now: none in a glitch, in the biomes nobody drives, or
  // after the bombs till the next biome.
  function newOther() {
    var gap = 65 + 85 * Math.random(), ahead = velocity > 120 && (velocity + gap > FASTEST || Math.random() < 0.5);
    var theirs = ahead ? Math.max(40, Math.min(FASTEST, velocity - gap)) : velocity + gap;
    var where = biomeAt(odometer + (ahead ? cols + 10 : 0), 1);
    if (glitch || NO_TRAFFIC[where] || (blast && blast.boom && spanAt(odometer) === blast.span)) {
      otherDue = 2;
      return null;
    }
    var traffic = TRAFFIC[where] || {kinds: EVERYDAY, paints: COLOURS};
    var kind = traffic.kinds[Math.floor(Math.random() * traffic.kinds.length)];
    // Only one we'd come up behind can be in our lane.
    var inOurLane = ahead && Math.random() < 0.5;
    var length = VEHICLES[kind].length;
    return {
      speed: theirs, wheel: 0, kind: kind, ground: inOurLane ? RT + 39 : RT + 20, ourLane: inOurLane, length: length,
      lane: 0, passing: false, beside: 0,
      x: ahead ? cols + 10 : -length - BEAMS,
      paint: OWN_PAINT[kind] || traffic.paints[Math.floor(Math.random() * traffic.paints.length)],
    };
  }
  // Exhaust: soft puffs from the back, left behind, more as it speeds up. Sharp, also spray
  // from the tyres on a wet road, and dust in the dry biomes.
  var puffs = [];
  function drawExhaust(seconds, carX, ground, pushing) {
    if (Math.random() < seconds * (2 + 12 * pushing)) {
      puffs.push({x: carX, y: ground - 5, age: 0, size: 1, colour: [210, 210, 214]});
    }
    var wet = roadWet > 0.05;
    var dusty = !wet && /desert|wasteland|badlands|aftermath|warzone|asteroids/.test(biomeAt(odometer + carX, 1));
    if (sharp && (wet || dusty) && velocity > 30) {
      lit.forEach(function (v) { kickUp(v, seconds, wet); });
    }
    puffs = puffs.filter(function (puff) {
      puff.age += seconds;
      puff.x -= (velocity * 0.9 + 6) * seconds;
      puff.y -= 3 * seconds;
      if (puff.age > 1.2 || puff.x < -6) {
        return false;
      }
      var colour = css(blend(puff.colour, [60, 60, 80], light.night), (puff.faint ? 0.18 : 0.4) * (1 - puff.age / 1.2));
      circle(ctx, puff.x, puff.y, (1 + puff.age * 2.5) * puff.size, colour);
      return true;
    });
  }
  function kickUp(v, seconds, wet) {
    var wheelsAt = v.shape ? v.shape.wheels : [];
    if (Math.random() < seconds * velocity / 12 * (wet ? roadWet : 1) && wheelsAt.length) {
      var w = wheelsAt[0];
      puffs.push({x: v.x + w[0] - 4, y: v.ground - 2, age: 0, size: wet ? 1.2 : 1.1, colour: wet ? [200, 210, 224] : [214, 180, 130], faint: true});
    }
  }
