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

  // eVTOL tilt-rotor — the 6 rotors TILT from vertical (lift) to forward
  // (cruise) and back, spinning throughout: a live VTOL → wing-borne transition.
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
    // 6 rotors as [x, y, z]: four on the main wing, plus two on the TAIL — one
    // each side, mounted on nacelles at the V-tail tips. Booms are static; the
    // nacelles + rotors tilt live.
    const rotors = [
      [0.96, 0.06, 0.42], [0.5, 0.06, 0.44], [-0.5, 0.06, 0.44], [-0.96, 0.06, 0.42],
      [0.42, 0.42, -0.7], [-0.42, 0.42, -0.7],
    ];
    // wing rotors hang off booms; the tail rotors sit on the V-tail tips
    for (const [x, y, z] of rotors) {
      if (z > 0) parts.push(segBox([x, 0.02, 0.12], [x, y, z], 0.05)); // wing boom
    }
    // landing gear — two fore-aft skid tubes carried on inverted-V cross-arches
    // (helicopter-style: braced A-frames at the belly, not spindly legs)
    const ys = -0.34, xs = 0.24, sl = 0.62; // skid height, track half-width, length
    [-xs, xs].forEach((sx) => parts.push(makeBox(sx, ys, 0, 0.05, 0.05, sl))); // skid tubes
    [-0.26, 0.26].forEach((zc) => {
      parts.push(segBox([-xs, ys, zc], [0, -0.05, zc], 0.03));   // left arch leg
      parts.push(segBox([xs, ys, zc], [0, -0.05, zc], 0.03));    // right arch leg
      parts.push(makeBox(0, -0.05, zc, 0.16, 0.04, 0.05));       // belly mount
    });
    // fore-aft brace tube + upturned skid tips
    [-xs, xs].forEach((sx) => {
      parts.push({ v: [[sx, ys, -0.26], [sx, ys, 0.26]], e: [[0, 1]] });       // skid-line brace
      parts.push({ v: [[sx, ys, sl / 2], [sx, ys + 0.06, sl / 2 + 0.08]], e: [[0, 1]] }); // upturned tip
    });
    parts.push(makeBase(-0.92, 1.1));

    const m = merge(parts);
    m.spinners = [];
    // Every rotor tilts together: thrust axis sweeps +Y (lift) → +Z (cruise).
    m.dynamic = function (time) {
      const segs = [];
      const line = (a, b, lw) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], lw]);
      const tlt = (Math.sin(time * 0.35) * 0.5 + 0.5) * (Math.PI / 2); // 0 → full 90° (lift → cruise)
      const ct = Math.cos(tlt), st = Math.sin(tlt);
      const e1 = [1, 0, 0];        // disc axis 1 (spanwise, fixed)
      const e2 = [0, st, -ct];     // disc axis 2 (tilts with the nacelle)
      const axis = [0, ct, st];    // thrust axis: +Y (lift) → +Z (cruise)
      const spin = time * 6.5;
      for (const [x, y, z] of rotors) {
        const hub = [x, y, z];
        const ringAt = (cen, r, n) => {
          const pts = [];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
            pts.push([cen[0] + e1[0] * c + e2[0] * s, cen[1] + e1[1] * c + e2[1] * s, cen[2] + e1[2] * c + e2[2] * s]);
          }
          for (let i = 0; i < n; i++) line(pts[i], pts[(i + 1) % n], 1.1);
          return pts;
        };
        ringAt(hub, 0.24, 20);     // rotor housing (tilts)
        ringAt(hub, 0.05, 8);      // hub
        // nacelle — a short tube along the thrust axis
        const nb = [hub[0] - axis[0] * 0.12, hub[1] - axis[1] * 0.12, hub[2] - axis[2] * 0.12];
        const r1 = ringAt(nb, 0.07, 8), r2 = ringAt(hub, 0.07, 8);
        for (let i = 0; i < r1.length; i++) line(r1[i], r2[i], 1.1);
        // 5 spinning blades, in the (tilting) disc plane
        for (let b = 0; b < 5; b++) {
          const a = spin + (b / 5) * Math.PI * 2, c = Math.cos(a) * 0.21, s = Math.sin(a) * 0.21;
          line(hub, [hub[0] + e1[0] * c + e2[0] * s, hub[1] + e1[1] * c + e2[1] * s, hub[2] + e1[2] * c + e2[2] * s], 1.0);
        }
      }

      // ---- control surfaces reacting: ailerons (wing) + ruddervators (V-tail) ----
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (v) => { const m2 = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m2, v[1] / m2, v[2] / m2]; };
      // A control surface: a panel hinged along h0→h1 that deflects by `defl`.
      const surface = (h0, h1, chordDir, chordLen, defl) => {
        const u = norm([h1[0] - h0[0], h1[1] - h0[1], h1[2] - h0[2]]); // hinge axis
        const dp = chordDir[0] * u[0] + chordDir[1] * u[1] + chordDir[2] * u[2];
        const d0 = norm([chordDir[0] - u[0] * dp, chordDir[1] - u[1] * dp, chordDir[2] - u[2] * dp]);
        const ux = cross(u, d0), cd = Math.cos(defl), sd = Math.sin(defl);
        const d = [(d0[0] * cd + ux[0] * sd) * chordLen, (d0[1] * cd + ux[1] * sd) * chordLen, (d0[2] * cd + ux[2] * sd) * chordLen];
        const p = [h0, h1, [h1[0] + d[0], h1[1] + d[1], h1[2] + d[2]], [h0[0] + d[0], h0[1] + d[1], h0[2] + d[2]]];
        for (let i = 0; i < 4; i++) line(p[i], p[(i + 1) % 4], 1.1);
      };
      // ailerons — outboard wing trailing edge (z = -0.05), deflect oppositely (roll)
      const ail = Math.sin(time * 0.9) * 0.28;
      surface([0.5, 0.03, -0.05], [0.95, 0.03, -0.05], [0, 0, -1], 0.13, ail);
      surface([-0.5, 0.03, -0.05], [-0.95, 0.03, -0.05], [0, 0, -1], 0.13, -ail);
      // ruddervators — the two V-tail surfaces, deflecting gently
      surface([0, 0.06, -0.62], [0.42, 0.42, -0.7], [0, 0, -1], 0.16, Math.sin(time * 0.8) * 0.26);
      surface([0, 0.06, -0.62], [-0.42, 0.42, -0.7], [0, 0, -1], 0.16, Math.sin(time * 0.8 + 0.5) * 0.26);

      return { segments: segs, dots: [] };
    };
    return m;
  }

  // NEMO camera arm — the whole arm rides a LINEAR SLIDE base (two guide
  // rails + a leadscrew) for horizontal travel, on a RIGID pedestal, with a
  // live 3-joint arm (shoulder · elbow · wrist). 4 total DOF — the rail slide
  // plus the three joints — each animates independently to demo the range.
  // The base and camera are rigid (camera fixed to the wrist).
  function buildArm() {
    const parts = [];

    // ---- linear slide base: two guide rails + end mounts + central leadscrew ----
    const rx = 0.34, ry = -0.9, rlen = 1.08;
    parts.push(makeBox(-rx, ry, 0, 0.1, 0.1, rlen));              // left guide rail
    parts.push(makeBox(rx, ry, 0, 0.1, 0.1, rlen));               // right guide rail
    parts.push(makeBox(0, ry, rlen / 2, 0.86, 0.16, 0.1));        // front end mount
    parts.push(makeBox(0, ry, -rlen / 2, 0.86, 0.16, 0.1));       // rear end mount
    parts.push(makeBox(0, ry, -rlen / 2 - 0.1, 0.22, 0.22, 0.14)); // drive stepper
    parts.push(makeBox(0, ry, 0, 0.045, 0.045, rlen));            // central leadscrew
    parts.push({ v: [[-rx, ry + 0.05, -rlen / 2], [-rx, ry + 0.05, rlen / 2]], e: [[0, 1]] }); // rail top line
    parts.push({ v: [[rx, ry + 0.05, -rlen / 2], [rx, ry + 0.05, rlen / 2]], e: [[0, 1]] });
    parts.push(makeBase(-1.0, 1.06));

    const m = merge(parts);
    m.spinners = [];
    m.deploys = true; // parked/collapsed when idle; deploys + records on hover

    // Everything that MOVES — the carriage (rails) and the three joints — is
    // drawn live. The arm DEPLOYS from a parked, folded pose on hover, slides
    // on the rail, and the wrist swivel pans the camera as if recording someone.
    m.dynamic = function (time, deploy, spin, hoverT) {
      deploy = deploy == null ? 1 : deploy;
      spin = spin == null ? 0 : spin;                 // model's Y-rotation, for camera tracking
      hoverT = hoverT == null ? 99 : hoverT;          // time since hover began (big = already locked)
      const dep = deploy * deploy * (3 - 2 * deploy); // smoothstep the deploy 0..1
      const segs = [];
      const line = (a, b, lw) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], lw]);
      function box(cx, cy, cz, w, h, d, lw) {
        const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
        const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
        [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
          .forEach(([i, j]) => line(v[i], v[j], lw));
      }
      // a structural box-beam between two in-plane points a,b at depth cz
      function beam(a, b, w, cz, lw) {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const px = (-dy / len) * w, py = (dx / len) * w;
        const cor = (p) => [
          [p[0] + px, p[1] + py, cz + w], [p[0] - px, p[1] - py, cz + w],
          [p[0] - px, p[1] - py, cz - w], [p[0] + px, p[1] + py, cz - w],
        ];
        const A = cor(a), B = cor(b);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          line(A[i], A[j], lw); line(B[i], B[j], lw); line(A[i], B[i], lw);
        }
      }
      // joint knuckle — a short cylinder whose axis is along Z (the pivot axis)
      function knuckle(cx, cy, cz, r, lw) {
        const seg = 12, zf = 0.09;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
          const c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
          line([cx + c0, cy + s0, cz + zf], [cx + c1, cy + s1, cz + zf], lw);
          line([cx + c0, cy + s0, cz - zf], [cx + c1, cy + s1, cz - zf], lw);
          line([cx + c0, cy + s0, cz + zf], [cx + c0, cy + s0, cz - zf], lw);
        }
      }

      // ---- DOF 0: horizontal travel along the rails (only once deployed) ----
      const bz = Math.sin(time * 0.55) * 0.28 * dep; // carriage / arm-plane depth

      // carriage + the two bearing blocks that ride the guide rails
      box(0, -0.82, bz, 0.52, 0.1, 0.44, 1.2);
      box(-0.34, -0.88, bz, 0.18, 0.13, 0.32, 1.0);
      box(0.34, -0.88, bz, 0.18, 0.13, 0.32, 1.0);
      // RIGID base pedestal (no rotary base joint)
      box(0, -0.76, bz, 0.4, 0.06, 0.36, 1.1);
      box(0, -0.63, bz, 0.24, 0.26, 0.24, 1.2);

      // ---- DOF 1-3: three joints. They LERP from a parked, folded-down pose
      //      (dep=0) up to a lively "recording" sweep (dep=1) — the upward
      //      activation movement. ----
      const L = [0.44, 0.36, 0.28]; // shorter links — a more compact robot
      const ext = [
        -0.05 + Math.sin(time * 0.7) * 0.42,        // shoulder
         0.85 + Math.sin(time * 1.05 + 1.1) * 0.4,  // elbow
        -0.4 + Math.sin(time * 1.5 + 2.2) * 0.5,    // wrist
      ];
      const col = [0.7, 1.9, 1.7];                  // parked / folded-down pose
      const rel = [
        col[0] + (ext[0] - col[0]) * dep,
        col[1] + (ext[1] - col[1]) * dep,
        col[2] + (ext[2] - col[2]) * dep,
      ];
      let dir = 0, x = 0, y = -0.5;
      const J = [[x, y, bz]];
      for (let i = 0; i < 3; i++) { dir += rel[i]; x += Math.sin(dir) * L[i]; y += Math.cos(dir) * L[i]; J.push([x, y, bz]); }

      // structural beams — BEEFY, tapering toward the wrist (looks load-bearing)
      const bw = [0.11, 0.088, 0.066];
      for (let i = 0; i < 3; i++) beam(J[i], J[i + 1], bw[i], bz, 1.2);
      // stout diagonal brace off the base for rigidity
      beam([J[0][0], J[0][1] - 0.18], [J[1][0], J[1][1]], 0.03, bz, 1.0);
      // joint knuckles — chunky, wide base joint tapering up
      const kr = [0.2, 0.16, 0.13];
      for (let i = 0; i < 3; i++) knuckle(J[i][0], J[i][1], bz, kr[i], 1.1);

      // ---- wrist swivel camera head: once deployed it LOCKS onto the viewer
      //      as the robot spins around. It's a bit clumsy though — every so
      //      often it over-rotates ("trips"), wobbles, then catches itself and
      //      re-locks onto you. ----
      const e = J[3];
      knuckle(e[0], e[1], bz, 0.09, 1.1); // beefy swivel motor housing at the wrist
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (v) => { const m2 = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m2, v[1] / m2, v[2] / m2]; };
      // clumsy trip: a periodic over-rotation that decays back to a lock
      const trip = (time * 0.15) % 1;
      let wob = 0;
      if (trip < 0.32) { const q = trip / 0.32; wob = Math.sin(q * Math.PI * 2.4) * Math.exp(-q * 3.2) * 0.7; }
      // After deploying, the head LOOKS AROUND (~2s) hunting for the viewer's
      // POV, then locks on. lock 0 = searching, 1 = locked.
      const lock = Math.max(0, Math.min(1, (hoverT - 1.9) / 0.6));
      const lockS = lock * lock * (3 - 2 * lock);
      // Gaze yaw RELATIVE TO THE VIEWER: 0 = staring straight at them, π = away.
      // Search starts away (~π) and sweeps in; lock settles on 0 (+ the clumsy
      // over-rotate). Pitch tilts up to meet the viewer's eye once locked.
      const scanPitch = 0.15 + Math.sin(hoverT * 2.2 + 1.0) * 0.3;
      const searchGaze = Math.PI * Math.max(0, 1 - hoverT * 0.5) + Math.sin(hoverT * 3.0) * 1.1;
      const gaze = searchGaze * (1 - lockS) + (-wob) * lockS;
      const pitch = 0.408 * lockS + scanPitch * (1 - lockS);
      const ga = spin + gaze;
      // toward-viewer basis: f renders to -Z (at the camera) when gaze ≈ 0
      const fActive = [0.913 * Math.sin(ga), pitch, -0.913 * Math.cos(ga)];
      const fPark = [Math.sin(dir), Math.cos(dir), 0];
      const f = norm([
        fPark[0] * (1 - dep) + fActive[0] * dep,
        fPark[1] * (1 - dep) + fActive[1] * dep,
        fPark[2] * (1 - dep) + fActive[2] * dep,
      ]);
      let rgt = cross(f, [0, 1, 0]);
      if (Math.hypot(rgt[0], rgt[1], rgt[2]) < 0.001) rgt = [1, 0, 0];
      rgt = norm(rgt);
      const cup = cross(f, rgt);
      const O = [e[0], e[1], bz];
      // oriented point in the head's frame: forward d, right u, up v
      const P = (d, u, v) => [
        O[0] + f[0] * d + rgt[0] * u + cup[0] * v,
        O[1] + f[1] * d + rgt[1] * u + cup[1] * v,
        O[2] + f[2] * d + rgt[2] * u + cup[2] * v,
      ];
      // ---- chunky boxed sensor head (a camera module, not a thin barrel) ----
      const hw = 0.12, hh = 0.1, dB = 0.02, dF = 0.24;
      const bk = [P(dB, -hw, -hh), P(dB, hw, -hh), P(dB, hw, hh), P(dB, -hw, hh)];
      const fr = [P(dF, -hw, -hh), P(dF, hw, -hh), P(dF, hw, hh), P(dF, -hw, hh)];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; line(bk[i], bk[j], 1.2); line(fr[i], fr[j], 1.2); line(bk[i], fr[i], 1.2); }
      // main lens + a small secondary sensor on the front face
      const faceRing = (r, ou, ov) => {
        const seg = 12, pts = [];
        for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push(P(dF + 0.02, ou + Math.cos(a) * r, ov + Math.sin(a) * r)); }
        for (let i = 0; i < seg; i++) line(pts[i], pts[(i + 1) % seg], 1.1);
      };
      faceRing(0.062, -0.01, -0.015);  // main lens
      faceRing(0.028, 0.075, 0.05);    // secondary sensor (upper-right)
      line(P(0.1, 0, hh), P(0.1, 0, hh + 0.07), 1.0); // short antenna nub on top

      const lc = P(dF + 0.04, -0.01, -0.015); // glowing main lens centre
      return {
        segments: segs,
        // the lens "eye" brightens + grows as it locks on, so it clearly stares at you
        dots: [[lc[0], lc[1], lc[2], 2.4 + lockS * 1.5, 1]],
      };
    };
    return m;
  }

  // Quad FPV freestyle drone — a sleek faceted dart body with a stacked flight
  // controller, a strapped LiPo + XT60 up top, an FPV camera in the nose, two
  // bulb-tipped antennas, bell motors on a true-X arm set, live tri-blade props
  // and a blinking tail strobe.
  function buildDrone() {
    const parts = [];

    // ---- sleek dart body: top + bottom plates joined by side posts ----
    const fpW = 0.4, fpD = 0.86;         // footprint (x, z) — long, sleek body
    const yBot = -0.04, yTop = 0.10;     // bottom / top plate heights
    // sleek faceted dart body (top view, XZ): narrow nose, wide waist, tapered tail
    const plate = [
      [fpW * 0.26, fpD * 0.5], [fpW * 0.5, fpD * 0.12], [fpW * 0.5, -fpD * 0.2], [fpW * 0.26, -fpD * 0.5],
      [-fpW * 0.26, -fpD * 0.5], [-fpW * 0.5, -fpD * 0.2], [-fpW * 0.5, fpD * 0.12], [-fpW * 0.26, fpD * 0.5],
    ];
    const loopAt = (yy) => ({
      v: plate.map(([x, z]) => [x, yy, z]),
      e: plate.map((_, k) => [k, (k + 1) % plate.length]),
    });
    parts.push(loopAt(yBot)); // bottom plate
    parts.push(loopAt(yTop)); // top plate
    plate.forEach(([x, z]) => parts.push({ v: [[x, yBot, z], [x, yTop, z]], e: [[0, 1]] })); // side posts
    parts.push(makeBox(0, 0.0, 0, 0.2, 0.05, 0.2));                // FC / ESC stack
    parts.push(makeBox(0, 0.05, 0, 0.17, 0.03, 0.17));
    // LiPo battery strapped on top, wired to the FC via an XT60 plug
    parts.push(makeBox(0, yTop + 0.085, 0, 0.24, 0.11, 0.66));     // battery
    [-0.18, 0.18].forEach((sz) =>                                  // two hold-down straps over it
      parts.push(makeBox(0, yTop + 0.085, sz, 0.28, 0.13, 0.025)));
    parts.push(makeBox(0, yTop + 0.04, 0.26, 0.05, 0.05, 0.06));   // XT60 plug
    parts.push({ v: [[0, yTop + 0.04, 0.26], [0, yTop - 0.03, 0.18], [0, 0.04, 0.1]], e: [[0, 1], [1, 2]] }); // battery lead → FC
    parts.push(makeRing(0, yTop + 0.01, -fpD * 0.5 + 0.06, 0.03, 8, "y")); // tail strobe bezel

    // ---- FPV camera set INTO the front of the body; only the lens shows on
    //      the front face (no tall pod sticking up above the frame) ----
    const camZ = fpD * 0.5;                                        // front face of the body
    parts.push(makeBox(0, 0.02, camZ - 0.07, 0.16, 0.12, 0.14));   // camera body, nested in the nose
    parts.push(makeRing(0, 0.03, camZ + 0.005, 0.055, 12, "z"));   // lens bezel on the front face
    parts.push(makeRing(0, 0.03, camZ + 0.025, 0.03, 10, "z"));    // lens aperture
    parts.push({ v: [[0, 0.03, camZ + 0.005], [0, 0.03, camZ + 0.025]], e: [[0, 1]] }); // short barrel

    // ---- two VTX antennas out the back — thicker rods with bulb tips ----
    const tailZ = -fpD * 0.5;
    [-0.09, 0.09].forEach((ax2) => {
      const tip = [ax2 * 1.8, 0.42, tailZ];
      parts.push(segBox([ax2, yTop, tailZ], tip, 0.022));           // thick rod
      parts.push(makeRing(tip[0], tip[1], tip[2], 0.04, 10, "y"));  // bulb (crossed rings)
      parts.push(makeRing(tip[0], tip[1], tip[2], 0.04, 10, "x"));
    });

    // ---- four flat carbon arms (true X) + bell motors + tri-blade props ----
    const motors = [[0.62, 0.58], [-0.62, 0.58], [-0.62, -0.58], [0.62, -0.58]];
    const ay = -0.02, aw = 0.045, at = 0.012; // arm height, half-width, half-thickness
    const spinners = [];
    for (const [mx, mz] of motors) {
      const ax = mx * 0.26, az = mz * 0.26;   // inner (frame) end of the arm
      const dx = mx - ax, dz = mz - az;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * aw, pz = (dx / len) * aw; // perpendicular, in XZ
      const ring = (yy) => [
        [ax + px, yy, az + pz], [ax - px, yy, az - pz],
        [mx - px, yy, mz - pz], [mx + px, yy, mz + pz],
      ];
      parts.push({ // flat carbon arm (a thin slab in the XZ plane)
        v: [...ring(ay + at), ...ring(ay - at)],
        e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
      });
      parts.push(makeCylinderY(mx, 0.03, mz, 0.11, 0.09, 12)); // bell motor can
      parts.push(makeRing(mx, 0.075, mz, 0.11, 12, "y"));       // motor top
      parts.push(makeRing(mx, 0.095, mz, 0.04, 8, "y"));        // prop hub / nut
      spinners.push({ cx: mx, cy: 0.11, cz: mz, r: 0.34, blades: 3, speed: 9 });
    }

    parts.push(makeBase(-0.44, 1.1));
    const m = merge(parts);
    m.spinners = spinners;
    // blinking tail strobe — a double-flash beacon (animates while hovered)
    m.dynamic = function (time) {
      const tb = (time * 1.4) % 1;
      const lit = tb < 0.1 || (tb > 0.18 && tb < 0.28);
      return { segments: [], dots: [[0, yTop + 0.03, -fpD * 0.5 + 0.06, lit ? 3.4 : 1.0, lit ? 1 : 0]] };
    };
    return m;
  }

  // Morse code kit — a simple TRANSMITTER (one key button) on the left and a
  // separate RECEIVER on the right that blinks its LED + pulses its buzzer in
  // the Morse pattern for "TYLER", pauses ~3s, then repeats. Visual only.
  function buildTransmitter() {
    const parts = [];
    const TX = -0.5, RX = 0.5; // transmitter (left) and receiver (right) centres

    // ---- transmitter: a small body with a single round key button ----
    parts.push(makeBox(TX, -0.18, 0, 0.4, 0.34, 0.4));         // body
    parts.push(makeBox(TX, -0.01, 0, 0.34, 0.02, 0.34));       // top deck
    parts.push(makeRing(TX, 0.0, 0, 0.13, 16, "y"));           // key rim (cap presses live)
    [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].forEach(([dx, dz]) =>
      parts.push({ v: [[TX + dx, -0.35, dz], [TX + dx, -0.31, dz]], e: [[0, 1]] })); // feet

    // ---- receiver: body + LED + buzzer + antenna ----
    parts.push(makeBox(RX, -0.18, 0, 0.4, 0.34, 0.4));         // body
    parts.push(makeBox(RX, -0.01, 0, 0.34, 0.02, 0.34));       // top deck
    parts.push(makeRing(RX, 0.01, 0.1, 0.05, 10, "y"));        // LED bezel (glows live)
    parts.push(makeCylinderY(RX, 0.02, -0.1, 0.07, 0.06, 12)); // buzzer can
    parts.push(makeRing(RX, 0.06, -0.1, 0.03, 8, "y"));        // buzzer port
    parts.push(makeRing(RX + 0.15, 0.0, -0.15, 0.04, 8, "y")); // antenna collar
    parts.push(segBox([RX + 0.15, 0.0, -0.15], [RX + 0.18, 0.42, -0.15], 0.018));
    parts.push(makeRing(RX + 0.18, 0.43, -0.15, 0.025, 8, "y"));

    parts.push(makeBase(-0.5, 1.05));

    // ---- Morse timeline for "TYLER" (dit/dah/gaps + a ~3s stop) ----
    const MORSE = { T: "-", Y: "-.--", L: ".-..", E: ".", R: ".-." };
    const DIT = 1, DAH = 3, GAP = 1, LGAP = 3, STOP = 18; // units; STOP ≈ 3s on screen
    const seq = [];
    "TYLER".split("").forEach((ch, li, arr) => {
      const code = MORSE[ch];
      code.split("").forEach((sym, si) => {
        seq.push([true, sym === "-" ? DAH : DIT]);
        if (si < code.length - 1) seq.push([false, GAP]);
      });
      seq.push([false, li < arr.length - 1 ? LGAP : STOP]);
    });
    let total = 0; for (const s of seq) total += s[1];
    const UNIT = 0.12; // t-units per Morse unit (dit ≈ 0.17s on screen)

    const m = merge(parts);
    m.spinners = [];
    m.dynamic = function (time) {
      // find where we are in the TYLER pattern → is the key/light ON now?
      let pos = ((time / UNIT) % total + total) % total;
      let on = false;
      for (const s of seq) { if (pos < s[1]) { on = s[0]; break; } pos -= s[1]; }

      const segs = [];
      const line = (a, b, lw) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], lw]);
      const dots = [];

      // transmitter key cap — pressed down while ON
      const keyY = on ? 0.02 : 0.08, n = 12, cap = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; cap.push([TX + Math.cos(a) * 0.1, keyY, Math.sin(a) * 0.1]); }
      for (let i = 0; i < n; i++) line(cap[i], cap[(i + 1) % n], 1.2);
      line([TX, keyY, 0], [TX, 0.0, 0], 1.2); // stem
      dots.push([TX, keyY + 0.01, 0, on ? 2.4 : 1.3, on ? 1 : 0]);

      // receiver LED — bright when ON, with one soft buzzer ring
      dots.push([RX, 0.08, 0.1, on ? 3.0 : 1.2, on ? 1 : 0]);
      if (on) {
        const rr = 0.1, m2 = 12, pts = [];
        for (let i = 0; i < m2; i++) { const a = (i / m2) * Math.PI * 2; pts.push([RX + Math.cos(a) * rr, 0.1, -0.1 + Math.sin(a) * rr]); }
        for (let i = 0; i < m2; i++) line(pts[i], pts[(i + 1) % m2], 1.0);
      }
      return { segments: segs, dots: dots };
    };
    return m;
  }

  // Raspberry Pi laser tracking turret — a Pi board with a vision-relay module
  // driving the pan + tilt servos. A target object weaves downrange; the vision
  // module recognises it (a locking reticle), the servos track it, the laser
  // fires along the barrel, and the board's LEDs alarm.
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

    // Pan servo body — fixed to the board. Everything above it (the output disc,
    // platform, tilt yoke, tilt servo and barrel) PANS on this and is drawn live.
    parts.push(makeBox(0, -0.44, 0, 0.24, 0.22, 0.2));

    // vision-relay module on the board + status LEDs + drive wiring to the servos
    parts.push(makeBox(-0.14, -0.55, 0.24, 0.16, 0.1, 0.12));      // relay module
    parts.push(makeRing(-0.14, -0.49, 0.24, 0.04, 8, "y"));        // relay coil
    [[0.34, 0.3], [0.42, 0.3], [-0.34, 0.3]].forEach(([lx, lz]) =>
      parts.push(makeRing(lx, -0.566, lz, 0.022, 6, "y")));        // LED bezels (lit live)
    parts.push({ v: [[-0.14, -0.52, 0.18], [-0.06, -0.46, 0.06], [0, -0.44, 0]], e: [[0, 1], [1, 2]] });  // relay → pan servo
    parts.push({ v: [[-0.18, -0.5, 0.24], [-0.22, -0.16, 0.04], [-0.25, 0.0, 0]], e: [[0, 1], [1, 2]] }); // relay → tilt servo

    // (the barrel, vision module, target object + laser are drawn live in render())

    parts.push(makeBase(-0.68, 0.95));
    const m = merge(parts);
    m.spinners = [];
    // Live laser barrel: tilts about the yoke pivot (the tilt servo); the
    // beam is fired straight down the barrel axis, so it moves WITH the
    // cylinder — just like the real hardware.
    m.dynamic = function (time) {
      const segs = [];
      const line = (a, b, lw) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], lw]);
      const dots = [];
      const Ty = 0.06, armX = 0.17;

      // target object — a small craft weaving around downrange
      const T = [
        Math.sin(time * 0.45) * 0.75,
        Ty + 0.18 + Math.sin(time * 0.7 + 1.3) * 0.4,
        1.25 + Math.sin(time * 0.33) * 0.22,
      ];
      // vision cycle: acquire → recognise → track + fire (loops)
      const cyc = (time * 0.16) % 1;
      const acq = cyc < 0.2 ? cyc / 0.2 : 1;
      const acqS = acq * acq * (3 - 2 * acq);

      // aim: PAN servo rotates about Y, the TILT servo pitches the barrel about X
      const dx = T[0], dy = T[1] - Ty, dz = T[2];
      const dist = Math.hypot(dx, dy, dz) || 1;
      const pan = Math.atan2(dx, dz);
      const tilt = Math.asin(Math.max(-1, Math.min(1, -dy / dist)));
      const cp = Math.cos(pan), sp = Math.sin(pan), ct = Math.cos(tilt), st = Math.sin(tilt);
      // panT: pan about Y only (platform + yoke + tilt servo ride this)
      const panT = (x, y, z) => [x * cp + z * sp, y, -x * sp + z * cp];
      // tf: tilt about X at the pivot, THEN pan (the barrel + vision ride this)
      const tf = (x, y, z) => { const ry = y - Ty, y1 = Ty + ry * ct - z * st, z1 = ry * st + z * ct; return [x * cp + z1 * sp, y1, -x * sp + z1 * cp]; };
      const boxT = (tr, cx, cy, cz, w, h, d) => {
        const x0=cx-w/2,x1=cx+w/2,y0=cy-h/2,y1=cy+h/2,z0=cz-d/2,z1=cz+d/2;
        const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(p=>tr(p[0],p[1],p[2]));
        [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([i,j])=>line(v[i],v[j],1.1));
      };
      const ringT = (tr, cx, cy, cz, r, n, ax) => {
        const pts=[];
        for (let i=0;i<n;i++){ const a=(i/n)*Math.PI*2, c=Math.cos(a)*r, s=Math.sin(a)*r;
          const p = ax==='y'?[cx+c,cy,cz+s]:ax==='x'?[cx,cy+c,cz+s]:[cx+c,cy+s,cz];
          pts.push(tr(p[0],p[1],p[2])); }
        for (let i=0;i<n;i++) line(pts[i], pts[(i+1)%n], 1.1);
      };

      // rotating platform + tilt yoke (PAN on the base servo)
      ringT(panT, 0, -0.32, 0, 0.1, 14, 'y');   // pan output disc
      ringT(panT, 0, -0.32, 0, 0.04, 8, 'y');   // hub
      boxT(panT, 0, -0.29, 0, 0.34, 0.03, 0.22); // platform
      [-1, 1].forEach((s) => boxT(panT, s * armX, -0.04, 0, 0.05, 0.34, 0.14)); // yoke arms
      boxT(panT, 0, Ty, 0, armX * 2, 0.04, 0.04);            // tilt pivot rod
      [-1, 1].forEach((s) => ringT(panT, s * armX, Ty, 0, 0.05, 10, 'x')); // bearings

      // TILT SERVO — pitches the barrel cylinder that aims the laser. Body is
      // fixed to the yoke; its output horn SWINGS with the tilt so the drive is
      // visible.
      boxT(panT, -armX - 0.06, Ty, 0, 0.12, 0.15, 0.12);   // tilt servo body
      ringT(panT, -armX - 0.005, Ty, 0, 0.045, 8, 'x');    // servo output shaft (on the tilt axis)
      const cplX = -armX + 0.04;
      ringT(tf, cplX, Ty, 0, 0.05, 8, 'x');                // coupling to the barrel (turns with the tilt)
      line(tf(cplX, Ty, 0), tf(cplX, Ty + 0.08, 0), 1.4);  // servo horn — swings as the barrel aims

      // barrel tube (aimed at the object)
      const segc = 12, rB = 0.07, rear = [], front = [];
      for (let i = 0; i < segc; i++) { const a = (i / segc) * Math.PI * 2; rear.push(tf(Math.cos(a)*rB, Ty+Math.sin(a)*rB, 0.04)); front.push(tf(Math.cos(a)*rB, Ty+Math.sin(a)*rB, 0.44)); }
      for (let i = 0; i < segc; i++) { const j = (i + 1) % segc; line(rear[i], rear[j], 1.2); line(front[i], front[j], 1.2); line(rear[i], front[i], 1.2); }
      ringT(tf, 0, Ty, 0.46, 0.05, 10, 'z'); // emitter aperture

      // vision module — camera + lens beside the barrel
      boxT(tf, 0.13, Ty + 0.02, 0.34, 0.12, 0.12, 0.14);
      ringT(tf, 0.13, Ty + 0.02, 0.42, 0.035, 10, 'z'); // vision lens

      // the object — a small tumbling craft
      const os = 0.08, rA = time * 0.8;
      const ca2 = Math.cos(rA), sa2 = Math.sin(rA), cb2 = Math.cos(rA * 0.6), sb2 = Math.sin(rA * 0.6);
      const op = (lx, ly, lz) => { const x1 = lx*ca2 + lz*sa2, z1 = -lx*sa2 + lz*ca2; const y2 = ly*cb2 - z1*sb2, z2 = ly*sb2 + z1*cb2; return [T[0]+x1, T[1]+y2, T[2]+z2]; };
      const oc = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([a,b,c]) => op(a*os, b*os, c*os));
      [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([i,j]) => line(oc[i], oc[j], 1.0));

      // recognition reticle — corner brackets that lock onto the object
      const rs = 0.13 + (1 - acqS) * 0.2, tk = 0.05;
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => { const bx = T[0]+sx*rs, by = T[1]+sy*rs, bzz = T[2]; line([bx,by,bzz],[bx-sx*tk,by,bzz],1.0); line([bx,by,bzz],[bx,by-sy*tk,bzz],1.0); });

      // laser beam — fires once recognised
      const o = tf(0, Ty, 0.46);
      if (acqS > 0.5) { line(o, T, 1.7); dots.push([T[0], T[1], T[2], 3, 1]); }

      // LED alarms on the board (A/B alternate; third = lock status)
      const ph = (time * 6) % 1;
      dots.push([0.34, -0.564, 0.3, ph < 0.5 ? 2.8 : 1.0, ph < 0.5 ? 1 : 0]);
      dots.push([0.42, -0.564, 0.3, ph >= 0.5 ? 2.8 : 1.0, ph >= 0.5 ? 1 : 0]);
      dots.push([-0.34, -0.564, 0.3, acqS > 0.99 ? 2.6 : 1.2, acqS > 0.99 ? 1 : 0]);

      return { segments: segs, dots: dots };
    };
    return m;
  }

  // Finned rocket in SCHEMATIC view — body, nose cone, fins and engine bell,
  // with the internal avionics shown through the wireframe: a microcontroller
  // up near the cone, wired down to a servo at each fin.
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
    // (the 4 fins are CONTROL SURFACES — drawn live in m.dynamic so they deflect)
    // flared engine bell
    parts.push(makeRing(0, -0.6, 0, 0.1, 12, "y"));
    parts.push(makeRing(0, -0.86, 0, 0.22, 12, "y"));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push({ v: [[Math.cos(a) * 0.1, -0.6, Math.sin(a) * 0.1], [Math.cos(a) * 0.22, -0.86, Math.sin(a) * 0.22]], e: [[0, 1]] });
    }

    // ---- schematic internals: a microcontroller near the cone, a servo at
    //      each fin, and the wiring that links them (seen through the body) ----
    parts.push(makeBox(0, 0.34, 0, 0.2, 0.03, 0.12));          // MCU board (PCB)
    parts.push(makeBox(0.035, 0.37, 0, 0.07, 0.04, 0.07));     // processor chip
    parts.push({ v: [[-0.09, 0.355, 0.045], [0.09, 0.355, 0.045]], e: [[0, 1]] }); // header pins
    parts.push({ v: [[-0.09, 0.355, -0.045], [0.09, 0.355, -0.045]], e: [[0, 1]] });
    const mcu = [0, 0.31, 0];
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((th) => {
      const c = Math.cos(th), s = Math.sin(th);
      const servo = [c * 0.11, -0.45, s * 0.11];               // servo at the fin root, inside
      parts.push(makeBox(servo[0], servo[1], servo[2], 0.09, 0.13, 0.07)); // servo body
      parts.push({                                                          // internal wire MCU → servo
        v: [mcu, [c * 0.06, 0.12, s * 0.06], [c * 0.1, -0.22, s * 0.1], [servo[0], servo[1] + 0.06, servo[2]]],
        e: [[0, 1], [1, 2], [2, 3]],
      });
    });

    parts.push(makeBase(-0.96, 0.95));
    const m = merge(parts);
    m.spinners = [];
    // The 4 fins stay bolted to the fuselage and PIVOT about the vertical hinge
    // through their root (front-top point) — only the tip swings, like the
    // steering fins on a rocket.
    m.dynamic = function (time) {
      const segs = [];
      const line = (a, b, lw) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], lw]);
      const prof = [[R, -0.33], [0.42, -0.5], [0.47, -0.72], [R, -0.6]];
      [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((th, i) => {
        const c = Math.cos(th), s = Math.sin(th);
        const dfl = Math.sin(time * 1.6 + i * 1.7) * 0.4; // steering deflection
        const cd = Math.cos(dfl), sd = Math.sin(dfl);
        // root edge is at r = R (on the body); dr = 0 there so the root stays
        // FIXED, and the fin rotates about that vertical hinge so the tip swings.
        const pt = (r, y) => {
          const dr = r - R;
          return [R * c + dr * (c * cd + s * sd), y, R * s + dr * (s * cd - c * sd)];
        };
        const P = prof.map(([r, y]) => pt(r, y));
        for (let k = 0; k < P.length; k++) line(P[k], P[(k + 1) % P.length], 1.1);
        line([c * 0.11, -0.45, s * 0.11], pt(0.3, -0.45), 1.0); // servo pushrod → fin
      });
      return { segments: segs, dots: [] };
    };
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
    let hovered = false;
    let deploy = reduce ? 1 : 0;     // 0 = parked/collapsed, 1 = deployed (deploy models)
    let hoverT = 0;                  // grows while hovered (arm's search-then-lock timing)
    const tilt = -0.42;              // look slightly down on the model
    const viewerDist = 3.4;

    // Reused per-frame scratch so the draw loop allocates nothing.
    const projBuf = new Array(model.v.length);
    const NB = 5;                                     // depth buckets
    const edgeBuckets = Array.from({ length: NB }, () => []);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      w = rect.width; h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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

      // subtle hologram flicker — gentle and slow, not noisy
      const flicker = reduce ? 1 : 0.94 + 0.06 * Math.sin(t * 3.2) * Math.sin(t * 1.6);

      // project every vertex once (into reused scratch)
      const pv = model.v;
      const proj = projBuf;
      let fmin = Infinity, fmax = -Infinity;
      for (let i = 0; i < pv.length; i++) {
        const p = project(pv[i][0], pv[i][1], pv[i][2], ca, sa);
        proj[i] = p;
        if (p[2] < fmin) fmin = p[2];
        if (p[2] > fmax) fmax = p[2];
      }
      const fspan = fmax - fmin || 1;

      // Bucket edges by depth → the whole wireframe draws in a few stroke
      // calls instead of one (shadowed) stroke per edge. The expensive
      // glow is then a SINGLE shadowed pass; cores are cheap & shadowless.
      for (let b = 0; b < NB; b++) edgeBuckets[b].length = 0;
      const E = model.e;
      for (let i = 0; i < E.length; i++) {
        const a = proj[E[i][0]], c = proj[E[i][1]];
        let d = ((a[2] + c[2]) * 0.5 - fmin) / fspan;
        let bi = (d * NB) | 0;
        if (bi < 0) bi = 0; else if (bi >= NB) bi = NB - 1;
        const arr = edgeBuckets[bi];
        arr.push(a[0], a[1], c[0], c[1]);
      }

      ctx.lineCap = "round";

      // Pass 1 — one soft glow for the entire frame (single shadowed stroke).
      ctx.shadowColor = `rgba(${rgb},0.9)`;
      ctx.shadowBlur = reduce ? 0 : 7;
      ctx.strokeStyle = `rgba(${rgb},${(0.11 * flicker).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let b = 0; b < NB; b++) {
        const arr = edgeBuckets[b];
        for (let k = 0; k < arr.length; k += 4) {
          ctx.moveTo(arr[k], arr[k + 1]);
          ctx.lineTo(arr[k + 2], arr[k + 3]);
        }
      }
      ctx.stroke();

      // Pass 2 — crisp, depth-cued cores with NO shadow (cheap).
      ctx.shadowBlur = 0;
      for (let b = 0; b < NB; b++) {
        const arr = edgeBuckets[b];
        if (!arr.length) continue;
        const depth = (b + 0.5) / NB;
        ctx.strokeStyle = `rgba(${rgb},${((0.2 + depth * 0.6) * flicker).toFixed(3)})`;
        ctx.lineWidth = 0.6 + depth * 0.8;
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 4) {
          ctx.moveTo(arr[k], arr[k + 1]);
          ctx.lineTo(arr[k + 2], arr[k + 3]);
        }
        ctx.stroke();
      }

      // Vertex nodes — very subtle (just a faint glint on the nearer points),
      // so the model reads as clean lines rather than a dot field.
      ctx.fillStyle = `rgba(${rgb},${(0.16 * flicker).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        const r = 0.45 + ((p[2] - fmin) / fspan) * 0.45;
        ctx.moveTo(p[0] + r, p[1]);
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Spinning rotor blades — batched into a single stroke.
      const spinners = model.spinners || [];
      if (spinners.length) {
        const spin = reduce ? 0 : t;
        ctx.strokeStyle = `rgba(${rgb},${(0.6 * flicker).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let s = 0; s < spinners.length; s++) {
          const sp = spinners[s];
          const hub = project(sp.cx, sp.cy, sp.cz, ca, sa);
          for (let bl = 0; bl < sp.blades; bl++) {
            const ba = spin * sp.speed + (bl / sp.blades) * Math.PI * 2;
            const pe = project(sp.cx + Math.cos(ba) * sp.r, sp.cy, sp.cz + Math.sin(ba) * sp.r, ca, sa);
            ctx.moveTo(hub[0], hub[1]);
            ctx.lineTo(pe[0], pe[1]);
          }
        }
        ctx.stroke();
      }

      // Live dynamic geometry — articulated arm / tilting laser barrel.
      // model.dynamic(t) returns model-space segments + dots; batched stroke.
      const dyn = model.dynamic;
      if (dyn) {
        const gen = dyn(reduce ? 0 : t, deploy, angY, hoverT);
        const segs = gen.segments || [];
        ctx.strokeStyle = `rgba(${rgb},${(0.72 * flicker).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const a = project(s[0], s[1], s[2], ca, sa);
          const b = project(s[3], s[4], s[5], ca, sa);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
        const dots = gen.dots || [];
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          const pp = project(d[0], d[1], d[2], ca, sa);
          ctx.beginPath();
          ctx.arc(pp[0], pp[1], d[3] || 3, 0, Math.PI * 2);
          if (d[4]) { ctx.fillStyle = `rgba(${rgb},${flicker.toFixed(3)})`; ctx.fill(); }
          else { ctx.strokeStyle = `rgba(${rgb},${(0.7 * flicker).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.stroke(); }
        }
      }
    }

    // Cap the spin to ~40fps — visually smooth, but far less work per second
    // than running flat-out at 60/120Hz while a card is hovered.
    let lastTs = 0;
    const frameMin = 1000 / 40;
    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (lastTs && ts - lastTs < frameMin) return;
      lastTs = ts;
      t += 0.018;
      angY += 0.0055; // calmer, more deliberate rotation
      if (model.deploys) {
        const target = hovered ? 1 : 0;
        deploy += (target - deploy) * 0.09; // ease toward parked / deployed
        if (Math.abs(target - deploy) < 0.003) deploy = target;
      }
      hoverT = hovered ? hoverT + 0.018 : 0; // reset each time the hover starts
      render();
      // Wind the loop down once idle (and, for deploying models, fully parked).
      if (!hovered && !(model.deploys && deploy > 0.003)) { cancelAnimationFrame(raf); raf = 0; }
    }

    // Hover drives both the spin and (for the arm) the deploy animation.
    function setHover(state) {
      hovered = state;
      if (!raf && !reduce) { lastTs = 0; raf = requestAnimationFrame(loop); }
    }

    resize();
    render();
    window.addEventListener("resize", resize, { passive: true });

    return { canvas, setHover, reduce };
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
      hot.addEventListener("pointerenter", () => inst.setHover(true));
      hot.addEventListener("pointerleave", () => inst.setHover(false));
    });
  }

  window.BBTHolograms = { mount };
})();
