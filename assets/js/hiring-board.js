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
    ai: { t: "AI Receptionist", n: "AI Reps 1 and 2", c: "var(--violet)" }
  };
  var board = null, open = null, tab = "websites", loading = false;

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  tab = load(TAB_STORE) === "ai" ? "ai" : load(TAB_STORE) === "messages" ? "messages" : "websites";

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
  // Tyler, 2026-10-26: "Shows 39 but I was told we have 41 ... show them here". The totals count
  // everyone who applied, rejected included, and say how many of them were rejected. The list still
  // puts rejected people last, under their own heading.
  function people(role) { return (board ? board.people : []).filter(function (p) { return (!role || p.role === role) && !p.rejected; }); }
  function everyone(role) { return (board ? board.people : []).filter(function (p) { return !role || p.role === role; }); }
  function rejected(role) { return (board ? board.people : []).filter(function (p) { return p.role === role && p.rejected; }); }
  function tierOf(p) { return TIER[p.tier] || TIER["new"]; }

  function chart(role) {
    var list = people(role), all = people();
    var t0 = t(board.posted) || Math.min.apply(null, all.map(function (p) { return t(p.applied); }).filter(Boolean));
    // drawn at the width it's shown at (2026-10-29, Tyler: full screen "the numbers ... and the dates are stretched")
    var t1 = Date.now(), W = Math.max(300, Math.round((app.clientWidth || 340) - 30)), H = 130, L = 26, R = 8, T = 8, B = 18;
    var max = Math.max(4, list.length);
    function x(v) { return L + (W - L - R) * Math.max(0, Math.min(1, (v - t0) / Math.max(1, t1 - t0))); }
    function y(v) { return T + (H - T - B) * (1 - v / max); }
    var ts = list.map(function (p) { return t(p.applied); }).filter(Boolean).sort(function (a, b) { return a - b; });
    var d = "M" + x(t0).toFixed(1) + "," + y(0).toFixed(1), n = 0;
    ts.forEach(function (v) { d += "H" + x(v).toFixed(1) + "V" + y(++n).toFixed(1); });
    d += "H" + x(t1).toFixed(1);
    var area = d + "V" + y(0).toFixed(1) + "Z", c = ROLE[role].c, step = max > 20 ? 10 : max > 8 ? 5 : 2, g = "";
    for (var v = 0; v <= max; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.07)"/><text class="ax" x="' + (L - 5) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + "</text>";
    var every = Math.max(1, Math.ceil(((t1 - t0) / 864e5) / Math.max(1, Math.floor((W - L - R) / 52))));
    for (var day = new Date(new Date(t0).toDateString()).getTime() + 864e5, di = 0; day < t1; day += 864e5, di++)
      if (di % every === 0) g += '<text class="ax" x="' + (x(day) + 3) + '" y="' + (H - 5) + '">' + new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + "</text>";
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Applicants over time">' + g +
      '<path d="' + area + '" fill="' + c + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle cx="' + x(t1) + '" cy="' + y(list.length) + '" r="3.5" fill="' + c + '"/></svg>';
  }

  /* A resume, laid out (2026-10-26): the same blocks RAGER draws (control/resumefmt.py): section headers,
     each job as title / dates / company and place with its bullets, skills as tags. */
  function resumeHTML(p) {
    var out = [], ul = [];
    function flush() { if (ul.length) { out.push("<ul>" + ul.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"); ul = []; } }
    (p.resume_doc || []).forEach(function (b) {
      if (b.li != null) { ul.push(b.li); return; }
      flush();
      if (b.h) out.push("<h4>" + esc(b.h) + "</h4>");
      else if (b.hr) out.push('<div class="rs-hr"><span>' + esc(b.hr) + "</span></div>");
      else if (b.job) {
        var j = b.job, sub = [j.org, j.where].filter(Boolean).join(" · ");
        out.push('<div class="rs-job"><div class="rs-jt"><b>' + esc(j.title) + "</b>" + (j.when ? "<em>" + esc(j.when) + "</em>" : "") + "</div>" + (sub ? '<div class="rs-jo">' + esc(sub) + "</div>" : "") + "</div>");
      } else if (b.chips) out.push('<div class="rs-chips">' + b.chips.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>");
      else if (b.p) out.push("<p>" + esc(b.p) + "</p>");
    });
    flush();
    return '<article class="rs"><header><b>' + esc(p.name || "") + "</b>" + (p.headline && p.headline !== p.where ? "<span>" + esc(p.headline) + "</span>" : "") + (p.where ? "<em>" + esc(p.where) + "</em>" : "") + "</header>" + out.join("") + "</article>";
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
        (p.resume ? '<details class="res"><summary>Read the resume</summary>' + ((p.resume_doc || []).length ? resumeHTML(p) : "<pre>" + esc(p.resume) + "</pre>") + "</details>" : "") +
        (p.profile_url ? '<a class="indeed" href="' + esc(p.profile_url) + '" target="_blank" rel="noopener noreferrer">Open on Indeed: message or call</a>' : "") +
        "</div>";
    }
    var line = p.headline && !/^[A-Z][a-z]+.*, [A-Z]{2}$/.test(p.headline) ? p.headline : p.summary;
    return '<div class="app' + (on ? " on" : "") + '" style="--t:' + T[1] + '"><button type="button" data-id="' + esc(p.id) + '" aria-expanded="' + on + '">' +
      '<i class="dot"></i><div class="who"><b>' + esc(p.name) + "</b><span>" + esc(p.where || "") + "</span>" +
      (line ? "<p>" + esc(line) + "</p>" : "") + (b ? '<div class="badges">' + b + "</div>" : "") + "</div>" +
      '<div class="side"><span class="tier">' + esc(T[0]) + '</span><span class="ago">' + esc(ago(p.applied)) + "</span></div></button>" + more + "</div>";
  }

  /* The hiring schedule from the scale plan (2026-10-28, Tyler: "two at a time, over and over"), published from
     control/scale.py with the board: the same months and closer counts as /plan and RAGER's Money tab. */
  function planCard() {
    var P = board.plan;
    if (!P || !P.rows || !P.rows.length) return "";
    var R = P.rows, first = R[0], next = R[1], far = R[Math.min(R.length - 1, 7)];
    var worth = function (k) { return everyone(k).filter(function (p) { return good(p) && !p.rejected; }).length; };
    var chips = R.slice(0, 8).map(function (r, i) {
      return '<span class="pmo"><u>' + esc(r.label) + "</u><b>" + (i ? "+" + r.hire_web + " / +" + r.hire_ai : r.web + " / " + r.ai) + "</b><em>" + r.web + " + " + r.ai + " dialing</em></span>";
    }).join("");
    return '<section class="plan"><div class="lbl">Hiring plan</div><p class="prule">' + esc(P.rule) + "</p>" +
      '<div class="pmos">' + chips + "</div>" +
      '<p class="pnote">Website / AI Receptionist. ' + (next ? "Next: " + next.hire_web + " website and " + next.hire_ai + " AI closer" + (next.hire_ai > 1 ? "s" : "") + " signed and trained to dial from " + esc(next.label) + ". " : "") +
      "By " + esc(far.label) + ": " + far.web + " website + " + far.ai + " AI dialing. Worth a call now: " + worth("websites") + " website, " + worth("ai") + " AI. <a href=\"/plan#scale\">Money on this plan</a></p></section>";
  }

  function render() {
    if (!board) return;
    var all = everyone(), rej = all.filter(function (p) { return p.rejected; }).length, day = Date.now() - 864e5, hrs = Math.max(1, (Date.now() - t(board.posted)) / 36e5);
    var list = people(tab).slice().sort(function (a, b) { return (tierOf(a)[2] - tierOf(b)[2]) || (t(b.applied) - t(a.applied)); });
    var tiers = Object.keys(TIER).map(function (k) {
      var n = list.filter(function (p) { return p.tier === k; }).length;
      return n ? '<span class="chip" style="--t:' + TIER[k][1] + '"><i></i>' + TIER[k][0] + " <b>" + n + "</b></span>" : "";
    }).join("");
    var tabs = Object.keys(ROLE).map(function (k) {
      var L = everyone(k), R = ROLE[k];
      return '<button type="button" role="tab" class="tab' + (k === tab ? " on" : "") + '" style="--c:' + R.c + '" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' +
        '<div class="row"><b>' + R.t + "</b><em>" + L.length + "</em></div><u>" + L.filter(function (p) { return good(p) && !p.rejected; }).length + " worth a call" + (rejected(k).length ? " · " + rejected(k).length + " rejected" : "") + "</u></button>";
    }).join("");
    app.innerHTML =
      '<section class="hero"><div class="stat big"><b>' + all.length + '</b><u>Applicants, both jobs' + (rej ? " · " + rej + " rejected" : "") + '</u></div>' +
      '<div class="stat"><b>' + all.filter(function (p) { return t(p.applied) > day; }).length + '</b><u>Last 24 hours</u></div>' +
      '<div class="stat"><b>' + (all.length / hrs * 24).toFixed(1) + '</b><u>A day, average</u></div></section>' + (tab === "messages" ? "" : planCard()) +
      '<nav class="tabs" role="tablist" aria-label="Which job">' + msgTab() + tabs + "</nav>" +
      (tab === "messages" ? msgView() :
      '<div class="chips">' + tiers + "</div>" +
      '<section class="chart"><h3>' + ROLE[tab].t + " applicants <span>since the post went up</span></h3>" + chart(tab) + "</section>" +
      '<section class="list">' + (list.map(card).join("") || '<div class="empty">Nobody yet.</div>') +
      (rejected(tab).length ? '<h3 class="rej">Rejected on Indeed <span>counted in the totals above</span></h3>' + rejected(tab).map(card).join("") : "") + "</section>");
  }

  /* Messages (2026-10-29). Tyler: "build a messaging feature ... the Indeed tracker is pretty shit. It's pretty
     hard to use, especially on my phone." The same inbox as RAGER's Messages tab (control/hiremsg.py), published
     with the board: who wrote and is waiting on him, who to message next (with a first message written for each),
     calls booked. Sending stays on Indeed: copy the message, open their Indeed page, paste, Send. Stages and notes
     are set in RAGER; the chats are read from Indeed every hour. */
  var MST = {
    "new": ["To message", "✎", "var(--violet)"], messaged: ["Waiting on them", "…", "var(--mu)"], replied: ["Your turn", "●", "var(--amber)"],
    booked: ["Call booked", "☎", "var(--blue)"], talked: ["Talked", "✓", "var(--blue)"], picked: ["Picked", "★", "var(--green)"], passed: ["Passed", "✕", "var(--slate)"]
  };
  var MF = [["turn", "Your turn"], ["new", "To message"], ["messaged", "Waiting"], ["booked", "Calls"], ["all", "Everyone"]];
  var mfilt = load("bbt-hire-mf") || "turn", mopen = null, mtpl = {}, medit = {};
  function M() { return (board && board.messages) || null; }
  function mturn(c) { return c.turn === "you" && !c.low && c.stage !== "passed"; }
  function mfirst(c) { return (c.name || "").split(/\s+/)[0]; }
  function mwhen(s) {
    var v = t(s); if (!v) return "";
    var d = new Date(v), now = new Date(), hm = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return hm;
    if (new Date(now - 864e5).toDateString() === d.toDateString()) return "Yesterday " + hm;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + hm;
  }
  function mcall(s) {
    if (!s) return ""; var d = new Date(s); if (isNaN(d)) return s;
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + " Pacific";
  }
  function mfill(c, id) {
    var D = M(), T = (D.templates || []).filter(function (x) { return x.id === id; })[0];
    if (!T) return "";
    var W = (D.waves || []).filter(function (w) { return w.n === (c.wave || 1); })[0] || { start: "2026-11-09" };
    var book = (D.settings || {}).booking;
    var ask = book ? "Pick any time that suits you here: " + book : "Send me two or three times that suit you and I'll make one work.";
    var wave = new Date(W.start + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    var s = T.text.replace(/\{first\}/g, mfirst(c)).replace(/\{wave\}/g, wave).replace(/\{ask\}/g, ask)
      .replace(/\{time\}/g, c.call_at ? mcall(c.call_at) : "[the time]").replace(/\{booking\}/g, book || "").replace(/ \{hook\}/g, "");
    if (id === "book" && c.role === "ai") s = s.replace("Thanks for applying for the commission-only closer role.", "Thanks for applying to sell our AI software.");
    return s;
  }
  function mdefault(c) {
    if (c.draft) return "draft";
    return c.stage === "new" ? "book" : c.stage === "booked" ? "remind" : c.stage === "talked" ? (c.fit === "no" ? "pass" : "next")
      : c.stage === "replied" ? (c.personal ? "lock" : "thanks") : c.stage === "messaged" ? "nudge" : c.stage === "passed" ? "pass" : "book";
  }
  function mlist() {
    var P = M().people || [];
    var L = mfilt === "turn" ? P.filter(mturn) : mfilt === "all" ? P.filter(function (c) { return !c.low; }) : P.filter(function (c) { return c.stage === mfilt; });
    if (mfilt === "booked") return L.slice().sort(function (a, b) { return t(a.call_at) - t(b.call_at); });
    if (mfilt === "new") return L;
    return L.slice().sort(function (a, b) { return t(b.last_at) - t(a.last_at); });
  }
  function msgTab() {
    var D = M(); if (!D) return "";
    var P = D.people || [], w = P.filter(mturn).length, q = P.filter(function (c) { return c.stage === "new"; }).length;
    return '<button type="button" role="tab" class="tab msgs' + (tab === "messages" ? " on" : "") + '" style="--c:var(--amber)" data-tab="messages" aria-selected="' + (tab === "messages") + '">' +
      '<div class="row"><b>Messages</b><em>' + w + "</em></div><u>" + (w ? "waiting on you" : "nobody waiting") + (q ? " · " + q + " to message" : "") + "</u></button>";
  }
  function mbubble(m, c) {
    if (m.auto) return '<div class="mauto">Automated message · ' + esc(mwhen(m.at)) + "</div>";
    var me = m.from === "tyler";
    return '<div class="mb ' + (me ? "me" : "them") + (m.pending ? " pend" : "") + '"><div class="mbt">' + esc(m.text) + '</div><div class="mbm">' +
      (me ? "You" : esc(mfirst(c))) + " · " + esc(mwhen(m.at)) + (me && m.seen === true ? " · ✓ Read" : me && m.seen === false ? " · not opened yet" : "") + (m.pending ? " · marked sent in RAGER" : "") + "</div></div>";
  }
  /* One chat (2026-10-29, Tyler: "it should just be like a messaging ... I really hate that you've already filled
     out a message for me"). The chat, an empty box, one button that copies it and opens Indeed, and his notes. */
  function mcard(c) {
    var on = mopen === c.key, last = c.last;
    var prev = last ? (last.from === "them" ? "" : "You: ") + last.text.replace(/\s+/g, " ") : "No messages yet";
    var more = "";
    if (on) {
      var text = medit[c.key] != null ? medit[c.key] : "";
      more = '<div class="more"><div class="mthread">' + ((c.thread || []).map(function (m) { return mbubble(m, c); }).join("") || '<div class="mauto">No messages yet</div>') + "</div>" +
        '<textarea class="mta" data-mta="' + esc(c.key) + '" rows="3" placeholder="Write a message…">' + esc(text) + "</textarea>" +
        (c.profile_url ? '<a class="mgo" data-mc="' + esc(c.key) + '" href="' + esc(c.profile_url) + '" target="_blank" rel="noopener noreferrer">Send on Indeed</a>'
                       : '<button type="button" class="mgo" data-mc="' + esc(c.key) + '">Copy</button>') +
        '<div class="mhint" id="mh-' + esc(c.key) + '"></div>' +
        (c.notes ? '<div class="note"><div class="lbl">Notes</div>' + esc(c.notes) + "</div>" : "") + "</div>";
    }
    return '<div class="app' + (on ? " on" : "") + (mturn(c) ? " mturn" : "") + '" style="--t:' + (mturn(c) ? "var(--amber)" : "var(--line)") + '"><button type="button" data-mo="' + esc(c.key) + '" aria-expanded="' + on + '">' +
      '<i class="dot"></i><div class="who"><b>' + esc(c.name) + "</b><span>" + (c.role === "ai" ? "AI" : "Websites") + (c.where ? " · " + esc(c.where) : "") + "</span>" +
      '<p class="mprev">' + esc(prev.slice(0, 110)) + "</p></div>" +
      '<div class="side"><span class="ago">' + esc(mwhen(c.last_at)) + "</span></div></button>" + more + "</div>";
  }
  function msgView() {
    var D = M();
    if (!D) return '<div class="empty">Messages show up after the next check from Tyler\'s PC.</div>';
    var P = D.people || [];
    var n = function (k) { return k === "turn" ? P.filter(mturn).length : k === "all" ? P.filter(function (c) { return !c.low; }).length : P.filter(function (c) { return c.stage === k; }).length; };
    var L = mlist(), low = mfilt === "turn" ? P.filter(function (c) { return c.low; }) : [];
    return '<div class="chips">' + MF.map(function (f) { return '<button type="button" class="chip' + (mfilt === f[0] ? " on" : "") + '" data-mf="' + f[0] + '">' + f[1] + " <b>" + n(f[0]) + "</b></button>"; }).join("") + "</div>" +
      '<section class="list">' + (L.map(mcard).join("") || '<div class="empty">' + (mfilt === "turn" ? "Nobody is waiting on you. ✓" : "Nobody here.") + "</div>") +
      (low.length ? '<h3 class="rej">Thank-you notes <span>no reply needed</span></h3>' + low.map(mcard).join("") : "") + "</section>" +
      '<p class="pnote">Chats read from Indeed ' + esc(ago(D.synced) || "not yet") + ".</p>";
  }
  function mcopy(key) {
    var ta = app.querySelector('[data-mta="' + key + '"]'), h = document.getElementById("mh-" + key), text = ta ? ta.value : "";
    function done(ok) { if (h) { h.textContent = !text ? "" : ok ? "✓ Copied. Paste it in the Indeed chat and send." : "Couldn't copy: press and hold the text, Select All, Copy."; h.className = "mhint" + (ok ? " ok" : ""); } }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); }); return; }
    } catch (e) {}
    fallback();
    function fallback() { try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); done(document.execCommand("copy")); } catch (e) { done(false); } }
  }

  function stamp() {
    if (!board) return;
    var at = board.published || board.updated, stale = Date.now() - t(at) > 4 * 36e5;
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
        board = res[1].board;
        // a refresh never wipes a reply he is editing
        var a = document.activeElement;
        if (!(a && a.tagName === "TEXTAREA" && app.contains(a))) render();
        stamp();
      })
      .catch(function () { if (!board) gate(["Couldn't load.", "Check your connection, then tap Refresh."]); })
      .then(function () { loading = false; btn.classList.remove("spin"); });
  }

  app.addEventListener("click", function (e) {
    var tb = e.target.closest("[data-tab]");
    if (tb) { tab = tb.getAttribute("data-tab"); open = null; store(TAB_STORE, tab); render(); return; }
    var mc = e.target.closest("[data-mc]");
    if (mc) { mcopy(mc.getAttribute("data-mc")); return; }          // a link: Safari then opens Indeed
    var mf = e.target.closest("[data-mf]");
    if (mf) { mfilt = mf.getAttribute("data-mf"); mopen = null; store("bbt-hire-mf", mfilt); render(); return; }
    var mt = e.target.closest("[data-mt]");
    if (mt && mopen) { mtpl[mopen] = mt.getAttribute("data-mt"); delete medit[mopen]; render(); return; }
    var mo = e.target.closest("[data-mo]");
    if (mo) { var k = mo.getAttribute("data-mo"); mopen = mopen === k ? null : k; render();
      var el = app.querySelector(".app.on"); if (el) { el.scrollIntoView({ block: "start" }); var th = el.querySelector(".mthread"); if (th) th.scrollTop = th.scrollHeight; } return; }
    if (e.target.closest("a,details,textarea")) return;
    var c = e.target.closest("[data-id]");
    if (c) { var id = c.getAttribute("data-id"); open = open === id ? null : id; render(); }
  });
  app.addEventListener("input", function (e) { var k = e.target.getAttribute && e.target.getAttribute("data-mta"); if (k) medit[k] = e.target.value; });
  var lastW = app.clientWidth, rz = null;
  window.addEventListener("resize", function () {
    clearTimeout(rz);
    rz = setTimeout(function () {
      var a = document.activeElement;
      if (board && Math.abs(app.clientWidth - lastW) > 20 && !(a && a.tagName === "TEXTAREA" && app.contains(a))) { lastW = app.clientWidth; render(); }
    }, 150);
  });
  btn.addEventListener("click", fetchBoard);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") fetchBoard(); });
  setInterval(function () { if (document.visibilityState === "visible") fetchBoard(); }, 120000);
  setInterval(stamp, 30000);
  fetchBoard();
})();
