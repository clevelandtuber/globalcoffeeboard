/* ============================================================
   Global Coffee Board — Admin panel
   Publishes card overrides to a SHARED server store (Netlify
   Blobs, via /api/overrides) so every device/visitor sees the
   same values. Protected by an admin key. Falls back to this
   browser's localStorage only when the server is unreachable.
   Fields: robustaUsdTonne, arabicaCentsLb (futures) and
           robCherry50, araCherry50 (₹/50kg).
   ============================================================ */
(function () {
  const store = GCB.store, K = GCB.KEYS, C = GCB.config;
  const KEY_SS = "gcb_admin_key";

  const num = (id) => Number(document.getElementById(id).value);
  const val = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  const keyEl = () => document.getElementById("admin-key");

  async function loadIntoForm() {
    let m = null;
    try { const r = await fetch(C.overridesUrl, { cache: "no-store" }); if (r.ok) m = await r.json(); } catch {}
    if (!m || !Object.keys(m).length) m = store.get(K.manual, null) || {};
    val("robusta", m.robustaUsdTonne);
    val("arabica", m.arabicaCentsLb);
    val("robCherry", m.robCherry50);
    val("araCherry", m.araCherry50);
    const savedKey = sessionStorage.getItem(KEY_SS);
    if (savedKey && keyEl()) keyEl().value = savedKey;
  }

  function collect() {
    const data = {
      robustaUsdTonne: num("robusta"),
      arabicaCentsLb: num("arabica"),
      robCherry50: num("robCherry"),
      araCherry50: num("araCherry"),
    };
    Object.keys(data).forEach((k) => { if (data[k] === 0 || Number.isNaN(data[k])) delete data[k]; });
    return data;
  }

  // Publish to the shared server store. Returns true on success.
  async function publish(data) {
    const key = keyEl() ? keyEl().value.trim() : "";
    if (!key) { notice("Enter your admin key first.", "info"); return false; }
    sessionStorage.setItem(KEY_SS, key);
    try {
      const r = await fetch(C.overridesUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": key },
        body: JSON.stringify(data),
      });
      if (r.status === 401) { notice("Wrong admin key — nothing was published.", "info"); return false; }
      if (r.status === 500) { notice("Server has no ADMIN_KEY set yet — see the setup note below.", "info"); return false; }
      if (!r.ok) throw new Error("http " + r.status);
      store.set(K.manual, data); // local cache
      return true;
    } catch {
      store.set(K.manual, data);
      notice("Server unreachable — saved on this device only (works fully on the deployed site).", "info");
      return false;
    }
  }

  async function save() {
    if (await publish(collect())) notice("Saved & published to all devices ✓", "ok");
  }

  async function clearAll() {
    if (!confirm("Clear all published overrides? Cards will fall back to the automatic Coffee Board values.")) return;
    const ok = await publish({});
    localStorage.removeItem(K.manual);
    ["robusta", "arabica", "robCherry", "araCherry"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
    if (ok) notice("Overrides cleared everywhere.", "info");
  }

  function notice(msg, type) {
    const n = document.getElementById("admin-notice");
    n.className = "notice " + (type || "info");
    n.textContent = msg;
    n.style.display = "block";
    n.style.opacity = "1";
    setTimeout(() => { n.style.opacity = "0.6"; }, 3000);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: "application/json" });
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
        const m = JSON.parse(reader.result);
        val("robusta", m.robustaUsdTonne);
        val("arabica", m.arabicaCentsLb);
        val("robCherry", m.robCherry50);
        val("araCherry", m.araCherry50);
        notice("Imported into the form — review, then Save & publish.", "ok");
      } catch { notice("Could not parse that file.", "info"); }
    };
    reader.readAsText(file);
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadIntoForm();
    document.getElementById("save-btn").addEventListener("click", save);
    document.getElementById("export-btn").addEventListener("click", exportJson);
    document.getElementById("clear-btn").addEventListener("click", clearAll);
    document.getElementById("import-file").addEventListener("change", (e) => { if (e.target.files[0]) importJson(e.target.files[0]); });
  });
})();
