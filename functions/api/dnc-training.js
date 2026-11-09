/* /api/dnc-training: the signed do-not-call training results (dnc-training.html).
 *
 *   POST  one signed result: { name, agree, answers[], version, t0 }
 *   GET   every result, for Tyler's PC (04 Legal/reps/hiring/applicants.py dnc).
 *         Needs "Authorization: Bearer <APPLY_ADMIN_KEY>", like /api/applicants.
 *
 * Stored in the APPLY KV namespace as dnc:<ISO time>:<ref> (a prefix /api/applicants never lists).
 * Kept: name, score, policy version, signed time, seconds on the page. No IP, no user agent.
 * The policy says training records are kept at least ten years, so nothing here expires.
 *
 * The answer key matches QUIZ in assets/js/dnc-training.js. Change both together.
 */

const VERSION = "2026-11-08";
const KEY = [1, 0, 1, 2, 2, 0, 2, 1, 2, 1];
const PER_IP_PER_DAY = 10;

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
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "DNC-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

async function authorised(request, env) {
  const want = env.APPLY_ADMIN_KEY || "";
  if (want.length < 32) return false;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(got)),
    crypto.subtle.digest("SHA-256", enc.encode(want)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.APPLY) return json({ ok: false, error: "Signing is down for a moment. Please try again later." }, 503);

  const origin = request.headers.get("origin");
  const host = new URL(request.url).host;
  let originHost = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { originHost = "invalid"; }
  if (origin && originHost !== host) return json({ ok: false, error: "Bad origin." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 8192) return json({ ok: false, error: "Too big." }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "We couldn't read that. Please try again." }, 400); }

  if ((body.website || "").toString().trim()) return json({ ok: true, ref: makeRef(), signed: new Date().toISOString() });

  const name = (body.name || "").toString().replace(/\s+/g, " ").trim().slice(0, 120);
  if (name.length < 3 || !name.includes(" ")) return json({ ok: false, error: "Type your full legal name, first and last." }, 400);
  if (body.agree !== "yes") return json({ ok: false, error: "Tick the box to confirm." }, 400);
  if (body.version !== VERSION) return json({ ok: false, error: "This page is out of date. Reload it and take the quiz again." }, 409);
  const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];
  const right = KEY.filter((k, i) => answers[i] === k).length;
  if (right !== KEY.length) return json({ ok: false, error: "The quiz needs all " + KEY.length + " right before you can sign." }, 400);

  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rlKey = "rl:dnc:" + (await sha256(day + "|" + ip + "|" + (env.APPLY_SALT || "bbt-apply"))).slice(0, 24);
  const seen = Number((await env.APPLY.get(rlKey)) || 0);
  if (seen >= PER_IP_PER_DAY) return json({ ok: false, error: "Too many signatures from here today. Email twade@builtbytyler.com." }, 429);

  const now = new Date();
  const t0 = Number(body.t0 || 0);
  const ref = makeRef();
  const record = {
    ref,
    signed: now.toISOString(),
    name,
    score: right + "/" + KEY.length,
    version: VERSION,
    seconds_on_page: t0 && t0 < now.getTime() ? Math.round((now.getTime() - t0) / 1000) : null,
  };
  try {
    await env.APPLY.put("dnc:" + now.toISOString().replace(/[:.]/g, "-") + ":" + ref, JSON.stringify(record), {
      metadata: { ref, name: name.slice(0, 80), signed: record.signed, version: VERSION },
    });
  } catch (e) {
    return json({ ok: false, error: "We couldn't save your signature just now. Please try again in a few hours, or email twade@builtbytyler.com." }, 503);
  }
  try { await env.APPLY.put(rlKey, String(seen + 1), { expirationTtl: 60 * 60 * 26 }); } catch (e) { /* not worth losing a signature over */ }
  return json({ ok: true, ref, signed: record.signed });
}

export async function onRequestGet({ request, env }) {
  if (!env.APPLY || !(await authorised(request, env))) {
    return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  }
  const out = [];
  let cursor;
  do {
    const page = await env.APPLY.list({ prefix: "dnc:", cursor });
    for (const k of page.keys) {
      const r = await env.APPLY.get(k.name, { type: "json" });
      if (r) out.push(r);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return json(out);
}
