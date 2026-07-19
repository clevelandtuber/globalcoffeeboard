/* ============================================================
   Global Coffee Board — Admin panel
   Manual daily entry of the two coffee FUTURES prices
   (Robusta US$/tonne, Arabica US¢/lb) -> localStorage.
   These drive the dashboard price cards and the earnings
   calculator. USD/INR is live and not entered here.
   ============================================================ */
(function () {
  const store = GCB.store, K = GCB.KEYS;

  function loadIntoForm() {
    const m = store.get(K.manual, null) || {};
    val("robusta", m.robustaUsdTonne);
    val("robustaPrev", m.robustaPrevTonne);
    val("arabica", m.arabicaCentsLb);
    val("arabicaPrev", m.arabicaPrevCentsLb);
  }

  function collect() {
    const data = {
      robustaUsdTonne: num("robusta"),
      robustaPrevTonne: num("robustaPrev"),
      arabicaCentsLb: num("arabica"),
      arabicaPrevCentsLb: num("arabicaPrev"),
      updated: Date.now(),
    };
    // drop blank/zero fields so the dashboard falls back to live/sample
    Object.keys(data).forEach((k) => { if (data[k] === 0 || Number.isNaN(data[k])) delete data[k]; });
    return data;
  }

  function save() {
    store.set(K.manual, collect());
    notice("Saved. The dashboard cards and calculator will use these values immediately.", "ok");
  }

  function num(id) { return Number(document.getElementById(id).value); }
  function val(id, v) { const el = document.getElementById(id); if (el && v != null) el.value = v; }

  function notice(msg, type) {
    const n = document.getElementById("admin-notice");
    n.className = "notice " + (type || "info");
    n.textContent = msg;
    n.style.display = "block";
    n.style.opacity = "1";
    setTimeout(() => { n.style.opacity = "0.6"; }, 2500);
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
        store.set(K.manual, JSON.parse(reader.result));
        loadIntoForm();
        notice("Imported successfully.", "ok");
      } catch { notice("Could not parse that file.", "info"); }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm("Clear the manually-entered futures prices? The dashboard will fall back to the live feed / sample values.")) return;
    localStorage.removeItem(K.manual);
    loadIntoForm();
    notice("Manual data cleared.", "info");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadIntoForm();
    document.getElementById("save-btn").addEventListener("click", save);
    document.getElementById("export-btn").addEventListener("click", exportJson);
    document.getElementById("clear-btn").addEventListener("click", clearAll);
    document.getElementById("import-file").addEventListener("change", (e) => { if (e.target.files[0]) importJson(e.target.files[0]); });
  });
})();
