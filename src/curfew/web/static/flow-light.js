// curfew's screensaver: Ultra detail's light (flowLighting). The scene is drawn in 2D as
// ever; this draws the same ground and solids again in WebGL, from the same camera, to
// make two layers to lay over it: the shadows cast from the sun or moon (a shadow map,
// softened), and the light from the scene's lamps, cars and windows (point lights on
// every surface they face). Both at half the canvas's size: light and shade are soft.
// Null without WebGL.
function flowLighting() {
  var board = document.createElement('canvas');
  // With alpha: where nothing of the scene is, the layers stay clear and the sky behind
  // the canvas is untouched.
  var gl = board.getContext('webgl', {alpha: true, antialias: false, depth: true, premultipliedAlpha: true,
    preserveDrawingBuffer: false});
  if (!gl) {
    return null;
  }
  // As many lights as the GPU's fragment uniforms allow (two each), up to 160.
  var MAX_LIGHTS = Math.max(16, Math.min(160, Math.floor((gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) - 24) / 2)));
  var SCALE = 0.5, SHADOW_SIZE = 2048;
  function shader(kind, source) {
    var made = gl.createShader(kind);
    gl.shaderSource(made, source);
    gl.compileShader(made);
    if (!gl.getShaderParameter(made, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(made));
    }
    return made;
  }
  // A program and its uniforms' locations by name (`at`).
  function program(vertex, fragment) {
    var made = gl.createProgram();
    gl.attachShader(made, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(made, shader(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(made, 0, 'place');
    gl.bindAttribLocation(made, 1, 'normal');
    gl.linkProgram(made);
    if (!gl.getProgramParameter(made, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(made));
    }
    var names = {}, count = gl.getProgramParameter(made, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i += 1) {
      var name = gl.getActiveUniform(made, i).name.replace(/\[0\]$/, '');
      names[name] = gl.getUniformLocation(made, name);
    }
    return {program: made, at: names};
  }
  // The camera, as the 2D one (flow.js `project`): a place's spot on the canvas and its
  // depth along the camera's way.
  var CAMERA = [
    'uniform vec4 cam;',  // a, b, c, d
    'uniform vec4 frame;',  // origin x, y; the canvas's width and height
    'uniform vec4 pivot;',  // pivot u, v; cam.z; unused
    'uniform vec3 toward;',  // the camera's way, toward it
    'uniform vec2 depths;',  // the nearest and farthest along it
    'vec4 onCanvas(vec3 p) {',
    '  float du = p.x - pivot.x, dv = p.y - pivot.y;',
    '  vec2 at = vec2(frame.x + cam.x * du + cam.z * dv, frame.y + cam.y * du + cam.w * dv - p.z * pivot.z);',
    '  float t = (dot(p, toward) - depths.x) / (depths.y - depths.x);',
    '  return vec4(at.x / frame.z * 2.0 - 1.0, 1.0 - at.y / frame.w * 2.0, 1.0 - 2.0 * t, 1.0);',
    '}',
  ].join('\n');
  // The land's rounded edge, outside which nothing is lit or shaded.
  var LAND = [
    'uniform vec4 land;',  // u0, v0, u1, v1, its corners rounded by landRound
    'uniform float landRound;',
    'bool offLand(vec3 p) {',
    '  vec2 middle = (land.xy + land.zw) * 0.5, inner = (land.zw - land.xy) * 0.5 - landRound;',
    '  vec2 q = abs(p.xy - middle) - inner;',
    '  return length(max(q, 0.0)) - landRound > 0.01;',
    '}',
  ].join('\n');
  // The sun's (or moon's) view for the shadow map: across, up and along its rays, and the
  // scene's bounds in those terms.
  var SUN = [
    'uniform vec3 sunAcross, sunUp, sunAlong;',
    'uniform vec4 sunBox;',  // across from, to; up from, to
    'uniform vec2 sunDepths;',
    'vec3 inSun(vec3 p) {',
    '  return vec3((dot(p, sunAcross) - sunBox.x) / (sunBox.y - sunBox.x), (dot(p, sunUp) - sunBox.z) / (sunBox.w - sunBox.z),',
    '    (dot(p, sunAlong) - sunDepths.x) / (sunDepths.y - sunDepths.x));',
    '}',
  ].join('\n');
  // Depths packed into RGBA, so no depth textures are needed.
  var shadowMap = program([
    'attribute vec3 place;', 'attribute vec3 normal;', SUN, 'varying float depth;',
    'void main() { vec3 s = inSun(place); depth = s.z; gl_Position = vec4(s.xy * 2.0 - 1.0, s.z * 2.0 - 1.0, 1.0); }',
  ].join('\n'), [
    'precision highp float;', 'varying float depth;',
    'void main() {',
    '  vec4 enc = fract(depth * vec4(1.0, 255.0, 65025.0, 16581375.0));',
    '  gl_FragColor = enc - enc.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);',
    '}',
  ].join('\n'));
  var VERTEX = [
    'attribute vec3 place;', 'attribute vec3 normal;', CAMERA,
    'varying vec3 world;', 'varying vec3 facing;',
    'void main() { world = place; facing = normal; gl_Position = onCanvas(place); }',
  ].join('\n');
  // The shade, as darkness: none where the sun reaches, more where something stands in
  // its way or the surface faces from it; 12 samples round the spot for a soft edge.
  var shade = program(VERTEX, [
    'precision highp float;', 'varying vec3 world;', 'varying vec3 facing;', LAND, SUN,
    'uniform sampler2D sunMap;', 'uniform float sunTexel;', 'uniform float darkest;', 'uniform vec3 toSun;',
    'float unpack(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }',
    'void main() {',
    '  if (offLand(world)) { discard; }',
    '  vec3 n = normalize(facing);',
    '  float facingSun = dot(n, toSun);',
    '  vec3 s = inSun(world + n * 0.025);',
    '  float lit = 0.0;',
    '  for (int i = 0; i < 12; i++) {',
    '    float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 12.0) * 2.5;',
    '    vec2 at = s.xy + vec2(cos(a), sin(a)) * r * sunTexel;',
    '    lit += s.z - 0.0015 <= unpack(texture2D(sunMap, at)) ? 1.0 : 0.0;',
    '  }',
    '  lit = lit / 12.0 * smoothstep(-0.05, 0.2, facingSun);',
    '  gl_FragColor = vec4(0.0, 0.0, 0.0, darkest * (1.0 - lit));',
    '}',
  ].join('\n'));
  // The light: each lamp, car and window a point (where, how far it reaches; its colour
  // times its strength), on each surface by how near and how squarely it faces it. Clear
  // where there's none, never black over the sky.
  var light = program(VERTEX, [
    'precision highp float;', 'varying vec3 world;', 'varying vec3 facing;', LAND,
    '#define MAX_LIGHTS ' + MAX_LIGHTS,
    'uniform vec4 spots[MAX_LIGHTS];', 'uniform vec4 colours[MAX_LIGHTS];', 'uniform int count;',
    'void main() {',
    '  if (offLand(world)) { discard; }',
    '  vec3 n = normalize(facing), sum = vec3(0.0);',
    '  for (int i = 0; i < MAX_LIGHTS; i++) {',
    '    if (i >= count) { break; }',
    '    vec3 to = spots[i].xyz - world;',
    '    float d = length(to), f = 1.0 - d / spots[i].w;',
    '    if (f <= 0.0) { continue; }',
    '    float square = max(dot(n, to / max(d, 0.001)), 0.0) * 0.8 + 0.2;',
    '    sum += colours[i].rgb * (f * f * square / (1.0 + 6.0 * d * d));',
    '  }',
    '  vec3 c = vec3(1.0) - exp(-sum);',
    '  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));',
    '}',
  ].join('\n'));
  // The shadow map is drawn into through a frame buffer with its own depth.
  var sunMap = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sunMap);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_SIZE, SHADOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  var sunDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, sunDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);
  var sunFrame = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, sunFrame);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sunMap, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sunDepth);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    return null;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  var lost = false;
  board.addEventListener('webglcontextlost', function (event) {
    event.preventDefault();
    lost = true;
  });
  // The geometry, as triangles of place and normal: the ground once; the solids every
  // frame, in a buffer that grows.
  var groundBuffer = gl.createBuffer(), groundCount = 0, solidBuffer = gl.createBuffer(), solidCount = 0, solidRoom = 0;
  function bindMesh(buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  }
  function drawAll() {
    bindMesh(groundBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, groundCount);
    if (solidCount) {
      bindMesh(solidBuffer);
      gl.drawArrays(gl.TRIANGLES, 0, solidCount);
    }
  }
  // A mesh being made: triangles, each corner its place and its face's normal.
  function mesh() {
    var data = [], made = {data: data};
    // A triangle whose normal is worked out, turned to face up: it's for the ground.
    made.tri = function (a, b, c) {
      var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      var long = Math.hypot(n[0], n[1], n[2]) || 1;
      if (n[2] < 0) {
        long = -long;
      }
      [a, b, c].forEach(function (p) { data.push(p[0], p[1], p[2], n[0] / long, n[1] / long, n[2] / long); });
    };
    // A quad (four corners in order round it) with its normal given: walls, outward.
    made.quad = function (a, b, c, d, n) {
      [a, b, c, a, c, d].forEach(function (p) { data.push(p[0], p[1], p[2], n[0], n[1], n[2]); });
    };
    made.triN = function (a, b, c, n) {
      [a, b, c].forEach(function (p) { data.push(p[0], p[1], p[2], n[0], n[1], n[2]); });
    };
    return made;
  }
  function unit(v) {
    var long = Math.hypot(v[0], v[1], v[2]);
    return v.map(function (c) { return c / long; });
  }
  // The extent along `axis` of the corners of the scene's box.
  function spanOf(corners, axis) {
    var lo = Infinity, hi = -Infinity;
    corners.forEach(function (p) {
      var t = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    });
    return [lo, hi];
  }
  function boxCorners(box) {
    var corners = [];
    [box.u0, box.u1].forEach(function (u) {
      [box.v0, box.v1].forEach(function (v) {
        [box.low, box.high].forEach(function (z) { corners.push([u, v, z]); });
      });
    });
    return corners;
  }
  function layBoard(paint, mode, view) {
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.globalCompositeOperation = mode;
    paint.globalAlpha = 1;
    paint.drawImage(board, 0, 0, view.width, view.height);
    paint.restore();
  }
  // The shadows: the shadow map from the sun's view, then the shade from the camera's,
  // laid only over what's drawn (source-atop) so it can't spill past an edge.
  function drawShadows(paint, view, sun, corners, useCamera, w, h) {
    var along = unit([sun.way.u, sun.way.v, -1]);
    var across = unit(Math.hypot(along[0], along[1]) > 1e-3 ? [-along[1], along[0], 0] : [1, 0, 0]);
    var up = [across[1] * along[2] - across[2] * along[1], across[2] * along[0] - across[0] * along[2],
      across[0] * along[1] - across[1] * along[0]];
    var xs = spanOf(corners, across), ys = spanOf(corners, up), zs = spanOf(corners, along);
    var sunUniforms = function (p) {
      gl.uniform3f(p.at.sunAcross, across[0], across[1], across[2]);
      gl.uniform3f(p.at.sunUp, up[0], up[1], up[2]);
      gl.uniform3f(p.at.sunAlong, along[0], along[1], along[2]);
      gl.uniform4f(p.at.sunBox, xs[0], xs[1], ys[0], ys[1]);
      gl.uniform2f(p.at.sunDepths, zs[0] - 0.1, zs[1] + 0.1);
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, sunFrame);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shadowMap.program);
    sunUniforms(shadowMap);
    drawAll();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    useCamera(shade);
    sunUniforms(shade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sunMap);
    gl.uniform1i(shade.at.sunMap, 0);
    gl.uniform1f(shade.at.sunTexel, 1 / SHADOW_SIZE);
    gl.uniform1f(shade.at.darkest, sun.darkest * sun.strength);
    gl.uniform3f(shade.at.toSun, -along[0], -along[1], -along[2]);
    drawAll();
    layBoard(paint, 'source-atop', view);
  }
  function drawLights(paint, view, spots, useCamera, w, h) {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    useCamera(light);
    var n = Math.min(spots.length, MAX_LIGHTS), where = new Float32Array(MAX_LIGHTS * 4), tint = new Float32Array(MAX_LIGHTS * 4);
    for (var i = 0; i < n; i += 1) {
      var s = spots[i];
      where.set([s.u, s.v, s.z, s.reach], i * 4);
      tint.set([s.r, s.g, s.b, 0], i * 4);
    }
    gl.uniform4fv(light.at.spots, where);
    gl.uniform4fv(light.at.colours, tint);
    gl.uniform1i(light.at.count, n);
    drawAll();
    layBoard(paint, 'lighter', view);
  }
  var lighting = {
    MAX_LIGHTS: MAX_LIGHTS,
    board: board,
    mesh: mesh,
    get lost() {
      return lost;
    },
    // The ground's mesh (made by mesh()), once.
    ground: function (made) {
      gl.bindBuffer(gl.ARRAY_BUFFER, groundBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(made.data), gl.STATIC_DRAW);
      groundCount = made.data.length / 6;
    },
    // The solids' mesh, each frame.
    solids: function (made) {
      var array = new Float32Array(made.data);
      gl.bindBuffer(gl.ARRAY_BUFFER, solidBuffer);
      if (array.length > solidRoom) {
        solidRoom = array.length * 1.5;
        gl.bufferData(gl.ARRAY_BUFFER, solidRoom * 4, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, array);
      solidCount = array.length / 6;
    },
    // The two layers onto `paint`, the scene's 2D canvas. view: the camera (cam, origin,
    // width, height), land ({u0, v0, u1, v1, round}), reach (the scene's box: {u0, v0, u1,
    // v1, low, high}); sun: {way: {u, v} (a unit of height's shadow on the ground),
    // strength, darkest}; spots: [{u, v, z, reach, r, g, b}] (colours 0 to 1, times strength).
    draw: function (paint, view, sun, spots) {
      if (lost) {
        return;
      }
      var w = Math.max(1, Math.round(view.width * SCALE)), h = Math.max(1, Math.round(view.height * SCALE));
      if (board.width !== w || board.height !== h) {
        board.width = w;
        board.height = h;
      }
      var cam = view.cam, toward = [-cam.c, cam.a, (cam.a * cam.d - cam.b * cam.c) / cam.z];
      var corners = boxCorners(view.reach);
      var depths = spanOf(corners, toward), margin = (depths[1] - depths[0]) * 0.02;
      depths = [depths[0] - margin, depths[1] + margin];
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      var useCamera = function (p) {
        gl.useProgram(p.program);
        gl.uniform4f(p.at.cam, cam.a, cam.b, cam.c, cam.d);
        gl.uniform4f(p.at.frame, view.origin.x, view.origin.y, view.width, view.height);
        gl.uniform4f(p.at.pivot, cam.pivot.u, cam.pivot.v, cam.z, 0);
        gl.uniform3f(p.at.toward, toward[0], toward[1], toward[2]);
        gl.uniform2f(p.at.depths, depths[0], depths[1]);
        gl.uniform4f(p.at.land, view.land.u0, view.land.v0, view.land.u1, view.land.v1);
        gl.uniform1f(p.at.landRound, view.land.round);
      };
      if (sun.strength > 0.02) {
        drawShadows(paint, view, sun, corners, useCamera, w, h);
      }
      if (spots.length) {
        drawLights(paint, view, spots, useCamera, w, h);
      }
    },
  };
  return lighting;
}
