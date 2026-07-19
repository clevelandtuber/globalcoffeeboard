/* ============================================================
   Global Coffee Board — shared config + data layer
   ============================================================ */

window.GCB = window.GCB || {};

GCB.config = {
  // Yahoo Finance symbols
  symbols: {
    robusta: "RC=F", // ICE London Robusta  (USD / tonne)
    arabica: "KC=F", // ICE NY Arabica      (US cents / lb)
  },
  // Free, keyless, CORS-friendly FX endpoint
  fxUrl: "https://open.er-api.com/v6/latest/USD",
  // Server-side price fetcher (Netlify Function). Reliable, CORS-enabled.
  // Falls back to the direct/proxy fetch below if this is unavailable (e.g. local `astro dev`).
  apiUrl: "/api/prices",
  // Yahoo chart endpoint (wrapped in a CORS proxy for browser use — fallback path)
  yahooBase: "https://query1.finance.yahoo.com/v8/finance/chart/",
  corsProxies: [
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?url=",
  ],
  refreshMs: 5 * 60 * 1000, // auto-refresh every 5 min
  cbiSource: "https://coffeeboard.gov.in/Market_Info.aspx",
};

/* ---- Conversion helpers ---- */
GCB.LB_PER_TONNE = 2204.6226;
GCB.KG_PER_TONNE = 1000;

GCB.conv = {
  // Robusta USD/tonne -> INR/kg
  robustaToInrKg(usdPerTonne, usdinr) {
    return (usdPerTonne * usdinr) / GCB.KG_PER_TONNE;
  },
  // Arabica US cents/lb -> INR/kg
  arabicaToInrKg(centsPerLb, usdinr) {
    const usdPerLb = centsPerLb / 100;
    const usdPerKg = usdPerLb * (GCB.LB_PER_TONNE / GCB.KG_PER_TONNE); // per kg
    return usdPerKg * usdinr;
  },
  // Arabica cents/lb -> USD/tonne (for reference display)
  arabicaCentsToUsdTonne(centsPerLb) {
    return (centsPerLb / 100) * GCB.LB_PER_TONNE;
  },
};

/* ---- Formatting ---- */
GCB.fmt = {
  inr(n, d = 0) {
    if (n == null || isNaN(n)) return "—";
    return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  usd(n, d = 0) {
    if (n == null || isNaN(n)) return "—";
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  num(n, d = 2) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  pct(n) {
    if (n == null || isNaN(n)) return "—";
    const s = n > 0 ? "+" : "";
    return s + n.toFixed(2) + "%";
  },
  when(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  },
};

/* ---- localStorage keys ---- */
GCB.KEYS = {
  manual: "gcb_manual_prices_v1",   // admin-entered override snapshot
  history: "gcb_price_history_v1",  // array of daily local-price points
  cache: "gcb_live_cache_v1",       // last successful live fetch
};

GCB.store = {
  get(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
  },
};

/* ---- Sensible seed values (used only if no live + no manual data) ----
   These are illustrative fallbacks so the dashboard is never empty; they
   show as "◦ sample" on the cards. Real numbers come from the live feed
   (Arabica, USD/INR) or the admin panel (Robusta).
   Baseline snapshot: ~mid-July 2026. Robusta ≈ London Coffee $/tonne. */
GCB.SEED = {
  robustaUsdTonne: 3900,   // London Robusta ~ $3,900/t (mid-Jul 2026)
  arabicaCentsLb: 305,     // NY Arabica ~ 305 ¢/lb
  usdinr: 96.4,            // USD/INR ~ 96.4
  robustaPrevTonne: 3850,
  arabicaPrevCentsLb: 308,
  // Coffee Board of India — Daily Coffee Market Report (INR / 50 kg bag typical grades)
  cbi: [
    { grade: "Arabica Parchment (AB)", inr50kg: 24500 },
    { grade: "Arabica Cherry (AB)",    inr50kg: 14800 },
    { grade: "Robusta Parchment (AB)", inr50kg: 17200 },
    { grade: "Robusta Cherry (AB)",    inr50kg: 9400  },
  ],
  updated: null,
};
