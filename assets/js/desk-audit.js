/* builtbytyler.com/desk: the AI Receptionist test report of 2026-11-15.
 *
 * Tyler called his own line, it took the voice's name as his, said a closing line twice, announced a role play it
 * never started and hung up on "Okay." This page shows that call, the 104 test calls on the old and the fixed code,
 * the rules for ending a call, and every transcript. Orange = before, aqua = after, and every mark carries its
 * number and a word (Tyler is colourblind). Reads /api/hiring-board?doc=desk with the private key from the link's #.
 */
(function () {
  "use strict";
  var KEY_STORE = "bbt-hire-k";
  var app = document.getElementById("app"), upd = document.getElementById("upd"), kpis = document.getElementById("kpis");
  var B = null, view = { filter: "fixed", q: "", open: {}, mine: "live" };
  var FLAG = {};

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function key() {
    var m = /[#&]k=([A-Za-z0-9_-]{24,})/.exec(location.hash || "");
    if (m) { store(KEY_STORE, m[1]); return m[1]; }
    return load(KEY_STORE);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sec(ms) { return (ms / 1000).toFixed(2) + " s"; }
  function panel(cls, h, sub, body, right) {
    return '<section class="panel ' + cls + '"><div class="ph"><div><h2>' + esc(h) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>" + (right || "") + "</div>" + body + "</section>";
  }
  var KEYS = '<div class="key"><span><i style="background:var(--s2)"></i>Before (the code you called)</span><span><i style="background:var(--s3)"></i>After (live now)</span></div>';

  function pair(label, before, after, max, unit) {
    function row(word, n, col) {
      return '<div class="row"><span>' + word + '</span><div class="trk"><b style="width:' + (max ? Math.round(100 * n / max) : 0) + "%;background:" + col + '"></b></div><span class="n">' + n + (unit || "") + "</span></div>";
    }
    return '<div class="bar"><div class="lab">' + esc(label) + "</div>" + row("Before", before, "var(--s2)") + row("After", after, "var(--s3)") + "</div>";
  }

  function lines(turns) {            // a live transcript: [{who, text}]
    return turns.map(function (t) {
      return '<div class="ln ' + (t.who === "caller" ? "c" : "d") + '"><small>' + (t.who === "caller" ? "You" : "Receptionist") + "</small>" + esc(t.text) + "</div>";
    }).join("");
  }
  function talk(run) {               // a test transcript: [{c, d, ms, end, unsaid}]
    var out = "", ended = false;
    run.turns.forEach(function (t) {
      if (t.c) out += '<div class="ln c' + (t.unsaid ? " gone" : "") + '"><small>Caller' + (t.unsaid ? " (never heard, the line was already dropped)" : "") + "</small>" + esc(t.c) + "</div>";
      if (t.d) out += '<div class="ln d"><small>Receptionist' + (t.ms ? " · " + sec(t.ms) : "") + "</small>" + esc(t.d) + "</div>";
      if (t.end && !ended) { ended = true; out += '<div class="endtag">Call ended here</div>'; }
    });
    var f = run.flags.map(function (x) { return '<span class="pill flag">' + esc(FLAG[x] || x) + "</span>"; }).join("");
    var r = run.rec || {};
    return out + (f ? "<div>" + f + "</div>" : "") + '<p class="note">Saved as: ' + esc(r.name || "no name") + " · " + esc(r.status || "") + (r.urgency && r.urgency !== "standard" ? " · " + esc(r.urgency) : "") + "</p>";
  }

  function drawKpis() {
    var k = B.kpi;
    function card(l, v, s) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + "</div></div>"; }
    kpis.innerHTML =
      card("Test calls", k.calls + " <small>calls</small>", k.turns + " things said by callers") +
      card("Calls with nothing wrong", '<span class="was">' + k.clean_before + '</span> <small>to</small> <span class="now">' + k.clean_after + "</span>", "before, then after, out of " + k.calls) +
      card("Hung up on a caller", '<span class="was">' + k.hung_before + '</span> <small>to</small> <span class="now">' + k.hung_after + "</span>", "calls ended with more to say") +
      card("Wrong name saved", '<span class="was">' + k.name_before + '</span> <small>to</small> <span class="now">' + k.name_after + "</span>", "including the voice's own name") +
      card("Older test set", k.replay, "the Nov 10 calls still pass");
  }

  function drawCalls() {
    var cats = B.cats.map(function (c) { return c.name; });
    var chips = [["fixed", "Went wrong before (" + B.calls.filter(function (c) { return c.before.flags.length; }).length + ")"], ["all", "All " + B.calls.length]]
      .concat(cats.map(function (c) { return [c, c]; }));
    var q = view.q.toLowerCase();
    var rows = B.calls.filter(function (c) {
      if (view.filter === "fixed" && !c.before.flags.length) return false;
      if (view.filter !== "fixed" && view.filter !== "all" && c.cat !== view.filter) return false;
      if (!q) return true;
      return (c.name + " " + c.biz + " " + c.after.turns.concat(c.before.turns).map(function (t) { return (t.c || "") + " " + (t.d || ""); }).join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    var html = '<div class="chips">' + chips.map(function (c) { return '<button type="button" class="chip' + (view.filter === c[0] ? " on" : "") + '" data-filter="' + esc(c[0]) + '">' + esc(c[1]) + "</button>"; }).join("") + "</div>" +
      '<input class="find" id="find" type="search" placeholder="Search what was said" value="' + esc(view.q) + '">' +
      '<p class="note" style="margin:0 0 6px">' + rows.length + " calls shown. Tap one to read both versions.</p>";
    html += rows.map(function (c) {
      var bad = c.before.flags.length, open = view.open[c.i];
      return '<div class="call"><button type="button" data-call="' + c.i + '" aria-expanded="' + (open ? "true" : "false") + '"><span class="no">#' + c.i + '</span><span class="nm"><b>' + esc(c.name) + "</b><span>" + esc(c.cat) + " · " + esc(c.biz) + "</span></span>" +
        '<span class="pill ' + (bad ? "bad" : "ok") + '">Before: ' + (bad ? bad + " wrong" : "fine") + '</span><span class="pill aft ' + (c.after.flags.length ? "bad" : "ok") + '">After: ' + (c.after.flags.length ? c.after.flags.length + " wrong" : "fine") + "</span></button>" +
        (open ? '<div class="tx2"><div class="tx"><h4>Before</h4>' + talk(c.before) + '</div><div class="tx"><h4>After</h4>' + talk(c.after) + "</div></div>" : "") + "</div>";
    }).join("");
    document.getElementById("calls").innerHTML = html;
  }

  function draw() {
    B.flags.forEach(function (f) { FLAG[f.key] = f.label; });
    drawKpis();
    var y = B.your_call, mx = Math.max.apply(null, B.flags.map(function (f) { return Math.max(f.before, f.after); }));
    var issues = y.what.map(function (w, i) {
      return '<div class="issue"><h3><em>' + (i + 1) + " of " + y.what.length + "</em>" + esc(w.t) + '</h3><dl class="q"><dt>You said</dt><dd class="say">' + esc(w.said) + '</dd><dt>It did</dt><dd class="say">' + esc(w.did) +
        "</dd><dt>Why</dt><dd>" + esc(w.why) + '</dd><dt>Now</dt><dd class="fix">' + esc(w.now) + "</dd></dl></div>";
    }).join("");
    var seg = '<div class="seg"><button type="button" data-mine="live"' + (view.mine === "live" ? ' class="on"' : "") + '>What happened</button><button type="button" data-mine="replay"' + (view.mine === "replay" ? ' class="on"' : "") + ">Same words, fixed code</button></div>";
    var mine = '<div id="mine">' + lines(view.mine === "live" ? y.live : y.replay) + "</div>" +
      '<p class="note">' + (view.mine === "live" ? "The real call, as logged. It ended on your \"Okay.\"" : "Your exact words played back on the simulated phone line. No name is taken, the role play starts, and the line stays up until real silence.") + "</p>";
    var s = B.speed, sp = [["Typical reply (all turns)", "all_p50"], ["Slow reply, 9 in 10 are faster", "all_p90"], ["Typical reply when the AI thinks", "ai_p50"], ["Slow AI reply, 9 in 10 are faster", "ai_p90"], ["Slowest single reply", "max"]];
    var speed = '<table><tr><th>Reply time</th><th class="n">Before</th><th class="n">After</th></tr>' + sp.map(function (r) {
      return "<tr><td>" + r[0] + '</td><td class="n">' + sec(s.before[r[1]]) + '</td><td class="n">' + sec(s.after[r[1]]) + "</td></tr>";
    }).join("") + '<tr><td>Replies over 3 seconds</td><td class="n">' + s.before.over_3s + '</td><td class="n">' + s.after.over_3s + '</td></tr></table><p class="note">' + esc(s.note) + "</p>";
    function groups(list, cls) {
      return '<div class="cols ' + (cls || "") + '">' + list.map(function (g) { return '<div class="col"><h3>' + esc(g.h) + "</h3><ul>" + g.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div>";
    }
    app.innerHTML = '<div class="grid">' +
      panel("c7", "Your call", y.when + " · four things went wrong", issues) +
      panel("c5", "The call itself", "word for word", mine, seg) +
      panel("c6", "What went wrong, by type", "number of the " + B.kpi.calls + " calls with each problem", B.flags.map(function (f) { return pair(f.label, f.before, f.after, mx); }).join(""), KEYS) +
      panel("c6", "Calls with nothing wrong, by kind of caller", "clean calls out of the calls of that kind", B.cats.map(function (c) { return pair(c.name.charAt(0).toUpperCase() + c.name.slice(1) + " (" + c.n + " calls)", c.before, c.after, c.n, " of " + c.n); }).join(""), KEYS) +
      panel("c12", "When the receptionist ends a call", "the rule it follows now", groups(B.rules)) +
      panel("c12", "What changed", "all of it is live on your line", groups(B.changes, "four")) +
      panel("c6", "How this stays fixed", "what runs before any change goes live", "<ul>" + B.prevent.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>") +
      panel("c6", "Speed", "not changed in this round", speed) +
      panel("c12", "Every test call", "before and after, side by side", '<div id="calls"></div>') +
      panel("c12", "How the test was run", "", '<p class="note" style="margin:0">' + esc(B.method.text) + " AI cost of today's test runs on the bench: $" + Number(B.method.spend).toFixed(2) + ".</p>") +
      "</div>";
    drawCalls();
    upd.textContent = "published " + new Date(B.published || B.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function fail(text) { kpis.innerHTML = ""; app.innerHTML = '<div class="msg">' + esc(text) + "</div>"; upd.textContent = ""; }

  function get() {
    var k = key();
    if (!k) return fail("This page is private. Open it from the link in your email.");
    fetch("/api/hiring-board?doc=desk", { headers: { Authorization: "Bearer " + k }, cache: "no-store" }).then(function (r) {
      if (r.status === 401) throw new Error("This link's key is not accepted. Open the page from the link in your email.");
      if (r.status === 404) throw new Error("Nothing has been published here yet.");
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error("The report could not be read.");
      B = j.board; draw();
    }).catch(function (e) { fail(e.message || "The report could not be loaded."); });
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-filter],[data-call],[data-mine],#refresh") : null;
    if (!t || !B && t.id !== "refresh") return;
    if (t.id === "refresh") return get();
    if (t.dataset.filter) { view.filter = t.dataset.filter; return drawCalls(); }
    if (t.dataset.call) { view.open[t.dataset.call] = !view.open[t.dataset.call]; return drawCalls(); }
    if (t.dataset.mine) { view.mine = t.dataset.mine; return draw(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id !== "find") return;
    view.q = e.target.value;
    var pos = e.target.selectionStart;
    drawCalls();
    var f = document.getElementById("find");
    f.focus();
    try { f.setSelectionRange(pos, pos); } catch (x) {}
  });
  get();
})();
