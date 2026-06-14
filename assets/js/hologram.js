/* =================================================================
   hologram.js — spinning wireframe holograms (no libraries)
   -----------------------------------------------------------------
   Replaces flat product images on the home page with slowly
   rotating, blue wireframe "holograms" of aircraft and robotic
   arms — drawn entirely with the 2D canvas (procedural geometry +
   a hand-rolled perspective projection). In the spirit of
   hero-canvas.js: pure canvas, restrained, depth-cued.

   Public API (called by main.js after cards render):
     window.BBTHolograms.mount()   // scan DOM, animate any <canvas data-holo>

   Each <canvas data-holo="evtol|arm|drone"> becomes one hologram.
   Degrades to a single static frame on prefers-reduced-motion.
   ================================================================= */
(function () {
  "use strict";

  /* ---------------- geometry primitives ----------------
     Every builder returns { v: [[x,y,z]...], e: [[i,j]...] }.
     Models are authored around the origin, roughly within a unit
     sphere; the renderer scales them to the canvas. */

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

  // Short tube along Y: two rings + vertical struts.
  function makeCylinderY(cx, cy, cz, r, len, seg) {
    const top = makeRing(cx, cy + len / 2, cz, r, seg, "y");
    const bot = makeRing(cx, cy - len / 2, cz, r, seg, "y");
    const parts = merge([top, bot]);
    for (let i = 0; i < seg; i++) parts.e.push([i, i + seg]);
    return parts;
  }

  // A capsule/segment box spanning two 3D joints (used for arm links).
  function segBox(p0, p1, thick) {
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy, p1[2] - p0[2]) || 0.001;
    const ang = Math.atan2(dx, dy); // angle of the link off +Y
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

  // Holographic projector base: a ground ring + crosshair spokes.
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

  // Lofted tube: a chain of rings (in XY, perpendicular to Z) joined by
  // longerons — used for smoothly tapered fuselage bodies.
  function makeLoft(stations, seg) {
    const rings = stations.map((s) => makeRing(s.cx || 0, s.cy || 0, s.z, s.r, seg, "z"));
    const m = merge(rings);
    for (let s = 0; s < stations.length - 1; s++) {
      for (let i = 0; i < seg; i++) m.e.push([s * seg + i, (s + 1) * seg + i]);
    }
    return m;
  }

  // Short cylindrical joint housing along Z (a pivot knuckle).
  function makeKnuckle(cx, cy, cz, r, len, seg) {
    const a = makeRing(cx, cy, cz - len / 2, r, seg, "z");
    const b = makeRing(cx, cy, cz + len / 2, r, seg, "z");
    const m = merge([a, b]);
    for (let i = 0; i < seg; i++) m.e.push([i, i + seg]);
    return m;
  }

  /* ---------------- models ---------------- */

  // eVTOL aircraft — tilt-rotor lift config (a nod to Tyler's day job).
  function buildEvtol() {
    const parts = [];
    // lofted fuselage, nose -> tail
    parts.push(makeLoft([
      { z: 0.92, cy: -0.02, r: 0.015 },
      { z: 0.74, cy: -0.04, r: 0.10 },
      { z: 0.45, cy: -0.02, r: 0.16 },
      { z: 0.05, cy: 0.00, r: 0.18 },
      { z: -0.35, cy: 0.02, r: 0.14 },
      { z: -0.70, cy: 0.05, r: 0.06 },
      { z: -0.86, cy: 0.06, r: 0.02 },
    ], 8));
    // cockpit canopy ridge
    parts.push({ v: [[0, 0.13, 0.52], [0, 0.14, 0.2], [0, 0.1, 0.0]], e: [[0, 1], [1, 2]] });
    // main wing + ribs + spar
    parts.push(makeBox(0, 0.03, 0.12, 2.0, 0.05, 0.34));
    const ribs = { v: [], e: [] };
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const x = i * 0.3, k = ribs.v.length;
      ribs.v.push([x, 0.055, -0.05], [x, 0.005, -0.05], [x, 0.055, 0.29], [x, 0.005, 0.29]);
      ribs.e.push([k, k + 1], [k + 2, k + 3], [k, k + 2], [k + 1, k + 3]);
    }
    parts.push(ribs);
    parts.push({ v: [[-1.0, 0.03, 0.12], [1.0, 0.03, 0.12]], e: [[0, 1]] }); // spar
    // V-tail
    parts.push(segBox([0, 0.06, -0.62], [0.42, 0.42, -0.7], 0.04));
    parts.push(segBox([0, 0.06, -0.62], [-0.42, 0.42, -0.7], 0.04));
    // 6 lift rotors: boom + nacelle + housing + hub, blades spin live
    const rotors = [
      [0.96, 0.42], [0.5, 0.44], [-0.5, 0.44], [-0.96, 0.42],
      [0.74, -0.5], [-0.74, -0.5],
    ];
    const spinners = [];
    for (const [x, z] of rotors) {
      parts.push(segBox([x, 0.02, 0.12], [x, 0.05, z], 0.05));   // boom
      parts.push(makeBox(x, 0.0, z, 0.08, 0.1, 0.18));           // nacelle
      parts.push(makeRing(x, 0.06, z, 0.24, 22, "y"));           // housing
      parts.push(makeRing(x, 0.06, z, 0.05, 8, "y"));            // hub
      spinners.push({ cx: x, cy: 0.07, cz: z, r: 0.21, blades: 5, speed: 9 });
    }
    // landing skids
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

  // Industrial robotic arm — posed, articulated in a plane.
  function buildArm() {
    const d2r = Math.PI / 180;
    const J0 = [0, -0.5, 0];
    const t1 = -14 * d2r, L1 = 0.72;
    const J1 = [J0[0] + Math.sin(t1) * L1, J0[1] + Math.cos(t1) * L1, 0];
    const t2 = 70 * d2r, L2 = 0.58;
    const J2 = [J1[0] + Math.sin(t2) * L2, J1[1] + Math.cos(t2) * L2, 0];
    const parts = [];
    parts.push(makeCylinderY(0, -0.82, 0, 0.38, 0.1, 20));  // base plate
    parts.push(makeCylinderY(0, -0.66, 0, 0.26, 0.22, 16)); // rotating turret
    // bolt ring on the base plate
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(makeRing(Math.cos(a) * 0.3, -0.77, Math.sin(a) * 0.3, 0.02, 5, "y"));
    }
    parts.push(makeKnuckle(J0[0], J0[1], 0, 0.14, 0.22, 12)); // shoulder pivot
    parts.push(segBox(J0, J1, 0.16));                          // upper arm
    parts.push(segBox([J0[0] + 0.12, J0[1], 0], [J1[0] + 0.06, J1[1] - 0.08, 0], 0.05)); // actuator
    parts.push(makeKnuckle(J1[0], J1[1], 0, 0.12, 0.2, 12));  // elbow pivot
    parts.push(segBox(J1, J2, 0.13));                          // forearm
    // cable routed over the forearm
    parts.push({
      v: [
        [J1[0] - 0.06, J1[1], 0.07],
        [(J1[0] + J2[0]) / 2, (J1[1] + J2[1]) / 2, 0.1],
        [J2[0] - 0.04, J2[1], 0.06],
      ],
      e: [[0, 1], [1, 2]],
    });
    parts.push(makeKnuckle(J2[0], J2[1], 0, 0.08, 0.14, 10)); // wrist
    // two-knuckle gripper fingers
    const gx = Math.sin(t2), gy = Math.cos(t2);
    const px = -gy, py = gx; // in-plane perpendicular
    for (const s of [1, -1]) {
      const base = [J2[0] + px * 0.06 * s, J2[1] + py * 0.06 * s, 0];
      const mid = [base[0] + gx * 0.16, base[1] + gy * 0.16, 0];
      const tip = [mid[0] + (gx * 0.6 + px * 0.4 * s) * 0.16, mid[1] + (gy * 0.6 + py * 0.4 * s) * 0.16, 0];
      parts.push(segBox(base, mid, 0.04));
      parts.push(segBox(mid, tip, 0.03));
    }
    parts.push(makeBase(-0.92, 0.95));
    const m = merge(parts);
    m.spinners = [];
    return m;
  }

  // Quad-drone — central body, four arms, four rotor discs.
  function buildDrone() {
    const parts = [];
    parts.push(makeBox(0, 0, 0, 0.46, 0.16, 0.46));      // body
    parts.push(makeBox(0, 0.12, 0.02, 0.3, 0.12, 0.3));  // canopy
    parts.push({ v: [[-0.18, 0.085, 0], [0.18, 0.085, 0], [0, 0.085, -0.18], [0, 0.085, 0.18]], e: [[0, 1], [2, 3]] }); // deck lines
    const arms = [[0.82, 0.82], [-0.82, 0.82], [-0.82, -0.82], [0.82, -0.82]];
    const spinners = [];
    for (const [x, z] of arms) {
      parts.push(segBox([x * 0.25, 0, z * 0.25], [x, 0.04, z], 0.05)); // arm
      parts.push(makeBox(x, 0.06, z, 0.1, 0.1, 0.1));                  // motor can
      parts.push(makeRing(x, 0.1, z, 0.34, 24, "y"));                  // prop guard
      parts.push(makeRing(x, 0.1, z, 0.05, 6, "y"));                   // hub
      spinners.push({ cx: x, cy: 0.11, cz: z, r: 0.3, blades: 2, speed: 14 });
      parts.push(segBox([x * 0.6, -0.06, z * 0.6], [x * 0.72, -0.4, z * 0.72], 0.025)); // leg
    }
    parts.push({ v: [[-0.55, -0.4, 0.55], [0.55, -0.4, 0.55]], e: [[0, 1]] }); // skid
    parts.push({ v: [[-0.55, -0.4, -0.55], [0.55, -0.4, -0.55]], e: [[0, 1]] });
    // camera gimbal under the nose
    parts.push(makeBox(0, -0.14, 0.18, 0.14, 0.1, 0.12));
    parts.push(makeRing(0, -0.16, 0.25, 0.05, 10, "z")); // lens
    // antenna
    parts.push({ v: [[-0.2, 0.08, -0.2], [-0.24, 0.34, -0.24]], e: [[0, 1]] });
    parts.push(makeRing(-0.24, 0.35, -0.24, 0.02, 6, "y"));
    parts.push(makeBase(-0.55, 1.1));
    const m = merge(parts);
    m.spinners = spinners;
    return m;
  }

  const MODELS = { evtol: buildEvtol, arm: buildArm, drone: buildDrone };
  // Per-model holographic tint (rgb triplets).
  const TINTS = {
    evtol: [96, 178, 255],
    arm: [86, 140, 255],
    drone: [120, 162, 255],
  };

  /* ---------------- a single hologram instance ---------------- */
  function createHologram(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const type = canvas.getAttribute("data-holo") || "evtol";
    const model = (MODELS[type] || buildEvtol)();
    const tint = TINTS[type] || TINTS.evtol;
    const rgb = tint.join(",");

    let w = 0, h = 0, dpr = 1, scale = 1, cx = 0, cy = 0;
    let raf = 0, t = 0, angY = type === "arm" ? -0.6 : 0.4;
    const tilt = -0.42;              // look slightly down on the model
    const viewerDist = 3.4;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      w = rect.width; h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scale = Math.min(w, h) * 0.36;
      cx = w / 2;
      cy = h / 2 + h * 0.04;
    }

    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    function project(x, y, z, ca, sa) {
      // rotate about Y
      const X = x * ca + z * sa;
      let Z = -x * sa + z * ca;
      const Y = y;
      // tilt about X
      const Y2 = Y * cosT - Z * sinT;
      const Z2 = Y * sinT + Z * cosT;
      const f = viewerDist / (viewerDist + Z2); // perspective foreshortening
      return [cx + X * f * scale, cy - Y2 * f * scale, f];
    }

    function render() {
      ctx.clearRect(0, 0, w, h);
      const ca = Math.cos(angY), sa = Math.sin(angY);

      // subtle hologram flicker
      const flicker = reduce ? 1 : 0.86 + 0.14 * Math.sin(t * 7.0) * Math.sin(t * 2.3);

      // project every vertex once
      const pv = model.v;
      const proj = new Array(pv.length);
      let fmin = Infinity, fmax = -Infinity;
      for (let i = 0; i < pv.length; i++) {
        const p = project(pv[i][0], pv[i][1], pv[i][2], ca, sa);
        proj[i] = p;
        if (p[2] < fmin) fmin = p[2];
        if (p[2] > fmax) fmax = p[2];
      }
      const fspan = fmax - fmin || 1;

      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${rgb},0.9)`;

      // edges — brightness & glow cued by depth
      for (let i = 0; i < model.e.length; i++) {
        const a = proj[model.e[i][0]], b = proj[model.e[i][1]];
        const depth = ((a[2] + b[2]) / 2 - fmin) / fspan; // 0 far .. 1 near
        const alpha = (0.18 + depth * 0.62) * flicker;
        ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.7 + depth * 0.9;
        ctx.shadowBlur = 6 + depth * 8;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }

      // vertex nodes — faint glowing points
      ctx.shadowBlur = 6;
      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        const depth = (p[2] - fmin) / fspan;
        ctx.fillStyle = `rgba(${rgb},${(0.25 + depth * 0.5) * flicker})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 0.7 + depth * 1.0, 0, Math.PI * 2);
        ctx.fill();
      }

      // spinning rotor blades — drawn live so the props actually turn
      const spinners = model.spinners || [];
      if (spinners.length) {
        const spin = reduce ? 0 : t;
        ctx.shadowBlur = 8;
        for (let s = 0; s < spinners.length; s++) {
          const sp = spinners[s];
          const hub = project(sp.cx, sp.cy, sp.cz, ca, sa);
          for (let b = 0; b < sp.blades; b++) {
            const ba = spin * sp.speed + (b / sp.blades) * Math.PI * 2;
            const pe = project(sp.cx + Math.cos(ba) * sp.r, sp.cy, sp.cz + Math.sin(ba) * sp.r, ca, sa);
            const depth = Math.max(0, Math.min(1, (pe[2] - fmin) / fspan));
            ctx.strokeStyle = `rgba(${rgb},${((0.28 + depth * 0.5) * flicker).toFixed(3)})`;
            ctx.lineWidth = 0.8 + depth * 0.8;
            ctx.beginPath();
            ctx.moveTo(hub[0], hub[1]);
            ctx.lineTo(pe[0], pe[1]);
            ctx.stroke();
          }
        }
      }
      ctx.shadowBlur = 0;
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      t += 0.016;
      angY += 0.0065;
      render();
    }

    function start() { if (!raf && !reduce) raf = requestAnimationFrame(loop); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    resize();
    render();
    window.addEventListener("resize", resize, { passive: true });

    return { canvas, start, stop, reduce };
  }

  /* ---------------- mount / lifecycle ---------------- */
  const instances = new Map();

  function mount() {
    const nodes = document.querySelectorAll("canvas[data-holo]");
    nodes.forEach((c) => {
      if (instances.has(c)) return;
      const inst = createHologram(c);
      if (!inst) return;
      instances.set(c, inst);
      if (inst.reduce) return; // static frame only — no motion
      // Spin only while the pointer is hovering the card media.
      const hot = c.closest(".card__media") || c;
      hot.addEventListener("pointerenter", () => inst.start());
      hot.addEventListener("pointerleave", () => inst.stop());
    });
  }

  window.BBTHolograms = { mount };
})();
