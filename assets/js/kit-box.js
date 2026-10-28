/* The Sensor Kit, boxed, in 3D (Hardware page). It starts CLOSED, matching the poster under it.
   "Open the box" lifts the lid off and leans it on the back; the same button closes it. Once open, hover a board to
   lift it and see its name, click it to open its page. The top layer is a lift-out compartment tray: every module in
   its own walled cell on a foam pad with a finger scoop. "Lift the tray" sets it beside the box and centres the bottom
   layer: breadboard, ESP32, power module, 9 V, its clip lead and the jumpers, each loose in its own foam pocket.
   Geometry follows sensor-kit/packaging/layout.json; boards are baked Draco meshes (sensor-kit/render/kitshot/bake.js). */
import { THREE, createViewer, ease, mat, canvasTex, breadboard, esp32, powerModule, battery9v, snapClip, barrelLead, ribbon, NINE_V, COARSE } from "./kit3d.js?v=94";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { DRACOLoader } from "../vendor/three/DRACOLoader.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";

const BASE = "assets/img/kit/3d/";
const D2R = THREE.MathUtils.degToRad;

function tex(url) {
  // Decoded off the main thread as an ImageBitmap, already flipped the way WebGL wants it. An <img> handed to WebGL is
  // decoded again inside the upload, on the main thread (135 ms for one panel), whatever img.decode() did first.
  const done = (src, flip) => { const t = new THREE.Texture(src); t.flipY = flip; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; };
  const viaImg = () => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(done(img, true));
    img.onerror = () => res(null);
    img.src = url;
  });
  if (typeof createImageBitmap !== "function") return viaImg();
  return fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject()))
    .then((b) => createImageBitmap(b, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }))
    .then((bmp) => done(bmp, false), viaImg);
}
// The build is split into steps, and each step waits until the box is on screen and the page has not scrolled for a
// moment: the heavy ones (the renderer and its environment map, the geometry, the first frame) then never land in the
// middle of a scroll, and nothing is built for a box nobody is looking at.
let lastScroll = -1e9, CALM_FIG = null;
addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });
const calm = () => new Promise((r) => {
  const check = () => (CALM_FIG && CALM_FIG._on && performance.now() - lastScroll > 220 ? r() : setTimeout(check, 90));
  setTimeout(check, 0);
});
function supportsWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

