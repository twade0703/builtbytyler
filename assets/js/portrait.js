/* The wave through the hero portrait.

   Every 7 s one straight front sweeps across the line drawing — green from
   bottom-left to top-right, then red from top-right back to bottom-left (the
   trading engine's up and down colours). As the front passes, the lines
   ripple: every point near it is pushed sideways by a short sine wave under
   a soft envelope, so the drawing bends like something is flowing through
   it, and the same stretch of each line lights up in the wave's colour.
   Behind the front the lines settle back exactly; nothing lingers.

   Why a script and not CSS: the old version gave every stroke its own dash,
   timed by how far the wave had to travel to reach it. Short or slow strokes
   finished late, so colour sat on the eyes and nose after the wave had gone.
   A single straight front computed per frame cannot do that, and CSS cannot
   move the points of a path at all.

   Cost: it only runs while a wave is crossing (about 1.9 s in every 7), on
   about 38 paths sampled every 5 units. Off otherwise, and off entirely for
   prefers-reduced-motion. */
(function () {
  "use strict";
  const svg = document.querySelector("svg.portrait");
  if (!svg) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const NS = "http://www.w3.org/2000/svg";
  const GREEN = "#2BD98A", RED = "#FF5C5C";
  const FIRST = 4200, EVERY = 7000, CROSS = 1900;   // ms: first wave, interval, time to cross
  const SIGMA = 46, WAVE = 58, AMP = 7;             // envelope width, ripple wavelength, ripple height (user units)
  const U = [Math.SQRT1_2, -Math.SQRT1_2];          // direction of travel: bottom-left to top-right
  const N = [Math.SQRT1_2, Math.SQRT1_2];           // the ripple pushes across that direction

  const group = svg.querySelector("g[mask]");
  const base = [...group.querySelectorAll(":scope > path")];
  if (!base.length) return;

  // the moving colour: a gradient laid along the direction of travel
  const defs = svg.querySelector("defs");
  const grad = document.createElementNS(NS, "linearGradient");
  grad.id = "pt-hot-grad";
  grad.setAttribute("gradientUnits", "userSpaceOnUse");
  const stops = [0, 1, 2, 3].map(() => {
    const st = document.createElementNS(NS, "stop");
    grad.appendChild(st);
    return st;
  });
  defs.appendChild(grad);

  const hotG = document.createElementNS(NS, "g");
  hotG.setAttribute("class", "pt-hot");
  hotG.setAttribute("aria-hidden", "true");
  group.appendChild(hotG);

  let lines = null, qmin = 0, qmax = 1;
  // Sample every stroke once, after it has finished drawing itself in.
  function sample() {
    lines = base.map((p) => {
      const len = p.getTotalLength();
      const n = Math.max(8, Math.ceil(len / 5));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const q = p.getPointAtLength((len * i) / n);
        pts.push([q.x, q.y]);
      }
      const hot = document.createElementNS(NS, "path");
      if (p.getAttribute("class")) hot.setAttribute("class", p.getAttribute("class"));
      hotG.appendChild(hot);
      return { p, d0: p.getAttribute("d"), pts, hot };
    });
    let lo = Infinity, hi = -Infinity;
    lines.forEach((l) => l.pts.forEach(([x, y]) => {
      const q = x * U[0] + y * U[1];
      if (q < lo) lo = q;
      if (q > hi) hi = q;
    }));
    qmin = lo; qmax = hi;
    grad.setAttribute("x1", (U[0] * qmin).toFixed(1));
    grad.setAttribute("y1", (U[1] * qmin).toFixed(1));
    grad.setAttribute("x2", (U[0] * qmax).toFixed(1));
    grad.setAttribute("y2", (U[1] * qmax).toFixed(1));
  }

  // mostly even speed, with a little ease at each end
  const ease = (t) => 0.65 * t + 0.35 * (0.5 - 0.5 * Math.cos(Math.PI * t));

  function frame(front, color) {
    const span = qmax - qmin;
    const at = (q) => Math.min(1, Math.max(0, (q - qmin) / span)).toFixed(4);
    const off = [front - 2.2 * SIGMA, front - 0.35 * SIGMA, front + 0.35 * SIGMA, front + 2.2 * SIGMA];
    const op = [0, 1, 1, 0];
    stops.forEach((st, i) => {
      st.setAttribute("offset", at(off[i]));
      st.setAttribute("stop-color", color);
      st.setAttribute("stop-opacity", op[i]);
    });
    for (const l of lines) {
      let d = "", touched = false;
      for (let i = 0; i < l.pts.length; i++) {
        const [x, y] = l.pts[i];
        const dq = x * U[0] + y * U[1] - front;
        const env = Math.exp(-(dq * dq) / (SIGMA * SIGMA));
        let px = x, py = y;
        if (env > 0.01) {
          const k = AMP * env * Math.sin((dq / WAVE) * Math.PI * 2);
          px += N[0] * k; py += N[1] * k;
          touched = true;
        }
        d += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
      }
      if (touched) {
        l.p.setAttribute("d", d);
        l.hot.setAttribute("d", d);
      } else if (l.p.getAttribute("d") !== l.d0) {
        l.p.setAttribute("d", l.d0);                 // settled: back to the exact curve
        l.hot.removeAttribute("d");
      } else if (l.hot.hasAttribute("d")) {
        l.hot.removeAttribute("d");
      }
    }
  }

  function settle() {
    for (const l of lines) {
      l.p.setAttribute("d", l.d0);
      l.hot.removeAttribute("d");
    }
  }

  let n = 0;
  function wave() {
    const up = n++ % 2 === 0;                       // green up, then red back down
    const color = up ? GREEN : RED;
    const from = up ? qmin - 2.5 * SIGMA : qmax + 2.5 * SIGMA;
    const to = up ? qmax + 2.5 * SIGMA : qmin - 2.5 * SIGMA;
    hotG.style.setProperty("--hot", color);
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / CROSS);
      frame(from + (to - from) * ease(t), color);
      if (t < 1) requestAnimationFrame(step);
      else settle();
    }
    requestAnimationFrame(step);
  }

  setTimeout(() => {
    sample();
    wave();
    setInterval(() => { if (!document.hidden) wave(); }, EVERY);
  }, FIRST);
})();
