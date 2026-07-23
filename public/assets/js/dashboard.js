/* ============================================================
   Global Coffee Board — Price Dashboard engine

   Card values come from the SERVER (same on every device):
     • London Robusta / NY Arabica  = Coffee Board SEPTEMBER futures
     • India Robusta / Arabica Cherry = Coffee Board raw grade prices
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
        }
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
    const robCherryKg = state.robCherry50 != null ? state.robCherry50 / 50 : null;
    const araCherryKg = state.araCherry50 != null ? state.araCherry50 / 50 : null;
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

    const cherryCard = (title, perKg, per50, key) => `
      <div class="label"><span class="dot" style="background:var(--latte)"></span> ${title}</div>
      <div class="primary">${perKg != null ? F.inr(perKg, 2) : "—"}<span ${unit}> /kg</span></div>
      <div class="secondary" style="font-size:.85rem;color:var(--text-dim)">${per50 != null ? F.inr(per50, 0) + " / 50 kg" : "—"}</div>
      <div class="meta"><span></span> ${srcBadge(key)}</div>`;
    setHTML("card-local-robusta", cherryCard("India Robusta Cherry", robCherryKg, state.robCherry50, "robCherry"));
    setHTML("card-local-arabica", cherryCard("India Arabica Cherry", araCherryKg, state.araCherry50, "araCherry"));

    renderRaw();
    renderVerdict(robInr, robCherryKg);
    refreshCalc();

    const upd = document.getElementById("updated-at");
    if (upd) upd.textContent = state.updated ? F.when(state.updated) : "sample data";
  }

  // "Indian Raw Coffee Price" grid under the cards.
  function renderRaw() {
    const el = document.getElementById("raw-grid");
    if (el) {
      el.innerHTML = state.cbi.map((r) => {
        const range = (r.low != null && r.high != null && r.low !== r.high)
          ? `₹${F.num(r.low, 0)} – ${F.num(r.high, 0)}`
          : F.inr(r.inr50kg, 0);
        return `<div class="glass raw-card">
            <div class="raw-grade">${r.grade}</div>
            <div class="raw-price">${range}</div>
            <div class="raw-unit">₹ / 50 kg · ≈ ${F.inr((r.inr50kg || 0) / 50, 0)}/kg</div>
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

  // Compares India Robusta Cherry (₹/kg) with the London Robusta futures
  // converted to ₹/kg. Both reflect Admin overrides when set, else Coffee Board.
  function renderVerdict(robInr, localRob) {
    const el = document.getElementById("verdict");
    if (!el) return;
    const diffPct = (localRob != null && robInr) ? ((localRob - robInr) / robInr) * 100 : null;

    let cls, emoji, title, pill, sub;
    if (diffPct != null && diffPct > 3) {
      cls = "good"; emoji = "🌱"; title = "Reasonable day to sell"; pill = "SELL";
      sub = "India Robusta Cherry is trading above the world benchmark, so selling now looks favourable.";
    } else if (diffPct != null && diffPct < -3) {
      cls = "bad"; emoji = "⏳"; title = "Consider holding"; pill = "HOLD";
      sub = "India Robusta Cherry is trailing the world benchmark, so you may get a better price by waiting.";
    } else {
      cls = "hold"; emoji = "⚖️"; title = "Neutral, your call"; pill = "NEUTRAL";
      sub = "Local and world prices are roughly in line. Weigh your cash needs against storage.";
    }

    const chips = [];
    if (localRob != null) chips.push(`<span class="v-chip">India Robusta Cherry <b>${F.inr(localRob, 0)}/kg</b></span>`);
    if (robInr) chips.push(`<span class="v-chip">World parity <b>${F.inr(robInr, 0)}/kg</b></span>`);
    if (diffPct != null) {
      const dir = diffPct >= 0 ? "up" : "down";
      chips.push(`<span class="v-chip ${dir}">${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% vs world</span>`);
    }

    el.className = "verdict " + cls;
    el.innerHTML = `
      <div class="v-badge">${emoji}</div>
      <div class="v-main">
        <div class="v-head"><span class="v-title">${title}</span><span class="v-pill">${pill}</span></div>
        <div class="v-sub">${sub}</div>
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
      ? `((${F.usd(usd)} + $${calc.differential.toLocaleString("en-IN")}) / 1000) × ₹${F.num(state.usdinr, 2)} × ${kg.toLocaleString("en-IN")} kg (${calc.mode === "qty" ? "quantity" : "outturn"}) · ${calc.bean === "arabica" ? "Arabica" : "Robusta"}`
      : "Enter an outturn (kg) above, or pick a quantity";
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
