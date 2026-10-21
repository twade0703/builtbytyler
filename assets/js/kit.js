/* Sensor Kit module page: the 3D bench (breadboard + ESP32 + 9 V power module) with this module wired to it,
   real Dupont jumpers drawn in one at a time, a pin list that highlights its wire, and Board / QR views.
   Data comes from <script type="application/json" id="mod-data"> (written by sensor-kit/tools/web_kit.py). */
import { THREE, createViewer, ease, bench, jumper, loadBoard, BB, COARSE } from "./kit3d.js?v=73";

const data = JSON.parse(document.getElementById("mod-data").textContent);
const host = document.querySelector("[data-mod-stage]");
const tabs = document.querySelectorAll("[data-mod-tab]");
const rows = [...document.querySelectorAll("[data-wire]")];
const status = host.querySelector(".mod-stage__status");

let v = null, wires = [], moduleGroup = null, benchGroup = null, homes = {}, view = "wire", playing = 0;

/* ---------------------------------------------------------------- tabs */
function show(name) {
  view = name;
  tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.modTab === name ? "true" : "false"));
  document.querySelectorAll("[data-mod-pane]").forEach((p) => { p.hidden = p.dataset.modPane !== name; });
  host.hidden = name === "qr";
  if (name === "qr" || !v) return;
  const wire = name === "wire";
  benchGroup.visible = wire;
  wires.forEach((w) => { w.group.visible = wire; });
  moduleGroup.position.copy(wire ? moduleGroup.userData.benchPos : new THREE.Vector3(0, 0, 0));
  moduleGroup.rotation.y = wire ? Math.PI : 0;
  v.goHome(homes[name]);
  v.updateShadows();
}
tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.modTab)));

/* ---------------------------------------------------------------- pin list <-> wire highlight */
function focus(i) {
  wires.forEach((w, k) => {
    const on = i === null || k === i;
    w.material.opacity = on ? 1 : 0.18;
    w.group.traverse((o) => { if (o.isMesh && o.material !== w.material) { o.material = on ? o.userData.mat0 || o.material : dimMat; } });
  });
  rows.forEach((r, k) => r.classList.toggle("is-on", i !== null && k === i));
  v && v.request();
}
const dimMat = new THREE.MeshStandardMaterial({ color: 0x18181a, transparent: true, opacity: 0.25 });
rows.forEach((r, k) => {
  r.addEventListener("mouseenter", () => { if (!playing) focus(k); });
  r.addEventListener("mouseleave", () => { if (!playing) focus(null); });
  r.addEventListener("focus", () => { if (!playing) focus(k); });
  r.addEventListener("blur", () => { if (!playing) focus(null); });
});

/* ---------------------------------------------------------------- the wiring animation */
function setGrow(w, u) {
  const n = w.tube.geometry.index.count;
  w.tube.geometry.setDrawRange(0, Math.max(0, Math.floor((n / 6) * u) * 6));
  w.end.visible = u > 0.98;
}
function play() {
  if (!v) return;
  if (view !== "wire") show("wire");
  playing++;
  const run = playing;
  wires.forEach((w) => setGrow(w, 0));
  let k = 0;
  const next = () => {
    if (run !== playing) return;
    if (k >= wires.length) { focus(null); playing = 0; return; }
    const w = wires[k], idx = k;
    focus(idx);
    v.animate(520, (u) => setGrow(w, ease(u)), () => { k = idx + 1; setTimeout(next, 160); });
  };
  setTimeout(next, 250);
}
document.querySelector("[data-mod-replay]")?.addEventListener("click", play);

