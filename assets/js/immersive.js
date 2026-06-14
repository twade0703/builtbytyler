/* =================================================================
   immersive.js — the depth layer (Three.js · ES module)
   -----------------------------------------------------------------
   A single full-viewport WebGL world that lives behind every page
   and gives the site real, physical depth:

     · a deep, fog-shrouded corridor of parallax particle layers
     · a slowly rotating wireframe eVTOL — the same geometry as the
       2D card holograms, rebuilt as true 3D LineSegments
     · tilted orbit rings + a glowing core for the centerpiece
     · UnrealBloom for the soft, premium glow
     · the camera DOLLIES FORWARD as you scroll — you fly through
       the craft and on into the particle field
     · mouse parallax + idle drift so the scene is always alive

   Mounts itself into a fixed <canvas id="bg-canvas">. Degrades
   gracefully: no WebGL or CDN failure → the static site is untouched;
   prefers-reduced-motion → one still frame, no animation loop.

   Tunables live in CONFIG. Geometry builders are ported from
   assets/js/hologram.js so the two layers stay visually consistent.
   ================================================================= */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ----------------------------------------------------------------
   CONFIG — every magic number worth touching, in one place.
   ---------------------------------------------------------------- */
const CONFIG = {
  bg: 0x04050a, // deep space / clear colour (matches --bg family)

  // Camera flythrough
  fov: 58,
  startZ: 300, // where the camera begins (top of page)
  travel: 720, // world units the camera dollies over a full scroll
  near: 1,
  far: 4200,

  // The eVTOL centrepiece
  craftScale: 80,
  craftPos: [0, -10, -40], // world position (x, y, z)
  craftColor: 0x86b8ff, // holographic blue (mirrors hologram.js tints)
  craftOpacity: 0.92,
  rotorSpin: 6.0, // rotor angular speed (rad/s)
  autoSpin: 0.06, // idle yaw of the whole craft (rad/s)

  // Atmosphere
  fogDensity: 0.00042,

  // Parallax particle layers: [count, spreadXY, depth, size, opacity, colorA, colorB]
  layers: [
    { count: 2600, spread: 1100, depth: 3000, size: 2.4, opacity: 0.9, a: 0x9cc4ff, b: 0xeaf2ff },
    { count: 1400, spread: 700, depth: 2200, size: 3.4, opacity: 0.7, a: 0x5d86ff, b: 0xbcd4ff },
    { count: 900, spread: 360, depth: 1200, size: 5.2, opacity: 0.45, a: 0x3a6bd6, b: 0x8fb6ff },
  ],

  bloom: { strength: 0.72, radius: 0.6, threshold: 0.2 },

  // Pointer parallax
  parallaxX: 46,
  parallaxY: 28,
  ease: 0.055, // lerp factor for camera easing
};

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ================================================================
   GEOMETRY BUILDERS — ported from hologram.js
   Each returns { v: [[x,y,z]...], e: [[i,j]...] } authored around
   the origin within roughly a unit sphere.
   ================================================================ */
function makeBox(cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const e = [
    [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return { v, e };
}

function makeRing(cx, cy, cz, r, seg, axis) {
  const v = [], e = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a) * r, s = Math.sin(a) * r;
    if (axis === "y") v.push([cx + c, cy, cz + s]);
    else if (axis === "z") v.push([cx + c, cy + s, cz]);
    else v.push([cx, cy + c, cz + s]); // axis === 'x'
    e.push([i, (i + 1) % seg]);
  }
  return { v, e };
}

function segBox(p0, p1, thick) {
  const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2;
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy, p1[2] - p0[2]) || 0.001;
  const ang = Math.atan2(dx, dy);
  const b = makeBox(0, 0, 0, thick, len, thick);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  b.v = b.v.map(([x, y, z]) => [x * ca + y * sa + mx, -x * sa + y * ca + my, z + mz]);
  return b;
}

function merge(parts) {
  const v = [], e = [];
  for (const p of parts) {
    const off = v.length;
    for (const vert of p.v) v.push(vert);
    for (const ed of p.e) e.push([ed[0] + off, ed[1] + off]);
  }
  return { v, e };
}

function makeBase(y, r) {
  const ring = makeRing(0, y, 0, r, 28, "y");
  const inner = makeRing(0, y, 0, r * 0.55, 20, "y");
  const spokes = { v: [], e: [] };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    spokes.v.push([Math.cos(a) * r * 0.55, y, Math.sin(a) * r * 0.55]);
    spokes.v.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    spokes.e.push([i * 2, i * 2 + 1]);
  }
  return merge([ring, inner, spokes]);
}

