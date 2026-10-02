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
  { href: "shop.html", label: "Hardware" },
  { href: "about.html", label: "About" },
  { href: "contact.html", label: "Contact" },
];

/* The live site serves clean addresses (/shop, not /shop.html) and answers a
   .html request with a redirect to the clean one. Every link on the site was
   written with .html, so every click made two round trips. On the live host
   the links are rewritten to the address that answers directly; on a local
   file server, which needs the extension, they are left alone. */
const CLEAN_URLS = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function cleanHref(h) {
  if (!CLEAN_URLS || !h) return h;
  const m = h.match(/^([a-z0-9_-]+)\.html((?:[?#].*)?)$/i);   // same-folder pages only: "shop.html", "product.html?id=x"
  if (!m) return h;
  return "/" + (m[1] === "index" ? "" : m[1]) + m[2];
}
function cleanLinks(root) {
  if (!CLEAN_URLS) return;
  (root || document).querySelectorAll("a[href]").forEach((a) => {
    const h = a.getAttribute("href"), c = cleanHref(h);
    if (c !== h) a.setAttribute("href", c);
  });
}
window.BBTCleanLinks = cleanLinks;

/* "shop" for /shop, /shop.html and shop.html alike; "index" for the root. */
function pageStem(path) {
  const seg = path.split(/[?#]/)[0].split("/").pop().replace(/\.html$/i, "");
  return seg === "" ? "index" : seg;
}

function renderNav() {
  const host = document.getElementById("site-nav");
  if (!host) return;
  const here = pageStem(window.location.pathname);
  // a build's own page lights "Hardware"
  const activeFor = here === "product" ? "shop" : here;

  const links = NAV_ITEMS.map(
    (item) =>
      `<li><a href="${cleanHref(item.href)}"${
        pageStem(item.href) === activeFor ? ' class="is-active" aria-current="page"' : ""
      }>${item.label}</a></li>`
  ).join("");

  host.className = "site-nav";
  host.innerHTML = `
    <div class="container site-nav__inner">
      <a href="${cleanHref("index.html")}" class="brand">Built<b>ByTyler</b></a>
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

/* Have the next page ready before it is asked for. Where the browser supports
   it, a page is loaded and rendered in the background as soon as the pointer
   rests on its link, so the click only has to show it. Elsewhere the page is
   fetched on hover or touch, which saves the wait for the server. */
function initSpeculation() {
  if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) {
    const rules = document.createElement("script");
    rules.type = "speculationrules";
    const where = { and: [
      { href_matches: "/*" },
      { not: { href_matches: "/demos/*" } },
      { not: { href_matches: "/assets/*" } },
      { not: { href_matches: "/checkout-test*" } },
      { not: { selector_matches: "[target=_blank], [download]" } },
    ] };
    // prefetch as well as prerender: if the browser declines to prerender
    // (memory, battery saver), the page's HTML is still already here.
    rules.textContent = JSON.stringify({
      prefetch: [{ where, eagerness: "moderate" }],
      prerender: [{ where, eagerness: "moderate" }],
    });
    document.head.appendChild(rules);
    return;
  }
  const done = new Set();
  const warm = (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.origin !== location.origin || a.pathname === location.pathname) return;
    if (/^\/(demos|assets)\//.test(a.pathname) || done.has(a.pathname)) return;
    done.add(a.pathname);
    const l = document.createElement("link");
    l.rel = "prefetch"; l.href = a.pathname + a.search;
    document.head.appendChild(l);
  };
  document.addEventListener("pointerover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
  document.addEventListener("focusin", warm);
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
  cleanLinks(document);
  initSpeculation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountChrome);
} else {
  mountChrome();
}
