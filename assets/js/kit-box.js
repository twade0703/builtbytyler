/* The Sensor Kit, boxed, in 3D (Hardware page + kit page). It starts CLOSED, matching the poster under it.
   "Open the box" lifts the lid off and leans it on the back; the same button closes it. Once open, hover a board to
   lift it and see its name, click it to open its page, and "Lift the tray" sets the top tray beside the box to show
   the bottom layer: the ESP32 on the breadboard, the power module with the 9 V clipped in and plugged, the jumpers.
   Geometry follows sensor-kit/packaging/layout.json; boards are baked Draco meshes (sensor-kit/render/kitshot/bake.js). */
import { THREE, createViewer, ease, mat, canvasTex, bench, batteryPlugged, ribbon, BB, BENCH_JACK, COARSE } from "./kit3d.js?v=78";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { DRACOLoader } from "../vendor/three/DRACOLoader.js";

const BASE = "assets/img/kit/3d/";
const D2R = THREE.MathUtils.degToRad;

function tex(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; res(t); };
    img.onerror = () => res(null);
    img.src = url;
  });
}
function supportsWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

async function build(fig) {
  const [layout, manifest] = await Promise.all([fetch(BASE + "layout.json").then((r) => r.json()), fetch(BASE + "kit-boards.json").then((r) => r.json())]);
  const T = { lidTop: tex(BASE + "lid-top.webp"), lidFront: tex(BASE + "lid-front.webp"), lidSide: tex(BASE + "lid-side.webp"),
    lidBack: tex(BASE + "lid-back.webp"), baseFront: tex(BASE + "base-front.webp"), baseSide: tex(BASE + "base-side.webp"),
    baseBack: tex(BASE + "base-back.webp"), labels: tex(BASE + "foam-top-labels.webp"), card: tex(BASE + "card-front.webp") };
  for (const k of Object.keys(T)) T[k] = await T[k];

  const tip = document.createElement("div");
  tip.className = "k3d-tip"; tip.hidden = true; fig.append(tip);
  const ui = document.createElement("div");
  ui.className = "k3d-ui";
  ui.innerHTML = '<button type="button" class="k3d-btn k3d-btn--main" data-open>Open the box</button>' +
    '<button type="button" class="k3d-btn" data-lift hidden>Lift the tray</button>' +
    '<span class="k3d-hint">' + (COARSE ? "Drag to spin · two fingers to zoom" : "Drag to turn · scroll to zoom") + "</span>";
  fig.append(ui);
  const btnOpen = ui.querySelector("[data-open]"), btnLift = ui.querySelector("[data-lift]");

  let state = "closed", busy = false, hovered = -1;
  const v = createViewer(fig, {
    fov: 26, maxPolar: 82, shadowSize: 300, exposure: 1.05,
    onPick: (p) => {
      if (!p) return;
      if (p.href) location.href = p.href;
      else if (p.action === "open" && state === "closed") toggleOpen();
    },
    onHover: (p, e, move) => {
      if (!p) { tip.hidden = true; setHover(-1); fig.style.cursor = ""; return; }
      fig.style.cursor = p.href || p.action ? "pointer" : "";
      tip.innerHTML = `<b>${p.id ? p.id + " · " : ""}${p.name}</b><span>${p.chip || ""}</span>`;
      tip.hidden = false;
      const r = fig.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
      if (!move) setHover(p.idx ?? -1);
    },
  });

  const [IW, ID] = layout.inner, [OW, OD, OH] = layout.base.outer, WALL = layout.base.wall;
  const kit = new THREE.Group();
  kit.position.set(-IW / 2, 0, -ID / 2);                       // layout frame (base inner corner) -> centred
  v.scene.add(kit);
  const paper = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const inside = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.95 });
  const printed = (t) => (t ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 }) : paper);
  const add = (o, parent = kit) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); parent.add(o); return o; };

  // ---------------------------------------------------------------- base: floor, walls, printed wrap
  const floor = new THREE.Mesh(new RoundedBoxGeometry(OW, 2.5, OD, 2, 1), paper);
  floor.position.set(IW / 2, 1.25, ID / 2); add(floor);
  const wall = (w, d, x, z, faces) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, OH, d), faces); m.position.set(x, OH / 2, z); add(m); };
  const pf = printed(T.baseFront), ps = printed(T.baseSide), pb = printed(T.baseBack);
  //            +x      -x      +y      -y      +z      -z
  wall(OW, WALL, IW / 2, ID + WALL / 2, [paper, paper, paper, paper, pf, inside]);                 // front (outer face +z)
  wall(OW, WALL, IW / 2, -WALL / 2, [paper, paper, paper, paper, inside, pb]);                     // back (outer face -z)
  wall(WALL, OD - 2 * WALL, IW + WALL / 2, ID / 2, [ps, inside, paper, paper, paper, paper]);      // right
  wall(WALL, OD - 2 * WALL, -WALL / 2, ID / 2, [inside, ps, paper, paper, paper, paper]);          // left
  const basePick = new THREE.Mesh(new THREE.BoxGeometry(OW, OH + 32, OD), new THREE.MeshBasicMaterial({ visible: false }));
  basePick.position.set(IW / 2, (OH + 32) / 2, ID / 2);
  basePick.userData.pick = { action: "open", name: "The Sensor Kit", chip: "Click to open the box" };
  kit.add(basePick);

  // ---------------------------------------------------------------- foam (through-pockets, each with its own floor)
  function foam(y0, thick, pockets, depth) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(IW, 0); s.lineTo(IW, -ID); s.lineTo(0, -ID); s.lineTo(0, 0);
    for (const [x, z, w, d] of pockets) {
      const p = new THREE.Path(), r = 1.6;
      p.moveTo(x + r, -z); p.lineTo(x + w - r, -z); p.quadraticCurveTo(x + w, -z, x + w, -z - r); p.lineTo(x + w, -z - d + r);
      p.quadraticCurveTo(x + w, -z - d, x + w - r, -z - d); p.lineTo(x + r, -z - d); p.quadraticCurveTo(x, -z - d, x, -z - d + r);
      p.lineTo(x, -z - r); p.quadraticCurveTo(x, -z, x + r, -z);
      s.holes.push(p);
    }
    const G = new THREE.Group();
    const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 4 });
    geo.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(geo, foamMat); top.position.y = y0; G.add(top);
    for (const [x, z, w, d, dp] of pockets) {
      const fh = thick - (dp || depth);
      const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, fh, d + 0.2), foamMat);
      f.position.set(x + w / 2, y0 + fh / 2, z + d / 2); G.add(f);
    }
    G.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
    return G;
  }
  const B = layout.bottom, TP = layout.top;

  // ---------------------------------------------------------------- bottom layer
  const BDEPTH = { breadboard: 22, battery: 18, jumpers: 10, card: 3 };
  kit.add(foam(2.5, B.thickness, layout.bottom_layer.filter((c) => c.pocket).flatMap((c) => [c.pocket.concat([BDEPTH[c.kind]])]
    .concat(c.lead_pocket ? [c.lead_pocket.concat([10])] : [])), 22));
  const bbCell = layout.bottom_layer.find((c) => c.kind === "breadboard");
  const benchKit = bench({ battery: false });
  const benchG = benchKit.group;
  const [bx, bz, bw, bd] = bbCell.breadboard;
  benchG.rotation.y = bbCell.flip ? Math.PI : 0;
  benchG.position.set(bx + bw / 2, B.top_z - 22, bz + bd / 2 + 1);
  add(benchG);
  benchG.updateMatrix();
  const jack = BENCH_JACK.clone().applyMatrix4(benchG.matrix);                // kit frame
  const batFloor = B.top_z - BDEPTH.battery;
  const dirIn = new THREE.Vector3(bbCell.flip ? -1 : 1, 0, 0);               // plug pushes into the jack
  const power = batteryPlugged(jack.clone().sub(new THREE.Vector3(0, batFloor, 0)), dirIn, 6);
  power.position.y = batFloor;
  add(power);
  const jw = layout.bottom_layer.find((c) => c.kind === "jumpers");
  const r1 = ribbon(40, 200, "M", "F"); r1.position.set(jw.pocket[0] + 96, B.top_z - 10, jw.pocket[1] + 31); add(r1);
  const r2 = ribbon(20, 200, "M", "M"); r2.position.set(jw.pocket[0] + 96, B.top_z - 10 + 5.2, jw.pocket[1] + 16); add(r2);
  // quick-start card, portrait in its recess
  const cardCell = layout.bottom_layer.find((c) => c.kind === "card");
  if (cardCell) {
    const [cx0, cz0, cw, cd] = cardCell.pocket;
    const cardM = T.card ? new THREE.MeshStandardMaterial({ map: T.card, roughness: 0.55 }) : mat("white");
    const qc = new THREE.Mesh(new THREE.BoxGeometry(152.4, 0.6, 101.6), [mat("white"), mat("white"), cardM, mat("white"), mat("white"), mat("white")]);
    qc.rotation.y = -Math.PI / 2;
    qc.position.set(cx0 + cw / 2, B.top_z - BDEPTH.card + 0.3, cz0 + cd / 2);
    add(qc);
  }
  // screen-printed mark on the free floor
  const markCell = layout.bottom_layer.find((c) => c.kind === "print");
  if (markCell) {
    const [mx, mz, mw, md] = markCell.area, ppm = 8;
    const mark = canvasTex(Math.round(mw * ppm), Math.round(md * ppm), (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textBaseline = "middle"; g.textAlign = "left";
      g.font = `700 ${34 * ppm}px Bahnschrift, "Segoe UI", sans-serif`;
      const y = h * 0.42;
      g.fillStyle = "#f26a1b"; g.fillText("{", 10 * ppm, y);
      const wb = g.measureText("{").width;
      g.fillStyle = "#efede8"; g.fillText("t", 10 * ppm + wb, y);
      const wt = g.measureText("t").width;
      g.fillStyle = "#f26a1b"; g.fillText("}", 10 * ppm + wb + wt, y);
      g.fillStyle = "#efede8"; g.font = `700 ${7 * ppm}px Bahnschrift, sans-serif`; g.fillText("THE SENSOR KIT", 68 * ppm, h * 0.36);
      g.fillStyle = "rgba(239,237,232,0.6)"; g.font = `600 ${4.2 * ppm}px Bahnschrift, sans-serif`;
      g.fillText("Build anything.  builtbytyler.com/kit", 68 * ppm, h * 0.52);
    });
    const mp = new THREE.Mesh(new THREE.PlaneGeometry(mw, md), new THREE.MeshStandardMaterial({ map: mark, transparent: true, roughness: 0.85, depthWrite: false }));
    mp.rotation.x = -Math.PI / 2; mp.position.set(mx + mw / 2, B.top_z + 0.05, mz + md / 2); mp.receiveShadow = true;
    kit.add(mp);
  }

  // ---------------------------------------------------------------- top tray: foam, printed labels, START card, boards
  const tray = new THREE.Group();
  kit.add(tray);
  tray.add(foam(B.top_z, TP.thickness, layout.top_layer.map((c) => c.pocket.concat([c.depth || (c.kind === "qr" ? 2 : c.kind === "lift" ? 6 : TP.pocket_depth)])), TP.pocket_depth));
  if (T.labels) {
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(IW, ID), new THREE.MeshStandardMaterial({ map: T.labels, transparent: true, roughness: 0.8, depthWrite: false }));
    lp.rotation.x = -Math.PI / 2; lp.position.set(IW / 2, TP.top_z + 0.05, ID / 2); lp.receiveShadow = true; tray.add(lp);
  }
  const qrCell = layout.top_layer.find((c) => c.kind === "qr");
  const qrImg = new Image(); qrImg.src = BASE + "qr-kit.png";
  await new Promise((r) => { qrImg.onload = r; qrImg.onerror = r; });
  const card = canvasTex(600, 600, (g, w, h) => {
    g.fillStyle = "#f4f2ed"; g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = false; if (qrImg.width) g.drawImage(qrImg, 90, 40, 420, 420);
    g.fillStyle = "#101012"; g.textAlign = "center"; g.font = '700 54px Bahnschrift, sans-serif'; g.fillText("START HERE", w / 2, 535);
  });
  const [qx, qz, qw, qd] = qrCell.pocket;
  add(new THREE.Mesh(new THREE.BoxGeometry(qw - 1, 0.6, qd - 1), [mat("white"), mat("white"), new THREE.MeshStandardMaterial({ map: card, roughness: 0.6 }), mat("white"), mat("white"), mat("white")]), tray)
    .position.set(qx + qw / 2, TP.top_z - 2 + 0.3, qz + qd / 2);

  const draco = new DRACOLoader().setDecoderPath("assets/vendor/three/draco/");
  const hoverU = { value: -1 };
  const boardMats = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1 }),
  };
  Object.values(boardMats).forEach((m) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHover = hoverU;
      sh.vertexShader = "attribute vec2 aBoard;\nuniform float uHover;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\nif (abs(aBoard.x - uHover) < 0.5) transformed.y += 3.0;");
    };
  });
  await Promise.all(manifest.parts.map((p) => new Promise((res, rej) => draco.load(BASE + p.file, (g) => {
    g.setAttribute("aBoard", g.getAttribute("uv")); g.deleteAttribute("uv");
    const m = new THREE.Mesh(g, boardMats[p.cls]); m.castShadow = m.receiveShadow = true; tray.add(m); res();
  }, undefined, rej))));
  draco.dispose();

  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const boardPicks = manifest.boards.map((b, i) => {
    const [x, z, w, d] = b.pocket;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 26, d + 10), pickMat);
    box.position.set(x + w / 2, TP.top_z + 4, z + d / 2 + 3);
    box.userData.pick = { idx: i, id: b.id, name: b.name, chip: b.chip, href: `kit-${b.id.toLowerCase()}.html` };
    tray.add(box);
    return box;
  });
  const frameTex = canvasTex(256, 256, (g, w, h) => { g.strokeStyle = "#5fe6ff"; g.lineWidth = 10; g.shadowColor = "#5fe6ff"; g.shadowBlur = 14; g.strokeRect(12, 12, w - 24, h - 24); });
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: frameTex, transparent: true, depthWrite: false, toneMapped: false }));
  hl.rotation.x = -Math.PI / 2; hl.visible = false; tray.add(hl);
  function setHover(i) {
    if (i === hovered) return;
    hovered = i; hoverU.value = i;
    if (i >= 0) {
      const c = layout.top_layer.find((x) => x.id === manifest.boards[i].id);
      const [x, z, w, d] = c.cell;
      hl.scale.set(w - 2, d - 2, 1); hl.position.set(x + w / 2, TP.top_z + 0.2, z + d / 2); hl.visible = true;
    } else hl.visible = false;
    v.updateShadows();
  }
  const bottomPicks = [
    [benchG, { name: "ESP32 DevKit on the breadboard", chip: "ESP32-WROOM-32 · 830 points · MB102 power module" }],
    [power, { name: "9 V battery, clipped in", chip: "Red +, black − into the power module: no USB needed" }],
    [r1, { name: "Jumper wires", chip: "40 male-female + 20 male-male" }],
  ].map(([o, p]) => {
    const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y + 6, s.z), pickMat);
    m.position.copy(kit.worldToLocal(c.clone())); m.userData.pick = p; kit.add(m);
    return m;
  });

  // ---------------------------------------------------------------- lid: a real telescoping lid (top panel + skirt)
  const [LW, LD, LH] = layout.lid.outer, LT = 2.5, LWALL = layout.lid.wall || 2.5;
  const lid = new THREE.Group();                                 // origin = centre of the top face
  const lidTopM = printed(T.lidTop), lidFrontM = printed(T.lidFront), lidSideM = printed(T.lidSide), lidBackM = printed(T.lidBack);
  const topPanel = new THREE.Mesh(new RoundedBoxGeometry(LW, LT, LD, 2, 0.8), [paper, paper, lidTopM, inside, paper, paper]);
  topPanel.position.set(0, -LT / 2, 0); lid.add(topPanel);
  const skirt = (w, d, x, z, faces) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, LH - LT, d), faces); m.position.set(x, -LT - (LH - LT) / 2, z); lid.add(m); };
  skirt(LW, LWALL, 0, LD / 2 - LWALL / 2, [paper, paper, paper, paper, lidFrontM, inside]);
  skirt(LW, LWALL, 0, -LD / 2 + LWALL / 2, [paper, paper, paper, paper, inside, lidBackM]);
  skirt(LWALL, LD - 2 * LWALL, LW / 2 - LWALL / 2, 0, [lidSideM, inside, paper, paper, paper, paper]);
  skirt(LWALL, LD - 2 * LWALL, -LW / 2 + LWALL / 2, 0, [inside, lidSideM, paper, paper, paper, paper]);
  lid.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  kit.add(lid);
  const lean = D2R(72);
  const POSE = {
    lidClosed: { p: new THREE.Vector3(IW / 2, OH + 1.0, ID / 2), r: 0 },
    lidOpen: { p: new THREE.Vector3(IW / 2, (LD / 2) * Math.sin(lean) + LH * Math.cos(lean) + 0.2, -WALL - 2 - (LD / 2) * Math.cos(lean)), r: lean },
    trayIn: { p: new THREE.Vector3(0, 0, 0) },
    trayOut: { p: new THREE.Vector3(IW + 2 * WALL + 36, -B.top_z, 0) },
  };
  lid.position.copy(POSE.lidClosed.p);

  // ---------------------------------------------------------------- camera homes for each state
  const homes = {};
  const boxOf = (...objs) => { const b = new THREE.Box3(); objs.forEach((o) => b.expandByObject(o)); return b; };
  homes.closed = v.frameObject(boxOf(floor, lid), new THREE.Vector3(-0.62, 0.62, 1.0), 0.5);   // corner fit only: the same frame on every device, so it matches the poster
  lid.position.copy(POSE.lidOpen.p); lid.rotation.x = POSE.lidOpen.r; lid.updateMatrixWorld(true);
  homes.open = v.frameObject(boxOf(floor, lid, tray), new THREE.Vector3(0.1, 1.3, 0.95), COARSE ? 0.9 : 0.78);
  tray.position.copy(POSE.trayOut.p); tray.updateMatrixWorld(true);
  // the bottom layer; on a wide canvas the tray sits at the edge, on a narrow one it is kept in frame
  homes.lifted = v.frameObject(v.camera.aspect < 1.3 ? boxOf(floor, tray) : boxOf(floor), new THREE.Vector3(0.05, 1.5, 0.95), COARSE ? 0.95 : 0.82);
  tray.position.copy(POSE.trayIn.p); lid.position.copy(POSE.lidClosed.p); lid.rotation.x = 0;
  v.goHome(homes.closed);

  function setPicks() {
    v.pickables.length = 0;
    if (state === "closed") v.pickables.push(basePick);
    else { boardPicks.forEach((m) => v.pickables.push(m)); if (state === "lifted") bottomPicks.forEach((m) => v.pickables.push(m)); }
  }
  setPicks();
  function glide(to, ms = 1100) {
    v.stopMotion();
    const p0 = v.camera.position.clone(), t0 = v.controls.target.clone();
    v.controls.minDistance = Math.min(v.controls.minDistance, to.min); v.controls.maxDistance = Math.max(v.controls.maxDistance, to.max);
    v.animate(ms, (u) => { const k = ease(u); v.camera.position.lerpVectors(p0, to.position, k); v.controls.target.lerpVectors(t0, to.target, k); },
      () => { v.controls.minDistance = to.min; v.controls.maxDistance = to.max; });
  }
  function moveLid(open, done) {
    const a = open ? POSE.lidClosed : POSE.lidOpen, b = open ? POSE.lidOpen : POSE.lidClosed;
    v.animate(1200, (u) => {
      const k = ease(u);
      lid.position.lerpVectors(a.p, b.p, k);
      lid.position.y += Math.sin(Math.PI * k) * 70;                    // lift off, then set down
      lid.rotation.x = a.r + (b.r - a.r) * k;
    }, done);
  }
  function moveTray(out, done) {
    const a = out ? POSE.trayIn.p : POSE.trayOut.p, b = out ? POSE.trayOut.p : POSE.trayIn.p;
    v.animate(1200, (u) => {
      const k = ease(u);
      tray.position.lerpVectors(a, b, k);
      tray.position.y += Math.sin(Math.PI * k) * 90;
    }, done);
  }
  function sync() {
    btnOpen.textContent = state === "closed" ? "Open the box" : "Close the box";
    btnLift.hidden = state === "closed";
    btnLift.textContent = state === "lifted" ? "Put the tray back" : "Lift the tray";
    setPicks();
  }
  function toggleOpen() {
    if (busy) return;
    busy = true; tip.hidden = true; setHover(-1);
    if (state === "closed") {
      glide(homes.open, 1200);
      moveLid(true, () => { state = "open"; busy = false; sync(); });
    } else {
      const close = () => { glide(homes.closed, 1200); moveLid(false, () => { state = "closed"; busy = false; sync(); }); };
      if (state === "lifted") moveTray(false, close); else close();
    }
  }
  btnOpen.addEventListener("click", toggleOpen);
  btnLift.addEventListener("click", () => {
    if (busy || state === "closed") return;
    busy = true; tip.hidden = true; setHover(-1);
    const out = state === "open";
    glide(out ? homes.lifted : homes.open, 1200);
    moveTray(out, () => { state = out ? "lifted" : "open"; busy = false; sync(); });
  });
  v.renderer.domElement.addEventListener("dblclick", () => v.goHome(homes[state]));
  sync();
  v.setReady();
  fig.classList.add("is-live");

  // local only: /kit.html?poster saves the poster (the closed box, this exact framing) to the render server
  if (location.hostname === "localhost" && new URLSearchParams(location.search).has("poster")) {
    v.renderer.setPixelRatio(2.5); v.resize();
    v.controls.update(); v.renderer.shadowMap.needsUpdate = true; v.renderer.render(v.scene, v.camera);
    const blob = await new Promise((r) => v.renderer.domElement.toBlob(r, "image/png"));
    await fetch("http://localhost:8790/save?name=poster-closed.png", { method: "POST", body: blob });
    fig.dataset.poster = "done";
  }
}

document.querySelectorAll("[data-k3d-kit]").forEach((fig) => {
  if (!supportsWebGL()) return;
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    build(fig).catch((e) => { console.error("kit 3D:", e); fig.classList.remove("is-live"); });
  }, { rootMargin: "300px" });
  io.observe(fig);
});
