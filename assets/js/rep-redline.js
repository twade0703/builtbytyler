/* builtbytyler.com/rep-redline: Tyler's private read of the attorney's 2026-11-20 redline of the Rep Agreement ("a list
 * of changes, important changes made, and the most noticeable changes made ... then we'll review it together").
 * Reads /api/hiring-board?doc=redline with the private key from the link (?k=, same key as /democount), published by
 * Website Builder MASTER/04 Legal/reps/attorney-redline-2026-11-20/publish_redline.py.
 * Tyler is colourblind: every tag is an icon and a word, every bar segment carries its number.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh"),
      kpis = document.getElementById("kpis");
  var loading = false, B = null, FILT = "all";
  var K = { "new": ["new", "✚ NEW", "#3987e5"], gone: ["gone", "✕ REMOVED", "#d95926"], tight: ["tight", "▲ STRICTER", "#199e70"],
            loose: ["loose", "▽ LOOSER", "#77809c"], reword: ["reword", "≈ REWORDED", "#5e6888"], same: ["same", "✓ SAME", "#3b425c"], warn: ["warn", "⚠ RISK", "#d69e2e"] };
  var ORDER = ["new", "gone", "tight", "loose", "reword", "same"];
  var NAMES = { "new": "New", gone: "Removed", tight: "Stricter", loose: "Looser", reword: "Reworded", same: "Same" };

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function key() {
    var m = /[?&#]k=([A-Za-z0-9_-]{24,})/.exec((location.search || "") + (location.hash || ""));
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function pill(k) { var p = K[k] || K.reword; return '<span class="pill ' + p[0] + '">' + p[1] + "</span>"; }
  function ago(iso) {
    if (!iso) return "never";
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago"; if (s < 129600) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " days ago";
  }
  function gate(msg) { app.innerHTML = '<section class="panel gate"><b>' + esc(msg) + "</b>Open this page from the link Tyler was texted (the private key is in the link).</section>"; }
  function panel(cls, title, sub, body) {
    return '<section class="panel ' + cls + '"><div class="ph"><div><h2>' + esc(title) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div></div>" + body + "</section>";
  }
  function rows(list, tag) {
    return '<div class="rows">' + list.map(function (r) {
      return '<div class="row"><b>' + (tag ? "<em>" + esc(r[0]) + "</em>" + esc(r[1]) : esc(r[0])) + "</b><span>" + esc(tag ? r[2] : r[1]) + "</span></div>";
    }).join("") + "</div>";
  }

  function cards() {
    var list = B.changes.map(function (c, i) { c.i = i + 1; return c; }).filter(function (c) { return FILT === "all" || c.k === FILT; });
    return list.map(function (c) {
      return '<article class="card"><div class="top"><span class="n">' + c.i + "</span><h3>" + esc(c.name) + "</h3>" + pill(c.k) + "</div>" +
        '<div class="where">Now: ' + esc(c.sec) + " &middot; Was: " + esc(c.old) + "</div>" +
        '<div class="wn"><div><u>YOUR DRAFT</u>' + esc(c.was) + '</div><div class="nw"><u>HER DRAFT</u>' + esc(c.now) + "</div></div>" +
        '<div class="mean">' + esc(c.means) + "</div>" +
        (c.ask ? '<div class="ask"><u>ASK HER</u>' + esc(c.ask) + "</div>" : "") + "</article>";
    }).join("");
  }
  function chips() {
    var h = '<button class="chipb' + (FILT === "all" ? " on" : "") + '" data-f="all" type="button">All<b>' + B.changes.length + "</b></button>";
    ORDER.forEach(function (k) {
      if (B.counts[k]) h += '<button class="chipb' + (FILT === k ? " on" : "") + '" data-f="' + k + '" type="button">' + K[k][1] + "<b>" + B.counts[k] + "</b></button>";
    });
    return h;
  }

  function render() {
    var k = B.kpi, v = B.verdict;
    upd.textContent = "Received " + B.received + " · read " + ago(B.published);
    kpis.innerHTML =
      '<div class="kpi"><u>Words</u><b>' + num(k.o_w) + "</b><small>→ " + num(k.c_w) + "</small></div>" +
      '<div class="kpi"><u>Changes listed</u><b>' + k.changes + "</b></div>" +
      '<div class="kpi"><u>Wording errors</u><b>' + k.errors + "</b></div>" +
      '<div class="kpi"><u>Questions for her</u><b>' + k.asks + "</b></div>";
    document.getElementById("src").textContent = B.sources;

    var bar = '<div class="gbar" role="img" aria-label="Changes by kind">' + ORDER.map(function (o) {
      var n = B.counts[o] || 0; return n ? '<i style="flex:' + n + ";background:" + K[o][2] + '" title="' + NAMES[o] + ": " + n + '"><s>' + n + "</s></i>" : "";
    }).join("") + "</div>";

    var h = '<section class="panel" style="margin-top:14px"><div class="ver"><div><div class="big">' + esc(v.big) + '</div><div class="sub">' + esc(v.sub) + "</div></div>" +
      '<div class="vl">' + v.lines.map(function (l) { return "<div>" + pill(l[0]) + "<span>" + esc(l[1]) + "</span></div>"; }).join("") + "</div></div></section>";

    h += '<div class="g">' +
      panel("c5", "What her email says", B.from, '<ul class="em">' + B.email.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>") +
      panel("c7", "Most noticeable", "What a rep sees on first read", rows(B.notice)) + "</div>";

    h += '<section class="panel" style="margin-top:14px"><div class="ph"><div><h2>Every change, most important first</h2><p>' + B.changes.length + " changes &middot; tap a tag to filter</p></div></div>" +
      bar + '<div class="chips" id="chips">' + chips() + '</div><div class="cards" id="cards">' + cards() + "</div></section>";

    h += '<div class="g">' +
      panel("c6", "Wording errors to send back", k.errors + " found in her clean draft", rows(B.errors.map(function (e) { return ["⚠ " + e[0], "", e[1]]; }), true)) +
      panel("c6", "Questions for her", k.asks + " before you sign off", rows(B.asks)) + "</div>";

    h += '<div class="g">' +
      panel("c6", "What it changes in our system", "After you approve the final text", rows(B.system, true)) +
      panel("c6", "Where each section went", "Your draft → her draft", '<div class="tw"><table><thead><tr><th>Your draft</th><th></th><th>Her draft</th><th></th></tr></thead><tbody>' +
        B.map.map(function (m) { return "<tr><td>" + esc(m[0]) + '</td><td class="arr">→</td><td>' + esc(m[1]) + "</td><td>" + pill(m[2]) + "</td></tr>"; }).join("") + "</tbody></table></div>") + "</div>";

    h += '<section class="panel" style="margin-top:14px"><div class="ph"><div><h2>Read her clean draft</h2><p>' + num(k.c_w) + " words &middot; tap a section to open &middot; " + esc(B.files) + '</p></div></div><div class="doc">' +
      B.draft.map(function (s) {
        return "<details><summary>" + esc(s.h) + "<small>" + s.p.join(" ").split(/\s+/).length + " words</small></summary>" + s.p.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</details>";
      }).join("") + "</div></section>";
    app.innerHTML = h;
  }

  app.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".chipb") : null;
    if (!b || !B) return;
    FILT = b.getAttribute("data-f");
    document.getElementById("chips").innerHTML = chips();
    document.getElementById("cards").innerHTML = cards();
  });

  function fetchBoard() {
    var k = key();
    if (!k) { gate("This page needs its private link"); upd.textContent = "locked"; return; }
    if (loading) return; loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=redline", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { if (r.status === 401 || r.status === 403) { throw new Error("key"); } if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (j) { B = j.board || j; if (!B || !B.changes) throw new Error("empty"); render(); })
      .catch(function (e) { if (!B) gate(e.message === "key" ? "That link's key was not accepted" : "Couldn't load the redline review (" + e.message + ")"); })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  btn.addEventListener("click", fetchBoard);
  fetchBoard();
})();
