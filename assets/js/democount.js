/* builtbytyler.com/democount: Tyler's live demo count (2026-11-08, "a new live democount watch link that's hosted
 * off of the live website so I can view off any device").
 * Reads /api/hiring-board?doc=count with the private key from the link's # (same key as /run and /plan), published
 * every minute by leads/night/democount.py while a build runs. Tyler is colourblind: every mark carries its number
 * or label; Rep 2's line is dashed as well as orange.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh"),
      kpis = document.getElementById("kpis"), tip = document.getElementById("tip");
  var C = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", other: "#5e6888" };
  var REPC = [C.s1, C.s2, C.s3];
  var loading = false, B = null, seenFeed = {};

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
  function ago(iso) {
    if (!iso) return "never";
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? s + " s ago" : s < 3600 ? Math.floor(s / 60) + " min ago" : Math.floor(s / 3600) + " h " + Math.floor(s % 3600 / 60) + " min ago";
  }
  function clock(iso) { return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "–"; }
  function panel(cls, t, sub, body) {
    return '<section class="panel ' + cls + '"><div class="ph"><div><h2>' + esc(t) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div></div>" + body + "</section>";
  }

  /* ---------- tooltip ---------- */
  function showTip(e, html) {
    tip.innerHTML = html; tip.classList.add("on");
    var x = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.classList.remove("on"); }

  /* ---------- the demos publish: last one that landed, the one uploading now ---------- */
  function deployRow(b) {
    var d = b.deploy || {}, u = d.upload, st, pill;
    if (u && u.done) { pill = "&#10003; LANDED"; st = "Publish finished, pages going live now"; }
    else if (u && u.error && !u.seen) { pill = "&#10005; FAILED"; st = "Last publish failed after " + num(u.batches) + " upload batches; retrying"; }
    else if (u && u.seen) { pill = "&#9679; UPLOADING"; st = num(u.batches) + " upload batches sent, " + num(u.failed) + " failed, started " + clock(u.started) + (u.files ? ", " + num(u.files - (u.had || 0)) + " new files to send" : ""); }
    else { pill = "IDLE"; st = "No publish running"; }
    return '<div class="small" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px;padding:8px 10px;border:1px solid var(--edge2,rgba(160,180,255,.16));border-radius:10px">' +
      '<b style="font-family:JetBrains Mono,monospace;letter-spacing:.06em">' + pill + "</b><span>" + esc(st) + "</span>" +
      "<span>Last publish that landed: " + (d.last_at ? clock(d.last_at) + " " + new Date(d.last_at).toLocaleDateString([], { month: "short", day: "numeric" }) + " (" + num(d.last_sites) + " sites)" : "&#8211;") + "</span></div>";
  }

  /* ---------- reps: now, expected, target, cap ---------- */
  function reps(b) {
    var P = {}, PL = {}, PH = {}, pj0 = b.projection || {};
    ((pj0.mid || pj0).reps || []).forEach(function (r) { P[r.seat] = r.demos; });
    ((pj0.lo || {}).reps || []).forEach(function (r) { PL[r.seat] = r.demos; });
    ((pj0.hi || {}).reps || []).forEach(function (r) { PH[r.seat] = r.demos; });
    var rows = (b.reps || []).map(function (r) {
      var exp = P[r.seat] != null ? P[r.seat] : r.demos, top = Math.max(r.target, exp, r.demos, r.cap || 0) * 1.08;
      var w = function (n) { return (Math.min(n, top) / top * 100).toFixed(1) + "%"; };
      var left = Math.max(0, r.target - r.demos);
      return '<div class="reprow"><div class="h"><div><b>' + esc(r.label) + "</b><u>" + esc(r.area) + "</u></div>" +
        '<div class="n">' + num(r.demos) + "<small>of " + num(r.target) + "</small></div></div>" +
        '<div class="trk" role="img" aria-label="' + esc(r.label + ": " + r.demos + " demos now, about " + exp + " expected, target " + r.target) + '">' +
        (exp > r.demos ? '<i class="exp" style="width:' + w(exp) + '"></i>' : "") +
        '<i class="now" style="width:' + w(r.demos) + '"></i>' +
        '<em style="left:' + w(r.target) + '"></em><span style="left:' + w(r.target) + '">' + num(r.target) + "</span></div>" +
        '<div class="rl"><span><i class="k" style="background:' + C.s1 + '"></i>In their app now (page opens) <b>' + num(r.demos) + "</b></span>" +
        (r.publishing ? "<span>&#10227; " + num(r.publishing) + " more on the sheet, hidden until their page goes live</span>" : "") +
        (exp > r.demos ? '<span><i class="k" style="background:repeating-linear-gradient(135deg,rgba(57,135,229,.6) 0 3px,rgba(57,135,229,.2) 3px 6px);border:1px dashed #8fbaf0"></i>When today\'s builds finish and go live <b>~' + num(exp) + "</b>" + (PL[r.seat] != null && PH[r.seat] != null && PL[r.seat] !== PH[r.seat] ? " (likely " + num(PL[r.seat]) + "–" + num(PH[r.seat]) + ")" : "") + " estimate</span>" : "") +
        "<span>" + (left ? num(left) + " to go" : "✓ at " + num(r.target)) + "</span>" +
        (r.held_back ? "<span>" + num(r.held_back) + " held back (area code not on the registry list)</span>" : "") + "</div>" +
        (r.cap ? '<span class="capnote">MAX ' + num(r.cap) + " · extra goes to Rep 1</span>" : "") + "</div>";
    }).join("");
    var pj = b.projection || {};
    return panel("c8", "Each website rep", "Demos that open in each rep's app · white tick = " + num((b.reps[0] || {}).target || 500) + " goal",
      deployRow(b) + rows + '<p class="small" style="margin-top:10px">' + (pj.new ? "About " + num(pj.new) + " more demos expected (likely " + num((pj.lo || {}).new) + "–" + num((pj.hi || {}).new) + "). Worked out from each build's own pass rate so far, " + Math.round((pj.reach || 0.93) * 100) + "% of passed demos reaching a sheet (measured over the last 168), and " + (pj.keep_rate != null ? Math.round(pj.keep_rate * 100) + "% kept by the looks check (measured)" : "about 90% kept by the looks check (a guess until it has judged 10)") + ". " + num(pj.already_on_sheets || 0) + " from these builds are already on the sheets and counted above. New ones go to whichever rep has fewer, Rep 2 stopping at 500." : "No build running.") + "</p>");
  }

  /* ---------- history: demos on the sheets over time ---------- */
  function chart(b) {
    var H = (b.history || []).filter(function (h) { return h.reps; });
    var R = b.reps || [];
    if (H.length < 2) return panel("c4 half", "Over time", "Demos on each sheet", '<div class="empty">The line starts with the next update.</div>');
    var W = 760, Ht = 250, L = 44, Rt = 112, T = 18, Bm = 30;
    var t0 = new Date(H[0].at).getTime(), t1 = new Date(H[H.length - 1].at).getTime() || t0 + 1;
    var max = 0;
    H.forEach(function (h) { R.forEach(function (r) { max = Math.max(max, h.reps[r.seat] || 0); }); });
    R.forEach(function (r) { max = Math.max(max, r.target); });
    max = Math.ceil(max * 1.1 / 100) * 100 || 100;
    var X = function (t) { return L + (t - t0) / Math.max(1, t1 - t0) * (W - L - Rt); }, Y = function (v) { return T + (1 - v / max) * (Ht - T - Bm); };
    var g = "";
    for (var i = 0; i <= 4; i++) { var v = max * i / 4; g += '<line class="gl" x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + num(v) + "</text>"; }
    g += '<line x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(R[0] ? R[0].target : 500) + '" y2="' + Y(R[0] ? R[0].target : 500) + '" style="stroke:var(--tx)" stroke-width="1" stroke-dasharray="2 4" opacity=".5"/>';
    g += '<text class="ax" x="' + L + '" y="' + (Ht - 8) + '">' + esc(new Date(t0).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })) + "</text>";
    g += '<text class="ax" x="' + (W - Rt) + '" y="' + (Ht - 8) + '" text-anchor="end">' + esc(new Date(t1).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })) + "</text>";
    R.forEach(function (r, k) {
      var pts = H.map(function (h) { return X(new Date(h.at).getTime()).toFixed(1) + "," + Y(h.reps[r.seat] || 0).toFixed(1); });
      g += '<polyline fill="none" stroke="' + REPC[k] + '" stroke-width="2.4" ' + (k ? 'stroke-dasharray="7 5" ' : "") + 'points="' + pts.join(" ") + '"/>';
      var last = H[H.length - 1].reps[r.seat] || 0;
      g += '<text class="lbl" x="' + (W - Rt + 8) + '" y="' + (Y(last) + 4 + (k ? 12 : -4)) + '">' + esc(r.label.replace("Website ", "")) + " " + num(last) + "</text>";
    });
    g += '<rect class="hit" id="hhit" x="' + L + '" y="' + T + '" width="' + (W - L - Rt) + '" height="' + (Ht - T - Bm) + '"/>';
    var key = R.map(function (r, k) { return '<span><i style="background:' + REPC[k] + '"></i>' + esc(r.label) + (k ? " (dashed)" : " (solid)") + "</span>"; }).join("");
    setTimeout(function () {
      var hit = $("hhit"); if (!hit) return;
      hit.addEventListener("mousemove", function (e) {
        var bx = hit.getBoundingClientRect(), f = (e.clientX - bx.left) / bx.width, t = t0 + f * (t1 - t0), best = H[0];
        H.forEach(function (h) { if (Math.abs(new Date(h.at).getTime() - t) < Math.abs(new Date(best.at).getTime() - t)) best = h; });
        showTip(e, "<b>" + esc(new Date(best.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })) + "</b>" +
          R.map(function (r, k) { return '<div><span><i style="background:' + REPC[k] + '"></i>' + esc(r.label) + "</span><span>" + num(best.reps[r.seat] || 0) + "</span></div>"; }).join(""));
      });
      hit.addEventListener("mouseleave", hideTip);
    }, 0);
    return panel("c4 half", "Over time", "Demos on each sheet · dotted line = goal",
      '<div class="key" style="margin-bottom:8px">' + key + '</div><div class="scx sm"><svg viewBox="0 0 ' + W + " " + Ht + '" role="img" aria-label="Demos on each rep\'s sheet over time">' + g + "</svg></div>");
  }

  /* ---------- builds ---------- */
  function builds(b) {
    var U = b.runs || [];
    if (!U.length) return "";
    var rows = U.slice().reverse().map(function (u) {
      var st = u.stage === "done" ? '<span class="pill done">✓ DONE</span>' : u.stage === "publishing" ? '<span class="pill run">● PUBLISHING</span>' : '<span class="pill run">● BUILDING</span>';
      return "<tr" + (u.stage === "done" ? ' class="q"' : "") + "><td><b>" + esc(u.label) + "</b></td><td>" + st + '</td><td class="num">' + num(u.total) +
        '</td><td class="num">' + num(u.passed) + '</td><td class="num">' + num(u.failed) + '</td><td class="num">' + num(u.building) + '</td><td class="num">' + num(u.left) +
        '</td><td class="num">' + (u.pass_rate == null ? "–" : Math.round(u.pass_rate * 100) + "%") + '</td><td class="num">' + (u.stage === "done" ? "–" : num(u.per_hour) + "/h") +
        '</td><td class="num">' + (u.stage === "building" && u.eta ? "~" + clock(u.eta) : u.stage === "done" ? "finished" : "–") + "</td></tr>";
    }).join("");
    return panel("c12", "Builds", "Every build from the last 36 hours · a passed demo goes on a sheet once the looks check keeps it",
      '<div class="tw"><table><thead><tr><th>Build</th><th>Status</th><th>Businesses</th><th>Passed</th><th>Didn\'t pass</th><th>Building</th><th>Left</th><th>Pass rate</th><th>Pace</th><th>Done by</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="small" style="margin-top:10px">"Didn\'t pass" = the honesty check (no invented claims, reviews word for word) or too few usable photos after 3 tries. Done-by times are estimates at the pace so far.</p>');
  }

  /* ---------- looks check ---------- */
  function looksPanel(b) {
    var L = b.looks; if (!L || !L.required) return "";
    var tot = (L.kept || 0) + (L.cut || 0) + (L.waiting || 0);
    var bar = tot ? '<div class="gbar" role="img" aria-label="' + esc(L.kept + " kept, " + L.cut + " cut, " + L.waiting + " waiting") + '">' +
      (L.kept ? '<i style="flex:' + L.kept + ';background:' + C.s1 + '"><s>' + num(L.kept) + "</s></i>" : "") +
      (L.cut ? '<i style="flex:' + L.cut + ';background:' + C.s2 + '"><s>' + num(L.cut) + "</s></i>" : "") +
      (L.waiting ? '<i style="flex:' + L.waiting + ';background:' + C.other + '"><s>' + num(L.waiting) + "</s></i>" : "") + "</div>" : "";
    var leg = '<div class="gleg"><span><i style="background:' + C.s1 + '"></i>✓ Kept<b>' + num(L.kept) + '</b></span><span><i style="background:' + C.s2 + '"></i>✕ Cut<b>' + num(L.cut) +
      '</b></span><span><i style="background:' + C.other + '"></i>Waiting<b>' + num(L.waiting) + "</b></span></div>";
    var cuts = (L.cuts || []).map(function (c) { return "<tr><td><b>" + esc(c.name) + '</b></td><td style="white-space:normal;text-align:left;color:var(--mu)">' + esc(c.why) + "</td></tr>"; }).join("");
    return panel("c12", "Looks check", "Every rebuilt demo is looked at before it can go on a sheet · bad-looking ones are cut",
      bar + leg + (cuts ? '<div class="tw" style="margin-top:12px"><table style="min-width:0"><thead><tr><th>Cut</th><th style="text-align:left">Why</th></tr></thead><tbody>' + cuts + "</tbody></table></div>" : '<p class="small" style="margin-top:10px">Nothing cut yet.</p>') +
      '<p class="small" style="margin-top:10px">Cut if the top photo is blurry, stretched, too dark or not their work, the layout is broken, or the phone view is broken. Plain pages are kept. Claude looks at three screenshots of each page (top, middle, phone).</p>');
  }

  /* ---------- live panel ---------- */
  function live(b) {
    var U = (b.runs || []).filter(function (u) { return u.stage !== "done"; });
    var A = b.runs || [];
    var sum = function (L, k) { return L.reduce(function (a, u) { return a + (u[k] || 0); }, 0); };
    $("bn").textContent = num(b.total);
    $("bs").textContent = "of " + num(b.target) + " (500 each) · " + (b.reps || []).map(function (r) { return r.label.replace("Website ", "") + " " + num(r.demos); }).join(" · ");
    var on = U.length > 0;
    $("pill").className = "livepill" + (on ? " on" : "");
    $("pillt").textContent = on ? (U.some(function (u) { return u.stage === "building"; }) ? "BUILDING" : "PUBLISHING") : "IDLE";
    $("lvh").textContent = on ? U.length + (U.length === 1 ? " build running" : " builds running") : "Nothing building right now";
    $("lvs").textContent = on ? U.map(function (u) { return u.label + (u.stage === "building" && u.eta ? " · done ~" + clock(u.eta) : u.stage === "publishing" ? " · putting demos on the sheets" : ""); }).join("  ·  ") : "Today's demos are on the sheets.";
    var T = sum(U, "total"), D = sum(U, "passed") + sum(U, "failed");
    $("bar").className = "bar1" + (on ? " on" : "");
    $("bar").firstChild.style.width = (T ? D / T * 100 : 100).toFixed(1) + "%";
    $("prog").textContent = on ? num(D) + " of " + num(T) + " businesses checked (" + (T ? Math.round(D / T * 100) : 0) + "%) · " + num(Math.round(sum(U, "passed_per_hour"))) + " new demos an hour" : "";
    var S = on ? U : A;
    $("cp").textContent = num(sum(S, "passed")); $("cb").textContent = num(sum(S, "building"));
    $("cf").textContent = num(sum(S, "failed")); $("cl").textContent = num(sum(S, "left"));
    var feed = [];
    U.forEach(function (u) { (u.recent || []).forEach(function (n) { feed.push("✓ " + n + " · passed"); }); });
    if (!feed.length) A.forEach(function (u) { (u.recent || []).forEach(function (n) { feed.push("✓ " + n + " · passed"); }); });
    var f = $("feed");
    f.innerHTML = feed.slice(0, 8).map(function (t) { var n = !seenFeed[t]; seenFeed[t] = 1; return "<div" + (n ? ' class="new"' : "") + ">" + esc(t) + "</div>"; }).join("") || "<div>no passes yet</div>";
  }
  function tick() {
    $("clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    if (!B) return;
    var newest = (B.runs || []).filter(function (u) { return u.stage !== "done"; }).map(function (u) { return u.last_write; }).sort().pop();
    $("beat").innerHTML = newest ? "last build step <b>" + esc(ago(newest)) + "</b>" : "numbers from <b>" + esc(ago(B.updated)) + "</b>";
    upd.textContent = "updated " + ago(B.updated);
  }

  function render(b) {
    B = b;
    var pj = b.projection || {}, U = (b.runs || []).filter(function (u) { return u.stage !== "done"; });
    var kp = function (u, v, chip) { return '<div class="kpi"><u>' + esc(u) + "</u><b>" + v + "</b>" + (chip ? '<span class="chip">' + esc(chip) + "</span>" : "") + "</div>"; };
    kpis.innerHTML = kp("On the sheets", num(b.total), "of " + num(b.target)) +
      kp("Looks check", num((b.looks || {}).kept || 0) + " ✓ · " + num((b.looks || {}).cut || 0) + " ✕", num((b.looks || {}).waiting || 0) + " waiting") +
      kp("When builds finish", "~" + num((b.total || 0) + (pj.new || 0)), "likely " + num((b.total || 0) + ((pj.lo || {}).new || 0)) + "–" + num((b.total || 0) + ((pj.hi || {}).new || 0)));
    live(b);
    app.innerHTML = '<div class="g">' + reps(b) + chart(b) + "</div>" + '<div class="g">' + looksPanel(b) + "</div>" + '<div class="g">' + builds(b) + "</div>";
    tick();
  }

  function gate(t, s) { app.innerHTML = '<div class="panel gate"><b>' + esc(t) + "</b>" + esc(s) + "</div>"; }

  function refresh() {
    var k = key();
    if (!k) { gate("Open this from your text", "This page only opens from the link Claude texted you."); upd.textContent = ""; return; }
    if (loading) return;
    loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=count", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 401) return gate("Link not recognised", "Open the newest link Claude texted you.");
        if (!x.j.ok) return gate("Nothing yet", "The first numbers arrive within a minute.");
        render(x.j.board);
      })
      .catch(function () { upd.textContent = "offline · showing the last numbers"; })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  btn.addEventListener("click", refresh);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  addEventListener("scroll", hideTip, { passive: true });
  setInterval(tick, 1000);
  setInterval(function () { if (!document.hidden) refresh(); }, 30000);
  refresh();
})();
