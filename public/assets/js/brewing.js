/* ============================================================
   Global Coffee Board — brewing calculators
   Coffee-to-water ratio calculator + espresso dial-in.
   Plus click-to-flip for the origin cards (single-origin page).
   ============================================================ */
(function () {
  var G_PER_TBSP = 5.0;   // grams of ground coffee per level tablespoon
  var G_PER_SCOOP = 10.0; // 1 coffee scoop ≈ 2 tablespoons ≈ 10 g
  var UNIT_G = { grams: 1, ml: 1, oz: 29.5735, cups: 236.588 }; // → grams of water

  function $(id) { return document.getElementById(id); }
  function activeIn(groupId, attr) {
    var g = $(groupId); if (!g) return null;
    var el = g.querySelector(".chip.active");
    return el ? el.getAttribute(attr) : null;
  }
  function setActive(groupId, el) {
    var g = $(groupId); if (!g) return;
    g.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
    if (el) el.classList.add("active");
  }
  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function round0(n) { return Math.round(n); }

  function strengthLabel(r) {
    if (r <= 10) return "Bold";
    if (r <= 13) return "Strong";
    if (r <= 17) return "Balanced";
    return "Light";
  }
  function batchLabel(waterG) {
    if (waterG < 250) return "about a single cup";
    if (waterG < 500) return "about a few cups";
    if (waterG < 1200) return "about a large batch";
    return "a big brew";
  }

  // copy-to-clipboard with brief button feedback
  function copyBtn(btn, getText) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      var text = getText() || "";
      var done = function () { var t = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = t; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else done();
    });
  }

  // ---- Coffee per cup calculator ----
  function perCup() {
    if (!$("pc-cups")) return;
    var cups = Number($("pc-cups").value) || 0;
    var ml = Number(activeIn("pc-size", "data-ml")) || 237;
    var ratio = Number(activeIn("pc-strength", "data-ratio")) || 16;
    var water = cups * ml; // ml ≈ g of water
    var coffee = water / ratio;
    var label = ratio >= 18 ? "mild" : ratio >= 15 ? "medium" : "strong";
    var sizeLabel = ml === 177 ? "6 oz" : ml === 237 ? "8 oz" : "12 oz";
    var cupWord = cups === 1 ? "cup" : "cups";

    $("pc-out").textContent = fmt1(coffee);
    $("pc-tbsp").textContent = fmt1(coffee / G_PER_TBSP);
    $("pc-scoop").textContent = fmt1(coffee / G_PER_SCOOP);
    $("pc-water").textContent = round0(water).toLocaleString("en-US");
    $("pc-strength-label").textContent = label.charAt(0).toUpperCase() + label.slice(1);
    $("pc-note").textContent = cups + " " + cupWord + " · " + sizeLabel + " each";

    // mug fills more for stronger brews
    var fillPct = 30 + (18 - ratio) * 7; // 18→30%, 14→58%
    fillPct = Math.max(24, Math.min(66, fillPct));
    var fill = $("pc-mug-fill");
    if (fill) { var h = 66 * (fillPct / 100); fill.setAttribute("y", (12 + 66 - h).toFixed(1)); fill.setAttribute("height", h.toFixed(1)); }

    var summary = "For " + cups + " " + cupWord + " (" + sizeLabel + " each) at " + label +
      " strength, use " + fmt1(coffee) + " g of coffee (about " + fmt1(coffee / G_PER_TBSP) +
      " tablespoons) and " + round0(water).toLocaleString("en-US") + " ml of water.";
    $("pc-summary").textContent = summary;
    perCup._summary = summary;
  }

  function wirePerCup() {
    if (!$("pc-cups")) return;
    $("pc-cups").addEventListener("input", perCup);
    ["pc-size", "pc-strength"].forEach(function (gid) {
      var g = $(gid); if (!g) return;
      g.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () { setActive(gid, chip); perCup(); });
      });
    });
    copyBtn($("pc-copy"), function () { return perCup._summary; });
    var reset = $("pc-reset");
    if (reset) reset.addEventListener("click", function () {
      $("pc-cups").value = 2;
      setActive("pc-size", $("pc-size").querySelector('[data-ml="237"]'));
      setActive("pc-strength", $("pc-strength").querySelector('[data-ratio="16"]'));
      perCup();
    });
  }

  // ---- Coffee-to-water ratio calculator ----
  function ratioCalc() {
    if (!$("rc-ratio")) return;
    var mode = activeIn("rc-mode", "data-mode") || "coffee";
    var unit = activeIn("rc-unit", "data-unit") || "grams";
    var ratio = Number($("rc-ratio").value) || 16;
    var amount = Number($("rc-amount").value) || 0;
    var amountG = amount * (UNIT_G[unit] || 1);

    var coffee, water;
    if (mode === "coffee") { water = amountG; coffee = water / ratio; }
    else { coffee = amountG; water = coffee * ratio; }

    // ratio readouts
    $("rc-ratio-val").textContent = "1:" + ratio;
    $("rc-ratio-den").textContent = ratio;

    // amount label reflects what the input means
    $("rc-amount-label").textContent = (mode === "coffee" ? "Water amount" : "Coffee amount");

    // big number + counterpart tile
    if (mode === "coffee") {
      $("rc-out").textContent = fmt1(coffee);
      $("rc-out-unit").textContent = "grams of coffee";
      $("rc-counter").textContent = round0(water).toLocaleString("en-US");
      $("rc-counter-label").textContent = "g water";
    } else {
      $("rc-out").textContent = round0(water).toLocaleString("en-US");
      $("rc-out-unit").textContent = "grams of water";
      $("rc-counter").textContent = fmt1(coffee);
      $("rc-counter-label").textContent = "g coffee";
    }
    $("rc-tbsp").textContent = fmt1(coffee / G_PER_TBSP);
    $("rc-scoop").textContent = fmt1(coffee / G_PER_SCOOP);

    // strength meter (dot slides bold→light with the ratio)
    var pos = ((ratio - 8) / (20 - 8)) * 100;
    $("rc-strength-dot").style.left = Math.max(0, Math.min(100, pos)) + "%";
    $("rc-strength-label").textContent = strengthLabel(ratio);

    // mug fill (bolder = fuller)
    var fillPct = 70 - ((ratio - 8) / 12) * 45; // 8→70%, 20→25%
    fillPct = Math.max(20, Math.min(72, fillPct));
    var fill = $("rc-mug-fill");
    if (fill) {
      var innerTop = 12, innerH = 66;
      var h = innerH * (fillPct / 100);
      fill.setAttribute("y", (innerTop + innerH - h).toFixed(1));
      fill.setAttribute("height", h.toFixed(1));
    }
    $("rc-batch").textContent = batchLabel(water);

    // summary sentence
    var summary = mode === "coffee"
      ? "For " + round0(water).toLocaleString("en-US") + " g of water at a 1:" + ratio +
        " ratio, use " + fmt1(coffee) + " g of coffee, about " + fmt1(coffee / G_PER_TBSP) +
        " tablespoons or " + fmt1(coffee / G_PER_SCOOP) + " scoops."
      : "For " + fmt1(coffee) + " g of coffee at a 1:" + ratio +
        " ratio, use " + round0(water).toLocaleString("en-US") + " g of water, about " +
        fmt1(coffee / G_PER_TBSP) + " tablespoons or " + fmt1(coffee / G_PER_SCOOP) + " scoops.";
    $("rc-summary").textContent = summary;
    ratioCalc._summary = summary;
  }

  function wireRatio() {
    if (!$("rc-ratio")) return;
    // mode + unit chips
    ["rc-mode", "rc-unit"].forEach(function (gid) {
      var g = $(gid); if (!g) return;
      g.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () { setActive(gid, chip); ratioCalc(); });
      });
    });
    // ratio presets set the slider
    var presets = $("rc-presets");
    if (presets) presets.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $("rc-ratio").value = chip.getAttribute("data-ratio");
        setActive("rc-presets", chip);
        ratioCalc();
      });
    });
    // slider + amount
    $("rc-ratio").addEventListener("input", function () { setActive("rc-presets", null); ratioCalc(); });
    $("rc-amount").addEventListener("input", ratioCalc);

    // actions
    copyBtn($("rc-copy"), function () { return ratioCalc._summary; });
    var reset = $("rc-reset");
    if (reset) reset.addEventListener("click", function () {
      $("rc-amount").value = 500;
      $("rc-ratio").value = 16;
      setActive("rc-mode", $("rc-mode").querySelector('[data-mode="coffee"]'));
      setActive("rc-unit", $("rc-unit").querySelector('[data-unit="grams"]'));
      setActive("rc-presets", null);
      ratioCalc();
    });
  }

  // ---- Espresso dial-in ----
  function espresso() {
    var dose = $("es-dose"), yield_ = $("es-yield");
    if (!dose || !yield_) return;
    var d = Number(dose.value) || 0, y = Number(yield_.value) || 0;
    var out = $("es-ratio"), verdict = $("es-verdict"), dot = $("es-dot");
    if (!d || !y) { if (out) out.textContent = "—"; if (verdict) verdict.textContent = ""; return; }
    var r = y / d;
    if (out) out.textContent = "1 : " + r.toFixed(2);
    var v = r < 1.5 ? "Ristretto — concentrated & syrupy"
      : r <= 2.2 ? "Balanced espresso — the classic target"
      : r <= 3 ? "Lungo — lighter & higher extraction"
      : "Very long — likely over-extracted";
    if (verdict) verdict.textContent = v;
    if (dot) { var pos = ((r - 1) / (4 - 1)) * 100; dot.style.left = Math.max(0, Math.min(100, pos)) + "%"; }
  }

  // ---- calculator tabs ----
  function wireTabs() {
    var tabs = document.querySelectorAll(".calc-tab");
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var name = tab.getAttribute("data-tab");
        tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
        document.querySelectorAll(".calc-panel").forEach(function (p) {
          p.classList.toggle("active", p.getAttribute("data-panel") === name);
        });
      });
    });
  }

  // ---- flip cards (click / keyboard) ----
  function wireFlips() {
    document.querySelectorAll(".flip-card").forEach(function (card) {
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.addEventListener("click", function () { card.classList.toggle("flipped"); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.classList.toggle("flipped"); }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireTabs();
    wirePerCup();
    perCup();
    wireRatio();
    ratioCalc();
    ["es-dose", "es-yield"].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener("input", espresso);
    });
    espresso();
    wireFlips();
  });
})();
