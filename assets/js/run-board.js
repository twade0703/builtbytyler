/* builtbytyler.com/run: the demo factory dashboard, live (2026-10-26).
 *
 * Tyler: "track the ongoing run ... every spending and everything I need to be seeing, live", then
 * "out of the entire total not just out of the area you are cutting", then the dashboard redesign after
 * his "Metropolis '26" reference: a KPI strip, a big time chart, a donut, progress rows, a gauge,
 * grouped bars, a status table and a pipeline, dark.
 *
 * Every count reads against the whole scrape. Colours are the dataviz default dark slots (blue
 * #3987e5, orange #d95926, aqua #199e70; neutral grey for "everything else"), validated for colour-blind
 * separation on #0d1120, and every mark also carries a label or a legend line (Tyler is colourblind).
 * Hover any mark for its numbers. Reads /api/hiring-board?doc=run with the private key from the link's #.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh"),
      kpis = document.getElementById("kpis"), tip = document.getElementById("tip");
  var loading = false;
  var C = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", other: "#5e6888" };

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function key() {
    var m = /[#&]k=([A-Za-z0-9_-]{24,})/.exec(location.hash || "");
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function usd(n) { return n == null ? "–" : "$" + Number(n).toFixed(2); }
  function num(n) { return n == null ? "–" : Number(n).toLocaleString("en-US"); }
  function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "–"; }
  function ago(iso) {
    if (!iso) return "never";
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h " + (m % 60) + " min ago";
  }
  function day(d) { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function when(iso) { return iso ? new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""; }

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

  /* ---------- 1. demos per day, area ---------- */
  var AW = 760, AL = 38, AR = 92;
  function areaChart(hist) {
    var W = AW, H = 250, L = AL, R = AR, T = 18, B = 26, n = hist.length;
    var max = Math.max(10, Math.max.apply(null, hist.map(function (h) { return h.built; }))) * 1.15;
    var x = function (i) { return L + (W - L - R) * (n > 1 ? i / (n - 1) : 0); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var step = max > 400 ? 100 : max > 150 ? 50 : max > 60 ? 20 : 5, g = "";
    for (var v = 0; v <= max; v += step) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + v + "</text>";
    hist.forEach(function (h, i) { if (i % 4 === 0 || i === n - 1) g += '<text class="ax" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(day(h.d)) + "</text>"; });
    var line = function (k) { return hist.map(function (h, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(h[k]).toFixed(1); }).join(""); };
    var area = function (k) { return line(k) + "L" + x(n - 1).toFixed(1) + "," + y(0) + "L" + x(0).toFixed(1) + "," + y(0) + "Z"; };
    var pk = 0; hist.forEach(function (h, i) { if (h.built > hist[pk].built) pk = i; });
    var last = hist[n - 1], tb = hist.reduce(function (a, h) { return a + h.built; }, 0), tp = hist.reduce(function (a, h) { return a + h.passed; }, 0);
    var ly1 = y(last.built), ly2 = y(last.passed); if (Math.abs(ly1 - ly2) < 14) { ly1 = Math.min(ly1, ly2) - 8; ly2 = ly1 + 16; }
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Demos built and passed per day, last ' + n + ' days">' +
      '<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.s3 + '" stop-opacity=".32"/><stop offset="1" stop-color="' + C.s3 + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.s1 + '" stop-opacity=".55"/><stop offset="1" stop-color="' + C.s1 + '" stop-opacity=".02"/></linearGradient></defs>' + g +
      '<path d="' + area("built") + '" fill="url(#ga)"/><path d="' + line("built") + '" fill="none" stroke="' + C.s3 + '" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<path d="' + area("passed") + '" fill="url(#gb)"/><path d="' + line("passed") + '" fill="none" stroke="' + C.s1 + '" stroke-width="2"/>' +
      (hist[pk].built ? '<g transform="translate(' + x(pk) + "," + (y(hist[pk].built) - 12) + ')"><rect x="-44" y="-17" width="88" height="20" rx="5" fill="#151b33" stroke="rgba(160,180,255,.25)"/><text class="lbl" y="-3" text-anchor="middle">PEAK ' + num(hist[pk].built) + "</text></g>" : "") +
      '<text class="lbl" x="' + (W - R + 8) + '" y="' + (ly1 + 4) + '">Built ' + num(last.built) + "</text>" +
      '<text class="lbl" x="' + (W - R + 8) + '" y="' + (ly2 + 4) + '" fill="#8fbaf0">Passed ' + num(last.passed) + "</text>" +
      '<line id="ax-x" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="rgba(238,241,250,.35)" stroke-width="1" visibility="hidden"/>' +
      '<rect class="hit" id="ar-hit" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '"/></svg>';
    var right = '<div class="key"><span><i style="background:' + C.s1 + '"></i>Passed, ready</span><span><i style="background:' + C.s3 + '"></i>Built (dashed)</span></div>';
    return panel("c8", "Demos built and passed per day", "Last " + n + " days · " + num(tb) + " built · " + num(tp) + " passed · " + pct(tp, tb) + " pass", right, '<div class="scx">' + svg + "</div>");
  }
  function bindArea(hist) {
    var hit = document.getElementById("ar-hit"), ln = document.getElementById("ax-x");
    if (!hit || hist.length < 2) return;
    var svg = hit.ownerSVGElement, n = hist.length;
    function move(e) {
      var p = e.touches ? e.touches[0] : e, r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      var sx = (p.clientX - r.left) * vb.width / r.width;
      var i = Math.max(0, Math.min(n - 1, Math.round((sx - AL) / ((AW - AL - AR) / (n - 1)))));
      var xx = AL + (AW - AL - AR) * i / (n - 1);
      ln.setAttribute("x1", xx); ln.setAttribute("x2", xx); ln.setAttribute("visibility", "visible");
      var h = hist[i];
      showTip("<b>" + esc(day(h.d)) + "</b>" + row(C.s1, "Passed", num(h.passed)) + row(C.s3, "Built", num(h.built)) + (h.built ? row("transparent", "Pass rate", pct(h.passed, h.built)) : ""), p.clientX, p.clientY);
    }
    hit.addEventListener("mousemove", move); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", function () { ln.setAttribute("visibility", "hidden"); hideTip(); });
  }

  /* ---------- 2. where every business went, donut ---------- */
  function donut(t, rs) {
    var found = t.found || 0, segs = [
      { k: "Passed, ready to call", v: t.passed || 0, c: C.s1 },
      { k: "Built, failed a check", v: Math.max(0, (t.built || 0) - (t.passed || 0)), c: C.s2,
        sub: [rs["photos-thin"] ? num(rs["photos-thin"]) + " too few photos" : "", rs["s3-fail"] ? num(rs["s3-fail"]) + " no full-width landing photo" : ""].filter(Boolean).join(" · ") },
      { k: "No website, not built", v: Math.max(0, (t.no_site || 0) - (t.built || 0)), c: C.s3, sub: "too few reviews, or held for a check" },
      { k: "Has a website or ruled out", v: Math.max(0, found - (t.no_site || 0)), c: C.other, sub: "already online, closed, or not a fit" }];
    var R = 74, SW = 22, CIRC = 2 * Math.PI * R, off = 0, arcs = "";
    segs.forEach(function (s, i) {
      if (!found || !s.v) return;
      var len = s.v / found * CIRC, gap = Math.min(2.5, len / 3);
      arcs += '<circle data-seg="' + i + '" cx="100" cy="100" r="' + R + '" fill="none" stroke="' + s.c + '" stroke-width="' + SW + '" stroke-dasharray="' + Math.max(0.1, len - gap).toFixed(2) + " " + CIRC.toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)" style="cursor:pointer"/>';
      off += len;
    });
    if (!found) arcs = '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="rgba(160,180,255,.1)" stroke-width="' + SW + '"/>';
    var svg = '<svg viewBox="0 0 200 200" role="img" aria-label="Where every business found went">' + arcs +
      '<text x="100" y="98" text-anchor="middle" style="font:600 30px JetBrains Mono,monospace;fill:#EEF1FA">' + num(found) + '</text><text x="100" y="118" text-anchor="middle" class="lblm">FOUND</text></svg>';
    var leg = segs.map(function (s) { return "<div><i style=\"background:" + s.c + "\"></i><span>" + esc(s.k) + "</span><b>" + num(s.v) + "</b><em>" + pct(s.v, found) + "</em>" + (s.sub ? "<small>" + esc(s.sub) + "</small>" : "") + "</div>"; }).join("");
    return { html: panel("c4", "Where every business went", "All " + num(found) + " found this run", "", '<div class="dwrap"><div id="donut">' + svg + '</div><div class="leg">' + leg + "</div></div>"), segs: segs, found: found };
  }
  function bindDonut(d) {
    var el = document.getElementById("donut"); if (!el) return;
    el.addEventListener("mousemove", function (e) {
      var i = e.target.getAttribute && e.target.getAttribute("data-seg");
      if (i == null) return hideTip();
      var s = d.segs[+i]; showTip("<b>" + esc(s.k) + "</b>" + row(s.c, num(s.v) + " businesses", pct(s.v, d.found)), e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", hideTip);
  }

  /* ---------- 3. spending, progress rows ---------- */
  function spend(m) {
    var a = m.apify || {}, g = m.google || {}, c = m.claude || {};
    var pr = function (label, val, f, stop, note) {
      return '<div class="pr"><div class="h"><span style="font-family:inherit">' + esc(label) + "</span><span>" + esc(val) + '</span></div><div class="t" role="img" aria-label="' + esc(label + " " + val) +
        '"><i style="width:' + (Math.min(1, Math.max(0, f)) * 100).toFixed(1) + '%"></i>' + (stop != null ? '<em style="left:' + (Math.min(1, stop) * 100).toFixed(1) + '%"></em>' : "") + "</div><p>" + note + "</p></div>";
    };
    var r = m.run || {}, tile = function (v, l, sub) { return "<div><b>" + v + "</b><u>" + esc(l) + "</u>" + (sub ? '<em style="display:block;font-style:normal;font-size:11px;color:var(--dim);margin-top:2px">' + esc(sub) + "</em>" : "") + "</div>"; };
    /* what this run has cost, all services (Tyler, 2026-10-27: "did we really spend a hundred dollars on 140 demos?") */
    var head = '<div class="stock" style="margin:0 0 12px">' +
      tile(r.total == null ? "–" : usd(r.total), "Spent this run", "Apify " + usd(r.apify) + " + Google " + usd(r.google)) +
      tile(r.per_demo == null ? "–" : usd(r.per_demo), "Per passed demo", num(r.passed) + " passed so far") + "</div>";
    return panel("c4 half", "Spending against the stop lines", "White tick = the run stops itself", "", head +
      pr("Apify (scraping)", pct(a.used || 0, a.account_limit || 199), (a.used || 0) / (a.account_limit || 199), (a.stop_at || 190) / (a.account_limit || 199),
        esc(usd(a.spent_run) + " this run · " + usd(a.used) + " of " + usd(a.account_limit) + " this month · stops " + usd(a.stop_at))) +
      pr("Google (photos, reviews)", pct(g.usd || 0, g.cap || 50), (g.usd || 0) / (g.cap || 50), 1,
        esc(usd(g.usd) + " of $" + num(g.cap) + " cap · " + num(g.leads) + " listings × $" + g.details_usd + " + " + num(g.photos) + " photos × $" + g.photo_usd + " · counted from calls at list price")) +
      pr("Claude (weekly limit)", c.weekly == null ? "–" : c.weekly + "%", (c.weekly || 0) / 100, (c.stop_at || 70) / 100,
        esc("started " + num(c.start) + "% · stops " + (c.stop_at || 70) + "% · checked " + ago(c.at) + " · resets " + (c.resets || ""))));
  }

  /* ---------- 4. pass rate gauge ---------- */
  function gauge(t) {
    var r = t.built ? t.passed / t.built : 0, R = 78, cx = 110, cy = 104;
    var pt = function (a) { return [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))]; };
    var arc = function (a) { var p = pt(a); return "M" + (cx - R) + "," + cy + " A" + R + "," + R + " 0 0 1 " + p[0].toFixed(1) + "," + p[1].toFixed(1); };
    var svg = '<svg viewBox="0 0 220 132" role="img" aria-label="Pass rate ' + pct(t.passed, t.built) + '">' +
      '<path d="' + arc(0.9999) + '" fill="none" stroke="rgba(160,180,255,.09)" stroke-width="16" stroke-linecap="round"/>' +
      (r > 0 ? '<path d="' + arc(Math.max(0.01, r)) + '" fill="none" stroke="' + C.s1 + '" stroke-width="16" stroke-linecap="round"/>' : "") +
      '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" style="font:600 32px JetBrains Mono,monospace;fill:#EEF1FA">' + pct(t.passed, t.built) + "</text>" +
      '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" class="lblm">' + num(t.passed) + " OF " + num(t.built) + " BUILT</text>" +
      '<text x="' + (cx - R) + '" y="' + (cy + 24) + '" text-anchor="middle" class="ax">0%</text><text x="' + (cx + R) + '" y="' + (cy + 24) + '" text-anchor="middle" class="ax">100%</text></svg>';
    return panel("c4 half", "Pass rate", "Built sites that passed every check", "",
      '<div style="max-width:300px;margin:0 auto">' + svg + '</div><p class="small" style="text-align:center;margin:6px 0 0">Past runs: about 1 in 3. Van Nuys lost most to too few photos of their own.</p>');
  }

  /* ---------- 5. pace: how fast the factory is going ---------- */
  function rates(b) {
    var r = b.rates || {}, t = b.totals || {}, tile = function (v, l, sub) { return "<div><b>" + v + "</b><u>" + esc(l) + "</u>" + (sub ? '<em style="display:block;font-style:normal;font-size:11px;color:var(--dim);margin-top:2px">' + esc(sub) + "</em>" : "") + "</div>"; };
    var perday = function (x) { return x == null ? "–" : num(Math.round(x * 24)); };
    return panel("c4 half", "Pace", "Per hour of running · " + (r.hours != null ? r.hours.toFixed(1) : "–") + " h so far", "",
      '<div class="stock" style="margin-top:0">' +
      tile(r.passed_per_hour == null ? "–" : r.passed_per_hour, "Demos passed an hour", "about " + perday(r.passed_per_hour) + " a day") +
      tile(r.built_per_hour == null ? "–" : r.built_per_hour, "Sites built an hour", "about " + perday(r.built_per_hour) + " a day") +
      tile(r.found_per_hour == null ? "–" : num(r.found_per_hour), "Businesses found an hour", num(t.found) + " so far") +
      tile(t.built ? pct(t.passed, t.built) : "–", "Pass rate", num(t.passed) + " of " + num(t.built) + " built") + "</div>" +
      '<p class="small" style="margin-top:10px">Building is the slow step: a big city spends about 2 hours finding businesses before its first site is built.</p>');
  }

  /* ---------- 5b. Rep 1 vs Rep 2 (no longer on this page) ---------- */
  var RM = [["called", "Called", "Called"], ["reached", "Reached", "Reached someone"], ["owner", "Owner", "Reached the owner"],
            ["callbacks", "Call-backs", "Call-backs set"], ["demos_texted", "Texted", "Demos texted"], ["sold", "Sold", "Sold"]];
  function reps(rs) {
    if (!rs || rs.length < 2) return panel("c4", "Rep 1 vs Rep 2", "Today", "", '<p class="small">No rep data yet.</p>');
    var W = 420, H = 200, L = 6, T = 22, B = 34, gw = (W - L * 2) / RM.length, bw = Math.min(22, gw / 3);
    var max = Math.max(4, Math.max.apply(null, RM.map(function (m) { return Math.max(rs[0][m[0]] || 0, rs[1][m[0]] || 0); }))) * 1.15;
    var y = function (v) { return T + (H - T - B) * (1 - v / max); }, g = '<line class="gl" x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    RM.forEach(function (m, i) {
      var cx = L + gw * i + gw / 2;
      [0, 1].forEach(function (k) {
        var v = rs[k][m[0]] || 0, x0 = cx + (k ? 2 : -bw - 2), h = Math.max(v ? 3 : 1.5, y(0) - y(v)), col = k ? C.s3 : C.s1;
        g += '<rect data-rep="' + k + '" data-m="' + i + '" x="' + x0.toFixed(1) + '" y="' + (y(0) - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + col + '" style="cursor:pointer"/>' +
          '<text class="lbl" x="' + (x0 + bw / 2).toFixed(1) + '" y="' + (y(0) - h - 5).toFixed(1) + '" text-anchor="middle">' + num(v) + "</text>";
      });
      g += '<text class="ax" x="' + cx + '" y="' + (H - 14) + '" text-anchor="middle">' + esc(m[1].toUpperCase()) + "</text>";
    });
    var right = '<div class="key"><span><i style="background:' + C.s1 + '"></i>Rep 1</span><span><i style="background:' + C.s3 + '"></i>Rep 2</span></div>';
    return panel("c4", "Rep 1 vs Rep 2, today", "Sheets: Rep 1 " + num(rs[0].sheet) + " · Rep 2 " + num(rs[1].sheet), right,
      '<div id="repbars" class="scx sm"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Rep 1 and Rep 2 calls today">' + g + "</svg></div>");
  }
  function bindReps(rs) {
    var el = document.getElementById("repbars"); if (!el || !rs) return;
    el.addEventListener("mousemove", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-rep"), m = e.target.getAttribute && e.target.getAttribute("data-m");
      if (k == null) return hideTip();
      var x = RM[+m];
      showTip("<b>" + esc(x[2]) + "</b>" + row(C.s1, "Rep 1", num(rs[0][x[0]])) + row(C.s3, "Rep 2", num(rs[1][x[0]])), e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", hideTip);
  }

  /* ---------- 6. every city, status table ---------- */
  function cities(list) {
    var pill = function (st) {
      return st === "done" ? '<span class="pill done">✓ DONE</span>' : st === "running" ? '<span class="pill run">● RUNNING</span>'
        : st === "failed" ? '<span class="pill fail">✕ FAILED</span>' : '<span class="pill q">QUEUED</span>';
    };
    var cell = function (v) { return '<td class="num">' + (v == null ? "–" : num(v)) + "</td>"; };
    var rows = list.map(function (r) {
      return '<tr class="' + (r.status === "pending" ? "q" : "") + '"><td>' + esc(r.city) + "</td><td>" + esc(r.rep) + "</td>" + cell(r.found) + cell(r.no_site) + cell(r.built) + cell(r.passed) +
        '<td class="num">' + (r.found && r.passed != null ? pct(r.passed, r.found) : "–") + "</td><td>" + pill(r.status === "pending" ? "queued" : r.status) + "</td></tr>";
    }).join("");
    return panel("c8", "Every city in the run", "Found = every business the scrape returned · Yield = passed out of found · Rep 1 SoCal · Rep 2 NorCal and Nevada", "",
      '<div class="tw" style="max-height:420px;overflow:auto"><table><thead><tr><th>City</th><th>Rep</th><th>Found</th><th>No site</th><th>Built</th><th>Passed</th><th>Yield</th><th>Status</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8">None queued.</td></tr>') + "</tbody></table></div>");
  }

  /* ---------- 7. now running, pipeline, stock ---------- */
  function nowPanel(b) {
    var t = b.totals || {}, s = b.stock || {}, now = b.now, h = '<div class="now">';
    if (now) {
      h += "<b>" + esc(now.city) + " · " + esc(now.rep) + "</b><p>" + esc(now.stage_label) + " · " + esc(now.minutes) + " min in</p>" +
        (now.found ? '<p class="small" style="margin-top:6px">' + num(now.found) + " found · " + num(now.no_site) + " with no website</p>" : "") +
        (now.to_build ? '<div class="bar1"><i style="width:' + ((now.tried || 0) / now.to_build * 100).toFixed(1) + '%"></i></div><p class="small">' + num(now.tried) + " of " + num(now.to_build) + " worked through · " + num(now.built) + " sites built · " + num(now.passed) + " passed so far</p>" : "");
    } else {
      h += "<b>" + (b.stop_reason ? "Stopped" : "Nothing running") + "</b><p>" + esc(b.stop_reason || "") + "</p>";
    }
    h += '<p class="small" style="margin-top:8px">City ' + num(Math.min((t.cities_done || 0) + (now ? 1 : 0), t.cities_total || 0)) + " of " + num(t.cities_total) +
      (b.stop_by ? " · no new city after " + esc(when(b.stop_by)) : "") + "</p></div>";
    h += '<div class="pipe"><span>FOUND ' + num(t.found) + "</span><i>→</i><span>NO SITE " + num(t.no_site) + "</span><i>→</i><span>BUILT " + num(t.built) + '</span><i>→</i><span class="last">PASSED ' + num(t.passed) + "</span></div>";
    h += '<div class="stock"><div><b>' + num(s.callable_demos) + "</b><u>Callable demos, CA and NV</u></div><div><b>" + num(s.added_this_run) + "</b><u>New demos on sheets this run</u></div>" +
      "<div><b>" + num(s.rep1_sheet) + "</b><u>On Rep 1's sheet</u></div><div><b>" + num(s.rep2_sheet) + "</b><u>On Rep 2's sheet</u></div>" +
      "<div><b>" + num(s.ai_targets) + "</b><u>AI Receptionist targets</u></div><div><b>" + num(t.cities_left) + "</b><u>Cities still queued</u></div></div>";
    if ((b.log || []).length) h += '<details><summary>What the runner said last</summary><div class="log">' + esc(b.log.join("\n")) + "</div></details>";
    var on = b.state === "running";
    return panel("c4", "Running now", (b.state || "").toUpperCase(), '<span class="pill ' + (on ? "run" : "q") + '">' + (on ? "● LIVE" : "IDLE") + "</span>", h);
  }


  var lastPassed = null;
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function live(b) {
    var now = b.now, t = b.totals || {}, on = b.state === "running";
    var big = document.getElementById("orbn");
    if (big && lastPassed != null && (t.passed || 0) > lastPassed) { big.style.color = "#8fbaf0"; setTimeout(function () { big.style.color = ""; }, 1500); }
    lastPassed = t.passed || 0;
    var pill = document.getElementById("lvpill"); if (pill) pill.className = "livepill" + (on ? " on" : "");
    setText("lvstate", on ? "WORKING" : (b.state || "idle").toUpperCase());
    var sk = b.stock || {};
    setText("orbn", num(t.passed)); setText("orbl", "DEMOS BUILT AND READY, WHOLE RUN");
    setText("orbs", "Rep 1 +" + num(sk.added_rep1) + " · Rep 2 +" + num(sk.added_rep2) + " added to their sheets · " + num(t.built) + " sites built · " + num(t.found) + " businesses found" + (t.building_now ? " · includes the city building now" : ""));
    setText("lvcity", now ? now.city + " · " + now.rep : b.stop_reason ? "Stopped" : "Nothing running");
    setText("lvstage", now ? now.stage_label + " · " + now.minutes + " min in · city " + Math.min((t.cities_done || 0) + 1, t.cities_total || 0) + " of " + (t.cities_total || 0) : (b.stop_reason || ""));
    var bar = document.getElementById("lvbar"), f = now && now.to_build ? (now.tried || 0) / now.to_build : 0;
    if (bar) { bar.className = "bar1" + (on ? " on" : ""); bar.firstChild.style.width = (f * 100).toFixed(1) + "%"; }
    setText("lvprog", now && now.to_build ? num(now.tried) + " of " + num(now.to_build) + " worked through here · " + num(now.built) + " sites built" : on ? "Scraping and checking: building starts after the list is ready" : "");
    setText("lvf", now ? num(now.found) : "–"); setText("lvn", now ? num(now.no_site) : "–");
    setText("lvb", now ? num(now.built) : "–"); setText("lvp", now ? num(now.passed) : "–");
    LIVE = { at: Date.now(), started: b.now_started ? new Date(b.now_started).getTime() : null, beat: b.heartbeat_s, updated: new Date(b.updated).getTime() };
    var st = now ? now.stage : null, order = ["F1", "F2", "F4", "F5", "F7", "F8"], names = ["SCRAPE", "RANK", "PICK", "PHOTOS", "BUILD", "NOTES"];
    var pos = st === "F3" ? 1 : st === "F6" ? 3 : st === "F9" || st === "done" ? 6 : order.indexOf(st);
    var steps = document.getElementById("lvsteps");
    if (steps) steps.innerHTML = names.map(function (n, i) { return '<span class="' + (i < pos ? "done" : i === pos ? "now" : "") + '">' + (i < pos ? "✓ " : i === pos ? "● " : "") + n + "</span>"; }).join("");
    var feed = document.getElementById("lvfeed"), lines = (b.feed || []).slice().reverse();
    if (feed && lines.length) {
      var seen = {}; [].forEach.call(feed.children, function (d) { seen[d.textContent] = 1; });
      feed.innerHTML = lines.map(function (l) { var x = l.trim(); return '<div class="' + (seen[x] ? "" : "new") + '">' + esc(x) + "</div>"; }).join("");
    }
    var ck = document.getElementById("checks");
    if (ck) ck.innerHTML = "<b>System check</b>" + (b.checks || []).map(function (c) { return '<span class="' + (c.ok ? "ok" : "bad") + '">' + (c.ok ? "✓ " : "⚠ ") + esc(c.k) + ": " + esc(c.v) + "</span>"; }).join("") +
      '<span class="ok" id="lvfresh">✓ Page: updated just now</span>';
    tick();
  }

  /* ---------- header KPIs ---------- */
  var LIVE = null;
  function hms(ms) { var sec = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return h + ":" + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0"); }
  function tick() {
    if (!LIVE) return;
    var el = document.getElementById("lvclock"); if (el) el.textContent = LIVE.started ? hms(Date.now() - LIVE.started) : "–";
    var since = (Date.now() - LIVE.at) / 1000, bt = document.getElementById("lvbeat");
    if (bt) bt.textContent = LIVE.beat == null ? "no city running" : "last activity " + Math.round(LIVE.beat + since) + "s ago";
    var fr = document.getElementById("lvfresh"); if (fr) fr.textContent = "✓ Page: data " + Math.round((Date.now() - LIVE.updated) / 1000) + "s old";
  }
  setInterval(tick, 1000);
  function header(b) {
    var t = b.totals || {}, s = b.stock || {}, m = b.money || {}, hist = b.history || [], today = hist.length ? hist[hist.length - 1].passed : 0;
    var spent = ((m.apify && m.apify.spent_run) || 0) + ((m.google && m.google.usd) || 0);
    var k = function (label, val, chip) { return '<div class="kpi"><u>' + esc(label) + "</u><b>" + val + "</b>" + (chip ? '<span class="chip">' + esc(chip) + "</span>" : "") + "</div>"; };
    kpis.innerHTML = k("Demos passed, this run", num(t.passed), "+" + num(today) + " today") + k("Callable demos", num(s.callable_demos), "CA + NV") +
      k("Spent this run", usd(spent), "Apify + Google") + k("Claude weekly", (m.claude && m.claude.weekly != null ? m.claude.weekly + "%" : "–"), "stops 70%");
  }

  function render(b) {
    upd.textContent = "updated " + ago(b.updated);
    header(b); live(b);
    var hist = (b.history && b.history.length) ? b.history : [{ d: new Date().toISOString().slice(0, 10), built: 0, passed: 0 }];
    var d = donut(b.totals || {}, b.reasons || {});
    app.innerHTML = '<div class="g">' + cities(b.cities || []).replace('class="panel c8"', 'class="panel c12"') + "</div>" +
      '<div class="g">' + areaChart(hist) + d.html + "</div>" +
      '<div class="g">' + rates(b) + spend(b.money || {}) + gauge(b.totals || {}) + "</div>";
    bindArea(hist); bindDonut(d);
  }

  function gate(t, s) { app.innerHTML = '<div class="panel gate"><b>' + esc(t) + "</b>" + esc(s) + "</div>"; }

  function refresh() {
    var k = key();
    if (!k) { gate("Open this from your text", "This page only opens from the link Claude texted you."); upd.textContent = ""; return; }
    if (loading) return;
    loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=run", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 401) return gate("Link not recognised", "Open the newest link Claude texted you.");
        if (!x.j.ok) return gate("Nothing yet", "The first numbers arrive within 5 minutes of the run starting.");
        render(x.j.board);
      })
      .catch(function () { upd.textContent = "offline · showing the last numbers"; })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  btn.addEventListener("click", refresh);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  addEventListener("scroll", hideTip, { passive: true });
  setInterval(function () { if (!document.hidden) refresh(); }, 30000);
  refresh();
})();
