/* ============================================================
   Global Coffee Board — Price Dashboard engine

   Card values come from the SERVER (same on every device):
     • London Robusta / NY Arabica  = Coffee Board SEPTEMBER futures
     • India Robusta / Arabica Cherry = Coffee Board SEPTEMBER futures in ₹/kg
     • USD/INR = live FX
   Priority for each:  admin entry (localStorage)  ->  Coffee Board  ->  seed.
   (Yahoo was dropped — it was stale and made phone/laptop disagree.)
   ============================================================ */
(function () {
  const C = GCB.config, F = GCB.fmt, conv = GCB.conv, store = GCB.store, K = GCB.KEYS;

  const state = {
    robustaUsdTonne: null,   // Sept futures $/tonne
    arabicaCentsLb: null,    // Sept futures ¢/lb
    usdinr: null,
    cbi: [],                 // [{ grade, inr50kg, low, high }]
    robCherry50: null,       // ₹/50kg
    araCherry50: null,       // ₹/50kg
    robustaInrKgCbi: null,   // official CBI Sept-2026 Robusta ₹/kg
    araInrKgCbi: null,       // official CBI Sept-2026 Arabica ₹/kg
    analysis: null,          // Coffee Board's market-analysis paragraph
    trend: null,             // { arabicaPct, robustaPct } — the day's futures move
    cbiDate: null,
    source: {},              // per-field: "live" | "manual" | "seed"
    updated: null,
  };

  /* ---------- fetching ---------- */
  async function fetchFx() {
    const r = await fetch(C.fxUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("fx http " + r.status);
    const j = await r.json();
    const inr = j?.rates?.INR;
    if (!inr) throw new Error("no INR in fx");
    return inr;
  }

  async function fetchApi() {
    const r = await fetch(C.apiUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("api http " + r.status);
    return await r.json();
  }

  // Coffee Board daily report: { ok, date, grades:[{grade,inr50kg,low,high}], futures:{arabicaCentsLb,robustaUsdTonne} }
  async function fetchCbi() {
    const r = await fetch(C.cbiUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("cbi http " + r.status);
    return await r.json();
  }

  // ₹/50kg for a bean's "Cherry" grade from the CBI grade list.
  function cherryFrom(cbi, beanRe) {
    const row = cbi.find((r) => beanRe.test(r.grade) && /cherry/i.test(r.grade));
    return row ? row.inr50kg : null;
  }

  // Shared admin overrides from the server (same on every device).
  // Falls back to this browser's localStorage only when the server is unreachable (e.g. local `astro dev`).
  async function fetchOverrides() {
    try {
      const r = await fetch(C.overridesUrl, { cache: "no-store" });
      if (r.ok) {
        const o = await r.json();
        if (o && Object.keys(o).length) return o;
      }
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
    state.cbi = seed.cbi.map((g) => ({ ...g }));
    state.robCherry50 = cherryFrom(state.cbi, /robusta/i);
    state.araCherry50 = cherryFrom(state.cbi, /arabica/i);
    state.robustaInrKgCbi = null;
    state.araInrKgCbi = null;
    state.analysis = null;
    state.trend = null;
    state.cbiDate = null;
    state.source = { robusta: "seed", arabica: "seed", fx: "seed", robCherry: "seed", araCherry: "seed", cbi: "seed" };
    state.updated = seed.updated;

    render();

    // 2) live USD/INR
    await refreshFxInto();

    // 3) Coffee Board of India (server-side, identical on every device)
    try {
      const cbi = await fetchCbi();
      if (cbi && cbi.ok) {
        if (Array.isArray(cbi.grades) && cbi.grades.length) {
          state.cbi = cbi.grades.map((g) => ({ ...g }));
          state.source.cbi = "live";
          state.cbiDate = cbi.date || null;
          const rc = cherryFrom(state.cbi, /robusta/i); if (rc != null) { state.robCherry50 = rc; state.source.robCherry = "live"; }
          const ac = cherryFrom(state.cbi, /arabica/i); if (ac != null) { state.araCherry50 = ac; state.source.araCherry = "live"; }
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

    // 4) Admin overlay WINS
    if (manual) {
      if (manual.robustaUsdTonne) { state.robustaUsdTonne = manual.robustaUsdTonne; state.source.robusta = "manual"; }
      if (manual.arabicaCentsLb) { state.arabicaCentsLb = manual.arabicaCentsLb; state.source.arabica = "manual"; }
      if (manual.robCherry50) { state.robCherry50 = manual.robCherry50; state.source.robCherry = "manual"; }
      if (manual.araCherry50) { state.araCherry50 = manual.araCherry50; state.source.araCherry = "manual"; }
    }

    store.set(K.cache, { ...state });
    render();
  }

  // Refresh only USD/INR (the sole live value; everything else is Admin/Coffee Board).
  async function refreshFxInto() {
    try { const api = await fetchApi(); if (api && api.usdinr != null) { state.usdinr = api.usdinr; state.source.fx = "live"; state.updated = Date.now(); return; } } catch {}
    try { const inr = await fetchFx(); state.usdinr = inr; state.source.fx = "live"; state.updated = Date.now(); } catch {}
  }

  /* ---------- render ---------- */
  function srcBadge(key) {
    const s = state.source[key];
    if (s === "live") return `<span class="src-badge">● Coffee Board</span>`;
    if (s === "manual") return `<span class="src-badge manual">✎ manual entry</span>`;
    return `<span class="src-badge">◦ sample</span>`;
  }

  function render() {
    const usdinr = state.usdinr;
    const robInr = conv.robustaToInrKg(state.robustaUsdTonne, usdinr);
    const araInr = conv.arabicaToInrKg(state.arabicaCentsLb, usdinr);
    // India ₹/kg cards = the Sept-2026 futures expressed in rupees. Prefer the
    // Board's own official ₹/Kg from the report; use the live-FX conversion when
    // admin has overridden the futures price, or as a fallback.
    const robustaInrKg = state.source.robusta === "manual"
      ? conv.robustaToInrKg(state.robustaUsdTonne, usdinr)
      : (state.robustaInrKgCbi != null ? state.robustaInrKgCbi : conv.robustaToInrKg(state.robustaUsdTonne, usdinr));
    const araInrKg = state.source.arabica === "manual"
      ? conv.arabicaToInrKg(state.arabicaCentsLb, usdinr)
      : (state.araInrKgCbi != null ? state.araInrKgCbi : conv.arabicaToInrKg(state.arabicaCentsLb, usdinr));
    const unit = 'style="font-size:1rem;color:var(--text-dim)"';

    setHTML("card-robusta", `
      <div class="label"><span class="dot" style="background:#b5762f"></span> London Robusta · Sept futures</div>
      <div class="primary">${F.usd(state.robustaUsdTonne)}<span ${unit}> US$/tonne</span></div>
      <div class="secondary">≈ ${F.inr(robInr, 2)} / kg</div>
      <div class="meta"><span></span> ${srcBadge("robusta")}</div>`);

    setHTML("card-arabica", `
      <div class="label"><span class="dot" style="background:#e0a458"></span> NY Arabica · Sept futures</div>
      <div class="primary">${F.num(state.arabicaCentsLb, 2)}<span ${unit}> US¢/lb</span></div>
      <div class="secondary">≈ ${F.inr(araInr, 2)} / kg</div>
      <div class="meta"><span></span> ${srcBadge("arabica")}</div>`);

    setHTML("card-fx", `
      <div class="label"><span class="dot" style="background:#4fbf8b"></span> USD / INR</div>
      <div class="primary">₹${F.num(usdinr, 2)}</div>
      <div class="secondary">1 US Dollar · live</div>
      <div class="meta"><span></span> ${srcBadge("fx")}</div>`);

    const localCard = (title, inrKg, key) => `
      <div class="label"><span class="dot" style="background:var(--latte)"></span> ${title}</div>
      <div class="primary">${inrKg != null ? F.inr(inrKg, 2) : "—"}<span ${unit}> /kg</span></div>
      <div class="secondary">Sept-2026 futures · ₹/kg</div>
      <div class="meta"><span></span> ${srcBadge(key)}</div>`;
    setHTML("card-local-robusta", localCard("India Robusta Cherry", robustaInrKg, "robusta"));
    setHTML("card-local-arabica", localCard("India Arabica Cherry", araInrKg, "arabica"));

    renderRaw();
    renderVerdict(robustaInrKg, araInrKg);
    refreshCalc();

    const upd = document.getElementById("updated-at");
    if (upd) upd.textContent = state.updated ? F.when(state.updated) : "sample data";
  }

  // "Indian Raw Coffee Price" grid under the cards.
  function renderRaw() {
    const el = document.getElementById("raw-grid");
    if (el) {
      el.innerHTML = state.cbi.map((r) => {
        // The report quotes ₹/50 kg — show that range, with a per-kg hint.
        const range = (r.low != null && r.high != null && r.low !== r.high)
          ? `₹${F.num(r.low, 0)} – ${F.num(r.high, 0)}`
          : F.inr(r.inr50kg, 0);
        return `<div class="glass raw-card">
            <div class="raw-grade">${r.grade}</div>
            <div class="raw-price">${range}</div>
            <div class="raw-unit">₹ / 50 kg</div>
          </div>`;
      }).join("");
    }
    const d = document.getElementById("raw-date");
    if (d) d.textContent = state.cbiDate || "—";
    const b = document.getElementById("cbi-badge");
    if (b) {
      const live = state.source.cbi === "live";
      b.textContent = live ? "● official report" : "◦ sample data";
      b.style.color = live ? "var(--good)" : "var(--text-dim)";
    }
  }

  // Sell/hold guidance driven by the Coffee Board's own daily report:
  //   • lean = the day's Robusta futures move (falls back to Arabica)
  //   • the Board's "Market Analysis" paragraph is shown as expert commentary
  //   • the official Sept-2026 ₹/kg figures are displayed
  // Everything here comes from the same CBI report, so it refreshes together
  // with the price cards.
  function renderVerdict(robustaInrKg, araInrKg) {
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
    if (robustaInrKg != null) chips.push(`<span class="v-chip">Robusta Sept-2026 <b>${F.inr(robustaInrKg, 0)}/kg</b></span>`);
    if (araInrKg != null) chips.push(`<span class="v-chip">Arabica Sept-2026 <b>${F.inr(araInrKg, 0)}/kg</b></span>`);
    if (pct != null) {
      const dir = pct >= 0 ? "up" : "down";
      chips.push(`<span class="v-chip ${dir}">Robusta ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% today</span>`);
    }

    const analysis = state.analysis
      ? `<p class="v-analysis"><b>Coffee Board market analysis:</b> ${state.analysis}</p>`
      : "";

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

  /* ---------- earnings calculator ---------- */
  const calc = { bean: "robusta", differential: 250, outturn: 0, qtyKg: 0, mode: "outturn" };

  // Selected bean's futures price in US$/tonne (Robusta is $/tonne; Arabica ¢/lb → $/tonne).
  function tonnePrice() {
    if (calc.bean === "arabica") return (state.arabicaCentsLb || 0) * (GCB.LB_PER_TONNE / 100);
    return state.robustaUsdTonne || 0;
  }

  function effectiveKg() {
    if (calc.mode === "qty") return calc.qtyKg || 0;
    return calc.outturn > 0 ? calc.outturn : 0;
  }

  // Value = ((futures $/tonne + differential $/tonne) ÷ 1000) × USD/INR × kg
  function refreshCalc() {
    const out = document.getElementById("calc-out");
    if (!out) return;
    const usd = tonnePrice();
    const perKg = ((usd + calc.differential) / 1000) * (state.usdinr || 0);
    const kg = effectiveKg();
    const total = perKg * kg;
    out.querySelector("[data-earn]").textContent = F.inr(total, 0);
    out.querySelector("[data-earn-sub]").textContent = kg > 0
      ? `((${F.usd(usd)} + $${calc.differential.toLocaleString("en-IN")}) / 1000) × ₹${F.num(state.usdinr, 2)} × ${kg.toLocaleString("en-IN")} kg (outturn) · ${calc.bean === "arabica" ? "Arabica" : "Robusta"}`
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

  function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    wireCalc();
    load();
    const btn = document.getElementById("refresh-btn");
    if (btn) btn.addEventListener("click", () => { btn.classList.add("spin"); refreshFxInto().then(render).finally(() => btn.classList.remove("spin")); });
    setInterval(load, C.refreshMs);
  });
})();
