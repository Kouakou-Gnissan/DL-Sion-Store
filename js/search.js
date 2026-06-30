// ── RECHERCHE EN TEMPS RÉEL ──────────────────────────────
(function() {
  "use strict";

  const SUPA_URL = "https://yrdjnsteaoajypgzqrbs.supabase.co";
  const SUPA_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZGpuc3RlYW9hanlwZ3pxcmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYwMDQsImV4cCI6MjA5NjE1MjAwNH0.CtraI2nEk7qPGYtHt7BOKFIrfTCU_NoXG7jP6_2lxZY";

  const headers = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
  };

  let searchTimeout = null;
  let isMobileSearchOpen = false;

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── RECHERCHE DROPDOWN (grand écran) ────────────────────
  function performSearch(query) {
    const q = query.trim();
    const panel = document.getElementById("searchResultsPanel");
    const dropLoading = document.getElementById("dropLoading");
    const dropResults = document.getElementById("dropResults");

    if (!q) {
      if (panel) panel.classList.remove("open");
      return;
    }

    if (panel) panel.classList.add("open");
    if (dropLoading) dropLoading.style.display = "block";
    if (dropResults) dropResults.innerHTML = "";

    // Produits
    fetch(
      `${SUPA_URL}/rest/v1/v_products_full?is_active=eq.true&nom=ilike.*${encodeURIComponent(q)}*&limit=6`,
      { headers }
    )
      .then((r) => r.json())
      .then((products) => {
        // Catégories
        fetch(
          `${SUPA_URL}/rest/v1/categories?nom=ilike.*${encodeURIComponent(q)}*&limit=5`,
          { headers }
        )
          .then((r) => r.json())
          .then((categories) => {
            if (dropLoading) dropLoading.style.display = "none";

            if (
              (!products || !products.length) &&
              (!categories || !categories.length)
            ) {
              if (dropResults) {
                dropResults.innerHTML = `
                  <div class="search-empty">
                    <i class="ti ti-search-off"></i>
                    <p>Aucun résultat pour "<strong>${escapeHtml(q)}</strong>"</p>
                  </div>
                `;
              }
              return;
            }

            let html = "";

            if (categories && categories.length > 0) {
              html += `
                <div class="search-result-section-title"><i class="ti ti-category"></i> Catégories</div>
                <div style="padding:0 16px 8px">
              `;
              categories.forEach((c) => {
                html += `
                  <span class="cat-pill" onclick="window.location.href='catalogue.html?categorie=${c.slug}'">
                    ${c.image_url
                      ? `<img src="${c.image_url}" alt="${escapeHtml(c.nom)}">`
                      : `<i class="ti ti-folder"></i>`}
                    <span class="cat-pill-name">${escapeHtml(c.nom)}</span>
                  </span>
                `;
              });
              html += `</div>`;
            }

            if (categories && categories.length > 0 && products && products.length > 0) {
              html += `<div style="border-top:1px solid #e5e7eb;margin:6px 16px"></div>`;
            }

            if (products && products.length > 0) {
              html += `<div class="search-result-section-title"><i class="ti ti-box"></i> Produits</div>`;
              products.forEach((p) => {
                const img =
                  p.image_principale ||
                  "https://placehold.co/40x40/E5E7EB/9CA3AF?text=?";
                html += `
                  <div class="prod-item" onclick="window.location.href='product.html?id=${p.id}'">
                    <div class="prod-item-img">
                      <img src="${img}" alt="${escapeHtml(p.nom)}" loading="lazy">
                    </div>
                    <div class="prod-item-body">
                      <div class="prod-item-brand">${escapeHtml(p.brand_nom || "")}</div>
                      <div class="prod-item-name">${escapeHtml(p.nom)}</div>
                      <div class="prod-item-price">
                        ${Number(p.prix).toLocaleString("fr-FR")} <span>F</span>
                      </div>
                    </div>
                  </div>
                `;
              });
            }

            if (dropResults) dropResults.innerHTML = html;
          })
          .catch(() => {
            if (dropLoading) dropLoading.style.display = "none";
            if (dropResults) {
              dropResults.innerHTML = `
                <div class="search-empty">
                  <i class="ti ti-alert-triangle"></i>
                  <p>Erreur de recherche</p>
                </div>
              `;
            }
          });
      })
      .catch(() => {
        if (dropLoading) dropLoading.style.display = "none";
        if (dropResults) {
          dropResults.innerHTML = `
            <div class="search-empty">
              <i class="ti ti-alert-triangle"></i>
              <p>Erreur de recherche</p>
            </div>
          `;
        }
      });
  }

  // ── RECHERCHE MOBILE (overlay) ──────────────────────────
  function performMobileSearch(query) {
    const q = query.trim();
    const container = document.getElementById("mobileSearchResults");

    if (!q) {
      if (container) {
        container.innerHTML =
          '<div class="mobile-empty"><i class="ti ti-search"></i><p>Tapez votre recherche…</p></div>';
      }
      return;
    }

    if (container) {
      container.innerHTML =
        '<div class="mobile-empty"><i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i><p>Recherche en cours…</p></div>';
    }

    // Produits
    fetch(
      `${SUPA_URL}/rest/v1/v_products_full?is_active=eq.true&nom=ilike.*${encodeURIComponent(q)}*&limit=15`,
      { headers }
    )
      .then((r) => r.json())
      .then((products) => {
        // Catégories
        fetch(
          `${SUPA_URL}/rest/v1/categories?nom=ilike.*${encodeURIComponent(q)}*&limit=10`,
          { headers }
        )
          .then((r) => r.json())
          .then((categories) => {
            if (
              (!products || !products.length) &&
              (!categories || !categories.length)
            ) {
              if (container) {
                container.innerHTML = `
                  <div class="mobile-empty">
                    <i class="ti ti-search-off"></i>
                    <p>Aucun résultat pour "<strong>${escapeHtml(q)}</strong>"</p>
                  </div>
                `;
              }
              return;
            }

            let html = "";

            if (categories && categories.length > 0) {
              html +=
                '<div style="font-weight:700;font-size:12px;color:#4b5563;padding:8px 12px 4px;text-transform:uppercase;letter-spacing:.5px">Catégories</div>';
              categories.forEach((c) => {
                html += `
                  <div class="mobile-cat-item" onclick="window.location.href='catalogue.html?categorie=${c.slug}';closeMobileSearch()">
                    ${c.image_url
                      ? `<img src="${c.image_url}" alt="${escapeHtml(c.nom)}">`
                      : `<i class="ti ti-folder" style="font-size:18px;color:#1E3A5F"></i>`}
                    <span class="name">${escapeHtml(c.nom)}</span>
                  </div>
                `;
              });
            }

            if (products && products.length > 0) {
              if (categories && categories.length > 0)
                html += `<div style="height:1px;background:#e5e7eb;margin:8px 0"></div>`;
              html +=
                '<div style="font-weight:700;font-size:12px;color:#4b5563;padding:8px 12px 4px;text-transform:uppercase;letter-spacing:.5px">Produits</div>';
              products.forEach((p) => {
                const img =
                  p.image_principale ||
                  "https://placehold.co/400x400/E5E7EB/9CA3AF?text=DL+Sion";
                html += `
                  <div class="mobile-result-item" onclick="window.location.href='product.html?id=${p.id}';closeMobileSearch()">
                    <img src="${img}" alt="${escapeHtml(p.nom)}" loading="lazy">
                    <div class="info">
                      <div class="brand">${escapeHtml(p.brand_nom || "")}</div>
                      <div class="name">${escapeHtml(p.nom)}</div>
                      <div class="price">${Number(p.prix).toLocaleString("fr-FR")} <span>F</span></div>
                    </div>
                  </div>
                `;
              });
            }

            if (container) container.innerHTML = html;
          })
          .catch(() => {
            if (container) {
              container.innerHTML = `
                <div class="mobile-empty">
                  <i class="ti ti-alert-triangle"></i>
                  <p>Erreur de recherche</p>
                </div>
              `;
            }
          });
      })
      .catch(() => {
        if (container) {
          container.innerHTML = `
            <div class="mobile-empty">
              <i class="ti ti-alert-triangle"></i>
              <p>Erreur de recherche</p>
            </div>
          `;
        }
      });
  }

  // ── INIT ──────────────────────────────────────────────────
  function initSearch() {
    const input = document.getElementById("headerSearchInput");
    if (!input) return;

    // ── Grand écran : dropdown ──
    input.addEventListener("input", function() {
      clearTimeout(searchTimeout);
      const q = this.value.trim();

      if (!q) {
        const panel = document.getElementById("searchResultsPanel");
        if (panel) panel.classList.remove("open");
        return;
      }

      if (window.innerWidth > 768) {
        searchTimeout = setTimeout(() => {
          performSearch(q);
        }, 300);
      }
    });

    // ── Petit écran : overlay ──
    const searchBar = input.closest(".search-bar") || input.parentElement;
    if (searchBar) {
      searchBar.addEventListener("click", function(e) {
        if (window.innerWidth <= 768 && e.target.tagName !== "BUTTON") {
          e.preventDefault();
          openMobileSearch(input);
        }
      });
    }

    // ── Fermeture du dropdown ──
    document.addEventListener("click", function(e) {
      const wrapper = input.closest(".search-wrapper");
      const panel = document.getElementById("searchResultsPanel");
      if (wrapper && !wrapper.contains(e.target)) {
        if (panel) panel.classList.remove("open");
      }
    });

    // ── ESC ──
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        const panel = document.getElementById("searchResultsPanel");
        if (panel) panel.classList.remove("open");
        if (isMobileSearchOpen) closeMobileSearch();
      }
    });
  }

  // ── MOBILE FUNCTIONS ──────────────────────────────────────
  function openMobileSearch(input) {
    const overlay = document.getElementById("searchOverlay");
    if (!overlay) return;
    isMobileSearchOpen = true;
    overlay.classList.add("open");

    const mobileInput = document.getElementById("mobileSearchInput");
    if (mobileInput) {
      const query = input ? input.value : "";
      mobileInput.value = query;
      mobileInput.focus();
      if (query) {
        performMobileSearch(query);
      }
    }
  }

  function closeMobileSearch() {
    const overlay = document.getElementById("searchOverlay");
    if (overlay) overlay.classList.remove("open");
    isMobileSearchOpen = false;
  }

  function handleMobileSearch(value) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performMobileSearch(value);
    }, 300);
  }

  function doMobileSearch() {
    const input = document.getElementById("mobileSearchInput");
    if (!input) return;
    const q = input.value.trim();
    if (q) {
      window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    }
  }

  function doHeaderSearch() {
    const input = document.getElementById("headerSearchInput");
    if (!input) return;
    const q = input.value.trim();
    if (q) {
      window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    }
  }

  // ── EXPOSER ──────────────────────────────────────────────
  window.initSearch = initSearch;
  window.openMobileSearch = openMobileSearch;
  window.closeMobileSearch = closeMobileSearch;
  window.handleMobileSearch = handleMobileSearch;
  window.doMobileSearch = doMobileSearch;
  window.doHeaderSearch = doHeaderSearch;
  window.isMobileSearchOpen = false;

  // ── AUTO-INIT ────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearch);
  } else {
    initSearch();
  }
})();