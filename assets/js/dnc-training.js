/* builtbytyler.com/dnc-training: the do-not-call training for sales reps.
 *
 * Slides, then a quiz, then the rep signs by typing their full name. The quiz must be all
 * right to sign (wrong answers can be changed and checked again). On sign, POST /api/dnc-training,
 * which re-checks the answers (functions/api/dnc-training.js keeps the same key) and stores the
 * signed result. Tyler's PC pulls the results (04 Legal/reps/hiring/applicants.py dnc).
 *
 * The slides say what the Do-Not-Call Policy and Training doc (Google Drive, 04 Legal > Reps)
 * says. If the policy changes, change both, bump VERSION here and in the function, and every rep
 * takes it again.
 */
(function () {
  "use strict";
  var VERSION = "2026-11-08";

  var SLIDES = [
    { h: "Why this matters",
      p: ["Federal law protects people who don't want sales calls. Breaking it is expensive: the FTC can fine over $50,000 for a single call, and the person called can sue for $500 to $1,500 per call.",
          "Every rule here is the law or our policy on top of it. It takes about ten minutes, then a short quiz."] },
    { h: "One list, kept by us",
      p: ["BuiltByTyler keeps one do-not-call list for the whole company, by phone number. It belongs to the Company, not to any rep.",
          "A number goes on it when someone asks not to be called or texted, in any words, by any means. It also goes on when they say the number is personal, not a business, or that the business is closed or sold."] },
    { h: "What counts as asking",
      p: ["“Don't call me.” “Take me off your list.” “Remove me.” “Stop.” “Not interested, don't call again.” A STOP reply to a text.",
          "If you're not sure whether they asked, treat it as a yes."] },
    { h: "On the call",
      p: ["Stop selling. Tell them: “I'll take you off our list. You won't hear from us again.” End the call politely.",
          "Before your next call, mark the business Do not call on the lead sheet, with the date, the time and what they said."] },
    { h: "What we do with it",
      p: ["We add the number to the Company list the same day, and never later than ten business days after the request.",
          "From then on it comes off every rep's batch and is never assigned again, to anyone, for any reason."] },
    { h: "Only numbers in your batch",
      p: ["Every number is checked against the National Do Not Call Registry and our own list before it reaches you, using a registry copy no more than 31 days old.",
          "Only call the checked numbers in your current batch. Never a number you found, were given, or kept from an old batch."] },
    { h: "Every call says who we are",
      p: ["In the first few seconds: your first and last name, that you're calling for BuiltByTyler in Monterey, California, and why. Give the Company number to call back on.",
          "Calls and texts come only from the Company number, never hidden or changed. Anyone who calls it can ask to come off the list, at any hour."] },
    { h: "Dialed by hand, spoken live",
      p: ["No autodialer, power dialer, prerecorded message, voicemail drop, ringless voicemail, soundboard, or AI or artificial voice. Voicemails are left live, in your own voice.",
          "Calls only from 9 am to 8 pm in the business's local time, never on federal holidays. The app enforces this."] },
    { h: "Texts",
      p: ["A business gets a text only after the owner asks for one, and their yes is logged first. Only the payment-link and demo texts the app writes, sent unedited.",
          "Anyone who replies STOP is marked Do not call the same day."] },
    { h: "Mistakes and records",
      p: ["If you call or text a number that shouldn't have been called, tell Tyler the same day. We find out why and fix it. One honest mistake you report the same day is not a reason to end your agreement.",
          "We never share the list outside BuiltByTyler, never delete a number from it, and keep every request and training record for at least ten years."] }
  ];

  // a = index of the right answer. Same key in functions/api/dnc-training.js.
  var QUIZ = [
    { q: "An owner says: “I'm not interested, and don't call me again.” What happens next?",
      o: ["One more short pitch, then end the call", "Stop selling, tell them they'll come off our list, end politely, and mark them Do not call before your next call", "Mark them Call back in 30 days", "Hang up and move on"],
      a: 1, why: "Any request not to be called means the selling stops and the business is marked Do not call before your next call." },
    { q: "Someone says “you people call way too much” and you're not sure if that was a request. What do you do?",
      o: ["Treat it as a yes and mark them Do not call", "Ask Tyler next week", "Keep calling until they say it clearly", "Only stop if they say the word “stop”"],
      a: 0, why: "If you're not sure whether they asked, treat it as a yes." },
    { q: "What goes in the note when you mark a business Do not call?",
      o: ["Nothing, just the tag", "The date, the time and what they said", "Your guess at why they said no", "Their email address"],
      a: 1, why: "Every do-not-call mark carries the date, the time and what the person said." },
    { q: "A friend gives you the number of a business that would be perfect for us. Can you call it?",
      o: ["Yes, if it's a business", "Yes, once", "No. Only call checked numbers in your current batch", "Yes, if you check Google first"],
      a: 2, why: "Only checked numbers in your current batch are called, never a number found, given or kept." },
    { q: "Which number do calls and texts come from?",
      o: ["Your own mobile", "A blocked or private number", "Only the Company number, never hidden or changed", "Whatever number gets answered most"],
      a: 2, why: "Calls and texts to leads come only from the Company number." },
    { q: "In the first few seconds of a call, the business hears:",
      o: ["Your name, that you're calling for BuiltByTyler in Monterey, California, and why", "That you're Tyler", "Nothing until they show interest", "That you're calling from Google"],
      a: 0, why: "Name, BuiltByTyler in Monterey, California, and why, every call. Never Tyler, never Google." },
    { q: "Can you use a voicemail drop or an AI voice to save time?",
      o: ["Yes, for voicemails only", "Yes, if the message is short", "No. Every call is dialed by hand and every voicemail is left live in your own voice", "Only after 6 pm"],
      a: 2, why: "No autodialer, prerecorded message, voicemail drop or AI voice, ever." },
    { q: "When can you call a business?",
      o: ["Any time they might pick up", "9 am to 8 pm in the business's local time, never on federal holidays", "9 am to 8 pm in your time zone", "Weekdays only, any hour"],
      a: 1, why: "9 am to 8 pm in the business's local time, and no federal holidays. The app enforces it." },
    { q: "A business replies STOP to a text. What happens?",
      o: ["Send one more text to confirm", "Call them instead", "They're marked Do not call the same day", "Nothing until they reply STOP twice"],
      a: 2, why: "A STOP reply means Do not call, the same day." },
    { q: "You realise you called a number that should not have been called. What do you do?",
      o: ["Nothing, it was an accident", "Tell Tyler the same day", "Delete the call from the log", "Wait to see if they complain"],
      a: 1, why: "Tell Tyler the same day. An honest mistake reported the same day isn't Cause." }
  ];

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; };
  var t0 = Date.now();

  // ---------------------------------------------------------------- slides
  var i = 0;
  var stage = $("#slide"), count = $("#slide-count"), bar = $("#slide-bar"), back = $("#slide-back"), next = $("#slide-next");
  function show() {
    var s = SLIDES[i];
    stage.innerHTML = '<span class="slide__no">' + String(i + 1).padStart(2, "0") + "</span><h2>" + esc(s.h) + "</h2>" +
      s.p.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    count.textContent = (i + 1) + " of " + SLIDES.length;
    bar.style.width = ((i + 1) / SLIDES.length * 100) + "%";
    back.disabled = i === 0;
    next.textContent = i === SLIDES.length - 1 ? "Start the quiz →" : "Next →";
  }
  back.addEventListener("click", function () { if (i > 0) { i--; show(); } });
  next.addEventListener("click", function () {
    if (i < SLIDES.length - 1) { i++; show(); return; }
    $("#quiz-wrap").hidden = false;
    $("#quiz-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") next.click();
    if (e.key === "ArrowLeft") back.click();
  });
  show();

  // ---------------------------------------------------------------- quiz
  var form = $("#quiz");
  form.innerHTML = QUIZ.map(function (x, n) {
    return '<fieldset class="qz" id="q' + n + '"><legend><span class="qz__no">' + (n + 1) + "</span>" + esc(x.q) + "</legend>" +
      x.o.map(function (o, k) {
        return '<label class="qz__opt"><input type="radio" name="q' + n + '" value="' + k + '"><span>' + esc(o) + "</span></label>";
      }).join("") + '<p class="qz__fb" aria-live="polite"></p></fieldset>';
  }).join("");

  function answers() {
    return QUIZ.map(function (_, n) { var c = form.querySelector('input[name="q' + n + '"]:checked'); return c ? Number(c.value) : -1; });
  }
  var passed = false;
  $("#quiz-check").addEventListener("click", function () {
    var a = answers(), right = 0, first = null;
    QUIZ.forEach(function (x, n) {
      var fs = $("#q" + n), fb = fs.querySelector(".qz__fb");
      fs.classList.remove("ok", "no");
      if (a[n] === x.a) { right++; fs.classList.add("ok"); fb.textContent = "✓ Correct. " + x.why; }
      else { fs.classList.add("no"); fb.textContent = a[n] < 0 ? "✕ Not answered yet." : "✕ Not quite. Have another look at this one."; if (first === null) first = fs; }
    });
    var msg = $("#quiz-msg");
    if (right === QUIZ.length) {
      passed = true;
      msg.className = "quiz-msg pass";
      msg.textContent = "✓ Passed: " + right + " of " + QUIZ.length + ". Sign below to finish.";
      $("#sign-wrap").hidden = false;
      $("#sign-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      passed = false;
      $("#sign-wrap").hidden = true;
      msg.className = "quiz-msg";
      msg.textContent = right + " of " + QUIZ.length + " right. Change the ones marked ✕ and check again. You need all " + QUIZ.length + " to sign.";
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  // ---------------------------------------------------------------- sign
  $("#sign").addEventListener("submit", function (e) {
    e.preventDefault();
    var out = $("#sign-msg"), btn = $("#sign-btn");
    var name = $("#sign-name").value.trim(), agree = $("#sign-agree").checked;
    out.textContent = "";
    if (!passed) { out.textContent = "Pass the quiz first."; return; }
    if (name.length < 3 || name.indexOf(" ") < 0) { out.textContent = "Type your full legal name, first and last."; return; }
    if (!agree) { out.textContent = "Tick the box to confirm."; return; }
    btn.disabled = true; btn.textContent = "Signing…";
    fetch("/api/dnc-training", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name, agree: "yes", answers: answers(), version: VERSION, t0: t0, website: $("#sign-hp").value })
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "That didn't go through. Please try again.");
        $("#sign").hidden = true;
        $("#done-name").textContent = name;
        $("#done-ref").textContent = j.ref;
        $("#done-when").textContent = new Date(j.signed).toLocaleString([], { dateStyle: "long", timeStyle: "short" });
        $("#done").hidden = false;
        $("#done").scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function (err) {
        out.textContent = err.message || "That didn't go through. Please try again.";
        btn.disabled = false; btn.textContent = "Sign and submit";
      });
  });
})();
