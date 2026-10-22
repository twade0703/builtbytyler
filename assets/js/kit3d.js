/* The Sensor Kit in 3D: shared viewer + the parts we model ourselves (all units mm, y up).
   Used by kit-box.js (the boxed kit on the Hardware and kit pages) and kit.js (each module's wiring scene).

   Viewer: renders only when something changes (orbit, hover, animation), pauses off screen, caps the pixel ratio.
   Mouse: left or middle drag orbits, right drag pans, wheel zooms, click picks. Touch: one finger spins (the page scrolls outside the 3D),
   two fingers tilt and zoom, a tap picks. */
import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";

export { THREE };
export const COARSE = window.matchMedia("(pointer: coarse)").matches;

/* ------------------------------------------------------------------ viewer */
export function createViewer(host, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.75));
  // shader compile/link logs are a blocking round trip to the GPU process per call; only fetch them while developing
  renderer.debug.checkShaderErrors = location.hostname === "localhost";
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = "k3d__canvas";
  host.prepend(canvas);

  const scene = new THREE.Scene();
  // the environment map compiles and renders a few shaders on the spot; deferEnv lets the caller run it in its own task
  const makeEnv = () => {
    if (scene.environment) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = opts.env ?? 0.6;
    pmrem.dispose();
  };
  if (!opts.deferEnv) makeEnv();
  const key = new THREE.DirectionalLight(0xfff3e6, opts.key ?? 2.3);
  key.position.set(-220, 420, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const S = opts.shadowSize || 260;
  Object.assign(key.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 20, far: 1500 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.35;
  key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 0.6);
  rim.position.set(300, 200, -380);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(opts.fov || 30, 1, 5, 8000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  controls.zoomToCursor = true;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(opts.maxPolar ?? 82);
  if (COARSE) {
    // inside the 3D a finger is the model's: one finger spins it any way, two tilt and zoom; the page scrolls outside it
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    canvas.style.touchAction = "none";
  }
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });   // no autoscroll on middle

  // --- render on demand
  let pending = false, visible = true, animating = 0, ready = false;
  const tickers = new Set();
  function frame(t) {
    pending = false;
    if (!visible || !ready) return;
    const moving = controls.update();
    const d = camera.position.distanceTo(controls.target);
    const near = Math.max(0.05, d / 200), far = d * 60;
    if (Math.abs(camera.near - near) > near * 0.05 || Math.abs(camera.far - far) > far * 0.05) {
      camera.near = near; camera.far = far; camera.updateProjectionMatrix();
    }
    let busy = false;
    tickers.forEach((f) => { if (f(t) === true) busy = true; });
    renderer.render(scene, camera);
    if (moving || busy || animating > 0) request();
  }
  function request() { if (!pending) { pending = true; requestAnimationFrame(frame); } }
  controls.addEventListener("change", request);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  }
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) request(); }, { rootMargin: "100px" }).observe(host);

  // --- picking (click without drag) and hover
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  const toNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return ndc;
  };
  const pickables = [];
  function pick(e) {
    if (!pickables.length) return null;
    ray.setFromCamera(toNdc(e), camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.pick : null;
  }
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved < 6 && e.button === 0 && opts.onPick) opts.onPick(pick(e), e);
  });
  if (!COARSE && opts.onHover) {
    let last = null;
    canvas.addEventListener("pointermove", (e) => {
      if (e.buttons) return;
      const p = pick(e);
      if (p !== last) { last = p; opts.onHover(p, e); request(); }
      else if (p) opts.onHover(p, e, true);
    });
    canvas.addEventListener("pointerleave", () => { if (last) { last = null; opts.onHover(null); request(); } });
  }

  // drop any orbit momentum left from a drag, so a camera move that follows is not carried on by it
  function stopMotion() {
    const damp = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damp;
  }
  // `pad` scales the bounding-sphere distance (tight on a wide canvas); the corner fit underneath it keeps every
  // corner of the box inside the frame at the canvas's real shape, so a narrow phone canvas never crops it
  function frameObject(box, dir, pad = 1.08) {
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const r = size.length() / 2;
    const d = dir.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    let fit = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const z = p.dot(d);
      fit = Math.max(fit, z + Math.abs(p.dot(right)) / tanH, z + Math.abs(p.dot(up)) / tanV);
    }
    const dist = Math.max((r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * pad / Math.min(1, camera.aspect * 0.95), fit * 1.06);
    camera.position.copy(c).add(dir.clone().normalize().multiplyScalar(dist));
    camera.near = dist / 50; camera.far = dist * 8;
    camera.updateProjectionMatrix();
    controls.target.copy(c);
    controls.minDistance = opts.minDistance || r * 0.35;
    controls.maxDistance = dist * 2.2;
    controls.update();
    return { position: camera.position.clone(), target: c.clone(), min: controls.minDistance, max: controls.maxDistance };
  }
  function goHome(h) {
    stopMotion();
    controls.minDistance = h.min; controls.maxDistance = h.max;
    camera.position.copy(h.position); controls.target.copy(h.target);
    camera.near = h.position.distanceTo(h.target) / 50; camera.far = h.position.distanceTo(h.target) * 8;
    camera.updateProjectionMatrix(); controls.update(); request();
  }
  function project(v) {
    const p = v.clone().project(camera);
    return [(p.x + 1) / 2 * host.clientWidth, (1 - p.y) / 2 * host.clientHeight, p.z < 1];
  }
  function updateShadows() { renderer.shadowMap.needsUpdate = true; request(); }
  function animate(ms, f, done) {          // f(u) with u 0..1, eased by caller
    animating++;
    const t0 = performance.now();
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / ms);
      f(u);
      renderer.shadowMap.needsUpdate = true;
      if (u < 1) requestAnimationFrame(step);
      else { animating--; if (done) done(); }
      request();
    };
    requestAnimationFrame(step);
  }
  resize();
  function setReady() { ready = true; renderer.shadowMap.needsUpdate = true; request(); }
  return { setReady, renderer, scene, camera, controls, canvas, key, pickables, request, resize, frameObject, goHome, stopMotion, project,
           updateShadows, animate, tickers, makeEnv };
}

