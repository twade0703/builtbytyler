/* builtbytyler.com/dnc-training: the do-not-call quiz for sales reps.
 *
 * Tyler, 2026-11-08: the slides are a separate PPTX and the rep signs the policy doc; this page is only
 * the quiz. The rep types their name, answers ten questions and submits. All ten right = passed, and the
 * pass is saved (POST /api/dnc-training re-checks the answers with the same key). Wrong answers are marked
 * and the rep tries again. Tyler's PC pulls the passes (04 Legal/reps/hiring/applicants.py dnc).
 *
 * If the Do-Not-Call Policy changes, change the questions here and KEY in functions/api/dnc-training.js,
 * and bump VERSION in both.
 */
(function () {
  "use strict";
  var VERSION = "2026-11-08";

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

  var list = $("#questions");
  list.innerHTML = QUIZ.map(function (x, n) {
    return '<fieldset class="qz" id="q' + n + '"><legend><span class="qz__no">' + String(n + 1).padStart(2, "0") + "</span>" + esc(x.q) + "</legend>" +
      x.o.map(function (o, k) {
        return '<label class="qz__opt"><input type="radio" name="q' + n + '" value="' + k + '"><span>' + esc(o) + "</span></label>";
      }).join("") + '<p class="qz__fb" aria-live="polite"></p></fieldset>';
  }).join("");

  // Live "answered" count.
  var count = $("#answered");
  function answers() {
    return QUIZ.map(function (_, n) { var c = list.querySelector('input[name="q' + n + '"]:checked'); return c ? Number(c.value) : -1; });
  }
  function tally() { count.textContent = answers().filter(function (a) { return a >= 0; }).length + " of " + QUIZ.length + " answered"; }
  list.addEventListener("change", tally);
  tally();

  $("#quiz").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#quiz-msg"), btn = $("#quiz-btn"), name = $("#name").value.replace(/\s+/g, " ").trim();
    msg.className = "quiz-msg";
    if (name.length < 3 || name.indexOf(" ") < 0) {
      msg.textContent = "Type your full name, first and last, at the top.";
      $("#name").focus();
      return;
    }
    var a = answers(), right = 0, first = null;
    QUIZ.forEach(function (x, n) {
      var fs = $("#q" + n), fb = fs.querySelector(".qz__fb");
      fs.classList.remove("ok", "no");
      if (a[n] === x.a) { right++; fs.classList.add("ok"); fb.textContent = "✓ Correct. " + x.why; }
      else { fs.classList.add("no"); fb.textContent = a[n] < 0 ? "✕ Not answered yet." : "✕ Not quite. Have another look at this one."; if (first === null) first = fs; }
    });
    if (right !== QUIZ.length) {
      msg.textContent = right + " of " + QUIZ.length + " right. Change the ones marked ✕ and submit again. You need all " + QUIZ.length + ".";
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    btn.disabled = true; btn.textContent = "Saving…";
    fetch("/api/dnc-training", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name, answers: a, version: VERSION, t0: t0, website: $("#hp").value })
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "That didn't save. Please submit again.");
        $("#quiz").hidden = true;
        $("#done-name").textContent = name;
        $("#done-ref").textContent = j.ref;
        $("#done-when").textContent = new Date(j.signed).toLocaleString([], { dateStyle: "long", timeStyle: "short" });
        $("#done").hidden = false;
        window.scrollTo({ top: $("#done").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
      })
      .catch(function (err) {
        msg.textContent = err.message || "That didn't save. Please submit again.";
        btn.disabled = false; btn.textContent = "Submit quiz";
      });
  });
})();
