/* ============================================================
   Global Coffee Board — shared UI behaviours
   Mobile nav · scroll reveal · 3D tilt cards · footer year
   ============================================================ */
(function () {
  // Mobile nav
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  // "More" dropdown
  const more = document.querySelector(".nav-more");
  const moreBtn = more && more.querySelector(".nav-more-btn");
  if (more && moreBtn) {
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = more.classList.toggle("open");
      moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close when clicking anywhere outside the dropdown
    document.addEventListener("click", (e) => {
      if (!more.contains(e.target)) {
        more.classList.remove("open");
        moreBtn.setAttribute("aria-expanded", "false");
      }
    });
    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        more.classList.remove("open");
        moreBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Scroll reveal
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // 3D tilt cards
  const supportsHover = window.matchMedia("(hover: hover)").matches;
  if (supportsHover) {
    document.querySelectorAll(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(800px) rotateY(${px * 12}deg) rotateX(${-py * 12}deg) translateY(-4px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "perspective(800px) rotateY(0) rotateX(0)";
      });
    });
  }

  // Footer year
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();
