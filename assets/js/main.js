/* =================================================================
   main.js — behavior layer
   · renders product grids (home + shop) and product detail
   · placeholder cart (localStorage) with drawer + toast
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

  const CART_KEY = "bbt_cart";

  /* ---------------- Cart store (placeholder) ----------------
     Real checkout is intentionally NOT implemented. When ready,
     wire a Stripe / Gumroad / Shopify link into checkout() below.
  */
  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }
  function cartCount(items) {
    return items.reduce((n, line) => n + line.qty, 0);
  }

  function addToCart(id) {
    const product = window.getProductById(id);
    if (!product) return;
    const items = readCart();
    const line = items.find((l) => l.id === id);
    if (line) line.qty += 1;
    else items.push({ id, qty: 1 });
    writeCart(items);
    updateCartBadge();
    renderCartBody();
    showToast(`${product.name} added — checkout coming soon`);
  }

  function removeFromCart(id) {
    writeCart(readCart().filter((l) => l.id !== id));
    updateCartBadge();
    renderCartBody();
  }

  function updateCartBadge() {
    const badge = document.getElementById("cart-count");
    if (!badge) return;
    const n = cartCount(readCart());
    badge.textContent = n;
    badge.classList.toggle("is-visible", n > 0);
  }

  /* Placeholder — real payment integration goes here later. */
  function checkout() {
    showToast("Checkout isn't live yet — get in touch to order.");
  }

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  /* ---------------- Cart drawer ---------------- */
  function openDrawer() {
    document.getElementById("cart-backdrop")?.classList.add("is-open");
    const d = document.getElementById("cart-drawer");
    d?.classList.add("is-open");
    d?.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    document.getElementById("cart-backdrop")?.classList.remove("is-open");
    const d = document.getElementById("cart-drawer");
    d?.classList.remove("is-open");
    d?.setAttribute("aria-hidden", "true");
  }

  function renderCartBody() {
    const body = document.getElementById("cart-body");
    if (!body) return;
    const items = readCart();
    if (!items.length) {
      body.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
      return;
    }
    body.innerHTML = items
      .map((line) => {
        const p = window.getProductById(line.id);
        if (!p) return "";
        return `
          <div class="cart-line">
            <span class="cart-line__thumb" aria-hidden="true"></span>
            <div class="cart-line__info">
              <div class="cart-line__name">${p.name}</div>
              <div class="cart-line__meta">Qty ${line.qty} · ${
          p.available && p.price ? "$" + p.price.toLocaleString("en-US") : "Coming soon"
        }</div>
            </div>
            <button class="cart-line__remove" data-remove="${p.id}" aria-label="Remove ${p.name}">Remove</button>
          </div>`;
      })
      .join("");
  }

  /* ---------------- Product card markup ----------------
     On the home page, featured cards render a spinning wireframe
     hologram (canvas) instead of a flat image — see hologram.js. */
  /* A clean cyan reticle used wherever there's no 3D model — replaces
     the old product photos. */
  const RETICLE = `
    <svg class="reticle" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="0.6"/>
      <circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="0.6"/>
      <path d="M50 4 V28 M50 72 V96 M4 50 H28 M72 50 H96" stroke="currentColor" stroke-width="0.6"/>
    </svg>`;

  function mediaHTML(p, holo) {
    if (holo && p.holo) {
      return `
        <a class="card__media is-holo" href="product.html?id=${p.id}" aria-label="${p.name}">
          <canvas class="card__holo" data-holo="${p.holo}"></canvas>
          <span class="holo-hud">3D · Wireframe</span>
        </a>`;
    }
    return `
      <a class="card__media is-placeholder" href="product.html?id=${p.id}" aria-label="${p.name}">
        ${RETICLE}
      </a>`;
  }

  function cardHTML(p, holo, index) {
    const idx = String((index || 0) + 1).padStart(2, "0");
    const cta = p.available
      ? `<button class="card__add" data-add="${p.id}">Add to cart</button>`
      : `<a class="card__add" href="shop.html#packages">View packages</a>`;
    return `
      <article class="card" data-reveal="scale" data-reveal-i="${((index || 0) % 6) + 1}">
        <span class="card__index">${idx}</span>
        ${mediaHTML(p, holo)}
        <div class="card__body">
          <h3 class="card__name"><a href="product.html?id=${p.id}">${p.name}</a></h3>
          <p class="card__tag">${p.tagline}</p>
          <div class="card__row">
            <span class="price">${window.formatPrice(p)}</span>
            ${cta}
          </div>
        </div>
      </article>`;
  }

  function renderGrid(targetId, list, opts) {
    const grid = document.getElementById(targetId);
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = `<p class="cart-empty">No products yet — check back soon.</p>`;
      return;
    }
    const holo = !!(opts && opts.holo);
    grid.innerHTML = list.map((p, i) => cardHTML(p, holo, i)).join("");
  }

  /* ---------------- Build packages (shop.html#packages) ---------------- */
  function packageHTML(pkg, i) {
    const includes = (pkg.includes || []).map((li) => `<li>${li}</li>`).join("");
    return `
      <article class="package" data-reveal data-reveal-i="${(i || 0) + 1}">
        <div class="package__head">
          ${pkg.badge ? `<span class="package__badge">${pkg.badge}</span>` : ""}
          <h3 class="package__name">${pkg.name}</h3>
          <div class="package__price">${window.formatPackagePrice(pkg)}</div>
        </div>
        <p class="package__blurb">${pkg.blurb}</p>
        <ul class="package__list">${includes}</ul>
        <button class="btn btn--block" data-order="${pkg.id}">${
          pkg.price == null ? "Request a quote"
            : (window.isBuyable && window.isBuyable(pkg)) ? "Order now" : "Order"
        }</button>
      </article>`;
  }

  function renderPackages() {
    const grid = document.getElementById("packages-grid");
    if (!grid || !window.PACKAGES) return;
    grid.innerHTML = window.PACKAGES.map(packageHTML).join("");
  }

  /* ---------------- Product detail (product.html) ---------------- */
  function renderDetail() {
    const host = document.getElementById("product-detail");
    if (!host) return;
    const id = new URLSearchParams(window.location.search).get("id");
    const p = id ? window.getProductById(id) : null;

    if (!p) {
      host.innerHTML = `
        <div class="empty-state">
          <h1>Product not found</h1>
          <p>We couldn't find that item. It may have moved or sold out.</p>
          <a class="btn" href="shop.html">Back to shop</a>
        </div>`;
      return;
    }

    document.title = `${p.name} · BuiltByTyler`;

    const specs = (p.specs || [])
      .map((s) => `<dt>${s.label}</dt><dd>${s.value}</dd>`)
      .join("");

    const buyBtn = p.available
      ? `<button class="btn" data-add="${p.id}">Add to cart</button>
         <button class="btn btn--ghost" data-buy="${p.id}">Buy now</button>`
      : `<a class="btn" href="shop.html#packages">View build packages</a>`;

    const media = p.holo
      ? `<canvas class="card__holo" data-holo="${p.holo}"></canvas>
         <span class="holo-hud">3D · Wireframe</span>`
      : RETICLE;

    host.innerHTML = `
      <a class="back-link" href="shop.html">&larr; All products</a>
      <div class="detail" data-reveal>
        <div class="detail__media ${p.holo ? "is-holo" : "is-placeholder"}">
          ${media}
        </div>
        <div class="detail__info">
          <p class="badge">${p.available ? "Available" : "Coming soon"}</p>
          <h1>${p.name}</h1>
          <p class="detail__tag">${p.tagline}</p>
          <div class="detail__price">${window.formatPrice(p)}</div>
          <div class="detail__desc"><p>${p.description}</p></div>
          <div class="detail__actions">${buyBtn}</div>
          <span class="notice">${
            p.available
              ? "Checkout is a placeholder — get in touch to order."
              : "Sold as a configured build — see pricing on the shop page."
          }</span>
          ${
            specs
              ? `<div class="specs"><dl>${specs}</dl></div>`
              : ""
          }
          <p class="detail__included">Every build ships with <b>STL · STEP · program files</b> + a hardware package.</p>
        </div>
      </div>`;
  }

  /* ---------------- Order modal (build packages) ---------------- */
  let currentOrder = null;

  function openOrderModal(id) {
    const pkg = (window.PACKAGES || []).find((p) => p.id === id);
    if (!pkg) return;
    currentOrder = pkg;
    const title = document.getElementById("order-title");
    const price = document.getElementById("order-price");
    if (title) title.textContent = pkg.name;
    if (price) price.textContent = window.formatPackagePrice(pkg);

    const buyable = window.isBuyable && window.isBuyable(pkg);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("order-lead", pkg.leadTime || "Made to order");
    set("order-ship", pkg.shipping || "Quoted per order");

    const submit = document.getElementById("order-submit");
    const note = document.getElementById("order-note");
    const consentWrap = document.getElementById("order-consent-wrap");
    const consent = document.getElementById("order-consent");
    const qtyField = document.getElementById("order-qty-field");

    if (submit) submit.textContent = buyable ? "Continue to secure checkout" : "Send order request";
    if (note) {
      note.innerHTML = buyable
        ? 'Payment is handled by <b>Stripe</b> on their own secure page \u2014 card details never touch this site.'
        : "No payment now \u2014 I'll confirm the details and follow up, usually within a day.";
    }
    // The consent tick only gates a real payment.
    if (consentWrap) consentWrap.hidden = !buyable;
    if (consent) consent.checked = false;
    // Stripe controls quantity on its own page.
    if (qtyField) qtyField.hidden = buyable;
    document.getElementById("order-backdrop")?.classList.add("is-open");
    const m = document.getElementById("order-modal");
    m?.classList.add("is-open");
    m?.setAttribute("aria-hidden", "false");
    setTimeout(() => document.getElementById("order-name")?.focus(), 60);
  }

  function closeOrderModal() {
    document.getElementById("order-backdrop")?.classList.remove("is-open");
    const m = document.getElementById("order-modal");
    m?.classList.remove("is-open");
    m?.setAttribute("aria-hidden", "true");
  }

  // Buyable packages hand off to a Stripe-hosted Payment Link. Everything
  // else (quote work, or a package with no link yet) falls back to an email
  // enquiry so a button can never dead-end.
  function submitOrder(e) {
    e.preventDefault();
    if (!currentOrder) return;
    const val = (id) => (document.getElementById(id)?.value || "").trim();
    const name = val("order-name");
    const email = val("order-email");
    const qty = val("order-qty") || "1";
    const notes = val("order-notes");
    if (!name || !email) {
      showToast("Add your name and email to place the order.");
      return;
    }

    const buyable = window.isBuyable && window.isBuyable(currentOrder);

    if (buyable) {
      if (!document.getElementById("order-consent")?.checked) {
        showToast("Please confirm you've read the lead times and refund policy.");
        return;
      }
      // Stripe collects payment, address and quantity on its own page.
      // client_reference_id ties the Stripe payment back to a package id.
      const url = new URL(currentOrder.paymentLink);
      url.searchParams.set("prefilled_email", email);
      url.searchParams.set("client_reference_id", currentOrder.id);
      closeOrderModal();
      window.location.assign(url.toString());
      return;
    }

    const subject = `Order — ${currentOrder.name}`;
    const body = [
      `Order — ${currentOrder.name}`,
      `Price: ${window.formatPackagePrice(currentOrder)}`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Quantity: ${qty}`,
      `Notes: ${notes || "—"}`,
      "",
      `Includes: ${(currentOrder.includes || []).join(", ")}`,
    ].join("\n");
    window.location.href =
      `mailto:twade@builtbytyler.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeOrderModal();
    showToast("Order ready in your email — just hit send.");
  }

  /* ---------------- Policy page lead times ---------------- */
  // Lead times live in PACKAGES so the policy page can never drift
  // out of sync with what the shop actually promises.
  function renderPolicyLeadTimes() {
    const host = document.getElementById("policy-leadtimes");
    if (!host || !window.PACKAGES) return;
    host.innerHTML = window.PACKAGES.map(
      (p) => `<li><span class="k">${p.name}</span><span class="v">${p.leadTime || "Made to order"}</span></li>`
    ).join("");
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
     Keep the bar clear over the hero/landing; only firm + slim it once the
     first content section reaches the top. Pages without a hero firm near top. */
  function initNavScroll() {
    const nav = document.getElementById("site-nav");
    if (!nav) return;
    const after = document.querySelector("main section:not(.hero)");
    let threshold = 8;
    const recompute = () => {
      threshold = after ? Math.max(8, after.offsetTop - (nav.offsetHeight || 50) - 24) : 8;
    };
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > threshold);
    recompute();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { recompute(); onScroll(); }, { passive: true });
    window.addEventListener("load", () => { recompute(); onScroll(); });
  }

  /* ---------------- Software plan handoff (contact.html?plan=…) ----------------
     The pricing tiers on software.html link here with the tier they came
     from. Carrying it across means the visitor does not have to re-explain
     what they just clicked, and the enquiry arrives already labelled. */
  const PLANS = {
    launch:  { name: "Launch", price: "$500 build + $50/mo" },
    growth:  { name: "Growth", price: "$3,000 build + $200/mo" },
    product: { name: "Product", price: "$6,000, scoped per project" },
  };

  function initPlanHandoff() {
    const notice = document.getElementById("plan-notice");
    if (!notice) return;
    const key = (new URLSearchParams(window.location.search).get("plan") || "").toLowerCase();
    const plan = PLANS[key];
    if (!plan) return;

    notice.hidden = false;
    notice.innerHTML =
      `You came from the <b>${plan.name}</b> plan — ${plan.price}. ` +
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
      if (meta) meta.textContent = `${plan.name} plan · ${plan.price}`;
      const go = document.getElementById("route-software-go");
      if (go) go.textContent = `Enquire about ${plan.name} →`;
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
      const add = e.target.closest("[data-add]");
      if (add) { addToCart(add.getAttribute("data-add")); return; }

      const buy = e.target.closest("[data-buy]");
      if (buy) { addToCart(buy.getAttribute("data-buy")); openDrawer(); return; }

      const rm = e.target.closest("[data-remove]");
      if (rm) { removeFromCart(rm.getAttribute("data-remove")); return; }

      const order = e.target.closest("[data-order]");
      if (order) { openOrderModal(order.getAttribute("data-order")); return; }
      if (e.target.closest("#order-close") || e.target.id === "order-backdrop") { closeOrderModal(); return; }

      if (e.target.closest("#cart-open")) { renderCartBody(); openDrawer(); return; }
      if (e.target.closest("#cart-close") || e.target.id === "cart-backdrop") { closeDrawer(); return; }
      if (e.target.closest("#checkout-btn")) { checkout(); return; }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDrawer(); closeOrderModal(); }
    });

    document.getElementById("order-form")?.addEventListener("submit", submitOrder);
  }

  /* ---------------- Boot ---------------- */
  function init() {
    // Home featured grid + shop grid (whichever exists on the page)
    if (window.PRODUCTS) {
      renderGrid("featured-grid", window.PRODUCTS.filter((p) => p.featured), { holo: true });
      renderGrid("shop-grid", window.PRODUCTS, { holo: true });
      renderPackages();
    renderPolicyLeadTimes();
      renderDetail();
      // Bring the freshly-rendered holograms (home, shop, detail) to life.
      if (window.BBTHolograms) window.BBTHolograms.mount();
    }
    initMobileNav();
    initNavScroll();
    initHud();
    initPlanHandoff();
    initDelegation();
    updateCartBadge();
    renderCartBody();
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
