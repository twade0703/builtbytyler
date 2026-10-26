/* builtbytyler.com/hiring: Tyler's live applicant board (2026-10-25).
 *
 * Tyler: "one text with a link to a live Built by Tyler page that tracks all of my
 * application statuses ... leave that open in my Safari tab. Hit a refresh and I'll
 * see like the number of applicants ... so I don't have to keep signing into Indeed."
 *
 * The key comes from the link's #k=... (never sent to the server in a URL) and is
 * kept in this browser so a plain refresh still works. Data: /api/hiring-board,
 * published from Tyler's PC by 04 Legal/reps/hiring/hiring_store.py publish.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k", TAB_STORE = "bbt-hire-tab";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), btn = document.getElementById("refresh");
  var TIER = {
    top: ["Top", "var(--green)", 0], strong: ["Strong", "var(--blue)", 1], "new": ["Not ranked yet", "var(--violet)", 2],
    maybe: ["Maybe", "var(--amber)", 3], unlikely: ["Unlikely", "var(--slate)", 4], cant: ["Can't hire", "var(--red)", 5]
  };
  var ROLE = {
    websites: { t: "Websites", n: "Rep 1", c: "var(--blue)" },
    ai: { t: "AI Receptionist", n: "Rep 2", c: "var(--violet)" }
  };
  var board = null, open = null, tab = "websites", loading = false;

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  tab = load(TAB_STORE) === "ai" ? "ai" : "websites";

  function key() {
    var m = /[#&]k=([A-Za-z0-9_-]{24,})/.exec(location.hash || "");
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(s) { var v = Date.parse(s); return isFinite(v) ? v : 0; }
  function ago(s) {
    var m = (Date.now() - t(s)) / 6e4;
    if (!t(s)) return "";
    if (m < 1) return "just now";
    if (m < 60) return Math.round(m) + " min ago";
    if (m < 1440) return Math.round(m / 60) + " h ago";
    return Math.round(m / 1440) + " d ago";
  }
  function good(p) { return p.tier === "top" || p.tier === "strong"; }
  // Counts match Indeed's: anyone rejected on Indeed is left out of every number and chart,
  // and listed last under its own heading (2026-10-25).
  function people(role) { return (board ? board.people : []).filter(function (p) { return (!role || p.role === role) && !p.rejected; }); }
  function rejected(role) { return (board ? board.people : []).filter(function (p) { return p.role === role && p.rejected; }); }
  function tierOf(p) { return TIER[p.tier] || TIER["new"]; }

  function chart(role) {
    var list = people(role), all = people();
    var t0 = t(board.posted) || Math.min.apply(null, all.map(function (p) { return t(p.applied); }).filter(Boolean));
    var t1 = Date.now(), W = 340, H = 120, L = 22, R = 6, T = 8, B = 18;
    var max = Math.max(4, list.length);
    function x(v) { return L + (W - L - R) * Math.max(0, Math.min(1, (v - t0) / Math.max(1, t1 - t0))); }
    function y(v) { return T + (H - T - B) * (1 - v / max); }
    var ts = list.map(function (p) { return t(p.applied); }).filter(Boolean).sort(function (a, b) { return a - b; });
    var d = "M" + x(t0).toFixed(1) + "," + y(0).toFixed(1), n = 0;
    ts.forEach(function (v) { d += "H" + x(v).toFixed(1) + "V" + y(++n).toFixed(1); });
    d += "H" + x(t1).toFixed(1);
    var area = d + "V" + y(0).toFixed(1) + "Z", c = ROLE[role].c, step = max > 20 ? 10 : max > 8 ? 5 : 2, g = "";
    for (var v = 0; v <= max; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.07)"/><text class="ax" x="' + (L - 5) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + "</text>";
    for (var day = new Date(new Date(t0).toDateString()).getTime() + 864e5; day < t1; day += 864e5)
      g += '<text class="ax" x="' + (x(day) + 3) + '" y="' + (H - 5) + '">' + new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + "</text>";
    return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Applicants over time">' + g +
      '<path d="' + area + '" fill="' + c + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle cx="' + x(t1) + '" cy="' + y(list.length) + '" r="3.5" fill="' + c + '"/></svg>';
  }

  function card(p) {
    var T = tierOf(p), on = open === p.id, b = "";
    if (p.pitch) b += '<span class="bdg p">Voice pitch</span>';
    if (p.also) b += '<span class="bdg">' + esc(p.also) + "</span>";
    if (p.rejected) b += '<span class="bdg x">Rejected on Indeed</span>';
    var more = "";
    if (on) {
      more = '<div class="more">' + (p.summary ? "<div>" + esc(p.summary) + "</div>" : "") +
        ((p.evidence || []).length ? "<ul>" + p.evidence.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" : "") +
        (p.note ? '<div class="note"><div class="lbl">Claude\'s read</div>' + esc(p.note) + "</div>" : "") +
        ((p.answers || []).length ? '<div class="ans"><div class="lbl">Their apply-page answers</div>' + p.answers.map(function (a) { return "<div><b>" + esc(a[0]) + "</b>" + esc(a[1]) + "</div>"; }).join("") + "</div>" : "") +
        (p.resume ? '<details class="res"><summary>Read the resume</summary><pre>' + esc(p.resume) + "</pre></details>" : "") +
        (p.profile_url ? '<a class="indeed" href="' + esc(p.profile_url) + '" target="_blank" rel="noopener noreferrer">Open on Indeed: message or call</a>' : "") +
        "</div>";
    }
    var line = p.headline && !/^[A-Z][a-z]+.*, [A-Z]{2}$/.test(p.headline) ? p.headline : p.summary;
    return '<div class="app' + (on ? " on" : "") + '" style="--t:' + T[1] + '"><button type="button" data-id="' + esc(p.id) + '" aria-expanded="' + on + '">' +
      '<i class="dot"></i><div class="who"><b>' + esc(p.name) + "</b><span>" + esc(p.where || "") + "</span>" +
      (line ? "<p>" + esc(line) + "</p>" : "") + (b ? '<div class="badges">' + b + "</div>" : "") + "</div>" +
      '<div class="side"><span class="tier">' + esc(T[0]) + '</span><span class="ago">' + esc(ago(p.applied)) + "</span></div></button>" + more + "</div>";
  }

  function render() {
    if (!board) return;
    var all = people(), day = Date.now() - 864e5, hrs = Math.max(1, (Date.now() - t(board.posted)) / 36e5);
    var list = people(tab).slice().sort(function (a, b) { return (tierOf(a)[2] - tierOf(b)[2]) || (t(b.applied) - t(a.applied)); });
    var tiers = Object.keys(TIER).map(function (k) {
      var n = list.filter(function (p) { return p.tier === k; }).length;
      return n ? '<span class="chip" style="--t:' + TIER[k][1] + '"><i></i>' + TIER[k][0] + " <b>" + n + "</b></span>" : "";
    }).join("");
    var tabs = Object.keys(ROLE).map(function (k) {
      var L = people(k), R = ROLE[k];
      return '<button type="button" role="tab" class="tab' + (k === tab ? " on" : "") + '" style="--c:' + R.c + '" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' +
        '<div class="row"><b>' + R.t + "</b><em>" + L.length + "</em></div><u>" + L.filter(good).length + " worth a call</u></button>";
    }).join("");
    app.innerHTML =
      '<section class="hero"><div class="stat big"><b>' + all.length + '</b><u>Applicants, both jobs</u></div>' +
      '<div class="stat"><b>' + all.filter(function (p) { return t(p.applied) > day; }).length + '</b><u>Last 24 hours</u></div>' +
      '<div class="stat"><b>' + (all.length / hrs * 24).toFixed(1) + '</b><u>A day, average</u></div></section>' +
      '<nav class="tabs" role="tablist" aria-label="Which job">' + tabs + "</nav>" +
      '<div class="chips">' + tiers + "</div>" +
      '<section class="chart"><h3>' + ROLE[tab].t + " applicants <span>since the post went up</span></h3>" + chart(tab) + "</section>" +
      '<section class="list">' + (list.map(card).join("") || '<div class="empty">Nobody yet.</div>') +
      (rejected(tab).length ? '<h3 class="rej">Rejected on Indeed <span>not counted, same as Indeed</span></h3>' + rejected(tab).map(card).join("") : "") + "</section>";
  }

  function stamp() {
    if (!board) return;
    var at = board.updated || board.published, stale = Date.now() - t(at) > 4 * 36e5;
    upd.textContent = "Updated " + (ago(at) || "never") + (stale ? " · next check soon" : "");
    upd.className = stale ? "stale" : "";
  }

  function gate(msg) {
    app.innerHTML = '<div class="gate"><b>' + esc(msg[0]) + "</b>" + esc(msg[1]) + "</div>";
    upd.textContent = "";
  }

  function fetchBoard() {
    var k = key();
    if (!k) return gate(["This page needs your private link.", "Open it from the text Claude sent you."]);
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
  btn.addEventListener("click", fetchBoard);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") fetchBoard(); });
  setInterval(function () { if (document.visibilityState === "visible") fetchBoard(); }, 120000);
  setInterval(stamp, 30000);
  fetchBoard();
})();
