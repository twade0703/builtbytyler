/* Sensor Kit module pages: the three views (wire it / 3D / QR) and the 3D board viewer.
   The viewer loads only when its tab is opened. Controls follow SolidWorks: drag with the left
   or middle button to rotate, right-drag to pan, wheel to zoom, double-click to reset. */
import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";

const tabs = document.querySelectorAll("[data-kit-tab]");
const panes = document.querySelectorAll("[data-kit-pane]");
let viewerStarted = false;

function show(name) {
  tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.kitTab === name ? "true" : "false"));
  panes.forEach((p) => { p.hidden = p.dataset.kitPane !== name; });
  if (name === "3d" && !viewerStarted) {
    viewerStarted = true;
    startViewer(document.querySelector("[data-kit-model]"));
  }
}
tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.kitTab)));

/* the demo video under the wiring diagram */
document.querySelectorAll("[data-kit-play]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = document.getElementById(btn.dataset.kitPlay);
    if (!v) return;
    if (!v.src) v.src = v.dataset.src;
    v.hidden = false;
    btn.hidden = true;
    v.play().catch(() => {});
  });
});

function startViewer(host) {
  if (!host) return;
  const status = host.querySelector(".kit3d__status");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.001, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.zoomToCursor = true;
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });

  let home = null;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  new GLTFLoader().load(host.dataset.kitModel, (gltf) => {
    const model = gltf.scene;
    // KiCad's GLB has no top/bottom faces on the board body and a 95%-transparent solder mask, so
    // the back silkscreen shows through from above. Make the mask an opaque matte black.
    model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.transparent && m.opacity > 0.5) {
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        m.color.setHex(0x0d0d0f);
        m.roughness = 0.55;
        m.metalness = 0;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    scene.add(model);
    const r = size.length() / 2;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    // glTF is Y-up: KiCad's board lies in X-Z with its top face up. View it like a bench photo.
    camera.up.set(0, 1, 0);
    const dir = new THREE.Vector3(0.45, 0.95, 0.85);
    camera.position.copy(dir.normalize().multiplyScalar(dist));
    camera.near = dist / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.minDistance = r * 0.6;
    controls.maxDistance = dist * 4;
    controls.target.set(0, 0, 0);
    controls.update();
    home = camera.position.clone();
    if (status) status.hidden = true;
  }, undefined, () => { if (status) status.textContent = "3D model failed to load."; });

  renderer.domElement.addEventListener("dblclick", () => {
    if (!home) return;
    camera.position.copy(home);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();
}

/* open the view named in the URL hash (#3d, #qr), otherwise "wire" */
show(["wire", "3d", "qr"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "wire");
