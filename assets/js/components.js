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
  { href: "software.html", label: "Software" },
  { href: "shop.html", label: "Builds" },
  { href: "about.html", label: "About" },
  { href: "contact.html", label: "Contact" },
];

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
      <nav aria-label="Primary">
        <ul class="nav-links" id="nav-links">${links}</ul>
      </nav>
      <div class="nav-actions">
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
        <span>BuiltByTyler LLC &middot; Monterey, California</span>
        <a href="tel:+12817398942">(281) 739-8942</a>
        <a href="mailto:twade@builtbytyler.com">twade@builtbytyler.com</a>
        <span>&copy; ${year} BuiltByTyler</span>
        <a href="contact.html">Contact</a>
        <a href="software.html">Software &amp; web</a>
        <a href="terms.html">Website terms</a>
        <a href="policies.html">Lead times, shipping &amp; refunds</a>
        <a href="policies.html#privacy">Privacy</a>
        <a href="https://www.linkedin.com/in/tyler-wade1/" target="_blank" rel="noopener">LinkedIn</a>
        <a href="https://instagram.com/twade0703" target="_blank" rel="noopener">Instagram</a>
      </div>
    </div>`;
}

/* Minimal instrument HUD — the scroll-progress bar and percentage
   readout. Driven by initHud() in main.js. */
function renderHUD() {
  if (document.getElementById("hud")) return;
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.id = "hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `
    <div class="hud__progress"><span id="hud-bar"></span></div>
    <div class="hud__readout"><span id="hud-pct">000</span>%</div>`;
  document.body.appendChild(hud);
}

/* The measuring grid — six columns of hairlines behind every page.
   Fixed rather than per-section, so a column line runs unbroken from the
   nav to the footer; that continuity is what makes the layout read as
   set on a grid rather than merely aligned. Injected here so no page
   can forget it, and marked aria-hidden because it carries no meaning. */
function renderRules() {
  if (document.getElementById("rules")) return;
  const r = document.createElement("div");
  r.className = "rules";
  r.id = "rules";
  r.setAttribute("aria-hidden", "true");
  document.body.appendChild(r);
}

function mountChrome() {
  renderRules();
  renderNav();
  renderFooter();
  renderHUD();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountChrome);
} else {
  mountChrome();
}
