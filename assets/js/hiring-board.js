/* builtbytyler.com/hiring: Tyler's live applicant board (2026-10-25; dashboard redesign 2026-10-26).
 *
 * Tyler: "one text with a link to a live Built by Tyler page that tracks all of my application statuses",
 * then "make sure you update that link I have for watching the amount of applications on my phone too",
 * after the /run dashboard became his standard (skill bbt-dashboard): KPI strip, the live sphere, a time
 * chart, a donut, progress rows, a gauge, grouped bars, the list. Colourblind-safe: blue #3987e5, orange
 * #d95926, aqua #199e70, grey; every mark labelled; tiers carry a word and a symbol, never colour alone.
 *
 * Data: /api/hiring-board (hiring_store.py publish on Tyler's PC, after every 3-hour Indeed check). The key
 * comes from the link's #k=... and is kept in this browser. Totals count everyone who applied, rejected
 * included (Tyler, 2026-10-26: "Shows 39 but I was told we have 41"); rejected people list last.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k", TAB_STORE = "bbt-hire-tab";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh"),
      kpis = document.getElementById("kpis"), tip = document.getElementById("tip");
  var C = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", other: "#5e6888" };
  var TIER = {
    top: ["✓ TOP", "top", 0], strong: ["✓ STRONG", "top", 1], "new": ["○ NOT RANKED", "new", 2],
    maybe: ["? MAYBE", "maybe", 3], unlikely: ["– UNLIKELY", "low", 4], cant: ["✕ CAN'T HIRE", "low", 5]
  };
  var ROLE = { websites: { t: "Websites", n: "Rep 1", c: C.s1 }, ai: { t: "AI Receptionist", n: "Rep 2", c: C.s3 } };
  var board = null, open = null, openRes = {}, tab = "websites", loading = false, lastTotal = null;

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  tab = load(TAB_STORE) === "ai" ? "ai" : "websites";
  function key() {
    var m = /[#&]k=([A-Za-z0-9_-]{24,})/.exec(location.hash || "");
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null ? "–" : Number(n).toLocaleString("en-US"); }
  function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "–"; }
  function t(s) { var v = Date.parse(s); return isFinite(v) ? v : 0; }
  function ago(s) {
    var m = (Date.now() - t(s)) / 6e4;
    if (!t(s)) return "";
    if (m < 1) return "just now";
    if (m < 60) return Math.round(m) + " min ago";
    if (m < 1440) return Math.round(m / 60) + " h ago";
    return Math.round(m / 1440) + " d ago";
  }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function day(d) { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function good(p) { return p.tier === "top" || p.tier === "strong"; }
  function everyone(role) { return (board ? board.people : []).filter(function (p) { return !role || p.role === role; }); }
  function active(role) { return everyone(role).filter(function (p) { return !p.rejected; }); }
  function tierOf(p) { return TIER[p.tier] || TIER["new"]; }

  /* ---------- tooltip ---------- */
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.classList.add("on");
    var w = tip.offsetWidth, h = tip.offsetHeight, px = x + 14, py = y - h - 12;
    if (px + w > innerWidth - 8) px = x - w - 14;
    if (py < 8) py = y + 16;
    tip.style.left = px + "px"; tip.style.top = py + "px";
  }
  function hideTip() { tip.classList.remove("on"); }
  function row(color, label, val) { return "<div><span><i style=\"background:" + color + "\"></i>" + esc(label) + "</span><b style=\"color:#EEF1FA;margin:0\">" + esc(val) + "</b></div>"; }
  function panel(cls, title, sub, right, body) {
    return '<section class="panel ' + cls + '"><div class="ph"><div><h2>' + esc(title) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>" + (right || "") + "</div>" + body + "</section>";
  }

  /* ---------- the sphere: applications coming in (same Orb as /run) ---------- */
  var Orb = (function () {
    var cv = document.getElementById("orb");
    if (!cv || !cv.getContext) return { set: function () {}, burst: function () {} };
    var ctx = cv.getContext("2d"), N = 900, P = [], mode = "idle", w = 0, h = 0, rings = [], t0 = performance.now();
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
      P.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, ch: Math.random() < 0.5 ? "0" : "1", hot: 0, ph: Math.random() * 6.283 });
    }
    function fit() {
      var d = Math.min(2, window.devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.max(1, w * d); cv.height = Math.max(1, h * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    addEventListener("resize", fit); fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(cv);    // re-measure once the page has laid out
    var L = [];
    function frame(now) {
      if (cv.clientWidth !== w || cv.clientHeight !== h) fit();
      var tt = (now - t0) / 1000, run = mode === "run", wait = mode === "wait";
      var spin = run ? 0.32 : wait ? 0.12 : 0.05, ripple = run ? 0.11 : wait ? 0.05 : 0.025, flip = run ? 0.025 : wait ? 0.006 : 0.0015;
      var ay = tt * spin, ax = 0.35 * Math.sin(tt * 0.17), cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      var X = w / 2, Y = h / 2, R = Math.min(w, h) * 0.36;
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createRadialGradient(X, Y, R * 0.05, X, Y, R * 1.45);
      g.addColorStop(0, run ? "rgba(57,135,229,.30)" : "rgba(94,104,136,.14)"); g.addColorStop(1, "rgba(7,10,20,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      L.length = 0;
      for (var i = 0; i < N; i++) {
        var p = P[i], m = 1 + ripple * Math.sin(tt * 1.7 + p.ph + p.y * 4) + (run ? 0.05 * Math.sin(tt * 0.9 + p.x * 5 + p.z * 3) : 0);
        var x = p.x * m, y = p.y * m, z = p.z * m, x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        if (!still && Math.random() < flip) { p.ch = p.ch === "0" ? "1" : "0"; p.hot = 1; }
        p.hot *= 0.93;
        L.push({ sx: X + x1 * R, sy: Y + y1 * R, d: (z2 + 1.25) / 2.5, p: p });
      }
      L.sort(function (a, b) { return a.d - b.d; });
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (var j = 0; j < L.length; j++) {
        var q = L[j], sz = 6 + q.d * 9, a = 0.08 + q.d * 0.9, hot = q.p.hot;
        ctx.font = "600 " + sz.toFixed(1) + "px JetBrains Mono, monospace";
        if (run || wait) {
          var rr = Math.round(57 + 181 * hot), gg = Math.round(135 + 106 * hot), bb = Math.round(229 + 21 * hot);
          ctx.fillStyle = "rgba(" + rr + "," + gg + "," + bb + "," + Math.min(1, a + hot * 0.4).toFixed(3) + ")";
        } else ctx.fillStyle = "rgba(151,160,189," + (a * 0.7).toFixed(3) + ")";
        ctx.fillText(q.p.ch, q.sx, q.sy);
      }
      for (var k = rings.length - 1; k >= 0; k--) {
        var age = (now - rings[k]) / 1400;
        if (age > 1) { rings.splice(k, 1); continue; }
        if (age < 0) continue;
        ctx.beginPath(); ctx.arc(X, Y, R * (0.9 + age * 0.75), 0, 6.2832);
        ctx.strokeStyle = "rgba(57,135,229," + (0.75 * (1 - age)).toFixed(3) + ")"; ctx.lineWidth = 2.5 * (1 - age) + 0.5; ctx.stroke();
      }
      if (!still) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return {
      set: function (m) { if (m !== mode) { mode = m; if (still) requestAnimationFrame(frame); } },
      burst: function (n) { var now = performance.now(); for (var i = 0; i < Math.min(3, n || 1); i++) rings.push(now + i * 260); for (var j = 0; j < 160; j++) P[(Math.random() * N) | 0].hot = 1; }
    };
  })();
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function live() {
    var all = everyone(), dayAgo = Date.now() - 864e5, recent = all.filter(function (p) { return t(p.applied) > dayAgo; });
    var openWin = Date.now() <= t((board.ends || "") + "T23:59:59");
    Orb.set(recent.length ? "run" : openWin ? "wait" : "idle");
    if (lastTotal != null && all.length > lastTotal) Orb.burst(all.length - lastTotal);
    lastTotal = all.length;
    var pill = document.getElementById("lvpill"); if (pill) pill.className = "livepill" + (openWin ? " on" : "");
    setText("lvstate", openWin ? "TAKING APPLICATIONS" : "POSTS CLOSED");
    setText("orbn", num(all.length)); setText("orbl", "APPLICANTS");
    var newest = all.slice().sort(function (a, b) { return t(b.applied) - t(a.applied); })[0];
    setText("lvcity", newest ? "Newest: " + newest.name : "No applicants yet");
    setText("lvstage", newest ? (ROLE[newest.role] || { t: newest.role }).t + " · " + tierOf(newest)[0].replace(/^\S+\s/, "") + " · applied " + ago(newest.applied) : "");
    var p0 = t(board.posted), p1 = t((board.ends || "") + "T23:59:59"), f = p1 > p0 ? Math.max(0, Math.min(1, (Date.now() - p0) / (p1 - p0))) : 0;
    var bar = document.getElementById("lvbar"); if (bar) { bar.className = "bar1" + (openWin ? " on" : ""); bar.firstChild.style.width = (f * 100).toFixed(1) + "%"; }
    var dleft = Math.max(0, Math.ceil((p1 - Date.now()) / 864e5));
    setText("lvprog", openWin ? "Indeed posts: day " + Math.max(1, Math.ceil((Date.now() - p0) / 864e5)) + " of " + Math.round((p1 - p0) / 864e5) + " · " + dleft + " days left (ends " + day(board.ends) + ")" : "The posts ended " + day(board.ends));
    var hrs = Math.max(1, (Date.now() - p0) / 36e5);
    setText("lvf", num(recent.length)); setText("lvn", num(all.filter(function (p) { return good(p) && !p.rejected; }).length));
    setText("lvb", num(all.filter(function (p) { return p.pitch; }).length)); setText("lvp", (all.length / hrs * 24).toFixed(1));
    setText("lvtick", "list refreshed " + ago(board.published || board.updated) + " · Indeed is checked every 3 hours" + (board.updated ? " · newest change " + ago(board.updated) : ""));
  }

  /* ---------- header KPIs ---------- */
  function header() {
    var all = everyone(), rej = all.filter(function (p) { return p.rejected; }).length, dayAgo = Date.now() - 864e5;
    var worth = all.filter(function (p) { return good(p) && !p.rejected; }).length;
    var k = function (label, val, chip) { return '<div class="kpi"><u>' + esc(label) + "</u><b>" + val + "</b>" + (chip ? '<span class="chip">' + esc(chip) + "</span>" : "") + "</div>"; };
    kpis.innerHTML = k("Applicants, both jobs", num(all.length), "+" + all.filter(function (p) { return t(p.applied) > dayAgo; }).length + " in 24 h") +
      k("Worth a call", num(worth), pct(worth, all.length) + " of all") +
      k("Websites", num(everyone("websites").length), "Rep 1") + k("AI Receptionist", num(everyone("ai").length), "Rep 2") +
      (rej ? k("Rejected", num(rej), "on Indeed") : "");
  }

  /* ---------- 1. applications over time, both jobs ---------- */
  var AW = 760, AL = 38, AR = 120;
  function series() {
    var p0 = t(board.posted) || Date.now(), out = [], d0 = new Date(new Date(p0).toDateString()).getTime();
    for (var d = d0; d <= Date.now(); d += 864e5) out.push({ d: ymd(d), websites: 0, ai: 0, cw: 0, ca: 0 });
    var idx = {}; out.forEach(function (o, i) { idx[o.d] = i; });
    everyone().forEach(function (p) { var i = idx[ymd(t(p.applied))]; if (i == null) i = t(p.applied) < d0 ? 0 : out.length - 1; if (out[i]) out[i][p.role === "ai" ? "ai" : "websites"]++; });
    var cw = 0, ca = 0; out.forEach(function (o) { cw += o.websites; ca += o.ai; o.cw = cw; o.ca = ca; });
    return out;
  }
  function areaChart(hs) {
    var W = AW, H = 240, L = AL, R = AR, T = 18, B = 26, n = hs.length;
    var max = Math.max(5, hs.length ? Math.max(hs[n - 1].cw, hs[n - 1].ca) : 5) * 1.15;
    var x = function (i) { return L + (W - L - R) * (n > 1 ? i / (n - 1) : 0.5); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var step = max > 60 ? 20 : max > 25 ? 10 : 5, g = "";
    for (var v = 0; v <= max; v += step) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + v + "</text>";
    hs.forEach(function (h, i) { g += '<text class="ax" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(day(h.d)) + "</text>"; });
    var line = function (k) { return hs.map(function (h, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(h[k]).toFixed(1); }).join(""); };
    var area = function (k) { return line(k) + "L" + x(n - 1).toFixed(1) + "," + y(0) + "L" + x(0).toFixed(1) + "," + y(0) + "Z"; };
    var last = hs[n - 1] || { cw: 0, ca: 0 }, ly1 = y(last.cw), ly2 = y(last.ca);
    if (Math.abs(ly1 - ly2) < 14) { ly1 = Math.min(ly1, ly2) - 8; ly2 = ly1 + 16; }
    var pk = 0; hs.forEach(function (h, i) { if (h.websites + h.ai > hs[pk].websites + hs[pk].ai) pk = i; });
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Applicants so far, each job">' +
      '<defs><linearGradient id="hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.s1 + '" stop-opacity=".5"/><stop offset="1" stop-color="' + C.s1 + '" stop-opacity=".02"/></linearGradient>' +
      '<linearGradient id="ha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.s3 + '" stop-opacity=".3"/><stop offset="1" stop-color="' + C.s3 + '" stop-opacity="0"/></linearGradient></defs>' + g +
      '<path d="' + area("cw") + '" fill="url(#hb)"/><path d="' + line("cw") + '" fill="none" stroke="' + C.s1 + '" stroke-width="2"/>' +
      '<path d="' + area("ca") + '" fill="url(#ha)"/><path d="' + line("ca") + '" fill="none" stroke="' + C.s3 + '" stroke-width="2" stroke-dasharray="5 4"/>' +
      (n > 1 && hs[pk].websites + hs[pk].ai ? '<g transform="translate(' + x(pk) + "," + (Math.min(y(hs[pk].cw), y(hs[pk].ca)) - 14) + ')"><rect x="-58" y="-17" width="116" height="20" rx="5" fill="#151b33" stroke="rgba(160,180,255,.25)"/><text class="lbl" y="-3" text-anchor="middle">BUSIEST +' + (hs[pk].websites + hs[pk].ai) + "</text></g>" : "") +
      '<text class="lbl" x="' + (W - R + 8) + '" y="' + (ly1 + 4) + '" fill="#8fbaf0">Websites ' + num(last.cw) + "</text>" +
      '<text class="lbl" x="' + (W - R + 8) + '" y="' + (ly2 + 4) + '">AI Recept. ' + num(last.ca) + "</text>" +
      '<line id="hx" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="rgba(238,241,250,.35)" visibility="hidden"/>' +
      '<rect class="hit" id="hhit" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '"/></svg>';
    var right = '<div class="key"><span><i style="background:' + C.s1 + '"></i>Websites</span><span><i style="background:' + C.s3 + '"></i>AI Receptionist (dashed)</span></div>';
    return panel("c8", "Applicants so far, each job", "Since the Indeed posts went up " + day(ymd(t(board.posted))) + " · running total", right, '<div class="scx">' + svg + "</div>");
  }
  function bindArea(hs) {
    var hit = document.getElementById("hhit"), ln = document.getElementById("hx");
    if (!hit || hs.length < 2) return;
    var svg = hit.ownerSVGElement, n = hs.length;
    function move(e) {
      var p = e.touches ? e.touches[0] : e, r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, sx = (p.clientX - r.left) * vb.width / r.width;
      var i = Math.max(0, Math.min(n - 1, Math.round((sx - AL) / ((AW - AL - AR) / (n - 1))))), xx = AL + (AW - AL - AR) * i / (n - 1), h = hs[i];
      ln.setAttribute("x1", xx); ln.setAttribute("x2", xx); ln.setAttribute("visibility", "visible");
      showTip("<b>" + esc(day(h.d)) + "</b>" + row(C.s1, "Websites", "+" + h.websites + " · " + h.cw + " total") + row(C.s3, "AI Receptionist", "+" + h.ai + " · " + h.ca + " total"), p.clientX, p.clientY);
    }
    hit.addEventListener("mousemove", move); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", function () { ln.setAttribute("visibility", "hidden"); hideTip(); });
  }

  /* ---------- 2. how good they are, donut over everyone ---------- */
  function donut() {
    var all = everyone(), n = function (f) { return all.filter(f).length; };
    var segs = [
      { k: "Worth a call", v: n(function (p) { return good(p) && !p.rejected; }), c: C.s1, sub: n(function (p) { return p.tier === "top" && !p.rejected; }) + " top · " + n(function (p) { return p.tier === "strong" && !p.rejected; }) + " strong" },
      { k: "Maybe", v: n(function (p) { return p.tier === "maybe" && !p.rejected; }), c: C.s2, sub: "a call if the top ones fall through" },
      { k: "Not ranked yet", v: n(function (p) { return (!p.tier || p.tier === "new") && !p.rejected; }), c: C.s3, sub: "ranked at the next 3-hour check" },
      { k: "Unlikely, can't hire, rejected", v: n(function (p) { return p.rejected || p.tier === "unlikely" || p.tier === "cant"; }), c: C.other, sub: n(function (p) { return p.rejected; }) + " rejected on Indeed" }];
    var total = all.length, R = 74, SW = 22, CIRC = 2 * Math.PI * R, off = 0, arcs = "";
    segs.forEach(function (s, i) {
      if (!total || !s.v) return;
      var len = s.v / total * CIRC, gap = Math.min(2.5, len / 3);
      arcs += '<circle data-seg="' + i + '" cx="100" cy="100" r="' + R + '" fill="none" stroke="' + s.c + '" stroke-width="' + SW + '" stroke-dasharray="' + Math.max(0.1, len - gap).toFixed(2) + " " + CIRC.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)" style="cursor:pointer"/>';
      off += len;
    });
    var svg = '<svg viewBox="0 0 200 200" role="img" aria-label="Applicants by how good they are">' + arcs +
      '<text x="100" y="98" text-anchor="middle" style="font:600 30px JetBrains Mono,monospace;fill:#EEF1FA">' + num(total) + '</text><text x="100" y="118" text-anchor="middle" class="lblm">APPLIED</text></svg>';
    var leg = segs.map(function (s) { return "<div><i style=\"background:" + s.c + "\"></i><span>" + esc(s.k) + "</span><b>" + num(s.v) + "</b><em>" + pct(s.v, total) + "</em>" + (s.sub ? "<small>" + esc(s.sub) + "</small>" : "") + "</div>"; }).join("");
    return { html: panel("c4", "How good they are", "Claude's read of every resume · all " + num(total), "", '<div class="dwrap"><div id="donut">' + svg + '</div><div class="leg">' + leg + "</div></div>"), segs: segs, total: total };
  }
  function bindDonut(d) {
    var el = document.getElementById("donut"); if (!el) return;
    el.addEventListener("mousemove", function (e) {
      var i = e.target.getAttribute && e.target.getAttribute("data-seg"); if (i == null) return hideTip();
      var s = d.segs[+i]; showTip("<b>" + esc(s.k) + "</b>" + row(s.c, num(s.v) + " people", pct(s.v, d.total)), e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", hideTip);
  }

  /* ---------- 3. the Indeed posts against their budget ---------- */
  function budget() {
    var p0 = t(board.posted), p1 = t((board.ends || "") + "T23:59:59"), days = Math.max(1, Math.round((p1 - p0) / 864e5)), gone = Math.max(0, Math.min(days, (Date.now() - p0) / 864e5));
    var cap = 450, spent = Math.min(cap, gone * 30), all = everyone();
    var pr = function (label, val, f, stop, note) {
      return '<div class="pr"><div class="h"><span style="font-family:inherit">' + esc(label) + "</span><span>" + esc(val) + '</span></div><div class="t"><i style="width:' + (Math.min(1, Math.max(0, f)) * 100).toFixed(1) + '%"></i>' +
        (stop != null ? '<em style="left:' + (Math.min(1, stop) * 100).toFixed(1) + '%"></em>' : "") + "</div><p>" + note + "</p></div>";
    };
    return panel("c4 half", "The Indeed posts", "Two sponsored posts · $15 a day each", "",
      pr("Budget used", "~$" + Math.round(spent) + " of $" + cap, spent / cap, 1, esc("estimate: days running × $30 · Indeed bills it, not this page")) +
      pr("Posting window", "day " + Math.max(1, Math.ceil(gone)) + " of " + days, gone / days, 1, esc("went up " + day(ymd(p0)) + " · ends " + day(board.ends))) +
      pr("Cost per applicant", all.length ? "~$" + (spent / all.length).toFixed(2) : "–", 0, null, esc(num(all.length) + " applicants so far · estimate")));
  }

  /* ---------- 4. share worth a call, gauge ---------- */
  function gauge() {
    var all = everyone(), worth = all.filter(function (p) { return good(p) && !p.rejected; }).length, r = all.length ? worth / all.length : 0, R = 78, cx = 110, cy = 104;
    var pt = function (a) { return [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))]; };
    var arc = function (a) { var p = pt(a); return "M" + (cx - R) + "," + cy + " A" + R + "," + R + " 0 0 1 " + p[0].toFixed(1) + "," + p[1].toFixed(1); };
    var svg = '<svg viewBox="0 0 220 132" role="img" aria-label="Worth a call ' + pct(worth, all.length) + '">' +
      '<path d="' + arc(0.9999) + '" fill="none" stroke="rgba(160,180,255,.09)" stroke-width="16" stroke-linecap="round"/>' +
      (r > 0 ? '<path d="' + arc(Math.max(0.01, r)) + '" fill="none" stroke="' + C.s1 + '" stroke-width="16" stroke-linecap="round"/>' : "") +
      '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" style="font:600 32px JetBrains Mono,monospace;fill:#EEF1FA">' + pct(worth, all.length) + "</text>" +
      '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" class="lblm">' + num(worth) + " OF " + num(all.length) + " APPLIED</text>" +
      '<text x="' + (cx - R) + '" y="' + (cy + 24) + '" text-anchor="middle" class="ax">0%</text><text x="' + (cx + R) + '" y="' + (cy + 24) + '" text-anchor="middle" class="ax">100%</text></svg>';
    return panel("c4 half", "Worth a call", "Top or strong on Claude's read", "", '<div style="max-width:300px;margin:0 auto">' + svg + '</div><p class="small" style="text-align:center;margin:6px 0 0">You need about 3 closers for demo week. Call the top ones first.</p>');
  }

  /* ---------- 5. Websites vs AI Receptionist ---------- */
  var RM = [["applied", "Applied"], ["worth", "Worth a call"], ["maybe", "Maybe"], ["pitch", "Voice pitch"], ["day", "Last 24 h"], ["rejected", "Rejected"]];
  function roleStats(role) {
    var L = everyone(role), dayAgo = Date.now() - 864e5;
    return { applied: L.length, worth: L.filter(function (p) { return good(p) && !p.rejected; }).length, maybe: L.filter(function (p) { return p.tier === "maybe" && !p.rejected; }).length,
      pitch: L.filter(function (p) { return p.pitch; }).length, day: L.filter(function (p) { return t(p.applied) > dayAgo; }).length, rejected: L.filter(function (p) { return p.rejected; }).length };
  }
  function bars() {
    var rs = [roleStats("websites"), roleStats("ai")], W = 420, H = 200, L = 6, T = 22, B = 34, gw = (W - L * 2) / RM.length, bw = Math.min(22, gw / 3);
    var max = Math.max(4, Math.max.apply(null, RM.map(function (m) { return Math.max(rs[0][m[0]], rs[1][m[0]]); }))) * 1.15;
    var y = function (v) { return T + (H - T - B) * (1 - v / max); }, g = '<line class="gl" x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    RM.forEach(function (m, i) {
      var cx = L + gw * i + gw / 2;
      [0, 1].forEach(function (k) {
        var v = rs[k][m[0]], x0 = cx + (k ? 2 : -bw - 2), h = Math.max(v ? 3 : 1.5, y(0) - y(v));
        g += '<rect data-r="' + k + '" data-m="' + i + '" x="' + x0.toFixed(1) + '" y="' + (y(0) - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + (k ? C.s3 : C.s1) + '" style="cursor:pointer"/>' +
          '<text class="lbl" x="' + (x0 + bw / 2).toFixed(1) + '" y="' + (y(0) - h - 5).toFixed(1) + '" text-anchor="middle">' + num(v) + "</text>";
      });
      g += '<text class="ax" x="' + cx + '" y="' + (H - 14) + '" text-anchor="middle">' + esc(m[1].toUpperCase()) + "</text>";
    });
    var right = '<div class="key"><span><i style="background:' + C.s1 + '"></i>Websites</span><span><i style="background:' + C.s3 + '"></i>AI Recept.</span></div>';
    return { html: panel("c4", "Websites vs AI Receptionist", "Rep 1 vs Rep 2 applicants", right, '<div id="rbars" class="scx sm"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Applicants by job">' + g + "</svg></div>"), rs: rs };
  }
  function bindBars(b) {
    var el = document.getElementById("rbars"); if (!el) return;
    el.addEventListener("mousemove", function (e) {
      var m = e.target.getAttribute && e.target.getAttribute("data-m"); if (m == null) return hideTip();
      var k = RM[+m][0]; showTip("<b>" + esc(RM[+m][1]) + "</b>" + row(C.s1, "Websites", num(b.rs[0][k])) + row(C.s3, "AI Receptionist", num(b.rs[1][k])), e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", hideTip);
  }

  /* ---------- 6. everyone, best first, with the resume laid out ---------- */
  function resumeHTML(p) {
    var out = [], ul = [];
    function flush() { if (ul.length) { out.push("<ul>" + ul.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"); ul = []; } }
    (p.resume_doc || []).forEach(function (b) {
      if (b.li != null) { ul.push(b.li); return; }
      flush();
      if (b.h) out.push("<h4>" + esc(b.h) + "</h4>");
      else if (b.hr) out.push('<div class="rs-hr"><span>' + esc(b.hr) + "</span></div>");
      else if (b.job) { var j = b.job, sub = [j.org, j.where].filter(Boolean).join(" · ");
        out.push('<div class="rs-job"><div class="rs-jt"><b>' + esc(j.title) + "</b>" + (j.when ? "<em>" + esc(j.when) + "</em>" : "") + "</div>" + (sub ? '<div class="rs-jo">' + esc(sub) + "</div>" : "") + "</div>"); }
      else if (b.chips) out.push('<div class="rs-chips">' + b.chips.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>");
      else if (b.p) out.push("<p>" + esc(b.p) + "</p>");
    });
    flush();
    return '<article class="rs"><header><b>' + esc(p.name || "") + "</b>" + (p.headline && p.headline !== p.where ? "<span>" + esc(p.headline) + "</span>" : "") + (p.where ? "<em>" + esc(p.where) + "</em>" : "") + "</header>" + out.join("") + "</article>";
  }
  function card(p) {
    var T = tierOf(p), on = open === p.id, b = "";
    if (p.pitch) b += '<span class="bdg">♪ VOICE PITCH</span>';
    if (p.also) b += '<span class="bdg">' + esc(p.also) + "</span>";
    var more = "";
    if (on) {
      more = '<div class="more">' + (p.summary ? "<div>" + esc(p.summary) + "</div>" : "") +
        ((p.evidence || []).length ? "<ul>" + p.evidence.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" : "") +
        (p.note ? '<div class="note"><div class="lbl">Claude\'s read</div>' + esc(p.note) + "</div>" : "") +
        ((p.answers || []).length ? '<div class="ans"><div class="lbl">Their apply-page answers</div>' + p.answers.map(function (a) { return "<div><b>" + esc(a[0]) + "</b>" + esc(a[1]) + "</div>"; }).join("") + "</div>" : "") +
        (p.resume ? '<details class="res" data-res="' + esc(p.id) + '"' + (openRes[p.id] ? " open" : "") + '><summary>Read the resume</summary>' + ((p.resume_doc || []).length ? resumeHTML(p) : "<pre>" + esc(p.resume) + "</pre>") + "</details>" : "") +
        (p.profile_url ? '<a class="indeed" href="' + esc(p.profile_url) + '" target="_blank" rel="noopener noreferrer">Open on Indeed: message or call →</a>' : "") + "</div>";
    }
    var line = p.headline && !/^[A-Z][a-z]+.*, [A-Z]{2}$/.test(p.headline) ? p.headline : p.summary;
    var pill = p.rejected ? '<span class="pill fail">✕ REJECTED</span>' : '<span class="pill ' + T[1] + '">' + esc(T[0]) + "</span>";
    return '<div class="app' + (on ? " on" : "") + '"><button type="button" data-id="' + esc(p.id) + '" aria-expanded="' + on + '">' +
      '<div class="who"><b>' + esc(p.name) + "</b><span>" + esc(p.where || "") + "</span>" + (line ? "<p>" + esc(line) + "</p>" : "") + (b ? '<div class="badges">' + b + "</div>" : "") + "</div>" +
      '<div class="side">' + pill + '<span class="ago">' + esc(ago(p.applied)) + "</span></div></button>" + more + "</div>";
  }
  function list() {
    var tabs = Object.keys(ROLE).map(function (k) {
      var L = everyone(k), R = ROLE[k], rej = L.filter(function (p) { return p.rejected; }).length;
      return '<button type="button" role="tab" class="tab' + (k === tab ? " on" : "") + '" data-tab="' + k + '" aria-selected="' + (k === tab) + '"><div class="row"><b>' + R.t + "</b><em>" + L.length + "</em></div><u>" +
        L.filter(function (p) { return good(p) && !p.rejected; }).length + " worth a call" + (rej ? " · " + rej + " rejected" : "") + "</u></button>";
    }).join("");
    var L = active(tab).slice().sort(function (a, b) { return (tierOf(a)[2] - tierOf(b)[2]) || (t(b.applied) - t(a.applied)); });
    var rej = everyone(tab).filter(function (p) { return p.rejected; });
    return panel("c8", "Everyone, best first", "Tap a name for Claude's read, their answers and the resume", "",
      '<nav class="tabs" role="tablist" aria-label="Which job">' + tabs + "</nav>" + (L.map(card).join("") || '<p class="small">Nobody yet.</p>') +
      (rej.length ? '<div class="rejh">Rejected on Indeed · counted in the totals</div>' + rej.map(card).join("") : ""));
  }
  function side() {
    var all = everyone(), newest = all.slice().sort(function (a, b) { return t(b.applied) - t(a.applied); }).slice(0, 7);
    var worth = all.filter(function (p) { return good(p) && !p.rejected; }).length, ranked = all.filter(function (p) { return p.tier && p.tier !== "new"; }).length;
    var h = '<div class="newest">' + newest.map(function (p) {
      return "<div><span style=\"display:block\"><b>" + esc(p.name) + "</b><span>" + esc((ROLE[p.role] || { t: p.role }).t) + " · " + esc(p.where || "") + "</span></span>" +
        '<span style="text-align:right"><span class="pill ' + (p.rejected ? "fail" : tierOf(p)[1]) + '">' + esc(p.rejected ? "✕ REJECTED" : tierOf(p)[0]) + '</span><span style="margin-top:4px">' + esc(ago(p.applied)) + "</span></span></div>";
    }).join("") + "</div>";
    h += '<div class="pipe"><span>APPLIED ' + num(all.length) + "</span><i>→</i><span>RANKED " + num(ranked) + '</span><i>→</i><span class="last">WORTH A CALL ' + num(worth) + "</span></div>";
    return panel("c4", "Newest applicants", "Latest first", "", h);
  }

  function render() {
    if (!board) return;
    header(); live();
    var hs = series(), d = donut(), b = bars();
    app.innerHTML = '<div class="g">' + areaChart(hs) + d.html + "</div>" +
      '<div class="g">' + budget() + gauge() + b.html + "</div>" +
      '<div class="g">' + list() + side() + "</div>";
    bindArea(hs); bindDonut(d); bindBars(b);
  }
  function stamp() {
    if (!board) return;
    var at = board.published || board.updated;
    upd.textContent = "updated " + (ago(at) || "never");
  }
  function gate(msg) { app.innerHTML = '<div class="panel gate"><b>' + esc(msg[0]) + "</b>" + esc(msg[1]) + "</div>"; upd.textContent = ""; }

  function fetchBoard() {
    var k = key();
    if (!k) return gate(["This page needs your private link.", "Open it from the text Claude sent you."]);
    if (location.hash) history.replaceState(null, "", location.pathname);
    if (loading) return;
    loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (res) {
        if (res[0] === 401) { store(KEY_STORE, null); return gate(["That link has expired.", "Ask Claude for a new one."]); }
        if (!res[1].ok) return gate(["Nothing published yet.", "The first check fills this page."]);
        board = res[1].board; render(); stamp();
      })
      .catch(function () { if (!board) gate(["Couldn't load.", "Check your connection, then tap Refresh."]); })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }

  app.addEventListener("click", function (e) {
    var tb = e.target.closest("[data-tab]");
    if (tb) { tab = tb.getAttribute("data-tab"); open = null; store(TAB_STORE, tab); render(); return; }
    if (e.target.closest("a,details")) return;
    var c = e.target.closest("[data-id]");
    if (c) { var id = c.getAttribute("data-id"); open = open === id ? null : id; render(); }
  });
  app.addEventListener("toggle", function (e) { var d = e.target; if (d && d.dataset && d.dataset.res) openRes[d.dataset.res] = d.open; }, true);
  btn.addEventListener("click", fetchBoard);
  addEventListener("scroll", hideTip, { passive: true });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") fetchBoard(); });
  setInterval(function () { if (document.visibilityState === "visible") fetchBoard(); }, 120000);
  setInterval(stamp, 30000);
  fetchBoard();
})();
