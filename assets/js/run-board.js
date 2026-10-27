/* builtbytyler.com/run: the demo factory run, live (2026-10-26, glass redesign the same night).
 *
 * Tyler: "an email link ... that'll track the ongoing run ... every spending and everything I need
 * to be seeing, live update", then "it needs to say out of the entire total not just out of the area
 * you are cutting ... glass theme and everything cleaned up".
 *
 * So every count reads against the whole: each city's businesses found -> with no website -> built
 * -> passed, the run's totals the same way, and the whole demo stock the reps call from.
 * Reads /api/hiring-board?doc=run with the private key from the link's # (kept on this phone);
 * the PC publishes every 5 minutes (leads/night/run_board.py), this page re-reads every minute.
 * Tyler is colourblind: one blue, a value printed on every bar, the stop line in white.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh");
  var loading = false;

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
  function when(iso) { return iso ? new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""; }

  function funnel(t) {
    var top = t.found || 0;
    var step = function (label, v, of) {
      var w = top ? Math.max(2, v / top * 100) : 0;
      return '<div class="fl"><span>' + esc(label) + '</span><div class="tr" role="img" aria-label="' + esc(label + ": " + num(v) + " of " + num(top)) + '"><i style="width:' + w.toFixed(1) + '%"></i><u>' +
        (of ? esc(pct(v, top)) : "100%") + "</u></div><b>" + num(v) + "</b></div>";
    };
    return '<div class="glass funnel">' + step("Businesses found", top, false) + step("No website", t.no_site || 0, true) +
      step("Demo built", t.built || 0, true) + step("Passed, ready", t.passed || 0, true) +
      '<p class="note">' + (top ? num(t.passed) + " ready demos from " + num(top) + " businesses scraped (" + pct(t.passed, top) + "). Most fall out for having a website already, or too few photos of their own." : "Counts start when the first city finishes.") + "</p></div>";
  }

  function meter(title, value, frac, stopFrac, note) {
    var f = Math.max(0, Math.min(1, frac || 0)), s = stopFrac == null ? null : Math.max(0, Math.min(1, stopFrac));
    return '<div class="meter"><div class="h"><b>' + esc(title) + "</b><span>" + esc(value) + "</span></div>" +
      '<div class="bar" role="img" aria-label="' + esc(title + ": " + value) + '"><i style="width:' + (f * 100).toFixed(1) + '%"></i>' +
      (s != null ? '<em style="left:' + (s * 100).toFixed(1) + '%"></em>' : "") + "</div><p>" + note + "</p></div>";
  }

  function render(b) {
    var m = b.money || {}, a = m.apify || {}, g = m.google || {}, c = m.claude || {}, t = b.totals || {}, s = b.stock || {}, now = b.now;
    var on = b.state === "running";
    upd.textContent = "Updated " + ago(b.updated);

    var h = '<div class="glass now"><span class="pill' + (on ? " on" : "") + '"><i></i>' + esc((b.state || "").toUpperCase()) + "</span>";
    if (now) {
      var prog = now.to_build ? (now.built || 0) / now.to_build : 0;
      h += "<h3>" + esc(now.city) + " · " + esc(now.rep) + "</h3><p>" + esc(now.stage_label) + " · " + esc(now.minutes) + " min in</p>" +
        (now.found ? '<p class="note">' + num(now.found) + " businesses found · " + num(now.no_site) + " with no website</p>" : "") +
        (now.to_build ? '<div class="prog"><i style="width:' + (prog * 100).toFixed(1) + '%"></i></div><p class="note">' + num(now.built) + " of " + num(now.to_build) + " built · " + num(now.passed) + " passed so far</p>" : "");
    } else {
      h += "<h3>" + (b.stop_reason ? "Stopped" : "Nothing running") + "</h3><p>" + esc(b.stop_reason || "The runner isn't working on a city right now.") + "</p>";
    }
    h += '<p class="note">City ' + num(Math.min((t.cities_done || 0) + (now ? 1 : 0), t.cities_total || 0)) + " of " + num(t.cities_total) + " in this run</p></div>";

    h += '<h2 class="sec">This run, out of everything scraped<small>All finished cities together. Each % is the share of every business found</small></h2>' + funnel(t);

    h += '<h2 class="sec">Your whole demo stock<small>Everything the reps can call, not only this run</small></h2><div class="grid g3">' +
      '<div class="glass stat"><b>' + num(s.callable_demos) + "</b><u>Callable demos</u><em>built, live, CA and NV</em></div>" +
      '<div class="glass stat"><b>' + num(s.rep1_sheet) + "</b><u>On Rep 1's sheet</u><em>Southern California</em></div>" +
      '<div class="glass stat"><b>' + num(s.rep2_sheet) + "</b><u>On Rep 2's sheet</u><em>Northern California and Nevada</em></div>" +
      '<div class="glass stat"><b>' + num(s.added_this_run) + "</b><u>New demos added to sheets</u><em>since this run started</em></div>" +
      '<div class="glass stat"><b>' + num(s.ai_targets) + "</b><u>AI Receptionist targets</u><em>CA and NV</em></div>" +
      '<div class="glass stat"><b>' + num(t.cities_left) + "</b><u>Cities still queued</u><em>of " + num(t.cities_total) + "</em></div></div>";

    var cw = c.weekly, cs = c.stop_at || 70;
    h += '<h2 class="sec">Spending<small>Filled to what\'s used. The white line is where the run stops by itself</small></h2><div class="glass">' +
      meter("Apify (scraping)", usd(a.spent_run) + " this run", (a.used || 0) / (a.account_limit || 199), (a.stop_at || 190) / (a.account_limit || 199),
        esc(usd(a.used)) + " of " + esc(usd(a.account_limit)) + " used this month · stops at " + esc(usd(a.stop_at)) + " · " + esc(a.resets || "")) +
      meter("Google (photos and reviews)", "~" + usd(g.usd) + " of $" + num(g.cap), (g.usd || 0) / (g.cap || 50), 1,
        esc(num(g.leads)) + " businesses pulled at about " + esc(usd(g.per_lead)) + " each · an estimate; the real bill is in Google Cloud Billing") +
      meter("Claude (weekly limit)", cw == null ? "–" : cw + "% used", (cw || 0) / 100, cs / 100,
        "Started at " + esc(num(c.start)) + "% · stops at " + esc(cs) + "% · checked " + esc(ago(c.at)) + " · resets " + esc(c.resets || "")) + "</div>";
    if (b.stop_by) h += '<p class="note">No new city starts after ' + esc(when(b.stop_by)) + ".</p>";

    var rows = (b.cities || []).map(function (r) {
      var st = r.status === "running" ? "running" : r.status === "done" ? "done" : r.status === "failed" ? "failed" : "queued";
      var cell = function (v) { return "<td>" + (v == null ? "" : num(v)) + "</td>"; };
      return '<tr class="' + (st === "running" ? "run" : st === "queued" ? "q" : "") + '"><td>' + esc(r.city) + "</td><td>" + esc(r.rep) + "</td>" +
        cell(r.found) + cell(r.no_site) + cell(r.built) + cell(r.passed) + '<td class="st">' + st + "</td></tr>";
    }).join("");
    h += '<h2 class="sec">Every city<small>Found = every business the scrape returned. Rep 1 is Southern California, Rep 2 Northern California and Nevada</small></h2>' +
      '<div class="glass"><div class="tw"><table><thead><tr><th>City</th><th>Rep</th><th>Found</th><th>No site</th><th>Built</th><th>Passed</th><th>Status</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7">None queued.</td></tr>') + "</tbody></table></div>" +
      ((b.log || []).length ? '<details><summary>What the runner said last</summary><div class="log">' + esc(b.log.join("\n")) + "</div></details>" : "") + "</div>";
    app.innerHTML = h;
  }

  function gate(t, s) { app.innerHTML = '<div class="glass gate"><b>' + esc(t) + "</b>" + esc(s) + "</div>"; }

  function refresh() {
    var k = key();
    if (!k) { gate("Open this from your text", "This page only opens from the link Claude texted you."); upd.textContent = ""; return; }
    if (location.hash) history.replaceState(null, "", location.pathname);
    if (loading) return;
    loading = true; btn.classList.add("spin");
    fetch("/api/hiring-board?doc=run", { headers: { Authorization: "Bearer " + k }, cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 401) return gate("Link not recognised", "Open the newest link Claude texted you.");
        if (!x.j.ok) return gate("Nothing yet", "The first numbers arrive within 5 minutes of the run starting.");
        render(x.j.board);
      })
      .catch(function () { upd.textContent = "Offline · showing the last numbers"; })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }
  btn.addEventListener("click", refresh);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  setInterval(function () { if (!document.hidden) refresh(); }, 60000);
  refresh();
})();
