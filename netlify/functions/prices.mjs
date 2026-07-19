/* ============================================================
   Global Coffee Board — server-side price fetcher (Netlify Function v2)

   Runs on Netlify's servers (not the visitor's browser), so it isn't
   blocked by CORS and doesn't need a public proxy. Returns clean JSON
   the dashboard can read directly.

   Reachable at:  /api/prices   (see `config.path` below)

   Sources:
     - Arabica (KC=F)  -> Yahoo Finance      (reliable)
     - Robusta (RC=F)  -> Yahoo Finance      (currently often delisted;
                          returns null when unavailable, so the site
                          falls back to admin/manual data for Robusta)
     - USD/INR         -> open.er-api.com     (reliable, keyless)
   ============================================================ */

export const config = { path: "/api/prices" };

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

async function yahoo(symbol) {
  try {
    const url = YAHOO + encodeURIComponent(symbol) + "?interval=1d&range=5d";
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return null;
    const meta = res.meta || {};
    const closes = (res.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
    const price = meta.regularMarketPrice ?? closes.at(-1) ?? null;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? closes.at(-2) ?? price;
    if (price == null) return null;
    return { price, prev };
  } catch {
    return null;
  }
}

async function fxUsdInr() {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!r.ok) return null;
    const j = await r.json();
    return j?.rates?.INR ?? null;
  } catch {
    return null;
  }
}

// Small in-memory cache per warm instance — gentle on upstream APIs.
let cache = null;
let cacheAt = 0;
const TTL_MS = 60 * 1000;

export default async () => {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) {
    return respond(cache);
  }

  const [arabica, robusta, usdinr] = await Promise.all([
    yahoo("KC=F"), // Arabica, US cents / lb
    yahoo("RC=F"), // Robusta, USD / tonne (may be null)
    fxUsdInr(),
  ]);

  const data = { arabica, robusta, usdinr, updated: now };
  cache = data;
  cacheAt = now;
  return respond(data);
};

function respond(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });
}
