/* ============================================================
   Global Coffee Board — Price Dashboard engine
   Data priority:  live feed  ->  admin manual  ->  seed
   ============================================================ */
(function () {
  const C = GCB.config, F = GCB.fmt, conv = GCB.conv, store = GCB.store, K = GCB.KEYS;

  const state = {
    robustaUsdTonne: null, robustaPrevTonne: null,
    arabicaCentsLb: null, arabicaPrevCentsLb: null,
    usdinr: null,
    cbi: [],
    source: {},        // per-field: "live" | "manual" | "seed"
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

  async function fetchYahoo(symbol) {
    const target = C.yahooBase + encodeURIComponent(symbol) + "?interval=1d&range=5d";
    let lastErr;
    for (const proxy of C.corsProxies) {
      try {
        const url = proxy + encodeURIComponent(target);
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        const res = j?.chart?.result?.[0];
        const meta = res?.meta;
        const closes = (res?.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
        const price = meta?.regularMarketPrice ?? closes[closes.length - 1];
        const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? closes[closes.length - 2] ?? price;
        if (price == null) throw new Error("no price");
        return { price, prev };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("all proxies failed");
  }

  // Primary source: our Netlify function (server-side, reliable).
  // Returns { arabica:{price,prev}|null, robusta:{price,prev}|null, usdinr:number|null }.
  async function fetchApi() {
    const r = await fetch(C.apiUrl, { cache: "no-store" });
    if (!r.ok) throw new Error("api http " + r.status);
    return await r.json();
  }

  /* ---------- assemble ---------- */
  async function load() {
    const manual = store.get(K.manual, null);
    const seed = GCB.SEED;

    // start from seed
    Object.assign(state, {
      robustaUsdTonne: seed.robustaUsdTonne, robustaPrevTonne: seed.robustaPrevTonne,
      arabicaCentsLb: seed.arabicaCentsLb, arabicaPrevCentsLb: seed.arabicaPrevCentsLb,
      usdinr: seed.usdinr, cbi: seed.cbi.slice(),
    });
    state.source = { robusta: "seed", arabica: "seed", fx: "seed", cbi: "seed" };
    state.updated = seed.updated;

    // overlay admin manual data (source of truth for CBI + optional overrides)
    if (manual) {
      if (manual.usdinr) { state.usdinr = manual.usdinr; state.source.fx = "manual"; }
      if (manual.robustaUsdTonne) { state.robustaUsdTonne = manual.robustaUsdTonne; state.source.robusta = "manual"; }
      if (manual.arabicaCentsLb) { state.arabicaCentsLb = manual.arabicaCentsLb; state.source.arabica = "manual"; }
      if (manual.robustaPrevTonne) state.robustaPrevTonne = manual.robustaPrevTonne;
      if (manual.arabicaPrevCentsLb) state.arabicaPrevCentsLb = manual.arabicaPrevCentsLb;
      if (Array.isArray(manual.cbi) && manual.cbi.length) { state.cbi = manual.cbi; state.source.cbi = "manual"; }
      if (manual.updated) state.updated = manual.updated;
    }

    render(); // paint immediately with best-known data

    // 1) Primary: our server-side fetcher (reliable, no browser proxy).
    try {
      const api = await fetchApi();
      if (api) {
        if (api.arabica?.price != null) {
          state.arabicaCentsLb = api.arabica.price;
          state.arabicaPrevCentsLb = api.arabica.prev ?? state.arabicaPrevCentsLb;
          state.source.arabica = "live";
        }
        if (api.robusta?.price != null) {
          state.robustaUsdTonne = api.robusta.price;
          state.robustaPrevTonne = api.robusta.prev ?? state.robustaPrevTonne;
          state.source.robusta = "live";
        }
        if (api.usdinr != null) { state.usdinr = api.usdinr; state.source.fx = "live"; }
      }
    } catch { /* fetcher unavailable (e.g. local `astro dev`) — fall back below */ }

    // 2) Fallback: direct/proxy fetch for anything not yet live (keeps local dev working).
    const jobs = [];
    if (state.source.fx !== "live")
      jobs.push(fetchFx().then((inr) => { state.usdinr = inr; state.source.fx = "live"; }).catch(() => {}));
    if (state.source.arabica !== "live")
      jobs.push(fetchYahoo(C.symbols.arabica).then((d) => { state.arabicaCentsLb = d.price; state.arabicaPrevCentsLb = d.prev; state.source.arabica = "live"; }).catch(() => {}));
    if (state.source.robusta !== "live")
      jobs.push(fetchYahoo(C.symbols.robusta).then((d) => { state.robustaUsdTonne = d.price; state.robustaPrevTonne = d.prev; state.source.robusta = "live"; }).catch(() => {}));
    await Promise.allSettled(jobs);
    if (state.source.fx === "live" || state.source.robusta === "live" || state.source.arabica === "live") {
      state.updated = Date.now();
      store.set(K.cache, { ...state });
    }
    render();
  }

  /* ---------- derived ---------- */
  function pctChange(now, prev) {
    if (!prev || !now) return 0;
    return ((now - prev) / prev) * 100;
  }

  // Average local Robusta price in INR/kg from CBI table (Robusta rows), fallback to overall avg
  function localRobustaInrKg() {
    const rows = state.cbi.filter((r) => /robusta/i.test(r.grade));
    const src = rows.length ? rows : state.cbi;
    if (!src.length) return null;
    const avg50 = src.reduce((s, r) => s + (r.inr50kg || 0), 0) / src.length;
    return avg50 / 50; // INR per kg
  }

  /* ---------- render ---------- */
  function srcBadge(key) {
    const s = state.source[key];
    if (s === "live") return `<span class="src-badge">● live feed</span>`;
    if (s === "manual") return `<span class="src-badge manual">✎ manual entry</span>`;
    return `<span class="src-badge">◦ sample</span>`;
  }

  function chgTag(pct) {
    const cls = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
    const arrow = pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "—";
    return `<span class="chg ${cls}">${arrow} ${F.pct(pct)}</span>`;
  }

  function render() {
    const { usdinr, robustaUsdTonne, robustaPrevTonne, arabicaCentsLb, arabicaPrevCentsLb } = state;

    const robInr = conv.robustaToInrKg(robustaUsdTonne, usdinr);
    const araInr = conv.arabicaToInrKg(arabicaCentsLb, usdinr);
    const robPct = pctChange(robustaUsdTonne, robustaPrevTonne);
    const araPct = pctChange(arabicaCentsLb, arabicaPrevCentsLb);

    setHTML("card-robusta", `
      <div class="label"><span class="dot" style="background:#b5762f"></span> London Robusta · RC=F</div>
      <div class="primary">${F.usd(robustaUsdTonne)}<span style="font-size:1rem;color:var(--text-dim)"> /t</span></div>
      <div class="secondary">≈ ${F.inr(robInr, 2)} / kg</div>
      <div class="meta">${chgTag(robPct)} ${srcBadge("robusta")}</div>`);

    setHTML("card-arabica", `
      <div class="label"><span class="dot" style="background:#e0a458"></span> NY Arabica · KC=F</div>
      <div class="primary">${F.num(arabicaCentsLb, 2)}<span style="font-size:1rem;color:var(--text-dim)"> ¢/lb</span></div>
      <div class="secondary">≈ ${F.inr(araInr, 2)} / kg</div>
      <div class="meta">${chgTag(araPct)} ${srcBadge("arabica")}</div>`);

    setHTML("card-fx", `
      <div class="label"><span class="dot" style="background:#4fbf8b"></span> USD / INR</div>
      <div class="primary">₹${F.num(usdinr, 2)}</div>
      <div class="secondary">1 US Dollar</div>
      <div class="meta"><span></span> ${srcBadge("fx")}</div>`);

    const localRob = localRobustaInrKg();
    setHTML("card-local", `
      <div class="label"><span class="dot" style="background:var(--latte)"></span> India Robusta (avg)</div>
      <div class="primary">${F.inr(localRob, 2)}<span style="font-size:1rem;color:var(--text-dim)"> /kg</span></div>
      <div class="secondary">Coffee Board grades</div>
      <div class="meta"><span></span> ${srcBadge("cbi")}</div>`);

    renderCbi();
    renderDifferential(robInr, localRob);
    renderVerdict(robPct, araPct, robInr, localRob);
    renderChart();
    refreshCalc();

    const upd = document.getElementById("updated-at");
    if (upd) upd.textContent = state.updated ? F.when(state.updated) : "sample data";
  }

  function renderCbi() {
    const body = document.getElementById("cbi-body");
    if (!body) return;
    body.innerHTML = state.cbi.map((r) => {
      const perKg = (r.inr50kg || 0) / 50;
      return `<tr><td>${r.grade}</td><td class="num">${F.inr(r.inr50kg)}</td><td class="num">${F.inr(perKg, 2)}</td></tr>`;
    }).join("");
  }

  function renderDifferential(robInr, localRob) {
    const el = document.getElementById("differential");
    if (!el) return;
    if (localRob == null) { el.innerHTML = ""; return; }
    const diff = localRob - robInr;
    const pct = (diff / robInr) * 100;
    const positive = diff >= 0;
    el.innerHTML = `
      <div class="glass" style="padding:22px 24px">
        <div class="eyebrow">Indian Market Differential</div>
        <div style="display:flex;align-items:baseline;gap:12px;margin-top:8px;flex-wrap:wrap">
          <div style="font-family:var(--font-head);font-size:2rem;font-weight:800;color:${positive ? 'var(--good)' : 'var(--bad)'}">
            ${positive ? "+" : ""}${F.inr(diff, 2)}/kg
          </div>
          <div style="color:var(--text-muted)">(${F.pct(pct)} vs London-parity)</div>
        </div>
        <p style="color:var(--text-muted);margin-top:8px;font-size:.92rem">
          Local Coffee Board price is <b style="color:var(--text)">${positive ? "above" : "below"}</b> the London Robusta price converted to ₹/kg
          (${F.inr(robInr, 2)}/kg). ${positive
            ? "A positive differential means Indian buyers are paying a premium over the world benchmark."
            : "A negative differential means local prices trail the world benchmark — often exporting looks more attractive."}
        </p>
      </div>`;
  }

  function renderVerdict(robPct, araPct, robInr, localRob) {
    const el = document.getElementById("verdict");
    if (!el) return;

    // Signal scoring
    let score = 0;
    const reasons = [];
    if (robPct > 0.3) { score++; reasons.push(`Robusta futures up ${F.pct(robPct)}`); }
    else if (robPct < -0.3) { score--; reasons.push(`Robusta futures down ${F.pct(robPct)}`); }
    if (araPct > 0.3) { score++; reasons.push(`Arabica firm ${F.pct(araPct)}`); }
    else if (araPct < -0.3) { score--; reasons.push(`Arabica soft ${F.pct(araPct)}`); }

    if (localRob != null && robInr) {
      const diffPct = ((localRob - robInr) / robInr) * 100;
      if (diffPct > 3) { score++; reasons.push("local premium over world parity"); }
      else if (diffPct < -3) { score--; reasons.push("local discount to world parity"); }
    }

    // trend vs stored history
    const hist = store.get(K.history, []);
    if (hist.length >= 2 && localRob != null) {
      const older = hist[hist.length - 2]?.localRob;
      if (older && localRob > older * 1.005) { score++; reasons.push("local prices trending up"); }
      else if (older && localRob < older * 0.995) { score--; reasons.push("local prices trending down"); }
    }

    let cls, emoji, title, sub;
    if (score >= 2) { cls = "good"; emoji = "🌱"; title = "Good day to sell"; sub = "Multiple signals favour selling today."; }
    else if (score <= -2) { cls = "bad"; emoji = "⏳"; title = "Consider holding"; sub = "Signals are weak — you may get a better price later."; }
    else { cls = "hold"; emoji = "⚖️"; title = "Neutral / your call"; sub = "Mixed signals. Weigh your cash needs and storage."; }

    el.className = "verdict " + cls;
    el.innerHTML = `
      <div class="emoji">${emoji}</div>
      <div style="flex:1;min-width:220px">
        <div class="v-title">${title}</div>
        <div class="v-sub">${sub}</div>
        ${reasons.length ? `<div style="margin-top:8px;font-size:.85rem;color:var(--text-dim)">Signals: ${reasons.join(" · ")}</div>` : ""}
      </div>`;
  }

  function renderChart() {
    const el = document.getElementById("cbi-chart");
    if (!el) return;
    const rows = state.cbi.slice(0, 6);
    if (!rows.length) { el.innerHTML = ""; return; }
    const max = Math.max(...rows.map((r) => r.inr50kg || 0)) || 1;
    el.innerHTML = rows.map((r) => {
      const h = Math.max(6, ((r.inr50kg || 0) / max) * 100);
      const short = r.grade.replace(/\((.*?)\)/, "").replace(/Parchment/i, "Parch.").replace(/Robusta/i, "Rob").replace(/Arabica/i, "Ara").trim();
      return `<div class="bar" style="height:${h}%"><span>${(r.inr50kg / 1000).toFixed(1)}k</span><small>${short}</small></div>`;
    }).join("");
  }

  /* ---------- earnings calculator ---------- */
  const calc = { qtyKg: 60, bean: "robusta" };

  function currentInrKg() {
    if (calc.bean === "arabica") return conv.arabicaToInrKg(state.arabicaCentsLb, state.usdinr);
    // robusta: prefer local Coffee Board average if present
    const local = localRobustaInrKg();
    return local != null ? local : conv.robustaToInrKg(state.robustaUsdTonne, state.usdinr);
  }

  function refreshCalc() {
    const out = document.getElementById("calc-out");
    if (!out) return;
    const rate = currentInrKg();
    const total = rate * calc.qtyKg;
    out.querySelector("[data-earn]").textContent = F.inr(total, 0);
    out.querySelector("[data-earn-sub]").textContent =
      `${calc.qtyKg.toLocaleString("en-IN")} kg of ${calc.bean === "arabica" ? "Arabica" : "Robusta"} @ ${F.inr(rate, 2)}/kg`;
  }

  function wireCalc() {
    document.querySelectorAll("[data-qty]").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("[data-qty]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        const custom = document.getElementById("qty-custom");
        if (chip.dataset.qty === "custom") { if (custom) { custom.style.display = "block"; custom.focus(); calc.qtyKg = Number(custom.value) || 0; } }
        else { if (custom) custom.style.display = "none"; calc.qtyKg = Number(chip.dataset.qty); }
        refreshCalc();
      });
    });
    const custom = document.getElementById("qty-custom");
    if (custom) custom.addEventListener("input", () => { calc.qtyKg = Number(custom.value) || 0; refreshCalc(); });
    document.querySelectorAll("[data-bean]").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("[data-bean]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        calc.bean = chip.dataset.bean;
        refreshCalc();
      });
    });
  }

  function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    wireCalc();
    load();
    const btn = document.getElementById("refresh-btn");
    if (btn) btn.addEventListener("click", () => { btn.classList.add("spin"); load().finally(() => btn.classList.remove("spin")); });
    setInterval(load, C.refreshMs);
  });
})();
