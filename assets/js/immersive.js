/* =================================================================
   immersive.js — the depth layer (Three.js · ES module)
   -----------------------------------------------------------------
   A single full-viewport WebGL world that lives behind every page
   and gives the site real, physical depth:

     · a deep, near-black field of distant stars + drifting dust,
       lightly fogged so the corridor recedes forever
     · a FLEET of icon aircraft rebuilt as true 3D wireframes —
       the F-22 Raptor, the B-2 Spirit, and SpaceX Starship —
       each drifting in space with glowing engines
     · UnrealBloom for the soft glow on edges + exhaust
     · the camera DOLLIES FORWARD as you scroll, flying PAST each
       craft in turn and on into the deep field
     · mouse parallax + idle drift so the scene is always alive

   Same wireframe rendering as before (additive blue LineSegments
   + bloom); only the models and the field tuning changed.

   Mounts itself into a fixed <canvas id="bg-canvas">. Degrades
   gracefully: no WebGL or CDN failure → the static site is untouched;
   prefers-reduced-motion → one still frame, no animation loop.
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
  bg: 0x04070c, // deep blue-black space (clear colour + fog colour)

  // Camera flythrough
  fov: 58,
  startZ: 360, // where the camera begins (top of page)
  travel: 1180, // world units the camera dollies over a full scroll
  near: 1,
  far: 5200,

  // Wireframe look — quieter, more minimal
  craftColor: 0x57d0ff,
  craftOpacity: 0.78,

  // Atmosphere — light, so distant stars still read as points
  fogDensity: 0.00028,

  // Parallax field layers: count, spread (±xy), depth (z run), size, opacity, colour A→B
  layers: [
    { count: 4200, spread: 1700, depth: 3800, size: 1.3, opacity: 0.9, a: 0xbfe9ff, b: 0xffffff },
    { count: 1300, spread: 850, depth: 2600, size: 2.2, opacity: 0.42, a: 0x2aa8d8, b: 0x9fe6ff },
    { count: 420, spread: 340, depth: 1100, size: 3.4, opacity: 0.26, a: 0x4fcfe6, b: 0xcffaff },
  ],

  bloom: { strength: 0.5, radius: 0.55, threshold: 0.22 },

  // Pointer parallax
  parallaxX: 46,
  parallaxY: 28,
  ease: 0.055,
};

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ================================================================
   GEOMETRY VOCABULARY
   Every builder returns { v: [[x,y,z]...], e: [[i,j]...] } authored
   around the origin within roughly a unit sphere. Convention:
   +z = nose / forward, +x = right wing, +y = up.
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

// Circle of `seg` points; axis = the axis it is perpendicular to.
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

function merge(parts) {
  const v = [], e = [];
  for (const p of parts) {
    const off = v.length;
    for (const vert of p.v) v.push(vert);
    for (const ed of p.e) e.push([ed[0] + off, ed[1] + off]);
  }
  return { v, e };
}

// Closed outline from an ordered list of 3D points (a flat panel edge).
function makeLoop(pts) {
  const v = pts.map((p) => p.slice());
  const e = [];
  for (let i = 0; i < v.length; i++) e.push([i, (i + 1) % v.length]);
  return { v, e };
}

// Lofted hull from cross-sections. Each section = { z, pts:[[x,y]...] }
// with an equal point count; rings are joined nose→tail by longerons.
function makeHull(sections) {
  const parts = sections.map((s) => makeLoop(s.pts.map(([x, y]) => [x, y, s.z])));
  const m = merge(parts);
  const n = sections[0].pts.length;
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < n; i++) m.e.push([s * n + i, (s + 1) * n + i]);
  }
  return m;
}

// Stacked rings along Y (a vertical body), joined by stringers.
function makeStackY(stations, seg) {
  const rings = stations.map((s) => makeRing(s.cx || 0, s.y, s.cz || 0, s.r, seg, "y"));
  const m = merge(rings);
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < seg; i++) m.e.push([s * seg + i, (s + 1) * seg + i]);
  }
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
   THE FLEET
   ================================================================ */

