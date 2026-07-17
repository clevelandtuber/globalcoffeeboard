/* ============================================================
   Global Coffee Board — Admin panel
   Manual daily price entry -> localStorage (source of truth
   for Coffee Board grades + optional futures/FX overrides).
   Also records a history point for trend/verdict logic.
   ============================================================ */
(function () {
  const store = GCB.store, K = GCB.KEYS, F = GCB.fmt;

  const defaultGrades = GCB.SEED.cbi.map((r) => ({ ...r }));

  function loadIntoForm() {
    const m = store.get(K.manual, null) || {};
    val("usdinr", m.usdinr);
    val("robusta", m.robustaUsdTonne);
    val("robustaPrev", m.robustaPrevTonne);
    val("arabica", m.arabicaCentsLb);
    val("arabicaPrev", m.arabicaPrevCentsLb);
    renderGradeRows(Array.isArray(m.cbi) && m.cbi.length ? m.cbi : defaultGrades);
  }

  function renderGradeRows(rows) {
    const body = document.getElementById("grade-rows");
    body.innerHTML = "";
    rows.forEach((r) => addGradeRow(r.grade, r.inr50kg));
  }

  function addGradeRow(grade = "", inr50kg = "") {
    const body = document.getElementById("grade-rows");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="g-name" value="${escapeAttr(grade)}" placeholder="e.g. Robusta Cherry (AB)"></td>
      <td><input class="g-price" type="number" inputmode="numeric" value="${inr50kg}" placeholder="₹ / 50kg"></td>
      <td style="width:52px"><button class="btn btn-ghost g-del" style="padding:8px 12px">✕</button></td>`;
    tr.querySelector(".g-del").addEventListener("click", () => tr.remove());
    body.appendChild(tr);
  }

  function collect() {
    const grades = [];
    document.querySelectorAll("#grade-rows tr").forEach((tr) => {
      const name = tr.querySelector(".g-name").value.trim();
      const price = Number(tr.querySelector(".g-price").value);
      if (name && price > 0) grades.push({ grade: name, inr50kg: price });
    });
    const data = {
      usdinr: num("usdinr"),
      robustaUsdTonne: num("robusta"),
      robustaPrevTonne: num("robustaPrev"),
      arabicaCentsLb: num("arabica"),
      arabicaPrevCentsLb: num("arabicaPrev"),
      cbi: grades,
      updated: Date.now(),
    };
    // strip empty numeric fields so live feed can fill them
    Object.keys(data).forEach((k) => { if (data[k] === 0 || Number.isNaN(data[k])) delete data[k]; });
    return data;
  }

  function save() {
    const data = collect();
    store.set(K.manual, data);

    // record history point (local robusta avg in INR/kg) for trend logic
    const robRows = (data.cbi || []).filter((r) => /robusta/i.test(r.grade));
    const src = robRows.length ? robRows : (data.cbi || []);
    if (src.length) {
      const localRob = src.reduce((s, r) => s + r.inr50kg, 0) / src.length / 50;
      const hist = store.get(K.history, []);
      hist.push({ t: Date.now(), localRob });
      store.set(K.history, hist.slice(-60));
    }
    notice("Saved. The dashboard will use these values immediately.", "ok");
  }

  function num(id) { return Number(document.getElementById(id).value); }
  function val(id, v) { const el = document.getElementById(id); if (el && v != null) el.value = v; }
  function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

  function notice(msg, type) {
    const n = document.getElementById("admin-notice");
    n.className = "notice " + (type || "info");
    n.textContent = msg;
    n.style.display = "block";
    setTimeout(() => { n.style.opacity = "0.6"; }, 2500);
    n.style.opacity = "1";
  }

  function exportJson() {
    const data = store.get(K.manual, {});
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gcb-prices-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        store.set(K.manual, data);
        loadIntoForm();
        notice("Imported successfully.", "ok");
      } catch { notice("Could not parse that file.", "info"); }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm("Clear all manually-entered prices? The dashboard will fall back to the live feed and sample data.")) return;
    localStorage.removeItem(K.manual);
    loadIntoForm();
    notice("Manual data cleared.", "info");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadIntoForm();
    document.getElementById("add-grade").addEventListener("click", () => addGradeRow());
    document.getElementById("save-btn").addEventListener("click", save);
    document.getElementById("export-btn").addEventListener("click", exportJson);
    document.getElementById("clear-btn").addEventListener("click", clearAll);
    document.getElementById("import-file").addEventListener("change", (e) => { if (e.target.files[0]) importJson(e.target.files[0]); });
  });
})();
