/* =================================================================
   components.js — shared chrome injected on every page.
   Renders the nav, footer, cart drawer and toast into placeholders
   so the markup lives in exactly one place (no duplication).

   Each page only needs:
     <header id="site-nav"></header>  ... content ...  <footer id="site-footer"></footer>
     <script src="assets/js/products.js"></script>
     <script src="assets/js/components.js"></script>
     <script src="assets/js/main.js"></script>
   ================================================================= */

const NAV_ITEMS = [
  { href: "index.html", label: "Home" },
  { href: "shop.html", label: "Shop" },
  { href: "about.html", label: "About" },
  { href: "contact.html", label: "Contact" },
];

const CART_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 3h2l.4 2M7 13h10l3.5-7H6.4M7 13L5.4 5M7 13l-2 4h12"/>
    <circle cx="9" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>
  </svg>`;

function currentPage() {
  const path = window.location.pathname.split("/").pop();
  return path === "" ? "index.html" : path;
}

function renderNav() {
  const host = document.getElementById("site-nav");
  if (!host) return;
  const here = currentPage();
  // product.html highlights "Shop"
  const activeFor = here === "product.html" ? "shop.html" : here;

  const links = NAV_ITEMS.map(
    (item) =>
      `<li><a href="${item.href}" class="${
        item.href === activeFor ? "is-active" : ""
      }">${item.label}</a></li>`
  ).join("");

  host.className = "site-nav";
  host.innerHTML = `
    <div class="container site-nav__inner">
      <a href="index.html" class="brand">Built<b>ByTyler</b></a>
      <nav>
        <ul class="nav-links" id="nav-links">${links}</ul>
      </nav>
      <div class="nav-actions">
        <button class="cart-btn" id="cart-open" aria-label="Open cart">
          ${CART_ICON}
          <span class="cart-count" id="cart-count">0</span>
        </button>
        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>`;
}

function renderFooter() {
  const host = document.getElementById("site-footer");
  if (!host) return;
  const year = host.getAttribute("data-year") || "2026";
  host.className = "site-footer";
  host.innerHTML = `
    <div class="container site-footer__inner">
      <a href="index.html" class="brand">Built<b>ByTyler</b></a>
      <div class="footer-meta">
        <span>Designed &amp; built by Tyler Wade</span>
        <span>&copy; ${year} BuiltByTyler</span>
        <a href="https://www.linkedin.com/in/tyler-wade1/" target="_blank" rel="noopener">LinkedIn</a>
        <a href="https://instagram.com/twade0703" target="_blank" rel="noopener">Instagram</a>
      </div>
    </div>`;
}

function renderCartDrawer() {
  if (document.getElementById("cart-drawer")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="drawer-backdrop" id="cart-backdrop"></div>
    <aside class="drawer" id="cart-drawer" aria-hidden="true" aria-label="Shopping cart">
      <div class="drawer__head">
        <h2>Cart</h2>
        <button class="drawer__close" id="cart-close" aria-label="Close cart">&times;</button>
      </div>
      <div class="drawer__body" id="cart-body"></div>
      <div class="drawer__foot">
        <button class="btn btn--block" id="checkout-btn" disabled aria-disabled="true">
          Checkout — coming soon
        </button>
      </div>
    </aside>`;
  document.body.appendChild(wrap);
}

function renderToast() {
  if (document.getElementById("toast")) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.id = "toast";
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  document.body.appendChild(t);
}

/* Minimal instrument HUD — populated live by immersive.js. */
function renderHUD() {
  if (document.getElementById("hud")) return;
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.id = "hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `
    <div class="hud__progress"><span id="hud-bar"></span></div>
    <div class="hud__craft">
      <span class="hud__craft-name" id="hud-craft-name">F-22 Raptor</span>
      <span class="hud__craft-tag" id="hud-craft-tag">Air dominance fighter</span>
    </div>
    <div class="hud__readout"><span id="hud-pct">000</span>%</div>`;
  document.body.appendChild(hud);
}

function mountChrome() {
  renderNav();
  renderFooter();
  renderCartDrawer();
  renderToast();
  renderHUD();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountChrome);
} else {
  mountChrome();
}
