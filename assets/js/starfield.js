/* =================================================================
   starfield.js — the depth layer (plain WebGL · ES module)
   -----------------------------------------------------------------
   A single full-viewport field of drifting stars behind every page.
   The camera dollies forward as you scroll and drifts with the
   pointer, so the page reads as a sheet of glass over something deep
   rather than a flat dark rectangle.

   That is deliberately ALL it does. An earlier version of this scene
   flew wireframe models through the same corridor — a globe, a
   quadcopter, a control board. They were cut and the file deleted: the
   models competed with the type and read as decoration. The field
   stayed because it reads as depth, not as a showpiece. Do not add
   objects back here.

   This used to be drawn with Three.js: a 1.3 MB library (254 KB on the
   wire, on every page, re-downloaded on every asset version bump) to
   put 5,760 points on screen. It is now one shader and three draw
   calls, and the picture is the same one, reproduced from what that
   renderer actually did:
     · colours are blended in linear light and encoded to sRGB
     · points are additive (SRC_ALPHA, ONE) over the clear colour
     · exponential-squared fog toward the clear colour, by view depth
     · near layers shrink with distance; the far layer holds its size
     · points are antialiased by exact pixel coverage, which is what
       multisampling was approximating
     · the sprite is the old 64 px radial gradient, including what
       mip-mapping did to it: a point only a pixel or two across was
       never a bright dot with a halo, it was the sprite's AVERAGE, a
       faint even speck. Drawing the gradient straight at that size
       gives hot, shimmering pixels instead, so small points are
       blended toward that average (see `soft` in the shader).

   It also no longer runs flat out. It draws at most about 90 times a
   second however fast the display is (a 144 Hz monitor was paying for
   144), and the camera's easing is measured in time, not frames, so it
   moves the same on every display.

   Mounts itself into a fixed <canvas id="bg-canvas">. Degrades
   gracefully: no WebGL → the static site is untouched;
   prefers-reduced-motion → one still frame, no animation loop.
   ================================================================= */

const CONFIG = {
  bg: 0x04070c, // deep blue-black (clear colour + fog colour)

  // Camera flythrough
  fov: 58,
  startZ: 360,   // where the camera begins (top of page)
  travel: 1180,  // world units the camera dollies over a full scroll
  near: 1,
  far: 5200,

  // Atmosphere — light, so distant stars still read as points
  fogDensity: 0.00016,

  /* Field layers: count, spread (±xy), depth (z run), size, opacity,
     colour A→B, and whether size falls off with distance. The far layer
     drops attenuation and holds a constant pixel size, which is how a
     real star field behaves; the two nearer layers keep it, so the
     scroll dolly still has something to parallax against. */
  layers: [
    { count: 4200, spread: 1700, depth: 3800, size: 1.6, opacity: 0.85, atten: false, a: 0xbfe9ff, b: 0xffffff },
    { count: 1300, spread: 850,  depth: 2600, size: 2.4, opacity: 0.45, atten: true,  a: 0x2aa8d8, b: 0x9fe6ff },
    { count: 260,  spread: 340,  depth: 1100, size: 3.6, opacity: 0.22, atten: true,  a: 0x4fcfe6, b: 0xcffaff },
  ],

  // Pointer parallax
  parallaxX: 46,
  parallaxY: 28,
  ease: 0.055,     // per frame at EASE_HZ; applied by elapsed time
};
const EASE_HZ = 144;      // the rate the easing was tuned at
const MIN_FRAME_MS = 11;  // skip a frame that arrives sooner: 60/72/82/90 fps, evenly paced

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---- colour: hex is sRGB; blend in linear light; hand the shader sRGB ---- */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];

