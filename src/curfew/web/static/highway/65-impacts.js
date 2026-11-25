  // ------------------------------------------------------------ the asteroid field --
  // Rocks fall into the land behind the road, never onto it. Each targets either a tower on
  // the skyline (which is a ruin from then on) or the ground at some depth between the
  // skyline and the hills. On impact: a fireball, sparks and dust thrown up, a crater left
  // burning and smoking, a small flash over the screen, a boom. Everything is kept in its
  // layer's own units (`at`, at its `rate`) so it scrolls with what it hit.
  var HIT_LEFT = 0.45, FAR_RATE = 0.07, NEAR_RATE = 0.16, SKYLINE_FOOT = RT - 66;
  var FIRE = [255, 150, 60], HOT = [255, 236, 190], EMBER = [255, 110, 40];
  var rocks = [], bits = [], craters = [], smashed = {}, rockDue = 2;
  function depthY(depth) {
    return SKYLINE_FOOT + 66 * depth;
  }
  function layerX(item) {
    return item.at - odometer * item.rate;
  }
  // A tower in sight still standing, for a rock to hit (as drawRises places them).
  function standingTower() {
    var rise = RISES.asteroids, layer = odometer * FAR_RATE, found = [];
    for (var m = Math.floor((layer + 40) / rise.gap); m <= Math.floor((layer + cols - 40) / rise.gap); m += 1) {
      var seed = seeded(m * 7919 + rise.salt)();
      var at = m * rise.gap + seed * rise.gap * 0.35;
      var sprite = riseSprites['asteroids' + m];
      if (seed > 1 - rise.empty || smashed[m] || !sprite) {
        continue;
      }
      found.push({m: m, seed: seed, at: at + sprite.width / 2, y: SKYLINE_FOOT - 4 - (sprite.height - 4) * HIT_LEFT});
    }
    return found.length ? found[Math.floor(Math.random() * found.length)] : null;
  }
  function launchRock() {
    var tower = Math.random() < 0.35 ? standingTower() : null;
    var rock;
    if (tower) {
      // Its ruin made now, while the rock falls, so the impact's frame makes nothing.
      riseSprite('asteroids-ruined' + tower.m, RISES.asteroidsHit, tower.seed, Math.min(k, 2)).used = Date.now();
      rock = {tower: tower.m, depth: 0, rate: FAR_RATE, at: tower.at, y: tower.y};
    } else {
      var depth = Math.random();
      var rate = FAR_RATE + (NEAR_RATE - FAR_RATE) * depth;
      rock = {depth: depth, rate: rate, at: odometer * rate + cols * (0.1 + 0.85 * Math.random()), y: depthY(depth)};
    }
    rock.size = (1 + Math.random()) * (0.7 + 0.6 * rock.depth);
    rock.fall = 1.3 + 0.8 * Math.random();
    rock.age = 0;
    rock.slant = (Math.random() < 0.5 ? -1 : 1) * (0.5 + 0.6 * Math.random());
    rocks.push(rock);
  }
  function rockAt(rock) {
    var left = 1 - Math.pow(Math.min(1, rock.age / rock.fall), 1.4);
    var drop = rock.y + 30;
    return {x: layerX(rock) - rock.slant * drop * left, y: rock.y - drop * left};
  }
  function impact(rock) {
    if (rock.tower !== undefined) {
      smashed[rock.tower] = true;
    }
    var nearness = 0.4 + 0.6 * rock.depth;
    smallFlash = Math.max(smallFlash, Math.min(0.16, 0.05 + 0.08 * rock.size * nearness));
    var sparks = sharp ? 18 : 9, puffs = sharp ? 10 : 5, chunks = sharp ? 6 : 3;
    bits.push({kind: 'fireball', rate: rock.rate, at: rock.at, y: rock.y, life: 0.8, age: 0, size: rock.size, dx: 0});
    for (var i = 0; i < sparks; i += 1) {
      bits.push({kind: 'spark', rate: rock.rate, at: rock.at, y: rock.y, life: 0.8 + Math.random() * 0.8, age: 0,
        dx: (Math.random() - 0.5) * 60 * rock.size, dy: -(40 + Math.random() * 60) * rock.size});
    }
    for (var j = 0; j < puffs; j += 1) {
      bits.push({kind: 'dust', rate: rock.rate, at: rock.at, y: rock.y, life: 3 + Math.random() * 2.5, age: 0, size: rock.size,
        dx: (Math.random() - 0.5) * 30 * rock.size, dy: -(8 + Math.random() * 16) * rock.size});
    }
    for (var c = 0; c < chunks; c += 1) {
      bits.push({kind: 'chunk', rate: rock.rate, at: rock.at, y: rock.y, life: 1.6, age: 0, size: rock.size,
        dx: (Math.random() - 0.5) * 50 * rock.size, dy: -(30 + Math.random() * 40) * rock.size});
    }
    craters.push({rate: rock.rate, at: rock.at, y: rock.y, size: rock.size, age: 0, life: 14});
  }
  // Called after the band: what's nearer (the hills) hides what falls behind it.
  function drawImpacts(time, seconds) {
    var here = deepIn(odometer + cols * 0.5, 'asteroids');
    if (here > 0.3 && (rockDue -= seconds) <= 0) {
      rockDue = 1 + Math.random() * 2.6;
      launchRock();
    }
    if (!rocks.length && !bits.length && !craters.length) {
      return;
    }
    var dim = light.night * 0.8;
    var dust = blend([150, 132, 110], [26, 24, 30], dim), smoke = blend([70, 66, 64], [14, 14, 18], dim);
    craters = craters.filter(function (c) {
      c.age += seconds;
      var x = layerX(c), fade = 1 - c.age / c.life;
      if (fade <= 0 || x < -60 || x > cols + 60) {
        return false;
      }
      for (var s = 0; s < 4; s += 1) {
        var rise = (c.age * 0.25 + s / 4) % 1;
        circle(ctx, x + rise * 10 * c.size + flow.windX * 20 * rise, c.y - rise * 55 * c.size, (3 + rise * 10) * c.size, css(smoke, 0.4 * fade * (1 - rise)));
      }
      ctx.globalCompositeOperation = 'lighter';
      glow(x, c.y - 1, 5 * c.size, EMBER, (0.5 + 0.2 * Math.sin(time / 90 + c.at)) * fade);
      ctx.globalCompositeOperation = 'source-over';
      return true;
    });
    bits = bits.filter(function (b) {
      b.age += seconds;
      if (b.age >= b.life) {
        return false;
      }
      var fade = 1 - b.age / b.life, x = layerX(b) + b.dx * b.age, y;
      if (b.kind === 'fireball') {
        var grown = 1 - fade * fade;
        ctx.globalCompositeOperation = 'lighter';
        glow(x, b.y - 10 * grown * b.size, (8 + 16 * grown) * b.size, FIRE, fade);
        glow(x, b.y - 6 * grown * b.size, (5 + 8 * grown) * b.size, HOT, fade * fade);
        ctx.globalCompositeOperation = 'source-over';
      } else if (b.kind === 'spark' || b.kind === 'chunk') {
        y = b.y + b.dy * b.age + 50 * b.age * b.age;
        if (y > b.y) {
          return false;
        }
        if (b.kind === 'chunk') {
          circle(ctx, x, y, 0.9 * b.size, '#2a2420');
        } else {
          ctx.globalCompositeOperation = 'lighter';
          glow(x, y, 2, FIRE, fade);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        y = b.y + b.dy * b.age * (1 - b.age / (2 * b.life));
        circle(ctx, x, y, (3 + 12 * (1 - fade)) * b.size, css(dust, 0.55 * fade));
      }
      return true;
    });
    rocks = rocks.filter(function (rock) {
      rock.age += seconds;
      hearImpact(rock);
      if (rock.age >= rock.fall) {
        impact(rock);
        return false;
      }
      drawRock(rock);
      return true;
    });
  }
  // Asked for before it lands, so that it's heard as it does: the rush as it comes down, the
  // impact, and what that throws up.
  function hearImpact(rock) {
    if (!flow.sound || rock.heard) {
      return;
    }
    rock.heard = true;
    var left = rock.fall - rock.age, loud = Math.min(0.9, 0.25 + 0.4 * (0.4 + 0.6 * rock.depth) * rock.size), pan = layerX(rock) / cols * 2 - 1;
    flow.sound.fall(1.1 * loud, left, pan);
    flow.sound.shot('impact', loud, left, pan);
    flow.sound.shot('debris', 0.6 * loud, left + 0.33, pan);
  }
  function drawRock(rock) {
    var at = rockAt(rock);
    var length = 50 * rock.size, way = Math.atan2(rock.y + 30, rock.slant * (rock.y + 30));
    var tailX = at.x - Math.cos(way) * length, tailY = at.y - Math.sin(way) * length;
    ctx.globalCompositeOperation = 'lighter';
    var trail = ctx.createLinearGradient(tailX, tailY, at.x, at.y);
    trail.addColorStop(0, css(FIRE, 0));
    trail.addColorStop(1, css(FIRE, 0.75));
    ctx.strokeStyle = trail;
    ctx.lineWidth = 2 * rock.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
    ctx.lineCap = 'butt';
    glow(at.x, at.y, 6 * rock.size, HOT, 1);
    glow(at.x, at.y, 12 * rock.size, FIRE, 0.4);
    ctx.globalCompositeOperation = 'source-over';
    circle(ctx, at.x, at.y, 1.4 * rock.size, '#2a2420');
  }
