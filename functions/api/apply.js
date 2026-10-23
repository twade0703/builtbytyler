/* POST /api/apply: one rep application, from apply.html.
 *
 * Stores two KV entries in the APPLY namespace (bound on the Pages project):
 *   app:<ISO time>:<ref>   the answers, as JSON (listing these sorts by time)
 *   memo:<ref>             the voice memo bytes, content type in metadata
 *
 * Nothing else is kept: no IP address, no user agent. The per-IP rate limit
 * uses a salted hash that expires after a day.
 *
 * 04 Legal/reps/hiring/applicants.py pulls these down to Tyler's PC and
 * deletes rejected ones after 12 months (the promise on the page and in
 * privacy.html#applicants).
 */

const MAX_BODY = 6 * 1024 * 1024;   // whole request
const MAX_MEMO = 5 * 1024 * 1024;   // the audio file
const PER_IP_PER_DAY = 3;
const ROLES = new Set(["websites", "front-desk", "either"]);
const BLOCKED_STATES = new Set(["California", "Outside the US"]);

// field: [max length, required]
const FIELDS = {
  role: [20, true],
  name: [120, true],
  email: [160, true],
  phone: [40, true],
  state: [40, true],
  works_there: [3, true],
  w9: [3, true],
  adult: [3, true],
  experience: [2000, true],
  smb: [1000, false],
  other_work: [300, false],
  noncompete: [10, true],
  complaint: [3, true],
  complaint_detail: [400, false],
  scenario: [800, true],
  source: [40, true],
  truthful: [3, true],
  privacy_ok: [3, true],
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeRef() {
  // BBT- + 6 characters, no 0/O/1/I so it reads back cleanly over the phone.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "BBT-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.APPLY) return json({ ok: false, error: "Applications are closed for a moment. Please try again later." }, 503);

  const origin = request.headers.get("origin");
  const host = new URL(request.url).host;
  let originHost = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { originHost = "invalid"; }
  if (origin && originHost !== host) return json({ ok: false, error: "Bad origin." }, 403);

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return json({ ok: false, error: "That upload is too big. Keep the pitch to 60 seconds." }, 413);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "We couldn't read that. Please try again." }, 400);
  }

  // Honeypot: a person never sees this field. Pretend it worked.
  if ((form.get("website") || "").toString().trim()) return json({ ok: true, ref: makeRef() });

  // Rate limit per IP, without storing the IP.
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rlKey = "rl:" + (await sha256(day + "|" + ip + "|" + (env.APPLY_SALT || "bbt-apply"))).slice(0, 24);
  const seen = Number((await env.APPLY.get(rlKey)) || 0);
  if (seen >= PER_IP_PER_DAY) {
    return json({ ok: false, error: "We've already had a few applications from here today. Email twade@builtbytyler.com if something went wrong." }, 429);
  }

  const app = {};
  const missing = [];
  for (const [key, [max, required]] of Object.entries(FIELDS)) {
    const v = (form.get(key) || "").toString().trim().slice(0, max);
    if (required && !v) missing.push(key);
    app[key] = v;
  }
  if (missing.length) return json({ ok: false, error: "Some answers are missing: " + missing.join(", ") + "." }, 400);
  if (!ROLES.has(app.role)) return json({ ok: false, error: "Pick a role." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(app.email)) return json({ ok: false, error: "That email address doesn't look right." }, 400);
  if (BLOCKED_STATES.has(app.state)) {
    return json({ ok: false, error: "We can't work with anyone who lives or works in California, or outside the United States." }, 400);
  }
  if (app.adult !== "yes") return json({ ok: false, error: "You need to be 18 or over to sell for us." }, 400);

  const memo = form.get("memo");
  if (!memo || typeof memo === "string" || !memo.size) return json({ ok: false, error: "Your 60-second pitch is missing." }, 400);
  if (memo.size > MAX_MEMO) return json({ ok: false, error: "That recording is over 5 MB. Keep it to 60 seconds." }, 413);
  const type = (memo.type || "").toLowerCase();
  const name = (memo.name || "").toLowerCase();
  const audioish = type.startsWith("audio/") || type === "video/webm" || type === "video/mp4" ||
    /\.(mp3|m4a|wav|webm|ogg|aac|mp4)$/.test(name);
  if (!audioish) return json({ ok: false, error: "The pitch has to be an audio file (MP3, M4A, WAV or WebM)." }, 400);

  const t0 = Number(form.get("t0") || 0);
  const now = new Date();
  const ref = makeRef();
  const record = {
    ref,
    received: now.toISOString(),
    seconds_on_page: t0 ? Math.round((now.getTime() - t0) / 1000) : null,
    ...app,
    memo: { type: memo.type || "application/octet-stream", name: memo.name || "", bytes: memo.size },
    flags: [
      app.works_there !== "yes" && "won't work from home state",
      app.w9 !== "yes" && "no W-9",
      app.complaint === "yes" && "past call complaint",
      app.noncompete !== "No" && "non-compete: " + app.noncompete,
    ].filter(Boolean),
  };

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  await env.APPLY.put("memo:" + ref, await memo.arrayBuffer(), {
    metadata: { type: record.memo.type, name: record.memo.name },
  });
  await env.APPLY.put(`app:${stamp}:${ref}`, JSON.stringify(record), {
    metadata: { ref, role: app.role, name: app.name.slice(0, 80), state: app.state, received: record.received },
  });
  await env.APPLY.put(rlKey, String(seen + 1), { expirationTtl: 60 * 60 * 26 });

  return json({ ok: true, ref });
}

export async function onRequestGet() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
