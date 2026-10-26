/* /api/hiring-board: the data behind builtbytyler.com/hiring, Tyler's live view of
 * every closer applicant, made to stay open in a phone browser tab.
 *
 *   POST /api/hiring-board   Tyler's PC publishes the latest snapshot.
 *                            Needs "Authorization: Bearer <APPLY_ADMIN_KEY>".
 *                            Body: { board: {...}, view_hash: "<sha256 hex of the view key>" }
 *   GET  /api/hiring-board   The page reads it. Needs "Authorization: Bearer <view key>".
 *   ?doc=plan / body.doc "plan": the demo-week plan behind /plan (demo_week.py publish),
 *                            same keys, its own KV entry.
 *
 * The view key lives only in the link Tyler was texted (after the #, so it is
 * never sent in a URL or written to a log) and in his browser's storage. KV
 * keeps only its SHA-256, so the stored data can't be read with what's stored.
 * The snapshot carries names, towns, rankings and resume text; never a phone
 * number, email or street address (hiring_store.py strips them before upload).
 */

const DOCS = { board: "board:latest", plan: "plan:latest" };   // /hiring and /plan
const VIEW = "board:viewhash";
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const bearer = (request) => (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

export async function onRequestPost({ request, env }) {
  const want = env.APPLY_ADMIN_KEY || "";
  if (!env.APPLY || want.length < 32) return json({ ok: false }, 401);
  if (!same(await sha256hex(bearer(request)), await sha256hex(want))) return json({ ok: false }, 401);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "bad json" }, 400);
  }
  if (!body || typeof body.board !== "object" || (body.doc !== "plan" && !Array.isArray(body.board.people))) return json({ ok: false, error: "no board" }, 400);
  if (body.view_hash && !/^[0-9a-f]{64}$/.test(body.view_hash)) return json({ ok: false, error: "bad view_hash" }, 400);
  const doc = DOCS[body.doc || "board"];
  if (!doc) return json({ ok: false, error: "bad doc" }, 400);
  body.board.published = new Date().toISOString();
  await env.APPLY.put(doc, JSON.stringify(body.board));
  if (body.view_hash) await env.APPLY.put(VIEW, body.view_hash);
  return json({ ok: true, doc: body.doc || "board", people: (body.board.people || []).length, published: body.board.published });
}

export async function onRequestGet({ request, env }) {
  if (!env.APPLY) return json({ ok: false }, 401);
  const key = bearer(request);
  const hash = await env.APPLY.get(VIEW);
  if (!hash || key.length < 24 || !same(await sha256hex(key), hash)) return json({ ok: false }, 401);
  const doc = DOCS[new URL(request.url).searchParams.get("doc") || "board"];
  if (!doc) return json({ ok: false }, 400);
  const board = await env.APPLY.get(doc, { type: "json" });
  if (!board) return json({ ok: false, error: "nothing published yet" }, 404);
  return json({ ok: true, board });
}