export const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/* ------------------------------------------------------------------ materials + helpers */
const M = {};
export function mat(name) {
  if (M[name]) return M[name];
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const table = {
    pcb: () => S({ color: 0x111214, roughness: 0.45, metalness: 0.0 }),
    black: () => S({ color: 0x18181a, roughness: 0.6 }),
    blackGloss: () => S({ color: 0x0f0f11, roughness: 0.3 }),
    metal: () => S({ color: 0xd0d2d6, roughness: 0.28, metalness: 1 }),
    gold: () => S({ color: 0xe2b860, roughness: 0.25, metalness: 1 }),
    tin: () => S({ color: 0xb9bcc0, roughness: 0.35, metalness: 1 }),
    white: () => S({ color: 0xf2f0ea, roughness: 0.55 }),
    cream: () => S({ color: 0xe9e4d6, roughness: 0.6 }),
    cap: () => S({ color: 0x8f6e4e, roughness: 0.5 }),
    resistor: () => S({ color: 0x141416, roughness: 0.45 }),
    yellow: () => S({ color: 0xf2c418, roughness: 0.45 }),
    ledRed: () => S({ color: 0xff2a1a, emissive: 0xff1a08, emissiveIntensity: 2.2, roughness: 0.25 }),
    ledBlue: () => S({ color: 0x3a8bff, emissive: 0x1f6dff, emissiveIntensity: 2.0, roughness: 0.25 }),
    ledGreen: () => S({ color: 0x3dff6a, emissive: 0x18ff4a, emissiveIntensity: 2.0, roughness: 0.25 }),
    wireRed: () => S({ color: 0xd8302a, roughness: 0.4 }),
    wireBlack: () => S({ color: 0x1b1b1d, roughness: 0.4 }),
  };
  M[name] = table[name]();
  return M[name];
}
export function canvasTex(w, h, draw, { srgb = true, aniso = 8 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const box = (w, h, d, m, x, y, z, r = 0) => mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m, x, y, z);
const FONT = 'Bahnschrift, "DIN Alternate", "Segoe UI", Arial, sans-serif';

/* faces: [+x, -x, +y(top), -y, +z, -z] */
function topTex(w, h, m, map) {
  const t = new THREE.MeshStandardMaterial({ map, roughness: m.roughness, metalness: m.metalness });
  return [m, m, t, m, m, m];
}

/* merge every mesh under a group that shares a material into one mesh: fewer draw calls */
export function bake(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.userData.keep) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    const list = byMat.get(o.material) || [];
    list.push(g);
    byMat.set(o.material, list);
  });
  const out = new THREE.Group();
  byMat.forEach((geos, m) => {
    const merged = mergeGeometries(geos, false);
    if (merged) out.add(mesh(merged, m));
  });
  group.traverse((o) => { if (o.isMesh && (Array.isArray(o.material) || o.userData.keep)) { const c = o.clone(); c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld); out.add(c); } });
  return out;
}

/* ------------------------------------------------------------------ breadboard (MB-102, 830 points)
   Local frame: x along the length (col 1 at the left), z across (row a at -z, far side), top face at y = H. */
