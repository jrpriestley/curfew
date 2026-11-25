// curfew's screensaver: Highway's sound (Web Audio): the road and the wind made as they play,
// the rest made ready once (flow-shots.js: recordings, the engine's loops) and played. Off unless chosen (Settings on the TV, Controls at a computer:
// the curfew_sound cookie). A browser lets it start only after a click or a key; the
// TV's app lets it start at once. The scene says each frame how things are (`drive`);
// when it stops saying (another theme, the screen away), the sound fades out.
// The world's sounds go through `world`, which the glitch's void takes to nothing; the
// whiteout's hiss goes past it. Of them the steady ones (the engine, the road, the weather)
// go through `bed`, which ducks under a shot, as an ear does: it's the louder for it.
// `level`: 'off', 'background' (all but our engine) or 'full'.
window.flowSound = function (level) {
  var VOLUME = 0.55, EVERY = 0.07;
  var ac = null, n = {}, last = 0, told = 0, want = level !== 'off', noise = null, nextWar = 0, shifted = {at: -9, up: true};
  var made = {}, sounding = 0, MOST_SOUNDING = 14, LOOP_RPM = 900, IDLE_RPM = 540, RED_RPM = 3100, PASS_NEAREST = 4.5, FALL_LANDS = 2.2, AT_EDGE = 0.45, PORTAL = 0.04;
  // The recordings have little of the bottom: a generated thump under each that should.
  var THUMPS = {blast: 0.5, impact: 0.55, cannon: 0.4};
  function filter(type, freq, q) {
    var f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    return f;
  }
  // A loop of the noise from somewhere in it, through a filter, into a gain; returns the
  // gain node.
  function filteredNoise(type, freq, q) {
    var s = ac.createBufferSource(), tone = filter(type, freq, q), g = ac.createGain();
    s.buffer = noise;
    s.loop = true;
    g.gain.value = 0;
    s.connect(tone);
    tone.connect(g);
    s.start(0, Math.random() * 2);
    return {gain: g, tone: tone};
  }
  function build() {
    if (ac) {
      return;
    }
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      return;
    }
    // Big buffers, so the audio wakes less often and a TV's few cores keep up with the
    // scene. The booms are scheduled ahead, so the latency doesn't matter.
    try {
      ac = new Context({latencyHint: 'playback'});
    } catch (e) {
      ac = new Context();
    }
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var data = noise.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    n.master = ac.createGain();
    n.master.gain.value = 0;
    // Only a limiter: a compressor at its usual settings flattened every blast.
    var limit = ac.createDynamicsCompressor();
    limit.threshold.value = -5;
    limit.knee.value = 4;
    limit.ratio.value = 14;
    limit.attack.value = 0.002;
    limit.release.value = 0.2;
    n.master.connect(limit);
    limit.connect(ac.destination);
    n.world = ac.createGain();
    n.world.connect(n.master);
    n.bed = ac.createGain();
    n.bed.connect(n.world);
    // Into the limiter, where a loud one's peaks are rounded off and its body comes up.
    n.shots = ac.createGain();
    n.shots.gain.value = 3.9;
    n.shots.connect(n.world);
    buildPlace();
    buildEngine();
    // The tyres: a hiss, and the rumble under it that the body carries.
    var road = filteredNoise('bandpass', 700, 0.6);
    road.gain.connect(n.ours);
    n.road = road.gain.gain;
    var rumble = filteredNoise('lowpass', 110, 0.8);
    rumble.gain.connect(n.bed);
    n.rumble = rumble.gain.gain;
    var wind = filteredNoise('lowpass', 500, 0.9);
    wind.gain.connect(n.outside);
    n.wind = wind.gain.gain;
    n.windTone = wind.tone;
    n.rainGain = ac.createGain();
    n.rainGain.gain.value = 0;
    n.rainGain.connect(n.outside);
    n.rain = n.rainGain.gain;
    buildPassing();
    var hiss = filteredNoise('highpass', 1200, 0.5);
    hiss.gain.connect(n.master);
    n.hiss = hiss.gain.gain;
    n.lavaGain = ac.createGain();
    n.lavaGain.gain.value = 0;
    n.lavaGain.connect(n.bed);
    n.lava = n.lavaGain.gain;
    if (window.flowShots) {
      window.flowShots(take);
    }
  }
  // A loop or a shot, as each is ready.
  function take(name, buffer) {
    (made[name] = made[name] || []).push(buffer);
    if (name === 'rain') {
      loop(buffer, n.rainGain);
    } else if (name === 'lava') {
      loop(buffer, n.lavaGain);
    } else if (name === 'engine') {
      n.soft = loop(buffer, n.softGain);
    } else if (name === 'engineLoad') {
      n.hard = loop(buffer, n.hardGain);
    }
  }
  function loop(buffer, out) {
    var s = ac.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.connect(out);
    s.start();
    return s;
  }
  function panner() {
    return ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
  }
  // Another car: its tyres and its engine, across from one side to the other, the engine's
  // note falling as it goes by.
  function buildPassing() {
    n.passPan = panner();
    n.passPan.connect(n.bed);
    var pass = filteredNoise('bandpass', 380, 0.8);
    pass.gain.connect(n.passPan);
    n.pass = pass.gain.gain;
    n.passTone = pass.tone;
    var hum = filter('lowpass', 420, 0.9);
    n.passHum = ac.createGain();
    n.passHum.gain.value = 0;
    n.passOsc = ac.createOscillator();
    n.passOsc.type = 'sawtooth';
    n.passOsc.frequency.value = 80;
    n.passOsc.connect(hum);
    hum.connect(n.passHum);
    n.passHum.connect(n.passPan);
    n.passOsc.start();
  }
  // Where we are: our own noise, and the weather outside, each through a gain of its own, so
  // a tunnel's mouth changes them in a moment whatever they're easing to. A tunnel's echo of
  // ours comes back a little later, again, fainter.
  function buildPlace() {
    n.outside = ac.createGain();
    n.outside.connect(n.bed);
    n.ours = ac.createGain();
    n.ours.connect(n.bed);
    n.echoIn = ac.createDelay(1);
    n.echoIn.delayTime.value = 0.09;
    var back = ac.createGain();
    back.gain.value = 0.38;
    n.echo = ac.createGain();
    n.echo.gain.value = 0;
    n.echoIn.connect(back);
    back.connect(n.echoIn);
    n.echoIn.connect(n.echo);
    n.echo.connect(n.bed);
    n.ours.connect(n.echoIn);
  }
  // The V8's two loops (flow-shots.js), easy and pulling hard, mixed by the throttle and
  // opened with the revs, over a swell at the exhaust's own note.
  function buildEngine() {
    n.low = filter('lowpass', 400, 0.8);
    n.boom = filter('peaking', 82, 0.9);
    n.boom.gain.value = 4;
    n.engine = ac.createGain();
    n.engine.gain.value = 0;
    n.softGain = ac.createGain();
    n.hardGain = ac.createGain();
    n.hardGain.gain.value = 0;
    n.softGain.connect(n.low);
    n.hardGain.connect(n.low);
    n.low.connect(n.boom);
    n.boom.connect(n.engine);
    n.engine.connect(n.ours);
  }
  function ease(param, value, time) {
    param.setTargetAtTime(value, ac.currentTime, time || 0.15);
  }
  // One-shots: a roll of filtered noise, a falling thud, a bolt's chirp.
  function burst(at, freq, peak, decay, type, q) {
    var s = ac.createBufferSource(), f = filter(type || 'lowpass', freq, q), g = ac.createGain();
    s.buffer = noise;
    s.connect(f);
    f.connect(g);
    g.connect(n.world);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    s.start(at, Math.random() * 1.5);
    s.stop(at + decay + 0.1);
  }
  // How long after it's asked for a sound is heard: long, with its big buffers.
  function lag() {
    return (ac.baseLatency || 0.02) + (ac.outputLatency || 0);
  }
  // One of the made sounds: `loud` 0 to 1, heard after `delay` (the sound's own lag taken off
  // it, so ask ahead for what must be heard on time), from the side (`pan`, -1 to 1),
  // each a little higher or lower. The bed gives way to a loud one.
  function shot(name, loud, delay, pan) {
    var all = made[name];
    if (THUMPS[name]) {
      shot('thump', loud * THUMPS[name], delay, pan);
    }
    if (!all || sounding >= MOST_SOUNDING) {
      return;
    }
    var at = ac.currentTime + Math.max(0, (delay || 0) - lag()), s = ac.createBufferSource(), g = ac.createGain(), side = panner();
    s.buffer = all[Math.floor(Math.random() * all.length)];
    s.playbackRate.value = 0.93 + 0.14 * Math.random();
    g.gain.value = loud;
    if (side.pan) {
      side.pan.value = Math.max(-0.8, Math.min(0.8, pan || 0));
    }
    s.connect(g);
    g.connect(side);
    side.connect(n.shots);
    sounding += 1;
    s.onended = function () { sounding -= 1; };
    s.start(at);
    if (loud > 0.3) {
      n.bed.gain.setTargetAtTime(1 - 0.65 * Math.min(1, loud), at, 0.015);
      n.bed.gain.setTargetAtTime(1, at + 0.5 + 0.9 * loud, 0.7);
    }
  }
  function playing() {
    return want && ac && ac.state === 'running';
  }
  // The engine by its revs (the gearbox's), louder and brighter as it's pushed: a shift up
  // a moment's dip as the revs fall, a shift down a blip as they're flung up.
  function engine(s, t, v) {
    var rpm = s.rpm === undefined ? 0.14 + 0.86 * v : s.rpm, push = Math.max(0, s.throttle || 0), since = t - shifted.at;
    var blip = !shifted.up && since < 0.18 ? 1.12 : 1;
    var dip = shifted.up && since < 0.22 ? 0.45 : !shifted.up && since < 0.18 ? 1.25 : 1;
    var turns = (IDLE_RPM + (RED_RPM - IDLE_RPM) * rpm) * blip + Math.sin(t * 7) * 12, quick = since < 0.3;
    [n.soft, n.hard].forEach(function (source) {
      if (source) {
        source.playbackRate.setTargetAtTime(turns / LOOP_RPM, t, quick ? 0.05 : 0.12);
      }
    });
    ease(n.softGain.gain, 1 - 0.75 * push, 0.1);
    ease(n.hardGain.gain, 0.25 * rpm + 0.75 * push, 0.1);
    ease(n.low.frequency, 620 + 1500 * rpm * (0.5 + 0.5 * push), 0.08);
    var heard = level === 'full' ? (0.055 + 0.05 * rpm + 0.06 * push) * dip : 0;
    ease(n.engine.gain, heard, quick ? 0.03 : 0.15);
  }
  function surroundings(s, t, v) {
    // With no engine over them, the road and the wind are brought up, or they'd hardly be heard.
    var up = level === 'background' ? 2 : 1;
    ease(n.road, up * (0.015 + 0.11 * Math.pow(v, 1.5)));
    ease(n.rumble, up * (0.05 + 0.5 * Math.pow(v, 1.3)));
    var gust = 0.75 + 0.25 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
    ease(n.wind, up * (0.06 * v * v + 0.05 * s.wind) * gust, 0.5);
    ease(n.windTone.frequency, 300 + 500 * v * gust, 0.5);
    ease(n.rain, 0.6 * s.rain, 0.6);
    ease(n.ours.gain, 1 + 0.4 * s.tunnel, PORTAL);
    ease(n.outside.gain, 1 - 0.85 * s.tunnel, PORTAL);
    ease(n.echo.gain, 0.55 * s.tunnel, PORTAL);
    passing(s);
    ease(n.hiss, 0.22 * s.flash, 0.05);
    // The underworld's lava: a low roar, bubbling.
    ease(n.lava, 0.75 * (s.lava || 0), 0.8);
  }
  // `passAt`: where it is, -1 behind to 1 ahead; `passSpeed`: how much faster than us, as a
  // share of the top speed. Coming, its note is higher; going, lower.
  function passing(s) {
    // Only till the recording's ready, or if it won't load.
    var near = made.pass ? 0 : s.passing * s.passing, going = (s.passAt || 0) * (s.passSpeed || 0) > 0;
    ease(n.pass, 0.36 * near, 0.08);
    ease(n.passHum.gain, 0.2 * near, 0.08);
    ease(n.passTone.frequency, going ? 330 : 520, 0.25);
    ease(n.passOsc.frequency, (74 + 60 * Math.abs(s.passSpeed || 0)) * (going ? 0.88 : 1.1), 0.2);
    if (n.passPan.pan) {
      ease(n.passPan.pan, 0.7 * Math.max(-1, Math.min(1, s.passAt || 0)), 0.1);
    }
  }
  // Now and then: the lava bubbling; the warzone's guns far off and bolts nearer; the
  // glitch's crackle, the engine's pitch jumping.
  function events(s, t, dt) {
    if (s.lava > 0.3 && Math.random() < 3 * dt) {
      burst(t, 180 + Math.random() * 260, 0.12 * s.lava, 0.12 + Math.random() * 0.2, 'bandpass', 4);
    }
    if (s.war > 0.1 && t > nextWar) {
      nextWar = t + 0.4 + Math.random() * 2.2 / s.war;
      var side = Math.random() * 1.6 - 0.8;
      if (Math.random() < 0.55) {
        shot('artillery', (0.14 + 0.14 * Math.random()) * s.war, 0, side);
      } else {
        shot('bolt', 0.07 * s.war, 0, side);
      }
    }
    if (s.glitch > 0 && Math.random() < s.glitch * 9 * dt) {
      burst(t, 400 + Math.random() * 5000, 0.08 + 0.2 * s.glitch, 0.03 + Math.random() * 0.1, 'bandpass', 3);
      if (Math.random() < 0.3 && n.soft) {
        n.soft.playbackRate.setValueAtTime(0.4 + 3 * Math.random(), t);
      }
    }
  }
  var sound = {
    get on() {
      return want;
    },
    get level() {
      return level;
    },
    // Made, started and faded up. Called from a click or a key, so a browser allows it.
    set: function (value) {
      var was = want;
      level = value;
      want = level !== 'off';
      if (want) {
        build();
        if (ac && ac.state === 'suspended') {
          ac.resume();
        }
      }
      if (ac && want !== was) {
        ease(n.master.gain, 0, 0.2);
      }
    },
    wake: function () {
      if (!want) {
        return;
      }
      build();
      if (ac && ac.state === 'suspended') {
        ac.resume();
      }
    },
    // How far ahead of time to say what must be heard on time.
    get lead() {
      return ac ? lag() + PORTAL + EVERY / 2 : 0;
    },
    // How things are now: speed, rain and wind (0 to 1), how far into a tunnel (0 to 1, as it
    // will be in `lead` seconds), a car passing (0 to
    // 1, nearest; where it is and how fast), the warzone's nearness, the glitch (g, and world: 1, or less in its
    // void), the whiteout (flash). Told each frame, it changes things only every EVERY
    // seconds: each change is a dozen automation events, and at every frame they cost a
    // TV's scene frames. A gear shift is heard at once.
    drive: function (s) {
      last = performance.now();
      if (!playing()) {
        return;
      }
      var t = ac.currentTime;
      if (s.shift) {
        shifted = {at: t, up: s.shift === 'up'};
      }
      if (!s.shift && t - told < EVERY && t >= told) {
        return;
      }
      var dt = Math.min(0.25, t - told), v = Math.max(0, Math.min(1, s.speed));
      told = t;
      ease(n.master.gain, VOLUME, 0.4);
      ease(n.world.gain, s.world, s.world < 0.05 ? 0.25 : 0.4);
      engine(s, t, v);
      surroundings(s, t, v);
      events(s, t, dt);
    },
    // A car that will be beside us in `soon` seconds, from the side `from` (-1 behind, 1
    // ahead), going by; `enters` and `leaves`: when it comes on the screen and goes off it.
    // Off the screen it's heard, but fainter.
    pass: function (soon, from, enters, leaves) {
      if (!playing() || !made.pass) {
        return;
      }
      var t = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain(), side = panner(), into = Math.max(0, PASS_NEAREST - soon + lag());
      var early = lag(), nearest = t + Math.max(0.1, soon - early), off = t + Math.max(soon, leaves) - early;
      s.buffer = made.pass[0];
      g.gain.setValueAtTime(0.0001, t);
      if (enters - early > 0.1) {
        g.gain.linearRampToValueAtTime(0.55 * AT_EDGE, t + enters - early);
      }
      g.gain.linearRampToValueAtTime(0.55, nearest);
      g.gain.linearRampToValueAtTime(0.55 * AT_EDGE, Math.max(nearest + 0.1, off));
      g.gain.linearRampToValueAtTime(0, Math.max(nearest + 0.1, off) + 2);
      if (side.pan) {
        side.pan.setValueAtTime(0.75 * from, t);
        side.pan.linearRampToValueAtTime(-0.75 * from, t + 2 * soon);
      }
      s.connect(g);
      g.connect(side);
      side.connect(n.bed);
      s.start(t, into);
    },
    // A rock that lands in `left` seconds coming down: the end of the rush, stopping as it does.
    fall: function (loud, left, pan) {
      if (!playing() || !made.fall || sounding >= MOST_SOUNDING) {
        return;
      }
      var t = ac.currentTime, lands = t + Math.max(0.2, left - lag()), s = ac.createBufferSource(), g = ac.createGain(), side = panner();
      s.buffer = made.fall[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(loud, t + 0.15);
      g.gain.setValueAtTime(loud, lands - 0.03);
      g.gain.linearRampToValueAtTime(0, lands + 0.02);
      if (side.pan) {
        side.pan.value = Math.max(-0.8, Math.min(0.8, pan));
      }
      s.connect(g);
      g.connect(side);
      side.connect(n.shots);
      sounding += 1;
      s.onended = function () { sounding -= 1; };
      s.start(t, Math.max(0, FALL_LANDS - (lands - t)));
      s.stop(lands + 0.05);
    },
    // One of flow-shots.js's: a bomb's 'blast', a rock's 'impact', a great gun's 'charge',
    // 'cannon', 'beam' and 'hum', a storm's 'thunder'.
    shot: function (name, loud, delay, pan) {
      if (playing()) {
        shot(name, loud, delay, pan);
      }
    },
    hush: function () {
      if (ac) {
        ease(n.master.gain, 0, 0.1);
      }
    },
  };
  // Not told how things are a while (another theme, the screen away): faded out, and
  // paused while the page is hidden.
  setInterval(function () {
    if (!ac) {
      return;
    }
    if (performance.now() - last > 400 || !want) {
      ease(n.master.gain, 0, 0.3);
    }
    if (document.hidden && ac.state === 'running') {
      ac.suspend();
    } else if (!document.hidden && want && ac.state === 'suspended' && last) {
      ac.resume();
    }
  }, 250);
  // A browser holds it till a click or a key (`wake`).
  if (want) {
    build();
  }
  return sound;
};
