// ══════════════════════════════════════════════════════════
// CONFIG SUPABASE
// ══════════════════════════════════════════════════════════
const SUPA_URL = "https://yrdjnsteaoajypgzqrbs.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZGpuc3RlYW9hanlwZ3pxcmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYwMDQsImV4cCI6MjA5NjE1MjAwNH0.CtraI2nEk7qPGYtHt7BOKFIrfTCU_NoXG7jP6_2lxZY";
const H = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(endpoint) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${endpoint}`, {
    headers: H,
  });
  if (!r.ok)
    throw new Error(`Supabase error ${r.status}: ${await r.text()}`);
  return r.json();
}

// ══════════════════════════════════════════════════════════
// ÉTAT GLOBAL
// ══════════════════════════════════════════════════════════
let cart = JSON.parse(localStorage.getItem("dls_cart") || "[]");
let allCategories = [];
let filteredCategories = [];

// ══════════════════════════════════════════════════════════
// CHARGEMENT CATÉGORIES PRINCIPALES
// ══════════════════════════════════════════════════════════
async function loadCategories() {
  try {
    const cats = await sbGet(
      "categories?select=id,nom,slug,description,image_url&parent_id=is.null&order=nom.asc"
    );

    const products = await sbGet(
      "products?select=categorie_id&is_active=eq.true"
    );
    const counts = {};
    products.forEach((p) => {
      if (p.categorie_id) counts[p.categorie_id] = (counts[p.categorie_id] || 0) + 1;
    });

    allCategories = cats.map((c) => ({
      ...c,
      nb_produits: counts[c.id] || 0,
    }));
    filteredCategories = [...allCategories];

    renderCategories();
    updateCatsCount();
  } catch (e) {
    console.error("loadCategories:", e);
    document.getElementById("catsGrid").innerHTML = `
      <div class="cats-empty">
        <i class="ti ti-alert-triangle"></i>
        <p>Impossible de charger les catégories. Veuillez réessayer plus tard.</p>
      </div>`;
    document.getElementById("catsCount").textContent = "";
  }
}

// ══════════════════════════════════════════════════════════
// RENDU GRILLE
// ══════════════════════════════════════════════════════════
function renderCategories() {
  const grid = document.getElementById("catsGrid");

  if (!filteredCategories.length) {
    grid.innerHTML = `
      <div class="cats-empty">
        <i class="ti ti-category-off"></i>
        <p>Aucune catégorie ne correspond à votre recherche.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filteredCategories.map(renderCatTile).join("");
}

function renderCatTile(cat) {
  const imgHTML = cat.image_url
    ? `<img src="${cat.image_url}" alt="${escapeHtml(cat.nom)}">`
    : `<div class="cat-tile-img-placeholder"><i class="ti ti-category"></i></div>`;

  const desc = cat.description || `Découvrez notre sélection ${cat.nom.toLowerCase()}.`;

  return `
    <div class="cat-tile" onclick="goToCategory('${cat.slug}')">
      <div class="cat-tile-img">
        ${imgHTML}
        <span class="cat-tile-count-badge">${cat.nb_produits} produit${cat.nb_produits !== 1 ? "s" : ""}</span>
      </div>
      <div class="cat-tile-body">
        <div>
          <div class="cat-tile-name">${escapeHtml(cat.nom)}</div>
          <div class="cat-tile-desc">${escapeHtml(desc)}</div>
        </div>
        <div class="cat-tile-link">Voir les produits <i class="ti ti-arrow-right"></i></div>
      </div>
    </div>`;
}

function goToCategory(slug) {
  window.location.href = `catalogue.html?categorie=${slug}`;
}

function updateCatsCount() {
  document.getElementById("catsCount").innerHTML =
    `<strong>${filteredCategories.length}</strong> catégorie${filteredCategories.length !== 1 ? "s" : ""} disponible${filteredCategories.length !== 1 ? "s" : ""}`;
}

// ══════════════════════════════════════════════════════════
// FILTRAGE LOCAL (recherche instantanée)
// ══════════════════════════════════════════════════════════
function filterCategories() {
  const q = document
    .getElementById("catFilterInput")
    .value.trim()
    .toLowerCase();
  filteredCategories = !q
    ? [...allCategories]
    : allCategories.filter(
        (c) =>
          c.nom.toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q)
      );
  renderCategories();
  updateCatsCount();
}

// ══════════════════════════════════════════════════════════
// NAVBAR + DRAWER CATÉGORIES (accordéon avec sous-catégories)
// ══════════════════════════════════════════════════════════
async function loadNavCategories() {
  try {
    const cats = await sbGet(
      "categories?select=id,nom,slug,parent_id&order=nom.asc"
    );
    const mainCats = cats.filter((c) => !c.parent_id);
    const subCats = cats.filter((c) => c.parent_id);

    document.getElementById("navCategoriesLinks").innerHTML = mainCats
      .slice(0, 5)
      .map(
        (c) =>
          `<a href="catalogue.html?categorie=${c.slug}" class="nav-link">${escapeHtml(c.nom)}</a>`
      )
      .join("");

    document.getElementById("drawerCategoriesLinks").innerHTML = mainCats
      .map((cat) => {
        const subs = subCats.filter((s) => s.parent_id === cat.id);

        const subsHTML = subs.length
          ? subs
              .map(
                (s) => `
            <a href="catalogue.html?sous_categorie=${s.slug}" class="drawer-sub-item">
              <i class="ti ti-point"></i> ${escapeHtml(s.nom)}
            </a>`
              )
              .join("")
          : `<div class="drawer-sub-empty">Aucune sous-catégorie</div>`;

        return `
          <div class="drawer-cat">
            <div class="drawer-cat-head" onclick="toggleDrawerCat(this)">
              <div class="drawer-cat-head-left">
                <i class="ti ti-folder cat-icon"></i> ${escapeHtml(cat.nom)}
              </div>
              <i class="ti ti-chevron-down arrow"></i>
            </div>
            <div class="drawer-sub">
              <a href="catalogue.html?categorie=${cat.slug}" class="drawer-cat-viewall">
                <i class="ti ti-apps"></i> Voir tous les produits ${escapeHtml(cat.nom)}
              </a>
              ${subsHTML}
            </div>
          </div>`;
      })
      .join("");
  } catch (e) {
    console.error("loadNavCategories:", e);
  }
}

