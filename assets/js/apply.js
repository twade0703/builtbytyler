/* /apply: the rep application.
 *
 * Everything the applicant reads that changes with the role lives in ROLES,
 * so the pay wording here and in 04 Legal/reps/hiring/JOB-POST-*.md stay
 * word for word the same. Change one, change both.
 *
 * The voice memo is recorded in the browser (MediaRecorder) or uploaded, and
 * goes with the answers in one multipart POST to /api/apply
 * (functions/api/apply.js), which stores both in Cloudflare KV.
 */
(function () {
  "use strict";

  var form = document.getElementById("apply-form");
  if (!form) return;

  var MAX_SECONDS = 60;
  var MAX_BYTES = 5 * 1024 * 1024;

  var PRICE_WORDS = "“It's $500 today. That builds the site and covers your first month. " +
    "After that it's $50 a month, starting next month, until you cancel. You cancel by email, " +
    "and there's no fee.”";

  var ROLES = {
    websites: {
      pay: "Pay is commission only. You earn $210 for each website sale, plus $10 for each monthly " +
        "payment that customer makes, for up to 12 months. There's a $250 bonus in any month you " +
        "make 10 sales. There's no base pay and no expenses paid. This is a new role and nobody has " +
        "sold it yet, so we can't tell you what a typical week pays. You never pay us anything.",
      scenario: "An owner asks: “Will this get me more customers?” What do you say? One or two sentences, in your own words.",
      brief:
        "<p>Pretend the owner of <b>Acme Roofing</b> just picked up. It's a made-up roofing company " +
        "with great Google reviews and no website. In 60 seconds or less:</p><ul>" +
        "<li>say your name, that you're calling for BuiltByTyler in Monterey, California, and why;</li>" +
        "<li>tell them what a website would do for a business like theirs, without promising results;</li>" +
        "<li>give the price in exactly these words: <span class=\"quote\">" + PRICE_WORDS + "</span></li>" +
        "<li>end on a question.</li></ul>" +
        "<p class=\"warn\">Don't promise rankings, more calls, more customers or anything that " +
        "“pays for itself”. We're listening for whether you sound like someone an owner " +
        "would keep talking to, and whether you tell the truth.</p>"
    },
    "front-desk": {
      pay: "Pay is commission only. You earn $250 for each Front Desk sale, plus $20 for each monthly " +
        "payment that customer makes, for as long as they keep paying. There's a $250 bonus in any month you " +
        "make 10 sales. Each new AI product comes with its own commission, in writing, before it opens to you. There's no base pay and no expenses paid. This is a new role and nobody has " +
        "sold it yet, so we can't tell you what a typical week pays. You never pay us anything.",
      scenario: "An owner asks: “So my customers will think they're talking to a real person?” What do you say? One or two sentences, in your own words.",
      brief:
        "<p>First, call <a href=\"tel:+18312302743\">(831) 230-2743</a> and hear Front Desk answer. " +
        "Then pretend the owner of <b>Acme Roofing</b> just picked up: a made-up roofer who's up on " +
        "roofs all day and misses calls. In 60 seconds or less:</p><ul>" +
        "<li>say your name, that you're calling for BuiltByTyler in Monterey, California, and why;</li>" +
        "<li>say what Front Desk does, in plain words, and that it's an AI;</li>" +
        "<li>tell them they can call (831) 230-2743 to hear it for themselves;</li>" +
        "<li>end on a question.</li></ul>" +
        "<p class=\"warn\">Don't give a price (you get the exact words when you start), and don't " +
        "promise more jobs, more money or anything that “pays for itself”. We're listening " +
        "for whether you sound like someone an owner would keep talking to, and whether you tell the truth.</p>"
    }
  };

  var STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana",
    "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
    "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
    "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "Outside the US"];
  var BLOCKED_STATES = { "California": 1, "Outside the US": 1 };

  var $ = function (id) { return document.getElementById(id); };
  $("t0").value = String(Date.now());

  /* ---- states ---- */
  var stateSel = $("state");
  STATES.forEach(function (s) {
    var o = document.createElement("option");
    o.textContent = s; o.value = s;
    stateSel.appendChild(o);
  });

  /* ---- role ---- */
  function currentRole() {
    var r = form.querySelector("input[name=role]:checked");
    return r ? r.value : "";
  }
  function renderRole() {
    var role = currentRole();
    var box = $("paybox");
    if (!role) { box.hidden = true; return; }
    var main = role === "either" ? ROLES.websites : ROLES[role];
    var pay = $("pay-words");
    pay.textContent = "";
    if (role === "either") {
      pay.textContent = ROLES.websites.pay + " AI Front Desk pays $250 a sale plus $20 for each monthly payment, for as long as the customer keeps paying.";
    } else {
      pay.textContent = main.pay;
    }
    box.hidden = false;
    $("q-scenario").textContent = main.scenario;
    $("memo-brief").innerHTML = (role === "either"
      ? "<p class=\"warn\" style=\"margin-top:0\">Applying for either? Pitch the website plan.</p>" : "") + main.brief;
  }
  form.querySelectorAll("input[name=role]").forEach(function (r) { r.addEventListener("change", renderRole); });
  var wanted = new URLSearchParams(location.search).get("role");
  if (wanted && (wanted === "websites" || wanted === "front-desk")) {
    var pre = form.querySelector("input[name=role][value=\"" + wanted + "\"]");
    if (pre) pre.checked = true;
  }
  if (!currentRole()) {
    $("memo-brief").innerHTML = "<p>Pick a role above and your pitch brief appears here.</p>";
  }
  renderRole();

  /* ---- stops: California / outside the US / under 18 ---- */
  function blocked() {
    var st = stateSel.value;
    var age = form.querySelector("input[name=adult]:checked");
    var stopState = !!BLOCKED_STATES[st];
    var stopAge = !!(age && age.value === "no");
    $("stop-state").hidden = !stopState;
    $("stop-age").hidden = !stopAge;
    $("submit-btn").disabled = stopState || stopAge;
    return stopState || stopAge;
  }
  stateSel.addEventListener("change", blocked);
  form.querySelectorAll("input[name=adult]").forEach(function (r) { r.addEventListener("change", blocked); });

  form.querySelectorAll("input[name=complaint]").forEach(function (r) {
    r.addEventListener("change", function () {
      $("complaint-detail-wrap").hidden = r.value !== "yes" || !r.checked;
    });
  });

  /* ---- voice memo: record ---- */
  var memoBlob = null, memoName = "";
  var recBtn = $("rec-btn"), recLabel = $("rec-label"), recTime = $("rec-time"), recFill = $("rec-fill");
  var player = $("rec-play");
  var rec = null, chunks = [], stream = null, started = 0, tick = null;

  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    var c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
    return "";
  }
  function extFor(type) {
    if (/mp4|m4a|aac/.test(type)) return "m4a";
    if (/ogg/.test(type)) return "ogg";
    if (/mpeg|mp3/.test(type)) return "mp3";
    if (/wav/.test(type)) return "wav";
    return "webm";
  }
  function setMemo(blob, name) {
    memoBlob = blob; memoName = name;
    if (player.src) URL.revokeObjectURL(player.src);
    player.src = URL.createObjectURL(blob);
    player.hidden = false;
  }
  function stopRecording() {
    if (rec && rec.state !== "inactive") rec.stop();
  }
  function showUpload(msg) {
    var f = $("memo-file");
    f.hidden = false;
    if (msg) { $("form-msg").textContent = msg; }
  }

  recBtn.addEventListener("click", function () {
    if (rec && rec.state === "recording") { stopRecording(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      showUpload("This browser can't record here. Upload a recording instead.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (s) {
      stream = s; chunks = [];
      var mime = pickMime();
      try {
        rec = mime ? new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 48000 }) : new MediaRecorder(s);
      } catch (e) { rec = new MediaRecorder(s); }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        clearInterval(tick);
        stream.getTracks().forEach(function (t) { t.stop(); });
        var type = (rec.mimeType || mime || "audio/webm").split(";")[0];
        var blob = new Blob(chunks, { type: type });
        setMemo(blob, "pitch." + extFor(type));
        recBtn.dataset.state = "done";
        recLabel.textContent = "Record again";
        $("form-msg").textContent = "";
      };
      rec.start(1000);
      started = Date.now();
      recBtn.dataset.state = "recording";
      recLabel.textContent = "Stop";
      player.hidden = true;
      tick = setInterval(function () {
        var s = (Date.now() - started) / 1000;
        recTime.textContent = fmt(s) + " / 1:00";
        recFill.style.width = Math.min(100, s / MAX_SECONDS * 100) + "%";
        if (s >= MAX_SECONDS) stopRecording();
      }, 200);
    }).catch(function () {
      showUpload("We couldn't use your microphone. Allow it in your browser, or upload a recording instead.");
    });
  });

  /* ---- voice memo: upload ---- */
  $("show-upload").addEventListener("click", function () { showUpload(""); $("memo-file").click(); });
  $("memo-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { $("form-msg").textContent = "That file is over 5 MB. Keep it to 60 seconds."; e.target.value = ""; return; }
    var probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.onloadedmetadata = function () {
      URL.revokeObjectURL(probe.src);
      if (isFinite(probe.duration) && probe.duration > MAX_SECONDS + 5) {
        $("form-msg").textContent = "That recording is " + fmt(probe.duration) + ". Keep it to 60 seconds.";
        e.target.value = "";
        return;
      }
      setMemo(f, f.name);
      $("form-msg").textContent = "";
    };
    probe.onerror = function () { setMemo(f, f.name); };
    probe.src = URL.createObjectURL(f);
  });

  /* ---- submit ---- */
  var LABELS = {
    role: "what you want to sell", name: "your name", email: "your email", phone: "your mobile",
    state: "your state", works_there: "whether you'll work from there", w9: "the W-9 question",
    adult: "the 18-or-over question", experience: "your sales experience", noncompete: "the non-compete question",
    complaint: "the complaints question", scenario: "the quick question", source: "where you saw the job",
    truthful: "the “true” box", privacy_ok: "the privacy box"
  };
  function missing() {
    var out = [];
    Object.keys(LABELS).forEach(function (n) {
      var els = form.querySelectorAll("[name=\"" + n + "\"]");
      if (!els.length) return;
      var ok;
      if (els[0].type === "radio") ok = !!form.querySelector("[name=\"" + n + "\"]:checked");
      else if (els[0].type === "checkbox") ok = els[0].checked;
      else ok = els[0].value.trim() !== "";
      if (n === "email" && ok) ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(els[0].value.trim());
      els.forEach(function (el) { if (el.type !== "radio" && el.type !== "checkbox") el.setAttribute("aria-invalid", ok ? "false" : "true"); });
      if (!ok) out.push(LABELS[n]);
    });
    if (!memoBlob) out.push("your 60-second pitch");
    return out;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (blocked()) return;
    var msg = $("form-msg");
    var gaps = missing();
    if (gaps.length) {
      msg.textContent = "Still needed: " + gaps.join(", ") + ".";
      return;
    }
    var fd = new FormData(form);
    fd.append("memo", memoBlob, memoName || "pitch.webm");
    var btn = $("submit-btn");
    btn.disabled = true; btn.textContent = "Sending…"; msg.textContent = "";
    fetch("/api/apply", { method: "POST", body: fd, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (!res || !res.ok) {
          msg.textContent = (res && res.error) || "Something went wrong sending that. Please try again in a minute.";
          btn.disabled = false; btn.textContent = "Send my application";
          return;
        }
        $("done-ref").textContent = res.ref;
        form.hidden = true;
        var done = $("done");
        done.hidden = false;
        done.focus();
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function () {
        msg.textContent = "We couldn't reach the server. Check your connection and try again.";
        btn.disabled = false; btn.textContent = "Send my application";
      });
  });
})();
