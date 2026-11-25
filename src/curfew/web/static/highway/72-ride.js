  // ---------------------------------------------------------------- the ride --
  // Every vehicle's body rides on its springs: each axle's mass on a soft spring, well damped.
  // Mostly it leans with how it's driven: its nose rises as it gathers speed and dips as it
  // slows, the more the harder (SQUAT). Driven steadily it only drifts a little, on the road's
  // long swells; where the road would be broken (ROUGH, 0 to 1) it bounces over bumps and
  // holes, as if on harder, looser springs. The wheels stay on the road. What's drawn is where the body is, not how far
  // its springs are from the road: that's the road's own bumps, and at speed it buzzed.
  // [how quick its springs are, in bounces a second; how soon it's damped, 1 at once].
  var RIDE = {
    continental: [0.5, 0.62], monte: [0.55, 0.62], sedan: [0.6, 0.65], wagon: [0.6, 0.65], nova: [0.65, 0.65], ltd: [0.6, 0.65],
    pickup: [0.75, 0.65], rabbit: [0.85, 0.7], dmc: [0.85, 0.75], semi: [0.7, 0.7], rig: [0.7, 0.65], raider: [0.7, 0.6],
    buggy: [0.8, 0.55], blower: [0.85, 0.7], bike: [0.9, 0.7], armoured: [0.75, 0.7],
  };
  // The floating ones have no springs: they sway on their lift.
  var SWAY = [0.4, 0.6];
  var FLOATS = {wedge: 1, bubble: 1, hover: 1, hauler: 1, ebike: 1, flyingDmc: 1};
  var ROUGH = {aftermath: 1, warzone: 1, asteroids: 0.9, wasteland: 0.85, underworld: 0.6, badlands: 0.35, desert: 0.2};
  var MOST_TRAVEL = 1.2, SQUAT = 0.036;
  var swells = noise(seeded(401), 520), dips = noise(seeded(409), 230), holes = noise(seeded(421), 150), bumps = noise(seeded(431), 62);
  function roadHeight(at, rough) {
    var broken = rough * (1.5 * (holes(at) - 0.5) + 0.8 * (bumps(at) - 0.5));
    return 0.5 * (swells(at) - 0.5) + 0.18 * (dips(at) - 0.5) + broken;
  }
  function ride(v, speed, seconds) {
    var meta = VEHICLES[v.kind], springs = RIDE[v.kind] || (FLOATS[v.kind] ? SWAY : RIDE.sedan);
    if (!v.axles) {
      v.axles = [{z: 0, v: 0}, {z: 0, v: 0}];
      v.rough = 0;
      v.pull = 0;
      v.was = speed;
    }
    var wheelsAt = v.shape ? v.shape.wheels : [];
    var rear = wheelsAt.length > 1 ? wheelsAt[0][0] : meta.length * 0.2;
    var front = wheelsAt.length > 1 ? wheelsAt[wheelsAt.length - 1][0] : meta.length * 0.8;
    var wanted = ROUGH[biomeAt(odometer + v.x, 1)] || 0;
    v.rough += (wanted - v.rough) * Math.min(1, seconds);
    if (seconds > 0) {
      v.pull += ((speed - v.was) / seconds - v.pull) * Math.min(1, seconds * 4);
    }
    v.was = speed;
    settle(v.axles[0], odometer + v.x + rear, speed, v.rough, -SQUAT * v.pull, springs, seconds);
    settle(v.axles[1], odometer + v.x + front, speed, v.rough, SQUAT * v.pull, springs, seconds);
    // Down the screen is down: a straight line through both axles, the springs stiffer
    // toward their ends.
    var down = v.axles.map(function (axle) { return -MOST_TRAVEL * Math.tanh(axle.z / MOST_TRAVEL); });
    v.slope = (down[1] - down[0]) / (front - rear);
    v.lift = down[0] - v.slope * rear;
  }
  // One axle, in steps short enough to be steady at any frame rate. `lean`: where its load
  // moves it to, up positive, as the road's height is.
  function settle(axle, at, speed, rough, lean, springs, seconds) {
    var quick = 6.2832 * springs[0] * (1 + 1.3 * rough), stiff = quick * quick, damp = 2 * springs[1] * (1 - 0.45 * rough) * quick;
    var steps = Math.max(1, Math.ceil(Math.min(seconds, 0.1) / 0.012)), dt = Math.min(seconds, 0.1) / steps;
    for (var s = 1; s <= steps; s += 1) {
      var here = at - speed * dt * (steps - s);
      var road = roadHeight(here, rough);
      var climb = (roadHeight(here + 1, rough) - roadHeight(here - 1, rough)) / 2 * speed;
      axle.v += (stiff * (road + lean - axle.z) + damp * (climb - axle.v)) * dt;
      axle.z += axle.v * dt;
    }
  }
  // How far down a vehicle's body is, at `x` along it.
  function bodyDown(v, x) {
    return (v.lift || 0) + (v.slope || 0) * x;
  }
  // While a body's drawn it's sheared by its ride (`riding`: {slope, down} in the scene), and
  // what stays on the road, its wheels and its shadow, is drawn back out of it (`onRoad`).
  var riding = null, arched = false;
  function onRoad(p, draw) {
    if (!riding) {
      draw();
      return;
    }
    p.save();
    p.transform(1, -riding.slope, 0, 1, 0, -riding.down);
    draw();
    p.restore();
  }
  // The wheels of an arched body are seen only below its arches, so as it sinks they tuck
  // up into it.
  function clipToArches(p, x, cy, at, r, slope, down) {
    p.beginPath();
    at.forEach(function (wx) {
      var cx = x + wx, arch = cy + down + slope * cx;
      p.moveTo(cx - r, arch + 30);
      p.lineTo(cx - r, arch);
      p.arc(cx, arch, r + 1, Math.PI, 0);
      p.lineTo(cx + r, arch);
      p.lineTo(cx + r, arch + 30);
      p.closePath();
    });
    p.clip();
  }