/* ---------------------------------------------------------------- build the scene */
async function start() {
  v = createViewer(host, { fov: 28, maxPolar: 84, shadowSize: 200, minDistance: 40 });
  const b = bench({ espCol: 22 });
  benchGroup = b.group;
  v.scene.add(benchGroup);

  const board = await loadBoard(data.glb);
  // centre the board (KiCad absolute mm) on its own origin, PCB bottom on the table + header tails clearance
  const cx = data.origin[0] + data.w / 2, cy = data.origin[1] + data.h / 2;
  board.position.set(-cx, 0, -cy);
  moduleGroup = new THREE.Group();
  moduleGroup.add(board);
  v.scene.add(moduleGroup);

  // module in front of the breadboard, header edge facing it (rotated 180 deg about y)
  const used = data.pins.map((p) => p.esp && b.hole(p.esp)).filter(Boolean);
  const midX = used.length ? used.reduce((s, h) => s + h.p.x, 0) / used.length : 0;
  const benchPos = new THREE.Vector3(midX, 1.5, BB.W / 2 + 26 + data.h / 2);
  moduleGroup.userData.benchPos = benchPos;
  moduleGroup.position.copy(benchPos);
  moduleGroup.rotation.y = Math.PI;
  moduleGroup.updateMatrixWorld(true);
  const toWorld = (p) => new THREE.Vector3(p.x - cx, 0, p.y - cy).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).add(benchPos);

  // jumpers: female housing on the module's header pin, male end in the ESP pin's free breadboard row
  let ao = 0;
  data.pins.forEach((p, i) => {
    const a = toWorld(p).add(new THREE.Vector3(0, 1.6 + 2.5, 0));
    let bpt, kindB = "M";
    if (p.esp === "VIN") {                     // 5 V modules: the + rail (fed by the power module, tied to VIN)
      bpt = b.rail("tp", b.hole("VIN").col + 4);
    } else if (p.esp) {
      bpt = b.hole(p.esp).p.clone();
    } else {                                   // S38 A0-A3: loose ends, "to a sensor's AO"
      bpt = a.clone().add(new THREE.Vector3((ao - 1.5) * 9, -4.1, 38));
      ao++;
    }
    const w = jumper(a, bpt, p.color, { kindA: "F", kindB, lift: (i % 3) * 3 });
    const g = w;
    g.traverse((o) => { if (o.isMesh) o.userData.mat0 = o.material; });
    const tube = g.userData.tube, material = g.userData.material;
    material.transparent = true;
    const end = g.children[1];
    v.scene.add(g);
    wires.push({ group: g, tube, material, end });
  });

  // camera homes
  // frame the module, its wires and the ESP32 (the battery may sit at the edge of the frame)
  const wireBox = new THREE.Box3().setFromObject(moduleGroup);
  used.forEach((h) => wireBox.expandByPoint(h.p));
  wireBox.expandByPoint(new THREE.Vector3(b.hole("VIN").p.x - 30, 30, -BB.W / 2));
  wireBox.expandByPoint(new THREE.Vector3(b.hole("D23").p.x + 20, 0, -BB.W / 2));
  homes.wire = v.frameObject(wireBox, new THREE.Vector3(0.28, 1.0, 0.95), COARSE ? 0.95 : 0.82);
  moduleGroup.position.set(0, 0, 0); moduleGroup.rotation.y = 0; moduleGroup.updateMatrixWorld(true);
  homes.board = v.frameObject(new THREE.Box3().setFromObject(moduleGroup), new THREE.Vector3(0.5, 1.1, 0.9), 1.15);
  moduleGroup.position.copy(benchPos); moduleGroup.rotation.y = Math.PI;

  v.renderer.domElement.addEventListener("dblclick", () => {
    if (homes[view]) v.goHome(homes[view]);
  });
  if (status) status.hidden = true;
  host.classList.add("is-live");
  show(view);
  play();
}

/* start when the stage is near the viewport; QR view needs no 3D */
const io = new IntersectionObserver((es) => {
  if (es[0].isIntersecting) { io.disconnect(); start().catch((e) => { console.error(e); if (status) status.textContent = "3D view failed to load."; }); }
}, { rootMargin: "200px" });
io.observe(host);

/* ESP32 / Uno / Pi columns in the pin list */
document.querySelectorAll("[data-mcu]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-mcu]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  rows.forEach((r) => { r.querySelector("[data-to]").textContent = r.dataset[b.dataset.mcu]; });
}));

const h = location.hash.slice(1);
if (["wire", "board", "qr"].includes(h)) show(h);