/* ---- the little linear algebra this needs (column-major, like GL) ---- */
function perspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(ex, ey, ez, tx, ty, tz) {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = zz, xy = 0, xz = -zx;                       // up(0,1,0) × z
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1,
  ]);
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aCol;
uniform mat4 uView, uProj;
uniform float uRot, uSize, uScale;
varying vec3 vCol;
varying float vDepth, vSize;
void main() {
  float c = cos(uRot), s = sin(uRot);
  vec4 mv = uView * vec4(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c, aPos.z, 1.0);
  gl_Position = uProj * mv;
  vDepth = -mv.z;
  vSize = uSize * (uScale > 0.0 ? uScale / max(vDepth, 0.001) : 1.0);
  gl_PointSize = vSize + 1.0;   // one pixel of margin, for the edge coverage below
  vCol = aCol;
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uOpacity, uFog;
uniform vec3 uFogCol;
varying vec3 vCol;
varying float vDepth, vSize;
void main() {
  // how much of this pixel the point's square covers: the antialiasing the
  // old renderer got from multisampling, done exactly. Without it a small
  // star snaps from pixel to pixel as the camera moves, and shimmers.
  vec2 d = (gl_PointCoord - 0.5) * (vSize + 1.0);          // px from the point's centre
  vec2 cov = clamp((vSize + 1.0) * 0.5 - abs(d), 0.0, min(1.0, vSize));
  // the sprite: 1 at the centre, 0.55 at 35% of the radius, 0 at the edge
  float r = length(d / vSize) * 2.0;
  float a = r < 0.35 ? mix(1.0, 0.55, r / 0.35) : mix(0.55, 0.0, clamp((r - 0.35) / 0.65, 0.0, 1.0));
  // what mip-mapping made of it at small sizes: its average (alpha 0.2265,
  // and the white dimmed by the transparent corners averaged into it)
  float soft = clamp(2.4 / vSize, 0.0, 1.0);
  a = mix(a, 0.2265, soft);
  float f = uFog * vDepth;
  vec3 c = mix(vCol * mix(1.0, 0.904, soft), uFogCol, 1.0 - exp(-f * f));
  gl_FragColor = vec4(c, a * uOpacity * cov.x * cov.y);
}`;

function init() {
  let canvas = document.getElementById("bg-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "bg-canvas";
    document.body.prepend(canvas);
  }

  // Phones get a lighter build so scrolling stays fluid: capped pixel
  // ratio and fewer particles.
  const IS_MOBILE =
    window.matchMedia("(max-width: 720px)").matches ||
    window.matchMedia("(pointer: coarse)").matches;
  const DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2);

  const opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" };
  const gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  if (!gl) return; // no WebGL — leave the static site untouched

  const bg = hex(CONFIG.bg);
  let prog, loc, layers;

  function build() {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    loc = {};
    ["aPos", "aCol"].forEach((n) => { loc[n] = gl.getAttribLocation(prog, n); });
    ["uView", "uProj", "uRot", "uSize", "uScale", "uOpacity", "uFog", "uFogCol"].forEach((n) => { loc[n] = gl.getUniformLocation(prog, n); });

    const zReach = CONFIG.startZ + 200;
    layers = CONFIG.layers.map((spec, i) => {
      const n = IS_MOBILE ? Math.round(spec.count * 0.4) : spec.count;
      const data = new Float32Array(n * 6);
      const ca = hex(spec.a).map(toLinear), cb = hex(spec.b).map(toLinear);
      for (let k = 0; k < n; k++) {
        data[k * 6] = (Math.random() - 0.5) * spec.spread * 2;
        data[k * 6 + 1] = (Math.random() - 0.5) * spec.spread * 2;
        data[k * 6 + 2] = zReach - Math.random() * spec.depth;
        const t = Math.random();
        for (let j = 0; j < 3; j++) data[k * 6 + 3 + j] = toSRGB(ca[j] + (cb[j] - ca[j]) * t);
      }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buf, n, spec, rot: 0, drift: 0.002 + i * 0.0015 };
    });

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.uniform1f(loc.uFog, CONFIG.fogDensity);
    gl.uniform3f(loc.uFogCol, bg[0], bg[1], bg[2]);
    return true;
  }

  let W = 0, H = 0, proj;
  function size() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    proj = perspective(CONFIG.fov, W / H, CONFIG.near, CONFIG.far);
  }

  if (!build()) return;
  size();

  /* ---- interaction state ---- */
  const pointer = { x: 0, y: 0 };   // -1..1
  const eased = { x: 0, y: 0 };
  let scrollT = 0;                  // 0..1 page scroll progress
  let camZ = CONFIG.startZ;

  function readScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    scrollT = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("load", readScroll);
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    // On touch devices the address bar slides in/out constantly, firing
    // resize with only a height change. Reallocating each time stutters
    // the scroll — so only react to real width changes.
    if (IS_MOBILE && window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    size();
    if (REDUCE) frame(0, 0);
  }, { passive: true });

  function frame(dt, t) {
    const k = 1 - Math.pow(1 - CONFIG.ease, dt * EASE_HZ);
    camZ += (CONFIG.startZ - scrollT * CONFIG.travel - camZ) * k;
    eased.x += (pointer.x - eased.x) * k;
    eased.y += (pointer.y - eased.y) * k;

    const ex = eased.x * CONFIG.parallaxX;
    const ey = -eased.y * CONFIG.parallaxY + Math.sin(t * 0.25) * 6;
    const view = lookAt(ex, ey, camZ, eased.x * 12, -eased.y * 8, camZ - 600);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    for (const l of layers) {
      l.rot += l.drift * dt;   // gentle counter-drift on each layer for added parallax
      gl.bindBuffer(gl.ARRAY_BUFFER, l.buf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.aCol);
      gl.vertexAttribPointer(loc.aCol, 3, gl.FLOAT, false, 24, 12);
      gl.uniform1f(loc.uRot, l.rot);
      gl.uniform1f(loc.uSize, l.spec.size * DPR);
      gl.uniform1f(loc.uScale, l.spec.atten === false ? 0 : H * 0.5);
      gl.uniform1f(loc.uOpacity, l.spec.opacity);
      gl.drawArrays(gl.POINTS, 0, l.n);
    }
  }

  // A lost context (GPU reset, a laptop waking) comes back blank: rebuild.
  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener("webglcontextrestored", () => { lost = !build(); if (!lost) { size(); frame(0, 0); } });

  readScroll();
  // Paint one frame synchronously before handing over to rAF. A page that
  // loads in a background tab gets no animation frames at all, so without
  // this the field is simply absent until the tab is focused — and even in
  // the foreground it saves a blank frame on first paint.
  frame(0, 0);
  if (REDUCE) return; // a single still frame

  let last = 0, elapsed = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || lost) { last = 0; return; }
    if (last && now - last < MIN_FRAME_MS) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    elapsed += dt;
    frame(dt, elapsed);
  }
  requestAnimationFrame(loop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
