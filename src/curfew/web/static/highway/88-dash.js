  // ----------------------------------------------------- the drive and the dial --
  // How hard the house is using its line, 0 to 1, on a log scale so a quiet evening still
  // moves: the car's target speed is this share of TOP.
  function pace() {
    var used = flow.wan.down + flow.wan.up, line = (flow.line[0] || 1e9) + (flow.line[1] || 1e9);
    if (used < 2000) {
      return 0;
    }
    return Math.max(0.04, Math.min(1, Math.log10(1 + used / 1e4) / Math.log10(1 + line / 1e4)));
  }
  // An automatic of four gears (GEARS, each's ratio). The revs (`box.rpm`, a share of the
  // red line) come from the speed and the gear. Up a gear as the revs climb, later the
  // harder it's pushing; down one when pushed hard and the gear below has room, or as the
  // revs fall coasting; never two within SETTLE seconds. Each upshift is a moment's lull in
  // the pull, a lower gear pulls harder (PULLS), and the shift is handed to the sound once.
  var GEARS = [3.1, 1.95, 1.38, 1.0], PULLS = [1.25, 1.1, 0.95, 0.85], SETTLE = 0.9;
  var box = {gear: 0, rpm: 0.14, shifting: 0, since: SETTLE, shift: null};
  function shiftGears(seconds, throttle) {
    var v = velocity / TOP, up = 0.5 + 0.38 * Math.max(0, throttle);
    var revs = function (g) { return 0.14 + v * GEARS[g] * 0.86; };
    box.since += seconds;
    box.shifting = Math.max(0, box.shifting - seconds);
    if (box.since > SETTLE) {
      var kickdown = throttle > 0.5 || (throttle <= 0.05 && revs(box.gear) < 0.32);
      if (box.gear < GEARS.length - 1 && revs(box.gear) > up) {
        box.gear += 1;
        box.since = 0;
        box.shifting = 0.35;
        box.shift = 'up';
      } else if (box.gear > 0 && revs(box.gear - 1) < up - 0.06 && kickdown) {
        box.gear -= 1;
        box.since = 0;
        box.shift = 'down';
      }
    }
    box.rpm += (revs(box.gear) - box.rpm) * Math.min(1, seconds * (box.since < 0.3 ? 14 : 8));
  }
  // The speed eases toward the use (over EASE seconds, so a reading's jump isn't a lurch),
  // gathering or losing speed the gentler the nearer it is. Returns what the frame needs.
  var aim = 0, DIAL = 240;
  function drive(seconds, calm) {
    if (!odometer) {
      // Setting off at a moderate speed, in the gear for it.
      velocity = aim = START;
      box.gear = 2;
    }
    var wanted = Math.max(pace() * TOP * (1 - 0.5 * calm), flow.minSpeed / DIAL * TOP);
    aim += (wanted - aim) * Math.min(1, seconds / EASE);
    var target = aim, pushing = target > velocity + 5 ? 1 : 0, pull = (target - velocity) * Math.min(1, seconds / 1.5);
    var throttle = Math.max(-1, Math.min(1, (target - velocity) / TOP * 5));
    shiftGears(seconds, throttle);
    var grip = PULLS[box.gear] * (box.shifting > 0.12 ? 0.25 : 1);
    velocity += Math.max(-BRAKE * seconds, Math.min(ACCEL * grip * seconds, pull));
    odometer += velocity * seconds;
    wheel += velocity * seconds / 5;
    return {target: target, pushing: pushing, throttle: throttle};
  }
  // A dial, 0 to 240 km/h (all of the line is 240): its ticks (the last red), the arc so
  // far, the needle, the speed in figures, the gear, lit a moment as it shifts, and the
  // minimum speed, if one's set.
  function drawSpeedo() {
    var kmh = velocity / TOP * DIAL, x = cols - 32, y = flow.height / k * 0.11 + 22, r = 20;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    var from = Math.PI * 0.75, span = Math.PI * 1.5;
    ctx.lineCap = 'round';
    for (var s = 0; s <= DIAL; s += 20) {
      var a = from + span * s / DIAL, long = s % 40 ? 2.5 : 4.5;
      ctx.strokeStyle = s >= 200 ? '#ff5a4a' : 'rgba(236, 238, 246, 0.85)';
      ctx.lineWidth = s % 40 ? 0.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * (r - long), y + Math.sin(a) * (r - long));
      ctx.stroke();
    }
    var needle = from + span * Math.min(1, kmh / DIAL);
    ctx.strokeStyle = '#f8a040';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.4, from, needle);
    ctx.stroke();
    ctx.strokeStyle = '#ff6040';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(needle) * (r - 3), y + Math.sin(needle) * (r - 3));
    ctx.stroke();
    circle(ctx, x, y, 1.8, '#e8e8f0');
    if (flow.minSpeed) {
      markMinimum(x, y, r, from + span * flow.minSpeed / DIAL);
    }
    var figures = String(Math.round(kmh));
    ctx.fillStyle = '#f4f4f8';
    ctx.textAlign = 'center';
    ctx.font = '700 9px amazon-ember, "Amazon Ember", Inter, sans-serif';
    ctx.fillText(gl.g > 0 ? scrambled(figures) : figures, x, y + 12);
    ctx.fillStyle = 'rgba(236, 238, 246, 0.7)';
    ctx.font = '600 4px amazon-ember, "Amazon Ember", Inter, sans-serif';
    ctx.fillText('KM/H', x, y + 17);
    ctx.fillStyle = box.since < 0.6 ? '#f8a040' : 'rgba(236, 238, 246, 0.8)';
    ctx.font = '700 4.6px amazon-ember, "Amazon Ember", Inter, sans-serif';
    ctx.fillText('D' + (box.gear + 1), x, y - 6);
    ctx.lineCap = 'butt';
    ctx.textAlign = 'left';
  }
  // A wedge on the rim pointing in at the minimum speed, with a line across the ticks.
  function markMinimum(x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = ctx.strokeStyle = '#58d0ff';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(r - 5, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r - 0.2, 0);
    ctx.lineTo(r + 4, -2);
    ctx.lineTo(r + 4, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Sharp: speed streaks low down past the foreground at a good lick.
  function streaks() {
    var f = velocity / TOP - 0.55;
    if (!sharp || f <= 0) {
      return;
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.min(0.22, f * 0.6).toFixed(3) + ')';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (var i = 0; i < 10; i += 1) {
      var y = i < 7 ? RT + 46 + i * 2.2 : RT + 8 + (i - 7) * 12, span = cols + 120;
      var x = ((i * 197.3 - odometer * 2.4) % span + span) % span - 60;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + 60 * f, y);
    }
    ctx.stroke();
  }
