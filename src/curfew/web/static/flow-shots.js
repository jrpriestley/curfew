// curfew's screensaver: Highway's sounds made ready once, for flow-sound.js to play, one at a
// time, so playing each costs a TV one source. Recordings where the real thing is best
// (RECORDED: /sounds/, public domain, see its SOURCES.md). The engine, which must follow the
// revs, and the lasers are generated here, as are the guns and explosions should a recording
// not load: rendered in the background by the browser (OfflineAudioContext), layered as the
// real ones are (a crack, a punch, a body, a tail that comes back off the land).
// Low sounds are overdriven: a TV's speakers can't play the bottom of them, but the
// harmonics that gives them are heard as it.
var flowShotsVersion = (/[?&]v=\w+/.exec((document.currentScript || {}).src || '') || [''])[0];
window.flowShots = function (ready) {
  var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) {
    return null;
  }
  // High enough for a crack, and less to work out and keep than the full rate.
  var RATE = 32000;
  var noises = {};
  function makeNoises(ac) {
    var length = RATE * 4;
    ['white', 'brown'].forEach(function (kind) {
      var buffer = ac.createBuffer(1, length, RATE), data = buffer.getChannelData(0), last = 0;
      for (var i = 0; i < length; i += 1) {
        var white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = kind === 'white' ? white : last * 3.5;
      }
      noises[kind] = buffer;
    });
  }
  function filter(ac, type, freq, q) {
    var f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    return f;
  }
  function gain(ac, value) {
    var g = ac.createGain();
    g.gain.value = value;
    return g;
  }
  function overdrive(ac, amount) {
    var shaper = ac.createWaveShaper(), curve = new Float32Array(2049);
    for (var i = 0; i < curve.length; i += 1) {
      curve[i] = Math.tanh(amount * (i / 1024 - 1)) / Math.tanh(amount);
    }
    shaper.curve = curve;
    return shaper;
  }
  // Up to `peak` over `attack`, then away over `decay`.
  function envelope(param, at, peak, attack, decay) {
    param.setValueAtTime(0.0001, at);
    param.exponentialRampToValueAtTime(peak, at + attack);
    param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }
  // Noise through a filter that closes from one frequency to another as it dies.
  function roar(ac, out, o) {
    var source = ac.createBufferSource(), tone = filter(ac, o.type || 'lowpass', o.from, o.q), g = gain(ac, 0), attack = o.attack || 0.004;
    source.buffer = noises[o.noise || 'brown'];
    source.loop = true;
    source.connect(tone);
    tone.connect(g);
    g.connect(out);
    tone.frequency.setValueAtTime(o.from, o.at);
    tone.frequency.exponentialRampToValueAtTime(o.to || o.from, o.at + attack + o.decay);
    envelope(g.gain, o.at, o.peak, attack, o.decay);
    source.start(o.at, Math.random() * 3);
    source.stop(o.at + attack + o.decay + 0.05);
  }
  // A falling tone: the punch of a blast.
  function drop(ac, out, o) {
    var tone = ac.createOscillator(), g = gain(ac, 0);
    tone.frequency.setValueAtTime(o.from, o.at);
    tone.frequency.exponentialRampToValueAtTime(o.to, o.at + o.decay * 0.8);
    tone.connect(g);
    g.connect(out);
    envelope(g.gain, o.at, o.peak, 0.004, o.decay);
    tone.start(o.at);
    tone.stop(o.at + o.decay + 0.05);
  }
  // The land's answer: a tail of echoes, darker as it goes (`dark`: how quickly).
  function land(ac, seconds, dark) {
    var length = Math.floor(RATE * seconds), buffer = ac.createBuffer(1, length, RATE), data = buffer.getChannelData(0), low = 0;
    for (var i = 0; i < length; i += 1) {
      var f = i / length, open = Math.max(0.02, 0.6 * Math.exp(-f * dark));
      low += open * ((Math.random() * 2 - 1) - low);
      data[i] = low * Math.pow(1 - f, 2.2) * Math.min(1, i / (RATE * 0.02));
    }
    for (var e = 0; e < 7; e += 1) {
      var at = Math.floor(RATE * seconds * 0.5 * Math.random()), strength = 3 * Math.pow(1 - at / length, 2);
      for (var s = 0; s < 500 && at + s < length; s += 1) {
        data[at + s] += strength * (Math.random() - 0.5) * (1 - s / 500);
      }
    }
    var convolver = ac.createConvolver();
    convolver.buffer = buffer;
    return convolver;
  }
  // Where a sound's layers go: overdriven, with the land's answer added.
  function stage(ac, o) {
    var bus = gain(ac, o.into || 1), shaper = overdrive(ac, o.drive), tail = land(ac, o.tail, o.dark), wet = gain(ac, o.wet);
    bus.connect(shaper);
    shaper.connect(ac.destination);
    shaper.connect(tail);
    tail.connect(wet);
    wet.connect(ac.destination);
    return bus;
  }

  // ------------------------------------------------------------- the one-shots --
  // An atomic bomb, far off: the front, a body that goes on, and the roll of it coming back.
  function blast(ac) {
    var out = stage(ac, {drive: 2.6, tail: 4.5, dark: 5, wet: 0.5});
    roar(ac, out, {noise: 'white', at: 0.01, from: 2600, to: 180, peak: 0.8, decay: 0.3});
    drop(ac, out, {at: 0.01, from: 150, to: 42, peak: 1, decay: 0.7});
    drop(ac, out, {at: 0.03, from: 74, to: 30, peak: 0.9, decay: 2.8});
    roar(ac, out, {at: 0.02, from: 1100, to: 80, peak: 1.5, attack: 0.03, decay: 5.2});
    for (var roll = 0; roll < 8; roll += 1) {
      var at = 0.7 + roll * 0.55 + Math.random() * 0.4;
      roar(ac, out, {at: at, from: 200 + Math.random() * 260, to: 70, peak: 1.1 - roll * 0.1, attack: 0.1 + Math.random() * 0.25, decay: 1 + Math.random()});
    }
  }
  // The bottom of a bang, to go under a recording.
  function thump(ac) {
    var out = stage(ac, {drive: 2, tail: 1, dark: 8, wet: 0.2});
    drop(ac, out, {at: 0.02, from: 150, to: 40, peak: 1, decay: 0.8});
    drop(ac, out, {at: 0.03, from: 72, to: 31, peak: 0.8, decay: 2.2});
  }
  // A rock coming down nearer: sharper, and what it throws up falling back.
  function impact(ac) {
    var out = stage(ac, {drive: 2.4, tail: 2, dark: 4, wet: 0.35});
    roar(ac, out, {noise: 'white', at: 0.005, from: 7000, to: 400, peak: 0.9, decay: 0.16});
    drop(ac, out, {at: 0.005, from: 210, to: 46, peak: 1, decay: 0.45});
    drop(ac, out, {at: 0.02, from: 84, to: 34, peak: 0.8, decay: 2.4});
    roar(ac, out, {at: 0.01, from: 1900, to: 110, peak: 2.2, attack: 0.008, decay: 3.2});
    for (var bit = 0; bit < 46; bit += 1) {
      var fell = Math.random();
      roar(ac, out, {
        noise: 'white', type: 'bandpass', q: 3, at: 0.15 + fell * fell * 2, from: 500 + Math.random() * 3000,
        peak: 0.16 * (1 - fell) + 0.02, decay: 0.03 + Math.random() * 0.07,
      });
    }
  }
  // Held at `peak` for as long as a great gun's pulse, then away with it.
  var PULSE = 2.4, PULSE_FADE = 0.6;
  function hold(param, peak) {
    param.setValueAtTime(0.0001, 0);
    param.exponentialRampToValueAtTime(peak, 0.03);
    param.setValueAtTime(peak, PULSE - PULSE_FADE);
    param.exponentialRampToValueAtTime(0.0001, PULSE);
  }
  function cannon(ac) {
    var out = stage(ac, {drive: 3, tail: 2.6, dark: 3.5, wet: 0.4});
    roar(ac, out, {noise: 'white', at: 0.003, from: 8000, to: 500, peak: 1, decay: 0.14});
    drop(ac, out, {at: 0.003, from: 260, to: 40, peak: 1.2, decay: 0.6});
    drop(ac, out, {at: 0.02, from: 80, to: 33, peak: 0.9, decay: 1.6});
    roar(ac, out, {at: 0.01, from: 1600, to: 120, peak: 1.2, decay: 1.5});
  }
  // Its beam: a torn hum trembling, with a sizzle over it and the ground under it.
  function hum(ac) {
    var out = stage(ac, {drive: 2.4, tail: 1.4, dark: 3.5, wet: 0.25});
    var level = gain(ac, 0), tear = filter(ac, 'lowpass', 1300), tremble = gain(ac, 0.75), shake = ac.createOscillator(), depth = gain(ac, 0.25);
    [55, 55.8, 110.6, 165].forEach(function (freq, i) {
      var saw = ac.createOscillator(), share = gain(ac, [0.5, 0.5, 0.35, 0.2][i]);
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(freq * 1.5, 0);
      saw.frequency.exponentialRampToValueAtTime(freq, 0.25);
      saw.connect(share);
      share.connect(tear);
      saw.start(0);
      saw.stop(PULSE + 0.1);
    });
    shake.frequency.value = 27;
    shake.connect(depth);
    depth.connect(tremble.gain);
    shake.start(0);
    tear.connect(tremble);
    tremble.connect(level);
    level.connect(out);
    hold(level.gain, 0.6);
    [['white', 'highpass', 3200, 0.09], ['brown', 'lowpass', 150, 0.9]].forEach(function (layer) {
      var source = ac.createBufferSource(), tone = filter(ac, layer[1], layer[2]), g = gain(ac, 0);
      source.buffer = noises[layer[0]];
      source.loop = true;
      source.connect(tone);
      tone.connect(g);
      g.connect(out);
      hold(g.gain, layer[3]);
      source.start(0);
    });
  }
  // Its charge: a whine rising into the shot.
  function charge(ac) {
    var out = stage(ac, {drive: 1.6, tail: 0.5, dark: 4, wet: 0.15}), open = filter(ac, 'lowpass', 200, 4), level = gain(ac, 0);
    open.frequency.exponentialRampToValueAtTime(3200, 1.6);
    level.gain.setValueAtTime(0.015, 0);
    level.gain.exponentialRampToValueAtTime(0.5, 1.55);
    level.gain.linearRampToValueAtTime(0, 1.62);
    [1, 1.01, 2.005].forEach(function (ratio) {
      var saw = ac.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(48 * ratio, 0);
      saw.frequency.exponentialRampToValueAtTime(330 * ratio, 1.6);
      saw.connect(open);
      saw.start(0);
      saw.stop(1.65);
    });
    open.connect(level);
    level.connect(out);
  }
  // Guns over the horizon.
  function artillery(ac) {
    var out = stage(ac, {drive: 2, tail: 2.2, dark: 7, wet: 0.6}), heavy = 0.7 + Math.random() * 0.6;
    drop(ac, out, {at: 0.01, from: 95, to: 36, peak: 0.8, decay: 1.1 * heavy});
    roar(ac, out, {at: 0.01, from: 420, to: 80, peak: 1.6, attack: 0.02, decay: 2.2 * heavy});
  }
  function bolt(ac) {
    var out = stage(ac, {drive: 2, tail: 0.8, dark: 3, wet: 0.35}), tone = ac.createOscillator(), g = gain(ac, 0), high = 1700 + Math.random() * 900;
    tone.type = 'sawtooth';
    tone.frequency.setValueAtTime(high, 0.005);
    tone.frequency.exponentialRampToValueAtTime(190, 0.22);
    tone.connect(g);
    g.connect(out);
    envelope(g.gain, 0.005, 0.5, 0.004, 0.24);
    tone.start(0);
    tone.stop(0.3);
    roar(ac, out, {noise: 'white', at: 0.004, from: 5000, to: 900, peak: 0.4, decay: 0.08});
  }

  // The guns' pressure let go: a bang of air, then steam rushing out, its hiss falling as it
  // runs down, sputtering at the end.
  function vent(ac) {
    var out = stage(ac, {drive: 1.6, tail: 1.2, dark: 4, wet: 0.25});
    roar(ac, out, {at: 0.005, from: 900, to: 120, peak: 1, attack: 0.02, decay: 1.2});
    roar(ac, out, {noise: 'white', type: 'bandpass', q: 0.6, at: 0.01, from: 3000, to: 800, peak: 0.42, attack: 0.06, decay: 7});
    roar(ac, out, {noise: 'white', type: 'highpass', at: 0.02, from: 4200, to: 2400, peak: 0.1, attack: 0.08, decay: 5});
    roar(ac, out, {at: 0.02, from: 1200, to: 240, peak: 1.2, attack: 0.06, decay: 5});
    for (var puff = 0; puff < 6; puff += 1) {
      roar(ac, out, {noise: 'white', type: 'bandpass', q: 1, at: 1.7 + puff * 0.22 + Math.random() * 0.1, from: 2600, to: 1200, peak: 0.22 - puff * 0.03, attack: 0.02, decay: 0.16});
    }
  }

  // ----------------------------------------------------------------- the loops --
  // A big lazy V8 of the sixties at LOOP_RPM: eight firings every two turns, one bank's heard
  // well over the other's and theirs unevenly spaced (a cross-plane crank's burble), no two
  // quite alike, each a low thud through big pipes. Played faster or slower for its revs.
  // `load`: pulled hard, its pulses are rougher.
  var LOOP_RPM = 900, BANKS = [1, 0.5, 1, 1, 0.5, 1, 0.5, 0.5];
  function engineLoop(load) {
    var gap = RATE * 60 / LOOP_RPM / 4, cycles = 10, length = Math.round(gap * 8 * cycles), data = new Float32Array(length);
    var own = BANKS.map(function (bank) { return bank * (0.93 + 0.14 * Math.random()); });
    // The pulse and how its roughness dies, worked out once: for every firing it stalled a TV.
    var pulse = new Float32Array(Math.round(RATE * 0.06)), rough = new Float32Array(pulse.length);
    for (var n = 0; n < pulse.length; n += 1) {
      var t = n / RATE, rise = Math.min(1, n / 12);
      var body = Math.exp(-t / (load ? 0.012 : 0.015)) * (Math.sin(6.2832 * 64 * t) + 0.8 * Math.sin(6.2832 * 128 * t + 0.4));
      pulse[n] = rise * (body + Math.exp(-t / 0.004) * (load ? 0.7 : 0.45) * Math.sin(6.2832 * 260 * t + 0.9));
      rough[n] = rise * Math.exp(-t / 0.0035) * (load ? 0.4 : 0.1);
    }
    for (var fire = 0; fire < 8 * cycles; fire += 1) {
      var start = Math.round(fire * gap + (Math.random() - 0.5) * gap * 0.03) + length;
      var strength = own[fire % 8] * (0.93 + 0.14 * Math.random());
      for (var i = 0; i < pulse.length; i += 1) {
        data[(start + i) % length] += strength * (pulse[i] + rough[i] * (Math.random() * 2 - 1));
      }
    }
    return levelled(data, load ? 4 : 3.2);
  }
  // Drops on a roof: a patter of small knocks, and the hiss of all the rest.
  function rainLoop() {
    var length = RATE * 4, data = new Float32Array(length), hiss = 0;
    for (var i = 0; i < length; i += 1) {
      hiss = 0.6 * hiss + 0.4 * (Math.random() * 2 - 1);
      data[i] = 0.1 * hiss;
    }
    for (var drop = 0; drop < 900; drop += 1) {
      var at = Math.floor(Math.random() * length), freq = 700 + Math.random() * 3200, size = Math.pow(Math.random(), 3);
      // A ringing tone, dying away, each sample from the two before.
      var turn = 2 * 0.983 * Math.cos(6.2832 * freq / RATE), before = 0, now = size * 0.6;
      for (var s = 0; s < 360; s += 1) {
        data[(at + s) % length] += now;
        var next = turn * now - 0.983 * 0.983 * before;
        before = now;
        now = next;
      }
    }
    return levelled(data, 1.2);
  }
  // Overdriven a little, steadied about nothing, its loudest at 0.9.
  function levelled(data, amount) {
    var most = 0, sum = 0, i;
    for (i = 0; i < data.length; i += 1) {
      most = Math.max(most, Math.abs(data[i]));
    }
    for (i = 0; i < data.length; i += 1) {
      data[i] = Math.tanh(amount * data[i] / most * 1.6);
      sum += data[i];
    }
    for (most = 0, i = 0; i < data.length; i += 1) {
      data[i] -= sum / data.length;
      most = Math.max(most, Math.abs(data[i]));
    }
    for (i = 0; i < data.length; i += 1) {
      data[i] *= 0.9 / most;
    }
    return data;
  }
  function asBuffer(data) {
    var buffer = new Offline(1, 1, RATE).createBuffer(1, data.length, RATE);
    buffer.getChannelData(0).set(data);
    return buffer;
  }

  // ------------------------------------------------------------- made in turn --
  // [seconds, recipe, how many, each a little different]. The loops come first: they're
  // always heard. `ready` is called with each's name and buffer.
  var RECIPES = {
    thump: [3.2, thump, 1], hum: [4.2, hum, 1], charge: [2, charge, 1], bolt: [1.1, bolt, 2], vent: [4.5, vent, 1], cannon: [4, cannon, 1], blast: [9.5, blast, 2],
    impact: [4, impact, 3], artillery: [3.4, artillery, 2],
  };
  // The recorded, and what stands in for one that won't load: a recipe, a loop, or nothing.
  var RECORDED = ['rain', 'cannon', 'beam', 'impact', 'fall', 'debris', 'artillery', 'blast', 'thunder', 'lava', 'pass'], LOOPED = {rain: 1, lava: 1};
  function loudest(buffer) {
    var data = buffer.getChannelData(0), most = 0;
    for (var i = 0; i < data.length; i += 1) {
      most = Math.max(most, Math.abs(data[i]));
    }
    for (i = 0; i < data.length; i += 1) {
      data[i] *= 0.95 / (most || 1);
    }
    return buffer;
  }
  // A loop's end run into its start, past the silence an MP3 has at each.
  function seamless(buffer) {
    var data = buffer.getChannelData(0), trim = Math.floor(RATE * 0.06), join = Math.floor(RATE * 0.8);
    var length = data.length - 2 * trim - join, out = new Float32Array(length);
    for (var i = 0; i < length; i += 1) {
      out[i] = data[trim + i];
      if (i < join) {
        var f = i / join;
        out[i] = out[i] * Math.sqrt(f) + data[trim + length + i] * Math.sqrt(1 - f);
      }
    }
    return asBuffer(out);
  }
  var jobs = [];
  function addLoop(name, make) {
    jobs.push(function (next) {
      ready(name, asBuffer(make()));
      next();
    });
  }
  function addRecipe(name) {
    var recipe = RECIPES[name];
    for (var copy = 0; copy < recipe[2]; copy += 1) {
      jobs.push(function (next) {
        var ac = new Offline(1, Math.ceil(RATE * recipe[0]), RATE);
        if (!noises.white) {
          makeNoises(ac);
        }
        recipe[1](ac);
        ac.oncomplete = function (event) {
          ready(name, loudest(event.renderedBuffer));
          next();
        };
        ac.startRendering();
      });
    }
  }
  function standIn(name) {
    if (RECIPES[name]) {
      addRecipe(name);
    } else if (name === 'rain') {
      addLoop(name, rainLoop);
    }
  }
  function addRecording(name) {
    jobs.push(function (next) {
      fetch('/sounds/' + name + '.mp3' + flowShotsVersion.replace('&', '?'))
        .then(function (response) {
          if (!response.ok) {
            throw new Error(name);
          }
          return response.arrayBuffer();
        })
        .then(function (bytes) {
          return new Promise(function (resolve, reject) { new Offline(1, 1, RATE).decodeAudioData(bytes, resolve, reject); });
        })
        .then(function (buffer) { ready(name, LOOPED[name] ? seamless(buffer) : buffer); })
        .catch(function () { standIn(name); })
        .then(next);
    });
  }
  addLoop('engine', function () { return engineLoop(false); });
  addLoop('engineLoad', function () { return engineLoop(true); });
  RECORDED.forEach(addRecording);
  ['thump', 'hum', 'charge', 'bolt', 'vent'].forEach(addRecipe);
  function nextJob() {
    var job = jobs.shift();
    if (job) {
      // A breath between, so a TV's scene keeps its frames.
      setTimeout(function () { job(nextJob); }, 120);
    }
  }
  nextJob();
  return {LOOP_RPM: LOOP_RPM};
};
