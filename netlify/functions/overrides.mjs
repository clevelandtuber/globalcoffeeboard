/* ============================================================
   Global Coffee Board — shared admin overrides (Netlify Function v2)
   Reachable at /api/overrides

   GET  → returns the current overrides JSON (public; the dashboard
          reads this so every device shows the same values).
   POST → saves overrides to a shared server store (Netlify Blobs).
          Protected by the ADMIN_KEY environment variable, sent in the
          `x-admin-key` header, so only you can change prices.

   Only the four card fields are accepted; everything else is ignored.
   ============================================================ */
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/overrides" };

const FIELDS = ["robustaUsdTonne", "arabicaCentsLb", "robCherry50", "araCherry50"];

function clean(body) {
  const o = {};
  for (const k of FIELDS) {
    const n = Number(body?.[k]);
    if (n > 0 && isFinite(n)) o[k] = n;
  }
  return o;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-admin-key",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "cache-control": "no-store",
    },
  });
}

export default async (req) => {
  const store = getStore("gcb");

  if (req.method === "OPTIONS") return json({}, 204);

  if (req.method === "POST") {
    const key = req.headers.get("x-admin-key") || "";
    if (!process.env.ADMIN_KEY) return json({ ok: false, error: "ADMIN_KEY not configured on the server" }, 500);
    if (key !== process.env.ADMIN_KEY) return json({ ok: false, error: "unauthorized" }, 401);
    let body = {};
    try { body = await req.json(); } catch {}
    const data = { ...clean(body), updated: Date.now() };
    await store.setJSON("overrides", data);
    return json({ ok: true, saved: data });
  }

  // GET — public read
  const data = await store.get("overrides", { type: "json" }).catch(() => null);
  return json(data || {});
};
