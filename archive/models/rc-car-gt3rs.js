/* ============================================================================
   RC CAR — 992 Porsche 911 GT3 RS  ·  hologram model, ARCHIVED
   ----------------------------------------------------------------------------
   Removed from the live site on 2026-09-07. Kept because it is the most
   worked-over model in the set — five rebuilds, and the two things that
   finally made it read as a 911 were both measurements rather than taste:

     · the widest point of the body belongs at 55-60% of body height. It was
       sitting at 26-34%, down at hub level, which is what made it a slab
       with a cone on top.
     · the front track is WIDER than the rear on a 992 GT3 RS, and the rear
       tyre is only 34mm larger in diameter but 60mm wider. Having those
       backwards gave it a hot-rod stance instead of a Porsche one.

   TO PUT IT BACK, in assets/js/hologram.js:
     1. paste the function below in beside the other build* functions
     2. MODELS   -> add  rccar: buildRccar
     3. TINTS    -> add  rccar: [104, 212, 255]
     4. the per-model camera line -> restore  type === "rccar" ? 2.5 :
     5. the data-holo comment at the top of the file -> add |rccar
   and in assets/js/products.js re-add the "rc-car" product entry.

   It depends on helpers that live in hologram.js (merge, makeLoft, plate,
   tubeAlong, surf, P.beam, ...), so it does not run standalone — this file
   is a record, not a module.
   ========================================================================= */

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
    /* Published 992 GT3 RS figures at this model's scale (1.280 units =
       4572mm). Front track really is wider than rear, and the rear tyre is
       only 34mm larger in diameter — it is 60mm WIDER. Getting those two
       backwards is what gave the car a hot-rod stance instead of a 911 one. */
    const MM = 1.280 / 4572;
    const WRF = 700.5 / 2 * MM, WWF = 275 * MM;    // 275/35 ZR20
    const WRR = 734.4 / 2 * MM, WWR = 335 * MM;    // 335/30 ZR21
    const AXF = 2457 / 2 * MM, AXR = -2457 / 2 * MM;
    const TRKF = 1682 / 2 * MM, TRKR = 1614 / 2 * MM;
    const HALFW = 1900 / 2 * MM;                   // 0.266
    const ROOF = GY + 1322 * MM;                   // 1322mm tall on the road

    /* z, floor y, roof y, max half-width, shoulder height as a fraction of
       the body height at that station, upper exponent, lower exponent.
       Low upper exponents give the narrow rounded greenhouse; high ones give
       the wide flat decks fore and aft. */
    /* z, floor, roof, max half-width, shoulder height as a fraction of the
       body height, upper and lower superellipse exponents, and the bonnet
       trough: how far the top centre drops below the fender tops, and over
       what half-width. The trough is applied to the SURFACE — a 911's bonnet
       is a hollow between two raised wings, and drawing it as a flat panel
       laid on top was most of what looked wrong about the front. */
    const CTRL = [
      { z: 0.640, yb: -0.318, yt: -0.286, rx: 0.146, wf: 0.55, nu: 2.6, nd: 2.5, dip: 0.000, dw: 0.10 },
      { z: 0.578, yb: -0.340, yt: -0.258, rx: 0.196, wf: 0.56, nu: 2.8, nd: 2.7, dip: 0.008, dw: 0.13 },
      { z: 0.500, yb: -0.352, yt: -0.232, rx: 0.232, wf: 0.58, nu: 3.0, nd: 2.9, dip: 0.019, dw: 0.15 },
      { z: 0.415, yb: -0.356, yt: -0.216, rx: 0.250, wf: 0.60, nu: 3.1, nd: 3.0, dip: 0.024, dw: 0.16 },
      { z: 0.300, yb: -0.358, yt: -0.206, rx: 0.259, wf: 0.61, nu: 3.1, nd: 3.0, dip: 0.026, dw: 0.16 },
      { z: 0.175, yb: -0.358, yt: -0.198, rx: 0.264, wf: 0.62, nu: 3.0, nd: 3.0, dip: 0.018, dw: 0.15 },
      { z: 0.065, yb: -0.358, yt: -0.142, rx: 0.266, wf: 0.60, nu: 2.4, nd: 3.0, dip: 0.000, dw: 0.12 },
      { z: -0.050, yb: -0.358, yt: -0.070, rx: 0.266, wf: 0.58, nu: 2.05, nd: 3.0, dip: 0.000, dw: 0.10 },
      { z: -0.170, yb: -0.357, yt: -0.070, rx: 0.266, wf: 0.58, nu: 2.05, nd: 3.0, dip: 0.000, dw: 0.10 },
      { z: -0.295, yb: -0.355, yt: -0.096, rx: 0.266, wf: 0.60, nu: 2.2, nd: 3.0, dip: 0.000, dw: 0.10 },
      { z: -0.410, yb: -0.352, yt: -0.138, rx: 0.266, wf: 0.62, nu: 2.6, nd: 3.0, dip: 0.010, dw: 0.15 },
      { z: -0.520, yb: -0.348, yt: -0.178, rx: 0.258, wf: 0.62, nu: 2.9, nd: 3.0, dip: 0.012, dw: 0.15 },
      { z: -0.596, yb: -0.344, yt: -0.210, rx: 0.238, wf: 0.60, nu: 2.9, nd: 2.9, dip: 0.006, dw: 0.13 },
      { z: -0.642, yb: -0.334, yt: -0.250, rx: 0.186, wf: 0.56, nu: 2.7, nd: 2.6, dip: 0.000, dw: 0.10 },
    ];
    const KEYS = ["yb", "yt", "rx", "wf", "nu", "nd", "dip", "dw"];

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
      const x = (c < 0 ? -1 : 1) * s.rx * Math.pow(Math.abs(c), p);
      let y = cy + (up ? 1 : -1) * ry * Math.pow(Math.abs(sn), p);
      // The bonnet / engine-lid trough: pull the upper surface down toward the
      // centreline, fading to nothing by the fender tops, so the raised wings
      // either side are part of the body rather than drawn on it.
      if (up && s.dip > 0) {
        const t = Math.min(1, Math.abs(x) / s.dw);
        y -= s.dip * (1 - t * t);
      }
      return [x, y, s.z];
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

    // the crease along the top of each raised front wing, either side of
    // the trough that is now part of the surface itself
    [-1, 1].forEach((sd) => {
      const T = (d) => (sd > 0 ? d : 180 - d) * RAD;
      parts.push(line([[0.520, T(52)], [0.430, T(50)], [0.320, T(48)], [0.200, T(50)]]));
    });

    /* ---- THE DOOR. It was missing entirely, and a car with no shut line
           reads as a solid lump however good the surface is. A 911's front
           shut runs up behind the arch and slants back as it rises; the rear
           shut drops at the B-pillar. Handle on the belt. ---- */
    [-1, 1].forEach((sd) => {
      const T = (d) => (sd > 0 ? d : 180 - d) * RAD;
      parts.push(line([
        [0.208, T(-44)], [0.198, T(-20)], [0.176, T(2)], [0.150, T(19)],
        [0.060, T(20)], [-0.060, T(20)], [-0.168, T(19)],
        [-0.150, T(2)], [-0.142, T(-20)], [-0.138, T(-44)],
        [-0.020, T(-46)], [0.100, T(-46)],
      ], true));
      // handle, and the sill line under the door
      parts.push(line([[-0.070, T(10)], [-0.020, T(10)]]));
      parts.push(line([[0.200, T(-50)], [0.060, T(-52)], [-0.060, T(-52)], [-0.140, T(-50)]]));
      // mirror on its stalk, at the base of the A-pillar
      const mb = surf(0.150, T(26));
      parts.push(segBox(mb, [mb[0] * 1.16, mb[1] + 0.026, mb[2] + 0.010], 0.010));
      parts.push(makeBox(mb[0] * 1.20, mb[1] + 0.034, mb[2] + 0.012, 0.030, 0.024, 0.052));
    });

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
    [[AXF, TRKF + 0.030, WRF + 0.048], [AXR, TRKR + 0.038, WRR + 0.050]].forEach(function (a) {
      [-1, 1].forEach((sd) => parts.push(makeRing(sd * a[1], -0.334, a[0], a[2], 16, "x")));
    });

    /* ---- THE WING, on real numbers. Span matches the body width rather
           than exceeding it, main chord 250mm and the upper flap 120mm — the
           old one was 0.110 chord against a real 0.070, which is why it
           looked like a picnic table. Thin sections, slim swan necks, and
           endplates that are plates rather than slabs. ---- */
    const WGY = ROOF + 0.030, WGZ = -0.560;
    const WCH = 250 * MM, WFL = 120 * MM;
    parts.push(plate([[-HALFW * 0.985, WGZ + WCH / 2], [HALFW * 0.985, WGZ + WCH / 2],
                      [HALFW * 0.985, WGZ - WCH / 2], [-HALFW * 0.985, WGZ - WCH / 2]],
                     "xz", WGY, 0.009));
    parts.push(plate([[-HALFW * 0.96, WGZ - WCH / 2 - 0.010], [HALFW * 0.96, WGZ - WCH / 2 - 0.010],
                      [HALFW * 0.96, WGZ - WCH / 2 - 0.010 - WFL], [-HALFW * 0.96, WGZ - WCH / 2 - 0.010 - WFL]],
                     "xz", WGY - 0.024, 0.007));
    [-1, 1].forEach((sd) => {
      const foot = surf(-0.462, (sd > 0 ? 60 : 120) * RAD);
      const knee = [sd * 0.132, WGY - 0.072, WGZ + 0.062];
      const top = [sd * 0.132, WGY + 0.006, WGZ + 0.018];
      parts.push(segBox(foot, knee, 0.012));
      parts.push(segBox(knee, top, 0.010));
    });
    [-1, 1].forEach((sd) => parts.push(plate(
      [[WGY + 0.040, WGZ + WCH / 2 + 0.022], [WGY + 0.040, WGZ - WCH / 2 - WFL - 0.026],
       [WGY - 0.062, WGZ - WCH / 2 - WFL - 0.026], [WGY - 0.062, WGZ + WCH / 2 - 0.010]],
      "yz", sd * HALFW * 0.99, 0.007)));

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