export const BB = { L: 165.1, W: 54.6, H: 8.5, P: 2.54, cols: 63 };
BB.colX = (c) => -BB.L / 2 + 4.0 + (c - 1) * BB.P;
BB.rowZ = (r) => {                       // "a".."j"
  const i = "abcdefghij".indexOf(r);
  return i < 5 ? -3.81 - (4 - i) * BB.P : 3.81 + (i - 5) * BB.P;
};
BB.railZ = { tp: -BB.W / 2 + 4.2, tn: -BB.W / 2 + 4.2 + BB.P, bn: BB.W / 2 - 4.2 - BB.P, bp: BB.W / 2 - 4.2 };   // + / − rails
BB.railX = (k) => -BB.L / 2 + 8.4 + Math.floor(k / 5) * 6 * BB.P + (k % 5) * BB.P;   // 50 holes per rail row
BB.hole = (c, r) => new THREE.Vector3(BB.colX(c), BB.H, BB.rowZ(r));

export function breadboard() {
  const s = 14, { L, W, H, P } = BB;
  const tex = canvasTex(Math.round(L * s), Math.round(W * s), (g, w, h) => {
    g.fillStyle = "#f3f1eb"; g.fillRect(0, 0, w, h);
    const X = (x) => (x + L / 2) * s, Z = (z) => (z + W / 2) * s;
    const hole = (x, z) => {
      g.fillStyle = "#3a3a3d"; g.fillRect(X(x) - 0.6 * s, Z(z) - 0.6 * s, 1.2 * s, 1.2 * s);
      g.fillStyle = "#151517"; g.fillRect(X(x) - 0.42 * s, Z(z) - 0.42 * s, 0.84 * s, 0.84 * s);
    };
    for (let c = 1; c <= BB.cols; c++) for (const r of "abcdefghij") hole(BB.colX(c), BB.rowZ(r));
    for (const z of Object.values(BB.railZ)) for (let k = 0; k < 50; k++) hole(BB.railX(k), z);
    g.fillStyle = "#e3e0d8"; g.fillRect(0, Z(-1.4), w, 2.8 * s);                              // centre channel
    g.lineWidth = 0.32 * s;
    [[BB.railZ.tp - 1.75, "#d23a32"], [BB.railZ.tn + 1.75, "#2f63d6"], [BB.railZ.bn - 1.75, "#2f63d6"], [BB.railZ.bp + 1.75, "#d23a32"]]
      .forEach(([z, c]) => { g.strokeStyle = c; g.beginPath(); g.moveTo(X(-L / 2 + 7), Z(z)); g.lineTo(X(L / 2 - 7), Z(z)); g.stroke(); });
    g.fillStyle = "#8d8a83"; g.font = `600 ${1.05 * s}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
    for (let c = 1; c <= BB.cols; c += (c === 1 ? 4 : 5)) { g.fillText(String(c), X(BB.colX(c)), Z(BB.rowZ("a") - 1.9)); g.fillText(String(c), X(BB.colX(c)), Z(BB.rowZ("j") + 1.9)); }
    for (const r of "abcdefghij") { g.fillText(r, X(BB.colX(1) - 2.3), Z(BB.rowZ(r))); g.fillText(r, X(BB.colX(63) + 2.3), Z(BB.rowZ(r))); }
    g.font = `700 ${1.5 * s}px ${FONT}`;
    [["+", BB.railZ.tp, "#d23a32"], ["−", BB.railZ.tn, "#2f63d6"], ["−", BB.railZ.bn, "#2f63d6"], ["+", BB.railZ.bp, "#d23a32"]]
      .forEach(([t, z, c]) => { g.fillStyle = c; g.fillText(t, X(-L / 2 + 4), Z(z)); g.fillText(t, X(L / 2 - 4), Z(z)); });
  });
  const G = new THREE.Group();
  const body = mesh(new RoundedBoxGeometry(L, H, W, 2, 0.9), topTex(L, W, mat("white"), tex), 0, H / 2, 0);
  body.userData.keep = true;
  G.add(body);
  G.add(box(L - 2, 0.6, 2.4, mat("cream"), 0, H - 0.25, 0));          // channel groove floor reads as a slot
  return G;
}

/* ------------------------------------------------------------------ ESP32-WROOM-32 DevKit V1, 30-pin, 0.9 in rows
   Local frame: antenna toward +x, USB at -x. Far edge (-z) pins, right to left: EN VP VN D34 D35 D32 D33 D25 D26 D27
   D14 D12 D13 GND VIN. Near edge (+z): D23 D22 TX0 RX0 D21 D19 D18 D5 TX2 RX2 D4 D2 D15 GND 3V3.
   Pin index 0 = the pin nearest the USB end. PCB bottom at y = 0. */
export const ESP = {
  L: 48.3, W: 26.0, rowZ: 11.43, pin0X: -48.3 / 2 + 6.2,
  far: ["VIN", "GND", "D13", "D12", "D14", "D27", "D26", "D25", "D33", "D32", "D35", "D34", "VN", "VP", "EN"],
  near: ["3V3", "GND", "D15", "D2", "D4", "RX2", "TX2", "D5", "D18", "D19", "D21", "RX0", "TX0", "D22", "D23"],
};
export function espPin(name, side) {        // -> {side: "far"|"near", i}
  const sides = side ? [side] : ["near", "far"];
  for (const s of sides) { const i = ESP[s].indexOf(name); if (i >= 0) return { side: s, i }; }
  return null;
}
export function esp32() {
  const G = new THREE.Group(), { L, W } = ESP, s = 22;
  const silk = canvasTex(Math.round(L * s), Math.round(W * s), (g, w, h) => {
    g.fillStyle = "#121315"; g.fillRect(0, 0, w, h);
    const X = (x) => (x + L / 2) * s, Z = (z) => (z + W / 2) * s;
    g.fillStyle = "#ecebe6"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [side, zs] of [["far", -1], ["near", 1]]) {
      ESP[side].forEach((n, i) => {
        const x = ESP.pin0X + i * 2.54;
        g.beginPath(); g.arc(X(x), Z(zs * ESP.rowZ), 0.95 * s, 0, 7); g.fill();
        g.save(); g.translate(X(x), Z(zs * (ESP.rowZ - 2.9))); g.rotate(-Math.PI / 2);
        g.font = `600 ${0.95 * s}px ${FONT}`; g.fillText(n, 0, 0); g.restore();
      });
    }
    g.fillStyle = "#ecebe6"; g.font = `700 ${1.15 * s}px ${FONT}`;
    g.fillText("ESP32 DEVKIT V1", X(-9.5), Z(-5.3));
    g.font = `600 ${0.9 * s}px ${FONT}`; g.fillText("EN", X(-L / 2 + 3.2), Z(-9.6)); g.fillText("BOOT", X(-L / 2 + 3.4), Z(9.6));
  });
  const pcb = mesh(new THREE.BoxGeometry(L, 1.6, W), topTex(L, W, mat("pcb"), silk), 0, 0.8, 0);
  pcb.userData.keep = true;
  G.add(pcb);
  // WROOM-32: carrier, antenna with meander, shield can
  const mx = L / 2 - 25.5 / 2 + 0.8;
  G.add(box(25.5, 0.8, 18, mat("pcb"), mx, 2.0, 0));
  const ant = canvasTex(160, 420, (g, w, h) => {
    g.fillStyle = "#16171b"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a160"; g.lineWidth = 10; g.beginPath();
    let y = 40; g.moveTo(30, y);
    for (let k = 0; k < 8; k++) { g.lineTo(130, y); y += 21; g.lineTo(130, y); g.lineTo(30, y); y += 21; g.lineTo(30, y); }
    g.stroke();
  });
  const a = mesh(new THREE.PlaneGeometry(6.2, 17.4), new THREE.MeshStandardMaterial({ map: ant, roughness: 0.4 }), L / 2 + 0.8 - 3.3, 2.42, 0);
  a.rotation.x = -Math.PI / 2; a.userData.keep = true; G.add(a);
  const canTex = canvasTex(712, 632, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#c6c8cc"); gr.addColorStop(1, "#a9acb1");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(55,57,62,0.85)"; g.font = `700 50px ${FONT}`; g.textAlign = "left";
    g.fillText("ESP32-WROOM-32", 54, 140);
    g.font = `600 36px ${FONT}`; g.fillText("Wi-Fi + Bluetooth", 54, 210); g.fillText("240 MHz · 4 MB", 54, 268);
  });
  const can = mesh(new RoundedBoxGeometry(17.8, 2.6, 15.8, 2, 0.4),
    [mat("metal"), mat("metal"), new THREE.MeshStandardMaterial({ map: canTex, metalness: 0.85, roughness: 0.34 }), mat("metal"), mat("metal"), mat("metal")],
    mx - 3.2, 2.4 + 1.3, 0);
  can.userData.keep = true; G.add(can);
  // pin stubs + solder on top, plastic headers and pins below
  const stub = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 8), joint = new THREE.CylinderGeometry(0.85, 1.0, 0.55, 12);
  const pinG = new THREE.BoxGeometry(0.64, 9.0, 0.64);
  for (const zs of [-1, 1]) {
    G.add(box(15 * 2.54, 2.5, 2.5, mat("black"), ESP.pin0X + 7 * 2.54, -1.25, zs * ESP.rowZ));
    for (let i = 0; i < 15; i++) {
      const x = ESP.pin0X + i * 2.54, z = zs * ESP.rowZ;
      G.add(mesh(stub, mat("tin"), x, 2.1, z));
      G.add(mesh(joint, mat("tin"), x, 1.85, z));
      G.add(mesh(pinG, mat("gold"), x, -4.5 + 0.5, z));
    }
  }
  // USB, buttons, CP2102, AMS1117, LEDs, passives
  G.add(box(5.8, 2.8, 7.6, mat("metal"), -L / 2 + 2.6, 3.0, 0, 0.5));
  for (const zs of [-1, 1]) {
    G.add(box(3.6, 1.2, 6.0, mat("metal"), -L / 2 + 4.0, 2.2, zs * 7.8));
    G.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.2, 16), mat("black"), -L / 2 + 4.0, 3.3, zs * 7.8));
  }
  const chip = (w, d, h, x, z, m = mat("resistor")) => G.add(box(w, h, d, m, x, 1.6 + h / 2, z));
  chip(5, 5, 0.9, -9.5, 1.5);                         // CP2102
  chip(6.5, 3.5, 1.6, -12.5, -6.2);                   // AMS1117
  chip(3.0, 2.2, 1.6, -12.5, -3.6, mat("tin"));       // its tab
  [[-16.5, 4.8], [-16.5, -4.2], [-5.5, 6.4], [-2.5, -6.4], [-5, -3.5], [0.5, 6.4], [0.5, -6.4]].forEach(([x, z]) => chip(1.6, 0.8, 0.8, x, z, mat("cap")));
  chip(1.6, 0.8, 0.6, -18.8, -1.8, mat("ledRed"));
  chip(1.6, 0.8, 0.6, -18.8, 1.8, mat("ledBlue"));
  return G;
}
/* where an ESP pin's breadboard column + its free row hole are, for an ESP placed at column `c0` (pin index 0) */
export function espHole(c0, name) {
  const p = espPin(name);
  if (!p) return null;
  return { col: c0 + p.i, row: p.side === "far" ? "a" : "j", espRow: p.side === "far" ? "b" : "i", side: p.side };
}

/* ------------------------------------------------------------------ MB102 breadboard power module (9 V in, 5 V rails)
   Local frame: spans the breadboard width (z), jacks face -x, sits on the rails; bottom at y = 0. */
export function powerModule() {
  const G = new THREE.Group(), L = 34, W = 53, s = 20;
  const silk = canvasTex(L * s, W * s, (g, w, h) => {
    g.fillStyle = "#121315"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#ecebe6"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${1.5 * s}px ${FONT}`;
    g.save(); g.translate(w * 0.62, h / 2); g.rotate(-Math.PI / 2); g.fillText("POWER 9V → 5V", 0, 0); g.restore();
    g.font = `600 ${1.0 * s}px ${FONT}`;
    g.fillText("5V  3V3", w * 0.72, 5.5 * s); g.fillText("5V  3V3", w * 0.72, h - 5.5 * s);
    g.fillText("ON", 9 * s, 31 * s);
  });
  const pcb = mesh(new THREE.BoxGeometry(L, 1.6, W), topTex(L, W, mat("pcb"), silk), 0, 0.8 + 9.5, 0);
  pcb.userData.keep = true;
  G.add(pcb);
  const top = 11.1;
  G.add(box(14, 11, 9, mat("blackGloss"), -L / 2 + 6, top + 5.5, -13));                    // DC barrel jack
  G.add(mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.6, 20).rotateZ(Math.PI / 2), mat("black"), -L / 2 - 1.0, top + 6.0, -13));
  G.add(box(14, 6.0, 13, mat("metal"), -L / 2 + 6.5, top + 3.0, 10));                       // USB-A
  G.add(box(6, 6, 6, mat("white"), -L / 2 + 14, top + 3, -1.5));                            // push switch
  G.add(mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16), mat("blackGloss"), -L / 2 + 14, top + 7, -1.5));
  for (const z of [-17.5, 17.5]) {
    G.add(mesh(new THREE.CylinderGeometry(3.15, 3.15, 7, 20), mat("blackGloss"), 3.5, top + 3.5, z * 0.55));   // caps
    G.add(box(6.5, 1.6, 3.5, mat("resistor"), 9, top + 0.8, z * 0.8));                        // AMS1117 x2
    G.add(box(7.5, 2.5, 2.5, mat("black"), 13, top + 1.25, z * 1.18));                       // 3-pin selector
    G.add(box(5.1, 2.6, 2.6, mat("yellow"), 13 - 1.27, top + 2.5 + 1.2, z * 1.18));          // jumper on 5V
  }
  G.add(box(1.6, 0.6, 0.8, mat("ledGreen"), -4, top + 0.3, 7));
  // legs: 2 x 2 pins per rail side + plastic spacers
  for (const zs of [-1, 1]) for (const dz of [0, BB.P]) {
    G.add(box(5.08, 2.5, 2.5, mat("black"), 0, 8.5 - 1.25 + 1.25, zs * (BB.W / 2 - 4.2) - zs * dz));
  }
  return G;
}