// Lockheed Martin F-22 Raptor — angular stealth fuselage, clipped
// delta wings, canted twin tails, twin afterburner nozzles.
function buildF22() {
  const parts = [];
  // 6-sided stealth cross-section (top, shoulders, chines, belly).
  const cs = (hw, ht, hb) => [
    [0, ht], [-hw, ht * 0.2], [-hw * 0.85, -hb * 0.55],
    [0, -hb], [hw * 0.85, -hb * 0.55], [hw, ht * 0.2],
  ];
  parts.push(makeHull([
    { z: 1.15, pts: cs(0.02, 0.012, 0.012) }, // nose
    { z: 0.78, pts: cs(0.10, 0.05, 0.05) },
    { z: 0.45, pts: cs(0.17, 0.12, 0.09) },   // cockpit
    { z: 0.10, pts: cs(0.24, 0.13, 0.12) },   // widest / intakes
    { z: -0.30, pts: cs(0.23, 0.11, 0.12) },
    { z: -0.72, pts: cs(0.20, 0.09, 0.10) },  // engine bay
    { z: -1.0, pts: cs(0.17, 0.08, 0.09) },   // exhaust plane
  ]));
  // Canopy ridge
  parts.push({ v: [[0, 0.16, 0.55], [0, 0.20, 0.36], [0, 0.17, 0.12], [0, 0.13, -0.02]], e: [[0, 1], [1, 2], [2, 3]] });
  // Clipped-delta wings + a rib, mirrored
  const wing = [[0.24, 0.30], [0.95, -0.16], [0.95, -0.40], [0.24, -0.55]];
  [1, -1].forEach((s) => {
    parts.push(makeLoop(wing.map(([x, z]) => [x * s, 0.0, z])));
    parts.push({ v: [[0.45 * s, 0, 0.12], [0.78 * s, 0, -0.28]], e: [[0, 1]] });
  });
  // Horizontal stabilators
  const stab = [[0.20, -0.62], [0.62, -0.82], [0.62, -0.98], [0.20, -1.0]];
  [1, -1].forEach((s) => parts.push(makeLoop(stab.map(([x, z]) => [x * s, 0.0, z]))));
  // Canted twin vertical tails (top edge kicked outboard)
  [1, -1].forEach((s) => parts.push(makeLoop([
    [0.13 * s, 0.13, -0.45], [0.27 * s, 0.50, -0.55],
    [0.27 * s, 0.46, -0.74], [0.13 * s, 0.12, -0.80],
  ])));
  // Caret intakes + twin nozzles (afterburner glow points)
  const glows = [];
  [1, -1].forEach((s) => {
    parts.push(makeBox(0.20 * s, -0.10, 0.18, 0.10, 0.10, 0.30));
    parts.push(makeRing(0.09 * s, -0.02, -1.0, 0.07, 12, "z"));
    glows.push([0.09 * s, -0.02, -1.03]);
  });
  const m = merge(parts);
  m.glows = glows;
  m.glowColor = 0xbdefff; // icy afterburner
  m.glowSize = 0.16;
  return m;
}

// Northrop B-2 Spirit — pure flying wing: pointed centre nose, long
// swept leading edges, the signature double-W sawtooth trailing edge.
function buildB2() {
  const parts = [];
  // Right-half outline: nose → leading edge → tip → sawtooth → centre rear.
  const half = [
    [0.0, 0.60], [0.5, 0.14], [1.0, -0.42], [0.78, -0.50],
    [0.62, -0.32], [0.46, -0.54], [0.30, -0.34], [0.16, -0.58], [0.0, -0.42],
  ];
  const loop = half.map(([x, z]) => [x, 0, z]);
  for (let i = half.length - 2; i >= 1; i--) loop.push([-half[i][0], 0, half[i][1]]);
  parts.push(makeLoop(loop));
  // Spanwise ribs (leading edge → trailing edge) to read the surface
  [0.28, 0.52, 0.76].forEach((fx) => {
    const leZ = 0.60 - 1.02 * fx; // approximate leading-edge sweep
    [1, -1].forEach((s) => parts.push({ v: [[fx * s, 0, leZ], [fx * s, 0, -0.46]], e: [[0, 1]] }));
  });
  // Centre cockpit bulge
  parts.push({
    v: [[0, 0.0, 0.5], [0, 0.12, 0.34], [-0.13, 0.06, 0.26], [0.13, 0.06, 0.26], [0, 0.10, 0.10]],
    e: [[0, 1], [1, 2], [1, 3], [1, 4]],
  });
  // Engine humps + exhaust slots on the upper surface (two pairs)
  const glows = [];
  [1, -1].forEach((s) => {
    parts.push(makeBox(0.22 * s, 0.06, -0.04, 0.16, 0.08, 0.28));
    parts.push(makeBox(0.42 * s, 0.05, -0.10, 0.13, 0.06, 0.22));
    glows.push([0.22 * s, 0.03, -0.22], [0.42 * s, 0.03, -0.25]);
  });
  const m = merge(parts);
  m.glows = glows;
  m.glowColor = 0x9fe6ff; // cool, low exhaust
  m.glowSize = 0.11;
  return m;
}

