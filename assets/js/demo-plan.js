/* builtbytyler.com/plan: Tyler's demo-week plan, live (2026-10-25).
 *
 * Tyler: "the full plan, how many demos we need, how many are going to be recalled, how much
 * money we're going to make, the pickup rate assumptions, close rate assumptions. Let's assume
 * 100 calls per day ... all of the expenses that I need to pay to get to a point where we have
 * enough demos for 3 people to work it for a week."
 *
 * Live counts (demos ready, AI call list, area codes, applicants) come from his PC through
 * /api/hiring-board?doc=plan (04 Legal/reps/hiring/demo_week.py publish). Every assumption is a
 * slider; the math below reruns on each move and the choices are kept on this phone only.
 *
 * Recalls: a business that doesn't pick up is called again the next day, up to "tries" times.
 * Each closer's day is filled with due callbacks first, then new businesses (each one a demo).
 * Expected values, not a random simulation. Close rate is sales per call dialed, the way Tyler
 * framed it; the page also shows what that means per owner actually reached.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k", DIAL_STORE = "bbt-plan-dials-v3";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh");
  var D = null, S = null, loading = false;

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function key() {
    var m = /[#&]k=([A-Za-z0-9_-]{24,})/.exec(location.hash || "");
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function N(v) { return Math.round(v).toLocaleString("en-US"); }
  function $(v) { var a = Math.abs(v); return (v < 0 ? "-$" : "$") + (a >= 100 ? Math.round(a).toLocaleString("en-US") : a.toFixed(a % 1 ? 2 : 0)); }
  function $k(v) { var a = Math.abs(v), s = v < 0 ? "-" : ""; return a >= 1e4 ? s + "$" + (a / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : s + "$" + Math.round(a).toLocaleString("en-US"); }
  function ago(s) { var t = Date.parse(s), m = (Date.now() - t) / 6e4; if (!isFinite(t)) return "";
    return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; }

  /* ---------------- the model ---------------- */
  function sim(calls, days, p, tries) {
    var pending = {}, out = { fresh: 0, recall: 0, reached: 0, left: 0, daily: [] };
    for (var k = 2; k <= tries; k++) pending[k] = 0;
    for (var d = 0; d < days; d++) {
      var avail = calls, next = {}, rec = 0;
      for (k = tries; k >= 2; k--) {
        var u = Math.min(pending[k], avail);
        pending[k] -= u; avail -= u; rec += u; out.reached += p * u;
        if (k < tries) next[k + 1] = (next[k + 1] || 0) + (1 - p) * u;
      }
      var n = avail;
      out.fresh += n; out.recall += rec; out.reached += p * n;
      if (tries > 1) next[2] = (next[2] || 0) + (1 - p) * n;
      for (k in next) pending[k] += next[k];
      out.daily.push([n, rec]);
    }
    for (k in pending) out.left += pending[k];
    return out;
  }

  function money(c) {
    /* website and AI closers dial at their own pace (2026-10-27: AI 150-200 a day, websites 100) */
    var P = D.price, per = S.calls * S.days * c / 100, perA = S.aiCalls * S.days * c / 100;
    var st = function (amt) { return amt * P.stripe_pct / 100 + P.stripe_fixed; };
    var w = per * S.web, a = perA * S.ai, sales = w + a;
    var bonusEach = per >= P.bonus_at ? P.bonus : 0, bonusAi = perA >= P.bonus_at ? P.bonus : 0;
    var comm = w * P.web.comm + a * P.ai.comm, bonus = bonusEach * S.web + bonusAi * S.ai;
    var gross = sales * 500, stripe = sales * st(500);
    var keepWeb = P.web.mo - P.web.resid - st(P.web.mo), keepAi = P.ai.mo - P.ai.resid - st(P.ai.mo) - (P.ai_run || 0);
    var keepWeb2 = P.web.mo - st(P.web.mo);
    var months = [], cum = gross - comm - bonus - stripe, churn = (P.churn || 0) / 100;
    for (var m = 1; m <= 12; m++) {
      var live = Math.pow(1 - churn, m - 1);
      var kept = w * live * (m <= P.web.resid_n ? keepWeb : keepWeb2) + a * live * keepAi;
      cum += kept; months.push({ kept: kept, cum: cum });
    }
    return { per: per, web: w, ai: a, sales: sales, gross: gross, comm: comm, bonus: bonus, stripe: stripe,
      pocket: gross - comm - bonus - stripe, mo1: w * keepWeb + a * keepAi, year: months.reduce(function (s, x) { return s + x.kept; }, 0),
      months: months, webTake: per * P.web.comm + bonusEach, aiTake: perA * P.ai.comm + bonusAi, perA: perA };
  }

  function plan() {
    var p = S.pickup / 100, r = sim(S.calls, S.days, p, S.tries), rA = sim(S.aiCalls, S.days, p, S.tries);
    var buf = 1 + S.buffer / 100, free = S.codes === "free";
    /* 2026-10-27 night, Tyler: 500 built demos per website rep. "Have" = built demos on their sheets. */
    var T = D.target && D.target.per_web_rep, G = D.goal || {};
    var webNeed = T ? T * S.web : Math.ceil(r.fresh * S.web * buf), aiNeed = Math.ceil(rA.fresh * S.ai * buf);
    var webHave = T && G.have != null ? G.have : free ? D.web.in_codes : D.web.callable, aiHave = free ? D.ai.in_codes : D.ai.callable;
    var toBuild = Math.max(0, webNeed - webHave), per = D.build[S.route];
    var codes = {}; Object.keys(D.web.area_codes).concat(Object.keys(D.ai.area_codes)).forEach(function (c) { codes[c] = 1; });
    var bought = D.dnc.bought || [], nCodes = Object.keys(codes).length, paidCodes = free ? bought.length : Math.max(bought.length, nCodes - D.dnc.free.length);
    var seats = S.web + S.ai, owned = D.lines_owned || 3, extraLines = Math.max(0, seats - owned), calls = (S.calls * S.web + S.aiCalls * S.ai) * S.days;
    var cost = {
      builds: toBuild * per, dnc: paidCodes * D.dnc.per_code, lines: extraLines * 1.15, minutes: calls * 2 * 0.014,
    };
    cost.total = cost.builds + cost.dnc + cost.lines + cost.minutes;
    var B = D.build_status || {}, perDay = (B.per_lane_week || 300) / 7;
    var days1 = Math.ceil(toBuild / perDay), days2 = Math.ceil(toBuild / (2 * perDay));
    /* 2026-10-27: measured pace of the last 8 cities on the running build, one lane. */
    var R = B.run || {}, pace = (R.recent || {}).per_hour, hours = pace ? Math.ceil(toBuild / pace) : null;
    return { r: r, p: p, webNeed: webNeed, aiNeed: aiNeed, webHave: webHave, aiHave: aiHave, toBuild: toBuild, builds: Math.ceil(toBuild / D.build.pass),
      worst: S.calls * S.days * S.web, nCodes: nCodes, paidCodes: paidCodes, extraLines: extraLines, owned: owned, bought: bought, calls: calls, cost: cost,
      lo: money(S.lo), hi: money(S.hi), days1: days1, days2: days2, hours: hours, pace: pace };
  }

  /* ---------------- drawing ---------------- */
  var DIALS = [
    ["web", "Website closers", 0, 6, 1, "", "Each needs a demo for every new business they call."],
    ["ai", "AI Receptionist closers", 0, 3, 1, "", "They call from the AI Receptionist list, no demos needed. The plan is 2, maybe 3: slide to 3 to see the third."],
    ["calls", "Website calls a day, each", 20, 200, 5, "", "Every dial counts, answered or not. Each new business needs a demo."],
    ["aiCalls", "AI Receptionist calls a day, each", 20, 300, 5, "", "They call their own list, no demos needed, so they can dial more. You said 150 to 200."],
    ["days", "Calling days", 1, 6, 1, "", "Mon to Fri is 5. Calling is allowed Mon to Sat."],
    ["pickup", "Calls that settle a business", 5, 60, 1, "%", "Measured on Rep 1's first 18 calls: about 1 in 6 reaches the owner and settles it; the rest get called again. Also the owner pick-up."],
    ["tries", "Tries per business", 1, 3, 1, "", "A business that doesn't settle is called again the next day, up to this many times. The rep agreement caps it at 3."],
    ["lo", "Close rate, planning case", 0.1, 8, 0.05, "%", "Sales per call dialed. 0.5% is 3% of owner conversations at a 17% owner pick-up: a guess until demo week measures it. Same number as RAGER."],
    ["hi", "Close rate, good case", 0.1, 12, 0.05, "%", "Sales per call dialed. Twice the planning case."],
    ["buffer", "Spare demos", 0, 50, 5, "%", "Extra on top, so nobody runs dry if more owners say call back later."],
  ];

  function dial(d) {
    var v = S[d[0]];
    return '<div class="dial"><label for="d-' + d[0] + '">' + d[1] + '</label><output id="o-' + d[0] + '">' + v + d[5] + '</output>' +
      '<input type="range" id="d-' + d[0] + '" data-dial="' + d[0] + '" min="' + d[2] + '" max="' + d[3] + '" step="' + d[4] + '" value="' + v + '"><p>' + d[6] + "</p></div>";
  }
  function seg(k, opts, label, note) {
    return '<div class="dial"><label>' + label + '</label><span></span><div class="seg">' + opts.map(function (o) {
      return '<button type="button" data-seg="' + k + '" data-v="' + o[0] + '" class="' + (S[k] === o[0] ? "on" : "") + '">' + o[1] + "</button>"; }).join("") +
      "</div><p>" + note + "</p></div>";
  }

  function dayChart(r) {
    var W = 340, H = 130, L = 26, B = 18, T = 6, n = r.daily.length, bw = (W - L - 6) / n;
    var y = function (v) { return T + (H - T - B) * (1 - v / Math.max(1, S.calls)); }, g = "";
    [0, 0.5, 1].forEach(function (f) { var v = Math.round(S.calls * f);
      g += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.07)"/><text class="ax" x="' + (L - 5) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + "</text>"; });
    r.daily.forEach(function (dd, i) {
      var x = L + i * bw + 4, w = bw - 8;
      g += '<rect x="' + x + '" y="' + y(dd[0]) + '" width="' + w + '" height="' + (y(0) - y(dd[0])) + '" rx="3" fill="var(--blue)"/>';
      g += '<rect x="' + x + '" y="' + y(dd[0] + dd[1]) + '" width="' + w + '" height="' + (y(dd[0]) - y(dd[0] + dd[1])) + '" rx="3" fill="var(--amber)"/>';
      g += '<text class="ax" x="' + (x + w / 2) + '" y="' + (H - 5) + '" text-anchor="middle">Day ' + (i + 1) + "</text>";
    });
    return '<svg class="ch" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Calls per day, new and recall">' + g + "</svg>" +
      '<div class="key"><span><i style="background:var(--blue)"></i>New businesses (a demo each)</span><span><i style="background:var(--amber)"></i>Recall calls</span></div>';
  }

  function moneyChart(lo, hi) {
    var W = 340, H = 150, L = 40, B = 18, T = 8, max = Math.max(1, hi.months[11].cum, lo.months[11].cum);
    var x = function (m) { return L + (W - L - 8) * (m / 12); }, y = function (v) { return T + (H - T - B) * (1 - v / max); }, g = "";
    [0, 0.5, 1].forEach(function (f) { var v = max * f;
      g += '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.07)"/><text class="ax" x="' + (L - 5) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + $k(v) + "</text>"; });
    [0, 3, 6, 9, 12].forEach(function (m) { g += '<text class="ax" x="' + x(m) + '" y="' + (H - 4) + '" text-anchor="middle">' + (m ? "mo " + m : "week") + "</text>"; });
    function line(M, c) { var d = "M" + x(0) + "," + y(M.pocket); M.months.forEach(function (o, i) { d += "L" + x(i + 1).toFixed(1) + "," + y(o.cum).toFixed(1); });
      return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.4" stroke-linejoin="round"/>'; }
    return '<svg class="ch" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Cash you keep over the year from demo week">' + g +
      line(lo, "var(--amber)") + line(hi, "var(--green)") + "</svg>" +
      '<div class="key"><span><i style="background:var(--amber)"></i>' + S.lo + '% close</span><span><i style="background:var(--green)"></i>' + S.hi + "% close</span><span>" + D.price.churn + "% of customers cancel each month</span></div>";
  }

  /* The scale plan (2026-10-28, Tyler: "we're not going to stop at six ... replot everything"): the month-by-month
     model from control/scale.py, the same math as RAGER's Money chart. Banked money with the low and good close
     rates as a band; milestones labelled on the line (colourblind: labels on the marks, one hue). */
  function $m(v) { var a = Math.abs(v); return a >= 1e6 ? "$" + (v / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, "") + "M" : $k(v); }
  function scaleChart(Sc) {
    var R = Sc.rows, n = R.length, W = 340, H = 190, L = 44, B = 18, T = 10;
    var max = Math.max(1, R[n - 1].banked * 1.12);     // the plan line sets the scale; the good-case band is clipped
    var x = function (i) { return L + (W - L - 10) * (i / (n - 1)); }, y = function (v) { return T + (H - T - B) * (1 - Math.max(0, Math.min(v, max)) / max); }, g = "";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var v = max * f;
      g += '<line x1="' + L + '" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.07)"/><text class="ax" x="' + (L - 5) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + $m(v) + "</text>"; });
    R.forEach(function (r, i) { if (i % 6 === 1) g += '<text class="ax" x="' + x(i) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(r.label) + "</text>"; });
    var band = "M" + x(0) + "," + y(Sc.high[0]);
    for (var i = 1; i < n; i++) band += "L" + x(i).toFixed(1) + "," + y(Sc.high[i]).toFixed(1);
    for (i = n - 1; i >= 0; i--) band += "L" + x(i).toFixed(1) + "," + y(Sc.low[i]).toFixed(1);
    g += '<path d="' + band + 'Z" fill="rgba(96,165,250,.12)"/>';
    var d = ""; R.forEach(function (r, i) { d += (i ? "L" : "M") + x(i).toFixed(1) + "," + y(r.banked).toFixed(1); });
    g += '<path d="' + d + '" fill="none" stroke="var(--blue)" stroke-width="2.6" stroke-linejoin="round"/>';
    (Sc.milestones || []).filter(function (m) { return m.at >= 5e5; }).forEach(function (m) {
      var k = -1; R.forEach(function (r, j) { if (k < 0 && r.banked >= m.at) k = j; });
      if (k < 0) return;
      var px = x(k), py = y(R[k].banked), right = px > W - 110;
      g += '<circle cx="' + px + '" cy="' + py + '" r="4" fill="var(--bg)" stroke="var(--blue)" stroke-width="2"/>' +
        '<text x="' + (right ? px - 7 : px + 7) + '" y="' + (py + 4) + '" text-anchor="' + (right ? "end" : "start") + '" style="fill:var(--tx);font:600 10.5px JetBrains Mono,monospace">' + $m(m.at) + " " + esc(m.plan) + "</text>";
    });
    return '<svg class="ch" style="height:190px" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Money banked each month on the scale plan">' + g + "</svg>" +
      '<div class="key"><span><i style="background:var(--blue)"></i>Banked, ' + Sc.close_pct + '% of calls close</span><span><i style="background:rgba(96,165,250,.3)"></i>' + Sc.close_low_pct + "% to " + Sc.close_high_pct + "% close</span></div>";
  }
  function scaleHtml() {
    var Sc = D.scale;
    if (!Sc || !Sc.rows) return "";
    var M = {}; (Sc.milestones || []).forEach(function (m) { M[m.at] = m; });
    var tile = function (at, cls) { var m = M[at]; if (!m) return "";
      return '<div class="stat ' + cls + '"><b>' + esc(m.plan || "later") + "</b><u>" + $m(at) + " banked" + (m.was && m.was !== m.plan ? " · was " + esc(m.was) + " when hiring stopped at 6 + 6" : m.was ? "" : " · never on the old 6 + 6 plan") + "</u></div>"; };
    var rows = Sc.rows.filter(function (r) { return r.web + r.ai > 0; }).slice(0, 12), now = rows[0] || {};
    var tr = function (r) { return "<tr><td>" + esc(r.label) + "</td><td>" + r.web + "+" + r.ai + "</td><td>" + (r.hire_web + r.hire_ai ? "+" + r.hire_web + "/+" + r.hire_ai : "") + "</td><td>" + N(r.sales) + "</td><td>" + $k(r.mrr) + "</td><td>" + $m(r.banked) + "</td></tr>"; };
    return '<h2 id="scale">The scale plan<small>' + esc(Sc.rule) + "</small></h2>" +
      '<div class="grid">' + tile(5e5, "bl") + tile(1e6, "g") + tile(2e6, "v") +
      '<div class="stat a"><b>' + esc(Sc.mrr_100k || "later") + "</b><u>$100k a month coming in from monthly fees alone</u></div></div>" +
      '<div class="card" style="margin-top:8px">' + scaleChart(Sc) +
      '<table class="sct" style="margin-top:10px"><thead><tr><th>Month</th><th>Closers</th><th>Hire</th><th>Sales</th><th>Fees/mo</th><th>Banked</th></tr></thead><tbody>' +
      rows.map(tr).join("") + "</tbody></table>" +
      '<p class="note">Closers and Hire are website + AI Receptionist. To stay on plan in ' + esc(now.label || "") + ": " + N(now.sales || 0) + " sales and " + N((now.web || 0) + (now.ai || 0)) + " closers dialing. " +
      "Banked is after commission, Stripe, call minutes, the extra Claude accounts the demo build needs, and your " + $(Sc.bills) + " of monthly bills. " +
      "The close rate is a guess until demo week sells; the band runs from half the planning case to four times it (0.25% to 2% of calls). Same numbers as RAGER's Money tab.</p></div>";
  }

  /* the closers picked for demo week (assumptions.json team.closers, Nov 9) */
  function closersStat() {
    var K = D.closers || {}, w = K.web || [], a = K.ai || [], m = K.ai_maybe || [];
    if (!w.length && !a.length) return "";
    return '<div class="stat bl"><b>' + w.length + " + " + a.length + "</b><u>Closers picked · Website: " + esc(w.join(", ") || "none yet") +
      " · AI Receptionist: " + esc(a.join(", ") || "none yet") + (m.length ? " · maybe a 3rd AI: " + esc(m.join(", ")) : "") + ". Nobody signs before Alina clears the agreement</u></div>";
  }

  /* 2026-11-09, Tyler: "demo week gets us anywhere from 3.5 to 13.9k ... What close rate is that? And is that
     2 web and 3 AI?" The week's range explained: same team, only the close rate moves; a 3rd AI closer shown apart. */
  function whyHtml(lo, hi) {
    var P = D.price, row = function (label, a, b, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td><td>" + a + "</td><td>" + b + "</td></tr>"; };
    var owner = function (c) { return (c / S.pickup * 100).toFixed(1).replace(/\.0$/, "") + "%"; };
    var oneIn = function (c) { return (S.pickup / c).toFixed(1).replace(/\.0$/, ""); };
    var each = function (n, k) { return N(n) + (k > 1 ? " <em>(" + (n / k).toFixed(1).replace(/\.0$/, "") + " each)</em>" : ""); };
    var third = "";
    if (S.ai < 3) { var s0 = S.ai; S.ai = s0 + 1; var lo3 = money(S.lo), hi3 = money(S.hi); S.ai = s0;
      var who = ((D.closers || {}).ai_maybe || [])[0];
      third = row("With a 3rd AI closer" + (who ? " (" + esc(who) + ")" : ""), $k(lo3.pocket), $k(hi3.pocket)); }
    return '<h2 id="why">Why ' + $k(lo.pocket) + " to " + $k(hi.pocket) + "<small>Both numbers use the same team: " + S.web + " website + " + S.ai +
      " AI Receptionist closers. The only thing that changes is the close rate.</small></h2>" +
      '<div class="card"><table class="why"><thead><tr><th></th><th class="lo">Planning case</th><th class="hi">Good case</th></tr></thead><tbody>' +
      row("Close rate: calls dialed that buy", S.lo + "%", S.hi + "%", "big") +
      row("Same thing per owner who picks up", owner(S.lo) + " <em>(1 in " + oneIn(S.lo) + ")</em>", owner(S.hi) + " <em>(1 in " + oneIn(S.hi) + ")</em>") +
      row("Calls in the week", N((S.calls * S.web + S.aiCalls * S.ai) * S.days), N((S.calls * S.web + S.aiCalls * S.ai) * S.days)) +
      row("Website sales", each(lo.web, S.web), each(hi.web, S.web)) +
      row("AI Receptionist sales", each(lo.ai, S.ai), each(hi.ai, S.ai)) +
      row("Build fees in ($" + P.web.up + " each)", $(lo.gross), $(hi.gross)) +
      row("Closers' commission + bonuses", "-" + $(lo.comm + lo.bonus), "-" + $(hi.comm + hi.bonus)) +
      row("Stripe", "-" + $(lo.stripe), "-" + $(hi.stripe)) +
      row("You pocket from the week", $k(lo.pocket), $k(hi.pocket), "big") + third +
      "</tbody></table>" +
      '<p class="note">An AI closer sells twice what a website closer does because they dial twice as much (' + S.aiCalls + " a day vs " + S.calls +
      "; no demo needed), at the same close rate. The bonus is $" + P.bonus + " to a closer who makes " + P.bonus_at + " sales in a month, so the week only counts it for a closer who makes " + P.bonus_at + " inside that week. " +
      S.hi + "% is the top of your range: about 1 owner in " + oneIn(S.hi) + " who picks up says yes on the call. Nothing is measured yet (Rep 1's first 18 calls: no sale), so demo week is what tells you which column is real.</p></div>";
  }

  /* Months 1 to 6 if demo week starts next Monday (Tyler, Nov 9: "2 months, 3 months, 6 months, scaling MRR, as
     well as initial build fees plus revenue and profit splits"). Same prices and costs as money() above and
     RAGER's control/scale.py: a month is 4.33 weeks at the demo-week pace, nobody added; the monthly fee starts the
     month after the sale; churn a month from assumptions; the closer gets the monthly share for the first 12
     payments; the bonus when a closer makes 10 sales in a month; your bills are RAGER's Expenses total, plus call
     minutes and new demo builds past the Apify + Google already in those bills (scale.py APIFY_IN_BILLS = 299). */
  function months6(c) {
    var P = D.price, wk = 4.33, keep = 1 - (P.churn || 0) / 100;
    var st = function (a) { return a * P.stripe_pct / 100 + P.stripe_fixed; };
    var perW = S.calls * S.days * wk * c / 100, perA = S.aiCalls * S.days * wk * c / 100, sW = perW * S.web, sA = perA * S.ai;
    var demos = S.web * sim(S.calls, S.days, S.pickup / 100, S.tries).fresh * wk;
    var bills = (D.scale || {}).bills || 0, minutes = (S.calls * S.web + S.aiCalls * S.ai) * S.days * wk * 2 * 0.014;
    var builds = Math.max(0, demos * D.build[S.route] - 299);
    var bonus = (perW >= P.bonus_at ? P.bonus * S.web : 0) + (perA >= P.bonus_at ? P.bonus * S.ai : 0);
    var rows = [], cum = 0, T = { inn: 0, build: 0, fees: 0, comm: 0, share: 0, stripe: 0, airun: 0, mine: 0, keep: 0 };
    for (var i = 0; i < 6; i++) {
      var payW = 0, payA = 0, resW = 0, resA = 0;
      for (var j = 0; j < i; j++) {
        var n = i - j, live = Math.pow(keep, n - 1);
        payW += sW * live; payA += sA * live;
        if (n <= P.web.resid_n) resW += sW * live;
        if (!P.ai.resid_n || n <= P.ai.resid_n) resA += sA * live;
      }
      var o = { payW: payW, payA: payA, build: sW * P.web.up + sA * P.ai.up, fees: payW * P.web.mo + payA * P.ai.mo,
        comm: sW * P.web.comm + sA * P.ai.comm, share: resW * P.web.resid + resA * P.ai.resid + bonus,
        stripe: sW * st(P.web.up) + sA * st(P.ai.up) + payW * st(P.web.mo) + payA * st(P.ai.mo),
        airun: payA * (P.ai_run || 0), mine: bills + minutes + builds };
      o.inn = o.build + o.fees;
      o.keep = o.inn - o.comm - o.share - o.stripe - o.airun - o.mine;
      cum += o.keep; o.cum = cum;
      /* MRR = what bills every month from here on: this month's payers who stay + this month's new customers */
      o.custW = payW * keep + sW; o.custA = payA * keep + sA;
      o.mrr = o.custW * P.web.mo + o.custA * P.ai.mo;
      for (var k in T) T[k] += o[k];
      rows.push(o);
    }
    return { rows: rows, T: T, perW: perW, perA: perA, sW: sW, sA: sA, bills: bills, minutes: minutes, builds: builds, demos: demos, bonus: bonus };
  }
  function nextMonday() {
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d;
  }
  function mdate(d, addDays) { var x = new Date(d.getTime() + addDays * 864e5); return x.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function monthsChart(R) {
    var W = 400, H = 220, L = 46, B = 38, T = 20, n = R.length, bw = (W - L - 8) / n;
    var max = Math.max(1, Math.max.apply(null, R.map(function (o) { return o.inn; })) * 1.08);
    var y = function (v) { return T + (H - T - B) * (1 - v / max); }, g = "";
    [0, 0.5].forEach(function (f) { var v = max / 1.08 * f;
      g += '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="rgba(255,255,255,.07)"/><text class="ax" x="' + (L - 6) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + $k(v) + "</text>"; });
    R.forEach(function (o, i) {
      var x = L + i * bw + 6, w = bw - 12, yF = y(o.fees), yT = y(o.inn);
      g += '<rect x="' + x.toFixed(1) + '" y="' + yF.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (y(0) - yF).toFixed(1) + '" rx="3" fill="var(--blue)"/>';
      g += '<rect x="' + x.toFixed(1) + '" y="' + yT.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (yF - yT).toFixed(1) + '" rx="3" fill="rgba(96,165,250,.28)" stroke="rgba(96,165,250,.7)" stroke-dasharray="3 2"/>';
      g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (yT - 5).toFixed(1) + '" text-anchor="middle" style="fill:var(--tx);font:600 12px JetBrains Mono,monospace">' + $k(o.inn) + "</text>";
      if (y(0) - yF > 18) g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y(0) - 6).toFixed(1) + '" text-anchor="middle" style="fill:#0B0C10;font:600 11px JetBrains Mono,monospace">' + $k(o.fees) + "</text>";
      g += '<text class="ax" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 22) + '" text-anchor="middle" style="font-size:11px">Mo ' + (i + 1) + "</text>";
      g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle" style="fill:var(--green);font:600 11.5px JetBrains Mono,monospace">' + $k(o.keep) + "</text>";
    });
    return '<svg class="ch" style="height:auto;max-width:560px;margin:8px auto 0" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Money coming in each month, build fees and monthly fees, and what you keep">' + g + "</svg>" +
      '<div class="key"><span><i style="background:var(--blue)"></i>Monthly fees (number inside)</span><span><i style="background:rgba(96,165,250,.28);outline:1px dashed rgba(96,165,250,.7)"></i>Build fees, $500 a sale (dashed)</span><span><b style="color:var(--tx)">Top</b> = all money in</span><span><b style="color:var(--green)">Bottom</b> = you keep that month</span></div>';
  }
  function monthsHtml() {
    var c = S.mcase === "lo" ? S.lo : S.hi, M = months6(c), R = M.rows, P = D.price, pick = [0, 1, 2, 5];
    var start = nextMonday(), ends = pick.map(function (i) { return mdate(start, Math.round((i + 1) * 4.33 * 7) - 1); });
    var head = "<thead><tr><th></th>" + pick.map(function (i, k) { return "<th>Mo " + (i + 1) + "<br><em>to " + ends[k] + "</em></th>"; }).join("") + "</tr></thead>";
    var line = function (label, f, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td>" + pick.map(function (i) { return "<td>" + f(R[i]) + "</td>"; }).join("") + "</tr>"; };
    var grp = function (t) { return '<tr class="grp"><td colspan="5">' + t + "</td></tr>"; };
    var neg = function (v) { return v ? "-" + $m(v) : "$0"; };
    var tile = function (i, cls) { var o = R[i];
      return '<div class="stat ' + cls + '"><b>' + $m(o.mrr) + "<em>/mo</em></b><u>MRR after " + (i + 1) + " months (to " + mdate(start, Math.round((i + 1) * 4.33 * 7) - 1) + "): " +
        N(o.custW) + " website + " + N(o.custA) + " AI customers paying monthly. You've kept " + $m(o.cum) + " by then</u></div>"; };
    var T = M.T, pct = function (v) { return T.inn ? Math.round(v / T.inn * 100) : 0; };
    var split = function (label, v, note, cls) {
      return '<div class="split' + (cls ? " " + cls : "") + '"><div><b>' + label + "</b><span>" + $m(v) + " · " + pct(v) + '%</span></div><i><s style="width:' + Math.max(0, pct(v)) + '%"></s></i><p>' + note + "</p></div>"; };
    return '<h2 id="months">If demo week starts next week: months 1 to 6<small>Starting Mon ' + mdate(start, 0) + ". The same " + S.web + " website + " + S.ai +
      " AI Receptionist closers keep the demo-week pace every week after; nobody added. A month here is 4.33 weeks from that Monday.</small></h2>" +
      '<div class="card" style="padding:10px 14px"><div class="seg" style="margin-top:0">' +
      '<button type="button" data-seg="mcase" data-v="lo" class="' + (S.mcase === "lo" ? "on" : "") + '">Planning case, ' + S.lo + "% close</button>" +
      '<button type="button" data-seg="mcase" data-v="hi" class="' + (S.mcase !== "lo" ? "on" : "") + '">Good case, ' + S.hi + "% close</button></div>" +
      '<p class="note">' + N(M.sW) + " website + " + N(M.sA) + " AI Receptionist sales a month at " + c + "% (" + M.perW.toFixed(1).replace(/\.0$/, "") + " per website closer, " + M.perA.toFixed(1).replace(/\.0$/, "") + " per AI closer).</p></div>" +
      '<div class="grid" style="margin-top:8px">' + tile(1, "bl") + tile(2, "v") + tile(5, "g") +
      '<div class="stat a"><b>' + $m(T.build) + "</b><u>Build fees over 6 months ($" + P.web.up + " day one, " + N((M.sW + M.sA) * 6) + " sales) vs " + $m(T.fees) + " of monthly fees. Months 1 to 6, all money in: " + $m(T.inn) + "</u></div></div>" +
      '<div class="card" style="margin-top:8px"><div class="lbl">Money in each month, and what you keep</div>' + monthsChart(R) +
      '<p class="note">Build fees stay flat because the team stays the same size. Monthly fees stack up: every customer keeps paying until they cancel (' + P.churn + "% a month), so MRR is what keeps growing. Month 1 has no monthly fees yet: the first $" + P.web.mo + " or $" + P.ai.mo + " bills a month after the sale.</p></div>" +
      '<div class="card"><div class="lbl">Month by month</div><div class="scx"><table class="mo">' + head + "<tbody>" +
      grp("Customers") +
      line("New sales that month", function (o) { return N(M.sW + M.sA); }) +
      line("Paying monthly that month", function (o) { return N(o.payW + o.payA); }) +
      grp("Money in") +
      line("Build fees ($" + P.web.up + " each)", function (o) { return $m(o.build); }) +
      line("Monthly fees", function (o) { return $m(o.fees); }) +
      line("Total in", function (o) { return $m(o.inn); }, "big") +
      grp("Where it goes") +
      line("Closers: day-one commission", function (o) { return neg(o.comm); }) +
      line("Closers: monthly share + bonus", function (o) { return neg(o.share); }) +
      line("Stripe", function (o) { return neg(o.stripe); }) +
      line("AI Receptionist running cost", function (o) { return neg(o.airun); }) +
      line("Your bills, minutes, demo builds", function (o) { return neg(o.mine); }) +
      line("You keep that month", function (o) { return $m(o.keep); }, "big g") +
      line("You keep, total so far", function (o) { return $m(o.cum); }, "big") +
      line("MRR at month end", function (o) { return $m(o.mrr); }) +
      "</tbody></table></div>" +
      '<p class="note">Your costs each month: ' + $(M.bills) + " of bills (RAGER's Expenses tab), " + $(M.minutes) + " of call minutes, " + $(M.builds) +
      " for about " + N(M.demos) + " new website demos past what Apify and Google already cost in those bills. One-time setup costs (area codes, the demos still to build, lawyers) are in Costs below, not here.</p></div>" +
      '<div class="card"><div class="lbl">Where every dollar goes, months 1 to 6 (' + $m(T.inn) + " in)</div>" +
      split("Closers", T.comm + T.share, "Day-one commission $" + P.web.comm + " a website sale, $" + P.ai.comm + " an AI sale; then $" + P.web.resid + " or $" + P.ai.resid + " a month for the first " + P.web.resid_n + " payments; $" + P.bonus + " bonus for " + P.bonus_at + " sales in a month.") +
      split("Stripe", T.stripe, P.stripe_pct + "% + 30 cents on every payment.") +
      split("AI Receptionist running cost", T.airun, "About $" + (P.ai_run || 0).toFixed(2) + " a customer a month (calls, voice, phone number).") +
      split("Your bills and costs", T.mine, "Bills, call minutes, demo builds.") +
      split("You keep", T.keep, "Before taxes.", "g") + "</div>" +
      perSaleHtml() +
      '<div class="warn">' + (c >= 1 ? "This is the good case. " + N(M.sW + M.sA) + " new customers a month means about " + N((M.sW + M.sA) / 21.7) + " sites or receptionists to set up every working day, and " + N(M.demos / 4.33) + " new website demos a week (one Claude account builds about " + N((D.scale || {}).demos_per_account_wk || 500) + "). " : "") +
      "No close rate is measured yet, so treat every number here as a what-if until demo week sells. Same prices and costs as RAGER's Money tab.</div>";
  }
  /* One sale, split: who gets what of the $500 and of each monthly payment (prices from assumptions.json). */
  function perSaleHtml() {
    var P = D.price, st = function (a) { return a * P.stripe_pct / 100 + P.stripe_fixed; }, run = P.ai_run || 0;
    var r = function (label, a, b, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td><td>" + a + "</td><td>" + b + "</td></tr>"; };
    var c2 = function (v) { return "$" + v.toFixed(2); };
    return '<div class="card"><div class="lbl">Every sale, split</div><table><thead><tr><th></th><th>Website</th><th>AI Receptionist</th></tr></thead><tbody>' +
      r("Day one, the customer pays", c2(P.web.up), c2(P.ai.up), "big") +
      r("Closer", "-" + c2(P.web.comm), "-" + c2(P.ai.comm)) +
      r("Stripe", "-" + c2(st(P.web.up)), "-" + c2(st(P.ai.up))) +
      r("You keep", c2(P.web.up - P.web.comm - st(P.web.up)), c2(P.ai.up - P.ai.comm - st(P.ai.up)), "big g") +
      r("Every month after, the customer pays", c2(P.web.mo), c2(P.ai.mo), "big") +
      r("Closer (first " + P.web.resid_n + " payments)", "-" + c2(P.web.resid), "-" + c2(P.ai.resid)) +
      r("Stripe", "-" + c2(st(P.web.mo)), "-" + c2(st(P.ai.mo))) +
      r("Running cost", "$0.00", "-" + c2(run)) +
      r("You keep each month", c2(P.web.mo - P.web.resid - st(P.web.mo)), c2(P.ai.mo - P.ai.resid - st(P.ai.mo) - run), "big g") +
      r("After payment " + P.web.resid_n + ", you keep", c2(P.web.mo - st(P.web.mo)), c2(P.ai.mo - st(P.ai.mo) - run)) +
      "</tbody></table><p class=\"note\">Plus the $" + P.bonus + " bonus to a closer in any month they make " + P.bonus_at + " sales (both products count). Hosting and your time aren't in these numbers.</p></div>";
  }

  function render(dialsOnly) {
    if (!D) return;
    var x = plan(), r = x.r, lo = x.lo, hi = x.hi, seats = S.web + S.ai, rA = sim(S.aiCalls, S.days, x.p, S.tries);
    var perOwner = function (c) { return (c / S.pickup * 100).toFixed(1).replace(/\.0$/, ""); };
    var row = function (label, a, b, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td><td>" + a + "</td><td>" + b + "</td></tr>"; };
    var c = D.costs;
    var top =
      '<p class="lead">' + esc(D.week.label) + " · " + S.web + " website closers at " + S.calls + " calls a day + " + S.ai + " AI Receptionist closers at " + S.aiCalls + (D.defaults.ai_maybe > S.ai ? " (maybe " + D.defaults.ai_maybe + ")" : "") + " · " + S.days + " days</p>" +
      '<nav class="nav"><a href="#answer">Answer</a><a href="#why">Why</a><a href="#months">Months 1-6</a><a href="#scale">Scale</a><a href="#build">Build</a><a href="#money">Money</a><a href="#demos">Demos</a><a href="#codes">Area codes</a><a href="#recalls">Recalls</a><a href="#costs">Costs</a><a href="#status">Status</a><a href="#dials">Assumptions</a></nav>' +

      '<h2 id="answer">The short answer</h2><div class="grid">' +
      '<div class="stat bl"><b>' + N(x.webHave) + ' <em>of</em> ' + N(x.webNeed) + '</b><u>Built demos toward the goal' + (D.goal && D.goal.reps ? " (" + D.goal.reps.map(function (r) { return r.label.replace("Website ", "") + " " + N(r.have); }).join(", ") + ")" : "") + (D.goal && D.goal.callable != null ? ". " + N(D.goal.callable) + " are in area codes you can call" : "") + '</u></div>' +
      '<div class="stat a"><b>' + N(x.toBuild) + '</b><u>Still to build' + (D.target ? " (" + N(D.target.per_web_rep) + " per website rep)" : "") + "</u></div>" +
      '<div class="stat"><b>' + $k(lo.pocket) + ' <em>to</em> ' + $k(hi.pocket) + '</b><u>You pocket from the week, before your bills (' + S.lo + "% to " + S.hi + "% close, a guess until someone buys)</u></div>" +
      '<div class="stat g"><b>+' + $k(lo.mo1) + ' <em>to</em> ' + $k(hi.mo1) + '</b><u>Added every month after</u></div>' +
      '<div class="stat"><b>' + $(x.cost.total) + '</b><u>Cash still to spend getting ready (builds, ' + x.paidCodes + ' area codes, minutes)</u></div>' +
      /* 2026-10-27: the free-code cities left set what can still be built, not the build's speed */
      (D.goal && x.toBuild
        ? '<div class="stat v"><b>~' + N(D.goal.coming) + '</b><u>More coming from the ' + N(D.goal.cities_left) + " runs queued, estimate" + (D.goal.eta ? "; the goal around " + esc(D.goal.eta) + " if it runs nonstop" : D.goal.short ? "; ends ~" + N(D.goal.short) + " short, more metros get added" : "") + "</u></div>"
        : x.hours != null
        ? '<div class="stat v"><b>' + (x.toBuild ? (x.hours < 48 ? "~" + x.hours + " hrs" : "~" + Math.ceil(x.hours / 24) + " days") : "Done") + "</b><u>" + (x.toBuild ? "To build them at today's pace (" + x.pace + " an hour, measured)" : "Enough demos built") + "</u></div>"
        : '<div class="stat v"><b>' + x.days2 + ' <em>to</em> ' + x.days1 + ' days</b><u>To build them (2 or 1 Claude lanes)</u></div>') +
      (function () { var O = D.web.on_sheets || {}, Q = D.photo_requests || {};
        return '<div class="stat a"><b>' + N(O.nodemo || 0) + '</b><u>No demo yet, on the sheets to call (Website Rep 1 ' + N(O.nodemo_rep1 || 0) + ", Rep 2 " + N(O.nodemo_rep2 || 0) + ", Rep 3 " + N(O.nodemo_rep3 || 0) + ")</u></div>" +
          '<div class="stat g"><b>' + N(Q.total || 0) + '</b><u>Said yes to a preview · ' + N(Q.photos_in || 0) + " sent photos</u></div>"; })() + "</div>" +
      '<p class="note">' + (D.target && D.goal && D.goal.reps
        /* 2026-10-27: "have" = built demos on each website rep's sheet; callable = in the free 5 or the 8 codes being bought */
        ? "Built demos only. Your reps' sheets hold " + N(x.webHave) + ": " + D.goal.reps.map(function (r) { return r.label + " " + N(r.have); }).join(", ") +
          ", against " + N(D.target.per_web_rep) + " each. " + N(D.goal.callable) + " of them are in area codes a closer can call once the " + N((D.goal.bought_codes || []).length) +
          " codes you're buying are downloaded; the rest are in codes not bought yet." +
          (D.web.on_sheets && D.web.on_sheets.nodemo ? " The " + N(D.web.on_sheets.nodemo) + " with no demo yet are on the sheets too: closers offer a free preview, the owner texts photos, and the demo is built that night." : "")
        : S.codes === "free"
        ? "Built demos only. " + N(D.web.callable) + " are built in California and Nevada" + (D.web.on_sheets ? ", on your reps' sheets: Website Rep 1 " + N(D.web.on_sheets.rep1) + ", Rep 2 " + N(D.web.on_sheets.rep2) + ", Rep 3 " + N(D.web.on_sheets.rep3 || 0) + " (the goal is " + N((D.target || {}).per_web_rep || 0) + " each)" : "") +
          ", but only " + N(x.webHave) + " are inside the 5 free area codes, the only ones a closer can call once the Do Not Call list is in. So \"have\" is " + N(x.webHave) + "." +
          (D.web.on_sheets && D.web.on_sheets.nodemo ? " The " + N(D.web.on_sheets.nodemo) + " with no demo yet are on the sheets too: closers offer a free preview, the owner texts photos, and the demo is built that night." : "")
        : "The demos on your reps' lists (Rep 1 and Rep 2) are the " + N(x.webHave) + " counted here, not extra.") + "</p>" +
      whyHtml(lo, hi) + monthsHtml() + scaleHtml() + buildHtml(x);
    var dialsHtml =
      '<details class="adv"><summary><h2 id="dials">Assumptions<small>Tap to change closers, calls, pickup or close rates. The page redoes the math.</small></h2></summary><div class="card">' + DIALS.map(dial).join("") +
      seg("codes", [["free", "Free 5 + the ones you're buying"], ["all", "All of CA and NV"]], "Where they can call",
        "The Do Not Call download is the 5 free area codes (" + D.dnc.free.join(", ") + "). All of California and Nevada is " + x.nCodes + " area codes, $" + D.dnc.per_code + " each a year after the first 5.") +
      seg("route", [["apify", "This run, ~$" + D.build.apify.toFixed(2)], ["google", "Google only, ~$" + D.build.google.toFixed(2)]], "Demo build cost, per demo",
        (D.build.measured ? "Measured on this run: Apify plus Google, divided by demos that passed. " : "Measured on past runs. ") +
        "About " + Math.round(D.build.pass * 100) + " in 100 qualified businesses pass every check, and the cost is per demo that passes.") + "</div></details>";
    var rest =
      '<h2 id="recalls">Calls and recalls<small>One website closer\'s week; the last column adds the AI Receptionist closers, who dial more. A business that doesn\'t pick up gets called again the next day, up to ' + S.tries + " tries.</small></h2>" +
      '<div class="card"><table><thead><tr><th></th><th>Each website closer</th><th>All ' + seats + "</th></tr></thead><tbody>" +
      row("Calls", N(S.calls * S.days), N(S.calls * S.days * S.web + S.aiCalls * S.days * S.ai)) +
      row("New businesses called", N(r.fresh), N(r.fresh * S.web + rA.fresh * S.ai)) +
      row("Recall calls", N(r.recall), N(r.recall * S.web + rA.recall * S.ai)) +
      row("Owners reached", N(r.reached), N(r.reached * S.web + rA.reached * S.ai)) +
      row("Callbacks left for week 2", N(r.left), N(r.left * S.web + rA.left * S.ai)) +
      "</tbody></table>" + dayChart(r) +
      '<p class="note">Without recalls a closer would need ' + N(S.calls * S.days) + " new businesses a week. Recalls bring it to " + N(r.fresh) + ".</p></div>" +

      '<h2 id="demos">Demos<small>Website closers only. AI Receptionist closers call from their own list.</small></h2><div class="card"><table><tbody>' +
      row("Needed, with recalls and " + S.buffer + "% spare", "", N(x.webNeed), "big") +
      row("Ready to call now" + (S.codes === "free" ? ", inside the free area codes" : ", California + Nevada"), "", N(x.webHave)) +
      row("Still to build", "", N(x.toBuild), "big") +
      row("Businesses to build (" + Math.round(D.build.pass * 100) + " in 100 pass)", "", N(x.builds)) +
      row("Build cost", "", $(x.cost.builds)) +
      row("If nobody is called twice", "", N(x.worst)) +
      "</tbody></table>" +
      (S.ai ? '<p class="note">AI Receptionist list: ' + N(x.aiHave) + " ready" + (S.codes === "free" ? " in the free area codes" : "") + ", " + N(x.aiNeed) + " needed. " + (x.aiHave >= x.aiNeed ? "Enough." : "Short by " + N(x.aiNeed - x.aiHave) + ".") + "</p>" : "") +
      (S.codes === "free" ? '<div class="warn">Only ' + N(D.web.in_codes) + " of the " + N(D.web.callable) + " ready California and Nevada demos are in the 5 free area codes. New demos must come from those area codes too (" + D.dnc.free.join(", ") + "), or you pay for more area codes.</div>" : "") +
      "</div>" + codesHtml(x) +

      '<h2 id="money">Money from the week<small>' + S.lo + "% of calls = " + perOwner(S.lo) + "% of owners reached. " + S.hi + "% = " + perOwner(S.hi) + "%.</small></h2>" +
      '<div class="card"><table><thead><tr><th></th><th class="lo">' + S.lo + '%</th><th class="hi">' + S.hi + "%</th></tr></thead><tbody>" +
      row("Website sales", N(lo.web), N(hi.web)) + (S.ai ? row("AI Receptionist sales", N(lo.ai), N(hi.ai)) : "") +
      row("Gross ($500 each)", $(lo.gross), $(hi.gross), "big") +
      row("Commission", "-" + $(lo.comm), "-" + $(hi.comm)) +
      row("10-sale bonuses", "-" + $(lo.bonus), "-" + $(hi.bonus)) +
      row("Stripe fees", "-" + $(lo.stripe), "-" + $(hi.stripe)) +
      row("You pocket", $(lo.pocket), $(hi.pocket), "big") +
      (S.web ? row("Each website closer earns", $(lo.webTake), $(hi.webTake)) : "") +
      (S.ai ? row("Each AI closer earns", $(lo.aiTake), $(hi.aiTake)) : "") +
      "</tbody></table></div>" +
      '<div class="card"><table><thead><tr><th>Monthly, from this one week</th><th class="lo">' + S.lo + '%</th><th class="hi">' + S.hi + "%</th></tr></thead><tbody>" +
      row("You keep in month 1", $(lo.mo1), $(hi.mo1), "big") +
      row("You keep over 12 months", $(lo.year), $(hi.year)) +
      row("Week plus 12 months, total", $(lo.months[11].cum), $(hi.months[11].cum), "big") +
      "</tbody></table>" + moneyChart(lo, hi) +
      '<p class="note">Website: $50 a month, the closer gets $10 for 12 months. AI Receptionist: $100 a month, the closer gets $20 for the first 12 payments. Stripe comes off every payment, and so does the AI Receptionist\'s running cost, about $' + (D.price.ai_run || 0).toFixed(2) + ' a customer a month. Every number here comes from the same assumptions file as RAGER' + (D.assumptions_updated ? ' (updated ' + esc(D.assumptions_updated) + ')' : '') + '.</p></div>' +

      '<h2 id="costs">Costs to get ready<small>What you pay before and during demo week.</small></h2><div class="card">' +
      cost("Demo builds", $(x.cost.builds), N(x.toBuild) + " demos at ~$" + D.build[S.route].toFixed(2) + (D.build.measured && S.route === "apify" ? ", this run's average so far. The small towns left cost more per demo than the big cities did." : ".")) +
      cost("Extra Do Not Call area codes", $(x.cost.dnc), S.codes === "free" ? (x.bought.length ? "The " + x.bought.length + " you're buying (" + x.bought.join(", ") + "), $" + D.dnc.per_code + " each for a year. The other 5 are free." : "None: you stay inside the 5 free area codes.") : x.paidCodes + " area codes past the free 5, at $" + D.dnc.per_code + " each for a year.") +
      cost("Extra phone lines", $(x.cost.lines) + "/mo", x.extraLines ? x.extraLines + " more line" + (x.extraLines > 1 ? "s" : "") + " for " + seats + " closers (you own " + x.owned + ")." : "You own " + x.owned + " lines; enough for " + seats + " closer" + (seats === 1 ? "" : "s") + ".") +
      cost("Call minutes", $(x.cost.minutes), N(x.calls) + " calls at about 2 minutes, $0.014 a minute.") +
      '<div class="costrow"><b>Total to get ready</b><span>' + $(x.cost.total) + "</span></div></div>" +
      '<div class="card"><div class="lbl" style="font:10px JetBrains Mono,monospace;letter-spacing:.14em;color:var(--mu);margin-bottom:6px">ALREADY PAYING OR BY QUOTE</div>' +
      c.map(function (k) { return cost(k[0], k[1] == null ? "by quote" : typeof k[1] === "string" ? k[1] + " " + k[2] : (k[1] < 1 ? "$" + k[1] : $(k[1])) + " " + k[2], k[3]); }).join("") + "</div>" +

      '<h2 id="status">Where things stand</h2><div class="grid">' + closersStat() +
      '<div class="stat"><b>' + D.applicants.websites.total + '</b><u>Website applicants · ' + D.applicants.websites.good + " worth a call</u></div>" +
      '<div class="stat"><b>' + D.applicants.ai.total + '</b><u>AI Receptionist applicants · ' + D.applicants.ai.good + " worth a call</u></div></div>" +
      '<div class="card" style="margin-top:8px"><ul class="open">' + D.open.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul>" +
      '<p class="note"><a href="/hiring">See every applicant</a></p></div>';
    if (!dialsOnly || !document.getElementById("p-top")) {
      app.innerHTML = '<div id="p-top"></div><div id="p-rest"></div><div id="p-dials"></div>';
      document.getElementById("p-dials").innerHTML = dialsHtml;
    } else {
      DIALS.forEach(function (d) { var o = document.getElementById("o-" + d[0]), i = document.getElementById("d-" + d[0]);
        if (o) o.textContent = S[d[0]] + d[5]; if (i && document.activeElement !== i) i.value = S[d[0]]; });
      app.querySelectorAll("[data-seg]").forEach(function (b) { b.classList.toggle("on", S[b.getAttribute("data-seg")] === b.getAttribute("data-v")); });
    }
    document.getElementById("p-top").innerHTML = top;
    document.getElementById("p-rest").innerHTML = rest;
  }
  /* Build tonight (2026-10-26). Tyler: "if I wanted to kick it off tonight, what do I need to do?"
     Live from his PC: Apify room, Claude lanes, the city queue, disk, whether the runner is on. */
  function buildHtml(x) {
    var B0 = D.build_status || {}, R0 = B0.run || {};
    if (R0.passed != null) return liveBuildHtml(x, B0, R0);
    return startBuildHtml(x);
  }
  /* 2026-10-27: the build has been running since Oct 26. Show where it is, measured, instead of how to start it. */
  function liveBuildHtml(x, B, R) {
    var A = B.apify || {}, rec = R.recent || {}, exp = R.expected_left, short = exp != null ? x.toBuild - exp : null;
    var chip = function (ok, label, val) { return '<div class="bchip ' + (ok ? "ok" : "no") + '"><i></i><span>' + label + "</span><b>" + val + "</b></div>"; };
    var aiShort = Math.max(0, x.aiNeed - x.aiHave);
    return '<h2 id="build">The demo build<small>' + (B.running ? "Running now" : "Stopped") + " · " + N(R.passed) + " demos passed since Oct 26 · " + $(R.spent || 0) + " spent, ~$" + (R.per_demo || 0).toFixed(2) + " each</small></h2>" +
      '<div class="card bchips">' +
      chip(!!B.running, "Build running now", B.running ? "Yes · " + esc(R.city || "") + (R.rep ? " (" + esc(R.rep) + ")" : "") : "No") +
      chip(true, "Demos passed this run", N(R.passed)) +
      chip(x.toBuild === 0 || (exp || 0) >= x.toBuild, "Still needed for demo week", N(x.toBuild)) +
      chip((R.cities_left || 0) > 0, "Cities left (free area codes)", N(R.cities_left || 0)) +
      chip((R.google || 0) < (R.google_cap || 100) * 0.9, "Google spent this run", $(R.google || 0) + " of " + $(R.google_cap || 100)) +
      chip((A.left || 0) >= 10, "Apify left this month", A.left != null ? $(A.left) + " of " + $(A.limit) : "?") +
      chip(B.lanes_ready >= 2, "Claude lanes signed in", (B.lanes_ready || 1) + " of 2") +
      chip((B.disk_gb || 0) >= 10, "Free disk space", (B.disk_gb != null ? B.disk_gb + " GB" : "?")) + "</div>" +
      '<div class="card"><ol class="steps">' +
      "<li><b>Where it is:</b> " + (B.running ? esc(R.city || "") + ", " + esc((R.stage || "").toLowerCase()) + (R.minutes != null ? ", " + R.minutes + " min in" : "") + ". " : "not running. ") +
        "The last " + (rec.cities || 0) + " cities passed " + (rec.passed || 0) + " demos in " + (rec.hours || 0) + " hours, about " + (rec.per_city || 0) + " a city.</li>" +
      (exp != null ? "<li><b>" + (short > 0 ? "Short about " + N(short) + "." : "Enough.") + "</b> The " + N(R.cities_left || 0) + " cities left should give about " + N(exp) + " more at that rate, against " + N(x.toBuild) + " still needed." +
        (short > 0 ? " Past that, new demos need more Do Not Call area codes ($" + D.dnc.per_code + " each a year), because the free 5 are nearly used up." : "") + "</li>" : "") +
      "<li><b>Optional, twice as fast: sign your second Claude account into lane 2.</b> One command in PowerShell, then sign in.</li>" +
      '<li><b>Leave the PC on.</b> A restart stops the build. If it restarts, tell Claude "restart the build".</li></ol>' +
      (S.ai ? '<p class="note">AI Receptionist: ' + N(x.aiHave) + " leads ready in the free area codes, " + N(x.aiNeed) + " needed for " + S.ai + " closers" +
        (aiShort ? ". Short " + N(aiShort) + ". Another 1,000 leads is a small Apify pull, no demos, and can run alongside the build." : ". Enough.") + "</p>" : "") +
      (S.web > 3 ? '<div class="warn">You have 3 website areas today: Website Rep 1 LA and Orange County, Rep 2 Northern California and Nevada, Rep 3 San Diego and the Inland Empire. A fourth website closer needs their own area so nobody calls the same business. For example: Rep 1 the 818 area, Rep 2 the 408 and 209 areas, Rep 3 the 619 and 702 areas.</div>' : "") +
      "</div>";
  }
  function startBuildHtml(x) {
    var B = D.build_status || {}, A = B.apify || {}, C = B.cities || {}, cost = x.cost.builds;
    var need = Math.max(0, cost - (A.left || 0)), raiseTo = Math.ceil(((A.used || 0) + cost + 20) / 50) * 50;
    var chip = function (ok, label, val) { return '<div class="bchip ' + (ok ? "ok" : "no") + '"><i></i><span>' + label + "</span><b>" + val + "</b></div>"; };
    var codes = Object.keys(C.by_code || {}).map(function (k) { return k + " (" + C.by_code[k] + ")"; }).join(", ");
    var aiShort = Math.max(0, x.aiNeed - x.aiHave);
    return '<h2 id="build">Build the demos tonight<small>' + N(x.toBuild) + " demos, about " + $(cost) + ". What has to be true, live from your PC.</small></h2>" +
      '<div class="card bchips">' +
      chip((A.left || 0) >= cost, "Apify money left this month", A.left != null ? $(A.left) + " of " + $(A.limit) : "?") +
      chip(B.lanes_ready >= 2, "Claude lanes signed in", (B.lanes_ready || 1) + " of 2") +
      chip((C.free_code || 0) > 0, "Cities queued (free area codes)", N(C.free_code || 0)) +
      chip((B.disk_gb || 0) >= 10, "Free disk space", (B.disk_gb != null ? B.disk_gb + " GB" : "?")) +
      chip(!!B.running, "Build running now", B.running ? "Yes" : "No") + "</div>" +
      '<div class="card"><ol class="steps">' +
      /* Apify's Starter plan can't spend past $100 a month (help.apify.com "Reaching platform limits",
         checked 2026-10-26); Scale ($199) goes to $1,000 and its $199 is prepaid usage, not a fee on top. */
      (need > 0 && (A.limit || 0) <= 100
        ? '<li><b>Upgrade Apify to the Scale plan ($199), then set the limit to about ' + $(raiseTo) + ".</b> You do this one. Your Starter plan can't go past $100 a month, and only " + $(A.left || 0) +
          " is left. In Apify: Billing, then Subscription, then Upgrade (you pay only the days left in this cycle). Then Billing, then Limits, then Edit limit. The $199 is prepaid usage the build spends, not a fee on top. This build needs about " +
          $(cost) + ". Drop back to Starter once the demos are built.</li>"
        : '<li><b>Raise the Apify limit to about ' + $(raiseTo) + ".</b> You do this one: Apify, then Billing, then Limits. Only " + $(A.left || 0) +
          " is left until it resets " + esc(A.resets || "Oct 31") + ". This build needs about " + $(cost) + (need > 0 ? ", so about " + $(need) + " more." : ".") + "</li>") +
      '<li><b>Optional, twice as fast: sign your second Claude account into lane 2.</b> One command in PowerShell, then sign in. One lane takes about ' + x.days1 + " days, two lanes about " + x.days2 + ".</li>" +
      '<li><b>Tell Claude "start the build".</b> It runs the ' + N(C.free_code || 0) + " queued cities, all inside the free area codes: " + esc(codes) + ". Nothing starts or spends until you say so.</li>" +
      "<li><b>Leave the PC on.</b> A restart stops the build. The counts on this page update as demos pass.</li></ol>" +
      (S.ai ? '<p class="note">AI Receptionist: ' + N(x.aiHave) + " leads ready in the free area codes, " + N(x.aiNeed) + " needed for " + S.ai + " closers" +
        (aiShort ? ". Short " + N(aiShort) + ". Another 1,000 leads is a small Apify pull, no demos, and can run alongside the build." : ". Enough.") + "</p>" : "") +
      (S.web > 3 ? '<div class="warn">You have 3 website areas today: Website Rep 1 LA and Orange County, Rep 2 Northern California and Nevada, Rep 3 San Diego and the Inland Empire. A fourth website closer needs their own area so nobody calls the same business. For example: Rep 1 the 818 area, Rep 2 the 408 and 209 areas, Rep 3 the 619 and 702 areas.</div>' : "") +
      "</div>";
  }
  /* Extra Do Not Call area codes, ranked by demos already built there (2026-10-27, Tyler: "work it out").
     Each one unlocks its ready demos the day the registry download is redone; no new builds. */
  function codesHtml(x) {
    var E = (D.dnc || {}).extra || [];
    if (!E.length) return "";
    var per = D.dnc.per_code, gap = Math.max(0, x.webNeed - D.web.in_codes);
    var waiting = E.reduce(function (s, e) { return s + e.web; }, 0), two = E.slice(0, 2);
    var rows = E.map(function (e) {
      return "<tr" + (two.indexOf(e) >= 0 ? ' class="big"' : "") + "><td><b>" + esc(e.code) + "</b> " + esc(e.where) + " · " + esc(e.rep) +
        (e.towns && e.towns.length ? '<br><span style="color:var(--mu);font-size:12px">To build: ' + esc(e.towns.join(", ")) + "</span>" : "") +
        "</td><td>" + N(e.web) + "</td><td>" + (e.towns ? N(e.towns.length) : 0) + "</td><td>~" + N(e.est) + "</td></tr>";
    }).join("");
    return '<h2 id="codes">More area codes<small>$' + per + " each a year. Built demos already on the reps' sheets, plus towns never built.</small></h2>" +
      '<div class="card"><p class="note" style="margin-top:0"><b>Short ' + N(gap) + " website demos inside the free 5.</b> No area code closes that alone. " +
      "Your reps' sheets already hold " + N(D.web.on_sheets ? D.web.on_sheets.other : waiting) + " built demos outside the free 5; each code below makes its share callable. " +
      "The towns are cities on hold that have never been built; each is an estimate of about " + N(5) + " demos, from what the free-code towns gave.</p>" +
      '<table><thead><tr><th>Area code</th><th>Built</th><th>Towns</th><th>Total, est.</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<p class="note">Highlighted = the best two. "Built" is real: demos on the sheets today. "Total" adds about 5 per town, an estimate. Website Rep 1 is LA and Orange County, Rep 3 San Diego and the Inland Empire, Rep 2 Northern California and Nevada. Every new code needs a fresh registry download and scrub before anyone dials it.</p></div>';
  }
  function cost(a, b, note) { return '<div class="costrow"><b>' + esc(a) + "</b><span>" + esc(b) + "</span><p>" + esc(note) + "</p></div>"; }

  /* ---------------- data and events ---------------- */
  function init() {
    S = Object.assign({ aiCalls: 150, mcase: "hi" }, D.defaults, { codes: "free", route: D.defaults.build_route || "apify" });
    try { Object.assign(S, JSON.parse(load(DIAL_STORE) || "{}")); } catch (e) {}
  }
  function gate(a, b) { app.innerHTML = '<div class="gate"><b>' + esc(a) + "</b>" + esc(b) + "</div>"; upd.textContent = ""; }
  function fetchPlan() {
    var k = key();
    if (!k) return gate("This page needs your private link.", "Open it from the text Claude sent you.");
    if (loading) return;
    loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=plan", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (res) {
        if (res[0] === 401) { store(KEY_STORE, null); return gate("That link has expired.", "Ask Claude for a new one."); }
        if (!res[1].ok) return gate("Nothing published yet.", "The next check fills this page.");
        var first = !D; D = res[1].board; if (first || !S) init();
        keepScroll(function () { render(!first); });
        upd.textContent = "Counts updated " + ago(D.updated);
      })
      .catch(function () { if (!D) gate("Couldn't load.", "Check your connection, then tap Refresh."); })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  /* The top section can change height as numbers change; keep the dials where the finger is. */
  function keepScroll(fn) {
    var anchor = document.getElementById("p-dials"), before = anchor ? anchor.getBoundingClientRect().top : null;
    fn();
    anchor = document.getElementById("p-dials");
    if (anchor && before != null) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
  }
  function save() { store(DIAL_STORE, JSON.stringify(S)); }

  app.addEventListener("input", function (e) {
    var k = e.target.getAttribute("data-dial"); if (!k) return;
    S[k] = parseFloat(e.target.value);
    if (k === "lo" && S.lo > S.hi) S.hi = S.lo;
    if (k === "hi" && S.hi < S.lo) S.lo = S.hi;
    save(); keepScroll(function () { render(true); });
  });
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-seg]"); if (!b) return;
    S[b.getAttribute("data-seg")] = b.getAttribute("data-v"); save();
    keepScroll(function () { render(true); });
  });
  btn.addEventListener("click", fetchPlan);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") fetchPlan(); });
  fetchPlan();
})();
