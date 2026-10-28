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
    var nCodes = Object.keys(codes).length, paidCodes = free ? 0 : Math.max(0, nCodes - D.dnc.free.length);
    var seats = S.web + S.ai, extraLines = Math.max(0, seats - 3), calls = (S.calls * S.web + S.aiCalls * S.ai) * S.days;
    var cost = {
      builds: toBuild * per, dnc: paidCodes * D.dnc.per_code, lines: extraLines * 1.15, minutes: calls * 2 * 0.014,
    };
    cost.total = cost.builds + cost.dnc + cost.lines + cost.minutes;
    var B = D.build_status || {}, perDay = (B.per_lane_week || 300) / 7;
    var days1 = Math.ceil(toBuild / perDay), days2 = Math.ceil(toBuild / (2 * perDay));
    /* 2026-10-27: measured pace of the last 8 cities on the running build, one lane. */
    var R = B.run || {}, pace = (R.recent || {}).per_hour, hours = pace ? Math.ceil(toBuild / pace) : null;
    return { r: r, p: p, webNeed: webNeed, aiNeed: aiNeed, webHave: webHave, aiHave: aiHave, toBuild: toBuild, builds: Math.ceil(toBuild / D.build.pass),
      worst: S.calls * S.days * S.web, nCodes: nCodes, paidCodes: paidCodes, extraLines: extraLines, calls: calls, cost: cost,
      lo: money(S.lo), hi: money(S.hi), days1: days1, days2: days2, hours: hours, pace: pace };
  }

  /* ---------------- drawing ---------------- */
  var DIALS = [
    ["web", "Website closers", 0, 6, 1, "", "Each needs a demo for every new business they call."],
    ["ai", "AI Receptionist closers", 0, 3, 1, "", "They call from the AI Receptionist list, no demos needed."],
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

  function render(dialsOnly) {
    if (!D) return;
    var x = plan(), r = x.r, lo = x.lo, hi = x.hi, seats = S.web + S.ai;
    var perOwner = function (c) { return (c / S.pickup * 100).toFixed(1).replace(/\.0$/, ""); };
    var row = function (label, a, b, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td><td>" + a + "</td><td>" + b + "</td></tr>"; };
    var c = D.costs;
    var top =
      '<p class="lead">' + esc(D.week.label) + " · " + S.web + " website closers at " + S.calls + " calls a day + " + S.ai + " AI Receptionist closers at " + S.aiCalls + " · " + S.days + " days</p>" +
      '<nav class="nav"><a href="#answer">Answer</a><a href="#build">Build</a><a href="#money">Money</a><a href="#demos">Demos</a><a href="#codes">Area codes</a><a href="#recalls">Recalls</a><a href="#costs">Costs</a><a href="#status">Status</a><a href="#dials">Assumptions</a></nav>' +

      '<h2 id="answer">The short answer</h2><div class="grid">' +
      '<div class="stat bl"><b>' + N(x.webNeed) + '</b><u>Website demos needed</u></div>' +
      '<div class="stat a"><b>' + N(x.toBuild) + '</b><u>Still to build (have ' + N(x.webHave) + ")</u></div>" +
      '<div class="stat"><b>' + $k(lo.pocket) + ' <em>to</em> ' + $k(hi.pocket) + '</b><u>You pocket from the week (' + S.lo + "% to " + S.hi + "%)</u></div>" +
      '<div class="stat g"><b>+' + $k(lo.mo1) + ' <em>to</em> ' + $k(hi.mo1) + '</b><u>Added every month after</u></div>' +
      '<div class="stat"><b>' + $(x.cost.total) + '</b><u>Cash to get ready</u></div>' +
      /* 2026-10-27: the free-code cities left set what can still be built, not the build's speed */
      (D.goal && x.toBuild
        ? '<div class="stat v"><b>~' + N(D.goal.coming) + '</b><u>More coming from the ' + N(D.goal.cities_left) + " cities left (short ~" + N(Math.max(0, x.toBuild - D.goal.coming)) + ")</u></div>"
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
      buildHtml(x);
    var dialsHtml =
      '<details class="adv"><summary><h2 id="dials">Assumptions<small>Tap to change closers, calls, pickup or close rates. The page redoes the math.</small></h2></summary><div class="card">' + DIALS.map(dial).join("") +
      seg("codes", [["free", "Free 5 area codes"], ["all", "All of CA and NV"]], "Where they can call",
        "The Do Not Call download is the 5 free area codes (" + D.dnc.free.join(", ") + "). All of California and Nevada is " + x.nCodes + " area codes, $" + D.dnc.per_code + " each a year after the first 5.") +
      seg("route", [["apify", "This run, ~$" + D.build.apify.toFixed(2)], ["google", "Google only, ~$" + D.build.google.toFixed(2)]], "Demo build cost, per demo",
        (D.build.measured ? "Measured on this run: Apify plus Google, divided by demos that passed. " : "Measured on past runs. ") +
        "About " + Math.round(D.build.pass * 100) + " in 100 qualified businesses pass every check, and the cost is per demo that passes.") + "</div></details>";
    var rest =
      '<h2 id="recalls">Calls and recalls<small>One closer\'s week. A business that doesn\'t pick up gets called again the next day, up to ' + S.tries + " tries.</small></h2>" +
      '<div class="card"><table><thead><tr><th></th><th>Each closer</th><th>All ' + seats + "</th></tr></thead><tbody>" +
      row("Calls", N(S.calls * S.days), N(S.calls * S.days * seats)) +
      row("New businesses called", N(r.fresh), N(r.fresh * seats)) +
      row("Recall calls", N(r.recall), N(r.recall * seats)) +
      row("Owners reached", N(r.reached), N(r.reached * seats)) +
      row("Callbacks left for week 2", N(r.left), N(r.left * seats)) +
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
      '<p class="note">Website: $50 a month, the closer gets $10 for 12 months. AI Receptionist: $100 a month, the closer gets $20 for as long as it\'s paid. Stripe comes off every payment, and so does the AI Receptionist\'s running cost, about $' + (D.price.ai_run || 0).toFixed(2) + ' a customer a month. Every number here comes from the same assumptions file as RAGER' + (D.assumptions_updated ? ' (updated ' + esc(D.assumptions_updated) + ')' : '') + '.</p></div>' +

      '<h2 id="costs">Costs to get ready<small>What you pay before and during demo week.</small></h2><div class="card">' +
      cost("Demo builds", $(x.cost.builds), N(x.toBuild) + " demos at ~$" + D.build[S.route].toFixed(2) + (D.build.measured && S.route === "apify" ? ", this run's average so far. The small towns left cost more per demo than the big cities did." : ".")) +
      cost("Extra Do Not Call area codes", $(x.cost.dnc), S.codes === "free" ? "None: you stay inside the 5 free area codes." : x.paidCodes + " area codes past the free 5, at $" + D.dnc.per_code + " each for a year.") +
      cost("Extra phone lines", $(x.cost.lines) + "/mo", x.extraLines ? x.extraLines + " more line" + (x.extraLines > 1 ? "s" : "") + " for " + seats + " closers (you own 3)." : "You own 3 lines; enough for " + seats + " closer" + (seats === 1 ? "" : "s") + ".") +
      cost("Call minutes", $(x.cost.minutes), N(x.calls) + " calls at about 2 minutes, $0.014 a minute.") +
      '<div class="costrow"><b>Total to get ready</b><span>' + $(x.cost.total) + "</span></div></div>" +
      '<div class="card"><div class="lbl" style="font:10px JetBrains Mono,monospace;letter-spacing:.14em;color:var(--mu);margin-bottom:6px">ALREADY PAYING OR BY QUOTE</div>' +
      c.map(function (k) { return cost(k[0], k[1] == null ? "by quote" : typeof k[1] === "string" ? k[1] + " " + k[2] : (k[1] < 1 ? "$" + k[1] : $(k[1])) + " " + k[2], k[3]); }).join("") + "</div>" +

      '<h2 id="status">Where things stand</h2><div class="grid">' +
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
    S = Object.assign({ aiCalls: 150 }, D.defaults, { codes: "free", route: D.defaults.build_route || "apify" });
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
