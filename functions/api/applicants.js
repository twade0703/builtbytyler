/* /api/applicants: Tyler's tracker (04 Legal/reps/hiring/applicants.py) reads
 * the applications from here, so no Cloudflare key with KV access has to live
 * on his PC.
 *
 *   GET    /api/applicants              list of { key, ref, record }
 *   GET    /api/applicants?memo=<ref>   the voice memo bytes
 *   DELETE /api/applicants?ref=<ref>    delete an application and its memo
 *
 * Every request needs "Authorization: Bearer <APPLY_ADMIN_KEY>", a secret set
 * on the Pages project. Without the secret set, the endpoint is closed.
 */

const REF = /^BBT-[A-Z0-9]{6}$/;

function deny(status = 401) {
  return new Response("Unauthorized", { status, headers: { "cache-control": "no-store" } });
}

async function authorised(request, env) {
  const want = env.APPLY_ADMIN_KEY || "";
  if (want.length < 32) return false;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Compare digests so the comparison takes the same time whatever the input.
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

async function appKeyFor(env, ref) {
  let cursor;
  do {
    const page = await env.APPLY.list({ prefix: "app:", cursor });
    const hit = page.keys.find((k) => k.name.endsWith(":" + ref));
    if (hit) return hit.name;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return null;
}

export async function onRequestGet({ request, env }) {
  if (!env.APPLY || !(await authorised(request, env))) return deny();
  const url = new URL(request.url);
  const memo = url.searchParams.get("memo");
  if (memo) {
    if (!REF.test(memo)) return deny(400);
    const { value, metadata } = await env.APPLY.getWithMetadata("memo:" + memo, { type: "arrayBuffer" });
    if (!value) return new Response("Not found", { status: 404 });
    return new Response(value, {
      headers: { "content-type": (metadata && metadata.type) || "application/octet-stream", "cache-control": "no-store" },
    });
  }
  const out = [];
  let cursor;
  do {
    const page = await env.APPLY.list({ prefix: "app:", cursor });
    for (const k of page.keys) {
      const record = await env.APPLY.get(k.name, { type: "json" });
      if (record) out.push({ key: k.name, ref: record.ref, record });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return new Response(JSON.stringify(out), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestDelete({ request, env }) {
  if (!env.APPLY || !(await authorised(request, env))) return deny();
  const ref = new URL(request.url).searchParams.get("ref") || "";
  if (!REF.test(ref)) return deny(400);
  const key = await appKeyFor(env, ref);
  if (key) await env.APPLY.delete(key);
  await env.APPLY.delete("memo:" + ref);
  return new Response(JSON.stringify({ ok: true, deleted: !!key }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
