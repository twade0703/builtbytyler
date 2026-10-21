/* The Sensor Kit, boxed, in 3D (Hardware page + kit page). Replaces the poster render in [data-k3d-kit] once loaded.
   Two foam layers per sensor-kit/packaging/layout.json: the top tray holds the 37 boards (baked into Draco meshes by
   sensor-kit/render/kitshot/bake.js), the bottom holds the ESP32 on the breadboard with the power module, the 9 V and
   the jumpers. Hover a board to lift it and see its name, click it to open its page, "Lift the tray" to see below. */
import { THREE, createViewer, ease, mat, canvasTex, bench, battery9v, ribbon, BB, COARSE } from "./kit3d.js?v=72";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { DRACOLoader } from "../vendor/three/DRACOLoader.js";

const BASE = "assets/img/kit/3d/";

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
  const tip = document.createElement("div");
  tip.className = "k3d-tip";
  tip.hidden = true;
  fig.append(tip);
  const ui = document.createElement("div");
  ui.className = "k3d-ui";
  ui.innerHTML = '<button type="button" class="k3d-btn" data-lift>Lift the tray</button><span class="k3d-hint">' +
    (COARSE ? "Two fingers to turn · tap a module" : "Drag to turn · scroll to zoom · click a module") + "</span>";
  fig.append(ui);

  let hovered = -1;
  const v = createViewer(fig, {
    fov: 26, maxPolar: 80, shadowSize: 240, exposure: 1.05,
    onPick: (p) => { if (p && p.href) location.href = p.href; },
    onHover: (p, e, move) => {
      if (!p) { tip.hidden = true; setHover(-1); fig.style.cursor = ""; return; }
      fig.style.cursor = p.href ? "pointer" : "";
      tip.innerHTML = `<b>${p.id ? p.id + " · " : ""}${p.name}</b><span>${p.chip || ""}</span>`;
      tip.hidden = false;
      const r = fig.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
      if (!move) setHover(p.idx ?? -1);
    },
  });

  const [IW, ID] = layout.inner, OW = layout.base.outer[0], OD = layout.base.outer[1], OH = layout.base.outer[2], WALL = layout.base.wall;
  const kit = new THREE.Group();
  kit.position.set(-IW / 2, 0, -ID / 2);                      // layout frame -> centred
  v.scene.add(kit);
  const boxMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.95 });
  const add = (o, parent = kit) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); parent.add(o); return o; };

  // ---- base box
  const floor = new THREE.Mesh(new RoundedBoxGeometry(OW, 2.5, OD, 2, 1), boxMat);
  floor.position.set(IW / 2, 1.25, ID / 2); add(floor);
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, OH, d, 2, 1.2), boxMat); m.position.set(x, OH / 2, z); add(m); };
  wall(OW, WALL, IW / 2, -WALL / 2); wall(OW, WALL, IW / 2, ID + WALL / 2);
  wall(WALL, OD, -WALL / 2, ID / 2); wall(WALL, OD, IW + WALL / 2, ID / 2);
  const front = canvasTex(2400, 465, (g, w, h) => {
    g.fillStyle = "#0b0b0d"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#f0eee8"; g.font = '700 150px Bahnschrift, "Segoe UI", sans-serif'; g.textBaseline = "middle";
    g.textAlign = "left"; g.fillText("THE SENSOR KIT", 140, h / 2);
    g.textAlign = "right"; g.fillStyle = "rgba(240,238,232,0.55)"; g.font = '600 92px Bahnschrift, "Segoe UI", sans-serif'; g.fillText("BUILT BY TYLER", w - 140, h / 2);
  });
  const [baseFront, baseSide] = await Promise.all([tex(BASE + "base-front.webp"), tex(BASE + "base-side.webp")]);
  const fp = new THREE.Mesh(new THREE.PlaneGeometry(OW - 2, OH - 2), new THREE.MeshStandardMaterial({ map: baseFront || front, roughness: 0.65 }));
  fp.position.set(IW / 2, OH / 2, ID + WALL + 0.06); fp.receiveShadow = true; kit.add(fp);
  if (baseSide) for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(OD - 2, OH - 2), new THREE.MeshStandardMaterial({ map: baseSide, roughness: 0.65 }));
    sp.rotation.y = sx * Math.PI / 2; sp.position.set(sx > 0 ? IW + WALL + 0.06 : -WALL - 0.06, OH / 2, ID / 2); sp.receiveShadow = true; kit.add(sp);
  }

  // ---- foam layers (top surface with pocket holes, slab underneath)
  function foam(y0, thick, pockets, depth) {      // pockets: [x, z, w, d, depth?]
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
  const B = layout.bottom, T = layout.top;
  const BDEPTH = { breadboard: 22, battery: 18, jumpers: 10 };
  const bottomFoam = foam(2.5, B.thickness, layout.bottom_layer.flatMap((c) => [c.pocket.concat([BDEPTH[c.kind]])].concat(c.lead_pocket ? [c.lead_pocket.concat([10])] : [])), 22);
  kit.add(bottomFoam);

  // ---- bottom layer: the bench (breadboard + ESP32 + power module, turned so the jack faces the battery),
  //      the 9 V lying on its back with the snap clip on and the barrel plug in the jack: open it, press ON, it runs
  const bbCell = layout.bottom_layer.find((c) => c.kind === "breadboard");
  const benchKit = bench({ battery: false });
  const benchG = benchKit.group;
  const [bx, bz, bw, bd] = bbCell.breadboard;
  benchG.rotation.y = bbCell.flip ? Math.PI : 0;
  benchG.position.set(bx + bw / 2, B.top_z - 22, bz + bd / 2 + 1);
  add(benchG);
  const flip = bbCell.flip ? -1 : 1;
  const jack = new THREE.Vector3(flip * (-BB.L / 2 - 6), 17.1, flip * -13).add(benchG.position);
  const batCell = layout.bottom_layer.find((c) => c.kind === "battery");
  const bat = battery9v();
  // battery local: x = width 26.5, y = height 48.5 (terminals up), z = depth 17.5. Lay it so terminals face -x,
  // depth is vertical and width runs along z.
  bat.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
  const batX = batCell.pocket[0] + 5 + 48.5 / 2, batZ = jack.z, batY = B.top_z - 18 + 17.5 / 2 + 0.3;
  bat.position.set(batX + 48.5 / 2, batY, batZ);                 // local origin is the battery's base centre
  add(bat);
  const termX = batX - 48.5 / 2 - 1.3;
  const clip = new THREE.Mesh(new RoundedBoxGeometry(7, 17.5, 26.5, 2, 1.2), mat("blackGloss"));
  clip.position.set(termX - 3.5, batY, batZ); add(clip);
  const plugDir = new THREE.Vector3(-1, 0, 0);
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.0, 16, 20), mat("blackGloss"));
  plug.position.copy(jack.clone().add(new THREE.Vector3(13, 0, 0)));
  plug.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), plugDir); add(plug);
  const plugBack = jack.clone().add(new THREE.Vector3(21, 0, 0));
  for (const [dz, m] of [[-1.0, mat("wireRed")], [1.0, mat("wireBlack")]]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(termX - 7, batY + 2, batZ + dz), new THREE.Vector3(termX - 10, batY + 5, batZ + dz * 2 + 4),
      new THREE.Vector3(plugBack.x + 3, plugBack.y + 3, plugBack.z + dz + 6), plugBack.clone().add(new THREE.Vector3(0, 0, dz))]);
    add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.8, 8), m));
  }
  const jw = layout.bottom_layer.find((c) => c.kind === "jumpers");
  const r1 = ribbon(40, 200, "M", "F"); r1.position.set(jw.pocket[0] + 118, B.top_z - 10, jw.pocket[1] + 31); add(r1);
  const r2 = ribbon(20, 200, "M", "M"); r2.position.set(jw.pocket[0] + 118, B.top_z - 10 + 5.2, jw.pocket[1] + 14); add(r2);


  // ---- top tray: foam, printed labels, the boards
  const tray = new THREE.Group();
  kit.add(tray);
  const pockets = layout.top_layer.map((c) => c.pocket.concat([c.depth || (c.kind === "qr" ? 2 : c.kind === "lift" ? 6 : T.pocket_depth)]));
  tray.add(foam(B.top_z, T.thickness, pockets, T.pocket_depth));
  const labelImg = new Image();
  labelImg.src = BASE + "foam-top-labels.webp";
  const labels = await new Promise((res) => { labelImg.onload = () => res(labelImg); labelImg.onerror = () => res(null); });
  const lt = labels ? new THREE.Texture(labels) : canvasTex(Math.round(IW * 8), Math.round(ID * 8), (g) => {
    g.fillStyle = "#eeece7"; g.textAlign = "center";
    for (const c of layout.top_layer) {
      if (!c.label) continue;
      g.font = '700 30px Bahnschrift, sans-serif'; g.fillText(c.id === "LIFT" ? "LIFT" : c.id, c.label[0] * 8, (c.label[1] - 0.4) * 8);
      g.font = '600 17px Bahnschrift, sans-serif'; g.fillStyle = "rgba(238,236,231,0.75)";
      g.fillText(c.name.toUpperCase(), c.label[0] * 8, (c.label[1] + 3.0) * 8, 34 * 8); g.fillStyle = "#eeece7";
    }
  });
  lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 8; lt.needsUpdate = true;
  const lp = new THREE.Mesh(new THREE.PlaneGeometry(IW, ID), new THREE.MeshStandardMaterial({ map: lt, transparent: true, roughness: 0.8, depthWrite: false }));
  lp.rotation.x = -Math.PI / 2; lp.position.set(IW / 2, T.top_z + 0.05, ID / 2); lp.receiveShadow = true; tray.add(lp);
  // START HERE card in its tile
  const qrCell = layout.top_layer.find((c) => c.kind === "qr");
  const qrImg = new Image(); qrImg.src = BASE + "qr-kit.png";
  await new Promise((r) => { qrImg.onload = r; qrImg.onerror = r; });
  const card = canvasTex(600, 600, (g, w, h) => {
    g.fillStyle = "#f4f2ed"; g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = false; if (qrImg.width) g.drawImage(qrImg, 90, 40, 420, 420);
    g.fillStyle = "#101012"; g.textAlign = "center"; g.font = '700 54px Bahnschrift, sans-serif'; g.fillText("START HERE", w / 2, 535);
  });
  const [qx, qz, qw, qd] = qrCell.pocket;
  const cm = new THREE.Mesh(new THREE.BoxGeometry(qw - 1, 0.6, qd - 1), [mat("white"), mat("white"), new THREE.MeshStandardMaterial({ map: card, roughness: 0.6 }), mat("white"), mat("white"), mat("white")]);
  cm.position.set(qx + qw / 2, T.top_z - 2 + 0.3, qz + qd / 2); add(cm, tray);

  // boards (Draco, vertex colours; uv.x = board index -> hover lift in the shader)
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
    g.setAttribute("aBoard", g.getAttribute("uv"));
    g.deleteAttribute("uv");
    const m = new THREE.Mesh(g, boardMats[p.cls]);
    m.castShadow = m.receiveShadow = true;           // baked at each pocket's own depth
    tray.add(m); res();
  }, undefined, rej))));
  draco.dispose();

  // pick volumes + hover frame
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  manifest.boards.forEach((b, i) => {
    const [x, z, w, d] = b.pocket;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 26, d + 10), pickMat);
    box.position.set(x + w / 2, T.top_z + 4, z + d / 2 + 3);
    box.userData.pick = { idx: i, id: b.id, name: b.name, chip: b.chip, href: `kit-${b.id.toLowerCase()}.html` };
    tray.add(box); v.pickables.push(box);
  });
  const frameTex = canvasTex(256, 256, (g, w, h) => { g.strokeStyle = "#5fe6ff"; g.lineWidth = 10; g.shadowColor = "#5fe6ff"; g.shadowBlur = 14; g.strokeRect(12, 12, w - 24, h - 24); });
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: frameTex, transparent: true, depthWrite: false, toneMapped: false }));
  hl.rotation.x = -Math.PI / 2; hl.visible = false; tray.add(hl);
  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    hoverU.value = i;
    if (i >= 0) {
      const c = layout.top_layer.find((x) => x.id === manifest.boards[i].id);
      const [x, z, w, d] = c.cell;
      hl.scale.set(w - 2, d - 2, 1); hl.position.set(x + w / 2, T.top_z + 0.2, z + d / 2); hl.visible = true;
    } else hl.visible = false;
    v.updateShadows();
  }
  // bottom-layer picks (no page, just a name) once the tray is lifted
  const bottomPicks = [
    [benchG, { name: "ESP32 DevKit on the breadboard", chip: "ESP32-WROOM-32 · 830 points · 9 V power module" }],
    [bat, { name: "9 V battery", chip: "Plugs into the power module: no USB needed" }],
    [r1, { name: "Jumper wires", chip: "40 male-female + 20 male-male" }],
  ].map(([o, p]) => {
    const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y + 6, s.z), pickMat);
    m.position.copy(kit.worldToLocal(c.clone())); m.userData.pick = p; kit.add(m);
    return m;
  });

  // ---- lid, leaning on the back of the box with its artwork toward the viewer
  const [lidTex, lidFront] = await Promise.all([tex(BASE + "lid-top.webp"), tex(BASE + "lid-front.webp")]);
  const [LW, LD, LH] = layout.lid.outer;
  const lid = new THREE.Group();
  const lidTop = lidTex ? new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.55 }) : boxMat;
  const lidBox = new THREE.Mesh(new RoundedBoxGeometry(LW, LH, LD, 2, 1.4), [boxMat, boxMat, lidTop, boxMat, boxMat, boxMat]);
  lidBox.position.set(0, -LH / 2, LD / 2);           // top face at local y = 0, panel runs along +z from the hinge
  lid.add(lidBox);
  const lean = THREE.MathUtils.degToRad(72);
  lid.rotation.x = lean;                              // top face tilts up toward the viewer, the shell sits behind
  lid.position.set(IW / 2, LD * Math.sin(lean), -WALL - 10 - LD * Math.cos(lean));
  add(lid);

  // ---- camera, lift animation
  const all = new THREE.Box3().setFromObject(kit);
  const home = v.frameObject(all, new THREE.Vector3(0.12, 1.25, 0.95), COARSE ? 0.86 : 0.74);
  const lowBox = new THREE.Box3().setFromObject(benchG).expandByObject(bat).expandByObject(r1).expandByObject(r2);
  const low = v.frameObject(lowBox, new THREE.Vector3(0.1, 1.5, 0.95), COARSE ? 0.9 : 0.78);
  v.goHome(home);
  function glide(to) {
    const p0 = v.camera.position.clone(), t0 = v.controls.target.clone();
    v.controls.minDistance = Math.min(home.min, to.min); v.controls.maxDistance = Math.max(home.max, to.max);
    v.animate(1100, (u) => { const k = ease(u); v.camera.position.lerpVectors(p0, to.position, k); v.controls.target.lerpVectors(t0, to.target, k); });
  }
  v.renderer.domElement.addEventListener("dblclick", () => v.goHome(home));
  let lifted = false;
  const btn = ui.querySelector("[data-lift]");
  btn.addEventListener("click", () => {
    lifted = !lifted;
    btn.textContent = lifted ? "Put the tray back" : "Lift the tray";
    v.pickables.length = 0;
    const from = { y: tray.position.y, z: tray.position.z, r: tray.rotation.x };
    const to = lifted ? { y: 120, z: -150, r: THREE.MathUtils.degToRad(-28) } : { y: 0, z: 0, r: 0 };
    glide(lifted ? low : home);
    v.animate(1100, (u) => {
      const k = ease(u);
      tray.position.y = from.y + (to.y - from.y) * k; tray.position.z = from.z + (to.z - from.z) * k; tray.rotation.x = from.r + (to.r - from.r) * k;
    }, () => {
      if (lifted) bottomPicks.forEach((m) => v.pickables.push(m));
      else tray.children.forEach((m) => { if (m.userData.pick) v.pickables.push(m); });
    });
  });
  v.updateShadows();
  fig.classList.add("is-live");

  // local only: /kit.html?poster saves the poster images from this exact scene to the render server
  if (location.hostname === "localhost" && new URLSearchParams(location.search).has("poster")) {
    const shot = async (name) => {
      v.renderer.setPixelRatio(2.5); v.resize();
      v.controls.update(); v.renderer.shadowMap.needsUpdate = true; v.renderer.render(v.scene, v.camera);
      const blob = await new Promise((r) => v.renderer.domElement.toBlob(r, "image/png"));
      await fetch("http://localhost:8790/save?name=" + name + ".png", { method: "POST", body: blob });
    };
    await shot("poster-open");
    lid.rotation.x = 0;
    lid.position.set(IW / 2, OH + 0.6, -WALL - (LD - OD) / 2);
    const closedBox = new THREE.Box3().setFromObject(lid).expandByObject(floor);
    v.goHome(v.frameObject(closedBox, new THREE.Vector3(-0.75, 0.62, 1.0), 1.05));
    await shot("poster-closed");
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
