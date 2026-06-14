/* =================================================================
   hero-canvas.js — generative dot-field behind the hero
   A grid of fine ink dots that breathe on a slow sine flow and bend
   softly toward the cursor (a gentle lens). Pure 2D canvas, no
   images, no libraries. Restrained by design: low opacity, slow.
   Degrades to nothing (transparent) on reduced motion / no canvas.
   ================================================================= */
(function () {
  "use strict";

  const canvas = document.getElementById("field");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // palette (kept in sync with --ink / --accent)
  const INK = "21, 20, 14";
  const ACCENT = "43, 39, 224";

  let w = 0, h = 0, dpr = 1;
  let cols = 0, rows = 0, gap = 0;
  let points = [];
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
  let raf = 0, t = 0;

  function isMobile() { return window.matchMedia("(max-width: 760px)").matches; }

  function build() {
    const rect = canvas.getBoundingClientRect();
    w = rect.width; h = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gap = isMobile() ? 46 : 40;
    cols = Math.ceil(w / gap) + 1;
    rows = Math.ceil(h / gap) + 1;

    points = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // deterministic accent sprinkle (~3%)
        const seed = (x * 73 + y * 31) % 100;
        points.push({ bx: x * gap, by: y * gap, accent: seed < 3, ph: (x + y) * 0.35 });
      }
    }
  }

  function onResize() { build(); }

  function onMove(e) {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    pointer.active = true;
  }
  function onLeave() { pointer.active = false; }

  const R = 150;        // influence radius
  const R2 = R * R;
  const PUSH = 26;      // max displacement toward cursor

  function render() {
    ctx.clearRect(0, 0, w, h);

    // ease pointer
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // slow breathing flow
      const drift = Math.sin(t + p.ph) * 1.6;
      let px = p.bx + drift;
      let py = p.by + Math.cos(t * 0.8 + p.ph) * 1.6;

      // soft lens toward cursor
      let scale = 1;
      if (pointer.active) {
        const dx = px - pointer.x;
        const dy = py - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R);            // 0..1 falloff
          const ff = f * f;                 // ease
          px += (dx / d) * PUSH * ff;
          py += (dy / d) * PUSH * ff;
          scale = 1 + ff * 1.8;             // grow near cursor
        }
      }

      const r = (p.accent ? 1.5 : 1.0) * scale;
      const alpha = (p.accent ? 0.55 : 0.22) * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t + p.ph)));
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.accent ? ACCENT : INK}, ${alpha})`;
      ctx.fill();
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    t += 0.012;
    render();
  }

  /* ---- boot ---- */
  build();

  if (reduce) {
    // single calm static frame
    t = 1.2;
    render();
    return;
  }

  window.addEventListener("resize", onResize);
  if (!isMobile()) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });
  }

  // pause when hero scrolls away
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { if (!raf) raf = requestAnimationFrame(loop); }
      else { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 }).observe(canvas);
  } else {
    raf = requestAnimationFrame(loop);
  }
})();