/* ------------------------------------------------------------------ 9 V battery (6LR61) + snap clip
   Local frame: standing, base at y = 0, terminals up; + (round stud) at x = -6.35, - (hex socket) at x = +6.35.
   W 26.5 (x), H 48.5 (y), D 17.5 (z). */
export const NINE_V = { W: 26.5, H: 48.5, D: 17.5, pitch: 12.7 };
export function battery9v() {
  const G = new THREE.Group(), { W, H, D } = NINE_V;
  const wrap = canvasTex(1024, 1600, (g, w, h) => {
    g.fillStyle = "#111113"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#f26a1b"; g.fillRect(0, h * 0.70, w, h * 0.07);
    g.fillStyle = "#f2f0ea"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 330px ${FONT}`; g.fillText("9V", w / 2, h * 0.38);
    g.font = `600 78px ${FONT}`; g.fillText("ALKALINE", w / 2, h * 0.56);
    g.font = `600 52px ${FONT}`; g.fillStyle = "rgba(242,240,234,0.65)"; g.fillText("6LR61 · 1604A", w / 2, h * 0.86);
  });
  const side = new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.42 });
  const plain = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.42 });
  const bodyH = H - 3.2;
  const body = mesh(new RoundedBoxGeometry(W, bodyH, D, 4, 2.2), [plain, plain, plain, plain, side, side], 0, 0.6 + bodyH / 2, 0);
  body.userData.keep = true; G.add(body);
  G.add(mesh(new RoundedBoxGeometry(W - 0.3, 0.8, D - 0.3, 3, 2.0), mat("tin"), 0, 0.4, 0));                     // bottom cap
  G.add(mesh(new RoundedBoxGeometry(W - 0.3, 2.4, D - 0.3, 3, 2.0), mat("tin"), 0, H - 1.6, 0));                 // top cap
  // + : round stud with a crown;  - : hexagonal socket
  const top = H - 0.4;
  G.add(mesh(new THREE.CylinderGeometry(2.9, 3.1, 2.6, 24), mat("tin"), -6.35, top + 1.3, 0));
  G.add(mesh(new THREE.SphereGeometry(2.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), mat("tin"), -6.35, top + 2.6, 0));
  G.add(mesh(new THREE.CylinderGeometry(4.3, 4.3, 2.6, 6), mat("tin"), 6.35, top + 1.3, 0));
  G.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 20), mat("blackGloss"), 6.35, top + 2.62, 0));
  G.userData.top = H + 2.6;
  return G;
}
/* snap clip on the terminals (local battery frame), its two leads leaving the back of the cap: red from +, black from -.
   Returns {group, exits: [redStart, blackStart] in the battery's local frame, dir (local +y)} */
export function snapClip() {
  const G = new THREE.Group(), { W, H, D } = NINE_V;
  const capH = 7.5, y0 = H + 0.2;
  G.add(mesh(new RoundedBoxGeometry(W + 1.4, capH, D + 1.4, 3, 2.2), mat("blackGloss"), 0, y0 + capH / 2, 0));
  G.add(mesh(new RoundedBoxGeometry(10, 3, 6, 2, 1.2), mat("blackGloss"), 0, y0 + capH + 1.2, 0));               // strain relief
  return { group: G, exits: [new THREE.Vector3(-1.1, y0 + capH + 2.6, 0), new THREE.Vector3(1.1, y0 + capH + 2.6, 0)] };
}
/* a twin lead from two points (red = +, black = -) to a barrel plug whose mouth sits at `jack`, pushed in along `dir` */
export function barrelLead(starts, startDir, jack, dir) {
  const G = new THREE.Group();
  dir = dir.clone().normalize();
  const plug = mesh(new THREE.CylinderGeometry(4.6, 4.2, 15, 24), mat("blackGloss"));
  plug.position.copy(jack.clone().sub(dir.clone().multiplyScalar(12.5)));
  plug.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  G.add(plug);
  const boot = mesh(new THREE.CylinderGeometry(2.4, 3.6, 6, 16), mat("blackGloss"));
  boot.position.copy(jack.clone().sub(dir.clone().multiplyScalar(23)));
  boot.quaternion.copy(plug.quaternion);
  G.add(boot);
  const sleeve = mesh(new THREE.CylinderGeometry(2.75, 2.75, 5, 20), mat("metal"));
  sleeve.position.copy(jack.clone().sub(dir.clone().multiplyScalar(2.5)));
  sleeve.quaternion.copy(plug.quaternion);
  G.add(sleeve);
  const end = jack.clone().sub(dir.clone().multiplyScalar(26));
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  starts.forEach((st, i) => {
    const off = side.clone().multiplyScalar(i ? 0.8 : -0.8);
    const e = end.clone().add(off);
    const len = st.distanceTo(e);
    const c = new THREE.CubicBezierCurve3(st, st.clone().add(startDir.clone().multiplyScalar(len * 0.35)),
      e.clone().sub(dir.clone().multiplyScalar(len * 0.35)), e);
    G.add(mesh(new THREE.TubeGeometry(c, 48, 0.8, 10), i ? mat("wireBlack") : mat("wireRed")));
  });
  return G;
}
/* a 9 V lying on its back with the clip on, leads running straight to `jack` (world), plug pushed in along `dir`.
   The battery's terminal end faces the jack. */
export function batteryPlugged(jack, dir, gap = 30) {
  const G = new THREE.Group();
  const bat = battery9v();
  const clip = snapClip();
  bat.add(clip.group);
  dir = dir.clone().normalize();
  // local y (terminals) -> along dir (toward the jack), local z (depth) -> up, local x -> completes a right-handed frame
  const ax = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();   // x = y × z keeps it right-handed
  bat.setRotationFromMatrix(new THREE.Matrix4().makeBasis(ax, dir, new THREE.Vector3(0, 1, 0)));
  const plugBack = jack.clone().sub(dir.clone().multiplyScalar(26));
  const clipBack = NINE_V.H + 0.2 + 7.5 + 2.6;
  const base = plugBack.clone().sub(dir.clone().multiplyScalar(gap + clipBack));
  bat.position.set(base.x, NINE_V.D / 2, base.z);
  G.add(bat);
  bat.updateMatrixWorld(true);
  const starts = clip.exits.map((p) => bat.localToWorld(p.clone()));
  // leads leave the clip along dir at clip height, then rise to the plug
  G.add(barrelLead(starts, dir, jack, dir));
  return G;
}

/* ------------------------------------------------------------------ Dupont jumpers
   A wire from `a` to `b` (world points where the housings meet: top of a female housing on a header pin, or the top of a
   male housing standing in a breadboard hole). Housings are added at both ends; kind "F"/"M" per end. */
export const WIRE_HEX = { GND: 0x1d1d1f, VCC: 0xd8302a, "5V": 0xd8302a, "3V3": 0xd8302a };
export const SIGNAL_HEX = [0xf2c418, 0x2f7bf0, 0x2fb54a, 0xf07a1c, 0x9b5de5, 0xf2f2f2];
const HOUSING = 14.0, HW = 2.5;
export function housing(kind) {
  const G = new THREE.Group();
  G.add(box(HW, HOUSING, HW, mat("black"), 0, HOUSING / 2, 0, 0.25));
  if (kind === "M") G.add(box(0.64, 6.2, 0.64, mat("gold"), 0, -3.1, 0));
  else G.add(box(1.1, 0.2, 1.1, mat("blackGloss"), 0, -0.05, 0));
  G.add(mesh(new THREE.CylinderGeometry(1.0, 1.1, 2.4, 10), mat("black"), 0, HOUSING + 1.0, 0));   // crimp boot
  return G;
}
export function jumper(a, b, color, { kindA = "F", kindB = "M", lift = 0, sag = 0 } = {}) {
  const G = new THREE.Group();
  const ha = housing(kindA); ha.position.copy(a); G.add(ha);
  const hb = housing(kindB); hb.position.copy(b); G.add(hb);
  const p0 = a.clone().add(new THREE.Vector3(0, HOUSING + 2.2, 0)), p3 = b.clone().add(new THREE.Vector3(0, HOUSING + 2.2, 0));
  const dist = p0.distanceTo(p3);
  const up = 10 + dist * 0.32 + lift;
  const curve = new THREE.CubicBezierCurve3(p0, p0.clone().add(new THREE.Vector3(0, up, 0)), p3.clone().add(new THREE.Vector3(0, up - sag, 0)), p3);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.38, side: THREE.DoubleSide });
  const tube = mesh(new THREE.TubeGeometry(curve, 72, 0.68, 10), m);
  G.add(tube);
  G.userData = { curve, tube, material: m };
  return G;
}

/* a folded ribbon of n jumpers (how they ship): lies flat in the box, fold at +x, housings stacked at -x */
export function ribbon(n, len, kindA, kindB) {
  const G = new THREE.Group();
  const COL = [0x6b3b1d, 0xd8302a, 0xf07a1c, 0xf2c418, 0x2fb54a, 0x2f7bf0, 0x9b5de5, 0x8d8f94, 0xf2f2f2, 0x1d1d1f];
  const pitch = 1.42, r = 0.68, half = len / 2, R = 2.2;
  for (let i = 0; i < n; i++) {
    const z = -((n - 1) * pitch) / 2 + i * pitch;
    const pts = [];
    for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(-half * 0.42 + (k / 10) * half * 0.84, r, z));
    for (let k = 1; k < 12; k++) { const a = Math.PI * k / 12; pts.push(new THREE.Vector3(half * 0.42 + Math.sin(a) * R, r + R - Math.cos(a) * R, z)); }
    for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(half * 0.42 - (k / 10) * half * 0.84, r + 2 * R, z));
    const c = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.MeshStandardMaterial({ color: COL[i % 10], roughness: 0.4, side: THREE.DoubleSide });
    G.add(mesh(new THREE.TubeGeometry(c, 60, r, 8), m));
    // housing turned so its crimp boot swallows the wire end and the pin points outward
    const tubeEnd = -half * 0.42;
    for (const [y, kind] of [[r, kindA], [r + 2 * R, kindB]]) {
      const h = housing(kind);
      h.rotation.z = -Math.PI / 2;                       // local +y (pin -> boot) runs along +x, toward the wire
      h.position.set(tubeEnd - (HOUSING + 1.6), y, z);
      G.add(h);
    }
  }
  return G;
}

export const BENCH_JACK = new THREE.Vector3(-BB.L / 2 + 12 - 17 - 1.0, 11.1 + 6.0, -13);   // power-module jack mouth (bench frame)

/* ------------------------------------------------------------------ the bench: breadboard + ESP32 + power module + 9 V
   ESP pin 0 sits at breadboard column `espCol`. Returns {group, hole(name) -> world point of the free-row hole}. */
export function bench({ espCol = 22, battery = true } = {}) {
  const G = new THREE.Group();
  G.add(breadboard());
  const e = esp32();
  e.position.set(BB.colX(espCol) - ESP.pin0X, BB.H + 2.5, 0);       // header plastic sits on the breadboard
  G.add(e);
  const pm = powerModule();
  pm.position.set(-BB.L / 2 + 12, 0, 0);
  G.add(pm);
  // ESP power: VIN (far edge) -> far + rail, far GND -> far - rail
  const vin = espHole(espCol, "VIN"), gnd = { col: espCol + 1, row: "a" };
  const railHole = (zk, near) => { let best = 0; for (let k = 0; k < 50; k++) if (Math.abs(BB.railX(k) - BB.colX(near)) < Math.abs(BB.railX(best) - BB.colX(near))) best = k; return new THREE.Vector3(BB.railX(best), BB.H, BB.railZ[zk]); };
  const at = (c, r) => BB.hole(c, r);
  G.add(shortJumper(at(vin.col, "a"), railHole("tp", vin.col - 1), 0xd8302a));
  G.add(shortJumper(at(gnd.col, "a"), railHole("tn", gnd.col + 1), 0x1d1d1f));
  if (battery) G.add(batteryPlugged(BENCH_JACK.clone(), new THREE.Vector3(1, 0, 0), 22));
  return {
    group: G,
    hole: (name) => { const h = espHole(espCol, name); return h ? { ...h, p: at(h.col, h.row) } : null; },
    rail: (zk, nearCol) => railHole(zk, nearCol),       // "tp"/"tn" far + / -, "bp"/"bn" near + / -
  };
}
/* a low, flat hop between two breadboard holes (power links): male both ends, wire close to the board */
export function shortJumper(a, b, color) {
  const G = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const h = 2.2;
  const curve = new THREE.CatmullRomCurve3([a.clone().add(new THREE.Vector3(0, -1, 0)), a.clone().add(new THREE.Vector3(0, h, 0)),
    a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, h + 1.2, 0)), b.clone().add(new THREE.Vector3(0, h, 0)), b.clone().add(new THREE.Vector3(0, -1, 0))]);
  m.side = THREE.DoubleSide;
  G.add(mesh(new THREE.TubeGeometry(curve, 40, 0.55, 8), m));
  return G;
}

/* ------------------------------------------------------------------ module boards (KiCad GLB, merged per material) */
export async function loadBoard(url) {
  const { GLTFLoader } = await import("../vendor/three/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    let layer = 0;
    if (m.transparent && m.opacity > 0.5) {               // KiCad's 95% mask -> opaque matte black
      m.transparent = false; m.opacity = 1; m.depthWrite = true; m.color.setHex(0x0d0d0f); m.roughness = 0.5; m.metalness = 0;
      layer = 1;
    }
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (bb.max.y - bb.min.y < 0.00012) {                  // a flat layer (metres): silk, copper, mask
      if (!layer) layer = m.color.r > 0.85 && m.color.g > 0.85 ? 3 : 2;
      m.polygonOffset = true; m.polygonOffsetFactor = -layer; m.polygonOffsetUnits = -layer * 2;
    }
  });
  root.scale.setScalar(1000);                             // KiCad GLB is in metres
  const merged = bake(root);                              // ~1000 meshes -> ~20
  return merged;                                          // frame: KiCad absolute mm (x, z), PCB bottom at y = 0
}
