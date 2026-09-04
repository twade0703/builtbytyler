/* =================================================================
   starfield.js — the depth layer (Three.js · ES module)
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

   No post-processing, no bloom, no models: three Points layers and a
   camera. It costs a fraction of what the old scene did.

   Mounts itself into a fixed <canvas id="bg-canvas">. Degrades
   gracefully: no WebGL or CDN failure → the static site is untouched;
   prefers-reduced-motion → one still frame, no animation loop.
   ================================================================= */

import * as THREE from "three";

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
     colour A→B, and whether size falls off with distance.

     The sizes look large next to the values the old scene used. They have
     to be. That version ran an UnrealBloom pass, which was quietly doing
     the work of making sub-pixel points visible — at 1.3 with attenuation
     a star 1000 units out renders under one pixel and disappears the
     moment the bloom is gone. The far layer therefore drops attenuation
     and holds a constant pixel size, which is how a real star field
     behaves anyway; the two nearer layers keep it, so the scroll dolly
     still has something to parallax against. */
  layers: [
    { count: 4200, spread: 1700, depth: 3800, size: 1.6, opacity: 0.85, atten: false, a: 0xbfe9ff, b: 0xffffff },
    { count: 1300, spread: 850,  depth: 2600, size: 2.4, opacity: 0.45, atten: true,  a: 0x2aa8d8, b: 0x9fe6ff },
    { count: 260,  spread: 340,  depth: 1100, size: 3.6, opacity: 0.22, atten: true,  a: 0x4fcfe6, b: 0xcffaff },
  ],

  // Pointer parallax
  parallaxX: 46,
  parallaxY: 28,
  ease: 0.055,
};

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* A soft round sprite, so each star is a point of light rather than a
   hard square. Drawn once and shared by every layer. */
function makeSpriteTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeLayer(spec, sprite, zReach) {
  const n = spec.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const ca = new THREE.Color(spec.a);
  const cb = new THREE.Color(spec.b);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spec.spread * 2;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spec.spread * 2;
    pos[i * 3 + 2] = zReach - Math.random() * spec.depth;
    tmp.copy(ca).lerp(cb, Math.random());
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: spec.size, map: sprite, vertexColors: true, transparent: true,
    opacity: spec.opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: spec.atten !== false,
  });
  return new THREE.Points(geo, mat);
}

function init() {
  let canvas = document.getElementById("bg-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "bg-canvas";
    document.body.prepend(canvas);
  }

  // Phones get a lighter build so scrolling stays fluid: capped pixel
  // ratio, fewer particles, no canvas MSAA.
  const IS_MOBILE =
    window.matchMedia("(max-width: 720px)").matches ||
    window.matchMedia("(pointer: coarse)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !IS_MOBILE, alpha: false, powerPreference: "high-performance",
    });
  } catch (e) {
    return; // no WebGL — leave the static site untouched
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CONFIG.bg, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CONFIG.bg, CONFIG.fogDensity);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.near, CONFIG.far
  );
  camera.position.set(0, 0, CONFIG.startZ);

  const sprite = makeSpriteTexture();
  const layers = CONFIG.layers.map((spec) => {
    const tuned = IS_MOBILE ? { ...spec, count: Math.round(spec.count * 0.4) } : spec;
    const layer = makeLayer(tuned, sprite, CONFIG.startZ + 200);
    scene.add(layer);
    return layer;
  });

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
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    // On touch devices the address bar slides in/out constantly, firing
    // resize with only a height change. Reallocating each time stutters
    // the scroll — so only react to real width changes.
    if (IS_MOBILE && w === lastW) return;
    lastW = w;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize, { passive: true });

  const clock = new THREE.Clock();

  function frame(dt, t) {
    const targetZ = CONFIG.startZ - scrollT * CONFIG.travel;
    camZ = lerp(camZ, targetZ, CONFIG.ease);
    eased.x = lerp(eased.x, pointer.x, CONFIG.ease);
    eased.y = lerp(eased.y, pointer.y, CONFIG.ease);

    camera.position.x = eased.x * CONFIG.parallaxX;
    camera.position.y = -eased.y * CONFIG.parallaxY + Math.sin(t * 0.25) * 6;
    camera.position.z = camZ;
    camera.lookAt(eased.x * 12, -eased.y * 8, camZ - 600);

    // Gentle counter-drift on each layer for added parallax.
    layers.forEach((l, i) => { l.rotation.z += (0.002 + i * 0.0015) * dt; });

    renderer.render(scene, camera);
  }

  if (REDUCE) {
    readScroll();
    frame(0, 0); // a single still frame
    return;
  }

  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    frame(dt, clock.elapsedTime);
  }
  readScroll();
  // Paint one frame synchronously before handing over to rAF. A page that
  // loads in a background tab gets no animation frames at all, so without
  // this the field is simply absent until the tab is focused — and even in
  // the foreground it saves a blank frame on first paint.
  frame(0, 0);
  loop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