// SpaceX Starship (full stack) — Super Heavy booster + ship, nosecone,
// fore/aft flaps, grid fins, and the Raptor engine cluster. Built tall
// along +Y so it stands in the void.
function buildStarship() {
  const parts = [];
  const seg = 12;
  parts.push(makeStackY([
    { y: -1.05, r: 0.0 },   // engine plane centre
    { y: -1.0, r: 0.22 },   // booster base
    { y: -0.25, r: 0.22 },  // booster top
    { y: -0.16, r: 0.235 }, // interstage flare
    { y: -0.10, r: 0.22 },  // ship base
    { y: 0.52, r: 0.22 },   // ship body top
    { y: 0.74, r: 0.205 },  // nosecone start
    { y: 0.98, r: 0.12 },
    { y: 1.18, r: 0.0 },    // nose tip
  ], seg));
  parts.push(makeRing(0, -0.16, 0, 0.235, seg, "y")); // interstage highlight

  // Flaps — aft pair near the ship base, forward pair near the nose.
  [1, -1].forEach((s) => {
    parts.push(makeLoop([
      [0.21 * s, -0.02, 0], [0.50 * s, 0.04, 0], [0.48 * s, -0.20, 0], [0.21 * s, -0.26, 0],
    ]));
    parts.push(makeLoop([
      [0.20 * s, 0.62, 0], [0.42 * s, 0.66, 0], [0.41 * s, 0.50, 0], [0.20 * s, 0.46, 0],
    ]));
  });

  // Grid fins on the booster (4, deployed near the top of Super Heavy)
  [[0.24, 0], [-0.24, 0], [0, 0.24], [0, -0.24]].forEach(([dx, dz]) =>
    parts.push(makeBox(dx, -0.32, dz, 0.10, 0.14, 0.05)));

  // Raptor engine cluster + exhaust glow
  const glows = [[0, -1.06, 0]];
  parts.push(makeRing(0, -1.0, 0, 0.05, 8, "y"));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cx = Math.cos(a) * 0.13, cz = Math.sin(a) * 0.13;
    parts.push(makeRing(cx, -1.0, cz, 0.04, 6, "y"));
    glows.push([cx, -1.05, cz]);
  }
  const m = merge(parts);
  m.glows = glows;
  m.glowColor = 0xd6f6ff; // icy plume
  m.glowSize = 0.14;
  return m;
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
    positions[i3 + 2] = zReach - Math.random() * depth;
    tmp.copy(cA).lerp(cB, Math.random());
    colors[i3] = tmp.r; colors[i3 + 1] = tmp.g; colors[i3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size, map: sprite, vertexColors: true, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

/* Build one craft group from a model + placement options. */
function makeCraft(model, sprite, opts) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: CONFIG.craftColor, transparent: true, opacity: CONFIG.craftOpacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(edgesToPositions(model), 3));
  group.add(new THREE.LineSegments(geo, material));

  // Engine / afterburner glow sprites — they anchor the bloom.
  if (model.glows && model.glows.length) {
    const gp = new Float32Array(model.glows.length * 3);
    model.glows.forEach((p, i) => { gp[i * 3] = p[0]; gp[i * 3 + 1] = p[1]; gp[i * 3 + 2] = p[2]; });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
    group.add(new THREE.Points(gg, new THREE.PointsMaterial({
      size: model.glowSize || 0.15, map: sprite, color: model.glowColor || 0xbdefff,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })));
  }

  group.scale.setScalar(opts.scale);
  group.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
  group.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return {
    group, base: opts.pos.slice(), baseYaw: opts.rot[1],
    spinY: opts.spinY || 0, bob: opts.bob || 0, phase: opts.phase || 0,
  };
}

// Placement of the three craft along the flythrough corridor. Offset
// left/right so the camera flies PAST each (not straight through).
const FLEET = [
  { build: buildF22, pos: [-78, 26, 60], scale: 70, rot: [0.06, 0.6, 0.20], spinY: 0.05, bob: 5, phase: 0.0, label: "F-22 Raptor", tag: "Air dominance fighter" },
  { build: buildB2, pos: [92, -34, -300], scale: 86, rot: [0.22, -0.5, 0.0], spinY: -0.04, bob: 6, phase: 1.7, label: "B-2 Spirit", tag: "Stealth bomber" },
  { build: buildStarship, pos: [-50, -4, -640], scale: 60, rot: [0.0, 0.4, 0.16], spinY: 0.05, bob: 7, phase: 3.2, label: "Starship", tag: "Orbital launch vehicle" },
];

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

  const crafts = FLEET.map((spec) => {
    const craft = makeCraft(spec.build(), sprite, spec);
    scene.add(craft.group);
    return craft;
  });

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

  // HUD elements (injected by components.js) — driven from scroll.
  const hud = {
    bar: document.getElementById("hud-bar"),
    pct: document.getElementById("hud-pct"),
    name: document.getElementById("hud-craft-name"),
    tag: document.getElementById("hud-craft-tag"),
  };
  let hudIdx = -1;

  function readScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    scrollT = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;

    // Drive the HUD: progress bar, scroll readout, and the callout for
    // whichever craft the camera is currently nearest.
    if (hud.bar) hud.bar.style.transform = `scaleX(${scrollT.toFixed(4)})`;
    if (hud.pct) hud.pct.textContent = String(Math.round(scrollT * 100)).padStart(3, "0");
    if (hud.name) {
      const cz = CONFIG.startZ - scrollT * CONFIG.travel;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < FLEET.length; i++) {
        const d = Math.abs(cz - FLEET[i].pos[2]);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best !== hudIdx) {
        hudIdx = best;
        hud.name.textContent = FLEET[best].label;
        if (hud.tag) hud.tag.textContent = FLEET[best].tag;
      }
    }
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

    // Each craft drifts: slow yaw + vertical bob, hidden once flown past.
    for (const c of crafts) {
      c.group.rotation.y = c.baseYaw + c.spinY * t;
      c.group.position.y = c.base[1] + Math.sin(t * 0.4 + c.phase) * c.bob;
      c.group.visible = camZ > c.base[2] - 40;
    }

    // Gentle counter-drift on the field for added parallax.
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