function toggleDrawerCat(headEl) {
  const cat = headEl.closest(".drawer-cat");
  document.querySelectorAll(".drawer-cat.open").forEach((other) => {
    if (other !== cat) other.classList.remove("open");
  });
  cat.classList.toggle("open");
}

// ══════════════════════════════════════════════════════════
// MARQUES (bandeau défilant)
// ══════════════════════════════════════════════════════════
async function loadBrands() {
  try {
    const brands = await sbGet("brands?select=nom,logo_url&order=nom.asc");
    if (!brands.length) {
      document.getElementById("brandsTrack").innerHTML =
        '<div class="brand-item">Aucune marque enregistrée</div>';
      return;
    }
    const doubled = [...brands, ...brands];
    document.getElementById("brandsTrack").innerHTML = doubled
      .map(
        (b) => `
      <div class="brand-item">
        ${
          b.logo_url
            ? `<img src="${b.logo_url}" alt="${escapeHtml(b.nom)}" style="height:24px;max-width:90px;object-fit:contain">`
            : escapeHtml(b.nom)
        }
      </div>`
      )
      .join("");
  } catch (e) {
    console.error("loadBrands:", e);
  }
}

// ══════════════════════════════════════════════════════════
// PANIER
// ══════════════════════════════════════════════════════════
function updateCartBadge() {
  const totalQty = cart.reduce((s, i) => s + (i.qty || 1), 0);
  document.getElementById("cartBadge").textContent = totalQty;
  renderCart();
}

function renderCart() {
  const body = document.getElementById("cartBody");
  const footer = document.getElementById("cartFooter");

  if (!cart.length) {
    body.innerHTML =
      '<div class="cart-empty"><i class="ti ti-shopping-cart"></i><p>Votre panier est vide</p></div>';
    footer.style.display = "none";
    return;
  }

  footer.style.display = "block";
  body.innerHTML = cart
    .map((item, index) => {
      const imgSrc =
        item.image || "https://placehold.co/60x60/E5E7EB/9CA3AF?text=?";
      return `
        <div class="cart-item">
          <div class="cart-item-img">
            <img src="${imgSrc}" alt="${escapeHtml(item.name)}" onerror="this.src='https://placehold.co/60x60/E5E7EB/9CA3AF?text=?'">
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(item.name)}</div>
            <div class="cart-item-price">${(item.price * (item.qty || 1)).toLocaleString("fr-FR")} F CFA</div>
            <div class="cart-qty">
              <button class="qty-btn" onclick="changeQtyCart(${index}, -1)"><i class="ti ti-minus"></i></button>
              <span class="qty-num">${item.qty || 1}</span>
              <button class="qty-btn" onclick="changeQtyCart(${index}, 1)"><i class="ti ti-plus"></i></button>
              <button class="cart-item-remove" onclick="removeItemCart(${index})"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  const total = cart.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  document.getElementById("cartTotal").innerHTML = `${total.toLocaleString("fr-FR")} F CFA`;
}

function changeQtyCart(index, delta) {
  const item = cart[index];
  if (!item) return;
  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) cart.splice(index, 1);
  localStorage.setItem("dls_cart", JSON.stringify(cart));
  updateCartBadge();
}

function removeItemCart(index) {
  cart.splice(index, 1);
  localStorage.setItem("dls_cart", JSON.stringify(cart));
  updateCartBadge();
}

function toggleCart() {
  document.getElementById("cartOverlay").classList.toggle("open");
  document.getElementById("cartSidebar").classList.toggle("open");
}

// ══════════════════════════════════════════════════════════
// DRAWER MENU
// ══════════════════════════════════════════════════════════
function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawerOverlay").classList.add("open");
}

function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawerOverlay").classList.remove("open");
}

// ══════════════════════════════════════════════════════════
// RECHERCHE HEADER
// ══════════════════════════════════════════════════════════
function doHeaderSearch() {
  const q = document.getElementById("headerSearchInput").value.trim();
  if (q) window.location.href = `catalogue.html?q=${encodeURIComponent(q)}`;
}

// ══════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════
function showToast(msg) {
  const t = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ══════════════════════════════════════════════════════════
// UTILITAIRE
// ══════════════════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ══════════════════════════════════════════════════════════
// GESTION DU RETOUR NAVIGATEUR
// ══════════════════════════════════════════════════════════
let isInitialized = false;

async function init() {
  if (isInitialized) {
    console.log("♻️ Rechargement des catégories...");
    await Promise.all([loadCategories(), loadNavCategories(), loadBrands()]);
    return;
  }
  isInitialized = true;
  updateCartBadge();
  await Promise.all([loadCategories(), loadNavCategories(), loadBrands()]);
}

// Premier chargement
document.addEventListener("DOMContentLoaded", init);

// Retour du navigateur (BFCache)
window.addEventListener("pageshow", function (event) {
  if (event.persisted) {
    console.log("🔄 Retour détecté, rechargement...");
    // Réinitialiser pour forcer un rechargement complet
    isInitialized = false;
    init();
  }
});