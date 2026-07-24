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
  // Coffee Board of India daily report scraper (Netlify Function).
  cbiUrl: "/api/cbi",
  // Shared admin overrides store (Netlify Function + Blobs) — same on every device.
  overridesUrl: "/api/overrides",
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
  // approximate USD→currency rates so non-India tabs render before live FX loads
  rates: { INR: 96.4, BRL: 5.42, VND: 26150, COP: 4050, IDR: 16200, ETB: 57.3 },
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

/* ---- Country dashboards ----
   India is fully live (Coffee Board of India + live FX). The other origins share
   the live global ICE futures + live FX for their currency, and show indicative
   local farm-gate estimates (world futures ± a typical origin differential in
   US$/tonne) clearly labelled as such. */
GCB.COUNTRY_ORDER = ['india', 'brazil', 'vietnam', 'colombia', 'indonesia', 'ethiopia'];
GCB.COUNTRIES = {
  india: {
    key: 'india', name: 'India', flag: '🇮🇳', cur: 'INR', sym: '₹', loc: 'en-IN', live: true, diff: 350,
    localRobTitle: 'India Robusta Cherry', localAraTitle: 'India Arabica Cherry',
    rawSource: 'Coffee Board of India', rawTitle: 'Indian Raw Coffee Price', rawUnit: '₹ / 50 kg',
  },
  brazil: {
    key: 'brazil', name: 'Brazil', flag: '🇧🇷', cur: 'BRL', sym: 'R$', loc: 'en-US', live: false, diff: 120,
    localRobTitle: 'Brazil · Conilon', localAraTitle: 'Brazil · Arabica',
    rawSource: 'Brazil · indicative estimate', rawTitle: 'Brazilian Coffee Price', rawUnit: 'R$ / kg · indicative',
    grades: [
      { grade: 'Arabica (Tipo 6)', type: 'arabica', diff: -250 },
      { grade: 'Conilon (Robusta)', type: 'robusta', diff: -150 },
    ],
  },
  vietnam: {
    key: 'vietnam', name: 'Vietnam', flag: '🇻🇳', cur: 'VND', sym: '₫', loc: 'en-US', live: false, diff: 120,
    localRobTitle: 'Vietnam · Robusta', localAraTitle: 'Vietnam · Arabica',
    rawSource: 'Vietnam · indicative estimate', rawTitle: 'Vietnamese Coffee Price', rawUnit: '₫ / kg · indicative',
    grades: [
      { grade: 'Robusta Grade 2 (Đắk Lắk)', type: 'robusta', diff: -120 },
      { grade: 'Robusta Grade 1', type: 'robusta', diff: 40 },
    ],
  },
  colombia: {
    key: 'colombia', name: 'Colombia', flag: '🇨🇴', cur: 'COP', sym: 'COL$', loc: 'en-US', live: false, diff: 800,
    localRobTitle: 'Colombia · Robusta', localAraTitle: 'Colombia · Arabica',
    rawSource: 'Colombia · indicative estimate', rawTitle: 'Colombian Coffee Price', rawUnit: 'COP / kg · indicative',
    grades: [
      { grade: 'Excelso (Arabica)', type: 'arabica', diff: 180 },
      { grade: 'Supremo (Arabica)', type: 'arabica', diff: 320 },
    ],
  },
  indonesia: {
    key: 'indonesia', name: 'Indonesia', flag: '🇮🇩', cur: 'IDR', sym: 'Rp', loc: 'en-US', live: false, diff: 250,
    localRobTitle: 'Indonesia · Robusta', localAraTitle: 'Sumatra · Arabica',
    rawSource: 'Indonesia · indicative estimate', rawTitle: 'Indonesian Coffee Price', rawUnit: 'Rp / kg · indicative',
    grades: [
      { grade: 'Robusta EK-1', type: 'robusta', diff: -80 },
      { grade: 'Sumatra Arabica (Mandheling)', type: 'arabica', diff: 120 },
    ],
  },
  ethiopia: {
    key: 'ethiopia', name: 'Ethiopia', flag: '🇪🇹', cur: 'ETB', sym: 'Br', loc: 'en-US', live: false, diff: 700,
    localRobTitle: 'Ethiopia · Robusta', localAraTitle: 'Ethiopia · Arabica',
    rawSource: 'Ethiopia · indicative estimate', rawTitle: 'Ethiopian Coffee Price', rawUnit: 'Br / kg · indicative',
    grades: [
      { grade: 'Washed Grade 2 (Arabica)', type: 'arabica', diff: 220 },
      { grade: 'Natural Grade 4 (Arabica)', type: 'arabica', diff: 60 },
    ],
  },
};
