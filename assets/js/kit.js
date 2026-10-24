/* Sensor Kit module page: the 3D bench (breadboard + ESP32 + 9 V power module) with this module wired to it, a pin
   list that highlights its wire, and 3D (the board alone, orbit all the way round) / QR views.
   Nothing is drawn until the board has loaded and the camera is framed, so there is no first-frame flash.
   Data comes from <script type="application/json" id="mod-data"> (written by sensor-kit/tools/web_kit.py). */
import { THREE, createViewer, ease, bench, jumper, loadBoard, BB, COARSE } from "./kit3d.js?v=89";

const data = JSON.parse(document.getElementById("mod-data").textContent);
const host = document.querySelector("[data-mod-stage]");
const tabs = document.querySelectorAll("[data-mod-tab]");
const rows = [...document.querySelectorAll("[data-wire]")];
const status = host.querySelector(".mod-stage__status");

let v = null, wires = [], moduleGroup = null, benchGroup = null, homes = {}, view = "wire";

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
const dimMat = new THREE.MeshStandardMaterial({ color: 0x18181a, transparent: true, opacity: 0.25 });
function focus(i) {
  wires.forEach((w, k) => {
    const on = i === null || k === i;
    w.material.opacity = on ? 1 : 0.18;
    w.group.traverse((o) => { if (o.isMesh && o.material !== w.material) o.material = on ? o.userData.mat0 : dimMat; });
  });
  rows.forEach((r, k) => r.classList.toggle("is-on", i !== null && k === i));
  if (v) v.request();
}
rows.forEach((r, k) => {
  r.addEventListener("mouseenter", () => focus(k));
  r.addEventListener("mouseleave", () => focus(null));
  r.addEventListener("focus", () => focus(k));
  r.addEventListener("blur", () => focus(null));
});

/* ---------------------------------------------------------------- build the scene */
async function start() {
  v = createViewer(host, { fov: 28, maxPolar: 180, shadowSize: 200, minDistance: 40 });
  const b = bench({ espCol: 22 });
  benchGroup = b.group;
  // a soft contact shadow on the bench so nothing floats (shadow-only plane, invisible from below)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.ShadowMaterial({ opacity: 0.38 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  benchGroup.add(ground);
  v.scene.add(benchGroup);

  const board = await loadBoard(data.glb);
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
  const toWorld = (p) => new THREE.Vector3(p.x - cx, 0, p.y - cy).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).add(benchPos);

  // jumpers: female housing on the module's header pin, male end in the ESP pin's free breadboard row
  let ao = 0;
  data.pins.forEach((p, i) => {
    const a = toWorld(p).add(new THREE.Vector3(0, 1.6 + 2.5, 0));
    let bpt;
    if (p.esp === "VIN") bpt = b.rail("tp", b.hole("VIN").col + 4);      // 5 V modules: the + rail (power module)
    else if (p.esp) bpt = b.hole(p.esp).p.clone();
    else { bpt = a.clone().add(new THREE.Vector3((ao - 1.5) * 9, -4.1, 38)); ao++; }   // S38 A0-A3: loose ends
    const g = jumper(a, bpt, p.color, { kindA: "F", kindB: "M", lift: (i % 3) * 3 });
    g.traverse((o) => { if (o.isMesh) o.userData.mat0 = o.material; });
    g.userData.material.transparent = true;
    v.scene.add(g);
    wires.push({ group: g, material: g.userData.material });
  });

  // camera homes: the wiring (module, wires, ESP32) and the board alone
  const wireBox = new THREE.Box3().setFromObject(moduleGroup);
  used.forEach((h) => wireBox.expandByPoint(h.p));
  wireBox.expandByPoint(new THREE.Vector3(b.hole("VIN").p.x - 30, 30, -BB.W / 2));
  wireBox.expandByPoint(new THREE.Vector3(b.hole("D23").p.x + 20, 0, -BB.W / 2));
  // a narrow (phone) canvas: the power module and the whole ESP32 in frame, fitted by the box corners, not the sphere
  const narrow = v.camera.aspect < 1.3;
  if (narrow) {
    wireBox.expandByPoint(new THREE.Vector3(b.hole("VIN").p.x - 70, 25, -BB.W / 2 - 10));
    wireBox.expandByPoint(new THREE.Vector3(b.hole("D23").p.x + 30, 0, -BB.W / 2));
  }
  homes.wire = v.frameObject(wireBox, new THREE.Vector3(0.28, 1.0, 0.95), narrow ? 0.5 : COARSE ? 0.95 : 0.82);
  moduleGroup.position.set(0, 0, 0); moduleGroup.rotation.y = 0; moduleGroup.updateMatrixWorld(true);
  homes.board = v.frameObject(new THREE.Box3().setFromObject(moduleGroup), new THREE.Vector3(0.5, 1.1, 0.9), 1.15);
  moduleGroup.position.copy(benchPos); moduleGroup.rotation.y = Math.PI;

  v.renderer.domElement.addEventListener("dblclick", () => { if (homes[view]) v.goHome(homes[view]); });
  show(view);
  // the jumpers come down into place together (no drawing)
  const drop = 26;
  wires.forEach((w) => { w.group.position.y = drop; });
  v.setReady();
  if (status) status.hidden = true;
  host.classList.add("is-live");
  v.animate(480, (u) => { const k = ease(u); wires.forEach((w) => { w.group.position.y = drop * (1 - k); }); });
}

const io = new IntersectionObserver((es) => {
  if (es[0].isIntersecting) {
    io.disconnect();
    start().catch((e) => { console.error(e); if (status) status.textContent = "3D view failed to load."; });
  }
}, { rootMargin: "200px" });
io.observe(host);

/* ESP32 / Uno / Pi columns in the pin list */
document.querySelectorAll("[data-mcu]").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll("[data-mcu]").forEach((x) => x.setAttribute("aria-pressed", x === btn ? "true" : "false"));
  rows.forEach((r) => { r.querySelector("[data-to]").textContent = r.dataset[btn.dataset.mcu]; });
}));

const h = location.hash.slice(1);
if (["wire", "board", "qr"].includes(h)) { view = h; if (h === "qr") show("qr"); }
