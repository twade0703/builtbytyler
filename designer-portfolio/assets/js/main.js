/* =================================================================
   main.js — interaction layer (Quiet Index)
   Lenis smooth scroll · GSAP line/word/fade reveals · contextual
   "View" cursor · magnetic links · hover text-scramble · live
   Lisbon clock · count-ups · curtain preloader · auto-hiding nav.
   Restrained motion; full reduced-motion + no-GSAP fallbacks.
   ================================================================= */
(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = typeof window.gsap !== "undefined";

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const inHero = (el) => !!el.closest("#hero");

  /* ---------- fallbacks ---------- */
  function showAll() {
    $$(".fade").forEach((el) => { el.style.opacity = 1; el.style.transform = "none"; });
    $$("[data-line] , [data-word]").forEach((el) => { el.style.transform = "none"; });
    $$("[data-count]").forEach((el) => { el.textContent = el.getAttribute("data-count"); });
  }
  function killPreloader(instant) {
    const pre = $("#preloader");
    if (!pre) return;
    if (instant) { pre.style.display = "none"; return; }
    pre.style.transition = "transform .8s cubic-bezier(0.76,0,0.24,1)";
    pre.style.transform = "translateY(-100%)";
    setTimeout(() => (pre.style.display = "none"), 850);
  }

  initClock();        // independent of GSAP

  if (!hasGSAP) {
    showAll();
    killPreloader(true);
    initCursor();
    return;
  }

  const { gsap } = window;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  const ST = window.ScrollTrigger;

  /* ---------- initial hidden states (pre-paint) ---------- */
  if (!reduce) {
    gsap.set("[data-line], [data-word]", { yPercent: 115 });
    gsap.set(".fade", { opacity: 0, y: 18 });
  }

  /* =============================== Lenis =============================== */
  let lenis = null;
  function initLenis() {
    if (reduce || typeof window.Lenis === "undefined") return;
    lenis = new window.Lenis({ lerp: 0.095, smoothWheel: true, wheelMultiplier: 1 });
    if (ST) lenis.on("scroll", ST.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ============================ Preloader ============================= */
  function runPreloader() {
    const pre = $("#preloader");
    const num = $("#pre-num");
    const lineFill = $("#pre-line");

    if (reduce || !pre) { showAll(); killPreloader(true); heroIntro(true); return; }

    // count 00 → 100
    const c = { v: 0 };
    gsap.to(c, {
      v: 100, duration: 1.7, ease: "power2.inOut",
      onUpdate: () => { if (num) { const n = Math.round(c.v); num.textContent = n < 10 ? "0" + n : "" + n; } },
    });

    // grow the underline fill alongside the count
    if (lineFill) {
      const bar = document.createElement("i");
      bar.style.cssText = "position:absolute;inset:0;transform-origin:left;transform:scaleX(0);background:var(--ink);";
      lineFill.appendChild(bar);
      gsap.to(bar, { scaleX: 1, duration: 1.7, ease: "power2.inOut" });
    }

    // curtain up, then hero intro
    gsap.timeline({ delay: 1.85 })
      .to(".preloader__top", { yPercent: -40, opacity: 0, duration: 0.6, ease: "power3.in" })
      .to(pre, {
        yPercent: -100, duration: 0.95, ease: "expo.inOut",
        onComplete: () => { pre.style.display = "none"; },
      }, "-=0.15")
      .add(() => heroIntro(false), "-=0.55");

    setTimeout(() => { if (pre && pre.style.display !== "none") { killPreloader(false); heroIntro(false); } }, 5500);
  }

  function heroIntro(instant) {
    const lines = $$("#hero [data-line]");
    const fades = $$("#hero [data-fade]");
    if (instant || reduce) { gsap.set(lines, { yPercent: 0 }); gsap.set(fades, { opacity: 1, y: 0 }); return; }
    gsap.timeline()
      .to(lines, { yPercent: 0, duration: 1.15, ease: "expo.out", stagger: 0.1 })
      .to(fades, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out", stagger: 0.12 }, "-=0.75");
  }

  /* ============================ Reveals ============================== */
  function initReveals() {
    if (reduce || !ST) { showAll(); return; }

    $$("[data-line]").filter((el) => !inHero(el)).forEach((el) => {
      gsap.to(el, { yPercent: 0, duration: 1.05, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%" } });
    });

    const words = $$("[data-word]").filter((el) => !inHero(el));
    if (words.length) {
      gsap.to(words, { yPercent: 0, duration: 0.85, ease: "expo.out", stagger: 0.04,
        scrollTrigger: { trigger: words[0].closest("section"), start: "top 72%" } });
    }

    $$(".fade").filter((el) => !inHero(el)).forEach((el) => {
      gsap.to(el, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%" } });
    });

    $$("[data-count]").forEach((el) => {
      const target = parseFloat(el.getAttribute("data-count")) || 0;
      const o = { v: 0 };
      gsap.to(o, { v: target, duration: 1.5, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%" },
        onUpdate: () => (el.textContent = Math.round(o.v)) });
    });
  }

  /* ============================== Nav =============================== */
  function initNav() {
    const nav = $("#nav");
    if (nav) {
      let last = 0;
      const onScroll = (y) => {
        if (y > last && y > 260) nav.classList.add("is-hidden");
        else nav.classList.remove("is-hidden");
        last = y;
      };
      if (lenis) lenis.on("scroll", (e) => onScroll(e.scroll));
      else window.addEventListener("scroll", () => onScroll(window.scrollY), { passive: true });
    }
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id.length < 2) return;
        const t = $(id);
        if (!t) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(t, { duration: 1.2 });
        else t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      });
    });
  }

  /* ===================== Contextual cursor ========================== */
  function initCursor() {
    if (!fine) return;
    const dot = $(".cursor-dot");
    const ring = $(".cursor-ring");
    const label = $(".cursor-ring__label");
    if (!dot || !ring) return;

    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener("pointermove", (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    }, { passive: true });

    (function loop() {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();

    $$("[data-cursor], a, button").forEach((el) => {
      const type = el.getAttribute("data-cursor");
      el.addEventListener("pointerenter", () => {
        if (type === "view") { ring.classList.add("is-view"); if (label) label.textContent = el.getAttribute("data-label") || "View"; }
        else ring.classList.add("is-link");
      });
      el.addEventListener("pointerleave", () => ring.classList.remove("is-view", "is-link"));
    });
  }

  /* ========================== Magnetic ============================== */
  function initMagnetic() {
    if (!fine || reduce) return;
    $$(".nav__brand, .nav__links a, .hero__scroll, .footer__col a").forEach((el) => {
      const s = 0.3;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        gsap.to(el, { x: (e.clientX - (r.left + r.width / 2)) * s, y: (e.clientY - (r.top + r.height / 2)) * s, duration: 0.5, ease: "power3.out" });
      });
      el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "power3.out" }));
    });
  }

  /* ====================== Hover text-scramble ======================= */
  function initScramble() {
    if (reduce) return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*";
    $$(".nav__links .lnk").forEach((el) => {
      const final = el.textContent;
      let frame, running = false;
      el.closest("a").addEventListener("pointerenter", () => {
        if (running) return; running = true;
        let i = 0; const total = final.length;
        const step = () => {
          el.textContent = final.split("").map((ch, idx) => {
            if (idx < i) return final[idx];
            if (ch === " ") return " ";
            return chars[Math.floor(Math.random() * chars.length)];
          }).join("");
          i += 0.5;
          if (i <= total) frame = requestAnimationFrame(step);
          else { el.textContent = final; running = false; }
        };
        cancelAnimationFrame(frame); step();
      });
    });
  }

  /* ========================== Lisbon clock ========================== */
  function initClock() {
    const el = document.getElementById("clock");
    if (!el) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => { try { el.textContent = fmt.format(new Date()) + " LIS"; } catch (e) { el.textContent = ""; } };
    tick(); setInterval(tick, 1000);
  }

  /* ============================= Boot =============================== */
  function boot() {
    initLenis();
    initNav();
    initCursor();
    initMagnetic();
    initScramble();
    initReveals();
    runPreloader();
    if (ST) addEventListener("load", () => ST.refresh());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
