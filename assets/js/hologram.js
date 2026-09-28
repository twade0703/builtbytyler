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
     Every builder returns { v: [[x,y,z]...], e: [[i,j]...], f: [[i,j,k,...]] }.

     `f` is the surface list, and it is the whole reason these models stopped
     looking like a tangle of lines. Without faces there is nothing to hide a
     far edge behind a near one, so every model reads as a transparent mess of
     identical strokes no matter how well the strokes are graded. With faces
     the renderer can sort back to front, fill each surface with near-black,
     and let the near side of an object cover the far side of it — which is
     what a viewer reads as "solid".

     Faces are wound consistently anticlockwise seen from outside where it is
     cheap to do so. Nothing depends on that being perfect: the renderer sorts
     rather than culls, so a face wound the wrong way is shaded as a back face
     and still occludes correctly. It never disappears.

     Models are authored around the origin, roughly within a unit sphere; the
     renderer scales them to the canvas. */

  /* Propeller blade planform, normalised to a unit radius: narrow root,
     widest around 60% span, swept and rounded off at the tip. Shared by
     every spinner in every model — see the rotor pass in render(). */
  const BLADE = [
    [0.15, 0.055], [0.34, 0.135], [0.60, 0.150], [0.84, 0.115],
    [1.00, 0.045], [0.97, -0.030], [0.72, -0.075], [0.45, -0.080], [0.18, -0.045],
  ];

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
    const f = [
      [4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3],
      [5, 1, 2, 6], [0, 1, 5, 4], [3, 7, 6, 2],
    ];
    return { v, e, f };
  }

  // Circle of `seg` points; axis = the axis it is perpendicular to.
  // A ring is an outline, not a surface — see makeDisc for a capped one.
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
    return { v, e, f: [] };
  }

  // A filled circle — a ring plus the n-gon that closes it. Used for the ends
  // of tubes, where an open ring lets you see straight through the object.
  function makeDisc(cx, cy, cz, r, seg, axis) {
    const m = makeRing(cx, cy, cz, r, seg, axis);
    m.f = [m.v.map((_, i) => i)];
    return m;
  }

  // Short tube along Y: two rings, vertical struts, side quads and two caps.
  function makeCylinderY(cx, cy, cz, r, len, seg, open) {
    const top = makeRing(cx, cy + len / 2, cz, r, seg, "y");
    const bot = makeRing(cx, cy - len / 2, cz, r, seg, "y");
    const parts = merge([top, bot]);
    for (let i = 0; i < seg; i++) parts.e.push([i, i + seg]);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      parts.f.push([i, j, j + seg, i + seg]);
    }
    if (!open) {
      parts.f.push(top.v.map((_, i) => i));
      parts.f.push(bot.v.map((_, i) => seg + i).reverse());
    }
    return parts;
  }

  // A capsule/segment box spanning two 3D joints (used for arm links).
  // Built from makeBox, so it inherits its six faces; only the coordinates
  // are remapped, and face indices are untouched.
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
    const v = [], e = [], f = [];
    for (const p of parts) {
      const off = v.length;
      for (const vert of p.v) v.push(vert);
      for (const ed of p.e) e.push([ed[0] + off, ed[1] + off]);
      if (p.f) for (const fa of p.f) f.push(fa.map((i) => i + off));
    }
    return { v, e, f };
  }

  // Holographic projector base: a ground ring + crosshair spokes.
  /* The pad every model stands on. Three concentric rings, twelve radials and
     a ring of graduation ticks — it reads as a calibrated instrument stage
     rather than a wagon wheel, and the extra segments stop the circles going
     polygonal at the size these render at.

     Deliberately faceless. The pad is a drawn marking on the floor, not a
     surface: give it faces and it becomes a solid disc that swallows the
     landing gear standing on it. */
  function makeBase(y, r) {
    const parts = [
      makeRing(0, y, 0, r, 64, "y"),
      makeRing(0, y, 0, r * 0.74, 52, "y"),
      makeRing(0, y, 0, r * 0.40, 40, "y"),
    ];

    const radials = { v: [], e: [] };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const c = Math.cos(a), sn = Math.sin(a);
      // Long radials on the quarters, short ones between — an even fan of
      // twelve full-length spokes crowds the middle of the pad.
      const r0 = i % 3 === 0 ? r * 0.40 : r * 0.74;
      const k = radials.v.length;
      radials.v.push([c * r0, y, sn * r0], [c * r, y, sn * r]);
      radials.e.push([k, k + 1]);
    }
    parts.push(radials);

    const ticks = { v: [], e: [] };
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const len = i % 4 === 0 ? 0.055 : 0.028;
      const k = ticks.v.length;
      ticks.v.push([c * r, y, sn * r], [c * (r + len), y, sn * (r + len)]);
      ticks.e.push([k, k + 1]);
    }
    parts.push(ticks);

    return merge(parts);
  }

  // Lofted tube: a chain of rings (in XY, perpendicular to Z) joined by
  // longerons — used for smoothly tapered fuselage bodies.
  function makeLoft(stations, seg, capEnds) {
    const rings = stations.map((s) => makeRing(s.cx || 0, s.cy || 0, s.z, s.r, seg, "z"));
    const m = merge(rings);
    for (let s = 0; s < stations.length - 1; s++) {
      for (let i = 0; i < seg; i++) {
        m.e.push([s * seg + i, (s + 1) * seg + i]);
        const j = (i + 1) % seg;
        m.f.push([s * seg + i, s * seg + j, (s + 1) * seg + j, (s + 1) * seg + i]);
      }
    }
    if (capEnds) {
      const last = (stations.length - 1) * seg;
      m.f.push(stations[0] && Array.from({ length: seg }, (_, i) => i));
      m.f.push(Array.from({ length: seg }, (_, i) => last + seg - 1 - i));
    }
    return m;
  }

  // Loft along Y: a stack of horizontal rings joined by longerons. For bodies
  // of revolution about the vertical axis — a rocket's nose cone and boat
  // tail — where makeLoft (which runs fore-aft along Z) is the wrong axis.
  function makeLoftY(stations, seg) {
    const rings = stations.map((s) => makeRing(s.cx || 0, s.y, s.cz || 0, s.r, seg, "y"));
    const m = merge(rings);
    for (let s = 0; s < stations.length - 1; s++) {
      for (let i = 0; i < seg; i++) {
        m.e.push([s * seg + i, (s + 1) * seg + i]);
        const j = (i + 1) % seg;
        m.f.push([s * seg + i, s * seg + j, (s + 1) * seg + j, (s + 1) * seg + i]);
      }
    }
    return m;
  }

  // Short cylindrical joint housing along Z (a pivot knuckle).
  function makeKnuckle(cx, cy, cz, r, len, seg) {
    const a = makeRing(cx, cy, cz - len / 2, r, seg, "z");
    const b = makeRing(cx, cy, cz + len / 2, r, seg, "z");
    const m = merge([a, b]);
    for (let i = 0; i < seg; i++) {
      m.e.push([i, i + seg]);
      const j = (i + 1) % seg;
      m.f.push([i, j, j + seg, i + seg]);
    }
    m.f.push(Array.from({ length: seg }, (_, i) => i));
    m.f.push(Array.from({ length: seg }, (_, i) => seg + seg - 1 - i));
    return m;
  }

  // A cylinder along an arbitrary axis, with caps. The workhorse for motor
  // cans, hydraulic rams, bearing housings and cable conduits — anything that
  // has to read as a machined round part rather than a drawn circle.
  function tubeAlong(c0, c1, r, seg) {
    const ax = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
    const L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    const a = [ax[0] / L, ax[1] / L, ax[2] / L];
    let u = Math.abs(a[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    let w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const wl = Math.hypot(w[0], w[1], w[2]) || 1;
    w = [w[0] / wl, w[1] / wl, w[2] / wl];
    u = [w[1] * a[2] - w[2] * a[1], w[2] * a[0] - w[0] * a[2], w[0] * a[1] - w[1] * a[0]];
    const v = [], e = [], f = [];
    for (let s = 0; s < 2; s++) {
      const c = s === 0 ? c0 : c1;
      for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2, cc = Math.cos(t) * r, ss = Math.sin(t) * r;
        v.push([c[0] + w[0] * cc + u[0] * ss, c[1] + w[1] * cc + u[1] * ss, c[2] + w[2] * cc + u[2] * ss]);
      }
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      e.push([i, j], [seg + i, seg + j], [i, seg + i]);
      f.push([i, j, seg + j, seg + i]);
    }
    f.push(Array.from({ length: seg }, (_, i) => seg - 1 - i));
    f.push(Array.from({ length: seg }, (_, i) => seg + i));
    return { v, e, f };
  }

  // A flat plate from a closed 2D outline, extruded to a thickness along one
  // axis. Wings, fins, chassis plates, brackets — the shapes that are sheet
  // rather than tube. `plane` names the two axes the outline lives in.
  function plate(pts, plane, at, thick) {
    const lift = (p, o) => {
      if (plane === "xz") return [p[0], at + o, p[1]];
      if (plane === "xy") return [p[0], p[1], at + o];
      return [at + o, p[0], p[1]]; // yz
    };
    const n = pts.length, v = [], e = [], f = [];
    for (const p of pts) v.push(lift(p, thick / 2));
    for (const p of pts) v.push(lift(p, -thick / 2));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      e.push([i, j], [n + i, n + j], [i, n + i]);
      f.push([i, j, n + j, n + i]);
    }
    f.push(Array.from({ length: n }, (_, i) => i));
    f.push(Array.from({ length: n }, (_, i) => n + n - 1 - i));
    return { v, e, f };
  }

  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (v) => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; },
    ss: (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); },
  };
  /* A pen bound to one segment list, and optionally to a surface list.

     Live geometry has to be able to occlude. A model whose static shell is
     solid but whose moving parts are bare wireframe looks broken in a very
     specific way: the arm appears to be made of glass and the base does not.
     So every shape here writes lines AND, when a face list is supplied, the
     surfaces those lines are the edges of. */
  function pen(segs, faces) {
    const line = (a, b, lw) => segs.push([a[0], a[1], a[2], b[0], b[1], b[2], lw || 1.1]);
    const face = faces ? (pts) => faces.push(pts) : () => {};
    const loop = (pts, lw) => { for (let i = 0; i < pts.length; i++) line(pts[i], pts[(i + 1) % pts.length], lw); };
    const poly = (pts, lw) => { for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1], lw); };
    // Ring of n points around centre c, in the plane spanned by unit vectors u,v.
    const ringUV = (c, u, v, r, n, lw) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, cs = Math.cos(a) * r, sn = Math.sin(a) * r;
        pts.push([c[0] + u[0] * cs + v[0] * sn, c[1] + u[1] * cs + v[1] * sn, c[2] + u[2] * cs + v[2] * sn]);
      }
      loop(pts, lw);
      return pts;
    };
    // Axis-aligned ring, like makeRing but live. tr = optional point transform.
    const ring = (cx, cy, cz, r, n, ax, lw, tr) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
        const p = ax === "y" ? [cx + c, cy, cz + s] : ax === "x" ? [cx, cy + c, cz + s] : [cx + c, cy + s, cz];
        pts.push(tr ? tr(p[0], p[1], p[2]) : p);
      }
      loop(pts, lw);
      return pts;
    };
    // Axis-aligned box, optionally through a point transform.
    const box = (cx, cy, cz, w, h, d, lw, tr) => {
      const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      let v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      if (tr) v = v.map((p) => tr(p[0], p[1], p[2]));
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
        .forEach(([i, j]) => line(v[i], v[j], lw));
      [[4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3], [5, 1, 2, 6], [0, 1, 5, 4], [3, 7, 6, 2]]
        .forEach((q) => face(q.map((i) => v[i])));
      return v;
    };
    /* A square-section beam between two points in space. `wb` tapers the far
       end — a link that is thicker at the shoulder than at the wrist is the
       single cheapest thing that makes a robot arm look engineered rather
       than assembled from equal sticks. */
    const beam = (a, b, w, lw, wb) => {
      const w2 = wb == null ? w : wb;
      const d = V.norm(V.sub(b, a));
      let up = Math.abs(d[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0];
      const s = V.norm(V.cross(d, up)); up = V.norm(V.cross(s, d));
      const c = (p, ww) => [
        V.add(p, V.add(V.mul(s, ww), V.mul(up, ww))), V.add(p, V.sub(V.mul(s, ww), V.mul(up, ww))),
        V.sub(p, V.add(V.mul(s, ww), V.mul(up, ww))), V.sub(p, V.sub(V.mul(s, ww), V.mul(up, ww))),
      ];
      const A = c(a, w), B = c(b, w2);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        line(A[i], A[j], lw); line(B[i], B[j], lw); line(A[i], B[i], lw);
        face([A[i], A[j], B[j], B[i]]);
      }
      face([A[0], A[1], A[2], A[3]]);
      face([B[3], B[2], B[1], B[0]]);
      return [A, B];
    };
    // A tube along an arbitrary axis: rings at each station plus longerons.
    const tube = (c0, axis, stations, seg, lw) => {
      const ax = V.norm(axis);
      let u = Math.abs(ax[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      const v = V.norm(V.cross(ax, u)); u = V.norm(V.cross(v, ax));
      let prev = null;
      for (const st of stations) {
        const cen = V.add(c0, V.mul(ax, st.d));
        const pts = ringUV(cen, u, v, st.r, seg, lw);
        if (prev) {
          for (let i = 0; i < seg; i++) {
            line(prev[i], pts[i], lw);
            face([prev[i], prev[(i + 1) % seg], pts[(i + 1) % seg], pts[i]]);
          }
        }
        prev = pts;
      }
      return prev;
    };
    // A disc closing a ringUV — stops you seeing straight down a tube.
    const cap = (c, u, v, r, n, lw) => { face(ringUV(c, u, v, r, n, lw)); };
    return { line, loop, poly, ring, ringUV, box, beam, tube, face, cap };
  }


  /* ---------------- models ---------------- */

  /* Tilt-rotor VTOL — the V-22 layout at drone scale: a high tapered wing
     with a proprotor nacelle at each tip, twin fins on an H-tail, skids
     underneath, and a glazed cockpit with a cabin door.

     The two nacelles tilt live from vertical (hover) to horizontal (cruise),
     dwelling at each end so the transition reads as a manoeuvre rather than
     a wobble. Flaperons droop in the hover and roll in cruise; the elevator
     works in cruise. Everything else is structure, and there is deliberately
     a lot of it: with surfaces occluding properly, detail now reads as
     engineering instead of as tangle. */
  function buildEvtol() {
    const parts = [];

    // ---- fuselage: nose (+Z) to tail (-Z) ----
    parts.push(makeLoft([
      { z: 1.00, cy: -0.02, r: 0.020 },
      { z: 0.88, cy: -0.02, r: 0.070 },
      { z: 0.68, cy: 0.00, r: 0.118 },
      { z: 0.38, cy: 0.01, r: 0.150 },
      { z: 0.02, cy: 0.01, r: 0.150 },
      { z: -0.34, cy: 0.03, r: 0.115 },
      { z: -0.68, cy: 0.06, r: 0.064 },
      { z: -0.94, cy: 0.09, r: 0.024 },
    ], 12, true));

    // nose boom / air-data probe — the detail that says "this is an aircraft"
    parts.push(tubeAlong([0, -0.02, 1.00], [0, -0.02, 1.16], 0.009, 6));
    parts.push(makeRing(0, -0.02, 1.10, 0.020, 6, "z"));

    /* ---- cockpit glazing. Four framed panels: a two-piece windscreen and
           a quarter light each side. Drawn as their own surfaces so they
           catch the light differently from the skin around them. ---- */
    const glass = [
      [[0.000, 0.150, 0.60], [0.000, 0.055, 0.83], [0.085, 0.035, 0.79], [0.090, 0.115, 0.58]],
      [[0.000, 0.150, 0.60], [0.000, 0.055, 0.83], [-0.085, 0.035, 0.79], [-0.090, 0.115, 0.58]],
      [[0.090, 0.115, 0.58], [0.085, 0.035, 0.79], [0.130, 0.005, 0.62], [0.132, 0.075, 0.48]],
      [[-0.090, 0.115, 0.58], [-0.085, 0.035, 0.79], [-0.130, 0.005, 0.62], [-0.132, 0.075, 0.48]],
    ];
    glass.forEach((q) => parts.push({
      v: q, e: [[0, 1], [1, 2], [2, 3], [3, 0]], f: [[0, 1, 2, 3]],
    }));
    // canopy spine and the frame arch behind the glazing
    parts.push({ v: [[0, 0.150, 0.60], [0, 0.165, 0.42], [0, 0.150, 0.24]], e: [[0, 1], [1, 2]], f: [] });

    // ---- cabin: a door outline each side, and two windows behind it ----
    [-1, 1].forEach((sd) => {
      const x = sd * 0.148;
      parts.push({
        v: [[x, 0.085, 0.30], [x, 0.085, 0.02], [x, -0.085, 0.02], [x, -0.085, 0.30]],
        e: [[0, 1], [1, 2], [2, 3], [3, 0]], f: [],
      });
      parts.push(makeRing(x, 0.030, 0.20, 0.038, 10, "x"));
      parts.push(makeRing(x, 0.030, 0.09, 0.038, 10, "x"));
      // door handle recess
      parts.push({ v: [[x, -0.01, 0.055], [x, -0.01, 0.10]], e: [[0, 1]], f: [] });
    });

    // ---- high wing: tapered, slightly swept, with a real section ----
    const WY = 0.180, WT = 0.040;
    const LE = (x) => 0.30 - (x - 0.12) * (0.10 / 0.88);
    const TE = (x) => 0.00 + (x - 0.12) * (0.02 / 0.88);
    [-1, 1].forEach((sd) => {
      const top = [[0.12, LE(0.12)], [1.0, LE(1.0)], [1.0, TE(1.0)], [0.12, TE(0.12)]].map(([x, z]) => [sd * x, WY, z]);
      const bot = top.map((p) => [p[0], WY - WT, p[2]]);
      const v = [...top, ...bot];
      const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      const f = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 3, 7, 4], [1, 5, 6, 2], [0, 4, 5, 1], [3, 2, 6, 7]];
      let k = v.length;
      const sp = (x) => LE(x) - (LE(x) - TE(x)) * 0.3;
      v.push([sd * 0.12, WY, sp(0.12)], [sd * 1.0, WY, sp(1.0)], [sd * 0.12, WY - WT, sp(0.12)], [sd * 1.0, WY - WT, sp(1.0)]);
      e.push([k, k + 1], [k + 2, k + 3]);
      [0.30, 0.48, 0.66, 0.84].forEach((x) => {
        k = v.length;
        v.push([sd * x, WY, LE(x)], [sd * x, WY, TE(x)], [sd * x, WY - WT, LE(x)], [sd * x, WY - WT, TE(x)]);
        e.push([k, k + 1], [k + 2, k + 3], [k, k + 2], [k + 1, k + 3]);
      });
      parts.push({ v, e, f });
      // wing-root fairing blending the wing into the fuselage
      parts.push(plate([[sd * 0.10, 0.36], [sd * 0.20, 0.30], [sd * 0.20, -0.04], [sd * 0.10, -0.10]], "xz", WY - WT / 2, 0.11));
      // nacelle pylon shoulder at the tip
      parts.push(makeBox(sd * 0.955, WY - WT / 2, LE(1.0) - 0.09, 0.075, 0.10, 0.22));
    });
    parts.push(makeBox(0, WY - WT / 2, 0.15, 0.26, WT + 0.03, 0.34)); // carry-through box
    // wing-root exhausts
    [-1, 1].forEach((sd) => parts.push(tubeAlong([sd * 0.17, WY - 0.02, -0.02], [sd * 0.17, WY - 0.02, -0.12], 0.028, 8)));

    /* ---- V-tail. Two panels only, angled up and out from the boom at 42°
           from horizontal — no horizontal stabiliser and no fins, because a
           V-tail has neither. The surfaces on the trailing edge are
           RUDDERVATORS: they move together for pitch and differentially for
           yaw, doing the work an elevator and a rudder would split between
           them, and they are drawn live below. ---- */
    const TZ = 0.118;                                   // tail root height
    const VDIH = 40 * Math.PI / 180, VSPAN = 0.66;   // a tilt-rotor's tail is big; it is doing two jobs
    const VX = Math.cos(VDIH) * VSPAN, VY = Math.sin(VDIH) * VSPAN;
    // root LE/TE and tip LE/TE for one side; the panel is a thin slab
    const vRootLE = [0, TZ, -0.54], vRootTE = [0, TZ, -0.90];
    [-1, 1].forEach((sd) => {
      const tipLE = [sd * VX, TZ + VY, -0.70];
      const tipTE = [sd * VX, TZ + VY, -0.90];
      const top = [vRootLE, tipLE, tipTE, vRootTE];
      // thickness normal to the panel: across the span direction
      const nrm = [-sd * Math.sin(VDIH) * 0.013, Math.cos(VDIH) * 0.013, 0];
      const a = top.map((q) => [q[0] + nrm[0], q[1] + nrm[1], q[2] + nrm[2]]);
      const b = top.map((q) => [q[0] - nrm[0], q[1] - nrm[1], q[2] - nrm[2]]);
      parts.push({
        v: [...a, ...b],
        e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
        f: [[0, 1, 2, 3], [7, 6, 5, 4], [0, 3, 7, 4], [1, 5, 6, 2], [0, 4, 5, 1], [3, 2, 6, 7]],
      });
      // a mid-span rib, and a nav light pod on the tip
      const midLE = [sd * VX * 0.55, TZ + VY * 0.55, -0.615];
      const midTE = [sd * VX * 0.55, TZ + VY * 0.55, -0.90];
      parts.push({ v: [midLE, midTE], e: [[0, 1]], f: [] });
      parts.push(makeRing(sd * VX, TZ + VY, -0.82, 0.024, 6, "x"));
    });
    // the boom fairing the two panels spring from
    parts.push(makeLoftY([
      { y: TZ - 0.06, cz: -0.73, r: 0.045 },
      { y: TZ + 0.01, cz: -0.73, r: 0.038 },
      { y: TZ + 0.05, cz: -0.73, r: 0.022 },
    ], 8));

    /* ---- sponsons: the fairings down each flank that a tilt-rotor carries
           its fuel and gear in. They are the detail that most separates the
           silhouette from "aeroplane with two propellers". ---- */
    [-1, 1].forEach((sd) => {
      const x = sd * 0.156;
      parts.push(makeLoft([
        { z: 0.34, cx: x, cy: -0.055, r: 0.052 },
        { z: 0.16, cx: x * 1.10, cy: -0.060, r: 0.082 },
        { z: -0.10, cx: x * 1.12, cy: -0.060, r: 0.084 },
        { z: -0.34, cx: x * 1.05, cy: -0.055, r: 0.058 },
        { z: -0.48, cx: x, cy: -0.050, r: 0.020 },
      ], 8, true));
      // fuel filler cap and a vent scoop on top of each sponson
      parts.push(makeRing(x * 1.10, -0.010, 0.06, 0.026, 8, "y"));
      parts.push(makeBox(x * 1.12, 0.005, -0.20, 0.045, 0.028, 0.075));
    });

    /* ---- sensor turret under the nose, and a chin antenna ---- */
    parts.push(makeLoftY([
      { y: -0.060, cz: 0.62, r: 0.050 },
      { y: -0.092, cz: 0.62, r: 0.062 },
      { y: -0.128, cz: 0.62, r: 0.048 },
    ], 10));
    parts.push(makeRing(0, -0.100, 0.672, 0.030, 10, "z"));       // its window
    parts.push(makeBox(0, -0.050, 0.30, 0.09, 0.022, 0.17));      // chin antenna fairing

    // ---- panel lines along the fuselage: three stringers a side ----
    [-1, 1].forEach((sd) => {
      [0.055, -0.02, -0.09].forEach((y) => {
        parts.push({
          v: [[sd * 0.126, y, 0.62], [sd * 0.150, y, 0.30], [sd * 0.150, y, -0.10], [sd * 0.118, y, -0.42]],
          e: [[0, 1], [1, 2], [2, 3]], f: [],
        });
      });
    });

    // ---- skids on inverted-V struts, with step pads ----
    const KY = -0.30;
    [-0.27, 0.27].forEach((x) => {
      parts.push(tubeAlong([x, KY, -0.46], [x, KY, 0.46], 0.038, 10));       // skid tube
      parts.push(tubeAlong([x, KY, 0.46], [x, KY + 0.09, 0.60], 0.032, 8));  // upturned tip
      parts.push(tubeAlong([x, KY, -0.46], [x, KY + 0.06, -0.56], 0.028, 8));
      // Two braced cross-frames per side rather than single legs: a skid that
      // has to absorb a vertical arrival needs a triangle, not a post.
      [-0.28, 0.30].forEach((z) => {
        parts.push(segBox([x, KY, z], [x * 0.38, -0.10, z], 0.036));
        parts.push(segBox([x, KY, z], [x * 0.60, -0.10, z + (z > 0 ? -0.16 : 0.16)], 0.024));
        parts.push(makeBox(x * 0.38, -0.09, z, 0.10, 0.05, 0.08));           // fuselage hard point
      });
      parts.push(makeBox(x, KY + 0.046, 0.02, 0.095, 0.020, 0.26));          // step pad
      parts.push(tubeAlong([x, KY + 0.012, -0.28], [x, KY + 0.012, 0.30], 0.018, 6)); // fore-aft brace
    });
    parts.push(makeBase(-0.96, 1.16));

    const m = merge(parts);
    m.spinners = [];
    const PIV = [0.985, WY - WT / 2, LE(1.0) - (LE(1.0) - TE(1.0)) * 0.42];
    m.dynamic = function (time) {
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);
      // tilt cycle: hover ↔ cruise with a dwell at each end
      const a = (time * 0.15) % 1;
      const tri = a < 0.5 ? a * 2 : 2 - a * 2;
      const sm = V.ss(V.ss(tri));
      const tlt = sm * (Math.PI / 2);            // 0 = rotors up, π/2 = rotors forward
      const ct = Math.cos(tlt), st = Math.sin(tlt);
      const axis = [0, ct, st];
      const e1 = [1, 0, 0], e2 = [0, st, -ct];
      const spin = time * 7.5;
      [-1, 1].forEach((side) => {
        const hub0 = [side * PIV[0], PIV[1], PIV[2]];
        // nacelle: a lofted pod along the thrust axis, capped at both ends
        P.tube(V.add(hub0, V.mul(axis, -0.26)), axis, [
          { d: 0, r: 0.042 }, { d: 0.10, r: 0.078 }, { d: 0.22, r: 0.090 },
          { d: 0.34, r: 0.072 }, { d: 0.42, r: 0.048 },
        ], 12, 1.05);
        P.cap(V.add(hub0, V.mul(axis, -0.26)), e1, e2, 0.042, 12, 1.0);
        // intake lip and exhaust ring
        P.ringUV(V.add(hub0, V.mul(axis, -0.20)), e1, e2, 0.070, 12, 0.95);
        P.ringUV(V.add(hub0, V.mul(axis, 0.10)), e1, e2, 0.088, 12, 0.95);
        // tilt bearing on the wing tip, and the actuator ram driving it
        P.ringUV(hub0, [0, 1, 0], [0, 0, 1], 0.058, 12, 1.05);
        const ramEnd = V.add(hub0, V.mul(axis, -0.16));
        P.beam([side * 0.86, PIV[1] - 0.02, PIV[2] - 0.10], ramEnd, 0.016, 0.95, 0.012);
        // spinner + three proprotor blades in the tilting disc
        const hub = V.add(hub0, V.mul(axis, 0.22));
        P.tube(hub, axis, [{ d: 0, r: 0.048 }, { d: 0.05, r: 0.030 }, { d: 0.075, r: 0.008 }], 10, 1.0);
        const R = 0.44;
        for (let b = 0; b < 3; b++) {
          const ba = spin + (b / 3) * Math.PI * 2 + side;
          const cb = Math.cos(ba), sb = Math.sin(ba);
          const pts = BLADE.map(([u, vv]) => {
            const c = (u * cb - vv * sb) * R, s2 = (u * sb + vv * cb) * R;
            return [hub[0] + e1[0] * c + e2[0] * s2, hub[1] + e1[1] * c + e2[1] * s2, hub[2] + e1[2] * c + e2[2] * s2];
          });
          P.loop(pts, 1.0);
          P.face(pts);
        }
        // tip-path circle, faint, so the disc reads between blades
        P.ringUV(hub, e1, e2, R, 30, 0.55);
      });

      // control surfaces
      const surface = (h0, h1, chordDir, chordLen, defl) => {
        const u = V.norm(V.sub(h1, h0));
        const dp = chordDir[0] * u[0] + chordDir[1] * u[1] + chordDir[2] * u[2];
        const d0 = V.norm(V.sub(chordDir, V.mul(u, dp)));
        const ux = V.cross(u, d0), cd = Math.cos(defl), sd = Math.sin(defl);
        const d = V.mul(V.add(V.mul(d0, cd), V.mul(ux, sd)), chordLen);
        const q = [h0, h1, V.add(h1, d), V.add(h0, d)];
        P.loop(q, 1.05);
        P.face(q);
      };
      const droop = (1 - sm) * 0.42, roll = Math.sin(time * 0.9) * 0.22 * sm;
      surface([0.42, WY - WT / 2, TE(0.42)], [0.92, WY - WT / 2, TE(0.92)], [0, 0, -1], 0.10, droop + roll);
      surface([-0.42, WY - WT / 2, TE(0.42)], [-0.92, WY - WT / 2, TE(0.92)], [0, 0, -1], 0.10, droop - roll);
      /* Ruddervators. Pitch moves them together; yaw moves them apart. Both
         inputs run at once on a real aircraft, so both run here — the two
         surfaces are almost never at the same angle, which is the tell that
         this is a V-tail and not two elevators. */
      const pitchIn = Math.sin(time * 0.8) * 0.20 * sm;
      const yawIn = Math.sin(time * 0.55 + 1.4) * 0.16 * sm;
      [-1, 1].forEach((sd) => {
        const root = [0, TZ, -0.90];
        const tip = [sd * VX, TZ + VY, -0.90];
        surface(root, tip, [0, 0, -1], 0.105, pitchIn + sd * yawIn);
      });

      /* Lights. There is deliberately nothing blinking in the middle of the
         tail — a V-tail has no centre to put a light on, and a strobe there
         drew the eye to the one part of the aircraft that should be quiet.
         Steady nav lights sit on the two ruddervator tips and the wing tips
         instead, and the landing light is on in the hover and off in cruise,
         which is what a real one does. */
      dots.push([-VX, TZ + VY, -0.82, 1.5, 1], [VX, TZ + VY, -0.82, 1.5, 1]);
      dots.push([-1.0, WY, LE(1.0), 1.6, 1], [1.0, WY, LE(1.0), 1.6, 1]);
      dots.push([0, -0.10, 0.86, sm < 0.5 ? 2.6 : 0.9, sm < 0.5 ? 1 : 0]);
      return { segments: segs, faces, dots };
    };
    return m;
  }

  /* NEMO camera arm — a six-axis robot on a long linear slide.

     Three things drive this shape, and all three were wrong before:

       · THE RAIL IS THE BIG DIMENSION. The travel is what the machine is
         for — a camera that can run the length of a set — so the rail is
         well over twice the arm's reach and everything else is scaled
         against it. A short rail made the whole rig read as a benchtop toy.

       · THE BASE IS SMALL. It is a slew bearing on a carriage, not a
         pedestal: barely wider than the column standing on it. Mass at the
         bottom of a machine that has to move along a rail is dead weight,
         and drawing it that way said the opposite of what this thing is.

       · THE LINKS ARE FABRICATED, NOT SOLID. A real light arm is two side
         plates with lightening holes bridged by a spine, and a forearm
         that is a tube. Three tapered sticks read as a diagram of an arm;
         plate-and-spine construction with holes through it reads as
         something built to hold a camera steady and stay light doing it.

     Axis 1 slews the whole machine; axes 2, 3 and 5 work in the arm's own
     plane; the links are laterally offset so the machine cranks through
     itself. Everything above the carriage is drawn per frame with faces. */
  function buildArm() {
    const parts = [];

    // ---- linear slide: the long axis of the whole machine ----
    const rx = 0.30, ry = -0.90, rlen = 2.30;
    [-rx, rx].forEach((x) => {
      parts.push(makeBox(x, ry, 0, 0.075, 0.075, rlen));
      parts.push(makeBox(x, ry + 0.046, 0, 0.090, 0.016, rlen));
    });
    [-1, 1].forEach((sd) => {
      parts.push(makeBox(0, ry, sd * rlen / 2, 0.80, 0.135, 0.085));        // end mount
      parts.push(makeBox(0, ry - 0.085, sd * rlen / 2, 0.92, 0.045, 0.135)); // foot plate
    });
    parts.push(tubeAlong([0, ry, -rlen / 2 - 0.085], [0, ry, -rlen / 2 - 0.225], 0.088, 10)); // drive
    parts.push(makeBox(0, ry, -rlen / 2 - 0.245, 0.145, 0.145, 0.045));
    parts.push(tubeAlong([0, ry, -rlen / 2], [0, ry, rlen / 2], 0.019, 8));  // leadscrew
    // mid-span supports, so a rail this long does not look unsupported
    [-0.38, 0.38].forEach((f) => parts.push(makeBox(0, ry - 0.075, f * rlen, 0.86, 0.05, 0.10)));
    // energy chain down the near rail
    for (let i = 0; i < 10; i++) {
      const z = -rlen / 2 + 0.12 + i * (rlen - 0.24) / 9;
      parts.push(makeBox(rx + 0.066, ry + 0.026, z, 0.030, 0.040, 0.050));
    }
    parts.push(makeBase(-1.00, 1.26));

    const m = merge(parts);
    m.spinners = [];
    m.deploys = true;
    m.zoom = 1.16;   // crop the rail ends; the robot is the subject

    m.dynamic = function (time, deploy, spin, hoverT) {
      deploy = deploy == null ? 1 : deploy;
      spin = spin == null ? 0 : spin;
      hoverT = hoverT == null ? 99 : hoverT;
      const dep = deploy * deploy * (3 - 2 * deploy);
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);

      /* THE SUBJECT. Everything below is solved to keep the camera on this
         point, so the rig is doing a job rather than running through angles.
         It crosses in front of the rail, drifts nearer and further, and
         changes height slightly — a person moving around a set. */
      const SUB = [
        0.74 + Math.sin(time * 0.23 + 1.1) * 0.18,
        -0.15 + Math.sin(time * 0.51) * 0.06,
        Math.sin(time * 0.30) * 0.82,
      ];

      // axis 0: the carriage runs the rail to keep pace with the subject —
      // which is the entire reason a slider this long exists
      const bz = Math.max(-rlen * 0.40, Math.min(rlen * 0.40, SUB[2])) * dep;
      // axis 1: slew to face it. W() maps local reach +u to world
      // (cos yaw, -sin yaw), so the yaw that points at the subject is this.
      const yaw = Math.atan2(-(SUB[2] - bz), SUB[0]) * dep;
      const cy1 = Math.cos(yaw), sy1 = Math.sin(yaw);
      const W = (u, y, v) => [u * cy1 + v * sy1, y, bz + (-u * sy1 + v * cy1)];

      // ---- carriage on the rails ----
      P.box(0, -0.850, bz, 0.52, 0.046, 0.34, 1.15);
      [-rx, rx].forEach((x) => {
        P.box(x, -0.884, bz, 0.130, 0.098, 0.26, 1.05);
        P.box(x, -0.830, bz, 0.150, 0.016, 0.28, 0.95);
      });

      /* ---- axis 1. A slew bearing, not a plinth: half the diameter it
             used to be and barely proud of the carriage. ---- */
      P.tube([0, -0.826, bz], [0, 1, 0], [
        { d: 0, r: 0.098 }, { d: 0.030, r: 0.094 }, { d: 0.062, r: 0.080 },
      ], 14, 1.15);
      P.ring(0, -0.766, bz, 0.084, 16, "y", 1.15);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        P.line([Math.cos(a) * 0.092, -0.772, bz + Math.sin(a) * 0.092],
               [Math.cos(a) * 0.092, -0.760, bz + Math.sin(a) * 0.092], 0.85);
      }

      // ---- the column: slim, boxy, carrying the shoulder off one side ----
      const SHy = -0.400, vSH = 0.0;
      const colB = -0.756, colT = SHy + 0.035;
      const cCor = (y, w, d) => [
        W(-w, y, vSH + d), W(w, y, vSH + d), W(w, y, vSH - d), W(-w, y, vSH - d),
      ];
      const cb = cCor(colB, 0.096, 0.096), ct = cCor(colT, 0.074, 0.082);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        P.line(cb[i], cb[j], 1.15); P.line(ct[i], ct[j], 1.15); P.line(cb[i], ct[i], 1.15);
        P.face([cb[i], cb[j], ct[j], ct[i]]);
      }
      P.face([ct[0], ct[1], ct[2], ct[3]]);

      /* ---- axes 2, 3 and 5. Longer links than before, because the arm
             grew with the rail; the last one is still the short one. ---- */
      const L2 = 0.520, L3 = 0.330, L4 = 0.088;

      /* Two-link inverse kinematics. Given where the wrist should be — out
         toward the subject, a little above it — this solves the shoulder and
         elbow that put it there, instead of animating both and hoping. The
         reach is a fraction of the distance to the subject so the camera
         sits between the rig and the shot rather than lunging at it. */
      const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
      const flat = Math.hypot(SUB[0], SUB[2] - bz);
      /* Reach far enough that the arm EXTENDS. At 0.44 of the distance the
         solver put the elbow directly above the shoulder and folded the
         forearm back over it — a hunched pose using 61% of the arm's reach,
         which is what made it look wrong. 0.70 works it out at about 69%,
         where the elbow is out over the rail and the machine reads as
         holding a camera out rather than hugging itself. */
      const reach = clamp(flat * 0.70, 0.30, L2 + L3 - 0.05);
      const rise = clamp((SUB[1] - SHy) + 0.02, -0.10, L2 + L3 - 0.12);
      const D = clamp(Math.hypot(reach, rise), Math.abs(L2 - L3) + 0.02, L2 + L3 - 0.02);
      const interior = Math.acos(clamp((L2 * L2 + L3 * L3 - D * D) / (2 * L2 * L3), -1, 1));
      const offset = Math.acos(clamp((L2 * L2 + D * D - L3 * L3) / (2 * L2 * D), -1, 1));
      const a2ik = Math.atan2(reach, rise) - offset;
      const a3ik = Math.PI - interior;                     // elbow up
      /* Wrist pitch, actually solved: point the flange from where the wrist
         ends up toward the subject. The previous expression combined the
         joint angles and a constant and solved for nothing, so the head was
         being dragged into aim by its own look-at against a flange pointing
         somewhere else. */
      const d23ik = a2ik + a3ik;
      const wxik = Math.sin(a2ik) * L2 + Math.sin(d23ik) * L3;
      const wyik = Math.cos(a2ik) * L2 + Math.cos(d23ik) * L3;
      const a5ik = Math.atan2(flat - wxik, (SUB[1] - SHy) - wyik) - d23ik;

      // parked: folded down over the base until the rig is woken up
      const col = [1.00, 1.92, 1.06];
      const a2 = col[0] + (a2ik - col[0]) * dep;
      const a3 = col[1] + (a3ik - col[1]) * dep;
      const a5 = col[2] + (a5ik - col[2]) * dep;

      const SH = [0, SHy];
      const EL = [SH[0] + Math.sin(a2) * L2, SH[1] + Math.cos(a2) * L2];
      const d23 = a2 + a3;
      const WR = [EL[0] + Math.sin(d23) * L3, EL[1] + Math.cos(d23) * L3];
      const d5 = d23 + a5;
      const TL = [WR[0] + Math.sin(d5) * L4, WR[1] + Math.cos(d5) * L4];
      const vUP = 0.062, vFA = 0.012;

      // A drum on the lateral axis — every joint housing on the machine.
      const drum = (Pt, v, r, half, seg, lw) => {
        const c0 = W(Pt[0], Pt[1], v - half), c1 = W(Pt[0], Pt[1], v + half);
        const ax = V.sub(c1, c0), L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
        P.tube(c0, ax, [{ d: 0, r: r }, { d: L, r: r }], seg, lw);
        const u1 = V.norm(V.sub(W(Pt[0] + 1, Pt[1], v), W(Pt[0], Pt[1], v)));
        P.cap(c1, u1, [0, 1, 0], r, seg, lw * 0.9);
        P.cap(c0, [0, 1, 0], u1, r, seg, lw * 0.9);
        return u1;
      };

      // shoulder bearing, and its motor tucked behind the column
      const shAx = drum(SH, vSH + 0.034, 0.088, 0.062, 14, 1.15);
      const mc0 = W(SH[0], SH[1], vSH - 0.042), mc1 = W(SH[0] - 0.010, SH[1] - 0.010, vSH - 0.158);
      const mcL = Math.hypot(mc1[0] - mc0[0], mc1[1] - mc0[1], mc1[2] - mc0[2]);
      P.tube(mc0, V.sub(mc1, mc0), [
        { d: 0, r: 0.070 }, { d: mcL * 0.72, r: 0.070 }, { d: mcL, r: 0.048 },
      ], 12, 1.05);
      P.cap(mc1, shAx, [0, 1, 0], 0.040, 12, 0.95);

      /* ---- THE UPPER ARM. Two side plates with lightening holes, bridged
             by a spine tube — the construction a light arm actually uses,
             and the thing that makes a link read as structure rather than
             as a stick. ---- */
      const plateLink = (A, B, vMid, gap, wA, wB, holes) => {
        const dU = B[0] - A[0], dY = B[1] - A[1];
        const len = Math.hypot(dU, dY) || 1;
        const nu = -dY / len, ny = dU / len;          // in-plane normal
        [-1, 1].forEach((sd) => {
          const v = vMid + sd * gap;
          const q = [
            W(A[0] + nu * wA, A[1] + ny * wA, v), W(B[0] + nu * wB, B[1] + ny * wB, v),
            W(B[0] - nu * wB, B[1] - ny * wB, v), W(A[0] - nu * wA, A[1] - ny * wA, v),
          ];
          P.loop(q, 1.2);
          P.face(q);
          // lightening holes, drawn just proud of the plate so they read
          for (let h = 0; h < holes; h++) {
            const f = (h + 1) / (holes + 1);
            const cU = A[0] + dU * f, cY = A[1] + dY * f;
            const r = (wA + (wB - wA) * f) * 0.52;
            const c = W(cU, cY, v + sd * 0.004);
            const uAx = V.norm(V.sub(W(cU + nu, cY + ny, v), c));
            const vAx = V.norm(V.sub(W(cU + dU / len, cY + dY / len, v), c));
            P.ringUV(c, uAx, vAx, r, 10, 0.95);
          }
        });
        // the spine between the plates, plus end webs closing the box
        const sA = W(A[0], A[1], vMid), sB = W(B[0], B[1], vMid);
        P.tube(sA, V.sub(sB, sA), [
          { d: 0, r: gap * 0.62 }, { d: len, r: gap * 0.52 },
        ], 10, 1.05);
        [[A, wA], [B, wB]].forEach(([Pt, w]) => {
          P.face([
            W(Pt[0] + nu * w, Pt[1] + ny * w, vMid - gap), W(Pt[0] + nu * w, Pt[1] + ny * w, vMid + gap),
            W(Pt[0] - nu * w, Pt[1] - ny * w, vMid + gap), W(Pt[0] - nu * w, Pt[1] - ny * w, vMid - gap),
          ]);
        });
      };
      plateLink(SH, EL, vUP, 0.066, 0.108, 0.088, 2);

      // elbow: the widest housing on the arm, with its own drive
      drum(EL, vUP - 0.004, 0.098, 0.078, 14, 1.15);
      const em0 = W(EL[0], EL[1], vUP + 0.068), em1 = W(EL[0] - 0.010, EL[1] - 0.010, vUP + 0.172);
      const emL = Math.hypot(em1[0] - em0[0], em1[1] - em0[1], em1[2] - em0[2]);
      P.tube(em0, V.sub(em1, em0), [{ d: 0, r: 0.050 }, { d: emL, r: 0.044 }], 10, 1.0);

      /* ---- THE FOREARM IS A TUBE. Round section, tapering, with a flange
             at each end — which is both what these are actually made of and
             the shape that stops the arm reading as three flat sticks. ---- */
      const faDir = [Math.sin(d23), Math.cos(d23)];
      const fa0 = W(EL[0] + faDir[0] * 0.045, EL[1] + faDir[1] * 0.045, vFA);
      const fa1 = W(WR[0] - faDir[0] * 0.030, WR[1] - faDir[1] * 0.030, vFA);
      const faL = Math.hypot(fa1[0] - fa0[0], fa1[1] - fa0[1], fa1[2] - fa0[2]) || 0.001;
      const faAx = V.sub(fa1, fa0);
      P.tube(fa0, faAx, [
        { d: 0, r: 0.076 }, { d: faL * 0.14, r: 0.072 },
        { d: faL * 0.80, r: 0.055 }, { d: faL, r: 0.062 },
      ], 14, 1.15);
      // flanges: a ring of bolts at each end, so it reads as bolted together
      const faU = V.norm(V.cross(faAx, [0, 0, 1])), faV = V.norm(V.cross(faAx, faU));
      P.ringUV(fa0, faU, faV, 0.088, 12, 1.05);
      P.ringUV(fa1, faU, faV, 0.074, 12, 1.05);
      // a cable conduit clipped along the outside of the tube
      P.line(W(EL[0] + faDir[0] * 0.06, EL[1] + faDir[1] * 0.06, vFA + 0.070),
             W(WR[0] - faDir[0] * 0.04, WR[1] - faDir[1] * 0.04, vFA + 0.056), 0.95);

      // ---- wrist: compact roll-pitch, then the tool mount ----
      const w0 = W(WR[0] - faDir[0] * 0.026, WR[1] - faDir[1] * 0.026, vFA);
      const w1 = W(WR[0] + faDir[0] * 0.018, WR[1] + faDir[1] * 0.018, vFA);
      P.tube(w0, V.sub(w1, w0), [
        { d: 0, r: 0.050 }, { d: Math.hypot(w1[0] - w0[0], w1[1] - w0[1], w1[2] - w0[2]), r: 0.046 },
      ], 12, 1.1);
      drum(WR, vFA, 0.046, 0.048, 12, 1.05);

      /* ---- THE TOOL MOUNT. A real attachment: a flanged boss off the
             wrist and a plate the camera bolts to, rather than a lens
             appearing out of the end of the last link. ---- */
      const tDir = [Math.sin(d5), Math.cos(d5)];
      const f0 = W(WR[0] + tDir[0] * 0.028, WR[1] + tDir[1] * 0.028, vFA);
      const f1 = W(TL[0], TL[1], vFA);
      const fAx = V.sub(f1, f0);
      const fL = Math.hypot(fAx[0], fAx[1], fAx[2]) || 0.001;
      P.tube(f0, fAx, [
        { d: 0, r: 0.038 }, { d: fL * 0.62, r: 0.036 }, { d: fL, r: 0.062 },
      ], 12, 1.1);
      const tU = V.norm(V.cross(fAx, [0, 0, 1])), tV = V.norm(V.cross(fAx, tU));
      P.ringUV(f1, tU, tV, 0.074, 12, 1.15);                 // mounting flange
      P.cap(f1, tU, tV, 0.074, 12, 1.0);
      for (let i = 0; i < 4; i++) {                          // its bolts
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const b = [f1[0] + tU[0] * Math.cos(a) * 0.046 + tV[0] * Math.sin(a) * 0.046,
                   f1[1] + tU[1] * Math.cos(a) * 0.046 + tV[1] * Math.sin(a) * 0.046,
                   f1[2] + tU[2] * Math.cos(a) * 0.046 + tV[2] * Math.sin(a) * 0.046];
        dots.push([b[0], b[1], b[2], 0.9, 0]);
      }

      // ---- the camera on the mount ----
      /* The head looks at the subject. A small lagging correction is added
         on top: a real operator is always a fraction behind the movement and
         catching up, and a head that tracks perfectly reads as a servo. */
      const lock = Math.max(0, Math.min(1, (hoverT - 1.2) / 0.8));
      const lockS = lock * lock * (3 - 2 * lock);
      const settle = Math.sin(time * 1.7) * 0.035 * (1 - lockS * 0.7);
      const aim = V.norm(V.sub(SUB, f1));
      const fAct = V.norm([aim[0], aim[1] + settle, aim[2]]);
      const fPark = V.norm(V.sub(W(TL[0] + tDir[0], TL[1] + tDir[1], vFA), f1));
      const fv = V.norm([
        fPark[0] * (1 - dep) + fAct[0] * dep,
        fPark[1] * (1 - dep) + fAct[1] * dep,
        fPark[2] * (1 - dep) + fAct[2] * dep,
      ]);
      let rgt = V.cross(fv, [0, 1, 0]);
      if (Math.hypot(rgt[0], rgt[1], rgt[2]) < 0.001) rgt = [1, 0, 0];
      rgt = V.norm(rgt);
      const cup = V.cross(fv, rgt);
      const O = f1;
      const C = (d, u, v) => [
        O[0] + fv[0] * d + rgt[0] * u + cup[0] * v,
        O[1] + fv[1] * d + rgt[1] * u + cup[1] * v,
        O[2] + fv[2] * d + rgt[2] * u + cup[2] * v,
      ];
      const bw = 0.058, bh = 0.046, z0 = 0.014, z1 = 0.112;
      const bk = [C(z0, -bw, -bh), C(z0, bw, -bh), C(z0, bw, bh), C(z0, -bw, bh)];
      const fr = [C(z1, -bw, -bh), C(z1, bw, -bh), C(z1, bw, bh), C(z1, -bw, bh)];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        P.line(bk[i], bk[j], 1.15); P.line(fr[i], fr[j], 1.15); P.line(bk[i], fr[i], 1.15);
        P.face([bk[i], bk[j], fr[j], fr[i]]);
      }
      P.face([bk[3], bk[2], bk[1], bk[0]]);
      P.face(fr);
      P.tube(C(z1, 0, -0.003), fv, [
        { d: 0, r: 0.034 }, { d: 0.042, r: 0.034 }, { d: 0.052, r: 0.040 },
      ], 12, 1.1);
      P.cap(C(z1 + 0.052, 0, -0.003), rgt, cup, 0.040, 12, 0.95);
      P.ringUV(C(z1 + 0.027, 0, -0.003), rgt, cup, 0.027, 10, 0.9);
      P.line(C(0.028, -0.024, bh), C(0.028, -0.024, bh + 0.024), 0.95);
      P.line(C(0.092, -0.024, bh), C(0.092, -0.024, bh + 0.024), 0.95);
      P.line(C(0.028, -0.024, bh + 0.024), C(0.092, -0.024, bh + 0.024), 0.95);
      P.face([C(0.018, bw, -0.012), C(0.018, bw + 0.032, -0.018), C(0.082, bw + 0.032, -0.018), C(0.082, bw, -0.012)]);

      const lc = C(z1 + 0.064, 0, -0.003);
      dots.push([lc[0], lc[1], lc[2], 2.2 + lockS * 1.3, 1]);
      // record tally, blinking the way a camera's does while rolling
      const rolling = lockS > 0.9 && (time * 1.1) % 1 < 0.62;
      const tally = C(z0 + 0.012, bw * 0.6, bh);
      dots.push([tally[0], tally[1], tally[2], rolling ? 2.0 : 0.85, rolling ? 1 : 0]);

      /* What it is shooting: a framing reticle on the subject, closing in as
         the shot settles. Without this the arm is aiming at nothing and the
         viewer has no way to know it is tracking rather than sweeping. */
      if (dep > 0.4) {
        const fr2 = 0.10 + (1 - lockS) * 0.10, tick = 0.038;
        const rt = V.norm(V.cross(fv, [0, 1, 0]));
        const upv = V.cross(fv, rt);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
          const corner = V.add(SUB, V.add(V.mul(rt, sx * fr2), V.mul(upv, sy * fr2)));
          P.line(corner, V.sub(corner, V.mul(rt, sx * tick)), 0.95);
          P.line(corner, V.sub(corner, V.mul(upv, sy * tick)), 0.95);
        });
        dots.push([SUB[0], SUB[1], SUB[2], 1.5, lockS > 0.9 ? 1 : 0]);
      }
      return { segments: segs, faces, dots };
    };
    return m;
  }

  /* i4 — the 3" ducted mini quad actually on the bench (a cinewhoop).
     Modelled from Tyler's CAD render: four slim printed ducts, each a smooth
     upper band over a ribbed lower band with two small feet; a motor held in
     the middle of each duct by three struts, one of which is the arm back to
     the body; tri-blade props inside the ducts; a body that is a chamfered
     rectangle with a bevelled top, three vent slots and a round button; "I4"
     on both flanks; a boxed camera in the nose; and a single 5.8 GHz antenna
     out the back with the small cylindrical tip that makes it look like a
     capacitor.

     It flies: no projector pad under it, and model.bob() lifts and settles it
     so it reads as hovering rather than parked.

     Ducts are closed surfaces (outer wall, inner wall, lips) so the near
     wall hides the lower half of a prop behind it — which is what makes a
     prop read as INSIDE a duct rather than floating over one. Keep the walls
     thin and short: thick tall ducts read as bulky cells, not a duct. */
  function buildDrone() {
    const parts = [];
    const SEG = 40;
    const D = 0.40;                           // duct centre offset in x and z
    const RO = 0.325, RI = 0.302;             // duct outer / inner radius
    const Y0 = -0.035, YM = 0.012, Y1 = 0.055; // duct bottom, band split, top lip

    // A duct wall: top and bottom rings with side faces and NO vertical edges,
    // so the upper band reads smooth; only the ribs below carry verticals.
    const wall = (cx, cz, r, y0, y1) => {
      const m = makeCylinderY(cx, (y0 + y1) / 2, cz, r, y1 - y0, SEG, true);
      m.e = m.e.filter(([i, j]) => j - i !== SEG);
      return m;
    };
    // The flat ring joining two radii at one height (the duct's lip).
    const annulus = (cx, cz, r0, r1, y) => {
      const a = makeRing(cx, y, cz, r0, SEG, "y"), b = makeRing(cx, y, cz, r1, SEG, "y");
      const m = merge([a, b]);
      for (let i = 0; i < SEG; i++) {
        const j = (i + 1) % SEG;
        m.f.push([i, j, SEG + j, SEG + i]);
      }
      return m;
    };

    // ---- the body: a chamfered rectangle, longer than it is wide ----
    const BW = 0.15, BL = 0.23, CH = 0.055;   // half-width (x), half-length (z), corner chamfer
    const outline = (w, l, c, y) => [
      [w, y, l - c], [w - c, y, l], [-w + c, y, l], [-w, y, l - c],
      [-w, y, -l + c], [-w + c, y, -l], [w - c, y, -l], [w, y, -l + c],
    ];

    /* Built to survive a crash. Three things make a printed whoop frame
       tough, and all three are drawn:
         1. One-piece arms: each arm is a single wide, thick beam from the
            body's corner straight through the duct wall to under the motor,
            not a thin strut that meets a separate duct.
         2. The ducts are tied to each other by low bridges where they come
            closest, so the four ducts and the body form one closed ring —
            a hit on one duct spreads through the frame instead of levering
            one arm off.
         3. A bumper band: the ribbed lower band stands proud of the duct and
            is the thickest wall, because it is what meets the floor. */
    const RB = RO + 0.015;                    // bumper band radius
    const ducts = [[D, D], [-D, D], [-D, -D], [D, -D]];
    const spinners = [];
    for (const [cx, cz] of ducts) {
      parts.push(wall(cx, cz, RO, YM, Y1));                    // upper band (smooth)
      parts.push(wall(cx, cz, RB, Y0, YM));                    // bumper band (proud)
      parts.push(wall(cx, cz, RI, Y0, Y1));                    // inner wall
      parts.push(annulus(cx, cz, RI, RO, Y1));                 // top lip
      parts.push(annulus(cx, cz, RO, RB, YM));                 // the step onto the bumper
      parts.push(annulus(cx, cz, RI, RB, Y0));                 // bottom rim
      // vertical ribs on the bumper — the printed vent pattern
      const ribs = { v: [], e: [] };
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2, c = Math.cos(a) * (RB + 0.003), s = Math.sin(a) * (RB + 0.003);
        const n = ribs.v.length;
        ribs.v.push([cx + c, Y0 + 0.008, cz + s], [cx + c, YM - 0.006, cz + s]);
        ribs.e.push([n, n + 1]);
      }
      parts.push(ribs);
      // two small feet under the outer side of the duct
      const out = Math.atan2(cz, cx);
      [-0.55, 0.55].forEach((da) => {
        const a = out + da;
        parts.push(makeBox(cx + Math.cos(a) * (RB - 0.014), Y0 - 0.014, cz + Math.sin(a) * (RB - 0.014), 0.034, 0.028, 0.034));
      });

      // motor on a round mount
      const my = -0.02;
      parts.push(makeCylinderY(cx, my, cz, 0.05, 0.03, 14));          // mount boss
      parts.push(makeCylinderY(cx, my + 0.04, cz, 0.052, 0.05, 14));  // bell
      parts.push(makeRing(cx, my + 0.066, cz, 0.018, 8, "y"));        // prop nut
      const inboard = Math.atan2(-cz, -cx);
      // the arm: one wide beam from the body's corner to under the motor
      const corner = [Math.sign(cx) * (BW - CH * 0.5), my, Math.sign(cz) * (BL - CH * 0.5)];
      const hub = [cx + Math.cos(inboard) * 0.03, my, cz + Math.sin(inboard) * 0.03];
      parts.push(segBoxXZ(corner, hub, 0.062, 0.03));
      // two outboard struts, heavier than before, closing the motor into the duct
      [2.1, -2.1].forEach((da) => {
        const a = inboard + da;
        const p0 = [cx + Math.cos(a) * 0.045, my, cz + Math.sin(a) * 0.045];
        const p1 = [cx + Math.cos(a) * RI, my, cz + Math.sin(a) * RI];
        parts.push(segBoxXZ(p0, p1, 0.032, 0.024));
      });
      // gussets where the arm meets the inside of the duct wall, both sides
      const tx = -Math.sin(inboard), tz = Math.cos(inboard);       // tangent to the wall
      const wx = cx + Math.cos(inboard) * RI, wz = cz + Math.sin(inboard) * RI;
      [1, -1].forEach((sg) => {
        const armEdge = [wx + tx * sg * 0.031, wz + tz * sg * 0.031];
        const alongWall = [wx + tx * sg * 0.1 - Math.cos(inboard) * 0.012, wz + tz * sg * 0.1 - Math.sin(inboard) * 0.012];
        const alongArm = [armEdge[0] - Math.cos(inboard) * 0.07, armEdge[1] - Math.sin(inboard) * 0.07];
        parts.push(plate([armEdge, alongWall, alongArm], "xz", my, 0.024));
      });
      // vertical stiffeners inside the wall where each strut lands
      [0, 2.1, -2.1].forEach((da) => {
        const a = inboard + da, rr = RI - 0.008;
        parts.push(makeBox(cx + Math.cos(a) * rr, (Y0 + Y1) / 2, cz + Math.sin(a) * rr, 0.018, Y1 - Y0 - 0.006, 0.018));
      });
      // Props in: each diagonal pair turns the same way and the two pairs
      // turn opposite, so the front blades sweep inward toward the camera
      // and the yaw torques cancel. All four the same way would spin it.
      const dir = Math.sign(cx) * Math.sign(cz);
      spinners.push({ cx, cy: my + 0.08, cz, r: 0.275, blades: 3, speed: 9 * dir, dir });
    }
    // low bridges tying each duct to its neighbours, at bumper height — kept
    // low at the front so they never sit in the camera's view
    const gap = D - RB, bh = 0.03, by = Y0 + bh / 2;
    [[0, D], [0, -D]].forEach(([x, z]) => parts.push(makeBox(x, by, z, gap * 2 + 0.03, bh, 0.05)));
    [[D, 0], [-D, 0]].forEach(([x, z]) => parts.push(makeBox(x, by, z, 0.05, bh, gap * 2 + 0.03)));
    // and a second tie at the lip on the back and both sides (not the front:
    // nothing may cross the camera's view), so each pair of ducts is boxed
    const ty = Y1 - 0.012;
    parts.push(makeBox(0, ty, -D, gap * 2 + 0.03, 0.022, 0.04));
    [[D, 0], [-D, 0]].forEach(([x, z]) => parts.push(makeBox(x, ty, z, 0.04, 0.022, gap * 2 + 0.03)));

    // body shell: straight sides, then a bevel to a smaller flat top
    const rings = [
      outline(BW, BL, CH, -0.05),
      outline(BW, BL, CH, 0.045),
      outline(BW - 0.03, BL - 0.035, CH * 0.8, 0.095),
      outline(BW - 0.055, BL - 0.07, CH * 0.6, 0.11),
    ];
    const body = { v: [].concat(...rings), e: [], f: [] };
    for (let r = 0; r < rings.length; r++) {
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        body.e.push([r * 8 + i, r * 8 + j]);
        if (r < rings.length - 1) {
          body.e.push([r * 8 + i, (r + 1) * 8 + i]);
          body.f.push([r * 8 + i, r * 8 + j, (r + 1) * 8 + j, (r + 1) * 8 + i]);
        }
      }
    }
    body.f.push([24, 25, 26, 27, 28, 29, 30, 31]);           // flat top
    body.f.push([7, 6, 5, 4, 3, 2, 1, 0]);                   // underside
    parts.push(body);
    // three vent slots across the top, and the round button behind them
    [0.045, 0.01, -0.025].forEach((sz) => {
      const y = 0.112, hw = 0.05, hd = 0.008;
      parts.push({ v: [[-hw, y, sz - hd], [hw, y, sz - hd], [hw, y, sz + hd], [-hw, y, sz + hd]],
                   e: [[0, 1], [1, 2], [2, 3], [3, 0]] });
    });
    parts.push(makeRing(0, 0.112, -0.09, 0.014, 10, "y"));

    // "I4" on both flanks, as on the CAD. Seen from +x, screen-right is -z;
    // from -x it is +z — so each side runs its own way and neither reads mirrored.
    const glyphs = (side) => {
      const x = side * (BW + 0.003), dir = -side;             // z step toward the reader's right
      const y0 = -0.028, y1 = 0.028, z0 = side * 0.07;       // start near the nose
      const P = (u, yy) => [x, yy, z0 + dir * u];
      const g = { v: [], e: [] };
      const seg = (a, b) => { const n = g.v.length; g.v.push(a, b); g.e.push([n, n + 1]); };
      seg(P(0, y0), P(0, y1));                                // I
      seg(P(0.075, y0), P(0.075, y1));                        // 4: the stem
      seg(P(0.075, y1), P(0.03, y0 + 0.02));                  // 4: the diagonal
      seg(P(0.03, y0 + 0.02), P(0.09, y0 + 0.02));            // 4: the bar
      return g;
    };
    parts.push(glyphs(1), glyphs(-1));

    // ---- camera in the nose: side plates, a boxed body, a lens barrel ----
    const cz0 = BL + 0.035;
    [-0.05, 0.05].forEach((sx) => parts.push(makeBox(sx, 0.0, cz0 - 0.015, 0.01, 0.07, 0.06)));
    parts.push(makeBox(0, 0.0, cz0, 0.085, 0.07, 0.065));
    parts.push(tubeAlong([0, 0.0, cz0 + 0.032], [0, 0.0, cz0 + 0.066], 0.026, 12));
    parts.push(makeRing(0, 0.0, cz0 + 0.067, 0.015, 10, "z"));

    // ---- the 5.8 GHz antenna out the back: one prong, capacitor-like tip ----
    const aBase = [0, 0.05, -BL - 0.005], aTip = [0, 0.21, -BL - 0.12];
    parts.push(tubeAlong([0, 0.015, -BL + 0.01], [0, 0.06, -BL - 0.01], 0.018, 8)); // SMA boot
    parts.push(tubeAlong(aBase, aTip, 0.007, 6));                                   // the prong
    const dir = V.norm(V.sub(aTip, aBase));
    parts.push(tubeAlong(aTip, V.add(aTip, V.mul(dir, 0.05)), 0.019, 10));          // the tip

    const m = merge(parts);
    m.spinners = spinners;
    m.zoom = 0.62;   // pulled well back: a small quad sits small in its frame, with air round it
    /* It hangs perfectly still. Nothing moves until it is hovered; then it
       turns like a product on a turntable — one eye height, one slow even
       lap — and the breakout below pops up a second in. */
    m.spinRate = 0.26;
    // a quick push in on the hover so you can see what it is, then back out
    m.hoverZoom = (s) => {
      if (s <= 0) return 1;
      if (s < 0.55) return 1 + 0.38 * V.ss(s / 0.55);
      if (s < 1.5) return 1.38;
      if (s < 2.3) return 1.38 - 0.38 * V.ss((s - 1.5) / 0.8);
      return 1;
    };
    // the breakout: a section through the arm where it roots into the duct —
    // the joint that takes the load in a crash — showing the infill
    m.callout = {
      anchors: ducts.map(([cx, cz]) => {
        const a = Math.atan2(-cz, -cx);                // the inboard side of each duct
        return [cx + Math.cos(a) * RO, -0.02, cz + Math.sin(a) * RO];
      }),
      label: "STRESS-OPTIMIZED INFILL",
      sub: "DENSER AT HIGH STRESS CONCENTRATIONS",
      every: 9,
      hold: 4.5,
    };
    // the button on the body blinks while hovered — the arming LED
    m.dynamic = function (time) {
      const tb = (time * 1.2) % 1;
      const lit = tb < 0.12 || (tb > 0.2 && tb < 0.3);
      return { segments: [], dots: [[0, 0.116, -0.09, lit ? 3.0 : 0.9, lit ? 1 : 0]] };
    };
    return m;
  }

  // A rectangular strut in the XZ plane between two points at one height:
  // width across, thickness vertical. Printed struts are flat, not square.
  function segBoxXZ(p0, p1, w, t) {
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
    const L = Math.hypot(dx, dz) || 1;
    const px = (-dz / L) * w / 2, pz = (dx / L) * w / 2;
    const y = p0[1];
    const q = (yy) => [
      [p0[0] + px, yy, p0[2] + pz], [p0[0] - px, yy, p0[2] - pz],
      [p1[0] - px, yy, p1[2] - pz], [p1[0] + px, yy, p1[2] + pz],
    ];
    const v = [...q(y + t / 2), ...q(y - t / 2)];
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const f = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    return { v, e, f };
  }

  /* The local-AI smart home, drawn as the system it is rather than as a
     room: the brain (a mini PC) in the middle of the pad, and around it the
     four things it talks to, every one of which plugs in or screws in, so
     there is no mains wiring anywhere in the product.

       voice puck  (you talk to it)        front left
       smart bulb  (screws into a lamp)    back left
       smart plug  (in a wall outlet)      right
       thermostat  (low-voltage swap)      back right

     Floor traces run from each device to the brain, and nowhere else:
     nothing leaves the house.

     Hover it and one request plays through, the way the product works:
     sound rings off the puck (you asked), a pulse runs the trace to the
     brain, the brain's LED works, three pulses run out to the bulb, the plug
     and the thermostat, and they answer: the bulb glows, the plug's LED
     comes on, the thermostat's dial sweeps. Then the puck answers you. It
     repeats every 6 s while hovered. */
  function buildHome() {
    const parts = [];
    const FY = -0.46;                                   // floor of the pad
    const BRAIN = [0, FY + 0.07, 0];
    const PUCK = [-0.52, FY, 0.42], BULB = [-0.58, FY, -0.36], PLUG = [0.66, FY, 0.10], STAT = [0.36, FY, -0.56];

    // the brain: a mini PC with vent slots, a status strip and its ethernet to a router
    parts.push(makeBox(BRAIN[0], BRAIN[1], BRAIN[2], 0.40, 0.12, 0.40));
    for (let k = 0; k < 6; k++) {
      const x = -0.14 + k * 0.056;
      parts.push({ v: [[x, FY + 0.132, -0.10], [x, FY + 0.132, 0.10]], e: [[0, 1]] });
    }
    parts.push({ v: [[-0.16, FY + 0.05, 0.201], [0.16, FY + 0.05, 0.201]], e: [[0, 1]] });
    parts.push(makeBox(0.34, FY + 0.03, -0.10, 0.16, 0.05, 0.11));     // router
    parts.push({ v: [[0.20, FY + 0.03, -0.08], [0.26, FY + 0.03, -0.08]], e: [[0, 1]] });
    [0.30, 0.38].forEach((x) => parts.push({ v: [[x, FY + 0.055, -0.14], [x + 0.02, FY + 0.16, -0.16]], e: [[0, 1]] }));

    // floor traces, brain to each device
    [PUCK, BULB, PLUG, STAT].forEach((d) => parts.push({ v: [[0, FY + 0.004, 0], [d[0], FY + 0.004, d[2]]], e: [[0, 1]] }));

    // voice puck on a little side table
    parts.push(makeBox(PUCK[0], FY + 0.10, PUCK[2], 0.24, 0.02, 0.24));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) =>
      parts.push(makeBox(PUCK[0] + a * 0.10, FY + 0.045, PUCK[2] + b * 0.10, 0.015, 0.09, 0.015)));
    parts.push(makeCylinderY(PUCK[0], FY + 0.14, PUCK[2], 0.075, 0.05, 18));
    parts.push(makeRing(PUCK[0], FY + 0.166, PUCK[2], 0.05, 16, "y"));

    // smart bulb in a floor lamp: base, pole, socket, and the bulb itself
    parts.push(makeCylinderY(BULB[0], FY + 0.01, BULB[2], 0.10, 0.02, 16));
    parts.push(tubeAlong([BULB[0], FY + 0.02, BULB[2]], [BULB[0], FY + 0.50, BULB[2]], 0.012, 6));
    parts.push(makeCylinderY(BULB[0], FY + 0.53, BULB[2], 0.03, 0.06, 12));  // socket
    parts.push(makeLoftY([
      { y: FY + 0.56, r: 0.028, cx: BULB[0], cz: BULB[2] }, { y: FY + 0.60, r: 0.05, cx: BULB[0], cz: BULB[2] },
      { y: FY + 0.66, r: 0.068, cx: BULB[0], cz: BULB[2] }, { y: FY + 0.72, r: 0.05, cx: BULB[0], cz: BULB[2] },
      { y: FY + 0.75, r: 0.012, cx: BULB[0], cz: BULB[2] },
    ], 14));

    // a wall section with an outlet, and the smart plug in it
    parts.push(makeBox(PLUG[0] + 0.03, FY + 0.20, PLUG[2], 0.03, 0.40, 0.34));
    parts.push(makeBox(PLUG[0], FY + 0.16, PLUG[2], 0.012, 0.14, 0.09));    // outlet plate
    parts.push(makeBox(PLUG[0] - 0.035, FY + 0.18, PLUG[2], 0.06, 0.09, 0.07)); // smart plug
    parts.push(tubeAlong([PLUG[0] - 0.065, FY + 0.16, PLUG[2]], [PLUG[0] - 0.20, FY + 0.01, PLUG[2] + 0.06], 0.006, 5)); // its cord

    // a wall section with the thermostat on it
    parts.push(makeBox(STAT[0], FY + 0.24, STAT[2] - 0.03, 0.36, 0.48, 0.03));
    parts.push({ ...makeRing(STAT[0], FY + 0.30, STAT[2], 0.065, 24, "z") });
    parts.push(makeRing(STAT[0], FY + 0.30, STAT[2], 0.048, 20, "z"));

    parts.push(makeBase(FY - 0.02, 1.15));
    const m = merge(parts);
    m.spinners = [];
    m.spinRate = 0.2;

    const ss = (a, b, s) => V.ss((s - a) / (b - a));
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    m.dynamic = function (time, deploy, spin, hoverT) {
      const raw = (hoverT == null ? 99 : hoverT) / 0.72;   // seconds of hover (T_RATE)
      const s = raw > 0 ? raw % 6 : -1;                    // one request every 6 s
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);
      const floor = (p) => [p[0], FY + 0.01, p[2]];

      // 1. you ask: rings rise off the puck
      if (s >= 0 && s < 1.0) {
        for (let k = 0; k < 3; k++) {
          const ph = (s * 1.4 + k / 3) % 1;
          P.ring(PUCK[0], FY + 0.17 + ph * 0.10, PUCK[2], 0.06 + ph * 0.16, 22, "y", 1.1 * (1 - ph));
        }
      }
      // 2. the request runs the trace to the brain
      if (s >= 0.8 && s < 1.4) dots.push([...lerp(floor(PUCK), floor(BRAIN), ss(0.8, 1.4, s)), 3.2, 1]);
      // 3. the brain works it out locally
      const think = s >= 1.3 && s < 2.1 && (s * 6) % 1 < 0.5;
      dots.push([0.12, FY + 0.05, 0.205, think ? 2.6 : 1.1, think ? 1 : 0]);
      // 4. out to the three devices
      if (s >= 2.0 && s < 2.7) [BULB, PLUG, STAT].forEach((d) => dots.push([...lerp(floor(BRAIN), floor(d), ss(2.0, 2.7, s)), 3.0, 1]));
      // 5. they answer
      const on = s >= 2.6 ? ss(2.6, 3.0, s) * (1 - ss(5.4, 5.9, s)) : 0;
      // the bulb glows and throws light
      dots.push([BULB[0], FY + 0.66, BULB[2], 1.4 + on * 4.5, on > 0.3 ? 1 : 0]);
      if (on > 0.05) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          P.line([BULB[0] + Math.cos(a) * 0.09, FY + 0.66, BULB[2] + Math.sin(a) * 0.09],
                 [BULB[0] + Math.cos(a) * (0.12 + 0.10 * on), FY + 0.66 + Math.sin(a * 2) * 0.02, BULB[2] + Math.sin(a) * (0.12 + 0.10 * on)], 0.5 + 0.5 * on);
        }
      }
      // the plug's LED
      dots.push([PLUG[0] - 0.066, FY + 0.21, PLUG[2], on > 0.3 ? 2.6 : 0.9, on > 0.3 ? 1 : 0]);
      // the thermostat's dial sweeps to the new setpoint
      const sweep = -2.2 + 1.6 * on;
      const tick = [STAT[0] + Math.cos(sweep) * 0.055, FY + 0.30 + Math.sin(sweep) * 0.055, STAT[2] + 0.004];
      P.line([STAT[0], FY + 0.30, STAT[2] + 0.004], tick, 1.2);
      dots.push([tick[0], tick[1], tick[2], on > 0.3 ? 2.2 : 1.0, on > 0.3 ? 1 : 0]);
      // 6. and the house answers you
      if (s >= 3.0 && s < 4.6) {
        for (let k = 0; k < 3; k++) {
          const ph = ((s - 3.0) * 1.2 + k / 3) % 1;
          P.ring(PUCK[0], FY + 0.17 + ph * 0.06, PUCK[2], 0.07 + ph * 0.26, 24, "y", 1.1 * (1 - ph));
        }
        dots.push([PUCK[0], FY + 0.17, PUCK[2], 2.2, 1]);
      }
      return { segments: segs, faces, dots };
    };
    return m;
  }

  /* The beer launcher. A catapult on a base, fired by a button on a
     handheld remote: press it and the arm whips forward and throws a can
     across the room. Uprights and an axle carry the throwing arm; a spring
     runs from the base to the arm; a servo latch holds it cocked; the cup at
     the end of the arm holds the can.

     Hover it and it fires on a 4 s loop: the remote's button goes down and
     its LED lights, the arm snaps from cocked to the stop, the can leaves
     the cup on a real ballistic arc (tumbling as it goes), the arm resets
     slowly, and a fresh can drops into the cup. */
  function buildLauncher() {
    const parts = [];
    const FY = -0.46;
    const AX = [0, FY + 0.36, -0.05];                    // the arm's axle
    const L = 0.62;                                      // arm length, axle to cup

    // base plate, feet, a reload hopper at the back
    parts.push(makeBox(0, FY + 0.03, 0, 0.62, 0.06, 1.0));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) =>
      parts.push(makeCylinderY(a * 0.26, FY - 0.005, b * 0.44, 0.035, 0.02, 10)));
    // uprights, the axle, and a padded stop bar the arm hits
    [-0.13, 0.13].forEach((x) => {
      parts.push(makeBox(x, FY + 0.21, -0.05, 0.04, 0.34, 0.12));
      parts.push(makeBox(x, FY + 0.10, 0.10, 0.04, 0.03, 0.26));        // diagonal-ish brace foot
    });
    parts.push(tubeAlong([-0.18, AX[1], AX[2]], [0.18, AX[1], AX[2]], 0.018, 10));
    [-0.13, 0.13].forEach((x) => parts.push(makeBox(x, FY + 0.42, 0.14, 0.04, 0.14, 0.04)));
    parts.push(tubeAlong([-0.16, FY + 0.48, 0.14], [0.16, FY + 0.48, 0.14], 0.03, 10));   // stop bar
    // servo latch at the back
    parts.push(makeBox(0, FY + 0.10, -0.38, 0.14, 0.09, 0.10));
    parts.push(makeBox(0, FY + 0.17, -0.38, 0.03, 0.05, 0.02));
    // electronics box with its receiver antenna
    parts.push(makeBox(0.20, FY + 0.10, -0.30, 0.14, 0.08, 0.16));
    parts.push(tubeAlong([0.24, FY + 0.14, -0.34], [0.24, FY + 0.30, -0.34], 0.005, 5));

    // the remote, on the floor out front: a handheld with one big button
    const RM = [0.52, FY + 0.03, 0.52];
    parts.push(makeBox(RM[0], RM[1], RM[2], 0.12, 0.05, 0.22));
    parts.push(makeRing(RM[0], RM[1] + 0.026, RM[2] - 0.02, 0.045, 18, "y"));
    parts.push(tubeAlong([RM[0] + 0.04, RM[1] + 0.02, RM[2] + 0.10], [RM[0] + 0.04, RM[1] + 0.13, RM[2] + 0.12], 0.004, 5));

    parts.push(makeBase(FY - 0.03, 1.15));
    const m = merge(parts);
    m.spinners = [];
    m.spinRate = 0.22;
    m.angle = 0.9;
    // The frame is fitted to everything the model draws, including the can's
    // whole flight, which shrinks the catapult to a speck. Crop in on the
    // machine; the can is meant to leave the frame, "across the room".
    m.zoom = 1.7;

    const ss = (a, b, s) => V.ss((s - a) / (b - a));
    const REST = -2.05, STOP = 0.42, RELEASE = -0.35;     // arm angles, radians from straight up, + is forward
    const armTip = (th) => [0, AX[1] + Math.cos(th) * L, AX[2] + Math.sin(th) * L];
    m.dynamic = function (time, deploy, spin, hoverT) {
      const raw = (hoverT == null ? 0 : hoverT) / 0.72;
      const s = raw > 0 ? raw % 4 : -1;
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);

      // the button: pressed at 0.3 s
      const press = s >= 0.3 && s < 0.7;
      P.tube([RM[0], RM[1] + 0.026, RM[2] - 0.02], [0, 1, 0], [{ d: 0, r: 0.038 }, { d: press ? 0.008 : 0.024, r: 0.038 }], 14, 1.1);
      dots.push([RM[0] - 0.035, RM[1] + 0.027, RM[2] + 0.07, press ? 2.4 : 0.9, press ? 1 : 0]);

      // the arm: cocked, then a whip to the stop, then a slow reset
      let th = REST;
      if (s >= 0.45 && s < 0.62) th = REST + (STOP - REST) * Math.pow(ss(0.45, 0.62, s), 0.6);
      else if (s >= 0.62 && s < 1.6) th = STOP;
      else if (s >= 1.6 && s < 3.2) th = STOP + (REST - STOP) * ss(1.6, 3.2, s);
      const tip = armTip(th);
      P.beam(AX, tip, 0.028, 1.2, 0.02);
      // the cup: a ring across the arm's end
      const dir = V.norm(V.sub(tip, AX));
      const side = [1, 0, 0], up = V.cross(side, dir);
      P.ringUV(V.add(tip, V.mul(dir, 0.03)), side, dir, 0.07, 16, 1.2);
      P.ringUV(V.add(tip, V.mul(dir, 0.03)), side, dir, 0.05, 14, 0.9);
      // the spring: a zigzag from the base plate to the arm
      const s0 = [0, FY + 0.06, 0.20], s1 = V.add(AX, V.mul(dir, 0.22));
      const coil = [];
      for (let k = 0; k <= 16; k++) {
        const p = V.add(s0, V.mul(V.sub(s1, s0), k / 16));
        coil.push([p[0] + (k % 2 ? 0.035 : -0.035), p[1], p[2]]);
      }
      P.poly(coil, 0.9);

      // the can: sits in the cup, flies on release, reloads after the reset
      const can = (c, axis) => P.tube(c, axis, [{ d: -0.06, r: 0.04 }, { d: -0.05, r: 0.045 }, { d: 0.05, r: 0.045 }, { d: 0.065, r: 0.03 }], 12, 1.1);
      const fired = s >= 0.56 && s < 3.3;
      if (!fired) {
        can(V.add(tip, V.mul(dir, 0.08)), up);
      } else {
        const t = s - 0.56;
        const r0 = armTip(RELEASE), v0 = V.mul([0, -Math.sin(RELEASE), Math.cos(RELEASE)], 2.3);
        const pos = [r0[0], r0[1] + v0[1] * t - 1.3 * t * t, r0[2] + v0[2] * t];
        if (pos[1] > FY - 0.2) {
          const tumble = t * 9;
          can(pos, [0, Math.cos(tumble), Math.sin(tumble)]);
          // a short trail behind it
          for (let k = 1; k <= 5; k++) {
            const tk = Math.max(0, t - k * 0.03);
            dots.push([r0[0], r0[1] + v0[1] * tk - 1.3 * tk * tk, r0[2] + v0[2] * tk, 1.6 - k * 0.25, 1]);
          }
        }
      }
      return { segments: segs, faces, dots };
    };
    return m;
  }

  const MODELS = { evtol: buildEvtol, arm: buildArm, drone: buildDrone, home: buildHome, launcher: buildLauncher };
  // Per-model holographic tint (rgb triplets) — cyan family to match the UI.
  const TINTS = {
    evtol: [86, 200, 255],
    arm: [80, 196, 255],
    drone: [110, 214, 255],
    home: [96, 206, 255],
    launcher: [100, 210, 255],
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
    /* The resting angle each model is first drawn at. `data-holo-angle` on the
       canvas overrides it, which exists so a model can be inspected from a
       chosen side: the preview pane throttles animation frames hard when it is
       not the focused window, so waiting for the rotation to come round to the
       view you need does not work. π/2 is side-on. */
    const angAttr = parseFloat(canvas.getAttribute("data-holo-angle"));
    let raf = 0, t = 0;
    let angY = Number.isFinite(angAttr) ? angAttr
             : model.angle != null ? model.angle
             : type === "arm" ? -0.6 : 0.4;
    let hovered = false;
    let deploy = reduce ? 1 : 0;     // 0 = parked/collapsed, 1 = deployed (deploy models)
    let hoverT = 0;                  // grows while hovered (arm's search-then-lock timing)
    let calloutAnchor = -1;          // which anchor an open callout is locked to (-1 = none yet)
    const tilt = -0.42;              // look slightly down on the model
    const viewerDist = 3.4;

    /* The depth ramp. Far edges are cold, thin and dim; near edges are hot,
       wide and bright. With surfaces now doing the occluding, this no longer
       has to stand in for hidden-line removal — it is free to be what it
       always should have been, a distance cue. */
    const cFar = [
      Math.round(tint[0] * 0.20),
      Math.round(tint[1] * 0.38),
      Math.round(tint[2] * 0.72),
    ];
    const cNear = [
      Math.min(255, tint[0] + 140),
      Math.min(255, tint[1] + 50),
      255,
    ];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      w = rect.width; h = rect.height;
      // 1.5 left visible stair-stepping on the thin far edges, which is
      // most of what made these look low-fidelity. The extra cost is a
      // one-off: only a hovered hologram animates.
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 0.36 left the models floating small in a large frame. 0.41 fills the
      // card without the ground ellipse (radius 1.1) touching the edges.
      /* Fit the model to the frame rather than hoping a fixed scale suits
         it. fitR/fitY are the widest and tallest this model ever projects,
         measured once at construction over a full turn; 0.46 leaves a margin
         so the base pad's tick marks are not clipped. model.zoom stays as a
         deliberate nudge on top for compositions that want to sit smaller. */
      scale = Math.min(w * 0.46 / fitR, h * 0.46 / fitY) * (model.zoom || 1);
      cx = w / 2;
      cy = h / 2 + h * 0.04;
    }

    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    /* Returns [screenX, screenY, perspectiveFactor, viewZ].

       viewZ is the fourth element and it is the one that matters most: the
       painter's algorithm sorts on true view depth, not on the perspective
       factor. They are monotonically related for a single point, but the
       factor compresses hard with distance, so sorting on it drops far
       geometry into too few buckets and surfaces start swapping order as the
       model turns. */
    /* A model that flies carries model.bob(time): a height it hovers at,
       applied to every point it draws. Set once per frame in render(). */
    let bobY = 0;
    let zoomMul = 1;                 // model.hoverZoom: a camera push-in on hover
    function project(x, y, z, ca, sa) {
      // rotate about Y
      const X = x * ca + z * sa;
      const Z = -x * sa + z * ca;
      const Y = y + bobY;
      // tilt about X
      const Y2 = Y * cosT - Z * sinT;
      const Z2 = Y * sinT + Z * cosT;
      const f = viewerDist / (viewerDist + Z2); // perspective foreshortening
      return [cx + X * f * scale * zoomMul, cy - Y2 * f * scale * zoomMul, f, -Z2];
    }

    /* How far this model reaches, in projected units at scale 1. Sampled
       over twelve rotations, and INCLUDING live geometry sampled through a
       cycle — otherwise a rotor disc or an extended arm link, which exist
       only inside dynamic(), hangs out of a frame sized to the static shell. */
    let fitR = 1, fitY = 1;
    (function measure() {
      const pts = model.v.slice();
      if (model.dynamic) {
        for (let k = 0; k < 6; k++) {
          let gen;
          try { gen = model.dynamic(k * 1.7, 1, 0, 99); } catch (e) { break; }
          (gen.segments || []).forEach((sg) => { pts.push([sg[0], sg[1], sg[2]], [sg[3], sg[4], sg[5]]); });
          (gen.faces || []).forEach((f) => f.forEach((q) => pts.push(q)));
        }
      }
      let mr = 0.001, my = 0.001;
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          const X = q[0] * ca + q[2] * sa, Z = -q[0] * sa + q[2] * ca;
          const qy = q[1] + (model.bob ? model.bob(0) + 0.03 : 0);
          const Y2 = qy * cosT - Z * sinT, Z2 = qy * sinT + Z * cosT;
          const f = viewerDist / (viewerDist + Z2);
          const px = Math.abs(X * f), py = Math.abs(Y2 * f);
          if (px > mr) mr = px;
          if (py > my) my = py;
        }
      }
      fitR = mr; fitY = my;
    })();

    /* ---------------- the hologram renderer ----------------
       This is a solid-surface renderer that happens to be drawn as a
       wireframe, and the distinction is the whole quality difference.

       The first version graded every edge by depth across four axes at once
       and hoped that would separate the near side of an object from the far
       side. It cannot: with nothing to hide behind, every edge in the model
       is visible at all times, and a detailed model therefore looks *worse*
       than a crude one — more edges, more tangle. Adding detail made it
       cheaper-looking, which is exactly backwards.

       So each model now carries a surface list, and the pipeline is a
       painter's algorithm:

         0. floor pool     — a soft ellipse of light the model stands in
         1. depth slices   — everything sorted far to near, in NSLICE bands.
                             Per band: fill the surfaces, then stroke the
                             edges. A far edge drawn in an early band is
                             painted over by a near surface in a later one,
                             which is hidden-line removal for the cost of a
                             sort.
         2. rim pass       — the nearest edges again, additively, with a
                             blur. This is the glow, and it is applied only
                             to the near shell so it reads as light coming
                             off the object rather than fog over all of it.
         3. vertex glints  — nodes on the near shell.
         4. live dots      — lamps, lenses, contacts.

       Surfaces are SORTED, never culled. Winding across seven hand-authored
       models cannot be trusted to be consistent, and a culled face that
       should not have been is a hole straight through the object. A face
       wound the wrong way here is merely shaded as a back face — dimmer, and
       still occluding. It is the failure mode you can ship.

       Lighting is one directional light in view space. It is what gives the
       models form: a flat fill at constant alpha reads as a paper cutout no
       matter how good the geometry is. */

    const NSLICE = 18;                       // depth bands for the painter's sort
    const LIGHT = [-0.42, 0.76, 0.50];       // key light, view space
    (function normLight() {
      const m = Math.hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
      LIGHT[0] /= m; LIGHT[1] /= m; LIGHT[2] /= m;
    })();

    /* Reused per-frame scratch so the draw loop allocates nothing.

       Faces are bucketed by depth slice AND by quantised light, because the
       cost here is not the geometry, it is the canvas state change: one
       beginPath/fill per face ran the seven-panel preview at 1fps. Grouping
       every face that shares a slice and a light level into a single path
       costs at most NSLICE × NLIT fills per frame instead of one per face,
       and is visually identical — the quantisation is finer than the eye
       resolves against a dark ground. */
    const NLIT = 6;
    const projBuf = new Array(model.v.length);
    const slices = Array.from({ length: NSLICE }, () => ({
      lit: Array.from({ length: NLIT }, () => []),
      edges: [],
    }));
    const rimEdges = [];

    // The body colour surfaces are filled with: near-black, faintly blue, and
    // opaque enough to occlude. Lit faces lift toward the tint, so the object
    // has a bright side without ever becoming a solid silhouette.
    const BODY = [6, 14, 24];

    /* The fill palette, built once. Depth and light are both quantised, so
       there are only NSLICE × NLIT possible surface colours and every one of
       them can be a string that already exists. Building these per face was
       a meaningful slice of the frame budget on its own. */
    const FILL = [];
    for (let sI = 0; sI < NSLICE; sI++) {
      const depth = (sI + 0.5) / NSLICE;
      const row = [];
      for (let lI = 0; lI < NLIT; lI++) {
        const lit = (lI + 0.5) / NLIT;
        const k = (0.34 + lit * 0.66) * (0.45 + depth * 0.55);
        const r = Math.round(BODY[0] + (tint[0] * 0.30 - BODY[0]) * k);
        const g = Math.round(BODY[1] + (tint[1] * 0.34 - BODY[1]) * k);
        const b = Math.round(BODY[2] + (tint[2] * 0.42 - BODY[2]) * k);
        row.push("rgba(" + r + "," + g + "," + b + ",0.93)");
      }
      FILL.push(row);
    }
    const litBucket = (l) => {
      const i = (l * NLIT) | 0;
      return i < 0 ? 0 : i >= NLIT ? NLIT - 1 : i;
    };

    function shadeEdge(lit, depth, alphaScale) {
      // Depth carries most of the grade; the light adds the highlight that
      // makes a panel edge read as an edge of something rather than a line.
      const e = depth * depth;
      const k = Math.min(1, e * 0.72 + lit * 0.5);
      const r = Math.round(cFar[0] + (cNear[0] - cFar[0]) * k);
      const g = Math.round(cFar[1] + (cNear[1] - cFar[1]) * k);
      const b = Math.round(cFar[2] + (cNear[2] - cFar[2]) * k);
      const a = (0.16 + depth * 0.52 + lit * 0.26) * alphaScale;
      return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(3) + ")";
    }

    function render() {
      ctx.clearRect(0, 0, w, h);
      const ca = Math.cos(angY), sa = Math.sin(angY);
      bobY = model.bob ? model.bob(reduce ? 0 : t) : 0;
      zoomMul = model.hoverZoom && !reduce ? model.hoverZoom(hoverT / T_RATE) : 1;

      // A slow, shallow flicker. Anything stronger reads as a broken screen
      // rather than a projection.
      /* No flicker. A per-frame brightness wobble was meant to read as a
         projection; on a page this clean it reads as a loose connection, and
         it makes every static edge crawl. The variable stays at 1 because it
         threads through every colour string below — stubbing it is a much
         smaller change than unpicking all of them, and it leaves the door
         open if a deliberate flicker is ever wanted again. */
      const flicker = 1;

      // ---- project every vertex once, into reused scratch ----
      const pv = model.v, proj = projBuf;
      let zmin = Infinity, zmax = -Infinity;
      for (let i = 0; i < pv.length; i++) {
        const p = project(pv[i][0], pv[i][1], pv[i][2], ca, sa);
        proj[i] = p;
        if (p[3] < zmin) zmin = p[3];
        if (p[3] > zmax) zmax = p[3];
      }

      // ---- 0. floor pool ----
      // Every model stands on a base ring at y≈-1. A soft pool of light under
      // it stops the object floating in a void, and costs one gradient fill.
      const floor = project(0, -0.98 - bobY, 0, ca, sa);   // the floor does not hover
      const fr = scale * 1.15;
      const pool = ctx.createRadialGradient(floor[0], floor[1], 0, floor[0], floor[1], fr);
      pool.addColorStop(0, "rgba(" + rgb + "," + (0.11 * flicker).toFixed(3) + ")");
      pool.addColorStop(0.45, "rgba(" + rgb + "," + (0.042 * flicker).toFixed(3) + ")");
      pool.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.save();
      ctx.translate(floor[0], floor[1]);
      ctx.scale(1, 0.30);
      ctx.translate(-floor[0], -floor[1]);
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(floor[0], floor[1], fr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ---- live geometry, projected into the same depth space ----
      // Articulated parts are generated per frame in model space, so they have
      // to enter the sort alongside the static shell or an arm link will draw
      // over the body it is behind.
      let dynSegs = null, dynDots = null, dynFaces = null;
      if (model.dynamic) {
        const gen = model.dynamic(reduce ? 0 : t, deploy, angY, hoverT);
        dynSegs = gen.segments || [];
        dynDots = gen.dots || [];
        dynFaces = gen.faces || null;
      }

      // ---- bucket everything by depth ----
      for (let s = 0; s < NSLICE; s++) {
        const sl = slices[s];
        sl.edges.length = 0;
        for (let b = 0; b < NLIT; b++) sl.lit[b].length = 0;
      }
      rimEdges.length = 0;
      const zspan = (zmax - zmin) || 1;
      const sliceOf = (z) => {
        let i = (((z - zmin) / zspan) * NSLICE) | 0;
        return i < 0 ? 0 : i >= NSLICE ? NSLICE - 1 : i;
      };

      const F = model.f || [];
      for (let i = 0; i < F.length; i++) {
        const fa = F[i];
        const n = fa.length;
        let zs = 0, ok = true;
        for (let k = 0; k < n; k++) {
          const p = proj[fa[k]];
          if (!p) { ok = false; break; }
          zs += p[3];
        }
        if (!ok) continue;
        // Cull faces below a couple of pixels square. They cost a subpath
        // each and contribute nothing — on the long-rail models that is a
        // few hundred of them per frame.
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let k = 0; k < n; k++) {
          const q = proj[fa[k]];
          if (q[0] < x0) x0 = q[0];
          if (q[0] > x1) x1 = q[0];
          if (q[1] < y0) y0 = q[1];
          if (q[1] > y1) y1 = q[1];
        }
        if ((x1 - x0) * (y1 - y0) < 5) continue;
        // Face normal in model space, then through the same rotation the
        // vertices took, so the light is fixed to the viewer and the model
        // turns underneath it.
        const a = pv[fa[0]], b = pv[fa[1]], c = pv[fa[n - 1]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const rx = nx * ca + nz * sa, rz0 = -nx * sa + nz * ca;
        const ry = ny * cosT - rz0 * sinT, rz = ny * sinT + rz0 * cosT;
        let lit = rx * LIGHT[0] + ry * LIGHT[1] + rz * LIGHT[2];
        lit = lit < 0 ? -lit * 0.42 : lit;    // a back face is dim, never black
        slices[sliceOf(zs / n)].lit[litBucket(lit)].push(fa);
      }

      if (dynFaces) {
        for (let i = 0; i < dynFaces.length; i++) {
          const q = dynFaces[i], n = q.length;
          const pts = new Array(n);
          let zs = 0;
          for (let k = 0; k < n; k++) {
            const pr = project(q[k][0], q[k][1], q[k][2], ca, sa);
            pts[k] = pr; zs += pr[3];
          }
          const a = q[0], b = q[1], c = q[n - 1];
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const rx = nx * ca + nz * sa, rz0 = -nx * sa + nz * ca;
          const ry = ny * cosT - rz0 * sinT, rz = ny * sinT + rz0 * cosT;
          let lit = rx * LIGHT[0] + ry * LIGHT[1] + rz * LIGHT[2];
          lit = lit < 0 ? -lit * 0.42 : lit;
          slices[sliceOf(zs / n)].lit[litBucket(lit)].push(pts);
        }
      }

      const E = model.e;
      for (let i = 0; i < E.length; i++) {
        const a = proj[E[i][0]], b = proj[E[i][1]];
        if (!a || !b) continue;
        slices[sliceOf((a[3] + b[3]) * 0.5)].edges.push(a[0], a[1], b[0], b[1]);
      }
      if (dynSegs) {
        for (let i = 0; i < dynSegs.length; i++) {
          const s = dynSegs[i];
          const a = project(s[0], s[1], s[2], ca, sa);
          const b = project(s[3], s[4], s[5], ca, sa);
          slices[sliceOf((a[3] + b[3]) * 0.5)].edges.push(a[0], a[1], b[0], b[1]);
        }
      }
      // Spinning rotor blades: a closed tapered planform per blade, generated
      // at the hub's depth so a blade behind the body is hidden by it.
      const spinners = model.spinners || [];
      if (spinners.length) {
        const spin = reduce ? 0 : t;
        for (let s = 0; s < spinners.length; s++) {
          const sp = spinners[s];
          const hub = project(sp.cx, sp.cy, sp.cz, ca, sa);
          const bucket = slices[sliceOf(hub[3])].edges;
          const hubR = 0.1 * sp.r;
          let prev = null, first = null;
          for (let k = 0; k <= 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const p = project(sp.cx + Math.cos(a) * hubR, sp.cy, sp.cz + Math.sin(a) * hubR, ca, sa);
            if (prev) bucket.push(prev[0], prev[1], p[0], p[1]);
            prev = p;
          }
          for (let bl = 0; bl < sp.blades; bl++) {
            const ba = spin * sp.speed + (bl / sp.blades) * Math.PI * 2;
            const cb = Math.cos(ba), sb = Math.sin(ba);
            prev = null; first = null;
            for (let k = 0; k < BLADE.length; k++) {
              const u = BLADE[k][0], vv = BLADE[k][1] * (sp.dir || 1);   // a reversed prop is a mirrored blade
              const x = sp.cx + (u * cb - vv * sb) * sp.r;
              const z = sp.cz + (u * sb + vv * cb) * sp.r;
              const p = project(x, sp.cy + vv * 0.16 * sp.r, z, ca, sa);
              if (prev) bucket.push(prev[0], prev[1], p[0], p[1]);
              else first = p;
              prev = p;
            }
            if (prev && first) bucket.push(prev[0], prev[1], first[0], first[1]);
          }
        }
      }

      // ---- 1. depth slices, far to near ----
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let s = 0; s < NSLICE; s++) {
        const depth = (s + 0.5) / NSLICE;
        const sl = slices[s];

        // surfaces first: they are what the edges in this slice sit on, and
        // what the edges of every slice behind get hidden by
        /* One path, one fill, per light bucket. A static face arrives as
           vertex indices into the shared projection buffer and a live one
           arrives already projected; both are just points by the time they
           reach the path, so they batch together. */
        for (let bI = 0; bI < NLIT; bI++) {
          const bucket = sl.lit[bI];
          if (!bucket.length) continue;
          ctx.fillStyle = FILL[s][bI];
          ctx.beginPath();
          for (let i = 0; i < bucket.length; i++) {
            const fa = bucket[i];
            const first = fa[0];
            if (typeof first === "number") {
              const p0 = proj[first];
              ctx.moveTo(p0[0], p0[1]);
              for (let k = 1; k < fa.length; k++) {
                const pk = proj[fa[k]];
                ctx.lineTo(pk[0], pk[1]);
              }
            } else {
              ctx.moveTo(first[0], first[1]);
              for (let k = 1; k < fa.length; k++) ctx.lineTo(fa[k][0], fa[k][1]);
            }
            ctx.closePath();
          }
          ctx.fill();
        }

        const ar = sl.edges;
        if (!ar.length) continue;
        ctx.strokeStyle = shadeEdge(0.35, depth, flicker);
        ctx.lineWidth = 0.5 + depth * depth * 1.15;
        ctx.beginPath();
        for (let k = 0; k < ar.length; k += 4) {
          ctx.moveTo(ar[k], ar[k + 1]);
          ctx.lineTo(ar[k + 2], ar[k + 3]);
        }
        ctx.stroke();
        // Only the nearest quarter feeds the glow. shadowBlur is the most
        // expensive operation on the canvas and its cost scales with both the
        // path length and the blurred area, so this is the cheapest real
        // saving available without changing how it looks.
        if (depth > 0.76) for (let k = 0; k < ar.length; k++) rimEdges.push(ar[k]);
      }

      // ---- 2. rim pass ----
      // The glow, additively, over the near shell only. Applied to everything
      // it becomes fog; applied to the near edges it reads as light coming off
      // the object, which is the thing that made the old version look flat.
      if (!reduce && rimEdges.length) {
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = "rgba(" + rgb + ",0.9)";
        ctx.shadowBlur = 7;
        ctx.strokeStyle = "rgba(" + cNear.join(",") + "," + (0.20 * flicker).toFixed(3) + ")";
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        for (let k = 0; k < rimEdges.length; k += 4) {
          ctx.moveTo(rimEdges[k], rimEdges[k + 1]);
          ctx.lineTo(rimEdges[k + 2], rimEdges[k + 3]);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = prevOp;
      }

      // ---- 3. vertex glints ----
      const prevOp2 = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(" + cNear.join(",") + "," + (0.30 * flicker).toFixed(3) + ")";
      ctx.beginPath();
      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        const d = (p[3] - zmin) / zspan;
        if (d < 0.74) continue;
        const r = 0.5 + (d - 0.74) * 2.2;
        ctx.moveTo(p[0] + r, p[1]);
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalCompositeOperation = prevOp2;

      // ---- 4. live dots: lamps, lenses, contacts ----
      if (dynDots) {
        for (let i = 0; i < dynDots.length; i++) {
          const d = dynDots[i];
          const pp = project(d[0], d[1], d[2], ca, sa);
          ctx.beginPath();
          ctx.arc(pp[0], pp[1], d[3] || 3, 0, Math.PI * 2);
          if (d[4]) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.shadowColor = "rgba(" + rgb + ",0.95)";
            ctx.shadowBlur = 10;
            ctx.fillStyle = "rgba(" + cNear.join(",") + "," + flicker.toFixed(3) + ")";
            ctx.fill();
            ctx.restore();
          } else {
            ctx.strokeStyle = "rgba(" + rgb + "," + (0.6 * flicker).toFixed(3) + ")";
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
        }
      }

      // ---- 5. breakout: a magnified section through the part ----
      if (model.callout && !reduce) drawCallout(ca, sa);
    }

    /* A breakout callout, like a detail view on a drawing: a leader runs from
       the nearest anchor on the model (chosen once per opening) to a circle
       that always sits top-right, and the circle shows a section through
       that part: its skins, and an infill meshed finer and heavier toward
       the stress concentrations. It
       is a drawing, not an animation. It pops up a second after the hover
       starts, holds, closes, and comes back while the hover lasts. */
    function drawCallout(ca, sa) {
      const co = model.callout;
      const hs = hoverT / T_RATE - (model.hoverZoom ? 2.4 : 1.0);  // after the push-in settles
      if (hs < 0) { calloutAnchor = -1; return; }
      const ph = hs % co.every;
      const open = ph < 0.9 ? V.ss(ph / 0.9) : ph < co.hold + 0.9 ? 1
                 : ph < co.hold + 1.7 ? 1 - V.ss((ph - co.hold - 0.9) / 0.8) : 0;
      if (open <= 0.001) { calloutAnchor = -1; return; }

      // Pick the anchor nearest the viewer ONCE, when the callout opens, and
      // hold it: re-picking every frame made the leader jump between ducts
      // as the model turned.
      const proj = co.anchors.map((a) => project(a[0], a[1], a[2], ca, sa));
      if (calloutAnchor < 0) {
        calloutAnchor = 0;
        proj.forEach((p, i) => { if (p[3] > proj[calloutAnchor][3]) calloutAnchor = i; });
      }
      const best = proj[calloutAnchor];

      // The lens always sits top-right. It never swaps sides.
      const R = Math.min(w, h) * 0.18;
      const cxI = w - R - 18, cyI = R + 26;
      const r = R * open;
      if (r < 4) return;                                        // too small to draw; arc() rejects r < 0
      const col = (a) => "rgba(" + cNear.join(",") + "," + a.toFixed(3) + ")";

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // leader, and a ring on the part where the section is taken
      ctx.strokeStyle = col(0.75 * open);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(best[0], best[1], 5 + 3 * open, 0, Math.PI * 2);
      ctx.stroke();
      const dx = best[0] - cxI, dy = best[1] - cyI, dl = Math.hypot(dx, dy) || 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(best[0] - dx / dl * (8 + 3 * open), best[1] - dy / dl * (8 + 3 * open));
      ctx.lineTo(cxI + dx / dl * r, cyI + dy / dl * r);
      ctx.stroke();
      ctx.setLineDash([]);

      // the lens
      ctx.fillStyle = "rgba(2,8,14," + (0.88 * open).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(cxI, cyI, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col(0.9 * open); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cxI, cyI, r + 5, -0.3, 0.9); ctx.stroke();

      /* Inside: a section through the arm where it roots into the duct wall.
         The wall runs down the left, the arm leaves it to the right, and the
         two inside corners are filleted. The infill is a variable mesh: its
         cells shrink and its walls thicken toward the fillets, where the
         stress concentrates in a crash, and open out and thin away from them. */
      ctx.save();
      ctx.beginPath(); ctx.arc(cxI, cyI, r - 1, 0, Math.PI * 2); ctx.clip();
      const X = (u) => cxI + u * r, Y = (u) => cyI + u * r;
      const W0 = -0.78, W1 = -0.26, A0 = -0.22, A1 = 0.3, F = 0.3;  // wall x, arm y, fillet radius (in r)
      const outline = () => {
        ctx.beginPath();
        ctx.moveTo(X(W0), Y(-1.1));
        ctx.lineTo(X(W1), Y(-1.1));
        ctx.lineTo(X(W1), Y(A0 - F));
        ctx.quadraticCurveTo(X(W1), Y(A0), X(W1 + F), Y(A0));
        ctx.lineTo(X(1.1), Y(A0));
        ctx.lineTo(X(1.1), Y(A1));
        ctx.lineTo(X(W1 + F), Y(A1));
        ctx.quadraticCurveTo(X(W1), Y(A1), X(W1), Y(A1 + F));
        ctx.lineTo(X(W1), Y(1.1));
        ctx.lineTo(X(W0), Y(1.1));
        ctx.closePath();
      };
      // the part, faintly filled, then its infill clipped to it
      outline();
      ctx.fillStyle = "rgba(" + rgb + "," + (0.07 * open).toFixed(3) + ")";
      ctx.fill();
      ctx.save();
      outline(); ctx.clip();
      const S = [[W1 + F * 0.3, A0 - F * 0.3], [W1 + F * 0.3, A1 + F * 0.3]]; // the two fillets
      const near = (u, v) => Math.min(Math.hypot(u - S[0][0], v - S[0][1]), Math.hypot(u - S[1][0], v - S[1][1]));
      /* The infill as a refined grid, the way a stress analysis meshes a
         part: big square cells where nothing is happening, and each cell
         split into four again and again as it closes on a fillet, where the
         stress concentrates. The smaller the cell, the heavier its walls.
         Worked out once, in lens units, and reused every frame. */
      if (!co.cells) {
        const cells = [];
        const split = (x, y, s) => {
          const d = near(x + s / 2, y + s / 2);
          if (s > 0.022 && d < s * 2.4) {
            const h2 = s / 2;
            split(x, y, h2); split(x + h2, y, h2); split(x, y + h2, h2); split(x + h2, y + h2, h2);
          } else cells.push([x, y, s]);
        };
        const G = 0.14;                                                      // the coarsest cell
        for (let y = -1.1; y < 1.1; y += G) for (let x = -1.1; x < 1.1; x += G) split(x, y, G);
        co.cells = cells;
      }
      // four weights of wall, by cell size: [largest cell, line width, alpha, fill]
      const tiers = [[0.03, 2.0, 1, 0.24], [0.06, 1.5, 0.9, 0.14], [0.1, 1.1, 0.8, 0.07], [9, 0.9, 0.65, 0.03]];
      tiers.forEach((tr, ti) => {
        const lo = ti ? tiers[ti - 1][0] : 0;
        ctx.beginPath();
        for (const [x, y, s] of co.cells) {
          if (s <= lo || s > tr[0]) continue;
          ctx.rect(X(x), Y(y), s * r, s * r);
        }
        if (tr[3]) { ctx.fillStyle = "rgba(" + rgb + "," + (tr[3] * open).toFixed(3) + ")"; ctx.fill(); }
        ctx.lineWidth = tr[1];
        ctx.strokeStyle = "rgba(" + rgb + "," + (tr[2] * open).toFixed(3) + ")";
        ctx.stroke();
      });
      ctx.restore();
      // the skins over the top
      outline();
      ctx.lineWidth = 2;
      ctx.strokeStyle = col(0.95 * open);
      ctx.stroke();
      ctx.restore();

      // label
      ctx.globalAlpha = open;
      ctx.fillStyle = col(0.95);
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(co.label, cxI, cyI + r + 16);
      ctx.fillStyle = "rgba(" + rgb + ",0.7)";
      ctx.fillText(co.sub, cxI, cyI + r + 29);
      ctx.restore();
    }

    /* Run at the display's rate, and advance by elapsed time.

       The old loop capped itself at 40fps by discarding any frame that
       arrived inside a 25ms window. On a 60Hz display that leaves frames
       2,1,2,1 vsyncs apart: the motion is not slow, it is unevenly paced,
       and uneven pacing is exactly what reads as lag. Worse, everything
       advanced per FRAME, so the same animation ran at different speeds on
       different displays.

       T_RATE and SPIN_RATE are the old per-frame steps times the old 40fps
       cap, so nothing changes speed — it just arrives smoothly now. dt is
       clamped so a backgrounded tab returning does not jump the animation. */
    let lastTs = 0;
    const T_RATE = 0.018 * 40;      // model time per second
    const SPIN_RATE = 0.0055 * 40;  // radians per second
    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { lastTs = ts; return; }
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
      lastTs = ts;
      t += T_RATE * dt;
      angY += (model.spinRate || SPIN_RATE) * dt;
      if (model.deploys) {
        const target = hovered ? 1 : 0;
        deploy += (target - deploy) * Math.min(1, 3.6 * dt); // ease, per second
        if (Math.abs(target - deploy) < 0.003) deploy = target;
      }
      hoverT = hovered ? hoverT + T_RATE * dt : 0;
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
    // Setting canvas.width inside resize() wipes the bitmap, so the frame has
    // to be redrawn immediately after. Without this a single resize event —
    // and on mobile the address bar sliding away counts — leaves every
    // hologram permanently blank until the pointer happens to hover it.
    window.addEventListener("resize", () => { resize(); render(); }, { passive: true });

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
      // Spin only while the pointer is hovering the media panel. Each page
      // frames the canvas differently — .plate__media in the build grids,
      // .detail__media on the build page — and the hover has to be bound to
      // whichever frame is actually there. Miss one and the model on that
      // page sits frozen, never spinning and never running its dynamic
      // geometry. .card__media is the old grid's name, kept so an older
      // cached page still animates.
      const hot = c.closest(".plate__media, .card__media, .detail__media") || c;
      hot.addEventListener("pointerenter", () => inst.setHover(true));
      hot.addEventListener("pointerleave", () => inst.setHover(false));
    });
  }

  window.BBTHolograms = { mount };
})();
