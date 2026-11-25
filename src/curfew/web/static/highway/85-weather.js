  // ------------------------------------------------------------ the weather --
  // `precipNow` is this frame's: homehub's.
  var precipNow = null;
  // How wet the road is, 0 to 1. It wets in a few seconds and dries more slowly, so what
  // shows on a wet road (reflections, glints, spray) fades with it rather than switching
  // with the rain.
  var roadWet = 0;
  function wetRoad(seconds) {
    var raining = precipNow && precipNow.kind === 'rain';
    var target = raining ? Math.min(1, 0.4 + (precipNow.amount || 0.5)) : 0;
    roadWet += (target - roadWet) * Math.min(1, seconds / (raining ? 4 : 10));
  }
  var drops = [];
  function drawWeather(seconds) {
    var precip = precipNow, snow = precip && precip.kind === 'snow', rows = flow.height / k;
    var want = precip && precip.kind ? Math.round((sharp ? 260 : 140) * precip.amount) : 0;
    while (drops.length < want) {
      drops.push({x: Math.random() * cols, y: Math.random() * rows, z: 0.5 + Math.random() * 0.5});
    }
    drops.length = Math.min(drops.length, want);
    ctx.strokeStyle = css(blend([190, 204, 230], [70, 80, 110], light.night), 0.55);
    ctx.fillStyle = 'rgba(240, 242, 250, 0.9)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    drops.forEach(function (d) { moveDrop(d, seconds, snow, rows); });
    if (snow) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  function moveDrop(d, seconds, snow, rows) {
    var fall = (snow ? 30 : 240) * d.z;
    var drift = -(velocity * (snow ? 0.6 : 0.3)) * d.z + 40 * flow.windX * (snow ? 1 : 0.4);
    d.y += fall * seconds;
    d.x += drift * seconds + (snow ? Math.sin(d.y / 9) * 0.3 : 0);
    if (d.y > rows) {
      d.y -= rows;
      d.x = Math.random() * cols;
    }
    d.x = (d.x % cols + cols) % cols;
    if (snow) {
      ctx.moveTo(d.x + d.z, d.y);
      ctx.arc(d.x, d.y, d.z * 0.9, 0, 6.2832);
    } else {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + drift * 0.012, d.y + 4 * d.z);
    }
  }
