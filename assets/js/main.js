/* =================================================================
   main.js — behavior layer
   · renders the build plates (home + builds) and the build detail page
   · upgrades the software tiers to live Stripe checkout
   · mobile nav toggle
   · scroll-in reveal animations
   Runs after components.js has injected the shared chrome.
   ================================================================= */

(function () {
  "use strict";

  /* Tell motion.css that a script is present and will drive the fallback
     reveals. Set here — at the top of the file, not inside init() — so it
     lands before first paint and there is no flash of visible content. The
     CSP forbids inline scripts, so this is the earliest hook available.
     See the .js-reveal note in motion.css. */
  document.documentElement.classList.add("js-reveal");


  /* ---------------- Build plates ----------------
     A build is presented as a museum plate: the hologram in a framed
     panel, and the caption on a hairline underneath — index number,
     name, one line of what it is, and its status set in mono on the
     right. Not a bordered card with a button in it.

     Sizes vary across the grid (`span`), because six identical tiles is
     the pattern this rebuild exists to remove. The caller decides. */
  const RETICLE = `
    <svg class="reticle" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="0.6"/>
      <circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="0.6"/>
      <path d="M50 4 V28 M50 72 V96 M4 50 H28 M72 50 H96" stroke="currentColor" stroke-width="0.6"/>
    </svg>`;

  const TICKS = `<span class="tick tick--tl"></span><span class="tick tick--br"></span>`;

  /* A product reel: no src until it comes near the screen (initReel). */
  const reelVideo = (p) =>
    `<video muted loop playsinline preload="none" poster="${p.poster || ""}" data-src="${p.reel}"${p.reelLarge ? ` data-full="${p.reelLarge}"` : ""} aria-label="${p.name}: product reel"></video>
     <span class="plate__open">Watch it large</span>`;

  function plateHTML(p, index, span, withSpecs) {
    const idx = String((index || 0) + 1).padStart(2, "0");
    const href = `product.html?id=${p.id}`;
    const status = p.status || "In progress";
    const media = p.holo
      ? `<canvas class="plate__holo" data-holo="${p.holo}"></canvas>
         <span class="plate__hud">3D <em>·</em> Wireframe</span>`
      : RETICLE;
    // a build with a reel plays it in the frame; a click opens it large.
    // A build with only a still (`image`) shows it in the same black frame.
    const frame = p.reel
      ? `<button class="plate__media is-reel" type="button" data-reel aria-label="Watch the ${p.name} reel large">
          ${TICKS}${reelVideo(p)}
        </button>`
      : p.image
      ? `<a class="plate__media is-image" href="${href}" aria-label="${p.name}">
          ${TICKS}<img src="${p.image}" alt="${p.imageAlt || p.name}" loading="lazy" decoding="async">
        </a>`
      : `<a class="plate__media ${p.holo ? "is-holo" : "is-placeholder"}" href="${href}" aria-label="${p.name}">
          ${TICKS}${media}
        </a>`;
    return `
      <article class="plate ${span || ""}" data-reveal data-reveal-i="${((index || 0) % 6) + 1}">
        ${frame}
        <div class="plate__cap">
          <span class="plate__n">${idx}</span>
          <h3 class="plate__name"><a href="${href}">${p.name}</a></h3>
          <span class="plate__price">${status}</span>
          <p class="plate__tag">${p.tagline}</p>
        </div>
        ${withSpecs && p.keys ? `<ul class="plate__keys">${p.keys.map((k) => `<li>${k}</li>`).join("")}<li><a href="${href}">Full specs &rarr;</a></li></ul>` : ""}
      </article>`;
  }

  /* The composition, expressed as spans. The first build gets four of the
     six columns and a wider frame; the rest fall into halves and thirds.
     A grid that reads left to right at different weights is the whole
     difference between "a portfolio" and "a row of tiles". */
  const SPANS = ["plate--lead", "plate--half", "", "", "", "plate--half", "plate--half"];

  function renderGrid(targetId, list) {
    const grid = document.getElementById(targetId);
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = `<p class="plate-empty">No builds listed yet — check back soon.</p>`;
      return;
    }
    const custom = (grid.getAttribute("data-spans") || "").split(",").map((v) => v.trim());
    const specs = grid.hasAttribute("data-keys");              // the Hardware page shows three facts; the full specs live on the build's page
    grid.innerHTML = list
      .map((p, i) => plateHTML(p, i, custom[i] !== undefined && custom[i] !== "" ? (custom[i] === "-" ? "" : custom[i]) : SPANS[i] || "", specs))
      .join("");
  }

  /* ---------------- Product detail (product.html) ---------------- */
  function renderDetail() {
    const host = document.getElementById("product-detail");
    if (!host) return;
    const id = new URLSearchParams(window.location.search).get("id");

    /* No id at all is the bare /product URL, which is in the sitemap and
       ships real static content in the HTML. Leaving it alone is the whole
       point — overwriting it with "not found" is what made that URL an
       empty page in the index. Only a BAD id is an error. */
    if (!id) return;

    const p = window.getProductById(id);
    if (!p) {
      host.innerHTML = `
        <div class="empty-state">
          <h1>No such build</h1>
          <p>That link doesn't match anything here. It may have been renamed.</p>
          <a class="btn" href="shop.html">See the hardware</a>
        </div>`;
      return;
    }

    document.title = `${p.name} · BuiltByTyler`;

    const specs = (p.specs || [])
      .map((s) => `<dt>${s.label}</dt><dd>${s.value}</dd>`)
      .join("");

    // `actions` replaces the default button (the kit's is the waitlist)
    const buyBtn = p.actions
      ? p.actions.map((a, i) => `<a class="btn${i ? " btn--ghost" : ""}" href="${a.href}">${a.label}</a>`).join("")
      : `<a class="btn" href="contact.html">Ask about this build</a>`;

    const media = p.holo
      ? `<canvas class="plate__holo" data-holo="${p.holo}"></canvas>
         <span class="plate__hud">3D <em>·</em> Wireframe</span>`
      : RETICLE;

    host.innerHTML = `
      <a class="back-link" href="shop.html">&larr; All hardware</a>
      <div class="detail" data-reveal>
        ${p.reel
          ? `<button class="detail__media is-reel" type="button" data-reel aria-label="Watch the ${p.name} reel large">${reelVideo(p)}</button>`
          : p.image
          ? `<div class="detail__media is-image"><img src="${p.image}" alt="${p.imageAlt || p.name}" decoding="async"></div>`
          : `<div class="detail__media ${p.holo ? "is-holo" : "is-placeholder"}">${media}</div>`}
        <div class="detail__info">
          <p class="badge">${p.status || "In progress"}</p>
          <h1>${p.name}</h1>
          <p class="detail__tag">${p.tagline}</p>
                    <div class="detail__desc"><p>${p.description}</p></div>
          <div class="detail__actions">${buyBtn}</div>
          <span class="notice">On the bench &mdash; not for sale yet.</span>
          ${
            specs
              ? `<div class="specs"><dl>${specs}</dl></div>`
              : ""
          }
          <p class="detail__included">${p.included || "Kept with its <b>STL · STEP · program files</b> and build notes."}</p>
        </div>
      </div>`;
  }

  /* ---------------- Mobile nav ---------------- */
  function initMobileNav() {
    const toggle = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    if (!toggle || !links) return;

    /* The menu is a drop-down, so it never freezes the page behind it. It used
       to lock scrolling while open, with nothing but the bars to undo it: a tap
       on the page did nothing, and one stray extra tap on the bars left the
       page frozen. On a phone that reads as "it glitched and won't scroll".
       Now anything that means "I'm done with the menu" closes it: a tap
       anywhere else, a scroll, Escape, leaving or coming back to the page. */
    const isOpen = () => links.classList.contains("is-open");
    let openedAt = 0;
    const setOpen = (open) => {
      links.classList.toggle("is-open", open);
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.documentElement.classList.remove("nav-open");   // never lock the page
      if (open) openedAt = window.scrollY;
    };

    toggle.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!isOpen()); });
    links.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    // a tap anywhere outside the menu closes it
    document.addEventListener("click", (e) => {
      if (isOpen() && !links.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    // scrolling the page closes it
    window.addEventListener("scroll", () => {
      if (isOpen() && Math.abs(window.scrollY - openedAt) > 12) setOpen(false);
    }, { passive: true });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    // a page restored from the back/forward cache, or left, starts closed
    window.addEventListener("pageshow", () => setOpen(false));
    window.addEventListener("pagehide", () => setOpen(false));
    window.matchMedia("(min-width: 721px)").addEventListener("change", (m) => { if (m.matches) setOpen(false); });
  }

  /* ---------------- Scroll progress HUD ----------------
     The hairline progress bar and the percentage readout in the corner.
     They used to be driven from inside the WebGL loop; now that the 3D
     layer is off, they run from a plain scroll listener. */
  function initHud() {
    const bar = document.getElementById("hud-bar");
    const pct = document.getElementById("hud-pct");
    if (!bar && !pct) return;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const t = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar) bar.style.transform = `scaleX(${t.toFixed(4)})`;
      if (pct) pct.textContent = String(Math.round(t * 100)).padStart(3, "0");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("load", update);
  }

  /* ---------------- Scroll-aware nav ----------------
     Clear bar at the very top, frosted the moment the page moves.

     It used to hold the transparent state until the first content section
     reached the top, which on a page with a 100vh hero meant a thousand
     pixels of display-size headline sliding under an unlit bar. At this
     type size that is not a subtle overlap — the words collide with the
     brand mark. A short threshold keeps the clean first impression and
     protects every scroll position after it. */
  const NAV_FIRM_AT = 24;

  function initNavScroll() {
    const nav = document.getElementById("site-nav");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > NAV_FIRM_AT);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("load", onScroll);
  }

  /* ---------------- Software plan handoff (contact.html?plan=…) ----------------
     The pricing tiers on software.html link here with the tier they came
     from. Carrying it across means the visitor does not have to re-explain
     what they just clicked, and the enquiry arrives already labelled. */
  function initPlanHandoff() {
    const notice = document.getElementById("plan-notice");
    if (!notice) return;
    const key = (new URLSearchParams(window.location.search).get("plan") || "").toLowerCase();
    const plan = window.getPlanById && window.getPlanById(key);
    if (!plan) return;

    notice.hidden = false;
    notice.innerHTML =
      `You came from the <b>${plan.name}</b> plan. ` +
      `Mention anything you want changed.`;

    /* Point the software route at the tier they came from, so the email
       arrives already labelled and they do not have to re-explain the
       click. The build route is left alone — it is a different job. */
    const route = document.getElementById("route-software");
    if (route) {
      const subject = `${plan.name} plan enquiry — BuiltByTyler`;
      route.href = `mailto:twade@builtbytyler.com?subject=${encodeURIComponent(subject)}`;
      route.classList.add("is-picked");
      const meta = document.getElementById("route-software-meta");
      if (meta) meta.textContent = `${plan.name} plan`;
      const go = document.getElementById("route-software-go");
      if (go) go.textContent = `Enquire about ${plan.name} →`;
    }
  }

  /* ---------------- Stripe return page (order-confirmed.html) ----------------
     Stripe redirects here after payment. Software is the only thing that
     can currently be paid for, so it is both the default in the HTML and
     the assumption here: a payer who arrives without a parameter is a
     software client, and telling them their drone is being built would be
     flatly untrue. Hardware copy is kept, hidden, for when builds open —
     it needs an explicit ?type=hardware to appear. */
  function initConfirmation() {
    const blocks = document.querySelectorAll("[data-confirm]");
    if (!blocks.length) return;
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const want = type === "hardware" || type === "kit" || type === "frontdesk" ? type : "software";
    blocks.forEach((b) => { b.hidden = b.getAttribute("data-confirm") !== want; });
  }

  /* ---------------- Software plans → Stripe (software.html#pricing) ----------
     The tier prices are printed in the HTML so they survive without
     JavaScript and search engines can read them. This only upgrades the
     BUTTONS: a tier whose plan carries a real Stripe Payment Link becomes
     a direct checkout, which is what lets a referred client pay up front
     without a call. A tier without a link keeps its enquiry href, so a
     missing link degrades to the old behaviour instead of dead-ending.

     Payment goes to Stripe's own hosted page. No card details are ever
     entered on, stored on, or transmitted through this site. */
  function initSoftwarePlans() {
    const ctas = document.querySelectorAll("[data-plan-cta]");
    if (!ctas.length || !window.getPlanById) return;

    let anyLive = false;

    ctas.forEach((cta) => {
      const plan = window.getPlanById(cta.getAttribute("data-plan-cta"));
      if (!plan) return;

      verifyPlanPrice(plan);

      // A consultation tier never becomes a checkout, link or no link.
      if (plan.consultOnly || !window.isPlanBuyable(plan)) return;
      anyLive = true;

      const url = new URL(plan.paymentLink);
      // Ties the Stripe payment back to a tier without needing a webhook.
      url.searchParams.set("client_reference_id", plan.id);

      cta.href = url.toString();
      cta.removeAttribute("target");
      // Swap the destination, leave the wording alone. The button already
      // says what it does; bolting "pay now" onto it read like a hard sell.
      // The padlock and the note under the tiers carry the payment signal.
      cta.setAttribute(
        "aria-label",
        `${plan.name} plan — continue to secure checkout with Stripe`
      );
      cta.classList.add("is-checkout");
    });

    // Say plainly that paying here is real, but only once something can
    // actually be paid for. Promising secure checkout on a page where
    // every button is a mailto would be a lie.
    if (anyLive) {
      const note = document.getElementById("pricing-note");
      if (note) {
        const line = document.createElement("span");
        line.className = "pricing-note__secure";
        line.innerHTML =
          " Card payments are handled by <b>Stripe</b> on their own secure " +
          "checkout page — card details never touch this site.";
        note.appendChild(line);
      }
    }
  }

  /* The price a visitor reads is the HTML; the price that reaches the
     enquiry and the Stripe link is the data. They have to agree, and
     nothing structural stops them drifting when one is edited alone —
     so check on load and complain loudly in the console if they have. */
  function verifyPlanPrice(plan) {
    const tier = document.querySelector(`.tier[data-plan="${plan.id}"]`);
    const el = tier && tier.querySelector(".tier__price");
    if (!el) return;
    const shown = el.textContent.replace(/[\s,]/g, "");
    const setupOk = plan.setup == null || shown.includes("$" + plan.setup);
    const monthlyOk = plan.monthly == null || shown.includes("$" + plan.monthly);
    if (!setupOk || !monthlyOk) {
      console.warn(
        `[BuiltByTyler] Pricing drift on the "${plan.name}" tier. ` +
          `software.html shows "${el.textContent.trim()}" but SOFTWARE_PLANS in ` +
          `products.js says ${window.formatPlanPrice(plan)}. ` +
          `Fix products.js and the tier markup together.`
      );
    }
  }

  /* ---------------- Motion engine (see assets/css/motion.css) ----------------
     Reveals are native CSS scroll timelines and need no JavaScript at all.
     This function exists only for the two things CSS cannot do on its own:

       1. split a [data-split] headline into per-word spans, and
       2. stand in with an IntersectionObserver on browsers that do not
          support animation-timeline: view() (Safari and Firefox at the
          time of writing).

     If both fail, motion.css still leaves every element visible — the
     content is never gated behind a script. */

  const SUPPORTS_TIMELINE =
    typeof CSS !== "undefined" &&
    CSS.supports &&
    CSS.supports("animation-timeline", "view()");

  /* Split headlines into words so each one can rise on its own.
     Text nodes only — any <em> or <br> inside the headline is preserved. */
  const PUNCT_ONLY = /^[.,;:!?…)\]}"'’”—–]+$/;

  function splitHeadlines() {
    let i = 0;
    document.querySelectorAll("[data-split]").forEach((host) => {
      if (host.dataset.splitDone) return;
      host.dataset.splitDone = "1";
      // Each word becomes its own inline-block, which creates a line-break
      // opportunity where there was none. Trailing punctuation therefore has
      // to be folded back into the word it belongs to, or a full stop ends
      // up alone on its own line.
      let last = null;
      const walk = (node) => {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            const parts = child.textContent.split(/(\s+)/);
            if (!parts.some((p) => p.trim())) return;
            const frag = document.createDocumentFragment();
            parts.forEach((part) => {
              if (!part.trim()) { frag.appendChild(document.createTextNode(part)); last = null; return; }
              if (last && PUNCT_ONLY.test(part)) { last.append(part); return; }
              const span = document.createElement("span");
              span.className = "w";
              span.style.setProperty("--wi", i++);
              span.textContent = part;
              frag.appendChild(span);
              last = span;
            });
            child.replaceWith(frag);
          } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR") {
            last = null;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            // Wrap an inline <em> as one unit so the serif never breaks apart.
            if (child.textContent.trim() && !child.querySelector("*")) {
              child.classList.add("w");
              child.style.setProperty("--wi", i++);
              last = child;
            } else {
              walk(child);
            }
          }
        });
      };
      walk(host);
    });
  }

  /* Fallback reveals for browsers without scroll timelines. */
  function initReveal() {
    splitHeadlines();

    const els = document.querySelectorAll("[data-reveal], [data-draw], .reveal");
    if (!els.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const show = (el) => { el.classList.add("is-in", "is-visible"); };

    // Native timelines are driving the reveals; only the legacy .reveal
    // class (older pages, injected cards) still needs the observer.
    const needsJS = [...els].filter(
      (el) => !SUPPORTS_TIMELINE || (el.classList.contains("reveal") && !el.hasAttribute("data-reveal"))
    );
    if (!needsJS.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      needsJS.forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (!entry.isIntersecting) return;
          entry.target.style.transitionDelay = `${Math.min(i * 60, 240)}ms`;
          show(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    needsJS.forEach((el) => io.observe(el));
  }

  /* Sections with animations the compositor cannot run (SVG dash offsets)
     carry data-live, and get .is-live only while they are on screen; the
     stylesheet pauses them otherwise. */
  function initLive() {
    const els = document.querySelectorAll("[data-live]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-live")); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
      { rootMargin: "80px" }
    );
    els.forEach((el) => io.observe(el));
  }

  /* Software page: a preview opens the full demo in a dialog. The demo is
     loaded when it is opened and unloaded when it is closed, and the two
     previews behind it stop drawing for as long as it is up. */
  function initDemos() {
    const modal = document.getElementById("demo-modal");
    if (!modal || typeof modal.showModal !== "function") {
      // no <dialog>: the buttons fall back to opening the demo itself
      document.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => { window.location.href = b.dataset.demo.replace("?embed", ""); }));
      return;
    }
    const frame = modal.querySelector("iframe");
    const grid = document.querySelector(".demos");
    document.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => {
      frame.title = b.dataset.demoTitle || "Demo";
      modal.setAttribute("aria-label", b.dataset.demoTitle || "Demo");
      frame.src = b.dataset.demo;
      if (grid) grid.classList.add("is-paused");
      modal.showModal();
    }));
    modal.querySelector(".demo-modal__close").addEventListener("click", () => modal.close());
    // a click on the backdrop (the dialog itself, outside the frame) closes it
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
    modal.addEventListener("close", () => { frame.src = "about:blank"; if (grid) grid.classList.remove("is-paused"); });
  }

  /* Games page: a project frame opens its slides in a dialog.
     The slides live on the button as data-slides="src|caption;src|caption",
     so adding one is an edit to the HTML only. Arrow keys step through. */
  function initGallery() {
    const modal = document.getElementById("re-gallery");
    const buttons = document.querySelectorAll("[data-gallery]");
    if (!modal || !buttons.length) return;
    const parse = (b) => (b.dataset.slides || "").split(";").filter(Boolean).map((s) => {
      const [src, cap] = s.split("|");
      return { src: src.trim(), cap: (cap || "").trim() };
    });
    if (typeof modal.showModal !== "function") {
      // no <dialog>: open the cover image itself
      buttons.forEach((b) => b.addEventListener("click", () => { const s = parse(b)[0]; if (s) window.location.href = s.src; }));
      return;
    }
    const img = modal.querySelector("img");
    const num = modal.querySelector(".re-gallery__n");
    const cap = modal.querySelector(".re-gallery__cap");
    const nav = modal.querySelector(".re-gallery__nav");
    let slides = [], at = 0, title = "";
    const show = (i) => {
      at = (i + slides.length) % slides.length;
      const s = slides[at];
      img.src = s.src;
      img.alt = s.cap || title;
      num.textContent = `${String(at + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
      cap.textContent = s.cap ? `${title}: ${s.cap}` : title;
    };
    buttons.forEach((b) => b.addEventListener("click", () => {
      slides = parse(b);
      if (!slides.length) return;
      title = b.dataset.gallery || "";
      modal.setAttribute("aria-label", `${title} slides`);
      nav.hidden = slides.length < 2;
      show(0);
      modal.showModal();
    }));
    modal.querySelector(".re-gallery__prev").addEventListener("click", () => show(at - 1));
    modal.querySelector(".re-gallery__next").addEventListener("click", () => show(at + 1));
    modal.querySelector(".demo-modal__close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
    modal.addEventListener("keydown", (e) => {
      if (slides.length < 2) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    });
    modal.addEventListener("close", () => { img.removeAttribute("src"); });
  }

  /* The CombineCAD reels (software.html #combinecad). A video has no src
     until it first comes near the screen, then plays only while it is on
     screen. Reduced motion keeps the poster and shows the controls. */
  function initReel() {
    const vids = document.querySelectorAll("[data-reel] video");
    if (!vids.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const load = (v) => {
      if (v.getAttribute("src")) return;
      v.src = v.dataset.src;
      if (v._resume) { const t = v._resume; v.addEventListener("loadedmetadata", () => { v.currentTime = t; }, { once: true }); }
    };
    // A reel scrolled past stops downloading, or the 10-20 MB reels above starve the one on
    // screen (a phone waited 15.8 s for the rocket). It picks up where it was when it returns.
    const unload = (v) => {
      if (!v.paused) v.pause();
      const b = v.buffered, done = b.length && b.end(b.length - 1) >= (v.duration || Infinity) - 0.5;
      if (!v.getAttribute("src") || done) return;
      v._resume = v.currentTime; v.removeAttribute("src"); v.load();
    };
    vids.forEach((v) => {
      if (reduce) { v.controls = true; v.preload = "metadata"; load(v); return; }
      if (!("IntersectionObserver" in window)) { load(v); v.play().catch(() => {}); return; }
      new IntersectionObserver((es) => {
        const on = es[0].isIntersecting;
        if (on) { load(v); v.play().catch(() => {}); } else unload(v);
      }, { rootMargin: "200px 0px", threshold: 0.01 }).observe(v);
    });
  }

  /* A reel opens large: the same file in a dialog, with controls. */
  function initReelModal() {
    const modal = document.getElementById("reel-modal");
    const buttons = document.querySelectorAll("button[data-reel]");
    if (!modal || !buttons.length || typeof modal.showModal !== "function") return;
    const big = modal.querySelector("video");
    buttons.forEach((b) => b.addEventListener("click", () => {
      const v = b.querySelector("video");
      big.src = v.dataset.full || v.dataset.src; big.poster = v.getAttribute("poster") || "";   // inline plays a 720p cut; large gets the full file
      big.currentTime = 0;
      modal.showModal();
      big.play().catch(() => {});
    }));
    modal.querySelector(".demo-modal__close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
    modal.addEventListener("close", () => { big.pause(); big.removeAttribute("src"); big.load(); });
  }

  /* The website show: click through, one site at a time, crossfading in
     one fixed frame. The next image is fetched ahead. */
  function initSiteShow() {
    const root = document.querySelector("[data-site-show]");
    if (!root) return;
    const imgs = [...root.querySelectorAll(".site-show__frame img")];
    const caps = [...root.querySelectorAll(".site-show__cap")];
    const dots = [...root.querySelectorAll(".site-show__dots button")];
    let at = 0;
    const load = (i) => { const im = imgs[(i + imgs.length) % imgs.length]; if (im.dataset.src && !im.getAttribute("src")) im.src = im.dataset.src; return im; };
    const show = (i) => {
      i = (i + imgs.length) % imgs.length;
      const im = load(i);
      const paint = () => {
        at = i;
        imgs.forEach((x, k) => x.classList.toggle("is-on", k === i));
        caps.forEach((x, k) => x.classList.toggle("is-on", k === i));
        dots.forEach((x, k) => { x.classList.toggle("is-on", k === i); x.setAttribute("aria-selected", k === i ? "true" : "false"); });
        load(i + 1);
      };
      if (im.complete && im.naturalWidth) paint(); else im.addEventListener("load", paint, { once: true });
    };
    root.querySelector(".site-show__arrow--prev").addEventListener("click", () => show(at - 1));
    root.querySelector(".site-show__arrow--next").addEventListener("click", () => show(at + 1));
    dots.forEach((d, k) => d.addEventListener("click", () => show(k)));
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    });
    load(1);
  }

  /* ---------------- Global click delegation ---------------- */
  function initDelegation() {
    document.addEventListener("click", (e) => {
    });

  }

  /* ---------------- Boot ---------------- */
  function init() {
    // Home featured grid + shop grid (whichever exists on the page)
    if (window.PRODUCTS) {
      renderGrid("featured-grid", window.PRODUCTS.filter((p) => p.featured));
      renderGrid("shop-grid", window.PRODUCTS);
      renderDetail();
      if (window.BBTCleanLinks) window.BBTCleanLinks(document);   // the plates' own links
      /* Bring the freshly-rendered holograms to life, AFTER the page has been
         painted. Building the models is the heaviest thing the Hardware page
         does (about 50 ms, four times that on a slow machine), and doing it
         before the first paint is what made that page the slowest to appear. */
      if (window.BBTHolograms) requestAnimationFrame(() => setTimeout(() => window.BBTHolograms.mount(), 0));
    }
    initMobileNav();
    initNavScroll();
    initHud();
    initPlanHandoff();
    initSoftwarePlans();
    initConfirmation();
    initDelegation();
    initLive();
    initDemos();
    initGallery();
    initReel();
    initReelModal();
    initSiteShow();
    // Reveal runs last so dynamically-rendered cards are observed.
    initReveal();
  }

  // components.js mounts chrome on DOMContentLoaded; ensure we run after.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* Hardware: "See all 37 modules" opens the folded module table it points to (the table starts closed so the
   kit doesn't take half the page; Tyler, 2026-10-22). */
(function () {
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="#kit-modules"]');
    var d = document.getElementById("kit-modules");
    if (a && d && d.tagName === "DETAILS") d.open = true;
  });
  if (location.hash === "#kit-modules") {
    var d = document.getElementById("kit-modules");
    if (d && d.tagName === "DETAILS") d.open = true;
  }
})();
