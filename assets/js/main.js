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
      <article class="card reveal">
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
  function packageHTML(pkg) {
    const includes = (pkg.includes || []).map((li) => `<li>${li}</li>`).join("");
    return `
      <article class="package reveal">
        <div class="package__head">
          ${pkg.badge ? `<span class="package__badge">${pkg.badge}</span>` : ""}
          <h3 class="package__name">${pkg.name}</h3>
          <div class="package__price">${window.formatPackagePrice(pkg)}</div>
        </div>
        <p class="package__blurb">${pkg.blurb}</p>
        <ul class="package__list">${includes}</ul>
        <a class="btn btn--block" href="mailto:twade0703@gmail.com?subject=${encodeURIComponent(
          "Build inquiry — " + pkg.name
        )}">Request this build</a>
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
      <div class="detail reveal">
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
        </div>
      </div>`;
  }

  /* ---------------- Mobile nav ---------------- */
  function initMobileNav() {
    const toggle = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        links.classList.remove("is-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------------- Scroll reveal ---------------- */
  function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            // gentle stagger
            entry.target.style.transitionDelay = `${Math.min(i * 60, 240)}ms`;
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
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

      if (e.target.closest("#cart-open")) { renderCartBody(); openDrawer(); return; }
      if (e.target.closest("#cart-close") || e.target.id === "cart-backdrop") { closeDrawer(); return; }
      if (e.target.closest("#checkout-btn")) { checkout(); return; }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  /* ---------------- Boot ---------------- */
  function init() {
    // Home featured grid + shop grid (whichever exists on the page)
    if (window.PRODUCTS) {
      renderGrid("featured-grid", window.PRODUCTS.filter((p) => p.featured), { holo: true });
      renderGrid("shop-grid", window.PRODUCTS, { holo: true });
      renderPackages();
      renderDetail();
      // Bring the freshly-rendered holograms (home, shop, detail) to life.
      if (window.BBTHolograms) window.BBTHolograms.mount();
    }
    initMobileNav();
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
