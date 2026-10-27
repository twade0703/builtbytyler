/* builtbytyler.com/run: the demo factory run, live (2026-10-26).
 *
 * Tyler: "an email link ... that'll track the ongoing run that we're about to do and every
 * spending and everything I need to be seeing, live update and everything."
 *
 * Reads /api/hiring-board?doc=run with the same private key as /hiring and /plan (after the #
 * in his link, kept in this phone's storage). The PC publishes every 5 minutes
 * (leads/night/run_board.py); this page re-reads every minute. Labels sit on every bar and
 * number (Tyler is colourblind): one blue, with the stop line drawn in white.
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
  function n0(n) { return n == null ? "–" : String(n); }
  function ago(iso) {
    if (!iso) return "never";
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h " + (m % 60) + " min ago";
  }
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  }

  function meter(title, value, frac, stopFrac, note) {
    var f = Math.max(0, Math.min(1, frac || 0)), s = stopFrac == null ? null : Math.max(0, Math.min(1, stopFrac));
    return '<div class="meter"><div class="h"><b>' + esc(title) + '</b><span>' + esc(value) + '</span></div>' +
      '<div class="bar" role="img" aria-label="' + esc(title + ": " + value) + '"><i style="width:' + (f * 100).toFixed(1) + '%"></i>' +
      (s != null ? '<em style="left:calc(' + (s * 100).toFixed(1) + '% - 1px)" title="stop line"></em>' : "") + '</div><p>' + note + '</p></div>';
  }

  function render(b) {
    var m = b.money || {}, a = m.apify || {}, g = m.google || {}, c = m.claude || {}, t = b.totals || {}, now = b.now;
    var on = b.state === "running";
    upd.textContent = "Updated " + ago(b.updated);
    var h = '<div class="card now"><span class="state' + (on ? " on" : "") + '">' + esc((b.state || "").toUpperCase()) + "</span>";
    if (now) {
      h += "<b>" + esc(now.city) + " · " + esc(now.rep) + "</b><p>" + esc(now.stage_label) + " · " + esc(now.minutes) + " min in" +
        (now.to_build ? " · " + n0(now.built) + " of " + n0(now.to_build) + " built, " + n0(now.passed) + " passed so far" : "") + "</p>";
    } else {
      h += "<b>" + (b.stop_reason ? "Stopped" : "Nothing running") + "</b><p>" + esc(b.stop_reason || "The runner isn't working on a city right now.") + "</p>";
    }
    h += "</div>";

    h += '<h2>Demos from this run<small>Passed = finished, passed every check, ready to go on a rep\'s sheet</small></h2><div class="grid">' +
      '<div class="stat"><b>' + n0(t.passed) + "</b><u>Demos passed</u></div>" +
      '<div class="stat"><b>' + n0(t.built) + "</b><u>Sites attempted</u></div>" +
      '<div class="stat"><b>' + n0(t.cities_done) + "</b><u>Cities finished</u></div>" +
      '<div class="stat"><b>' + n0(t.cities_left) + "</b><u>Cities still queued</u></div></div>";

    var cw = c.weekly, cs = c.stop_at || 70;
    h += '<h2>Spending<small>Each bar is filled to what\'s used; the white line is where the run stops by itself</small></h2><div class="card">' +
      meter("Apify (scraping)", usd(a.spent_run) + " this run", (a.used || 0) / (a.account_limit || 199), (a.stop_at || 190) / (a.account_limit || 199),
        esc(usd(a.used)) + " of " + esc(usd(a.account_limit)) + " used this month · stops at " + esc(usd(a.stop_at)) + " · " + esc(a.resets || "")) +
      meter("Google (photos and reviews)", "~" + usd(g.usd) + " of $" + n0(g.cap), (g.usd || 0) / (g.cap || 50), 1,
        esc(n0(g.leads)) + " businesses pulled at about " + esc(usd(g.per_lead)) + " each · an estimate; Google's own bill is in Google Cloud Billing") +
      meter("Claude (weekly limit)", cw == null ? "–" : cw + "% used", (cw || 0) / 100, cs / 100,
        "Started at " + esc(n0(c.start)) + "% · stops at " + esc(cs) + "% · checked " + esc(ago(c.at)) + " · resets " + esc(c.resets || "")) +
      "</div>";
    if (b.stop_by) h += '<p class="note">No new city starts after ' + esc(when(b.stop_by)) + (b.max_cities != null ? " · up to " + esc(b.max_cities) + " cities in this pass" : "") + ".</p>";

    var rows = (b.cities || []).map(function (r) {
      var st = r.status === "running" ? "running" : r.status === "done" ? "done" : r.status === "failed" ? "failed" : "queued";
      return '<tr class="' + (st === "running" ? "run" : "") + '"><td>' + esc(r.city) + "</td><td>" + esc(r.rep) + '</td><td class="st">' + st +
        "</td><td>" + (r.passed != null ? esc(r.passed) + " / " + esc(r.built == null ? "–" : r.built) : "") + "</td></tr>";
    }).join("");
    h += '<h2>Cities<small>In run order. Rep 1 is Southern California, Rep 2 Northern California and Nevada</small></h2><div class="card"><table><thead><tr><th>City</th><th>Rep</th><th>Status</th><th>Passed / built</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4">None queued.</td></tr>') + "</tbody></table></div>";

    if ((b.log || []).length) h += '<h2>What the runner said last</h2><div class="card log">' + esc(b.log.join("\n")) + "</div>";
    app.innerHTML = h;
  }

  function gate(t, s) { app.innerHTML = '<div class="gate"><b>' + esc(t) + "</b>" + esc(s) + "</div>"; }

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
