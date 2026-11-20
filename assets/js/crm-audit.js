/* builtbytyler.com/crm-audit: Tyler's private report of the 2026-11-20 audit of the reps' CRM ("go fully audit the
 * CRM ... calling the business, texting the demo link ... texting the payment link. All payment links should work. All
 * demos should be live. No render errors ... all real businesses ... everything is safe").
 * Reads /api/hiring-board?doc=crmaudit with the private key from the link (?k=, same key as /democount), published by
 * Desktop/REA/audits/crm-2026-11-20/publish_audit.py. Tyler is colourblind: every status is an icon and a word, every
 * bar carries its number, and no meaning rides on colour alone.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh"),
      kpis = document.getElementById("kpis");
  var C = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", other: "#5e6888" };
  var loading = false, B = null, FILT = "all";
  var ST = { pass: ["done", "✓ PASS"], fixed: ["fix", "● FIXED"], you: ["warn", "⚠ NEEDS YOU"], watch: ["q", "◌ WATCH"], go: ["done", "✓ WORKS"] };

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function key() {
    var m = /[?&#]k=([A-Za-z0-9_-]{24,})/.exec((location.search || "") + (location.hash || ""));
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null ? "–" : Number(n).toLocaleString("en-US"); }
  function pill(s) { var p = ST[s] || ST.watch; return '<span class="pill ' + p[0] + '">' + p[1] + "</span>"; }
  function ago(iso) {
    if (!iso) return "never";
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago"; if (s < 129600) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " days ago";
  }
  function gate(msg) { app.innerHTML = '<section class="panel gate"><b>' + esc(msg) + "</b>Open this page from the link Tyler was texted (the private key is in the link).</section>"; }

  function donut(rows) {
    var total = rows.reduce(function (a, r) { return a + r.n; }, 0), R = 74, W = 22, CIRC = 2 * Math.PI * R, off = 0, gap = 2.5;
    var arcs = rows.map(function (r) {
      var len = total ? CIRC * r.n / total : 0, a = '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="' + r.c + '" stroke-width="' + W + '" stroke-dasharray="' + Math.max(0, len - gap) + " " + (CIRC - Math.max(0, len - gap)) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 100 100)"/>';
      off += len; return r.n ? a : "";
    }).join("");
    return '<div class="dwrap"><svg id="donut" viewBox="0 0 200 200" role="img" aria-label="Checks by result">' + arcs +
      '<text x="100" y="98" text-anchor="middle" style="fill:var(--tx);font:600 34px JetBrains Mono,monospace">' + total + '</text><text x="100" y="118" text-anchor="middle" class="ax" style="letter-spacing:.1em">CHECKS RUN</text></svg>' +
      '<div class="leg">' + rows.map(function (r) { return '<div><i style="background:' + r.c + '"></i><span>' + esc(r.name) + "</span><b>" + r.n + "</b><em>" + (total ? Math.round(100 * r.n / total) : 0) + "%</em><small>" + esc(r.why) + "</small></div>"; }).join("") + "</div></div>";
  }

  function render(b) {
    B = b;
    var cnt = { pass: 0, fixed: 0, you: 0, watch: 0 };
    b.checks.forEach(function (c) { cnt[c.s] = (cnt[c.s] || 0) + 1; });
    var total = b.checks.length;
    kpis.innerHTML = [["Checks run", total, ""], ["Passed", cnt.pass, Math.round(100 * cnt.pass / total) + "% of " + total], ["Fixed today", cnt.fixed, "live now"], ["Need you", cnt.you, "before day one"]]
      .map(function (k) { return '<div class="kpi"><u>' + k[0] + "</u><b>" + num(k[1]) + "</b>" + (k[2] ? '<span class="chip">' + esc(k[2]) + "</span>" : "") + "</div>"; }).join("");

    var h = "";
    // verdict
    h += '<section class="panel verdict"><div class="bign"><b style="font-size:46px">' + esc(b.verdict.big) + "</b><u>" + esc(b.verdict.label) + "</u><span>" + esc(b.verdict.sub) + '</span></div><div class="vl">' +
      b.verdict.lines.map(function (l) { return "<div>" + pill(l[0]) + "<span>" + esc(l[1]) + "</span></div>"; }).join("") + "</div></section>";

    // the three clicks + donut
    h += '<div class="g"><section class="panel c8"><div class="ph"><div><h2>The three clicks</h2><p>What a rep does on a call, and what stands behind each button</p></div></div><div class="flow">' +
      b.flow.map(function (f, i) { return '<div class="fc"><span class="n">STEP ' + (i + 1) + "</span><h3>" + esc(f.name) + "</h3>" + pill(f.s) + "<ul>" + f.lines.map(function (l) { return "<li><b>" + esc(l[0]) + "</b> " + esc(l[1]) + "</li>"; }).join("") + "</ul></div>"; }).join("") +
      '</div></section><section class="panel c4"><div class="ph"><div><h2>Where every check landed</h2><p>All ' + total + " checks, by result</p></div></div>" +
      donut([{ name: "Passed", n: cnt.pass, c: C.s1, why: "Worked as it should, nothing to do" }, { name: "Fixed today", n: cnt.fixed, c: C.s3, why: "Was wrong, is fixed and live" },
             { name: "Needs you", n: cnt.you, c: C.s2, why: "Only you can do these" }, { name: "Watch", n: cnt.watch, c: C.other, why: "Works, small or cosmetic" }]) + "</section></div>";

    // demos, dates, server
    h += '<div class="g"><section class="panel c4 half"><div class="ph"><div><h2>Demos on the sheets</h2><p>Each line is out of all ' + num(b.demos.total) + " website demos</p></div></div>" +
      b.demos.rows.map(function (r) { var p = Math.round(1000 * r.n / b.demos.total) / 10; return '<div class="pr"><div class="h"><b>' + esc(r.name) + "</b><span>" + num(r.n) + " of " + num(b.demos.total) + " · " + p + '%</span></div><div class="t"><i style="width:' + p + '%"></i></div><p>' + esc(r.note) + "</p></div>"; }).join("") + "</section>";
    var mx = Math.max.apply(null, b.dates.map(function (d) { return d.n; }));
    h += '<section class="panel c4 half"><div class="ph"><div><h2>Dates that lock numbers</h2><p>Businesses that can no longer be dialed after each date, out of ' + num(b.sheet_total) + "</p></div></div>" +
      b.dates.map(function (d) { return '<div class="hb2"><b>' + esc(d.day) + '</b><div class="t"><i class="' + (d.ok ? "ok" : "") + '" style="width:' + Math.round(100 * d.n / mx) + '%"></i></div><u>' + num(d.n) + "</u><small>" + esc(d.note) + "</small></div>"; }).join("") + "</section>";
    h += '<section class="panel c4"><div class="ph"><div><h2>Server</h2><p>The one machine the reps\' app runs on</p></div></div><div class="stock" style="margin-top:0">' +
      b.server.map(function (s) { return "<div><b>" + esc(s[0]) + "</b><u>" + esc(s[1]) + "</u></div>"; }).join("") + '</div><p class="small" style="margin:12px 0 0;line-height:1.6">' + esc(b.server_note) + "</p></section></div>";

    // needs you
    h += '<div class="g"><section class="panel c12"><div class="ph"><div><h2>Only you can do these</h2><p>' + b.needs.length + ' things, most urgent first</p></div></div><div class="tw"><table class="wrap"><thead><tr><th>By</th><th>What</th><th>Why it matters</th></tr></thead><tbody>' +
      b.needs.map(function (n) { return "<tr><td class=\"num\">" + esc(n.by) + "</td><td><b>" + esc(n.what) + "</b><small>" + esc(n.how) + "</small></td><td>" + esc(n.why) + "</td></tr>"; }).join("") + "</tbody></table></div></section></div>";

    // fixed
    h += '<div class="g"><section class="panel c12"><div class="ph"><div><h2>What I fixed today</h2><p>' + b.fixed.length + ' fixes, all live, each with its undo</p></div></div><div class="tw"><table class="wrap"><thead><tr><th>Fix</th><th>Before</th><th>Now</th><th>Undo</th></tr></thead><tbody>' +
      b.fixed.map(function (f) { return "<tr><td><b>" + esc(f.what) + "</b></td><td>" + esc(f.before) + "</td><td>" + esc(f.now) + "</td><td><small style=\"margin:0\">" + esc(f.undo) + "</small></td></tr>"; }).join("") + "</tbody></table></div></section></div>";

    // every check + seats
    h += '<div class="g"><section class="panel c8"><div class="ph"><div><h2>Every check</h2><p id="ccount"></p></div><div class="filt" id="filt"></div></div><div class="tw" style="max-height:560px;overflow-y:auto"><table class="wrap"><thead><tr><th>Result</th><th>Check</th><th>What I found</th></tr></thead><tbody id="cbody"></tbody></table></div></section>';
    h += '<section class="panel c4"><div class="ph"><div><h2>Seats</h2><p>Businesses on each sheet today</p></div></div>' +
      b.seats.map(function (s) { return '<div class="seat"><b>' + esc(s.label) + (s.name ? " · " + esc(s.name) : "") + "</b><span>" + num(s.n) + "</span><small>" + esc(s.note) + "</small></div>"; }).join("") + "</section></div>";
    app.innerHTML = h;
    document.getElementById("src").textContent = b.sources;
    checks();
    upd.textContent = "checked " + ago(b.published);
  }

  function checks() {
    var b = B, areas = ["all", "pass", "fixed", "you", "watch"], names = { all: "All", pass: "Passed", fixed: "Fixed", you: "Needs you", watch: "Watch" };
    document.getElementById("filt").innerHTML = areas.map(function (a) { var n = a === "all" ? b.checks.length : b.checks.filter(function (c) { return c.s === a; }).length; return '<button type="button" data-f="' + a + '" class="' + (FILT === a ? "on" : "") + '">' + names[a] + " " + n + "</button>"; }).join("");
    var rows = b.checks.filter(function (c) { return FILT === "all" || c.s === FILT; });
    document.getElementById("ccount").textContent = "Showing " + rows.length + " of " + b.checks.length;
    document.getElementById("cbody").innerHTML = rows.map(function (c) { return "<tr><td>" + pill(c.s) + "</td><td><b>" + esc(c.name) + "</b><small>" + esc(c.area) + "</small></td><td>" + esc(c.found) + "</td></tr>"; }).join("");
  }
  app.addEventListener("click", function (e) { var f = e.target.closest("[data-f]"); if (f && B) { FILT = f.getAttribute("data-f"); checks(); } });

  function fetchIt() {
    var k = key();
    if (!k) return gate("No key on this device");
    if (loading) return; loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=crmaudit", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (x) {
        if (x[0] === 401) return gate("This key doesn't open the audit");
        if (!x[1].ok) return gate(x[1].error || "Nothing published yet");
        render(x[1].board);
      })
      .catch(function () { upd.textContent = "offline, retrying"; })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  btn.addEventListener("click", fetchIt);
  var kk = key(); if (kk && !/[?&]k=/.test(location.search)) history.replaceState(null, "", location.pathname + "?k=" + kk);
  fetchIt();
  setInterval(function () { if (B) upd.textContent = "checked " + ago(B.published); }, 30000);
  window.__auditRender = render;   // lets the local preview draw a board without the API
})();
