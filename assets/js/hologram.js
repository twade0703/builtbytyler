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

  // NEMO camera arm — a 2040 extrusion rail base + a live 3-joint arm
  // (shoulder, elbow, wrist) that sweeps up & down, camera at the end.
  function buildArm() {
    const parts = [];
    // 2040 aluminium extrusion rail base (two side rails + cross beams)
    parts.push(makeBox(-0.3, -0.9, 0, 0.14, 0.08, 0.94));   // left rail
    parts.push(makeBox(0.3, -0.9, 0, 0.14, 0.08, 0.94));    // right rail
    parts.push(makeBox(0, -0.9, 0.42, 0.74, 0.08, 0.12));   // front cross beam
    parts.push(makeBox(0, -0.9, -0.42, 0.74, 0.08, 0.12));  // rear cross beam
    parts.push({ v: [[-0.3, -0.86, -0.47], [-0.3, -0.86, 0.47]], e: [[0, 1]] }); // T-slot line
    parts.push({ v: [[0.3, -0.86, -0.47], [0.3, -0.86, 0.47]], e: [[0, 1]] });   // T-slot line
    parts.push(makeBox(0, -0.82, 0, 0.4, 0.08, 0.42));      // carriage on the rails
    parts.push(makeCylinderY(0, -0.67, 0, 0.24, 0.2, 14));  // rotating turret
    parts.push(makeKnuckle(0, -0.52, 0, 0.14, 0.22, 12));   // shoulder pivot housing
    parts.push(makeBase(-0.98, 1.0));
    const m = merge(parts);
    m.spinners = [];
    // Live articulated arm (3 joints) — drawn in render() so it sweeps up
    // and down on its servos. Camera mounted at the end effector.
    m.dynamic = function (time) {
      const base = [0, -0.52, 0], L = [0.58, 0.48, 0.32];
      const swp = Math.sin(time * 0.8);
      const rel = [
        -0.15 + swp * 0.45,                        // shoulder raises/lowers
        1.05 - swp * 0.35,                         // elbow flexes
        -0.55 + Math.sin(time * 0.8 + 0.8) * 0.22, // wrist (the added joint)
      ];
      let dir = 0, x = base[0], y = base[1];
      const J = [[x, y, 0]];
      for (let i = 0; i < 3; i++) {
        dir += rel[i];
        x += Math.sin(dir) * L[i];
        y += Math.cos(dir) * L[i];
        J.push([x, y, 0]);
      }
      const segs = [];
      // a chunky rectangular box-beam between two in-plane joints
      function beam(a, b, w) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len; // in-plane perpendicular
        const cor = (p) => [
          [p[0] + px * w, p[1] + py * w, w], [p[0] - px * w, p[1] - py * w, w],
          [p[0] - px * w, p[1] - py * w, -w], [p[0] + px * w, p[1] + py * w, -w],
        ];
        const A = cor(a), B = cor(b);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          segs.push([A[i][0], A[i][1], A[i][2], A[j][0], A[j][1], A[j][2], 1.1]);
          segs.push([B[i][0], B[i][1], B[i][2], B[j][0], B[j][1], B[j][2], 1.1]);
          segs.push([A[i][0], A[i][1], A[i][2], B[i][0], B[i][1], B[i][2], 1.4]);
        }
      }
      // pivot knuckle housing (a short cylinder along z) at a joint
      function knuckle(c, rk) {
        const seg = 10, zf = 0.075, ring = [];
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          ring.push([c[0] + Math.cos(a) * rk, c[1] + Math.sin(a) * rk]);
        }
        for (let i = 0; i < seg; i++) {
          const j = (i + 1) % seg;
          segs.push([ring[i][0], ring[i][1], zf, ring[j][0], ring[j][1], zf, 1]);
          segs.push([ring[i][0], ring[i][1], -zf, ring[j][0], ring[j][1], -zf, 1]);
          segs.push([ring[i][0], ring[i][1], zf, ring[i][0], ring[i][1], -zf, 1]);
        }
      }
      const lw = [0.075, 0.058, 0.044];
      for (let i = 0; i < 3; i++) beam(J[i], J[i + 1], lw[i]);
      knuckle(J[0], 0.11);  // shoulder
      knuckle(J[1], 0.09);  // elbow
      knuckle(J[2], 0.062); // wrist
      // hydraulic actuator strut alongside the upper arm
      beam([J[0][0] + 0.11, J[0][1], 0], [(J[1][0] + J[2][0]) / 2, (J[1][1] + J[2][1]) / 2, 0], 0.022);
      // camera at the end effector (box + lens), points +z
      const e = J[3], bw = 0.1, bh = 0.08, z0 = -0.05, z1 = 0.14;
      const C = [
        [e[0] - bw, e[1] - bh, z0], [e[0] + bw, e[1] - bh, z0], [e[0] + bw, e[1] + bh, z0], [e[0] - bw, e[1] + bh, z0],
        [e[0] - bw, e[1] - bh, z1], [e[0] + bw, e[1] - bh, z1], [e[0] + bw, e[1] + bh, z1], [e[0] - bw, e[1] + bh, z1],
      ];
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
        .forEach(([i, j]) => segs.push([C[i][0], C[i][1], C[i][2], C[j][0], C[j][1], C[j][2], 1.1]));
      const lz = z1 + 0.07, lr = 0.06, ls = 10;
      for (let i = 0; i < ls; i++) {
        const a0 = (i / ls) * Math.PI * 2, a1 = ((i + 1) / ls) * Math.PI * 2;
        segs.push([e[0] + Math.cos(a0) * lr, e[1] + Math.sin(a0) * lr, lz, e[0] + Math.cos(a1) * lr, e[1] + Math.sin(a1) * lr, lz, 1.1]);
      }
      return { segments: segs, dots: [] };
    };
    return m;
  }

  // Quad FPV racer — pointed body + rocket-style pointed nacelle pods on
  // each motor, prop guards and live spinning props.
  function buildDrone() {
    const parts = [];
    // central body + canopy
    parts.push(makeBox(0, 0, 0, 0.42, 0.16, 0.4));
    parts.push(makeBox(0, 0.12, -0.03, 0.26, 0.12, 0.24));
    // pointed nose (FPV) with a camera pod at the tip
    [[-0.13, 0.06], [0.13, 0.06], [-0.13, -0.06], [0.13, -0.06]].forEach(([x, y]) =>
      parts.push({ v: [[x, y, 0.2], [0, 0.0, 0.44]], e: [[0, 1]] }));
    parts.push(makeBox(0, 0.05, 0.32, 0.12, 0.12, 0.08));   // camera pod
    parts.push(makeRing(0, 0.05, 0.4, 0.045, 8, "z"));       // lens

    const arms = [[0.8, 0.8], [-0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]];
    const spinners = [];
    for (const [x, z] of arms) {
      parts.push(segBox([x * 0.22, 0, z * 0.22], [x, 0.0, z], 0.06));  // beefy arm
      // pointed nacelle pod: cylinder body + cone tip below (rocket-like)
      const r = 0.085;
      parts.push(makeCylinderY(x, 0.02, z, r, 0.2, 10));               // pod body (y -0.08..0.12)
      parts.push(makeRing(x, -0.08, z, r, 10, "y"));                   // cone base ring
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        parts.push({ v: [[x + Math.cos(a) * r, -0.08, z + Math.sin(a) * r], [x, -0.32, z]], e: [[0, 1]] });
      }
      // motor + prop guard + hub (props spin live)
      parts.push(makeCylinderY(x, 0.15, z, 0.05, 0.06, 8));
      parts.push(makeRing(x, 0.2, z, 0.32, 24, "y"));
      parts.push(makeRing(x, 0.2, z, 0.05, 6, "y"));
      spinners.push({ cx: x, cy: 0.21, cz: z, r: 0.28, blades: 2, speed: 14 });
    }
    parts.push(makeBase(-0.5, 1.1));
    const m = merge(parts);
    m.spinners = spinners;
    return m;
  }

  // Handheld ESP32 transmitter — a hand-radio body with an OLED, a
  // round Morse key, function buttons, a tuning knob and an antenna.
  function buildTransmitter() {
    const parts = [];
    // main handheld body + raised front bezel
    parts.push(makeBox(0, 0, 0, 0.52, 1.0, 0.24));
    parts.push(makeBox(0, 0.04, 0.13, 0.42, 0.86, 0.02));
    // OLED screen (upper front) + inner frame
    parts.push(makeBox(0, 0.26, 0.14, 0.32, 0.22, 0.015));
    parts.push(makeBox(0, 0.26, 0.145, 0.26, 0.16, 0.006));
    // speaker grille above the screen
    for (let i = -1; i <= 1; i++) parts.push(makeRing(i * 0.08, 0.43, 0.14, 0.02, 6, "z"));
    // round Morse key (raised), centre-lower
    parts.push(makeRing(0, -0.10, 0.14, 0.12, 16, "z"));
    parts.push(makeRing(0, -0.10, 0.17, 0.06, 12, "z"));
    parts.push({ v: [[0, -0.10, 0.17], [0, -0.10, 0.14]], e: [[0, 1]] }); // key stem
    // 2×2 function buttons below the key
    for (const x of [-0.12, 0.12]) for (const y of [-0.34, -0.46]) parts.push(makeBox(x, y, 0.135, 0.08, 0.06, 0.02));
    // side push-to-talk key
    parts.push(makeBox(0.27, 0.16, 0, 0.02, 0.18, 0.08));
    // tuning knob on top
    parts.push(makeCylinderY(0.16, 0.56, 0, 0.06, 0.08, 12));
    // antenna (collar → mast → tip) on the top-left
    parts.push(makeRing(-0.16, 0.52, 0, 0.05, 10, "y"));
    parts.push(segBox([-0.16, 0.52, 0], [-0.20, 0.98, 0], 0.022));
    parts.push(makeRing(-0.20, 0.99, 0, 0.03, 8, "y"));
    // projector base (matches the other holograms)
    parts.push(makeBase(-0.62, 0.85));
    const m = merge(parts);
    m.spinners = [];
    return m;
  }

  // Raspberry Pi laser tracking turret — a Pi base board, a pan servo,
  // a tilt yoke, a laser barrel with a tracking camera, and a beam out
  // to a downrange target reticle (it aims down targets).
  function buildTurret() {
    const parts = [];

    // Raspberry Pi base board + detail
    parts.push(makeBox(0, -0.6, 0, 0.92, 0.05, 0.66));         // board
    parts.push(makeBox(-0.28, -0.55, -0.26, 0.5, 0.04, 0.05)); // GPIO header
    parts.push(makeBox(0.06, -0.55, 0.06, 0.18, 0.05, 0.18));  // SoC
    parts.push(makeBox(0.36, -0.55, 0.2, 0.12, 0.09, 0.16));   // USB stack
    parts.push(makeBox(0.36, -0.55, -0.08, 0.12, 0.07, 0.12)); // ethernet
    parts.push(makeBox(-0.44, -0.56, 0.22, 0.05, 0.05, 0.1));  // USB-C power
    [[-0.4, -0.26], [0.4, -0.26], [-0.4, 0.26], [0.4, 0.26]].forEach(([x, z]) =>
      parts.push(makeRing(x, -0.575, z, 0.022, 6, "y")));       // mounting holes

    // Pan servo (base rotation) + output disc
    parts.push(makeBox(0, -0.44, 0, 0.24, 0.22, 0.2));
    parts.push(makeRing(0, -0.32, 0, 0.1, 14, "y"));
    parts.push(makeRing(0, -0.32, 0, 0.04, 8, "y"));

    // Rotating platform + tilt yoke (two upright arms)
    parts.push(makeBox(0, -0.29, 0, 0.34, 0.03, 0.22));
    const armX = 0.17;
    [-1, 1].forEach((s) => parts.push(makeBox(s * armX, -0.04, 0, 0.05, 0.34, 0.14)));
    parts.push(makeBox(0, 0.06, 0, armX * 2, 0.04, 0.04));     // tilt pivot rod
    [-1, 1].forEach((s) => parts.push(makeRing(s * armX, 0.06, 0, 0.05, 10, "x"))); // bearings
    parts.push(makeBox(-armX - 0.08, 0.0, 0, 0.1, 0.16, 0.12)); // tilt servo

    // (the barrel, camera and laser are drawn live in render() — the
    //  cylinder tilts on its servo and the beam fires along its axis)

    parts.push(makeBase(-0.68, 0.95));
    const m = merge(parts);
    m.spinners = [];
    // Live laser barrel: tilts about the yoke pivot (the tilt servo); the
    // beam is fired straight down the barrel axis, so it moves WITH the
    // cylinder — just like the real hardware.
    m.dynamic = function (time) {
      const tilt = Math.sin(time * 0.7) * 0.5;     // tilt servo (pitch up/down)
      const Ty = 0.06, ct = Math.cos(tilt), st = Math.sin(tilt);
      const tf = (x, y, z) => { const ry = y - Ty, rz = z; return [x, Ty + ry * ct - rz * st, ry * st + rz * ct]; };
      const segs = [];
      const ringZ = (zc, r, seg, w) => {
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
          const p0 = tf(Math.cos(a0) * r, Ty + Math.sin(a0) * r, zc);
          const p1 = tf(Math.cos(a1) * r, Ty + Math.sin(a1) * r, zc);
          segs.push([p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], w]);
        }
      };
      // barrel tube — rear + front rings joined by stringers
      const segc = 12, rB = 0.07, rear = [], front = [];
      for (let i = 0; i < segc; i++) {
        const a = (i / segc) * Math.PI * 2;
        rear.push(tf(Math.cos(a) * rB, Ty + Math.sin(a) * rB, 0.04));
        front.push(tf(Math.cos(a) * rB, Ty + Math.sin(a) * rB, 0.44));
      }
      for (let i = 0; i < segc; i++) {
        const j = (i + 1) % segc;
        segs.push([rear[i][0], rear[i][1], rear[i][2], rear[j][0], rear[j][1], rear[j][2], 1.2]);
        segs.push([front[i][0], front[i][1], front[i][2], front[j][0], front[j][1], front[j][2], 1.2]);
        segs.push([rear[i][0], rear[i][1], rear[i][2], front[i][0], front[i][1], front[i][2], 1.2]);
      }
      ringZ(0.46, 0.05, 10, 1.2);  // emitter aperture
      // tracking camera beside the barrel
      const cw = 0.06, ch = 0.06, cX = 0.12, cyc = Ty + 0.02;
      const C = [
        [cX - cw, cyc - ch, 0.28], [cX + cw, cyc - ch, 0.28], [cX + cw, cyc + ch, 0.28], [cX - cw, cyc + ch, 0.28],
        [cX - cw, cyc - ch, 0.4], [cX + cw, cyc - ch, 0.4], [cX + cw, cyc + ch, 0.4], [cX - cw, cyc + ch, 0.4],
      ].map((c) => tf(c[0], c[1], c[2]));
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
        .forEach(([i, j]) => segs.push([C[i][0], C[i][1], C[i][2], C[j][0], C[j][1], C[j][2], 1]));
      // the laser beam — straight down the barrel axis to a target dot
      const o = tf(0, Ty, 0.46), tip = tf(0, Ty, 1.45);
      segs.push([o[0], o[1], o[2], tip[0], tip[1], tip[2], 1.7]);
      return { segments: segs, dots: [[tip[0], tip[1], tip[2], 3, 1]] };
    };
    return m;
  }

  // Sleek finned rocket — tapered body, pointed nose cone, four swept
  // fins, a porthole, and a flared engine bell.
  function buildRocket() {
    const parts = [];
    const R = 0.2, seg = 16;
    // body tube + detail rings
    parts.push(makeCylinderY(0, -0.1, 0, R, 1.0, seg)); // y: -0.6 → 0.4
    parts.push(makeRing(0, 0.12, 0, R, seg, "y"));
    parts.push(makeRing(0, -0.3, 0, R, seg, "y"));
    // nose cone — mid rings + struts to the tip
    parts.push(makeRing(0, 0.58, 0, 0.13, seg, "y"));
    parts.push(makeRing(0, 0.72, 0, 0.07, seg, "y"));
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      parts.push({ v: [[Math.cos(a) * R, 0.4, Math.sin(a) * R], [0, 0.9, 0]], e: [[0, 1]] });
    }
    // porthole
    parts.push(makeRing(0, 0.16, R, 0.045, 10, "z"));
    // four swept fins
    const fin = (th) => {
      const prof = [[R, -0.33], [0.42, -0.5], [0.47, -0.72], [R, -0.6]];
      const c = Math.cos(th), s = Math.sin(th);
      return { v: prof.map(([r, y]) => [r * c, y, r * s]), e: [[0, 1], [1, 2], [2, 3], [3, 0]] };
    };
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((t) => parts.push(fin(t)));
    // flared engine bell
    parts.push(makeRing(0, -0.6, 0, 0.1, 12, "y"));
    parts.push(makeRing(0, -0.86, 0, 0.22, 12, "y"));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push({ v: [[Math.cos(a) * 0.1, -0.6, Math.sin(a) * 0.1], [Math.cos(a) * 0.22, -0.86, Math.sin(a) * 0.22]], e: [[0, 1]] });
    }
    parts.push(makeBase(-0.96, 0.95));
    const m = merge(parts);
    m.spinners = [];
    return m;
  }

  const MODELS = { evtol: buildEvtol, arm: buildArm, drone: buildDrone, transmitter: buildTransmitter, turret: buildTurret, rocket: buildRocket };
  // Per-model holographic tint (rgb triplets) — cyan family to match the UI.
  const TINTS = {
    evtol: [86, 200, 255],
    arm: [80, 196, 255],
    drone: [110, 214, 255],
    transmitter: [95, 226, 255],
    turret: [90, 218, 255],
    rocket: [100, 224, 255],
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

      // live dynamic geometry — articulated arm, tilting servo barrel + laser.
      // model.dynamic(t) returns model-space segments + dots; we project them.
      const dyn = model.dynamic;
      if (dyn) {
        const gen = dyn(reduce ? 0 : t);
        const segs = gen.segments || [];
        ctx.shadowBlur = 9;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const a = project(s[0], s[1], s[2], ca, sa);
          const b = project(s[3], s[4], s[5], ca, sa);
          const depth = Math.max(0, Math.min(1, ((a[2] + b[2]) / 2 - fmin) / fspan));
          ctx.strokeStyle = `rgba(${rgb},${((0.4 + depth * 0.5) * flicker).toFixed(3)})`;
          ctx.lineWidth = s[6] || 1.4;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
        const dots = gen.dots || [];
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          const pp = project(d[0], d[1], d[2], ca, sa);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(pp[0], pp[1], d[3] || 3, 0, Math.PI * 2);
          if (d[4]) { ctx.fillStyle = `rgba(${rgb},${flicker.toFixed(3)})`; ctx.fill(); }
          else { ctx.strokeStyle = `rgba(${rgb},${(0.7 * flicker).toFixed(3)})`; ctx.stroke(); }
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
