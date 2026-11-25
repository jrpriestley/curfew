// curfew's screensaver: Highway. A car seen from the side, driving through layers of
// parallax scenery that changes biome as it goes. The car's speed is the house's use of
// the internet line. These parts (highway/*.js) are joined, in order, into one function.
var flowScenes = window.flowScenes || (window.flowScenes = {});

flowScenes.highway = function (flow) {
  var ctx = flow.ctx, sharp = flow.sharp;
  // The screen is ROWS units high and as wide as its shape (`cols`); a unit is `k` pixels.
  // RT is the road's top edge, in units.
  var ROWS = 240, TILE = 640, SPAN = 14000, LAMP_GAP = 120;
  // Speeds in units a second: TOP at full use of the line, START when setting off (80 km/h).
  // EASE is the seconds it takes to follow a change in use.
  var TOP = 400, ACCEL = 45, BRAKE = 70, EASE = 3, START = TOP / 3;
  var cols = 427, k = 1, RT = 178, odometer = 0, velocity = 0, wheel = 0;

  function seeded(seed) {
    var state = Math.abs(Math.floor(seed)) % 2147483646 + 1;
    return function () {
      state = state * 16807 % 2147483647;
      return (state - 1) / 2147483646;
    };
  }
  // Smooth 1-D noise: 64 random knots, eased between with a cosine.
  function noise(random, spacing) {
    var knots = [];
    for (var i = 0; i < 64; i += 1) {
      knots.push(random());
    }
    return function (x) {
      var f = x / spacing, i = Math.floor(f), t = f - i;
      var s = (1 - Math.cos(t * Math.PI)) / 2;
      return knots[((i % 64) + 64) % 64] * (1 - s) + knots[(((i + 1) % 64) + 64) % 64] * s;
    };
  }
  function hashOf(text) {
    return Math.floor(flow.hash(text) * 2147483000);
  }

  // ----------------------------------------------------------------- colours --
  var SKIES = {
    day: {top: [40, 96, 200], low: [168, 208, 240], sun: [255, 244, 190]},
    dusk: {top: [56, 40, 120], low: [248, 144, 96], sun: [255, 176, 104]},
    night: {top: [4, 6, 22], low: [22, 30, 64], sun: [232, 236, 255]},
  };
  // Each biome's shift of the sky's colour, by day.
  var TINTS = {
    country: [0, 0, 0], city: [-8, -4, -8], desert: [24, 12, -24], coast: [-8, 8, 16],
    wasteland: [38, 2, -36], future: [-14, 6, 16], badlands: [30, -8, 14], atomic: [8, 6, -6],
    aftermath: [34, 4, -30], warzone: [-26, -20, -2], asteroids: [16, -10, -6], underworld: [70, -40, -60],
  };
  // Materials by daylight; tone() adjusts them for the light, the season and the distance.
  var STUFF = {
    rock: [128, 128, 148], rockDark: [84, 84, 108], snow: [244, 246, 252], snowDark: [190, 198, 222],
    grass: [76, 150, 66], grassDark: [40, 100, 46], tree: [40, 104, 58], treeDark: [18, 60, 36], treeLight: [110, 170, 80],
    pine: [40, 104, 58], pineDark: [18, 60, 36],
    field: [160, 172, 78], field2: [118, 146, 58], earth: [124, 92, 62],
    sand: [234, 204, 142], sandDark: [196, 150, 96], mesa: [206, 116, 74], mesaDark: [140, 66, 52],
    city: [124, 132, 156], cityDark: [82, 86, 110], cityPale: [176, 184, 204], window: [196, 214, 232],
    sea: [40, 116, 188], seaDark: [18, 66, 128], foam: [236, 246, 252], cliff: [182, 166, 140], cliffDark: [116, 100, 84],
    road: [62, 62, 70], roadLight: [92, 92, 100], line: [236, 236, 220], rail: [184, 186, 194], kerb: [196, 48, 40],
    white: [238, 238, 238], cactus: [70, 128, 66], wall: [196, 180, 160], roof: [158, 66, 56], cloud: [250, 250, 253],
    cloudShade: [196, 204, 224], pavement: [150, 150, 156],
    rust: [150, 74, 40], rustDark: [92, 44, 26], ash: [84, 78, 74], scorch: [44, 38, 34], dust: [200, 160, 112], dustDark: [150, 112, 76],
    concrete: [150, 144, 134], concreteDark: [96, 90, 84],
    glass: [132, 182, 200], glassDark: [46, 74, 98], steel: [150, 160, 172], steelPale: [214, 222, 230],
    plaza: [176, 184, 190], plazaDark: [112, 122, 132],
    trim: [64, 136, 92], salt: [230, 216, 192], saltDark: [184, 160, 126], tower: [118, 104, 96], towerDark: [62, 54, 52],
    cream: [238, 228, 204], teal: [104, 184, 176], salmon: [232, 146, 124], mustard: [222, 184, 84],
    hellrock: [112, 36, 34], hellDark: [52, 16, 20], brick: [64, 26, 34], brickDark: [32, 12, 18],
  };
  var NEON = [[80, 230, 255], [255, 84, 196], [170, 255, 120]];
  function css(c, alpha) {
    var r = Math.max(0, Math.min(255, Math.round(c[0])));
    var g = Math.max(0, Math.min(255, Math.round(c[1])));
    var b = Math.max(0, Math.min(255, Math.round(c[2])));
    if (alpha === undefined) {
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function blend(a, b, f) {
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  // `remakes`: how many cached pictures may be redrawn for a change of light this frame,
  // so a change of light is spread over frames instead of stalling one.
  var light = {night: 0, warm: 0, hour: 12}, tint = [0, 0, 0], version = 0, sky = null, colours = {}, remakes = 1;
  function skyColour(key) {
    var c = blend(SKIES.day[key], SKIES.night[key], light.night);
    c = blend(c, SKIES.dusk[key], Math.min(1, light.warm) * 0.8 * (1 - 0.5 * light.night));
    if (key !== 'sun') {
      var cloudy = [120, 126, 140].map(function (g) { return g * (1 - 0.85 * light.night); });
      c = blend(c, cloudy, 0.55 * flow.overcast);
    }
    var day = 1 - light.night;
    return [c[0] + tint[0] * day, c[1] + tint[1] * day, c[2] + tint[2] * day];
  }
  // What grows, by season: [autumn colour, bare colour]. Grass and fields don't turn, only fade.
  var LEAVES = {
    tree: [[176, 92, 34], [104, 90, 80]], treeDark: [[120, 50, 28], [70, 58, 54]], treeLight: [[222, 168, 60], [132, 118, 104]],
    grass: [null, [112, 126, 74]], grassDark: [null, [74, 88, 56]], field: [null, [168, 158, 104]], field2: [null, [138, 132, 86]],
  };
  // Leaves turn through October, fall from late November, and are back by May.
  function seasonNow() {
    var date = new Date();
    var day = (date - new Date(date.getFullYear(), 0, 1)) / 864e5;
    function ease(f) {
      f = Math.max(0, Math.min(1, f));
      return f * f * (3 - 2 * f);
    }
    var bare = day >= 180 ? ease((day - 322) / 22) : 1 - ease((day - 98) / 26);
    var autumn = day >= 180 ? ease((day - 268) / 25) * (1 - bare) : 0;
    return {autumn: autumn, bare: bare};
  }
  // A material's colour now, `haze` of the way into the sky's low colour. Lit things (the
  // road and what's on it) aren't darkened for night: the shade over them does that, so
  // their lights keep their true colours. Kept until the light changes.
  function tone(key, haze, lit) {
    var name = key + (haze || 0).toFixed(2) + (lit ? 'lit' : '');
    if (colours[name]) {
      return colours[name];
    }
    var c = STUFF[key], leaves = LEAVES[key];
    if (leaves) {
      var season = seasonNow();
      if (leaves[0]) {
        c = blend(c, leaves[0], season.autumn);
      }
      c = blend(c, leaves[1], season.bare * (leaves[0] ? 1 : 0.5));
    }
    var warm = Math.min(1, light.warm);
    if (haze) {
      // A low sun makes the distance hazier.
      haze = Math.min(0.92, haze * (1 + 0.45 * warm * (1 - light.night)));
    }
    c = blend(c, [255, 150, 100].map(function (w, i) { return (w + c[i]) / 2; }), 0.3 * warm);
    if (!lit) {
      c = blend(c, blend(c.map(function (v) { return v * 0.2; }), [8, 12, 34], 0.45), light.night);
    }
    if (flow.snowCover > 0.3 && /grass|field|tree|pine/.test(key)) {
      c = blend(c, blend(STUFF.snow, [56, 62, 92], light.night), 0.6);
    }
    return (colours[name] = blend(c, skyColour('low'), haze || 0));
  }
  function stuff(key, haze, alpha) {
    return css(tone(key, haze), alpha);
  }
  function near(key, alpha) {
    return css(tone(key, 0, true), alpha);
  }
  // A vertical gradient, [[at, colour], ...]. Those for the screen are kept until the light
  // changes: most are the same every frame. Don't use it for ones whose ends move every
  // frame; they'd fill the cache.
  var gradients = {}, gradientCount = 0;
  function vertical(p, y0, y1, stops) {
    var key = null;
    if (p === ctx) {
      key = y0 + ',' + y1;
      for (var i = 0; i < stops.length; i += 1) {
        key += '|' + stops[i][0] + stops[i][1];
      }
      if (gradients[key]) {
        return gradients[key];
      }
    }
    var g = p.createLinearGradient(0, y0, 0, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    if (key) {
      if (gradientCount > 600) {
        gradients = {};
        gradientCount = 0;
      }
      gradients[key] = g;
      gradientCount += 1;
    }
    return g;
  }

  // ------------------------------------------------------------------ the sky --
  // Drawn once into a picture, again when the light changes, at up to 2 pixels a unit
  // (it's soft anyway). `sunAt` keeps where the sun or moon is, for shadows and reflections:
  // up (0 to 1), side (-1 left to 1 right), x, colour and shine.
  var skyScale = 1, sunAt = {up: 0, side: 0};
  function makeSky() {
    colours = {};
    sprites = {};
    gradients = {};
    gradientCount = 0;
    skyScale = Math.min(k, 2);
    var made = document.createElement('canvas'), horizon = RT - 70;
    made.width = Math.ceil(cols * skyScale);
    made.height = Math.ceil(RT * skyScale);
    var p = made.getContext('2d'), top = skyColour('top'), low = skyColour('low');
    p.scale(skyScale, skyScale);
    p.fillStyle = vertical(p, 0, horizon, [[0, css(top)], [0.7, css(blend(top, low, 0.6))], [1, css(low)]]);
    // All of it: the canvas is rounded up, and a sliver left clear shows at the right.
    p.fillRect(0, 0, made.width / skyScale, made.height / skyScale);
    if (light.night > 0.15) {
      drawStars(p, horizon);
    }
    var sun = flow.sun, hour = light.hour, f;
    sunAt = {up: 0, side: 0};
    if (hour > sun[0] && hour < sun[3]) {
      f = (hour - sun[1] + 0.5) / (sun[2] - sun[1] + 1);
      var arc = Math.sin(Math.PI * Math.max(0, Math.min(1, f)));
      sunAt = {up: arc, side: Math.max(-1, Math.min(1, (f - 0.5) * 2))};
      orb(p, cols * (0.12 + 0.76 * f), horizon * (0.95 - 0.75 * arc), 9, skyColour('sun'), false);
      sunAt.x = cols * (0.12 + 0.76 * f);
      sunAt.colour = skyColour('sun');
      sunAt.shine = (0.35 + 0.45 * (1 - sunAt.up)) * (1 - 0.85 * flow.overcast);
    } else if (flow.moonlit > 0.05 || light.night > 0.4) {
      f = ((hour - sun[3] + 24) % 24) / (24 - sun[3] + sun[0]);
      p.globalAlpha = Math.max(Math.min(1, flow.moonlit * 4), Math.min(1, (light.night - 0.4) * 5));
      orb(p, cols * (0.12 + 0.76 * f), horizon * (0.85 - 0.6 * Math.sin(Math.PI * f)), 10, [234, 236, 246], true);
      sunAt.x = cols * (0.12 + 0.76 * f);
      sunAt.colour = [214, 222, 246];
      sunAt.shine = 0.45 * p.globalAlpha * (1 - 0.85 * flow.overcast);
      p.globalAlpha = 1;
    }
    sky = made;
  }
  function drawStars(p, horizon) {
    var random = seeded(7);
    for (var s = 0; s < 220; s += 1) {
      var x = random() * cols, y = random() * horizon * 0.85, bright = random();
      p.globalAlpha = Math.min(1, (light.night - 0.15) * 1.6) * (0.3 + 0.7 * bright) * (1 - flow.overcast);
      p.fillStyle = bright > 0.8 ? '#ffffff' : '#c8d0f0';
      p.beginPath();
      p.arc(x, y, 0.25 + bright * 0.45, 0, 6.2832);
      p.fill();
    }
    p.globalAlpha = 1;
  }
  var CRATERS = [[-3.5, -2.5, 2.6], [2.6, 2, 3.2], [-1.5, 4.5, 1.6], [4.2, -4, 1.6], [-5.4, 1.5, 1]];
  function orb(p, x, y, r, colour, moon) {
    var glow = p.createRadialGradient(x, y, r * 0.8, x, y, r * (moon ? 4 : 6));
    glow.addColorStop(0, css(colour, moon ? 0.35 : 0.6));
    glow.addColorStop(1, css(colour, 0));
    p.fillStyle = glow;
    p.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    var face = p.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    face.addColorStop(0, css(blend(colour, [255, 255, 255], 0.6)));
    face.addColorStop(1, css(colour));
    p.fillStyle = face;
    p.beginPath();
    p.arc(x, y, r, 0, 6.2832);
    p.fill();
    if (moon) {
      p.fillStyle = css([150, 156, 180], 0.45);
      CRATERS.forEach(function (c) {
        p.beginPath();
        p.arc(x + c[0], y + c[1], c[2], 0, 6.2832);
        p.fill();
      });
    }
  }
