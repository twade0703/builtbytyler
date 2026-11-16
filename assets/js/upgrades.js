/* builtbytyler.com/upgrades: Tyler's live tracker for the 2026-11-15 upgrade of every old-format demo on the two
 * website sheets to the new (atelier) design ("a live tracker for status of all upgrades complete and an overview of
 * the system to watch").
 * Reads /api/hiring-board?doc=upgrade with the private key from the link's # (same key as /democount), published
 * every 2 minutes by leads/night/upgrade_board.py. Tyler is colourblind: every mark carries its number or a word;
 * "kept old page" is hatched as well as orange.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh"),
      kpis = document.getElementById("kpis"), tip = document.getElementById("tip");
  var C = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", other: "#5e6888" };
  var loading = false, B = null, seen = {};

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function key() {
    var m = /[#&]k=([A-Za-z0-9_-]{24,})/.exec(location.hash || "");
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null ? "–" : Number(n).toLocaleString("en-US"); }
  function $(id) { return document.getElementById(id); }
  function pct(a, b) { return b ? Math.round(100 * a / b) + "%" : "–"; }
  function ago(iso) {
    if (!iso) return "never";
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? s + " s ago" : s < 3600 ? Math.floor(s / 60) + " min ago" : Math.floor(s / 3600) + " h " + Math.floor(s % 3600 / 60) + " min ago";
  }
  function clock(iso) { return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "–"; }
  function when(iso) { return iso ? new Date(iso).toLocaleDateString([], { weekday: "short" }) + " " + clock(iso) : "–"; }
  function panel(cls, t, sub, body) {
    return '<section class="panel ' + cls + '"><div class="ph"><div><h2>' + esc(t) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div></div>" + body + "</section>";
  }
  function showTip(e, html) {
    tip.innerHTML = html; tip.classList.add("on");
    var x = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.classList.remove("on"); }
  addEventListener("scroll", hideTip, { passive: true });

  /* ---------- per hour: upgraded (blue) and kept old (orange, hatched), value on every bar ---------- */
  function hours(b) {
    var H = (b.hours || []).slice(-24);
    if (!H.length) return '<div class="empty">The first results land about 10 minutes after the start.</div>';
    var W = 760, Ht = 240, L = 34, R = 10, T = 22, Bm = 34, iw = W - L - R, ih = Ht - T - Bm;
    var mx = 1; H.forEach(function (h) { mx = Math.max(mx, h.pass, h.fail); });
    mx = Math.ceil(mx / 5) * 5 || 5;
    var gw = iw / H.length, bw = Math.max(4, Math.min(22, gw / 2 - 3)), y = function (v) { return T + ih - ih * v / mx; };
    var s = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="' + C.s2 + '" opacity=".45"/><rect width="3" height="6" fill="' + C.s2 + '"/></pattern></defs>';
    for (var g = 0; g <= 4; g++) { var gv = mx * g / 4, gy = y(gv); s += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="ax" x="' + (L - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + Math.round(gv) + "</text>"; }
    H.forEach(function (h, i) {
      var x0 = L + i * gw + gw / 2 - bw - 1, x1 = x0 + bw + 2;
      s += '<rect x="' + x0 + '" y="' + y(h.pass) + '" width="' + bw + '" height="' + (T + ih - y(h.pass)) + '" fill="' + C.s1 + '" rx="2"/>';
      s += '<rect x="' + x1 + '" y="' + y(h.fail) + '" width="' + bw + '" height="' + (T + ih - y(h.fail)) + '" fill="url(#hatch)" rx="2"/>';
      if (h.pass) s += '<text class="lbl" x="' + (x0 + bw / 2) + '" y="' + (y(h.pass) - 4) + '" text-anchor="middle">' + h.pass + "</text>";
      if (h.fail) s += '<text class="lblm" x="' + (x1 + bw / 2) + '" y="' + (y(h.fail) - 4) + '" text-anchor="middle">' + h.fail + "</text>";
      if (H.length <= 12 || i % 2 === 0) s += '<text class="ax" x="' + (L + i * gw + gw / 2) + '" y="' + (Ht - 12) + '" text-anchor="middle">' + esc(new Date(h.t).toLocaleTimeString([], { hour: "numeric" })) + "</text>";
      s += '<rect class="hit" data-i="' + i + '" x="' + (L + i * gw) + '" y="' + T + '" width="' + gw + '" height="' + ih + '"/>';
    });
    return '<div class="key" style="margin-bottom:8px"><span><i style="background:' + C.s1 + '"></i>Upgraded</span><span><i style="background:repeating-linear-gradient(135deg,' + C.s2 + ' 0 3px,rgba(217,89,38,.4) 3px 6px)"></i>Kept old page (hatched)</span></div>' +
      '<div class="scx"><svg id="hrs" viewBox="0 0 ' + W + " " + Ht + '" role="img" aria-label="Upgrades per hour">' + s + "</svg></div>";
  }
  function bindHours(b) {
    var sv = $("hrs"); if (!sv) return;
    var H = (b.hours || []).slice(-24);
    sv.addEventListener("mousemove", function (e) {
      var t = e.target.closest ? e.target.closest(".hit") : null; if (!t) return hideTip();
      var h = H[+t.getAttribute("data-i")];
      showTip(e, "<b>" + esc(new Date(h.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + " hour</b><div><span><i style=\"background:" + C.s1 + "\"></i>Upgraded</span>" + h.pass + "</div><div><span><i style=\"background:" + C.s2 + "\"></i>Kept old</span>" + h.fail + "</div>");
    });
    sv.addEventListener("mouseleave", hideTip);
  }

  /* ---------- where everything went (donut, every slice labelled in the legend) ---------- */
  function donut(b) {
    var parts = [["Upgraded", b.passed, C.s1, "On the new design, honesty review passed"], ["Kept old page", b.failed, C.s2, "New page didn't pass, so the old one stays up"],
                 ["Building now", b.building, C.s3, "Being rebuilt and reviewed right now"], ["Waiting", b.queued, C.other, "Still on the old design, in line"]];
    var tot = b.total || 1, r = 74, cx = 100, cy = 100, circ = 2 * Math.PI * r, off = 0, s = "";
    parts.forEach(function (p) {
      if (!p[1]) return;
      var len = circ * p[1] / tot, gap = Math.min(2.5, len / 2);
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + p[2] + '" stroke-width="22" stroke-dasharray="' + Math.max(0.5, len - gap) + " " + (circ - len + gap) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + " " + cy + ')"/>';
      off += len;
    });
    s += '<text x="100" y="98" text-anchor="middle" style="fill:var(--tx);font:600 30px JetBrains Mono,monospace">' + num(b.total) + '</text><text x="100" y="120" text-anchor="middle" class="ax">OLD DEMOS</text>';
    return '<div class="dwrap"><svg id="donut" viewBox="0 0 200 200" role="img" aria-label="Where the old demos are">' + s + '</svg><div class="leg">' +
      parts.map(function (p) { return '<div><i style="background:' + p[2] + '"></i><span>' + esc(p[0]) + "</span><b>" + num(p[1]) + "</b><em>" + pct(p[1], b.total) + "</em><small>" + esc(p[3]) + "</small></div>"; }).join("") + "</div></div>";
  }

  /* ---------- each rep's sheet ---------- */
  function reps(b) {
    return (b.reps || []).map(function (r) {
      var w = function (n) { return r.total ? (100 * n / r.total) + "%" : "0"; };
      return '<div class="reprow"><div class="h"><div><b>' + esc(r.label) + "</b><u>" + num(r.total) + ' old demos on the sheet</u></div><div class="n">' + num(r.pass) + "<small>of " + num(r.total) + "</small></div></div>" +
        '<div class="stack"><i class="p" style="width:' + w(r.pass) + '"></i><i class="b" style="width:' + w(r.building) + '"></i><i class="f" style="width:' + w(r.fail) + '"></i></div>' +
        '<div class="rl"><span><i class="k" style="background:' + C.s1 + '"></i>Upgraded <b>' + num(r.pass) + '</b></span><span><i class="k" style="background:' + C.s3 + '"></i>Building <b>' + num(r.building) + '</b></span><span><i class="k" style="background:' + C.s2 + '"></i>Kept old <b>' + num(r.fail) + "</b></span><span>Waiting <b>" + num(r.queued) + "</b></span></div></div>";
    }).join("");
  }

  /* ---------- all 1,172 demos on both sheets, against the whole ---------- */
  function whole(b) {
    var T = b.sheets_total || 0, A = b.already_new || 0, P = b.passed || 0, O = T - A - P;
    var row = function (l, n, note) { return '<div class="pr"><div class="h">' + esc(l) + "<span>" + num(n) + " · " + pct(n, T) + '</span></div><div class="t"><i style="width:' + (T ? 100 * n / T : 0) + '%"></i></div><p>' + esc(note) + "</p></div>"; };
    return row("On the new design now", A + P, "Already new before tonight (" + num(A) + ") plus upgraded tonight (" + num(P) + ")") +
      row("Still on the old design", O, "Waiting, building, or kept because the new page didn't pass") +
      '<p class="small" style="margin-top:8px">Both website sheets together: ' + num(T) + " demos (586 each).</p>";
  }

  function reasons(b) {
    var R = b.reasons || [];
    if (!R.length) return '<div class="empty">None so far.</div>';
    var tot = 0; R.forEach(function (r) { tot += r.n; });
    return '<div class="rows">' + R.map(function (r) { return '<div class="r"><span class="pill fail">&#10005;</span><span>' + esc(r.why) + "</span><b>" + num(r.n) + "</b></div>"; }).join("") +
      '</div><p class="small" style="margin-top:10px">Every one of these keeps its old page exactly as it was. Nothing half-built reaches a rep.</p>';
  }

  function recent(b) {
    var R = b.recent || [];
    if (!R.length) return '<div class="empty">No finished businesses yet.</div>';
    return '<div class="tw"><table><thead><tr><th>Business</th><th>Result</th><th>Live</th><th>Finished</th></tr></thead><tbody>' +
      R.map(function (r) {
        return "<tr><td>" + esc(r.name) + "</td><td>" + (r.state === "pass" ? '<span class="pill done">&#10003; UPGRADED</span>' : '<span class="pill fail">&#10005; KEPT OLD</span> <span class="small">' + esc(r.why) + "</span>") +
          '</td><td class="num">' + (r.state === "pass" ? (r.live ? "&#10003; live" : "next publish") : "–") + '</td><td class="num">' + esc(clock(r.at)) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function nowList(b) {
    var N = b.now || [];
    var d = b.deploy || {}, rl = d.run_last;
    return (N.length ? '<div class="rows">' + N.map(function (n) { return '<div class="r"><span class="pill run">&#9679;</span><span>' + esc(n.name) + "</span><small>" + esc(ago(n.since)) + "</small></div>"; }).join("") + "</div>" : '<div class="empty">Nothing building.</div>') +
      '<div class="stock"><div><b>' + (rl ? clock(rl.at) : "–") + "</b><u>Last publish from this run" + (rl ? " (" + (rl.exit === 0 ? "&#10003; ok" : "&#10005; failed") + ")" : "") + '</u></div><div><b>' + num(b.live) + "</b><u>Upgraded and live on see.builtbytyler.com</u></div></div>";
  }

  function overview() {
    var steps = [["1 · Find", "Every demo on Website Rep 1's and Rep 2's sheets still on the old v3 page (583 of 1,172)."],
                 ["2 · Rewrite", "An Opus agent writes the new page's words from the business's own Google listing and reviews, and picks a photo per service."],
                 ["3 · Build", "The new design is generated: their own landing photo full width, services, work, reviews word for word."],
                 ["4 · Review", "An independent reviewer checks every claim against the raw evidence. Findings go back to be fixed, up to 5 rounds."],
                 ["5 · Publish", "Passed pages go live every 25 upgrades at the same link. A page that never passes keeps its old version, tidied: long reviews fold, small photos show at their real size."]];
    return '<div class="flow">' + steps.map(function (s) { return "<div><b>" + esc(s[0]) + "</b><p>" + esc(s[1]) + "</p></div>"; }).join("") + "</div>" +
      '<p class="small" style="margin-top:12px">Same businesses, same links, same sheets: the reps see the new page the next time they open the demo. Runs on your PC; if it stops, the System check above turns orange.</p>';
  }

  function changes(b) {
    var C = b.changes; if (!C) return "";
    var L = function (x) { return (x || []).map(function (e) { return '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.name) + " &#8599;</a>"; }).join(""); };
    return '<div class="chg">' + (C.items || []).map(function (c) {
      return '<div class="ci"><span class="pill ' + (c.ok ? "done" : "q") + '">' + (c.ok ? "&#10003; DONE" : "&#9679; OPEN") + "</span><div><b>" + esc(c.t) + "</b><p>" + esc(c.d) + "</p></div><small>" + esc(c.at) + "</small></div>";
    }).join("") + "</div>" +
      '<div class="exs"><div><u>On the new design (open one)</u>' + L(C.new_examples) + "</div><div><u>Tidied, still old design</u>" + L(C.tidied_examples) + "</div></div>";
  }

  function kpi(l, v, chip) { return '<div class="kpi"><u>' + esc(l) + "</u><b>" + v + "</b>" + (chip ? '<span class="chip">' + chip + "</span>" : "") + "</div>"; }

  function render(b) {
    B = b;
    var done = b.passed + b.failed, fin = !!b.finished;
    upd.textContent = "updated " + ago(b.updated);
    kpis.innerHTML = kpi("Upgraded", num(b.passed), "of " + num(b.total)) + kpi("Kept old page", num(b.failed)) +
      kpi("Pace", done >= 5 ? (b.per_hour || 0) + "/h" : "–", done >= 5 ? num(b.passed_per_hour) + " upgraded/h" : "measuring") +
      kpi("Finish (estimate)", fin ? "done" : done >= 5 && b.eta ? when(b.eta) : "measuring…");   // one result is too few to time
    $("bn").textContent = num(b.passed);
    $("bs").textContent = "of " + num(b.total) + " old demos · " + (b.pass_rate != null ? Math.round(b.pass_rate * 100) + "% pass the review" : "pass rate after the first few");
    var on = !fin && (b.checks || [])[0] && b.checks[0].ok;
    $("pill").className = "livepill" + (on ? " on" : "");
    $("pillt").textContent = fin ? "✓ FINISHED" : on ? "WORKING" : "✕ STOPPED";
    $("lvh").textContent = fin ? "All done" : (b.now && b.now[0] ? b.now[0].name : "Starting…");
    $("lvs").textContent = fin ? "Finished " + when(b.finished) : num(b.building) + " businesses being rebuilt and reviewed at once";
    $("bar").className = "bar1" + (on ? " on" : "");
    $("bar").firstChild.style.width = (b.total ? 100 * done / b.total : 0) + "%";
    $("prog").textContent = num(done) + " of " + num(b.total) + " finished (" + pct(done, b.total) + ") · started " + when(b.started);
    $("cp").textContent = num(b.passed); $("cb").textContent = num(b.building); $("cf").textContent = num(b.failed); $("cl").textContent = num(b.queued);
    var F = b.feed || [];
    $("feed").innerHTML = F.map(function (l) { var n = !seen[l]; seen[l] = 1; return '<div class="' + (n ? "new" : "") + '">' + esc(l) + "</div>"; }).join("");
    $("chk").innerHTML = "<b>System check</b>" + (b.checks || []).map(function (c) { return '<span class="' + (c.ok ? "ok" : "bad") + '">' + (c.ok ? "&#10003; " : "&#9888; ") + esc(c.t) + "</span>"; }).join("");
    app.innerHTML = (b.changes ? '<div class="g">' + panel("c12", "What changed", "newest first · open the links to see the pages", changes(b)) + "</div>" : "") +
      '<div class="g">' + panel("c8", "Upgrades per hour", "measured, last 24 hours", hours(b)) + panel("c4", "Where the old demos are", "all " + num(b.total) + " old demos", donut(b)) + "</div>" +
      '<div class="g">' + panel("c4 half", "Each rep's sheet", "old demos on each sheet", reps(b)) + panel("c4 half", "Both sheets, whole", "out of all 1,172 demos", whole(b)) + panel("c4", "Why some kept the old page", "kept old: " + num(b.failed), reasons(b)) + "</div>" +
      '<div class="g">' + panel("c8", "Latest results", "newest first", recent(b)) + panel("c4", "Building now", "and publishing", nowList(b)) + "</div>" +
      '<div class="g">' + panel("c12", "How the upgrade works", "the system you're watching", overview()) + "</div>";
    bindHours(b);
  }

  function tick() {
    if (B) { $("clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }); $("beat").textContent = "last step " + ago(B.beat) + " · numbers " + ago(B.updated); upd.textContent = "updated " + ago(B.updated); }
  }
  setInterval(tick, 1000);

  function gate(msg) { app.innerHTML = '<section class="panel gate"><b>' + esc(msg) + "</b>Open this page from the link Tyler was sent (the private key is after the #).</section>"; }

  function fetchIt() {
    var k = key();
    if (!k) return gate("No key on this device");
    if (loading) return; loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=upgrade", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (x) {
        if (x[0] === 401) return gate("This key doesn't open the tracker");
        if (!x[1].ok) return gate(x[1].error || "Nothing published yet");
        render(x[1].board); tick();
      })
      .catch(function () { upd.textContent = "offline, retrying"; })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  btn.addEventListener("click", fetchIt);
  if (location.hash) history.replaceState(null, "", location.pathname);
  fetchIt();
  setInterval(fetchIt, 30000);
})();
