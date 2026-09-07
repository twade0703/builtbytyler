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

   Each <canvas data-holo="evtol|arm|drone|rccar|rocket"> becomes one hologram.
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

    m.dynamic = function (time, deploy, spin, hoverT) {
      deploy = deploy == null ? 1 : deploy;
      spin = spin == null ? 0 : spin;
      hoverT = hoverT == null ? 99 : hoverT;
      const dep = deploy * deploy * (3 - 2 * deploy);
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);

      // axis 0: the carriage runs most of the rail, because that is the point
      const bz = Math.sin(time * 0.42) * (rlen * 0.34) * dep;
      const yaw = Math.sin(time * 0.40 + 0.6) * 0.85 * dep;
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
      const ext = [
        -0.24 + Math.sin(time * 0.62) * 0.38,
         1.05 + Math.sin(time * 0.94 + 1.1) * 0.46,
        -0.50 + Math.sin(time * 1.35 + 2.2) * 0.46,
      ];
      const col = [1.00, 1.92, 1.06];
      const a2 = col[0] + (ext[0] - col[0]) * dep;
      const a3 = col[1] + (ext[1] - col[1]) * dep;
      const a5 = col[2] + (ext[2] - col[2]) * dep;

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
      const trip = (time * 0.15) % 1;
      let wob = 0;
      if (trip < 0.32) { const q = trip / 0.32; wob = Math.sin(q * Math.PI * 2.4) * Math.exp(-q * 3.2) * 0.6; }
      const lock = Math.max(0, Math.min(1, (hoverT - 1.9) / 0.6));
      const lockS = lock * lock * (3 - 2 * lock);
      const scanPitch = 0.12 + Math.sin(hoverT * 2.2 + 1.0) * 0.26;
      const searchGaze = Math.PI * Math.max(0, 1 - hoverT * 0.5) + Math.sin(hoverT * 3.0) * 1.0;
      const gaze = searchGaze * (1 - lockS) + (-wob) * lockS;
      const pitch = 0.40 * lockS + scanPitch * (1 - lockS);
      const ga = spin + yaw + gaze;
      const fPark = V.norm(V.sub(W(TL[0] + tDir[0], TL[1] + tDir[1], vFA), f1));
      const fAct = [0.913 * Math.sin(ga), pitch, -0.913 * Math.cos(ga)];
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
      const tally = C(z0 + 0.012, bw * 0.6, bh);
      dots.push([tally[0], tally[1], tally[2], lockS > 0.9 ? 1.9 : 0.85, lockS > 0.9 ? 1 : 0]);
      return { segments: segs, faces, dots };
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
    const fpW = 0.30, fpD = 0.92;        // footprint (x, z) — narrow and long, like a racer
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
    parts.push(makeBox(0, 0.0, 0, 0.17, 0.05, 0.17));              // FC / ESC stack
    // the four standoffs the stack is bolted through
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) =>
      parts.push(tubeAlong([a * 0.065, yBot, b * 0.065], [a * 0.065, yTop, b * 0.065], 0.012, 6)));
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
    // Thicker arms. A race quad's arms are the heaviest carbon on the airframe
    // because they are what breaks, and drawing them thin made it look fragile.
    const ay = -0.02, aw = 0.062, at = 0.020; // arm height, half-width, half-thickness
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
      parts.push(makeCylinderY(mx, 0.03, mz, 0.115, 0.10, 12)); // bell motor can
      parts.push(makeRing(mx, -0.012, mz, 0.075, 10, "y"));      // arm-end motor mount
      // the four bolts each motor sits on
      for (let b = 0; b < 4; b++) {
        const ba = (b / 4) * Math.PI * 2 + 0.6;
        parts.push(makeRing(mx + Math.cos(ba) * 0.058, -0.006, mz + Math.sin(ba) * 0.058, 0.011, 5, "y"));
      }
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

  /* RC car — a 992 Porsche 911 GT3 RS.

     FOURTH REBUILD. The three faults, in the order they mattered:

     1. THE SHOULDER WAS IN THE WRONG PLACE. Measured, the widest point of
        the body sat 26-34% up the body height through the whole cabin —
        down at wheel-hub level. On any real car the shoulder is at 55-60%.
        So the model was a thin slab with an enormous tapering cone on top
        of it, which is exactly why it read as a bubble instead of a car.
        Every station now states its floor, its roof and where the shoulder
        sits between them, so this cannot drift again.

     2. THE SURFACE WAS FACETED ALONG ITS LENGTH. Stations were joined
        straight, so a 14-station body had 13 visible kinks down the flank.
        The rings are now Catmull-Rom interpolated between control stations
        — smooth in both directions, which is the whole point of a car.

     3. FLOATING PARTS. Dive planes, a chassis plate and a separate
        transmitter were drawn near the car rather than attached to it, and
        at this size unattached geometry just reads as debris. Everything
        left is connected: the splitter grows off the nose, the diffuser off
        the tail, and the wing stands on struts that visibly land on the
        rear deck. The transmitter is gone — it was overlapping the roof.

     Panel lines are drawn through surf(), so they lie ON the surface. */
  function buildRccar() {
    const parts = [];
    const GY = -0.44;
    const WRF = 0.108, WWF = 0.092;
    const WRR = 0.126, WWR = 0.120;
    const AXF = 0.335, AXR = -0.335;
    const TRKF = 0.212, TRKR = 0.218;

    /* z, floor y, roof y, max half-width, shoulder height as a fraction of
       the body height at that station, upper exponent, lower exponent.
       Low upper exponents give the narrow rounded greenhouse; high ones give
       the wide flat decks fore and aft. */
    const CTRL = [
      { z: 0.640, yb: -0.318, yt: -0.286, rx: 0.146, wf: 0.55, nu: 2.6, nd: 2.5 },
      { z: 0.578, yb: -0.340, yt: -0.262, rx: 0.198, wf: 0.56, nu: 2.8, nd: 2.7 },
      { z: 0.500, yb: -0.352, yt: -0.238, rx: 0.234, wf: 0.58, nu: 3.0, nd: 2.9 },
      { z: 0.415, yb: -0.356, yt: -0.222, rx: 0.252, wf: 0.60, nu: 3.1, nd: 3.0 },
      { z: 0.300, yb: -0.358, yt: -0.212, rx: 0.260, wf: 0.61, nu: 3.1, nd: 3.0 },
      { z: 0.175, yb: -0.358, yt: -0.202, rx: 0.264, wf: 0.62, nu: 3.0, nd: 3.0 },
      { z: 0.065, yb: -0.358, yt: -0.140, rx: 0.266, wf: 0.60, nu: 2.4, nd: 3.0 },
      { z: -0.050, yb: -0.358, yt: -0.056, rx: 0.268, wf: 0.58, nu: 2.05, nd: 3.0 },
      { z: -0.170, yb: -0.357, yt: -0.052, rx: 0.270, wf: 0.58, nu: 2.05, nd: 3.0 },
      { z: -0.295, yb: -0.355, yt: -0.082, rx: 0.276, wf: 0.60, nu: 2.2, nd: 3.0 },
      { z: -0.410, yb: -0.352, yt: -0.126, rx: 0.278, wf: 0.62, nu: 2.6, nd: 3.0 },
      { z: -0.520, yb: -0.348, yt: -0.168, rx: 0.268, wf: 0.62, nu: 2.9, nd: 3.0 },
      { z: -0.596, yb: -0.344, yt: -0.204, rx: 0.248, wf: 0.60, nu: 2.9, nd: 2.9 },
      { z: -0.642, yb: -0.334, yt: -0.246, rx: 0.192, wf: 0.56, nu: 2.7, nd: 2.6 },
    ];
    const KEYS = ["yb", "yt", "rx", "wf", "nu", "nd"];

    // Catmull-Rom through the control stations, so the flank is smooth along
    // its length instead of kinking at every station.
    function paramsAt(u) {
      const n = CTRL.length;
      const x = Math.max(0, Math.min(n - 1.0001, u * (n - 1)));
      const i = Math.floor(x), t = x - i;
      const P = (k) => CTRL[Math.max(0, Math.min(n - 1, k))];
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const cr = (a, b, c, d) =>
        0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      const out = { z: cr(p0.z, p1.z, p2.z, p3.z) };
      KEYS.forEach((k) => { out[k] = cr(p0[k], p1[k], p2[k], p3[k]); });
      return out;
    }
    // Superellipse point on one station. theta 0 = right shoulder, PI/2 = top.
    function ringPoint(s, th) {
      const c = Math.cos(th), sn = Math.sin(th);
      const cy = s.yb + (s.yt - s.yb) * s.wf;
      const up = sn >= 0;
      const ry = up ? (s.yt - cy) : (cy - s.yb);
      const p = 2 / (up ? s.nu : s.nd);
      return [(c < 0 ? -1 : 1) * s.rx * Math.pow(Math.abs(c), p),
              cy + (up ? 1 : -1) * ry * Math.pow(Math.abs(sn), p), s.z];
    }
    // The surface, addressed by z and theta — used by every panel line so
    // nothing is drawn floating near the body.
    function surf(z, th) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (paramsAt(mid).z > z) lo = mid; else hi = mid;
      }
      return ringPoint(paramsAt((lo + hi) / 2), th);
    }

    const NRING = 22, NSEG = 16;
    const bv = [], be = [], bf = [];
    for (let r = 0; r < NRING; r++) {
      const s = paramsAt(r / (NRING - 1));
      const o = bv.length;
      for (let k = 0; k < NSEG; k++) bv.push(ringPoint(s, (k / NSEG) * Math.PI * 2));
      if (r % 3 === 0) for (let k = 0; k < NSEG; k++) be.push([o + k, o + ((k + 1) % NSEG)]);
      if (r > 0) {
        const p = o - NSEG;
        for (let k = 0; k < NSEG; k++) {
          const j = (k + 1) % NSEG;
          if (k % 2 === 0) be.push([p + k, o + k]);
          bf.push([p + k, p + j, o + j, o + k]);
        }
      }
    }
    bf.push(Array.from({ length: NSEG }, (_, k) => k));
    const lastO = bv.length - NSEG;
    bf.push(Array.from({ length: NSEG }, (_, k) => lastO + NSEG - 1 - k));
    parts.push({ v: bv, e: be, f: bf });

    const RAD = Math.PI / 180;
    const line = (pairs, close) => {
      const v = pairs.map((q) => surf(q[0], q[1]));
      const e = [];
      for (let i = 0; i < v.length - 1; i++) e.push([i, i + 1]);
      if (close) e.push([v.length - 1, 0]);
      return { v: v, e: e, f: [] };
    };

    /* ---- the daylight opening: A-pillar, roof rail, the long shallow
           C-pillar, and the beltline back. Drawn on the surface. ---- */
    [-1, 1].forEach((sd) => {
      const T = (d) => (sd > 0 ? d : 180 - d) * RAD;
      const dlo = [];
      [[0.078, 22], [0.040, 38], [0.000, 54], [-0.045, 66]].forEach((q) => dlo.push([q[0], T(q[1])]));
      [[-0.105, 70], [-0.175, 70], [-0.240, 67]].forEach((q) => dlo.push([q[0], T(q[1])]));
      [[-0.305, 56], [-0.352, 42], [-0.378, 30]].forEach((q) => dlo.push([q[0], T(q[1])]));
      [[-0.300, 22], [-0.190, 20], [-0.080, 20], [0.010, 21]].forEach((q) => dlo.push([q[0], T(q[1])]));
      parts.push(line(dlo, true));
    });
    parts.push(line([[0.078, 22 * RAD], [0.074, 60 * RAD], [0.072, 90 * RAD], [0.074, 120 * RAD], [0.078, 158 * RAD]]));
    parts.push(line([[-0.045, 66 * RAD], [-0.043, 90 * RAD], [-0.045, 114 * RAD]]));
    parts.push(line([[-0.378, 30 * RAD], [-0.386, 60 * RAD], [-0.390, 90 * RAD], [-0.386, 120 * RAD], [-0.378, 150 * RAD]]));
    // shoulder crease the length of the car — the line the light catches
    [-1, 1].forEach((sd) => {
      const T = (d) => (sd > 0 ? d : 180 - d) * RAD;
      parts.push(line([[0.570, T(8)], [0.440, T(10)], [0.300, T(12)], [0.150, T(13)],
                       [-0.050, T(13)], [-0.210, T(12)], [-0.370, T(10)], [-0.520, T(8)]]));
    });
    // roof channel
    [-1, 1].forEach((sd) => parts.push(line(
      [[-0.030, (90 - sd * 8) * RAD], [-0.120, (90 - sd * 8) * RAD], [-0.215, (90 - sd * 8) * RAD]])));

    // ---- bonnet dip between the raised fender tops ----
    const dip = [];
    for (let i = 0; i <= 6; i++) dip.push(surf(0.460 - i * 0.055, 62 * RAD));
    for (let i = 6; i >= 0; i--) dip.push(surf(0.460 - i * 0.055, 118 * RAD));
    parts.push({ v: dip, e: dip.map((_, i) => [i, (i + 1) % dip.length]), f: [dip.map((_, i) => i)] });

    /* ---- FENDER LOUVRES — the RS signature, on the arch top ---- */
    [-1, 1].forEach((sd) => {
      const T = (d) => (sd > 0 ? d : 180 - d) * RAD;
      parts.push(line([[0.400, T(38)], [0.400, T(70)], [0.235, T(70)], [0.235, T(38)]], true));
      for (let i = 1; i <= 4; i++) {
        const z = 0.400 - i * 0.033;
        parts.push(line([[z, T(40)], [z, T(68)]]));
      }
    });

    // ---- round headlights, sunk into the fenders ----
    [-0.160, 0.160].forEach((x) => {
      parts.push(makeRing(x, -0.244, 0.498, 0.052, 14, "z"));
      parts.push(makeRing(x, -0.244, 0.510, 0.034, 12, "z"));
    });
    // centre radiator mouth
    parts.push({
      v: [[-0.124, -0.284, 0.596], [0.124, -0.284, 0.596], [0.124, -0.328, 0.596], [-0.124, -0.328, 0.596]],
      e: [[0, 1], [1, 2], [2, 3], [3, 0]], f: [[0, 1, 2, 3]],
    });
    for (let i = 0; i < 3; i++) {
      const y = -0.295 - i * 0.011;
      parts.push({ v: [[-0.118, y, 0.598], [0.118, y, 0.598]], e: [[0, 1]], f: [] });
    }

    /* ---- splitter: grown off the nose, not floating in front of it. Its
           inboard edge is a row of points taken from the body itself. ---- */
    const splitIn = [], splitOut = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8);
      const th = (200 + a * 140) * RAD;                 // sweep under the nose
      const p = surf(0.520 + a * 0.06 - 0.03, th);
      splitIn.push(p);
      splitOut.push([p[0] * 1.14, -0.348, p[2] + 0.052]);
    }
    for (let i = 0; i < splitIn.length - 1; i++) {
      parts.push({
        v: [splitIn[i], splitIn[i + 1], splitOut[i + 1], splitOut[i]],
        e: [[0, 1], [1, 2], [2, 3], [3, 0]], f: [[0, 1, 2, 3]],
      });
    }

    // ---- diffuser: same treatment at the tail ----
    const dfIn = [], dfOut = [];
    for (let i = 0; i <= 8; i++) {
      const a = i / 8;
      const th = (200 + a * 140) * RAD;
      const p = surf(-0.560 - a * 0.02, th);
      dfIn.push(p);
      dfOut.push([p[0] * 1.02, -0.336, p[2] - 0.088]);
    }
    for (let i = 0; i < dfIn.length - 1; i++) {
      parts.push({
        v: [dfIn[i], dfIn[i + 1], dfOut[i + 1], dfOut[i]],
        e: [[0, 1], [1, 2], [2, 3], [3, 0]], f: [[0, 1, 2, 3]],
      });
    }
    [-0.048, 0.048].forEach((x) =>
      parts.push(tubeAlong([x, -0.286, -0.628], [x, -0.286, -0.672], 0.024, 8)));
    parts.push(makeBox(0, -0.226, -0.640, 0.320, 0.018, 0.010));   // tail-light bar

    // ---- engine-lid grille and side intakes, on the surface ----
    for (let i = 0; i < 5; i++) {
      const z = -0.418 - i * 0.028;
      parts.push(line([[z, 60 * RAD], [z, 90 * RAD], [z, 120 * RAD]]));
    }
    [-1, 1].forEach((sd) => {
      const T = (d) => (sd > 0 ? d : 180 - d) * RAD;
      parts.push(line([[-0.120, T(2)], [-0.162, T(18)], [-0.240, T(16)], [-0.206, T(1)]], true));
      parts.push(line([[0.212, T(4)], [0.194, T(20)], [0.138, T(18)], [0.154, T(3)]], true));
    });

    // ---- arch lips ----
    [[AXF, 0.256, 0.150], [AXR, 0.266, 0.168]].forEach(function (a) {
      [-1, 1].forEach((sd) => parts.push(makeRing(sd * a[1], -0.332, a[0], a[2], 16, "x")));
    });

    /* ---- THE WING. Two elements, endplates, and swan necks whose lower
           end is a point taken off the rear deck — so it visibly stands on
           the car instead of hovering behind it. ---- */
    const WGY = -0.012, WGZ = -0.556;
    parts.push(plate([[-0.282, WGZ + 0.070], [0.282, WGZ + 0.070], [0.282, WGZ - 0.040], [-0.282, WGZ - 0.040]], "xz", WGY, 0.015));
    parts.push(plate([[-0.276, WGZ - 0.052], [0.276, WGZ - 0.052], [0.276, WGZ - 0.116], [-0.276, WGZ - 0.116]], "xz", WGY - 0.034, 0.012));
    [-1, 1].forEach((sd) => {
      const foot = surf(-0.470, (sd > 0 ? 62 : 118) * RAD);       // on the deck
      const knee = [sd * 0.140, WGY - 0.086, WGZ + 0.088];
      const top = [sd * 0.140, WGY + 0.012, WGZ + 0.030];
      parts.push(segBox(foot, knee, 0.019));
      parts.push(segBox(knee, top, 0.017));
    });
    [-1, 1].forEach((sd) => parts.push(plate(
      [[WGY + 0.062, WGZ + 0.098], [WGY + 0.062, WGZ - 0.130],
       [WGY - 0.098, WGZ - 0.130], [WGY - 0.098, WGZ + 0.054]], "yz", sd * 0.290, 0.012)));

    parts.push(makeBase(GY - 0.005, 1.06));

    const m = merge(parts);
    m.spinners = [];
    m.zoom = 1.24;
    m.dynamic = function (time) {
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);
      const steer = Math.sin(time * 0.55) * 0.36;
      const roll = time * 2.6;

      const wheel = (cx, cz, sd, steerAng, WR, WW) => {
        const cs = Math.cos(steerAng), sn = Math.sin(steerAng);
        const T = (x, y, z) => {
          const lx = x - cx, lz = z - cz;
          return [cx + lx * cs + lz * sn, y, cz + (-lx * sn + lz * cs)];
        };
        const HUB = GY + WR, xo = sd * WW / 2;
        const n = 18, out = [], inn = [];
        for (let i = 0; i < n; i++) {
          const a = roll + (i / n) * Math.PI * 2;
          const cy = Math.cos(a) * WR, sz = Math.sin(a) * WR;
          out.push(T(cx + xo, HUB + cy, cz + sz));
          inn.push(T(cx - xo, HUB + cy, cz + sz));
        }
        P.loop(out, 1.15); P.loop(inn, 1.1);
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          P.face([out[i], out[j], inn[j], inn[i]]);
          if (i % 6 === 0) P.line(out[i], inn[i], 0.85);
        }
        const rimC = T(cx + xo * 0.82, HUB, cz);
        const ax = V.norm(V.sub(T(cx + 1, HUB, cz), T(cx, HUB, cz)));
        const u = V.norm(V.cross(ax, [0, 0, 1])), v2 = V.norm(V.cross(ax, u));
        P.ringUV(rimC, u, v2, WR * 0.78, 16, 1.05);
        P.ringUV(rimC, u, v2, WR * 0.19, 8, 1.0);
        P.cap(rimC, u, v2, WR * 0.19, 8, 0.9);
        const at = (r, ang) => [
          rimC[0] + u[0] * Math.cos(ang) * WR * r + v2[0] * Math.sin(ang) * WR * r,
          rimC[1] + u[1] * Math.cos(ang) * WR * r + v2[1] * Math.sin(ang) * WR * r,
          rimC[2] + u[2] * Math.cos(ang) * WR * r + v2[2] * Math.sin(ang) * WR * r];
        for (let k = 0; k < 5; k++) {
          const a = roll + (k / 5) * Math.PI * 2;
          [-0.10, 0.10].forEach((off) => P.line(at(0.19, a), at(0.76, a + off), 0.9));
        }
      };

      [[AXF, 1, steer, WRF, WWF, TRKF], [AXF, -1, steer, WRF, WWF, TRKF],
       [AXR, 1, 0, WRR, WWR, TRKR], [AXR, -1, 0, WRR, WWR, TRKR]].forEach(function (w) {
        const z = w[0], sd = w[1], st = w[2], WR = w[3], WW = w[4], TRK = w[5];
        const cx = sd * TRK, HUB = GY + WR;
        wheel(cx, z, sd, st, WR, WW);
        // wishbones, tucked up inside the arch so they read as suspension
        const inner = sd * 0.120;
        P.beam([inner, HUB + 0.046, z], [cx - sd * 0.030, HUB + 0.038, z], 0.010, 0.9);
        P.beam([inner, HUB - 0.050, z], [cx - sd * 0.030, HUB - 0.042, z], 0.010, 0.9);
      });

      dots.push([-0.160, -0.244, 0.516, 2.1, 1], [0.160, -0.244, 0.516, 2.1, 1]);
      const brake = Math.sin(time * 1.1) < -0.3;
      [-0.115, 0.115].forEach((x) => dots.push([x, -0.226, -0.644, brake ? 2.3 : 1.0, brake ? 1 : 0]));
      return { segments: segs, faces, dots };
    };
    return m;
  }

  // High-power rocket on its launch rail. A proper airframe: ogive nose, body
  // tube with a switch band at the avionics bay, three swept fins, boat tail,
  // motor and retainer, rail buttons on the rail. The avionics sled is drawn
  // inside the tube. Live: the rail is a static test stand — the arming lamp
  // cycles, the motor lights, the plume builds and dies, and it arms again.
  function buildRocket() {
    const parts = [];
    const R = 0.125, seg = 14;
    const yB0 = -0.50, yB1 = 0.34;
    // body tube + seams
    parts.push(makeCylinderY(0, (yB0 + yB1) / 2, 0, R, yB1 - yB0, seg));
    [0.04, -0.20].forEach((y) => parts.push(makeRing(0, y, 0, R, seg, "y")));
    parts.push(makeRing(0, -0.10, 0, R + 0.012, seg, "y"));                 // switch band
    parts.push(makeRing(0, -0.07, 0, R + 0.012, seg, "y"));
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      parts.push({ v: [[Math.cos(a) * (R + 0.012), -0.10, Math.sin(a) * (R + 0.012)], [Math.cos(a) * (R + 0.012), -0.07, Math.sin(a) * (R + 0.012)]], e: [[0, 1]] });
    }
    // nose cone: elliptical ogive, lofted
    const L = 0.60, st = [];
    for (let i = 0; i <= 5; i++) {
      const f = i / 5;
      st.push({ y: yB1 + L * f, r: Math.max(R * Math.sqrt(1 - f * f) * (1 - 0.06 * f), 0.012) });
    }
    parts.push(makeLoftY(st, seg));
    parts.push({ v: [[0, yB1 + L, 0], [0, yB1 + L + 0.05, 0]], e: [[0, 1]] });  // tip
    // shoulder ring inside the tube where the cone seats
    parts.push(makeRing(0, yB1 - 0.06, 0, R - 0.015, seg, "y"));
    // three swept fins, one facing the viewer
    const fin = [[R, -0.18], [R + 0.22, -0.40], [R + 0.22, -0.56], [R, -0.50]];
    [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3].forEach((th) => {
      const c = Math.cos(th), s = Math.sin(th);
      const p = fin.map(([r, y]) => [r * c, y, r * s]);
      parts.push({ v: p, e: [[0, 1], [1, 2], [2, 3], [3, 0]] });
      parts.push({ v: [[(R + 0.11) * c, -0.29, (R + 0.11) * s], [(R + 0.11) * c, -0.53, (R + 0.11) * s]], e: [[0, 1]] }); // mid-chord rib
    });
    // boat tail, motor, retainer, nozzle
    parts.push(makeLoftY([{ y: yB0, r: R }, { y: yB0 - 0.07, r: R * 0.85 }, { y: yB0 - 0.13, r: 0.085 }], seg));
    parts.push(makeCylinderY(0, yB0 - 0.20, 0, 0.062, 0.14, 10));
    parts.push(makeRing(0, yB0 - 0.13, 0, 0.076, 12, "y"));
    parts.push(makeRing(0, yB0 - 0.16, 0, 0.076, 12, "y"));
    parts.push(makeRing(0, yB0 - 0.27, 0, 0.042, 10, "y"));               // nozzle throat
    // launch rail beside the rocket, with two rail buttons on the tube
    const RX = -R - 0.075;
    parts.push(makeBox(RX, -0.20, 0, 0.032, 1.42, 0.032));
    parts.push(makeBox(RX, -0.88, 0, 0.16, 0.05, 0.16));                   // rail foot
    parts.push(makeBox(RX - 0.035, -0.88, 0, 0.09, 0.03, 0.3));
    [-0.42, 0.12].forEach((y) => {
      parts.push(makeBox(RX + 0.03, y, 0, 0.03, 0.04, 0.03));             // rail button
      parts.push({ v: [[RX + 0.045, y, 0], [-R, y, 0]], e: [[0, 1]] });
    });
    // avionics sled inside the bay: a plate, an altimeter board, a battery
    parts.push(makeBox(0, -0.08, 0, 0.16, 0.20, 0.012));
    parts.push(makeBox(-0.035, -0.06, 0.02, 0.07, 0.10, 0.02));
    parts.push(makeBox(0.045, -0.10, 0.02, 0.05, 0.12, 0.035));
    parts.push(makeBase(-0.94, 0.98));

    const m = merge(parts);
    m.spinners = [];
    m.dynamic = function (time) {
      const segs = [], dots = [];
      const P = pen(segs);
      // arm → ignite → burn → fade, then arm again
      const cyc = (time * 0.10) % 1;
      let plume = 0;
      if (cyc > 0.50 && cyc < 0.62) plume = V.ss((cyc - 0.50) / 0.12);
      else if (cyc >= 0.62 && cyc < 0.86) plume = 1;
      else if (cyc >= 0.86) plume = 1 - V.ss((cyc - 0.86) / 0.14);
      const armed = cyc < 0.50 && ((time * 2.4) % 1) < 0.5;
      if (plume > 0.02) {
        const flick = 0.92 + 0.08 * Math.sin(time * 23) * Math.sin(time * 17);
        const y0 = yB0 - 0.27;
        // the plume: rings that widen and fade with distance from the nozzle
        for (let i = 0; i < 5; i++) {
          const f = (i + 1) / 5;
          const y = y0 - f * 0.55 * plume * flick;
          const r = 0.03 + f * f * 0.16 * plume;
          const wob = 1 + 0.05 * Math.sin(time * 30 + i);
          P.ring(0, y, 0, r * wob, 10, "y", 1.6 * (1 - f * 0.7) * plume);
        }
        // shock diamonds: a bright core down the centre
        for (let i = 0; i < 3; i++) {
          const y = y0 - (i + 0.5) * 0.11 * plume;
          dots.push([0, y, 0, (2.6 - i * 0.5) * plume, 1]);
        }
        dots.push([0, y0 + 0.01, 0, 3.4 * plume, 1]);
      }
      // altimeter LED in the bay: blinks while armed, solid during the burn
      const lit = plume > 0.5 || armed;
      dots.push([-0.035, -0.02, 0.035, lit ? 2.4 : 1.0, lit ? 1 : 0]);
      return { segments: segs, dots };
    };
    return m;
  }

  const MODELS = { evtol: buildEvtol, arm: buildArm, drone: buildDrone, rccar: buildRccar, rocket: buildRocket };
  // Per-model holographic tint (rgb triplets) — cyan family to match the UI.
  const TINTS = {
    evtol: [86, 200, 255],
    arm: [80, 196, 255],
    drone: [110, 214, 255],
    rccar: [104, 212, 255],
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
    /* The resting angle each model is first drawn at. `data-holo-angle` on the
       canvas overrides it, which exists so a model can be inspected from a
       chosen side: the preview pane throttles animation frames hard when it is
       not the focused window, so waiting for the rotation to come round to the
       view you need does not work. π/2 is side-on. */
    const angAttr = parseFloat(canvas.getAttribute("data-holo-angle"));
    let raf = 0, t = 0;
    let angY = Number.isFinite(angAttr) ? angAttr
             : type === "arm" ? -0.6 : type === "rccar" ? 2.5 : 0.4;
    let hovered = false;
    let deploy = reduce ? 1 : 0;     // 0 = parked/collapsed, 1 = deployed (deploy models)
    let hoverT = 0;                  // grows while hovered (arm's search-then-lock timing)
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
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 0.36 left the models floating small in a large frame. 0.41 fills the
      // card without the ground ellipse (radius 1.1) touching the edges.
      scale = Math.min(w, h) * 0.41 * (model.zoom || 1);
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
    function project(x, y, z, ca, sa) {
      // rotate about Y
      const X = x * ca + z * sa;
      const Z = -x * sa + z * ca;
      const Y = y;
      // tilt about X
      const Y2 = Y * cosT - Z * sinT;
      const Z2 = Y * sinT + Z * cosT;
      const f = viewerDist / (viewerDist + Z2); // perspective foreshortening
      return [cx + X * f * scale, cy - Y2 * f * scale, f, -Z2];
    }

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
      const floor = project(0, -0.98, 0, ca, sa);
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
              const u = BLADE[k][0], vv = BLADE[k][1];
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
        if (depth > 0.66) for (let k = 0; k < ar.length; k++) rimEdges.push(ar[k]);
      }

      // ---- 2. rim pass ----
      // The glow, additively, over the near shell only. Applied to everything
      // it becomes fog; applied to the near edges it reads as light coming off
      // the object, which is the thing that made the old version look flat.
      if (!reduce && rimEdges.length) {
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = "rgba(" + rgb + ",0.9)";
        ctx.shadowBlur = 9;
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
