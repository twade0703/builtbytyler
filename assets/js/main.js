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

  function plateHTML(p, index, span) {
    const idx = String((index || 0) + 1).padStart(2, "0");
    const href = `product.html?id=${p.id}`;
    const status = "In progress";
    const media = p.holo
      ? `<canvas class="plate__holo" data-holo="${p.holo}"></canvas>
         <span class="plate__hud">3D <em>·</em> Wireframe</span>`
      : RETICLE;
    return `
      <article class="plate ${span || ""}" data-reveal data-reveal-i="${((index || 0) % 6) + 1}">
        <a class="plate__media ${p.holo ? "is-holo" : "is-placeholder"}" href="${href}" aria-label="${p.name}">
          ${TICKS}${media}
        </a>
        <div class="plate__cap">
          <span class="plate__n">${idx}</span>
          <h3 class="plate__name"><a href="${href}">${p.name}</a></h3>
          <span class="plate__price">${status}</span>
          <p class="plate__tag">${p.tagline}</p>
        </div>
      </article>`;
  }

  /* The composition, expressed as spans. The first build gets four of the
     six columns and a wider frame; the rest fall into halves and thirds.
     A grid that reads left to right at different weights is the whole
     difference between "a portfolio" and "a row of tiles". */
  const SPANS = ["plate--lead", "plate--half", "", "", "", "plate--half", "plate--half"];

  /* Which build the homepage shows this week.

     Anchored to a fixed Monday in UTC rather than to "now / one week", so
     every visitor sees the same build no matter their timezone, and it turns
     over on the same day for all of them. A rotation that depends on the
     reader's clock is not a rotation, it is a coin toss. */
  function weeklyPick(list) {
    if (!list.length) return list;
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const EPOCH = Date.UTC(2026, 0, 5);          // Monday, 5 January 2026
    const n = Math.floor((Date.now() - EPOCH) / WEEK);
    return [list[((n % list.length) + list.length) % list.length]];
  }

  function renderGrid(targetId, list) {
    const grid = document.getElementById(targetId);
    if (!grid) return;
    if (grid.getAttribute("data-rotate") === "weekly") {
      grid.innerHTML = weeklyPick(list).map((p) => plateHTML(p, 0, "plate--solo")).join("");
      return;
    }
    if (!list.length) {
      grid.innerHTML = `<p class="plate-empty">No builds listed yet — check back soon.</p>`;
      return;
    }
    const custom = (grid.getAttribute("data-spans") || "").split(",").map((v) => v.trim());
    grid.innerHTML = list
      .map((p, i) => plateHTML(p, i, custom[i] !== undefined && custom[i] !== "" ? (custom[i] === "-" ? "" : custom[i]) : SPANS[i] || ""))
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
          <a class="btn" href="shop.html">See the builds</a>
        </div>`;
      return;
    }

    document.title = `${p.name} · BuiltByTyler`;

    const specs = (p.specs || [])
      .map((s) => `<dt>${s.label}</dt><dd>${s.value}</dd>`)
      .join("");

    const buyBtn = `<a class="btn" href="contact.html">Ask about this build</a>`;

    const media = p.holo
      ? `<canvas class="plate__holo" data-holo="${p.holo}"></canvas>
         <span class="plate__hud">3D <em>·</em> Wireframe</span>`
      : RETICLE;

    host.innerHTML = `
      <a class="back-link" href="shop.html">&larr; All builds</a>
      <div class="detail" data-reveal>
        <div class="detail__media ${p.holo ? "is-holo" : "is-placeholder"}">
          ${media}
        </div>
        <div class="detail__info">
          <p class="badge">In progress</p>
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
          <p class="detail__included">Kept with its <b>STL · STEP · program files</b> and build notes.</p>
        </div>
      </div>`;
  }

  /* ---------------- Mobile nav ---------------- */
  function initMobileNav() {
    const toggle = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    if (!toggle || !links) return;

    const setOpen = (open) => {
      links.classList.toggle("is-open", open);
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      // Lock the page behind the open menu so it can't scroll through.
      document.documentElement.classList.toggle("nav-open", open);
    };

    toggle.addEventListener("click", () =>
      setOpen(!links.classList.contains("is-open"))
    );
    // Close on link tap or when escaping back to a wide layout.
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    window.matchMedia("(min-width: 721px)").addEventListener("change", (m) => {
      if (m.matches) setOpen(false);
    });
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
    const price = window.formatPlanPrice(plan);

    notice.hidden = false;
    notice.innerHTML =
      `You came from the <b>${plan.name}</b> plan — ${price}. ` +
      `Mention anything you want changed and I'll quote against it.`;

    /* Point the software route at the tier they came from, so the email
       arrives already labelled and they do not have to re-explain the
       click. The build route is left alone — it is a different job. */
    const route = document.getElementById("route-software");
    if (route) {
      const subject = `${plan.name} plan enquiry — BuiltByTyler`;
      route.href = `mailto:twade@builtbytyler.com?subject=${encodeURIComponent(subject)}`;
      route.classList.add("is-picked");
      const meta = document.getElementById("route-software-meta");
      if (meta) meta.textContent = `${plan.name} plan · ${price}`;
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
    const want = params.get("type") === "hardware" ? "hardware" : "software";
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
    const setupOk = shown.includes("$" + plan.setup);
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
      // Bring the freshly-rendered holograms (home, shop, detail) to life.
      if (window.BBTHolograms) window.BBTHolograms.mount();
    }
    initMobileNav();
    initNavScroll();
    initHud();
    initPlanHandoff();
    initSoftwarePlans();
    initConfirmation();
    initDelegation();
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
