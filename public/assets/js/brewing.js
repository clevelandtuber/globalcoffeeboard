/* ============================================================
   Global Coffee Board — brewing calculators
   Brew-ratio calculator + espresso dial-in. Plus click-to-flip
   for the origin cards (used on the single-origin page).
   ============================================================ */
(function () {
  var TBSP = 5.3; // grams of ground coffee per level tablespoon

  // ---- Brew ratio calculator ----
  function brew() {
    var method = document.getElementById("bw-method");
    var water = document.getElementById("bw-water");
    var strength = document.getElementById("bw-strength");
    var outCoffee = document.getElementById("bw-coffee");
    var outTbsp = document.getElementById("bw-tbsp");
    var outRatio = document.getElementById("bw-ratio");
    if (!method || !water) return;

    var base = Number(method.value) || 16;
    var adj = strength ? Number(strength.value) : 0; // -1 stronger, +1 lighter
    var ratio = Math.max(6, base + adj);
    var w = Number(water.value) || 0;
    var coffee = w / ratio;

    if (outCoffee) outCoffee.textContent = coffee ? coffee.toFixed(1) + " g" : "—";
    if (outTbsp) outTbsp.textContent = coffee ? "≈ " + (coffee / TBSP).toFixed(1) + " tbsp · " + w + " g water" : "";
    if (outRatio) outRatio.textContent = "1 : " + ratio;
  }

  // ---- Espresso dial-in ----
  function espresso() {
    var dose = document.getElementById("es-dose");
    var yield_ = document.getElementById("es-yield");
    var outRatio = document.getElementById("es-ratio");
    var outVerdict = document.getElementById("es-verdict");
    if (!dose || !yield_) return;

    var d = Number(dose.value) || 0, y = Number(yield_.value) || 0;
    if (!d || !y) { if (outRatio) outRatio.textContent = "—"; if (outVerdict) outVerdict.textContent = ""; return; }
    var r = y / d;
    if (outRatio) outRatio.textContent = "1 : " + r.toFixed(2);
    var v = r < 1.5 ? "Ristretto — concentrated & syrupy"
      : r <= 2.2 ? "Balanced espresso — the classic target"
      : r <= 3 ? "Lungo — lighter & higher extraction"
      : "Very long — likely over-extracted, try less yield";
    if (outVerdict) outVerdict.textContent = v;
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
    ["bw-method", "bw-water", "bw-strength"].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.addEventListener("input", brew);
    });
    ["es-dose", "es-yield"].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.addEventListener("input", espresso);
    });
    brew(); espresso(); wireFlips();
  });
})();