function makeLoft(stations, seg) {
  const rings = stations.map((s) => makeRing(s.cx || 0, s.cy || 0, s.z, s.r, seg, "z"));
  const m = merge(rings);
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < seg; i++) m.e.push([s * seg + i, (s + 1) * seg + i]);
  }
  return m;
}

/* eVTOL aircraft — tilt-rotor lift config. Returns merged static
   wireframe plus a `spinners` list (rotor hubs, animated live). */
function buildEvtol() {
  const parts = [];
  parts.push(makeLoft([
    { z: 0.92, cy: -0.02, r: 0.015 },
    { z: 0.74, cy: -0.04, r: 0.10 },
    { z: 0.45, cy: -0.02, r: 0.16 },
    { z: 0.05, cy: 0.00, r: 0.18 },
    { z: -0.35, cy: 0.02, r: 0.14 },
    { z: -0.70, cy: 0.05, r: 0.06 },
    { z: -0.86, cy: 0.06, r: 0.02 },
  ], 8));
  parts.push({ v: [[0, 0.13, 0.52], [0, 0.14, 0.2], [0, 0.1, 0.0]], e: [[0, 1], [1, 2]] });
  parts.push(makeBox(0, 0.03, 0.12, 2.0, 0.05, 0.34));
  const ribs = { v: [], e: [] };
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const x = i * 0.3, k = ribs.v.length;
    ribs.v.push([x, 0.055, -0.05], [x, 0.005, -0.05], [x, 0.055, 0.29], [x, 0.005, 0.29]);
    ribs.e.push([k, k + 1], [k + 2, k + 3], [k, k + 2], [k + 1, k + 3]);
  }
  parts.push(ribs);
  parts.push({ v: [[-1.0, 0.03, 0.12], [1.0, 0.03, 0.12]], e: [[0, 1]] });
  parts.push(segBox([0, 0.06, -0.62], [0.42, 0.42, -0.7], 0.04));
  parts.push(segBox([0, 0.06, -0.62], [-0.42, 0.42, -0.7], 0.04));
  const rotors = [
    [0.96, 0.42], [0.5, 0.44], [-0.5, 0.44], [-0.96, 0.42],
    [0.74, -0.5], [-0.74, -0.5],
  ];
  const spinners = [];
  for (const [x, z] of rotors) {
    parts.push(segBox([x, 0.02, 0.12], [x, 0.05, z], 0.05));
    parts.push(makeBox(x, 0.0, z, 0.08, 0.1, 0.18));
    parts.push(makeRing(x, 0.06, z, 0.24, 22, "y"));
    parts.push(makeRing(x, 0.06, z, 0.05, 8, "y"));
    spinners.push({ cx: x, cy: 0.07, cz: z, r: 0.21, blades: 5 });
  }
  [-0.18, 0.18].forEach((sx) => {
    [0.25, -0.25].forEach((sz) => parts.push(segBox([sx, -0.02, sz], [sx * 1.15, -0.32, sz], 0.02)));
  });
  parts.push({ v: [[-0.21, -0.32, 0.3], [-0.21, -0.32, -0.3]], e: [[0, 1]] });
  parts.push({ v: [[0.21, -0.32, 0.3], [0.21, -0.32, -0.3]], e: [[0, 1]] });
  parts.push(makeBase(-0.92, 1.1));
  const m = merge(parts);
  m.spinners = spinners;
  return m;
}

/* {v,e} → flat Float32Array of segment endpoints for LineSegments. */
function edgesToPositions(model) {
  const pos = new Float32Array(model.e.length * 6);
  let o = 0;
  for (const [i, j] of model.e) {
    const a = model.v[i], b = model.v[j];
    pos[o++] = a[0]; pos[o++] = a[1]; pos[o++] = a[2];
    pos[o++] = b[0]; pos[o++] = b[1]; pos[o++] = b[2];
  }
  return pos;
}

/* ================================================================
   SCENE ASSEMBLY
   ================================================================ */
function makeSpriteTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(220,235,255,0.85)");
  g.addColorStop(0.55, "rgba(140,180,255,0.30)");
  g.addColorStop(1.0, "rgba(120,170,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/* One parallax dust/star layer spread across a long Z corridor. */
function makeLayer(spec, sprite, zReach) {
  const { count, spread, depth, size, opacity, a, b } = spec;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cA = new THREE.Color(a), cB = new THREE.Color(b);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * spread * 2;
    positions[i3 + 1] = (Math.random() - 0.5) * spread * 2;
    // bias the corridor from in front of the camera to deep behind
    positions[i3 + 2] = zReach - Math.random() * depth;
    tmp.copy(cA).lerp(cB, Math.random());
    colors[i3] = tmp.r; colors[i3 + 1] = tmp.g; colors[i3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: sprite,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

/* The eVTOL group: static wireframe + live rotor groups + orbit
   rings + a glowing core. */
function makeCraft(sprite) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: CONFIG.craftColor,
    transparent: true,
    opacity: CONFIG.craftOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const model = buildEvtol();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(edgesToPositions(model), 3));
  group.add(new THREE.LineSegments(geo, material));

  // Live rotor blades — a spinning group per hub.
  const rotors = [];
  for (const sp of model.spinners) {
    const bp = new Float32Array(sp.blades * 6);
    let o = 0;
    for (let b = 0; b < sp.blades; b++) {
      const a = (b / sp.blades) * Math.PI * 2;
      bp[o++] = 0; bp[o++] = 0; bp[o++] = 0;
      bp[o++] = Math.cos(a) * sp.r; bp[o++] = 0; bp[o++] = Math.sin(a) * sp.r;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    const rg = new THREE.Group();
    rg.position.set(sp.cx, sp.cy, sp.cz);
    rg.add(new THREE.LineSegments(bg, material));
    group.add(rg);
    rotors.push(rg);
  }

  // Two tilted orbit rings — a quiet "scan field" around the craft.
  const ringMat = new THREE.LineBasicMaterial({
    color: 0x4f86ff, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const orbits = [];
  [[1.7, 0.5], [2.15, -0.85]].forEach(([r, tilt], idx) => {
    const seg = 96, p = new Float32Array(seg * 6);
    let o = 0;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      p[o++] = Math.cos(a0) * r; p[o++] = 0; p[o++] = Math.sin(a0) * r;
      p[o++] = Math.cos(a1) * r; p[o++] = 0; p[o++] = Math.sin(a1) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const loop = new THREE.LineSegments(g, ringMat);
    loop.rotation.x = tilt;
    loop.rotation.z = idx ? 0.4 : -0.3;
    group.add(loop);
    orbits.push(loop);
  });

  // Glowing core — a single bright sprite to anchor the bloom.
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
  const core = new THREE.Points(coreGeo, new THREE.PointsMaterial({
    size: 0.55, map: sprite, color: 0xdbeaff, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  group.add(core);

  group.scale.setScalar(CONFIG.craftScale);
  group.position.set(...CONFIG.craftPos);
  return { group, rotors, orbits };
}

/* ================================================================
   BOOT
   ================================================================ */
function init() {
  let canvas = document.getElementById("bg-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "bg-canvas";
    document.body.prepend(canvas);
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    return; // no WebGL — leave the static site untouched
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
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
    const layer = makeLayer(spec, sprite, CONFIG.startZ + 200);
    scene.add(layer);
    return layer;
  });

  const craft = makeCraft(sprite);
  scene.add(craft.group);

  // Post-processing — bloom for the glow.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(dpr);
  composer.setSize(window.innerWidth, window.innerHeight);

  /* ---- interaction state ---- */
  const pointer = { x: 0, y: 0 };      // -1..1
  const eased = { x: 0, y: 0 };
  let scrollT = 0;                      // 0..1 page scroll progress
  let camZ = CONFIG.startZ;

  function readScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    scrollT = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener("resize", onResize, { passive: true });

  const clock = new THREE.Clock();

  function frame(dt, t) {
    // Camera dolly driven by scroll, plus eased pointer parallax.
    const targetZ = CONFIG.startZ - scrollT * CONFIG.travel;
    camZ = lerp(camZ, targetZ, CONFIG.ease);
    eased.x = lerp(eased.x, pointer.x, CONFIG.ease);
    eased.y = lerp(eased.y, pointer.y, CONFIG.ease);

    camera.position.x = eased.x * CONFIG.parallaxX;
    camera.position.y = -eased.y * CONFIG.parallaxY + Math.sin(t * 0.25) * 6;
    camera.position.z = camZ;
    camera.lookAt(eased.x * 12, -eased.y * 8, camZ - 600);

    // Centerpiece life
    craft.group.rotation.y += CONFIG.autoSpin * dt;
    craft.group.position.y = CONFIG.craftPos[1] + Math.sin(t * 0.5) * 4;
    for (const r of craft.rotors) r.rotation.y += CONFIG.rotorSpin * dt;
    craft.orbits.forEach((o, i) => { o.rotation.y += (i ? -0.25 : 0.18) * dt; });
    // Fade the craft out once the camera has flown past it.
    const past = camZ < CONFIG.craftPos[2] - 30;
    craft.group.visible = !past;

    // Gentle counter-drift on the far layers for added parallax.
    layers.forEach((l, i) => { l.rotation.z += (0.002 + i * 0.0015) * dt; });

    composer.render();
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
  loop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
