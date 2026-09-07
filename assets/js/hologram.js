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

   Each <canvas data-holo="evtol|arm|drone|rccar|transmitter|turret|rocket">
   becomes one hologram.
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
    const VDIH = 42 * Math.PI / 180, VSPAN = 0.46;
    const VX = Math.cos(VDIH) * VSPAN, VY = Math.sin(VDIH) * VSPAN;
    // root LE/TE and tip LE/TE for one side; the panel is a thin slab
    const vRootLE = [0, TZ, -0.60], vRootTE = [0, TZ, -0.86];
    [-1, 1].forEach((sd) => {
      const tipLE = [sd * VX, TZ + VY, -0.71];
      const tipTE = [sd * VX, TZ + VY, -0.86];
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
      const midLE = [sd * VX * 0.55, TZ + VY * 0.55, -0.655];
      const midTE = [sd * VX * 0.55, TZ + VY * 0.55, -0.86];
      parts.push({ v: [midLE, midTE], e: [[0, 1]], f: [] });
      parts.push(makeRing(sd * VX, TZ + VY, -0.80, 0.020, 6, "x"));
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
    const KY = -0.26;
    [-0.20, 0.20].forEach((x) => {
      parts.push(tubeAlong([x, KY, -0.36], [x, KY, 0.34], 0.024, 8));
      parts.push(tubeAlong([x, KY, 0.34], [x, KY + 0.07, 0.46], 0.020, 6)); // upturned tip
      [-0.20, 0.24].forEach((z) => parts.push(segBox([x, KY, z], [x * 0.35, -0.11, z], 0.026)));
      parts.push(makeBox(x, KY + 0.035, 0.02, 0.075, 0.016, 0.20));         // step pad
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
        const root = [0, TZ, -0.86];
        const tip = [sd * VX, TZ + VY, -0.86];
        surface(root, tip, [0, 0, -1], 0.075, pitchIn + sd * yawIn);
      });

      /* Lights. There is deliberately nothing blinking in the middle of the
         tail — a V-tail has no centre to put a light on, and a strobe there
         drew the eye to the one part of the aircraft that should be quiet.
         Steady nav lights sit on the two ruddervator tips and the wing tips
         instead, and the landing light is on in the hover and off in cruise,
         which is what a real one does. */
      dots.push([-VX, TZ + VY, -0.80, 1.5, 1], [VX, TZ + VY, -0.80, 1.5, 1]);
      dots.push([-1.0, WY, LE(1.0), 1.6, 1], [1.0, WY, LE(1.0), 1.6, 1]);
      dots.push([0, -0.10, 0.86, sm < 0.5 ? 2.6 : 0.9, sm < 0.5 ? 1 : 0]);
      return { segments: segs, faces, dots };
    };
    return m;
  }

  /* NEMO camera arm — a six-axis robot on a linear slide.

     Proportioned off real machines (ABB IRB 2600, KUKA KR 10 class) rather
     than invented, because the proportions are what the eye checks:

       · The upper arm is the longest link. The forearm is about 80% of it,
         and the wrist is about a quarter of the forearm. An arm with three
         similar-length links reads as a toy.
       · The elbow housing is WIDER than either link it joins. That bulge is
         the gearbox, and it is the most distinctive silhouette on the
         machine.
       · The wrist is small and busy, the tool is smaller still. Anything
         chunky on the end reads as a prop.
       · Total reach is a bit over twice the height of the shoulder above
         its base. Longer than that and it stops looking like it could lift
         anything.

     Axis 1 slews the whole machine; axes 2, 3 and 5 work in the arm's own
     plane; the links are offset laterally from one another so the machine
     cranks through itself the way real ones do. Everything above the
     carriage is drawn per frame with faces, so the near side occludes the
     far side and the arm occludes the base. */
  function buildArm() {
    const parts = [];

    // ---- linear slide: guide rails, end mounts, leadscrew, drive ----
    const rx = 0.32, ry = -0.90, rlen = 1.04;
    [-rx, rx].forEach((x) => {
      parts.push(makeBox(x, ry, 0, 0.080, 0.080, rlen));
      parts.push(makeBox(x, ry + 0.049, 0, 0.095, 0.018, rlen));
    });
    parts.push(makeBox(0, ry, rlen / 2, 0.84, 0.14, 0.085));
    parts.push(makeBox(0, ry, -rlen / 2, 0.84, 0.14, 0.085));
    parts.push(tubeAlong([0, ry, -rlen / 2 - 0.085], [0, ry, -rlen / 2 - 0.235], 0.092, 10));
    parts.push(makeBox(0, ry, -rlen / 2 - 0.255, 0.15, 0.15, 0.045));
    parts.push(tubeAlong([0, ry, -rlen / 2], [0, ry, rlen / 2], 0.020, 8));
    for (let i = 0; i < 8; i++) {
      const z = -rlen / 2 + 0.07 + i * (rlen - 0.14) / 7;
      parts.push(makeBox(rx + 0.070, ry + 0.028, z, 0.032, 0.042, 0.052));
    }
    parts.push(makeBase(-1.00, 1.04));

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

      const bz = Math.sin(time * 0.55) * 0.26 * dep;          // axis 0, rail travel
      const yaw = Math.sin(time * 0.40 + 0.6) * 0.80 * dep;   // axis 1, slew
      const cy1 = Math.cos(yaw), sy1 = Math.sin(yaw);
      // local (reach u, height y, lateral v) → world, yawed about the turret
      const W = (u, y, v) => [u * cy1 + v * sy1, y, bz + (-u * sy1 + v * cy1)];

      // ---- carriage ----
      P.box(0, -0.848, bz, 0.56, 0.050, 0.38, 1.15);
      [-0.32, 0.32].forEach((x) => {
        P.box(x, -0.884, bz, 0.145, 0.105, 0.28, 1.05);
        P.box(x, -0.826, bz, 0.165, 0.018, 0.30, 0.95);
      });

      // ---- axis 1: base casting and slew ring ----
      P.tube([0, -0.822, bz], [0, 1, 0], [
        { d: 0, r: 0.148 }, { d: 0.044, r: 0.142 }, { d: 0.094, r: 0.118 },
      ], 16, 1.15);
      P.ring(0, -0.726, bz, 0.122, 18, "y", 1.15);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        P.line([Math.cos(a) * 0.136, -0.735, bz + Math.sin(a) * 0.136],
               [Math.cos(a) * 0.136, -0.720, bz + Math.sin(a) * 0.136], 0.85);
      }

      /* ---- the turret column. Boxy, wider at the bottom, and it carries
             the axis-2 bearing on one side — the shoulder is never on the
             column's centreline on a real machine. ---- */
      const SHy = -0.430, vSH = 0.0;
      const colB = -0.712, colT = SHy + 0.040;
      const cw0 = 0.112, cw1 = 0.078, cd0 = 0.112, cd1 = 0.086;
      const colCorners = (y, w, d) => [
        W(-w, y, vSH + d), W(w, y, vSH + d), W(w, y, vSH - d), W(-w, y, vSH - d),
      ];
      const cb = colCorners(colB, cw0, cd0), ct = colCorners(colT, cw1, cd1);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        P.line(cb[i], cb[j], 1.15); P.line(ct[i], ct[j], 1.15); P.line(cb[i], ct[i], 1.15);
        P.face([cb[i], cb[j], ct[j], ct[i]]);
      }
      P.face([ct[0], ct[1], ct[2], ct[3]]);

      /* ---- axes 2 and 3 ----
         L2 is the longest link, L3 is 80% of it, the wrist a quarter of L3. */
      const L2 = 0.410, L3 = 0.245, L4 = 0.070;
      const ext = [
        -0.22 + Math.sin(time * 0.62) * 0.36,
         1.02 + Math.sin(time * 0.94 + 1.1) * 0.46,
        -0.48 + Math.sin(time * 1.35 + 2.2) * 0.46,
      ];
      const col = [0.98, 1.92, 1.05];                        // parked, folded over the base
      const a2 = col[0] + (ext[0] - col[0]) * dep;
      const a3 = col[1] + (ext[1] - col[1]) * dep;
      const a5 = col[2] + (ext[2] - col[2]) * dep;

      const SH = [0, SHy];
      const EL = [SH[0] + Math.sin(a2) * L2, SH[1] + Math.cos(a2) * L2];
      const d23 = a2 + a3;
      const WR = [EL[0] + Math.sin(d23) * L3, EL[1] + Math.cos(d23) * L3];
      const d5 = d23 + a5;
      const TL = [WR[0] + Math.sin(d5) * L4, WR[1] + Math.cos(d5) * L4];

      // lateral offsets — the crank through the machine
      const vUP = 0.052, vEL = 0.052, vFA = 0.014;

      // A tapered link casting between two stations in the arm plane.
      const casting = (A, B, vA, vB, wA, wB) => {
        const dU = B[0] - A[0], dY = B[1] - A[1];
        const len = Math.hypot(dU, dY) || 1;
        const nu = -dY / len, ny = dU / len;
        const corner = (Pt, v, w, dpt) => [
          W(Pt[0] + nu * w, Pt[1] + ny * w, v + dpt),
          W(Pt[0] - nu * w, Pt[1] - ny * w, v + dpt),
          W(Pt[0] - nu * w, Pt[1] - ny * w, v - dpt),
          W(Pt[0] + nu * w, Pt[1] + ny * w, v - dpt),
        ];
        const cA = corner(A, vA, wA, wA * 0.92), cB = corner(B, vB, wB, wB * 0.92);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          P.line(cA[i], cA[j], 1.2); P.line(cB[i], cB[j], 1.2); P.line(cA[i], cB[i], 1.2);
          P.face([cA[i], cA[j], cB[j], cB[i]]);
        }
        P.face([cA[0], cA[1], cA[2], cA[3]]);
        P.face([cB[3], cB[2], cB[1], cB[0]]);
      };

      // A joint housing: a drum on the lateral axis.
      const drum = (Pt, v, r, half, seg, lw) => {
        const c0 = W(Pt[0], Pt[1], v - half), c1 = W(Pt[0], Pt[1], v + half);
        const ax = V.sub(c1, c0), L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
        P.tube(c0, ax, [{ d: 0, r: r }, { d: L, r: r }], seg, lw);
        const u1 = V.norm(V.sub(W(Pt[0] + 1, Pt[1], v), W(Pt[0], Pt[1], v)));
        P.cap(c1, u1, [0, 1, 0], r, seg, lw * 0.9);
        P.cap(c0, [0, 1, 0], u1, r, seg, lw * 0.9);
        return { c0, c1, u1 };
      };

      // shoulder: bearing boss on the column, motor can behind it
      const sh = drum(SH, vSH + 0.034, 0.080, 0.048, 14, 1.15);
      const mc0 = W(SH[0], SH[1], vSH - 0.046), mc1 = W(SH[0] - 0.010, SH[1] - 0.010, vSH - 0.146);
      const mcL = Math.hypot(mc1[0] - mc0[0], mc1[1] - mc0[1], mc1[2] - mc0[2]);
      P.tube(mc0, V.sub(mc1, mc0), [
        { d: 0, r: 0.058 }, { d: mcL * 0.74, r: 0.058 }, { d: mcL, r: 0.040 },
      ], 12, 1.05);
      P.cap(mc1, sh.u1, [0, 1, 0], 0.040, 12, 0.95);

      // upper arm — the long link, offset to one side
      casting(SH, EL, vSH + 0.030, vUP, 0.052, 0.040);

      /* elbow — the gearbox housing, wider than either link. This bulge is
         the shape people recognise; without it the arm reads as two sticks
         hinged together. */
      drum(EL, vEL - 0.005, 0.068, 0.054, 14, 1.15);

      // forearm — shorter, tapering hard toward the wrist
      casting(EL, WR, vEL - 0.010, vFA, 0.038, 0.026);

      /* ---- wrist: three short cylinders in series, compact and busy ----
         Total length is a quarter of the forearm. This is the part that was
         wrong before: a big boxy head on the end of a slim forearm is what
         made the whole machine read as fake. */
      const fDir = [Math.sin(d23), Math.cos(d23)];
      const w0 = W(WR[0] - fDir[0] * 0.024, WR[1] - fDir[1] * 0.024, vFA);
      const w1 = W(WR[0] + fDir[0] * 0.018, WR[1] + fDir[1] * 0.018, vFA);
      P.tube(w0, V.sub(w1, w0), [
        { d: 0, r: 0.034 }, { d: Math.hypot(w1[0] - w0[0], w1[1] - w0[1], w1[2] - w0[2]), r: 0.032 },
      ], 12, 1.1);                                            // axis 4, roll
      drum(WR, vFA, 0.031, 0.034, 12, 1.05);                  // axis 5, pitch
      const tDir = [Math.sin(d5), Math.cos(d5)];
      const f0 = W(WR[0] + tDir[0] * 0.024, WR[1] + tDir[1] * 0.024, vFA);
      const f1 = W(TL[0], TL[1], vFA);
      const fL = Math.hypot(f1[0] - f0[0], f1[1] - f0[1], f1[2] - f0[2]) || 0.001;
      P.tube(f0, V.sub(f1, f0), [
        { d: 0, r: 0.027 }, { d: fL * 0.7, r: 0.025 }, { d: fL, r: 0.033 },
      ], 12, 1.1);                                            // axis 6 + tool flange
      P.cap(f1, V.norm(V.sub(f1, f0)), [0, 1, 0], 0.033, 12, 1.0);

      /* ---- the camera. A compact cine body on the flange, not a crate:
             a short barrel, a lens hood, and a handle. It is deliberately
             smaller than the elbow housing. ---- */
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
      const f = V.norm([
        fPark[0] * (1 - dep) + fAct[0] * dep,
        fPark[1] * (1 - dep) + fAct[1] * dep,
        fPark[2] * (1 - dep) + fAct[2] * dep,
      ]);
      let rgt = V.cross(f, [0, 1, 0]);
      if (Math.hypot(rgt[0], rgt[1], rgt[2]) < 0.001) rgt = [1, 0, 0];
      rgt = V.norm(rgt);
      const cup = V.cross(f, rgt);
      const O = f1;
      const C = (d, u, v) => [
        O[0] + f[0] * d + rgt[0] * u + cup[0] * v,
        O[1] + f[1] * d + rgt[1] * u + cup[1] * v,
        O[2] + f[2] * d + rgt[2] * u + cup[2] * v,
      ];
      // body: a small slab, wider than tall
      const bw = 0.050, bh = 0.040, z0 = 0.010, z1 = 0.098;
      const bk = [C(z0, -bw, -bh), C(z0, bw, -bh), C(z0, bw, bh), C(z0, -bw, bh)];
      const fr = [C(z1, -bw, -bh), C(z1, bw, -bh), C(z1, bw, bh), C(z1, -bw, bh)];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        P.line(bk[i], bk[j], 1.15); P.line(fr[i], fr[j], 1.15); P.line(bk[i], fr[i], 1.15);
        P.face([bk[i], bk[j], fr[j], fr[i]]);
      }
      P.face([bk[3], bk[2], bk[1], bk[0]]);
      P.face(fr);
      // lens: a short barrel with a hood ring
      P.tube(C(z1, 0, -0.003), f, [
        { d: 0, r: 0.030 }, { d: 0.038, r: 0.030 }, { d: 0.046, r: 0.035 },
      ], 12, 1.1);
      P.cap(C(z1 + 0.046, 0, -0.003), rgt, cup, 0.035, 12, 0.95);
      P.ringUV(C(z1 + 0.024, 0, -0.003), rgt, cup, 0.024, 10, 0.9);
      // top handle, and a small monitor hinged on the side
      P.line(C(0.024, -0.021, bh), C(0.024, -0.021, bh + 0.021), 0.95);
      P.line(C(0.082, -0.021, bh), C(0.082, -0.021, bh + 0.021), 0.95);
      P.line(C(0.024, -0.021, bh + 0.021), C(0.082, -0.021, bh + 0.021), 0.95);
      P.face([C(0.016, bw, -0.010), C(0.016, bw + 0.028, -0.016), C(0.072, bw + 0.028, -0.016), C(0.072, bw, -0.010)]);

      const lc = C(z1 + 0.056, 0, -0.003);
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

  /* RC car — a 1/10-scale sports car and the transmitter that drives it.

     This replaced a six-wheel rocker-bogie rover, which was the wrong
     machine entirely: that is a planetary lander's suspension on a vehicle
     the size of a coffee table, and the real build is a foot-long DC-motor
     RC car. Wrong reference, wrong scale, wrong everything.

     So: a low wedge body over a visible chassis plate, four wheels on
     wishbones, a rear wing on struts and a front splitter. The transmitter
     stands beside it on the pad — a pistol grip with a steering wheel and a
     throttle trigger — and its wheel turns in lockstep with the car's front
     wheels, which is the detail that says these two things are one product
     rather than two models sharing a stage. */
  function buildRccar() {
    const parts = [];
    const GY = -0.44;                       // ground plane
    const WR = 0.105, WW = 0.085;           // wheel radius / width
    const HUB = GY + WR;
    const AXF = 0.300, AXR = -0.300, TRK = 0.235;

    /* Body: a chain of rectangular sections lofted along Z. A car is a
       tapering box with a roof, and sections are the honest way to draw one
       — a smooth loft would read as a jelly bean at this line weight. */
    const SEC = [
      { z: 0.520, hw: 0.120, y0: -0.300, y1: -0.262 },
      { z: 0.420, hw: 0.185, y0: -0.312, y1: -0.222 },
      { z: 0.250, hw: 0.222, y0: -0.315, y1: -0.180 },
      { z: 0.085, hw: 0.228, y0: -0.315, y1: -0.098 },
      { z: -0.085, hw: 0.224, y0: -0.315, y1: -0.076 },
      { z: -0.250, hw: 0.216, y0: -0.312, y1: -0.128 },
      { z: -0.420, hw: 0.190, y0: -0.305, y1: -0.168 },
      { z: -0.510, hw: 0.128, y0: -0.298, y1: -0.208 },
    ];
    const ring = (s) => [
      [-s.hw, s.y0, s.z], [s.hw, s.y0, s.z], [s.hw, s.y1, s.z], [-s.hw, s.y1, s.z],
    ];
    const bv = [], be = [], bf = [];
    SEC.forEach((s, i) => {
      const r = ring(s), o = bv.length;
      r.forEach((q) => bv.push(q));
      be.push([o, o + 1], [o + 1, o + 2], [o + 2, o + 3], [o + 3, o]);
      if (i > 0) {
        const p = o - 4;
        for (let k = 0; k < 4; k++) {
          const j = (k + 1) % 4;
          be.push([p + k, o + k]);
          bf.push([p + k, p + j, o + j, o + k]);
        }
      }
    });
    bf.push([0, 1, 2, 3]);                                  // nose cap
    const lastO = bv.length - 4;
    bf.push([lastO + 3, lastO + 2, lastO + 1, lastO]);      // tail cap
    parts.push({ v: bv, e: be, f: bf });

    // waistline crease down each flank — the line that makes it read as a car
    [-1, 1].forEach((sd) => parts.push({
      v: [[sd * 0.122, -0.272, 0.515], [sd * 0.190, -0.258, 0.400],
          [sd * 0.226, -0.246, 0.180], [sd * 0.222, -0.244, -0.180],
          [sd * 0.196, -0.248, -0.415], [sd * 0.130, -0.252, -0.505]],
      e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], f: [],
    }));

    // cabin: a recessed cockpit opening on the deck, with a roll hoop
    parts.push({
      v: [[-0.150, -0.086, 0.070], [0.150, -0.086, 0.070],
          [0.140, -0.070, -0.170], [-0.140, -0.070, -0.170]],
      e: [[0, 1], [1, 2], [2, 3], [3, 0]], f: [[0, 1, 2, 3]],
    });
    parts.push({
      v: [[-0.120, -0.086, -0.100], [-0.105, -0.020, -0.135],
          [0.105, -0.020, -0.135], [0.120, -0.086, -0.100]],
      e: [[0, 1], [1, 2], [2, 3]], f: [],
    });

    // front splitter and rear diffuser
    parts.push(plate([[-0.215, 0.585], [0.215, 0.585], [0.185, 0.470], [-0.185, 0.470]], "xz", -0.305, 0.016));
    parts.push(plate([[-0.185, -0.505], [0.185, -0.505], [0.150, -0.585], [-0.150, -0.585]], "xz", -0.295, 0.016));
    for (let i = -2; i <= 2; i++) {                          // diffuser strakes
      parts.push({ v: [[i * 0.062, -0.288, -0.508], [i * 0.062, -0.288, -0.578]], e: [[0, 1]], f: [] });
    }

    // rear wing on two swan-neck struts
    parts.push(plate([[-0.215, -0.470], [0.215, -0.470], [0.215, -0.575], [-0.215, -0.575]], "xz", -0.055, 0.014));
    parts.push(plate([[-0.215, -0.560], [0.215, -0.560], [0.215, -0.600], [-0.215, -0.600]], "xz", -0.085, 0.012));
    [-0.150, 0.150].forEach((x) => {
      parts.push(segBox([x, -0.175, -0.505], [x, -0.062, -0.520], 0.016));
      parts.push(makeBox(x, -0.048, -0.520, 0.028, 0.020, 0.075));
    });
    // wing endplates: a plate in the YZ plane at each wing tip
    [-1, 1].forEach((sd) => parts.push(plate(
      [[-0.020, -0.455], [-0.020, -0.612], [-0.110, -0.612], [-0.110, -0.455]],
      "yz", sd * 0.222, 0.012)));

    // headlights and tail lights, set into the bodywork
    [-0.140, 0.140].forEach((x) => {
      parts.push(makeRing(x, -0.252, 0.505, 0.030, 10, "z"));
      parts.push(makeRing(x, -0.252, 0.512, 0.017, 8, "z"));
    });
    [-0.130, 0.130].forEach((x) => parts.push(makeBox(x, -0.238, -0.512, 0.070, 0.026, 0.010)));

    // chassis plate and the running gear visible under the body
    parts.push(plate([[-0.155, 0.430], [0.155, 0.430], [0.155, -0.440], [-0.155, -0.440]], "xz", -0.322, 0.012));
    parts.push(makeBox(0, -0.290, -0.120, 0.115, 0.060, 0.230));       // battery pack
    parts.push(tubeAlong([0, -0.288, -0.330], [0, -0.288, -0.430], 0.052, 10)); // motor can
    parts.push(makeBox(0, -0.286, -0.245, 0.090, 0.048, 0.075));       // ESC
    parts.push(makeBox(0.085, -0.286, 0.140, 0.070, 0.042, 0.060));    // receiver box
    parts.push(tubeAlong([0.085, -0.262, 0.140], [0.105, -0.055, 0.170], 0.007, 6)); // aerial tube

    /* ---- the transmitter, standing on the pad beside the car ---- */
    const TXC = [0.86, GY, 0.06];
    // case: a wedge that leans back, with the grip below it
    parts.push(makeBox(TXC[0], TXC[1] + 0.175, TXC[2], 0.165, 0.150, 0.115));
    parts.push(makeBox(TXC[0], TXC[1] + 0.258, TXC[2] - 0.008, 0.135, 0.040, 0.090));
    parts.push(segBox([TXC[0], TXC[1] + 0.105, TXC[2] + 0.010], [TXC[0], TXC[1] + 0.006, TXC[2] + 0.055], 0.088));
    parts.push(plate([[-0.058, -0.050], [0.058, -0.050], [0.058, 0.050], [-0.058, 0.050]]
      .map(([a, b]) => [TXC[0] + a, TXC[2] + b]), "xz", TXC[1] + 0.002, 0.012));   // foot
    // antenna
    parts.push(tubeAlong([TXC[0] - 0.055, TXC[1] + 0.278, TXC[2]], [TXC[0] - 0.075, TXC[1] + 0.470, TXC[2] - 0.020], 0.010, 6));
    parts.push(makeRing(TXC[0] - 0.075, TXC[1] + 0.470, TXC[2] - 0.020, 0.016, 6, "y"));
    // trim knobs and a small screen on the face
    parts.push(makeBox(TXC[0] + 0.045, TXC[1] + 0.205, TXC[2] + 0.060, 0.055, 0.036, 0.008));
    [-0.030, 0.030].forEach((d) =>
      parts.push(makeRing(TXC[0] + 0.045 + d, TXC[1] + 0.150, TXC[2] + 0.060, 0.013, 8, "z")));

    parts.push(makeBase(GY - 0.005, 1.06));

    const m = merge(parts);
    m.spinners = [];
    m.dynamic = function (time) {
      const segs = [], faces = [], dots = [];
      const P = pen(segs, faces);

      // one steering input drives the car's front wheels AND the wheel on
      // the transmitter — the whole point of showing them together
      const steer = Math.sin(time * 0.55) * 0.42;
      const roll = -time * 2.6;                       // wheels turning

      const wheel = (cx, cz, sd, steerAng) => {
        const cs = Math.cos(steerAng), sn = Math.sin(steerAng);
        // steering rotates the wheel plane about Y through the hub
        const T = (x, y, z) => {
          const lx = x - cx, lz = z - cz;
          return [cx + lx * cs + lz * sn, y, cz + (-lx * sn + lz * cs)];
        };
        const xo = sd * WW / 2;
        const n = 14, out = [], inn = [];
        for (let i = 0; i < n; i++) {
          const a = roll + (i / n) * Math.PI * 2;
          const cy = Math.cos(a) * WR, sz = Math.sin(a) * WR;
          out.push(T(cx + xo, HUB + cy, cz + sz));
          inn.push(T(cx - xo, HUB + cy, cz + sz));
        }
        P.loop(out, 1.15); P.loop(inn, 1.15);
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          P.face([out[i], out[j], inn[j], inn[i]]);
          if (i % 3 === 0) P.line(out[i], inn[i], 0.85);
        }
        // a dished five-spoke rim, so the wheel visibly turns
        const rimC = T(cx + xo * 0.72, HUB, cz);
        const ax = V.sub(T(cx + 1, HUB, cz), T(cx, HUB, cz));
        P.ringUV(rimC, V.norm(V.cross(ax, [0, 0, 1])), V.norm(V.cross(ax, V.cross(ax, [0, 0, 1]))), WR * 0.66, 10, 1.0);
        for (let k = 0; k < 5; k++) {
          const a = roll * 1.0 + (k / 5) * Math.PI * 2;
          P.line(T(cx + xo * 0.72, HUB, cz),
                 T(cx + xo * 0.72, HUB + Math.cos(a) * WR * 0.62, cz + Math.sin(a) * WR * 0.62), 0.9);
        }
      };

      [[AXF, 1, steer], [AXF, -1, steer], [AXR, 1, 0], [AXR, -1, 0]].forEach(([z, sd, st]) => {
        const cx = sd * TRK;
        wheel(cx, z, sd, st);
        // double wishbone: two arms from the chassis rail out to the upright
        const inner = sd * 0.150;
        P.beam([inner, HUB + 0.048, z], [cx - sd * 0.030, HUB + 0.040, z], 0.011, 0.95);
        P.beam([inner, HUB - 0.052, z], [cx - sd * 0.030, HUB - 0.044, z], 0.011, 0.95);
        P.line([cx - sd * 0.030, HUB + 0.040, z], [cx - sd * 0.030, HUB - 0.044, z], 1.0);
        // coil-over, leaning in to the chassis
        P.line([cx - sd * 0.034, HUB + 0.036, z], [inner + sd * 0.018, HUB + 0.150, z * 0.82], 1.05);
      });
      // drive shafts to the rear wheels, and the steering rack to the front
      [-1, 1].forEach((sd) => {
        P.line([0, HUB, AXR], [sd * (TRK - 0.040), HUB, AXR], 0.95);
        const cs = Math.cos(steer), sn = Math.sin(steer);
        const arm = [sd * (TRK - 0.030) + (-0.030) * cs, HUB, AXF + 0.030 * sn];
        P.line([sd * 0.120, HUB + 0.010, AXF - 0.055], arm, 0.95);
      });

      /* ---- the transmitter's steering wheel, turning with the car ---- */
      const WC = [TXC[0] + 0.098, TXC[1] + 0.205, TXC[2] + 0.010];
      const u = [0, Math.cos(steer * 1.6), Math.sin(steer * 1.6)];
      const v2 = [0, -Math.sin(steer * 1.6), Math.cos(steer * 1.6)];
      P.ringUV(WC, u, v2, 0.062, 16, 1.15);                    // rim
      P.ringUV(WC, u, v2, 0.018, 8, 1.0);                      // hub
      for (let k = 0; k < 3; k++) {                            // spokes
        const a = (k / 3) * Math.PI * 2;
        P.line(WC, [WC[0] + u[0] * Math.cos(a) * 0.060 + v2[0] * Math.sin(a) * 0.060,
                    WC[1] + u[1] * Math.cos(a) * 0.060 + v2[1] * Math.sin(a) * 0.060,
                    WC[2] + u[2] * Math.cos(a) * 0.060 + v2[2] * Math.sin(a) * 0.060], 1.0);
      }
      // throttle trigger on the front of the grip, pulled in time with the drive
      const trig = 0.012 + 0.010 * (0.5 + 0.5 * Math.sin(time * 1.1));
      P.box(TXC[0] - 0.030, TXC[1] + 0.098, TXC[2] + 0.075 + trig, 0.022, 0.055, 0.014, 1.0);

      // headlights on, a status LED on the transmitter, brake lights pulsing
      dots.push([-0.140, -0.252, 0.516, 2.2, 1], [0.140, -0.252, 0.516, 2.2, 1]);
      const brake = Math.sin(time * 1.1) < -0.3;
      dots.push([-0.130, -0.238, -0.518, brake ? 2.4 : 1.0, brake ? 1 : 0]);
      dots.push([0.130, -0.238, -0.518, brake ? 2.4 : 1.0, brake ? 1 : 0]);
      const bound = (time * 0.9) % 1 < 0.5;
      dots.push([TXC[0] + 0.045, TXC[1] + 0.205, TXC[2] + 0.066, bound ? 2.0 : 0.9, bound ? 1 : 0]);
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

  // High-power laser tracker — a two-axis instrument mount rather than a
  // hobby servo pan/tilt: a slewing pedestal, a tall yoke on a turntable, and
  // a finned laser head with a beam expander and a co-aligned camera in the
  // cradle. A control box beside it carries the status lamps. A target drone
  // weaves downrange; the camera acquires it, the mount slews onto it, and
  // the beam holds for as long as the lock lasts.
  function buildTurret() {
    const parts = [];
    // pedestal + slew bearing
    parts.push(makeCylinderY(0, -0.66, 0, 0.36, 0.14, 24));
    parts.push(makeRing(0, -0.585, 0, 0.30, 24, "y"));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      parts.push(makeRing(Math.cos(a) * 0.32, -0.588, Math.sin(a) * 0.32, 0.018, 6, "y"));
    }
    parts.push(makeCylinderY(0, -0.55, 0, 0.27, 0.08, 24));
    // control box, cabled to the pedestal
    const CB = [0.74, -0.63, -0.12];
    parts.push(makeBox(CB[0], CB[1], CB[2], 0.30, 0.20, 0.34));
    parts.push(makeBox(CB[0], CB[1] + 0.105, CB[2] - 0.04, 0.20, 0.01, 0.14));        // display recess on top
    [-0.09, -0.03, 0.03].forEach((dx) =>
      parts.push(makeRing(CB[0] + dx, CB[1] + 0.05, CB[2] + 0.171, 0.016, 6, "z")));   // three lamps, front face
    parts.push(makeBox(CB[0] + 0.09, CB[1] + 0.0, CB[2] + 0.171, 0.06, 0.05, 0.012));  // connector
    parts.push({ v: [[CB[0] - 0.15, CB[1] - 0.05, CB[2]], [0.46, -0.68, -0.06], [0.36, -0.68, 0.0]], e: [[0, 1], [1, 2]] });
    parts.push(makeBase(-0.74, 1.02));
    const m = merge(parts);
    m.spinners = [];
    const Ty = 0.14;                               // elevation axis height
    m.dynamic = function (time) {
      const segs = [], dots = [];
      const P = pen(segs);
      // target drone weaving downrange
      const T = [
        Math.sin(time * 0.45) * 0.8,
        Ty + 0.28 + Math.sin(time * 0.7 + 1.3) * 0.36,
        1.32 + Math.sin(time * 0.33) * 0.24,
      ];
      // acquire → lock → hold, looping
      const cyc = (time * 0.13) % 1;
      const acq = cyc < 0.24 ? cyc / 0.24 : 1;
      const acqS = V.ss(acq);
      // aim: pan about Y, tilt about X. While acquiring, the mount is still
      // slewing in from where it was, so it lags the target and catches up.
      const dx = T[0], dy = T[1] - Ty, dz = T[2];
      const dist = Math.hypot(dx, dy, dz) || 1;
      const pan = Math.atan2(dx, dz) + (1 - acqS) * 0.55;
      const tilt = Math.asin(Math.max(-1, Math.min(1, -dy / dist))) + (1 - acqS) * 0.25;
      const cp = Math.cos(pan), sp = Math.sin(pan), ct = Math.cos(tilt), stt = Math.sin(tilt);
      const panT = (x, y, z) => [x * cp + z * sp, y, -x * sp + z * cp];
      const tf = (x, y, z) => { const ry = y - Ty, y1 = Ty + ry * ct - z * stt, z1 = ry * stt + z * ct; return [x * cp + z1 * sp, y1, -x * sp + z1 * cp]; };

      // ---- azimuth stage: turntable, plate, yoke arms, bearings, drive ----
      P.ring(0, -0.50, 0, 0.25, 20, "y", 1.1, panT);
      P.ring(0, -0.50, 0, 0.10, 10, "y", 1.0, panT);
      P.box(0, -0.475, 0, 0.52, 0.045, 0.34, 1.1, panT);
      [-1, 1].forEach((s) => {
        P.box(s * 0.235, -0.16, 0, 0.075, 0.60, 0.15, 1.15, panT);                    // yoke arm
        P.ring(s * 0.235 + s * 0.04, Ty, 0, 0.065, 12, "x", 1.1, panT);               // bearing housing
        P.ring(s * 0.235 + s * 0.04, Ty, 0, 0.03, 8, "x", 1.0, panT);
      });
      P.box(-0.34, Ty, 0.0, 0.11, 0.13, 0.13, 1.1, panT);                              // elevation drive motor
      P.ring(-0.40, Ty, 0, 0.045, 8, "x", 1.0, panT);
      P.line(panT(-0.40, Ty, 0), panT(-0.44, Ty, 0), 1.0);
      P.line(panT(-0.30, Ty - 0.07, 0), panT(-0.24, -0.30, 0.02), 0.9);                // motor cable down the arm

      // ---- elevation payload: cradle, laser head, expander, camera ----
      P.box(0, Ty - 0.10, 0.06, 0.40, 0.04, 0.30, 1.1, tf);                             // cradle plate
      [-1, 1].forEach((s) => P.box(s * 0.185, Ty - 0.02, 0.0, 0.035, 0.16, 0.16, 1.05, tf)); // cheeks to the bearings
      const HR = 0.085;
      const hz = [-0.26, -0.10, 0.10, 0.30, 0.44];
      const ringsH = hz.map((z) => P.ring(0, Ty + 0.02, z, HR, 12, "z", 1.15, tf));
      for (let k = 0; k < 12; k += 2) for (let i = 0; i < hz.length - 1; i++) P.line(ringsH[i][k], ringsH[i + 1][k], 1.05);
      [-0.22, -0.16, -0.10, -0.04, 0.02].forEach((z) => P.ring(0, Ty + 0.02, z, 0.118, 12, "z", 0.95, tf)); // heat-sink fins
      const ex0 = P.ring(0, Ty + 0.02, 0.44, 0.122, 12, "z", 1.15, tf);                 // beam expander
      const ex1 = P.ring(0, Ty + 0.02, 0.57, 0.122, 12, "z", 1.15, tf);
      for (let k = 0; k < 12; k += 3) P.line(ex0[k], ex1[k], 1.05);
      P.ring(0, Ty + 0.02, 0.58, 0.05, 10, "z", 1.1, tf);                               // aperture
      P.ring(0, Ty + 0.02, -0.30, 0.05, 8, "z", 1.05, tf);                              // rear cap + cable exit
      P.line(tf(0, Ty + 0.02, -0.30), tf(0, Ty - 0.06, -0.36), 0.9);
      P.box(0, Ty + 0.175, 0.18, 0.10, 0.09, 0.19, 1.1, tf);                            // co-aligned camera
      P.ring(0, Ty + 0.175, 0.28, 0.032, 10, "z", 1.05, tf);
      [-0.035, 0.035].forEach((x) => P.line(tf(x, Ty + 0.13, 0.12), tf(x, Ty + 0.105, 0.12), 0.95)); // camera rail
      const lensCam = tf(0, Ty + 0.175, 0.285);

      // ---- the target: a small quad silhouette, tumbling gently ----
      const rA = time * 0.8, os = 0.11;
      const ca2 = Math.cos(rA), sa2 = Math.sin(rA), cb2 = Math.cos(rA * 0.5), sb2 = Math.sin(rA * 0.5);
      const op = (lx, ly, lz) => {
        const x1 = lx * ca2 + lz * sa2, z1 = -lx * sa2 + lz * ca2;
        const y2 = ly * cb2 - z1 * sb2, z2 = ly * sb2 + z1 * cb2;
        return [T[0] + x1, T[1] + y2, T[2] + z2];
      };
      P.line(op(-os, 0, -os), op(os, 0, os), 1.0);
      P.line(op(-os, 0, os), op(os, 0, -os), 1.0);
      P.box(0, 0, 0, 0.05, 0.03, 0.07, 0.95, op);
      [[-os, -os], [os, os], [-os, os], [os, -os]].forEach(([x, z]) => {
        const pts = [];
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(op(x + Math.cos(a) * 0.045, 0.01, z + Math.sin(a) * 0.045)); }
        P.loop(pts, 0.9);
      });
      // recognition reticle: corner brackets that close in on the target
      const rs = 0.16 + (1 - acqS) * 0.22, tk = 0.055;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        const bx = T[0] + sx * rs, by = T[1] + sy * rs;
        P.line([bx, by, T[2]], [bx - sx * tk, by, T[2]], 1.0);
        P.line([bx, by, T[2]], [bx, by - sy * tk, T[2]], 1.0);
      });
      // the beam, once locked — plus a little scatter where it lands
      const locked = acqS > 0.98;
      if (locked) {
        const o = tf(0, Ty + 0.02, 0.585);
        P.line(o, T, 1.9);
        dots.push([T[0], T[1], T[2], 3.2, 1]);
        for (let i = 0; i < 3; i++) {
          const a = time * 9 + i * 2.1;
          dots.push([T[0] + Math.cos(a) * 0.06, T[1] + Math.sin(a * 1.3) * 0.05, T[2], 1.3, 1]);
        }
        dots.push([o[0], o[1], o[2], 2.6, 1]);
      }
      // camera lens glows while it is looking
      dots.push([lensCam[0], lensCam[1], lensCam[2], 2.0, 1]);
      // control-box lamps: power steady · track blinks while acquiring, solid locked · fire on with the beam
      const fast = (time * 5) % 1 < 0.5;
      dots.push([CB[0] - 0.09, CB[1] + 0.05, CB[2] + 0.18, 1.8, 1]);
      dots.push([CB[0] - 0.03, CB[1] + 0.05, CB[2] + 0.18, locked || fast ? 2.4 : 1.0, locked || fast ? 1 : 0]);
      dots.push([CB[0] + 0.03, CB[1] + 0.05, CB[2] + 0.18, locked ? 2.6 : 1.0, locked ? 1 : 0]);
      return { segments: segs, dots };
    };
    return m;
  }

  // Morse code kit — a straight telegraph key wired to an ESP32 on the left,
  // and a matching receiver on the right that decodes what it hears. The key
  // works the pattern for "TYLER"; the receiver's lamp and speaker follow it,
  // and each letter lands on the readout as it completes. Then a pause, and
  // it sends again.
  function buildTransmitter() {
    const parts = [];
    const TX = -0.46, RX = 0.46;

    /* ---------------- TRANSMITTER: the key on its plate ---------------- */
    const KEY_Y = -0.02;
    const PIV = [TX - 0.10, KEY_Y + 0.10, 0];
    const bw = 0.25, bd = 0.20, ch = 0.05;
    const baseLoop = (y) => {
      const pts = [
        [TX - bw + ch, y, -bd], [TX + bw - ch, y, -bd], [TX + bw, y, -bd + ch],
        [TX + bw, y, bd - ch], [TX + bw - ch, y, bd], [TX - bw + ch, y, bd],
        [TX - bw, y, bd - ch], [TX - bw, y, -bd + ch],
      ];
      return { v: pts, e: pts.map((_, k) => [k, (k + 1) % pts.length]) };
    };
    parts.push(baseLoop(KEY_Y));
    parts.push(baseLoop(KEY_Y - 0.08));
    baseLoop(KEY_Y).v.forEach((p, k) => parts.push({ v: [p, baseLoop(KEY_Y - 0.08).v[k]], e: [[0, 1]] }));
    [[-0.18, -0.14], [0.18, -0.14], [-0.18, 0.14], [0.18, 0.14]].forEach(([dx, dz]) =>
      parts.push(makeCylinderY(TX + dx, KEY_Y - 0.10, dz, 0.022, 0.035, 6)));
    // pivot yoke + axle
    [-0.05, 0.05].forEach((dz) => {
      parts.push(segBox([TX - 0.10, KEY_Y, dz], [TX - 0.10, PIV[1], dz], 0.018));
      parts.push(makeRing(TX - 0.10, PIV[1], dz, 0.032, 8, "z"));
    });
    parts.push(segBox([TX - 0.10, PIV[1], -0.05], [TX - 0.10, PIV[1], 0.05], 0.012));
    // contact post + anvil
    parts.push(makeCylinderY(TX + 0.13, KEY_Y + 0.03, 0, 0.030, 0.06, 8));
    parts.push(makeRing(TX + 0.13, KEY_Y + 0.06, 0, 0.038, 10, "y"));
    // binding posts at the back
    [-0.10, 0.10].forEach((dz) => {
      parts.push(makeCylinderY(TX - 0.20, KEY_Y + 0.04, dz, 0.022, 0.08, 6));
      parts.push(makeRing(TX - 0.20, KEY_Y + 0.085, dz, 0.034, 8, "y"));
    });
    // ESP32 module on the plate behind the key: board, can, antenna trace
    parts.push(makeBox(TX + 0.02, KEY_Y + 0.02, -0.15, 0.17, 0.014, 0.075));
    parts.push(makeBox(TX + 0.0, KEY_Y + 0.045, -0.15, 0.09, 0.03, 0.045));
    parts.push({ v: [[TX + 0.06, KEY_Y + 0.03, -0.17], [TX + 0.10, KEY_Y + 0.03, -0.17], [TX + 0.10, KEY_Y + 0.03, -0.13], [TX + 0.06, KEY_Y + 0.03, -0.13]], e: [[0, 1], [1, 2], [2, 3]] });
    parts.push({ v: [[TX - 0.20, KEY_Y + 0.085, -0.10], [TX - 0.10, KEY_Y + 0.05, -0.14], [TX - 0.06, KEY_Y + 0.03, -0.15]], e: [[0, 1], [1, 2]] }); // wire post → board

    /* ---------------- RECEIVER: a low enclosure with a front readout ---------------- */
    const RY = -0.13, RW = 0.46, RH = 0.22, RD = 0.36;
    parts.push(makeBox(RX, RY, 0, RW, RH, RD));
    parts.push(makeBox(RX, RY + RH / 2 - 0.01, 0, RW, 0.02, RD));                  // lid seam
    // front face (+Z): readout window with five character cells, lamp beside it
    const FZ = RD / 2 + 0.004;
    parts.push(makeBox(RX - 0.04, RY + 0.02, FZ, 0.26, 0.09, 0.008));
    for (let i = 0; i < 5; i++) {
      const x = RX - 0.04 - 0.10 + i * 0.05;
      parts.push(makeBox(x, RY + 0.02, FZ + 0.004, 0.028, 0.05, 0.004));
    }
    parts.push(makeRing(RX + 0.16, RY + 0.02, FZ, 0.032, 12, "z"));
    parts.push(makeRing(RX + 0.16, RY + 0.02, FZ, 0.018, 8, "z"));
    parts.push(makeBox(RX - 0.14, RY - 0.07, FZ, 0.07, 0.03, 0.008));             // USB
    parts.push(makeRing(RX + 0.16, RY - 0.07, FZ, 0.018, 8, "z"));                // volume knob
    // speaker grille on the lid: rings + radial slots
    const GC = [RX - 0.06, RY + RH / 2 + 0.004, -0.06];
    [0.12, 0.09, 0.06, 0.03].forEach((r, i) => parts.push(makeRing(GC[0], GC[1], GC[2], r, i < 2 ? 16 : 10, "y")));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push({ v: [[GC[0] + Math.cos(a) * 0.03, GC[1], GC[2] + Math.sin(a) * 0.03], [GC[0] + Math.cos(a) * 0.12, GC[1], GC[2] + Math.sin(a) * 0.12]], e: [[0, 1]] });
    }
    // whip antenna at the rear corner, with a loading coil
    const AB = [RX + 0.17, RY + RH / 2, -0.13], AT = [RX + 0.21, RY + 0.55, -0.15];
    parts.push(makeRing(AB[0], AB[1], AB[2], 0.04, 8, "y"));
    parts.push(segBox(AB, AT, 0.014));
    for (let i = 0; i < 4; i++) {
      const f = 0.32 + i * 0.05, y = AB[1] + (AT[1] - AB[1]) * f, x = AB[0] + (AT[0] - AB[0]) * f;
      parts.push(makeRing(x, y, AB[2], 0.03, 8, "y"));
    }
    parts.push(makeRing(AT[0], AT[1], AT[2], 0.024, 8, "y"));
    // vent slots on the far side
    for (let i = 0; i < 4; i++) parts.push(makeBox(RX + RW / 2 + 0.002, RY - 0.02, -0.09 + i * 0.05, 0.006, 0.09, 0.02));
    parts.push(makeBase(-0.5, 0.94));

    // ---- Morse timeline for "TYLER" ----
    const MORSE = { T: "-", Y: "-.--", L: ".-..", E: ".", R: ".-." };
    const DIT = 1, DAH = 3, GAP = 1, LGAP = 3, STOP = 18;
    const seq = [], letterEnd = [];
    let acc = 0;
    "TYLER".split("").forEach((chr, li, arr) => {
      const code = MORSE[chr];
      code.split("").forEach((sym, si) => {
        const u = sym === "-" ? DAH : DIT;
        seq.push([true, u]); acc += u;
        if (si < code.length - 1) { seq.push([false, GAP]); acc += GAP; }
      });
      letterEnd.push(acc);
      const g = li < arr.length - 1 ? LGAP : STOP;
      seq.push([false, g]); acc += g;
    });
    const total = acc, UNIT = 0.12;

    const m = merge(parts);
    m.spinners = [];
    m.dynamic = function (time) {
      const pos = ((time / UNIT) % total + total) % total;
      let p = pos, on = false;
      for (const s of seq) { if (p < s[1]) { on = s[0]; break; } p -= s[1]; }
      const done = letterEnd.filter((e) => e <= pos).length;

      const segs = [], dots = [];
      const P = pen(segs);
      // the lever pivots on the yoke: front end down onto the contact when keyed
      const ang = on ? -0.13 : 0.10;
      const at = (d) => [PIV[0] + d * Math.cos(ang), PIV[1] + d * Math.sin(ang), 0];
      const front = at(0.26), back = at(-0.11);
      [-0.022, 0.022].forEach((dz) => P.line([front[0], front[1], dz], [back[0], back[1], dz], 1.2));
      P.line([front[0], front[1], -0.022], [front[0], front[1], 0.022], 1.2);
      P.line([back[0], back[1], -0.022], [back[0], back[1], 0.022], 1.2);
      // knob on the front end
      const ky = front[1] - 0.03;
      P.ring(front[0], ky, 0, 0.055, 12, "y", 1.1);
      P.ring(front[0], ky - 0.02, 0, 0.04, 10, "y", 1.0);
      P.line([front[0], front[1], 0], [front[0], ky, 0], 1.1);
      // return spring at the back, compressing as the front goes down
      const coils = 5, sTop = back[1], sBot = KEY_Y + 0.02, N = coils * 4;
      for (let i = 0; i < N; i++) {
        const f = i / N, f2 = (i + 1) / N;
        const a = f * coils * Math.PI * 2, a2 = f2 * coils * Math.PI * 2;
        P.line([back[0] + Math.cos(a) * 0.03, sTop + (sBot - sTop) * f, Math.sin(a) * 0.03],
               [back[0] + Math.cos(a2) * 0.03, sTop + (sBot - sTop) * f2, Math.sin(a2) * 0.03], 1.0);
      }
      // the contact closing is the moment worth lighting
      dots.push([TX + 0.13, KEY_Y + 0.075, 0, on ? 3.0 : 1.2, on ? 1 : 0]);
      // receiver: lamp, a ring off the speaker while the tone sounds, and the
      // letters landing on the readout one by one
      dots.push([RX + 0.16, RY + 0.02, FZ + 0.01, on ? 3.2 : 1.2, on ? 1 : 0]);
      if (on) P.ring(GC[0], GC[1] + 0.05, GC[2], 0.16, 14, "y", 1.0);
      for (let i = 0; i < 5; i++) {
        const x = RX - 0.04 - 0.10 + i * 0.05;
        const lit = i < done;
        dots.push([x, RY + 0.02, FZ + 0.012, lit ? 2.2 : 0.8, lit ? 1 : 0]);
      }
      return { segments: segs, dots };
    };
    return m;
  }

  const MODELS = { evtol: buildEvtol, arm: buildArm, drone: buildDrone, rccar: buildRccar, transmitter: buildTransmitter, turret: buildTurret, rocket: buildRocket };
  // Per-model holographic tint (rgb triplets) — cyan family to match the UI.
  const TINTS = {
    evtol: [86, 200, 255],
    arm: [80, 196, 255],
    drone: [110, 214, 255],
    rccar: [104, 212, 255],
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
    let raf = 0, t = 0, angY = type === "arm" ? -0.6 : type === "rccar" ? 0.62 : type === "turret" ? -0.35 : 0.4;
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
      scale = Math.min(w, h) * 0.41;
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
