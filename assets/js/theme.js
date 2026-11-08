/* Colour themes for Tyler's private dashboards: /democount, /run, /plan (2026-11-08, Tyler: "I want a color theme
 * change, just like small button to the top left or right where I can change the color theme").
 *
 * One small "Theme" button (in the header when the page has one, else fixed top right) opens a list of named themes;
 * the choice is kept in this browser (localStorage "bbt-theme"). A theme changes only backgrounds, panels, lines
 * and text. The chart colours (blue, orange, aqua) stay the same in every theme, because they were checked for
 * colour-blind separation and every mark is labelled anyway. Each option shows its name, never colour alone.
 * Works with both token sets: /run and /democount (--panel, --edge) and /plan (--card, --line).
 */
(function () {
  "use strict";
  var KEY = "bbt-theme";
  var THEMES = [
    { id: "midnight", name: "Midnight", note: "navy (default)", bg: "#070A14", panel: "#0D1120", card2: "#141a2e", line: "rgba(160,180,255,.09)", line2: "rgba(160,180,255,.16)",
      tx: "#EEF1FA", mu: "#97A0BD", dim: "#5E6888", grid: "rgba(160,180,255,.07)", g1: "rgba(57,135,229,.16)", g2: "rgba(144,133,233,.10)" },
    { id: "light", name: "Daylight", note: "white, for bright rooms", light: true, bg: "#EEF1F7", panel: "#FFFFFF", card2: "#F4F6FB", line: "rgba(20,30,60,.12)", line2: "rgba(20,30,60,.22)",
      tx: "#121726", mu: "#46506B", dim: "#68718C", grid: "rgba(20,30,60,.08)", g1: "rgba(57,135,229,.10)", g2: "rgba(25,158,112,.06)" },
    { id: "graphite", name: "Graphite", note: "neutral grey", bg: "#111214", panel: "#1C1E22", card2: "#24272C", line: "rgba(255,255,255,.10)", line2: "rgba(255,255,255,.18)",
      tx: "#F1F2F4", mu: "#AEB3BC", dim: "#7A808B", grid: "rgba(255,255,255,.07)", g1: "rgba(255,255,255,.06)", g2: "rgba(255,255,255,.03)" },
    { id: "forest", name: "Forest", note: "deep green", bg: "#04140D", panel: "#0B2419", card2: "#123123", line: "rgba(120,230,170,.14)", line2: "rgba(120,230,170,.24)",
      tx: "#EAF7F0", mu: "#9CC2AF", dim: "#62877A", grid: "rgba(120,230,170,.09)", g1: "rgba(25,158,112,.30)", g2: "rgba(25,158,112,.12)" },
    { id: "plum", name: "Plum", note: "deep purple", bg: "#12081C", panel: "#21122F", card2: "#2C1A3E", line: "rgba(210,160,255,.15)", line2: "rgba(210,160,255,.26)",
      tx: "#F6EEFD", mu: "#BCA6D2", dim: "#85709C", grid: "rgba(210,160,255,.09)", g1: "rgba(160,90,240,.30)", g2: "rgba(217,89,38,.10)" },
    { id: "contrast", name: "High contrast", note: "black, brightest text", bg: "#000000", panel: "#0A0A0A", card2: "#141414", line: "rgba(255,255,255,.26)", line2: "rgba(255,255,255,.40)",
      tx: "#FFFFFF", mu: "#D8DCE3", dim: "#A4AAB4", grid: "rgba(255,255,255,.14)", g1: "rgba(0,0,0,0)", g2: "rgba(0,0,0,0)" }
  ];
  /* Daylight: the pages were drawn for dark backgrounds, so the few light-on-dark colours they hard-code are swapped */
  var LIGHT =
    ".panel,.card{box-shadow:0 1px 2px rgba(20,30,60,.06),0 12px 30px -18px rgba(20,30,60,.25) !important}" +
    ".chip,.pill.run,.livepill.on,.bign u,.thm li em,.pipe span.last,.steps span.done{color:#1f5fae !important}" +
    ".pill.done,.chk span.ok{color:#17741f !important}.pill.fail{color:#a32424 !important}.capnote,.chk span.bad{color:#a8441b !important}" +
    ".feed,.lv .tick,.log{background:#F4F6FB !important;color:var(--mu) !important}.feed div{color:var(--mu) !important}.feed div:first-child{color:var(--tx) !important}" +
    ".lv .tick{color:#2a4a7a !important}.tip{background:#fff !important;color:var(--tx) !important;box-shadow:0 10px 30px rgba(20,30,60,.2) !important}" +
    ".thm li i{border-color:rgba(20,30,60,.25) !important}.thm li button:hover{background:rgba(20,30,60,.06) !important}" +
    ".steps span.now{color:#fff !important}.ax{fill:#68718C}.gl{stroke:rgba(20,30,60,.10)}";

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function find(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return THEMES[0]; }

  var style = document.createElement("style");
  document.head.appendChild(style);
  function apply(t) {
    var r = document.documentElement.style;
    var set = { "--bg": t.bg, "--panel": t.panel, "--card": t.panel, "--card2": t.card2, "--edge": t.line, "--edge2": t.line2, "--line": t.line,
                "--tx": t.tx, "--mu": t.mu, "--dim": t.dim, "--grid": t.grid };
    // /plan's accent colours are pastel for dark backgrounds; Daylight uses darker shades of the same hues
    var acc = t.light ? { "--blue": "#1f63c4", "--violet": "#6a46d1", "--green": "#14823c", "--amber": "#a35f00", "--red": "#c42b2b", "--teal": "#0d7f73" }
                      : { "--blue": "", "--violet": "", "--green": "", "--amber": "", "--red": "", "--teal": "" };
    for (var a in acc) set[a] = acc[a];
    for (var k in set) { if (set[k]) r.setProperty(k, set[k]); else r.removeProperty(k); }
    style.textContent = (t.id === "midnight" ? "" :
      "body{background:radial-gradient(1200px 600px at 10% -10%," + t.g1 + ",transparent 60%),radial-gradient(900px 500px at 100% 20%," + t.g2 + ",transparent 60%)," + t.bg + " !important;background-attachment:fixed !important}") +
      (t.light ? LIGHT : "");
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t.bg);
    document.documentElement.setAttribute("data-theme", t.id);
  }
  var cur = find(get(KEY));
  apply(cur);

  function ui() {
    var css = document.createElement("style");
    css.textContent =
      ".thm{position:relative;display:inline-flex}" +
      ".thm.fx{position:fixed;top:calc(env(safe-area-inset-top) + 10px);right:12px;z-index:40}" +
      ".thm>button{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:9px;border:1px solid var(--edge2,var(--line));background:var(--panel,var(--card));color:var(--mu);font:500 12px 'JetBrains Mono',ui-monospace,monospace;cursor:pointer}" +
      ".thm>button:hover{color:var(--tx)}" +
      ".thm>button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6}" +
      ".thm ul{position:absolute;right:0;top:calc(100% + 6px);z-index:41;min-width:220px;margin:0;padding:6px;list-style:none;border-radius:12px;border:1px solid var(--edge2,var(--line));background:var(--panel,var(--card));box-shadow:0 18px 40px rgba(0,0,0,.6)}" +
      ".thm ul[hidden]{display:none}" +
      ".thm li button{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;width:100%;padding:8px 9px;border-radius:8px;border:0;background:none;color:var(--tx);text-align:left;cursor:pointer;font:500 13px 'Instrument Sans',system-ui,sans-serif}" +
      ".thm li button:hover,.thm li button:focus-visible{background:rgba(255,255,255,.06);outline:none}" +
      ".thm li i{width:22px;height:22px;border-radius:6px;border:1px solid rgba(255,255,255,.25)}" +
      ".thm li small{display:block;color:var(--dim);font:500 10.5px 'JetBrains Mono',monospace}" +
      ".thm li em{font-style:normal;font:600 11px 'JetBrains Mono',monospace;color:#8fbaf0}";
    document.head.appendChild(css);
    var box = document.createElement("div");
    box.className = "thm";
    box.innerHTML = '<button type="button" aria-haspopup="true" aria-expanded="false" title="Colour theme"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor"/></svg><span>Theme</span></button><ul hidden></ul>';
    var btn = box.firstChild, list = box.lastChild;
    function draw() {
      list.innerHTML = THEMES.map(function (t) {
        return '<li><button type="button" data-t="' + t.id + '"><i style="background:linear-gradient(135deg,' + t.panel + " 50%," + t.bg + ' 50%)"></i><span>' + t.name + "<small>" + t.note + "</small></span>" + (t.id === cur.id ? "<em>✓ ON</em>" : "<em></em>") + "</button></li>";
      }).join("");
    }
    draw();
    btn.addEventListener("click", function (e) { e.stopPropagation(); var open = list.hidden; list.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      cur = find(b.getAttribute("data-t")); put(KEY, cur.id); apply(cur); draw(); list.hidden = true; btn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", function () { list.hidden = true; btn.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { list.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
    var hdr = document.querySelector(".hdr"), ref = document.getElementById("refresh");
    if (hdr && ref && ref.parentNode === hdr) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:8px;align-items:center";
      hdr.insertBefore(wrap, ref); wrap.appendChild(box); wrap.appendChild(ref);
    } else {
      box.className = "thm fx"; document.body.appendChild(box);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ui); else ui();
})();