async function build(fig) {
  const [layout, manifest] = await Promise.all([fetch(BASE + "layout.json").then((r) => r.json()), fetch(BASE + "kit-boards.json").then((r) => r.json())]);
  const T = { lidTop: tex(BASE + "lid-top.webp"), lidFront: tex(BASE + "lid-front.webp"), lidSide: tex(BASE + "lid-side.webp"),
    lidBack: tex(BASE + "lid-back.webp"), baseFront: tex(BASE + "base-front.webp"), baseSide: tex(BASE + "base-side.webp"),
    baseBack: tex(BASE + "base-back-2.webp"), frame: tex(BASE + "tray-frame.webp"), card: tex(BASE + "card-front.webp") };
  for (const k of Object.keys(T)) T[k] = await T[k];
  await calm();

  const tip = document.createElement("div");
  tip.className = "k3d-tip"; tip.hidden = true; fig.append(tip);
  const ui = document.createElement("div");
  ui.className = "k3d-ui";
  ui.innerHTML = '<button type="button" class="k3d-btn k3d-btn--main" data-open>Open the box</button>' +
    '<button type="button" class="k3d-btn" data-lift hidden>Lift the tray</button>' +
    '<span class="k3d-hint">' + (COARSE ? "Drag to spin · two fingers to zoom" : "Drag to turn · scroll to zoom") + "</span>";
  // Tyler, 2026-10-22: no "See the back" button ("I'll just spin it around"); drag turns the box any way
  if (fig.parentElement.classList.contains("kstage")) fig.after(ui); else fig.append(ui);   // straight under the 3D
  const btnOpen = ui.querySelector("[data-open]"), btnLift = ui.querySelector("[data-lift]");

  let state = "closed", busy = false, hovered = -1, backView = false;
  const v = createViewer(fig, {
    fov: 26, maxPolar: 82, shadowSize: 300, exposure: 1.05, deferEnv: true,
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
  const grain = canvasTex(256, 256, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = 118 + Math.random() * 30; im.data.set([v, v, v, 255], i * 4); }
    g.putImageData(im, 0, 0);
  }, { srgb: false });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(0.12, 0.12);                                // extrude caps carry mm UVs
  const foamMat = new THREE.MeshStandardMaterial({ color: 0x232327, roughness: 0.96, bumpMap: grain, bumpScale: 0.6 });
  const printed = (t) => (t ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 }) : paper);
  const add = (o, parent = kit) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); parent.add(o); return o; };

  await calm();
  v.makeEnv();
  await calm();

  // ---------------------------------------------------------------- base: floor, walls, printed wrap
  // 0.3 mm inside the walls: at full size its sides lay in the same plane as the walls' printed faces (a flickering strip)
  const floor = new THREE.Mesh(new RoundedBoxGeometry(OW - 0.6, 2.5, OD - 0.6, 2, 1), paper);
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

  // ---------------------------------------------------------------- foam: a slab with blind pockets (each pocket gets its own floor)
  const rectPath = (x, z, w, d, r = 1.6) => {
    const p = new THREE.Path();
    p.moveTo(x + r, -z); p.lineTo(x + w - r, -z); p.quadraticCurveTo(x + w, -z, x + w, -z - r); p.lineTo(x + w, -z - d + r);
    p.quadraticCurveTo(x + w, -z - d, x + w - r, -z - d); p.lineTo(x + r, -z - d); p.quadraticCurveTo(x, -z - d, x, -z - d + r);
    p.lineTo(x, -z - r); p.quadraticCurveTo(x, -z, x + r, -z);
    return p;
  };
  const slabGeo = (outline, holes, y0, thick) => {
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    holes.forEach((h) => sh.holes.push(h));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, y0, 0);
    return geo;
  };
  const slab = (outline, holes, y0, thick, m) => {
    const o = new THREE.Mesh(slabGeo(outline, holes, y0, thick), m); o.receiveShadow = true; o.castShadow = true;
    return o;
  };
  const B = layout.bottom, TR = layout.tray, FLOOR = layout.base.floor;
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };

  // ---------------------------------------------------------------- bottom layer: loose parts, each in its own pocket
  const bot = layout.bottom_layer.filter((c) => c.pocket);
  const bottom = new THREE.Group(); kit.add(bottom);
  bottom.add(slab([[0, 0], [IW, 0], [IW, ID], [0, ID]], bot.map((c) => rectPath(...c.pocket)), FLOOR, B.thickness, foamMat));
  bot.forEach((c) => { const [x, z, w, d] = c.pocket, fh = B.thickness - c.depth; bottom.add(box(w + 0.2, fh, d + 0.2, foamMat, x + w / 2, FLOOR + fh / 2, z + d / 2)); });
  const cellOf = (k) => layout.bottom_layer.find((c) => c.kind === k);
  const floorOf = (c) => B.top_z - c.depth;
  const mid = (c) => [c.pocket[0] + c.pocket[2] / 2, c.pocket[1] + c.pocket[3] / 2];
  const items = [];
  // breadboard, empty
  const bbC = cellOf("breadboard"), bbG = breadboard();
  bbG.position.set(...[mid(bbC)[0], floorOf(bbC), mid(bbC)[1]]); add(bbG, bottom);
  items.push([bbG, { name: "Breadboard", chip: "830 points, empty: you build on it" }]);
  // ESP32 DevKit, loose: header plastic on the pocket floor, pins pressed into the foam
  const espC = cellOf("esp32"), espG = esp32();
  espG.position.set(mid(espC)[0], floorOf(espC) + 2.5, mid(espC)[1]); add(espG, bottom);
  items.push([espG, { name: "ESP32 DevKit V1", chip: "WROOM-32, 30-pin · pins in anti-static foam" }]);
  // MB102 power module, loose
  const pmC = cellOf("power"), pmG = powerModule();
  pmG.position.set(mid(pmC)[0], floorOf(pmC) - 7.25, mid(pmC)[1]); add(pmG, bottom);
  items.push([pmG, { name: "MB102 power module", chip: "9 V in, 5 V and 3.3 V to the breadboard rails" }]);
  // 9 V lying on its back, terminals toward +x under a plastic cap
  const FLAT = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  const batC = cellOf("battery"), bat = battery9v();
  const capM = new THREE.MeshPhysicalMaterial({ color: 0x2a2b2f, roughness: 0.35, clearcoat: 0.6 });
  const cap = new THREE.Mesh(new RoundedBoxGeometry(NINE_V.W + 1.2, 7, NINE_V.D + 1.0, 3, 1.6), capM);
  cap.position.set(0, NINE_V.H + 0.6, 0); bat.add(cap);
  bat.setRotationFromMatrix(FLAT);
  bat.position.set(batC.pocket[0] + 1.2, floorOf(batC) + (NINE_V.D + 1.0) / 2, mid(batC)[1]); add(bat, bottom);
  items.push([bat, { name: "9 V battery", chip: "Terminal cap on: it ships unplugged" }]);
  // snap clip + lead + barrel plug, loose in its own pocket
  const clC = cellOf("clip"), clipG = new THREE.Group();
  const clip = snapClip(), holder = new THREE.Group();
  holder.add(clip.group); holder.setRotationFromMatrix(FLAT);
  holder.position.set(-(NINE_V.H + 0.2), (NINE_V.D + 1.4) / 2, 0); holder.updateMatrix();
  clipG.add(holder);
  const exits = clip.exits.map((q) => q.clone().applyMatrix4(holder.matrix));
  const dirX = new THREE.Vector3(1, 0, 0);
  clipG.add(barrelLead(exits, dirX, new THREE.Vector3(exits[0].x + 50, 4.8, 0), dirX));
  clipG.position.set(clC.pocket[0] + 2, floorOf(clC), mid(clC)[1]); add(clipG, bottom);
  items.push([clipG, { name: "9 V clip to barrel plug", chip: "Snaps on the 9 V, plugs into the power module" }]);
  // jumper ribbons, folded as they ship
  const jw = cellOf("jumpers");
  const r1 = ribbon(40, 200, "M", "F"); r1.position.set(jw.pocket[0] + 96, floorOf(jw), jw.pocket[1] + 31); add(r1, bottom);
  const r2 = ribbon(20, 200, "M", "M"); r2.position.set(jw.pocket[0] + 96, floorOf(jw) + 5.8, jw.pocket[1] + 16); add(r2, bottom);
  items.push([r1, { name: "Jumper wires", chip: "40 male-female + 20 male-male, 20 cm" }]);
  // quick-start card
  const cardCell = cellOf("card");
  if (cardCell) {
    const cardM = T.card ? new THREE.MeshStandardMaterial({ map: T.card, roughness: 0.55 }) : mat("white");
    const qc = new THREE.Mesh(new THREE.BoxGeometry(152.4, 0.6, 101.6), [mat("white"), mat("white"), cardM, mat("white"), mat("white"), mat("white")]);
    qc.position.set(mid(cardCell)[0], floorOf(cardCell) + 0.3, mid(cardCell)[1]);
    add(qc, bottom);
    items.push([qc, { name: "Quick-start card", chip: "Three steps, and a QR to every module's wiring + code" }]);
  }
  // screen-printed mark on the free floor
  const markCell = layout.bottom_layer.find((c) => c.kind === "print");
  if (markCell) {
    const [mx, mz, mw, md] = markCell.area, ppm = 8;
    const mark = canvasTex(Math.round(mw * ppm), Math.round(md * ppm), (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textBaseline = "alphabetic"; g.textAlign = "left";
      const x0 = 8 * ppm;
      g.font = `700 ${40 * ppm}px Bahnschrift, "Segoe UI", sans-serif`;
      let x = x0; const y = 52 * ppm;
      for (const [ch, c] of [["{", "#f26a1b"], ["t", "#efede8"], ["}", "#f26a1b"]]) { g.fillStyle = c; g.fillText(ch, x, y); x += g.measureText(ch).width; }
      g.fillStyle = "#efede8"; g.font = `700 ${8 * ppm}px Bahnschrift, sans-serif`; g.fillText("THE SENSOR KIT", x0, 74 * ppm);
      g.fillStyle = "rgba(239,237,232,0.6)"; g.font = `600 ${5 * ppm}px Bahnschrift, sans-serif`;
      g.fillText("Build anything.", x0, 86 * ppm); g.fillText("builtbytyler.com/kit", x0, 94 * ppm);
    });
    const mp = new THREE.Mesh(new THREE.PlaneGeometry(mw, md), new THREE.MeshStandardMaterial({ map: mark, transparent: true, roughness: 0.85, depthWrite: false }));
    mp.rotation.x = -Math.PI / 2; mp.position.set(mx + mw / 2, B.top_z + 0.05, mz + md / 2); mp.receiveShadow = true;
    bottom.add(mp);
  }

  await calm();

  // ---------------------------------------------------------------- top layer: the compartment tray
  const tray = new THREE.Group();
  kit.add(tray);
  const [TX, TZ] = TR.pos, [TW, TD] = TR.outer, T0 = TR.z0, TT = TR.top_z, TB = T0 + TR.base;
  const board = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.82 });        // black chipboard
  const wrapM = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  tray.add(box(TW, TR.base, TD, wrapM, TX + TW / 2, T0 + TR.base / 2, TZ + TD / 2));
  const FR = TR.frame.thickness, wh = TT - FR - T0;                 // walls + dividers stop under the frame card
  tray.add(box(TW, wh, TR.wall, wrapM, TX + TW / 2, T0 + wh / 2, TZ + TR.wall / 2));
  tray.add(box(TW, wh, TR.wall, wrapM, TX + TW / 2, T0 + wh / 2, TZ + TD - TR.wall / 2));
  tray.add(box(TR.wall, wh, TD - 2 * TR.wall, wrapM, TX + TR.wall / 2, T0 + wh / 2, TZ + TD / 2));
  tray.add(box(TR.wall, wh, TD - 2 * TR.wall, wrapM, TX + TW - TR.wall / 2, T0 + wh / 2, TZ + TD / 2));
  for (const dv of TR.dividers) {
    const [x, z, w, d] = dv.rect;
    tray.add(box(w, dv.height, d, board, x + w / 2, TB + dv.height / 2, z + d / 2));
  }
  // satin pull tabs: a ribbon up the outside of each end wall, folded over the top edge
  const tabM = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide });
  TR.pull_tabs.forEach(([x, z], i) => {
    const sx = i ? 1 : -1;                                     // -1 = left wall, +1 = right wall (outer face)
    tray.add(box(0.5, 16, 14, tabM, x + sx * 0.25, TT - 6, z));
    const fold = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 14, 16, 1, true, Math.PI / 2, Math.PI), tabM);
    fold.rotation.x = Math.PI / 2;                             // axis along z, half pipe arching over the wall top
    fold.position.set(x - sx * 2.35, TT + 2, z);
    tray.add(fold);
  });
  // cell pads: 2 x 3 mm EVA, board pocket through the top sheet, finger scoop through both
  const cells = layout.top_layer, padCells = cells.filter((c) => c.kind !== "lift");
  const scoopPath = (c, withPocket) => {
    const [x, z, w, d] = c.pocket, [sx, sz, r] = c.scoop, p = new THREE.Path();
    if (withPocket) {
      p.moveTo(x, -z); p.lineTo(x + w, -z); p.lineTo(x + w, -(z + d)); p.lineTo(sx + r, -(z + d));
      p.absarc(sx, -sz, r, 0, -Math.PI, true); p.lineTo(x, -(z + d)); p.lineTo(x, -z);
    } else {
      p.moveTo(sx + r, -sz); p.absarc(sx, -sz, r, 0, -Math.PI, true); p.lineTo(sx + r, -sz);
    }
    return p;
  };
  const padRect = (c) => { const [x, z, w, d] = c.cell; return [[x + 0.25, z + 0.25], [x + w - 0.25, z + 0.25], [x + w - 0.25, z + d - 0.25], [x + 0.25, z + d - 0.25]]; };
  const lower = TR.pad - TR.pocket_depth;
  const padGeo = mergeGeometries([
    ...padCells.map((c) => slabGeo(padRect(c), [scoopPath(c, false)], TB, lower)),
    ...padCells.map((c) => slabGeo(padRect(c), [scoopPath(c, true)], TB + lower, TR.pocket_depth)),
  ]);
  const pads = new THREE.Mesh(padGeo, foamMat); pads.receiveShadow = pads.castShadow = true; tray.add(pads);
  // the frame card glued on top: a window per cell, a white label on each cell's front bar (ID big, name small)
  {
    const outline = [[TX, TZ], [TX + TW, TZ], [TX + TW, TZ + TD], [TX, TZ + TD]];
    const holes = cells.map((c) => rectPath(...c.window, 0.8));
    const geo = slabGeo(outline, holes, TT - FR, FR);
    const cap = T.frame ? new THREE.MeshStandardMaterial({ map: T.frame, roughness: 0.55 }) : board;
    if (T.frame) {                                             // cap UVs are shape coords (x, -z) in mm
      T.frame.repeat.set(1 / TW, 1 / TD); T.frame.offset.set(-TX / TW, (TZ + TD) / TD);
      T.frame.anisotropy = v.renderer.capabilities.getMaxAnisotropy();
    }
    const frame = new THREE.Mesh(geo, [cap, board]); frame.castShadow = frame.receiveShadow = true;
    tray.add(frame);
  }
  const qrCell = cells.find((c) => c.kind === "qr");
  const qrImg = new Image(); qrImg.src = BASE + "qr-kit.png";
  await new Promise((r) => { qrImg.onload = r; qrImg.onerror = r; });
  const card = canvasTex(600, 600, (g, w, h) => {
    g.fillStyle = "#f4f2ed"; g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = false; if (qrImg.width) g.drawImage(qrImg, 90, 40, 420, 420);
    g.fillStyle = "#101012"; g.textAlign = "center"; g.font = '700 54px Bahnschrift, sans-serif'; g.fillText("START HERE", w / 2, 535);
  });
  add(new THREE.Mesh(new THREE.BoxGeometry(32, 0.6, 32), [mat("white"), mat("white"), new THREE.MeshStandardMaterial({ map: card, roughness: 0.6 }), mat("white"), mat("white"), mat("white")]), tray)
    .position.set(qrCell.board_center[0], TR.pcb_y + 0.3, qrCell.board_center[1]);

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
    const c = cells.find((x) => x.id === b.id);
    const [x, z, w, d] = c.cell;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, TT - TR.pcb_y, d), pickMat);
    box.position.set(x + w / 2, (TT + TR.pcb_y) / 2, z + d / 2);
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
      const c = cells.find((x) => x.id === manifest.boards[i].id);
      const [x, z, w, d] = c.cell;
      hl.scale.set(w - 1, d - 1, 1); hl.position.set(x + w / 2, TR.pad_top + 0.2, z + d / 2); hl.visible = true;
    } else hl.visible = false;
    v.updateShadows();
  }
  const bottomPicks = items.map(([o, p]) => {
    const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y + 6, s.z), pickMat);
    m.position.copy(kit.worldToLocal(c.clone())); m.userData.pick = p; kit.add(m);
    return m;
  });

  await calm();

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
  const LINER = layout.lid.liner || 3;                           // EVA liner: presses the tray down, so nothing crosses a wall
  const liner = new THREE.Mesh(new THREE.BoxGeometry(IW - 1, LINER, ID - 1), foamMat);
  liner.position.set(0, -LT - LINER / 2, 0); lid.add(liner);
  lid.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  kit.add(lid);
  const lean = D2R(72);
  const POSE = {
    lidClosed: { p: new THREE.Vector3(IW / 2, OH + LT, ID / 2), r: 0 },          // the lid panel rests on the base rim
    lidOpen: { p: new THREE.Vector3(IW / 2, (LD / 2) * Math.sin(lean) + LH * Math.cos(lean) + 0.2, -WALL - 2 - (LD / 2) * Math.cos(lean)), r: lean },
    trayIn: { p: new THREE.Vector3(0, 0, 0) },
    trayOut: { p: new THREE.Vector3(IW + 2 * WALL + 36, -TR.z0, 0) },
  };
  lid.position.copy(POSE.lidClosed.p);

  // ---------------------------------------------------------------- warm-up before the first frame
  // The first render used to compile every shader and upload every texture in one animation frame: a 1.8 s freeze
  // on a fast Windows PC (ANGLE links each program synchronously), right when people scroll on to NEMO and the i4.
  // Upload the textures one per task, then let the driver compile the programs in parallel (KHR_parallel_shader_compile)
  // and only draw once they are ready. The poster stays up the whole time, so nothing visible changes.
  // between steps, give the GPU process a frame to drain what it has queued, so an upload never waits on it
  const breathe = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  async function warm() {
    const R = v.renderer, texs = new Set();
    v.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => ["map", "bumpMap"].forEach((k) => m[k] && texs.add(m[k]))); });
    await breathe();
    for (const t of texs) { await calm(); R.initTexture(t); await breathe(); }
    if (!R.compileAsync) return;
    const ready = R.compileAsync(v.scene, v.camera);
    // the shadow pass draws with depth materials into a render target; their programs are keyed by that target,
    // so compile look-alikes against a target too (FrontSide meshes cast with BackSide, DoubleSide stays DoubleSide)
    const rt = new THREE.WebGLRenderTarget(4, 4), dscene = new THREE.Scene(), dg = new THREE.PlaneGeometry(1, 1);
    [THREE.BackSide, THREE.DoubleSide].forEach((side) => dscene.add(new THREE.Mesh(dg, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side }))));
    v.scene.traverse((o) => { if (o.isLight) dscene.add(o.clone()); });              // program keys count the lights too
    const prev = R.getRenderTarget();
    R.setRenderTarget(rt);
    const depthReady = R.compileAsync(dscene, v.camera);
    R.setRenderTarget(prev);
    await Promise.all([ready, depthReady]);
    rt.dispose();
  }

  // ---------------------------------------------------------------- camera homes for each state
  const homes = {};
  const boxOf = (...objs) => { const b = new THREE.Box3(); objs.forEach((o) => b.expandByObject(o)); return b; };
  homes.closed = v.frameObject(boxOf(floor, lid), new THREE.Vector3(-0.62, 0.62, 1.0), 0.5);   // corner fit only: the same frame on every device, so it matches the poster
  {                                                              // the back panel, nearly square on and filling the frame
    const zb = -ID / 2 - WALL - 3;
    homes.back = v.frameObject(new THREE.Box3(new THREE.Vector3(-LW / 2, 0, zb), new THREE.Vector3(LW / 2, OH + LT, zb + 30)), new THREE.Vector3(0.12, 0.22, -1.0), 0.5);
  }
  lid.position.copy(POSE.lidOpen.p); lid.rotation.x = POSE.lidOpen.r; lid.updateMatrixWorld(true);
  homes.open = v.frameObject(boxOf(floor, lid, tray), new THREE.Vector3(0.1, 1.3, 0.95), COARSE ? 0.9 : 0.78);
  tray.position.copy(POSE.trayOut.p); tray.updateMatrixWorld(true);
  // lifted: frame and centre the bottom layer on every screen; the tray beside the box may run out of frame
  const bottomBox = new THREE.Box3().setFromObject(bottom);
  homes.lifted = v.frameObject(bottomBox, new THREE.Vector3(0.0, 1.55, 0.8), COARSE ? 0.98 : 0.86);
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
  // Lid and tray paths. Both used to lerp straight from pose to pose with a sine hop, so the lid's skirt swung down
  // through the front wall and the tray while it turned (up to 34 mm deep), and the tray slid sideways through the
  // right wall before it had risen clear (22 mm): two printed surfaces drawn through each other, the "overlapping
  // textures". Now each is lifted straight up clear of the walls first, carried over with its lowest edge held above
  // the rim, and set down where nothing is under it. Checked against the box geometry in 2D at every step
  // (sensor-kit SHOP-FIX-2026-10-22: 0 mm of overlap either way, closest pass 2 mm).
  const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (6 * t - 15) + 10); };
  const LIP = OH + 10;                                             // the lid's lowest edge while it crosses the box
  function lidPose(u) {                                            // u 0 = closed .. 1 = leaning open
    const s1 = sm(u / 0.3), s2 = sm((u - 0.22) / 0.53), s3 = sm((u - 0.72) / 0.28);
    const r = POSE.lidOpen.r * s2;
    const hold = LIP + LH * Math.cos(r) + (LD / 2) * Math.sin(r); // keeps the front skirt's lip at LIP while it turns
    let y = POSE.lidClosed.p.y + (hold - POSE.lidClosed.p.y) * s1;
    y += (POSE.lidOpen.p.y - y) * s3;
    lid.position.set(POSE.lidClosed.p.x, y, POSE.lidClosed.p.z + (POSE.lidOpen.p.z - POSE.lidClosed.p.z) * s2);
    lid.rotation.x = r;
  }
  // turning to the back walks the camera round the box on a circle (a straight line would cut across the lid)
  function orbit(to, ms = 1400) {
    v.stopMotion();
    const t0 = v.controls.target.clone(), a = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(t0));
    const b = new THREE.Spherical().setFromVector3(to.position.clone().sub(to.target));
    let dt = b.theta - a.theta; dt -= Math.round(dt / (2 * Math.PI)) * 2 * Math.PI;
    v.controls.minDistance = Math.min(v.controls.minDistance, to.min); v.controls.maxDistance = Math.max(v.controls.maxDistance, to.max);
    const sp = new THREE.Spherical();
    v.animate(ms, (u) => {
      const k = ease(u);
      v.controls.target.lerpVectors(t0, to.target, k);
      sp.set(a.radius + (b.radius - a.radius) * k, a.phi + (b.phi - a.phi) * k, a.theta + dt * k);
      v.camera.position.setFromSpherical(sp).add(v.controls.target);
    }, () => { v.controls.minDistance = to.min; v.controls.maxDistance = to.max; });
  }
  function moveLid(open, done) {
    v.animate(1500, (u) => lidPose(open ? u : 1 - u), done);
  }
  const TRAY_LIFT = OH + 6 - TR.z0;                                 // tray floor 6 mm over the rim before it moves sideways
  function trayPose(u) {                                           // u 0 = in the box .. 1 = set down beside it
    const s1 = sm(u / 0.32), s2 = sm((u - 0.26) / 0.48), s3 = sm((u - 0.68) / 0.32);
    let y = TRAY_LIFT * s1;
    y += (POSE.trayOut.p.y - y) * s3;
    tray.position.set(POSE.trayOut.p.x * s2, y, 0);
  }
  function moveTray(out, done) {
    v.animate(1400, (u) => trayPose(out ? u : 1 - u), done);
  }
  function sync() {
    btnOpen.textContent = state === "closed" ? "Open the box" : "Close the box";
    btnLift.hidden = state === "closed";
    btnLift.textContent = state === "lifted" ? "Put the tray back" : "Lift the tray";
    setPicks();
  }
  function toggleOpen() {
    if (busy) return;
    busy = true; tip.hidden = true; setHover(-1); backView = false;
    if (state === "closed") {
      glide(homes.open, 1500);
      moveLid(true, () => { state = "open"; busy = false; sync(); });
    } else {
      const close = () => { glide(homes.closed, 1500); moveLid(false, () => { state = "closed"; busy = false; sync(); }); };
      if (state === "lifted") moveTray(false, close); else close();
    }
  }
  btnOpen.addEventListener("click", toggleOpen);
  btnLift.addEventListener("click", () => {
    if (busy || state === "closed") return;
    busy = true; tip.hidden = true; setHover(-1);
    const out = state === "open";
    glide(out ? homes.lifted : homes.open, 1400);
    moveTray(out, () => { state = out ? "lifted" : "open"; busy = false; sync(); });
  });
  v.renderer.domElement.addEventListener("dblclick", () => v.goHome(homes[state === "closed" && backView ? "back" : state]));
  sync();
  await warm();
  await calm();
  v.setReady();
  fig.classList.add("is-live");

  // local only: a handle for stepping the lid and tray frame by frame while checking the motion
  if (location.hostname === "localhost") window.__kitBox = { lidPose, trayPose, render: () => { v.renderer.shadowMap.needsUpdate = true; v.request(); }, homes, v };

  // local only: /shop.html?poster saves the poster (the closed box, this exact framing) to the render server
  if (location.hostname === "localhost" && new URLSearchParams(location.search).has("poster")) {
    v.renderer.setPixelRatio(2.5); v.resize();
    v.controls.update(); v.renderer.shadowMap.needsUpdate = true; v.renderer.render(v.scene, v.camera);
    const blob = await new Promise((r) => v.renderer.domElement.toBlob(r, "image/png"));
    await fetch("http://localhost:8790/save?name=poster-closed.png", { method: "POST", body: blob });
    fig.dataset.poster = "done";
  }
}

// Build the 3D only when the box is on screen and the page has been still for a moment. Building it compiles shaders
// and uploads textures; started mid-scroll it competed with the NEMO and i4 reels for the GPU and stalled the scroll.
// The poster under it is the same picture, so waiting costs nothing visible.
document.querySelectorAll("[data-k3d-kit]").forEach((fig) => {
  if (!supportsWebGL() || CALM_FIG) return;
  CALM_FIG = fig; fig._on = false;
  let started = false, timer = 0;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
  const go = () => {
    if (started || !fig._on) return;
    started = true; removeEventListener("scroll", arm);
    build(fig).catch((e) => { console.error("kit 3D:", e); fig.classList.remove("is-live"); });
  };
  function arm() { clearTimeout(timer); if (fig._on && !started) timer = setTimeout(() => idle(go, { timeout: 1500 }), 450); }
  new IntersectionObserver((es) => { fig._on = es[0].isIntersecting; arm(); }, { rootMargin: "120px" }).observe(fig);
  addEventListener("scroll", arm, { passive: true });
});
