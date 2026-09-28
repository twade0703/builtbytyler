/* The trace through the hero portrait.

   Every 7 s a glowing pulse runs along every line of the drawing, green
   sweeping from bottom-left to top-right, then red coming back from the
   top-right. Each line is traced end to end on a slow-fast-slow curve: it
   eases off its start, rushes through the middle and settles into its end.

   What keeps it from looking mechanical: every line takes about the same
   time, but none moves quite like another. Each gets its own duration and
   its own easing, drawn from a family of in-out curves of different
   steepness and a little bias toward the start or the end, so some lines
   snap and some glide. The starts sweep across the face in the direction of
   the wave, and each line is traced from the end the wave reaches first, so
   the whole thing still reads as one pass.

   Cost: about 38 dash offsets per frame, only while a pass is running
   (about 2.8 s in every 7). Off for prefers-reduced-motion. */
(function () {
  "use strict";
  const svg = document.querySelector("svg.portrait");
  if (!svg) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const NS = "http://www.w3.org/2000/svg";
  const GREEN = "#2BD98A", RED = "#FF5C5C";
  const FIRST = 4200, EVERY = 7000;     // ms: first pass (after the draw-in), then every 7 s
  const SWEEP = 900;                    // ms: first line's start to the last line's start
  const DASH = 0.24;                    // the pulse, as a fraction of its line

  const group = svg.querySelector("g[mask]");
  const base = [...group.querySelectorAll(":scope > path")];
  if (!base.length) return;
  const hotG = document.createElementNS(NS, "g");
  hotG.setAttribute("class", "pt-hot");
  hotG.setAttribute("aria-hidden", "true");
  group.appendChild(hotG);

  // A family of slow-fast-slow curves. k sets how hard it pushes through the
  // middle; b biases the rush toward the start (b < 1) or the end (b > 1).
  const inOut = (k, b) => (t) => {
    const u = Math.pow(t, b);
    return u < 0.5 ? Math.pow(2 * u, k) / 2 : 1 - Math.pow(2 - 2 * u, k) / 2;
  };
  // deterministic per-line variety, so every visit looks the same
  const rand = (i, salt) => {
    const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  let lines = null;
  function setup() {
    const q = (p) => p.x - p.y;                           // along the wave: bottom-left low, top-right high
    let lo = Infinity, hi = -Infinity;
    lines = base.map((p, i) => {
      const len = p.getTotalLength();
      const a = p.getPointAtLength(0), b = p.getPointAtLength(len);
      const qa = q(a), qb = q(b);
      lo = Math.min(lo, qa, qb); hi = Math.max(hi, qa, qb);
      const hot = document.createElementNS(NS, "path");
      hot.setAttribute("d", p.getAttribute("d"));
      hot.setAttribute("pathLength", "1");
      if (p.getAttribute("class")) hot.setAttribute("class", p.getAttribute("class"));
      hot.style.strokeDasharray = DASH + " 2";
      hot.style.strokeDashoffset = DASH;                  // parked before the start: invisible
      hotG.appendChild(hot);
      return {
        hot, qa, qb,
        dur: 1150 + rand(i, 1) * 650,                     // 1.15 - 1.8 s
        ease: inOut(2 + rand(i, 2) * 3, 0.8 + rand(i, 3) * 0.45),
      };
    });
    lines.forEach((l) => {
      l.q0 = (Math.min(l.qa, l.qb) - lo) / (hi - lo);     // where the wave reaches it, 0..1
      l.q1 = (Math.max(l.qa, l.qb) - lo) / (hi - lo);
    });
  }

  let n = 0;
  function pass() {
    const up = n++ % 2 === 0;                             // green up, then red back
    hotG.style.setProperty("--hot", up ? GREEN : RED);
    hotG.style.color = up ? GREEN : RED;
    lines.forEach((l) => {
      // the end the wave reaches first is where this line's trace starts
      l.forward = up ? l.qa <= l.qb : l.qa > l.qb;
      l.delay = SWEEP * (up ? l.q0 : 1 - l.q1);
    });
    const total = SWEEP + Math.max(...lines.map((l) => l.dur)) + 50;
    const t0 = performance.now();
    function step(now) {
      const el = now - t0;
      for (const l of lines) {
        const t = (el - l.delay) / l.dur;
        let off;
        if (t <= 0) off = l.forward ? DASH : -1;           // parked at its start
        else if (t >= 1) off = l.forward ? -1 : DASH;      // run off its end
        else {
          const e = l.ease(t);
          off = l.forward ? DASH - e * (1 + DASH) : -1 + e * (1 + DASH);
        }
        l.hot.style.strokeDashoffset = off;
      }
      if (el < total) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  setTimeout(() => {
    setup();
    pass();
    setInterval(() => { if (!document.hidden) pass(); }, EVERY);
  }, FIRST);
})();
