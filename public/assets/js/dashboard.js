/* ============================================================
   Global Coffee Board — Price Dashboard engine (multi-country)

   • India tab is fully live: Coffee Board of India report (Sept futures,
     grades, market analysis) + live USD/INR.
   • Other origins (Brazil, Vietnam, Colombia, Indonesia, Ethiopia) share the
     live global ICE futures + live FX for their currency; local farm-gate
     grades are indicative estimates (world futures ± a typical differential),
     clearly labelled. The market analysis is global and shared.
   Futures priority:  admin entry -> Coffee Board -> seed.
   ============================================================ */
(function () {
  const C = GCB.config, F = GCB.fmt, conv = GCB.conv, store = GCB.store, K = GCB.KEYS;
  const COUNTRIES = GCB.COUNTRIES, ORDER = GCB.COUNTRY_ORDER;

  const state = {
    country: "india",
    robustaUsdTonne: null,   // Sept futures $/tonne (world / ICE)
    arabicaCentsLb: null,    // Sept futures ¢/lb   (world / ICE)
    usdinr: null,
    rates: {},               // USD -> currency, all currencies
    cbi: [],                 // India grades [{ grade, inr50kg, low, high }]
    robustaInrKgCbi: null,   // official CBI Sept-2026 Robusta ₹/kg
    araInrKgCbi: null,       // official CBI Sept-2026 Arabica ₹/kg
    analysis: null,          // Coffee Board's market-analysis paragraph (global)
    trend: null,             // { arabicaPct, robustaPct } — the day's futures move
    cbiDate: null,
    source: {},              // per-field: "live" | "manual" | "seed"
    updated: null,
  };

  function activeCountry() { return COUNTRIES[state.country] || COUNTRIES.india; }
  function fxOf(cur) {
    if (cur === "INR" && state.usdinr) return state.usdinr;
    return (state.rates && state.rates[cur]) || (GCB.SEED.rates && GCB.SEED.rates[cur]) || 1;
  }
  // currency amount, e.g. ₹370.35 / R$20 / ₫99,000
  function fmtCur(country, v, dec) {
    if (v == null || isNaN(v)) return "—";
    if (dec == null) dec = Math.abs(v) >= 1000 ? 0 : 2;
    return country.sym + Number(v).toLocaleString(country.loc, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  // exchange rate, decimals scaled to magnitude
  function fmtRate(country, v) {
    if (v == null || isNaN(v)) return "—";
    const dec = v >= 1000 ? 0 : (v >= 1 ? 2 : 4);
    return country.sym + Number(v).toLocaleString(country.loc, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  const robKgIn = (fx) => (state.robustaUsdTonne / 1000) * fx;
  const araKgIn = (fx) => (conv.arabicaCentsToUsdTonne(state.arabicaCentsLb) / 1000) * fx;

  /* ---------- fetching ---------- */
  async function fetchFx() {
    const r = await fetch(C.fxUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("fx http " + r.status);
    return await r.json();
  }
  async function fetchApi() {
    const r = await fetch(C.apiUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("api http " + r.status);
    return await r.json();
  }
  async function fetchCbi() {
    const r = await fetch(C.cbiUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("cbi http " + r.status);
    return await r.json();
  }
  function cherryFrom(cbi, beanRe) {
    const row = cbi.find((r) => beanRe.test(r.grade) && /cherry/i.test(r.grade));
    return row ? row.inr50kg : null;
  }
  async function fetchOverrides() {
    try {
      const r = await fetch(C.overridesUrl, { cache: "no-store" });
      if (r.ok) { const o = await r.json(); if (o && Object.keys(o).length) return o; }
    } catch {}
    return store.get(K.manual, null);
  }

  /* ---------- assemble ---------- */
  async function load() {
    const manual = await fetchOverrides();
    const seed = GCB.SEED;

    // 1) seed base
    state.robustaUsdTonne = seed.robustaUsdTonne;
    state.arabicaCentsLb = seed.arabicaCentsLb;
    state.usdinr = seed.usdinr;
    state.rates = Object.assign({}, seed.rates);
    state.cbi = seed.cbi.map((g) => ({ ...g }));
    state.robustaInrKgCbi = null;
    state.araInrKgCbi = null;
    state.analysis = null;
    state.trend = null;
    state.cbiDate = null;
    state.source = { robusta: "seed", arabica: "seed", fx: "seed", cbi: "seed" };
    state.updated = seed.updated;

    render();

    // 2) live FX (all currencies)
    await refreshFxInto();

    // 3) Coffee Board of India (global ICE futures + India grades + analysis)
    try {
      const cbi = await fetchCbi();
      if (cbi && cbi.ok) {
        if (Array.isArray(cbi.grades) && cbi.grades.length) {
          state.cbi = cbi.grades.map((g) => ({ ...g }));
          state.source.cbi = "live";
          state.cbiDate = cbi.date || null;
        }
        if (cbi.futures) {
          if (cbi.futures.robustaUsdTonne) { state.robustaUsdTonne = cbi.futures.robustaUsdTonne; state.source.robusta = "live"; }
          if (cbi.futures.arabicaCentsLb) { state.arabicaCentsLb = cbi.futures.arabicaCentsLb; state.source.arabica = "live"; }
          if (cbi.futures.robustaInrKg != null) state.robustaInrKgCbi = cbi.futures.robustaInrKg;
          if (cbi.futures.arabicaInrKg != null) state.araInrKgCbi = cbi.futures.arabicaInrKg;
        }
        if (cbi.analysis) state.analysis = cbi.analysis;
        if (cbi.trend) state.trend = cbi.trend;
      }
    } catch { /* gov site unavailable — keep seed */ }

    // 4) Admin overlay WINS (global futures)
    if (manual) {
      if (manual.robustaUsdTonne) { state.robustaUsdTonne = manual.robustaUsdTonne; state.source.robusta = "manual"; }
      if (manual.arabicaCentsLb) { state.arabicaCentsLb = manual.arabicaCentsLb; state.source.arabica = "manual"; }
    }

    store.set(K.cache, { ...state });
    render();
  }

  async function refreshFxInto() {
    try {
      const j = await fetchFx();
      if (j && j.rates && j.rates.INR) {
        state.rates = Object.assign({}, GCB.SEED.rates, j.rates);
        state.usdinr = j.rates.INR;
        state.source.fx = "live";
        state.updated = Date.now();
        return;
      }
    } catch {}
    try {
      const api = await fetchApi();
      if (api && api.usdinr != null) {
        state.rates = Object.assign({}, GCB.SEED.rates); state.rates.INR = api.usdinr;
        state.usdinr = api.usdinr; state.source.fx = "live"; state.updated = Date.now();
      }
    } catch {}
  }

  /* ---------- render ---------- */
  function badge(country, srcKey, indicative) {
    if (indicative) return `<span class="src-badge">◦ indicative</span>`;
    const s = state.source[srcKey];
    if (s === "manual") return `<span class="src-badge manual">✎ manual entry</span>`;
    if (s === "live") return `<span class="src-badge">● ${country.live ? "Coffee Board" : "live"}</span>`;
    return `<span class="src-badge">◦ sample</span>`;
  }

  function render() {
    const country = activeCountry();
    const fx = fxOf(country.cur);
    const robLocalKg = robKgIn(fx);
    const araLocalKg = araKgIn(fx);
    const unit = 'style="font-size:1rem;color:var(--text-dim)"';

    // world futures cards (same $/tonne & ¢/lb for everyone; local-currency ≈ line)
    setHTML("card-robusta", `
      <div class="label"><span class="dot" style="background:#b5762f"></span> London Robusta · Sept futures</div>
      <div class="primary">${F.usd(state.robustaUsdTonne)}<span ${unit}> US$/tonne</span></div>
      <div class="secondary">≈ ${fmtCur(country, robLocalKg)} / kg</div>
      <div class="meta"><span></span> ${badge(country, "robusta")}</div>`);

    setHTML("card-arabica", `
      <div class="label"><span class="dot" style="background:#e0a458"></span> NY Arabica · Sept futures</div>
      <div class="primary">${F.num(state.arabicaCentsLb, 2)}<span ${unit}> US¢/lb</span></div>
      <div class="secondary">≈ ${fmtCur(country, araLocalKg)} / kg</div>
      <div class="meta"><span></span> ${badge(country, "arabica")}</div>`);

    setHTML("card-fx", `
      <div class="label"><span class="dot" style="background:#4fbf8b"></span> USD / ${country.cur}</div>
      <div class="primary">${fmtRate(country, fx)}</div>
      <div class="secondary">1 US Dollar · live</div>
      <div class="meta"><span></span> ${badge(country, "fx")}</div>`);

    // local Sept-2026 price cards (India: official CBI ₹/kg; others: world futures in local currency)
    let robCardKg = robLocalKg, araCardKg = araLocalKg;
    if (country.live) {
      robCardKg = (state.source.robusta !== "manual" && state.robustaInrKgCbi != null) ? state.robustaInrKgCbi : robLocalKg;
      araCardKg = (state.source.arabica !== "manual" && state.araInrKgCbi != null) ? state.araInrKgCbi : araLocalKg;
    }
    const sub = country.live ? "Sept-2026 futures · ₹/kg" : `Sept-2026 world futures · ${country.sym}/kg`;
    const localCard = (title, v, key) => `
      <div class="label"><span class="dot" style="background:var(--latte)"></span> ${title}</div>
      <div class="primary">${fmtCur(country, v)}<span ${unit}> /kg</span></div>
      <div class="secondary">${sub}</div>
      <div class="meta"><span></span> ${badge(country, key)}</div>`;
    setHTML("card-local-robusta", localCard(country.localRobTitle, robCardKg, "robusta"));
    setHTML("card-local-arabica", localCard(country.localAraTitle, araCardKg, "arabica"));

    renderRaw(country, fx);
    renderVerdict(country, robLocalKg, araLocalKg);
    refreshCalc();

    const upd = document.getElementById("updated-at");
    if (upd) upd.textContent = state.updated ? F.when(state.updated) : "sample data";
  }

  function renderRaw(country, fx) {
    const el = document.getElementById("raw-grid");
    if (el) {
      if (country.live) {
        // India: official Coffee Board grades in ₹/50 kg
        el.innerHTML = state.cbi.map((r) => {
          const range = (r.low != null && r.high != null && r.low !== r.high)
            ? `₹${F.num(r.low, 0)} – ${F.num(r.high, 0)}`
            : F.inr(r.inr50kg, 0);
          return `<div class="glass raw-card">
              <div class="raw-grade">${r.grade}</div>
              <div class="raw-price">${range}</div>
              <div class="raw-unit">₹ / 50 kg</div>
            </div>`;
        }).join("");
      } else {
        // Others: indicative local grades = world futures ± typical differential, in local currency /kg
        el.innerHTML = (country.grades || []).map((g) => {
          const worldTonne = g.type === "arabica" ? conv.arabicaCentsToUsdTonne(state.arabicaCentsLb) : state.robustaUsdTonne;
          const perKg = ((worldTonne + (g.diff || 0)) / 1000) * fx;
          return `<div class="glass raw-card">
              <div class="raw-grade">${g.grade}</div>
              <div class="raw-price">${fmtCur(country, perKg)}</div>
              <div class="raw-unit">${country.sym} / kg · indicative</div>
            </div>`;
        }).join("");
      }
    }
    const d = document.getElementById("raw-date");
    if (d) d.textContent = country.live ? (state.cbiDate || "—") : "today's world price";
    const b = document.getElementById("cbi-badge");
    if (b) {
      if (!country.live) { b.textContent = "◦ indicative estimate"; b.style.color = "var(--text-dim)"; }
      else { const live = state.source.cbi === "live"; b.textContent = live ? "● official report" : "◦ sample data"; b.style.color = live ? "var(--good)" : "var(--text-dim)"; }
    }
  }

  // Sell/hold guidance from the (global) daily market move + Coffee Board analysis.
  function renderVerdict(country, robLocalKg, araLocalKg) {
    const el = document.getElementById("verdict");
    if (!el) return;
    const t = state.trend || {};
    const pct = t.robustaPct != null ? t.robustaPct : (t.arabicaPct != null ? t.arabicaPct : null);

    let cls, emoji, title, pill, sub;
    if (pct != null && pct <= -1) {
      cls = "bad"; emoji = "⏳"; title = "Prices easing — consider holding"; pill = "HOLD";
      sub = "Coffee futures fell today, so you may fetch a better price by waiting for the market to steady.";
    } else if (pct != null && pct >= 1) {
      cls = "good"; emoji = "🌱"; title = "Prices firming — reasonable to sell"; pill = "SELL";
      sub = "Coffee futures rose today; selling into the strength can help lock in the gain.";
    } else {
      cls = "hold"; emoji = "⚖️"; title = "Steady market — your call"; pill = "NEUTRAL";
      sub = "Prices are broadly flat today. Weigh your cash needs against the cost of storing.";
    }

    const chips = [];
    chips.push(`<span class="v-chip">Robusta Sept-2026 <b>${fmtCur(country, robLocalKg)}/kg</b></span>`);
    chips.push(`<span class="v-chip">Arabica Sept-2026 <b>${fmtCur(country, araLocalKg)}/kg</b></span>`);
    if (pct != null) {
      const dir = pct >= 0 ? "up" : "down";
      chips.push(`<span class="v-chip ${dir}">Robusta ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% today</span>`);
    }

    const label = country.live ? "Coffee Board market analysis:" : "Global market analysis (Coffee Board of India):";
    const analysis = state.analysis ? `<p class="v-analysis"><b>${label}</b> ${state.analysis}</p>` : "";

    el.className = "verdict " + cls;
    el.innerHTML = `
      <div class="v-badge">${emoji}</div>
      <div class="v-main">
        <div class="v-head"><span class="v-title">${title}</span><span class="v-pill">${pill}</span></div>
        <div class="v-sub">${sub}</div>
        ${analysis}
        <div class="v-chips">${chips.join("")}</div>
      </div>`;
  }

  /* ---------- earnings calculator (country-aware) ---------- */
  const calc = { bean: "robusta", differential: 250, outturn: 0, qtyKg: 0, mode: "outturn" };

  function tonnePrice() {
    if (calc.bean === "arabica") return (state.arabicaCentsLb || 0) * (GCB.LB_PER_TONNE / 100);
    return state.robustaUsdTonne || 0;
  }
  function effectiveKg() {
    if (calc.mode === "qty") return calc.qtyKg || 0;
    return calc.outturn > 0 ? calc.outturn : 0;
  }

  // Value = ((futures $/tonne + differential) ÷ 1000) × USD/local × kg
  function refreshCalc() {
    const out = document.getElementById("calc-out");
    if (!out) return;
    const country = activeCountry();
    const fx = fxOf(country.cur);
    const usd = tonnePrice();
    const perKg = ((usd + calc.differential) / 1000) * fx;
    const kg = effectiveKg();
    const total = perKg * kg;
    out.querySelector("[data-earn]").textContent = fmtCur(country, total, 0);
    out.querySelector("[data-earn-sub]").textContent = kg > 0
      ? `((${F.usd(usd)} + $${calc.differential.toLocaleString("en-US")}) / 1000) × ${fmtRate(country, fx)} × ${kg.toLocaleString("en-US")} kg (outturn) · ${calc.bean === "arabica" ? "Arabica" : "Robusta"}`
      : "Enter an outturn (kg) above";
  }

  function wireCalc() {
    const outturn = document.getElementById("outturn");
    document.querySelectorAll("[data-qty]").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("[data-qty]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        calc.mode = "qty";
        const cu = document.getElementById("qty-custom");
        if (chip.dataset.qty === "custom") { if (cu) { cu.style.display = "block"; cu.focus(); calc.qtyKg = Number(cu.value) || 0; } }
        else { if (cu) cu.style.display = "none"; calc.qtyKg = Number(chip.dataset.qty); }
        refreshCalc();
      });
    });
    const custom = document.getElementById("qty-custom");
    if (custom) custom.addEventListener("input", () => { calc.mode = "qty"; calc.qtyKg = Number(custom.value) || 0; refreshCalc(); });
    document.querySelectorAll("[data-bean]").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("[data-bean]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        calc.bean = chip.dataset.bean;
        refreshCalc();
      });
    });
    if (outturn) outturn.addEventListener("input", () => {
      calc.outturn = Number(outturn.value) || 0;
      calc.mode = "outturn";
      document.querySelectorAll("[data-qty]").forEach((c) => c.classList.remove("active"));
      const cu = document.getElementById("qty-custom"); if (cu) cu.style.display = "none";
      refreshCalc();
    });
    const diffInput = document.getElementById("calc-diff");
    if (diffInput) diffInput.addEventListener("input", () => { calc.differential = Number(diffInput.value) || 0; refreshCalc(); });
  }

  /* ---------- country tabs ---------- */
  function setCountry(key) {
    if (!COUNTRIES[key]) return;
    state.country = key;
    const country = COUNTRIES[key];
    // dynamic labels
    const fxl = document.getElementById("fx-label"); if (fxl) fxl.textContent = country.cur;
    const rs = document.getElementById("raw-source"); if (rs) rs.textContent = country.rawSource;
    const rt = document.getElementById("raw-title"); if (rt) rt.textContent = country.rawTitle;
    const ru = document.getElementById("raw-unit-label"); if (ru) ru.textContent = country.rawUnit;
    applyDiffDefault(country);
    document.querySelectorAll(".country-tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-country") === key));
    render();
  }
  // reset the calculator differential to the region's typical default
  function applyDiffDefault(country) {
    if (country.diff == null) return;
    calc.differential = country.diff;
    const di = document.getElementById("calc-diff"); if (di) di.value = country.diff;
    const dd = document.getElementById("calc-diff-default"); if (dd) dd.textContent = country.diff;
  }
  function wireCountryTabs() {
    document.querySelectorAll(".country-tab").forEach((tab) => {
      tab.addEventListener("click", () => setCountry(tab.getAttribute("data-country")));
    });
  }

  function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    wireCalc();
    wireCountryTabs();
    applyDiffDefault(activeCountry());
    load();
    const btn = document.getElementById("refresh-btn");
    if (btn) btn.addEventListener("click", () => { btn.classList.add("spin"); refreshFxInto().then(render).finally(() => btn.classList.remove("spin")); });
    setInterval(load, C.refreshMs);
  });
})();
