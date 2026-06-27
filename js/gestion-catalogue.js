"use strict";

// ── CONFIG SUPABASE ─────────────────────────────────────────────
const SUPA_URL = "https://yrdjnsteaoajypgzqrbs.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZGpuc3RlYW9hanlwZ3pxcmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYwMDQsImV4cCI6MjA5NjE1MjAwNH0.CtraI2nEk7qPGYtHt7BOKFIrfTCU_NoXG7jP6_2lxZY";

// Éviter la double déclaration
if (typeof window.supabaseClient === "undefined") {
  window.supabaseClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
}
const sb = window.supabaseClient;

// ── VÉRIFICATION SESSION ────────────────────────────────────────
let currentUser = null;
let currentUserRole = null;

async function checkAuth() {
  const {
    data: { session },
    error,
  } = await sb.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return false;
  }

  const { data: adminUser } = await sb
    .from("admin_users")
    .select("role, is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (
    !adminUser ||
    !adminUser.is_active ||
    !["admin", "commercial", "patron"].includes(adminUser.role)
  ) {
    window.location.href = "../index.html";
    return false;
  }

  currentUser = session.user;
  currentUserRole = adminUser.role;

  const userNameEl = document.getElementById("userName");
  const userRoleEl = document.getElementById("userRole");
  const userAvatarEl = document.getElementById("userAvatar");

  if (userNameEl)
    userNameEl.textContent = session.user.email?.split("@")[0] || "Admin";
  if (userRoleEl) userRoleEl.textContent = currentUserRole;
  if (userAvatarEl)
    userAvatarEl.textContent = (
      session.user.email?.charAt(0) || "A"
    ).toUpperCase();

  return true;
}

// ── ÉTAT GLOBAL ─────────────────────────────────────────────────
let allProducts = [],
  allCategories = [],
  allBrands = [];
let currentTab = "products";

// Pagination produits
let productPage = 1;
let productTotalPages = 1;
let productTotalCount = 0;
const PRODUCTS_PER_PAGE = 10;

// Pagination catégories
let categoryPage = 1;
let categoryTotalPages = 1;
let categoryTotalCount = 0;
const CATEGORIES_PER_PAGE = 10;

// Pagination sous-catégories
let subcategoryPage = 1;
let subcategoryTotalPages = 1;
let subcategoryTotalCount = 0;
const SUBCATEGORIES_PER_PAGE = 10;

// Filtres
let searchProduct = "",
  filterCatId = "",
  filterSubcatId = "",
  filterBrandId = "",
  filterStatus = "";
let searchCategory = "";
let searchSubcategory = "",
  filterParentCatId = "";

// Upload fichiers
let mainImgFile = null,
  catImgFile = null;
let galleryFiles = [null, null, null, null];
let galleryExistingUrls = [null, null, null, null];
let galleryExistingIds = [null, null, null, null];
let mainImgExistingUrl = null;
let catImgExistingUrl = null;
let pendingDelete = null;

// ── FONCTIONS MOBILE MENU ───────────────────────────────────────
function toggleMobileMenu() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("open");
}

function closeMobileMenu() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
}

// ── REQUÊTES AVEC AUTH ──────────────────────────────────────────
async function loadProducts() {
  const loadingEl = document.getElementById("loadingProducts");
  if (loadingEl) loadingEl.classList.add("show");

  try {
    let query = sb.from("products").select(
      `
      *,
      brands!left(id, nom),
      categories!products_categorie_id_fkey!left(id, nom, slug)
    `,
      { count: "exact" },
    );

    if (searchProduct) {
      query = query.or(
        `nom.ilike.%${searchProduct}%,reference.ilike.%${searchProduct}%`,
      );
    }
    if (filterCatId) query = query.eq("categorie_id", filterCatId);
    if (filterSubcatId) query = query.eq("sous_categorie_id", filterSubcatId);
    if (filterBrandId) query = query.eq("brand_id", filterBrandId);
    if (filterStatus === "active") query = query.eq("is_active", true);
    if (filterStatus === "inactive") query = query.eq("is_active", false);
    if (filterStatus === "featured") query = query.eq("is_featured", true);

    const from = (productPage - 1) * PRODUCTS_PER_PAGE;
    const to = from + PRODUCTS_PER_PAGE - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    allProducts = data || [];
    productTotalCount = count || 0;
    productTotalPages = Math.ceil(productTotalCount / PRODUCTS_PER_PAGE);

    renderProducts();
    updatePagination("products");

    const badge = document.getElementById("badge-products");
    if (badge) badge.textContent = productTotalCount;
  } catch (e) {
    toast("Erreur chargement produits : " + e.message, "error");
  } finally {
    if (loadingEl) loadingEl.classList.remove("show");
  }
}

async function loadCategories() {
  const loadingEl = document.getElementById("loadingCategories");
  if (loadingEl) loadingEl.classList.add("show");

  try {
    let query = sb
      .from("categories")
      .select("*", { count: "exact" })
      .is("parent_id", null);

    if (searchCategory) {
      query = query.ilike("nom", `%${searchCategory}%`);
    }

    const from = (categoryPage - 1) * CATEGORIES_PER_PAGE;
    const to = from + CATEGORIES_PER_PAGE - 1;

    const { data, error, count } = await query
      .order("nom", { ascending: true })
      .range(from, to);

    if (error) throw error;

    allCategories = data || [];
    categoryTotalCount = count || 0;
    categoryTotalPages = Math.ceil(categoryTotalCount / CATEGORIES_PER_PAGE);

    renderCategories();
    updatePagination("categories");

    const badge = document.getElementById("badge-categories");
    if (badge) badge.textContent = categoryTotalCount;
  } catch (e) {
    toast("Erreur chargement catégories : " + e.message, "error");
  } finally {
    if (loadingEl) loadingEl.classList.remove("show");
  }
}

async function loadSubcategories() {
  const loadingEl = document.getElementById("loadingSubcategories");
  if (loadingEl) loadingEl.classList.add("show");

  try {
    let query = sb
      .from("categories")
      .select("*", { count: "exact" })
      .not("parent_id", "is", null);

    if (searchSubcategory) {
      query = query.ilike("nom", `%${searchSubcategory}%`);
    }
    if (filterParentCatId) {
      query = query.eq("parent_id", filterParentCatId);
    }

    const from = (subcategoryPage - 1) * SUBCATEGORIES_PER_PAGE;
    const to = from + SUBCATEGORIES_PER_PAGE - 1;

    const { data, error, count } = await query
      .order("nom", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const parentIds = [
      ...new Set(data?.map((c) => c.parent_id).filter(Boolean) || []),
    ];
    let parentsMap = {};

    if (parentIds.length > 0) {
      const { data: parents } = await sb
        .from("categories")
        .select("id, nom")
        .in("id", parentIds);

      parentsMap = (parents || []).reduce((acc, p) => {
        acc[p.id] = p.nom;
        return acc;
      }, {});
    }

    allCategories = (data || []).map((c) => ({
      ...c,
      parent_nom: parentsMap[c.parent_id] || "—",
    }));

    subcategoryTotalCount = count || 0;
    subcategoryTotalPages = Math.ceil(
      subcategoryTotalCount / SUBCATEGORIES_PER_PAGE,
    );

    renderSubcategories();
    updatePagination("subcategories");

    const badge = document.getElementById("badge-subcategories");
    if (badge) badge.textContent = subcategoryTotalCount;
  } catch (e) {
    console.error("Erreur détaillée:", e);
    toast("Erreur chargement sous-catégories : " + e.message, "error");
  } finally {
    if (loadingEl) loadingEl.classList.remove("show");
  }
}

async function loadBrands() {
  try {
    const { data, error } = await sb
      .from("brands")
      .select("id, nom")
      .order("nom", { ascending: true });

    if (error) throw error;
    allBrands = data || [];
    populateBrandFilters();
  } catch (e) {
    console.error("Erreur chargement marques:", e);
  }
}

async function loadAllCategoriesForFilters() {
  try {
    const { data } = await sb.from("categories").select("id, nom, parent_id");
    return data || [];
  } catch (e) {
    return [];
  }
}

// ── STORAGE UPLOAD ───────────────────────────────────────────────
async function uploadFile(
  bucket,
  file,
  progressFill,
  progressLabel,
  progressWrap,
) {
  if (!file) return null;

  const ext = file.name.split(".").pop().toLowerCase();
  const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  if (progressWrap) progressWrap.classList.add("show");
  if (progressFill) progressFill.style.width = "30%";
  if (progressLabel) progressLabel.textContent = "Upload en cours…";

  const { data, error } = await sb.storage.from(bucket).upload(fname, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error("Upload échoué : " + error.message);

  const {
    data: { publicUrl },
  } = sb.storage.from(bucket).getPublicUrl(fname);

  if (progressFill) progressFill.style.width = "100%";
  if (progressLabel) progressLabel.textContent = "Upload terminé ✓";
  setTimeout(() => progressWrap && progressWrap.classList.remove("show"), 1500);

  return publicUrl;
}

// ── GESTION DES IMAGES STORAGE ───────────────────────────────────────
/**
 * Extrait le chemin du fichier dans Storage à partir de l'URL publique
 */
function getStoragePathFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/public\/(.+)$/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Supprime un fichier du Storage Supabase
 */
async function deleteStorageFile(url) {
  if (!url) return;

  const path = getStoragePathFromUrl(url);
  if (!path) {
    console.warn("⚠️ Impossible d'extraire le chemin de l'URL:", url);
    return;
  }

  const bucket = path.split("/")[0];
  const filePath = path.substring(bucket.length + 1);

  console.log(`🗑️ Suppression: bucket=${bucket}, file=${filePath}`);

  const { error } = await sb.storage.from(bucket).remove([filePath]);
  if (error) {
    console.error("❌ Erreur suppression:", error);
  } else {
    console.log("✅ Fichier supprimé du Storage");
  }
}

// ── RENDER FUNCTIONS ─────────────────────────────────────────────
function renderProducts() {
  const tbody = document.getElementById("productsBody");
  if (!tbody) return;

  if (!allProducts.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-box-off"></i><p>Aucun produit trouvé</p></div></td></tr>`;
    const countEl = document.getElementById("countProducts");
    if (countEl) countEl.textContent = "0 produit";
    return;
  }

  const countEl = document.getElementById("countProducts");
  if (countEl)
    countEl.textContent = `${productTotalCount} produit${productTotalCount > 1 ? "s" : ""}`;

  tbody.innerHTML = allProducts
    .map((p) => {
      const cat = p.categories;
      const brand = p.brands;
      const imgHTML = p.image_principale
        ? `<div class="td-img"><img src="${p.image_principale}" alt="${escapeHtml(p.nom)}"></div>`
        : `<div class="td-img"><i class="ti ti-photo-off"></i></div>`;

      return `<tr>
        <td>${imgHTML}</td>
        <td><div class="td-name">${escapeHtml(p.nom)}</div><div class="td-ref">${p.reference || "—"}</div></td>
        <td>${cat ? `<span class="badge badge-cat">${escapeHtml(cat.nom)}</span>` : "—"}</td>
        <td>${brand ? escapeHtml(brand.nom) : "—"}</td>
        <td class="td-price">${Number(p.prix).toLocaleString("fr-FR")} F</td>
        <td>
          ${p.is_active ? '<span class="badge badge-active"><i class="ti ti-check"></i> Actif</span>' : '<span class="badge badge-inactive">Inactif</span>'}
          ${p.is_featured ? '<span class="badge badge-featured"><i class="ti ti-star"></i> Vedette</span>' : ""}
        </td>
        <td class="td-actions">
          <button class="btn-icon btn-edit" onclick="editProduct('${p.id}')"><i class="ti ti-pencil"></i></button>
          <button class="btn-icon btn-delete" onclick="confirmDelete('product','${p.id}','${escapeHtml(p.nom)}',false)"><i class="ti ti-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");
}

async function renderCategories() {
  const tbody = document.getElementById("categoriesBody");
  if (!tbody) return;

  const { data: subcats } = await sb
    .from("categories")
    .select("parent_id")
    .not("parent_id", "is", null);

  const subcatCount =
    subcats?.reduce((acc, s) => {
      acc[s.parent_id] = (acc[s.parent_id] || 0) + 1;
      return acc;
    }, {}) || {};

  const { data: allProds } = await sb.from("products").select("categorie_id");
  const prodCount =
    allProds?.reduce((acc, p) => {
      if (p.categorie_id) acc[p.categorie_id] = (acc[p.categorie_id] || 0) + 1;
      return acc;
    }, {}) || {};

  if (!allCategories.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-category-off"></i><p>Aucune catégorie</p></div></td></tr>`;
    const countEl = document.getElementById("countCategories");
    if (countEl) countEl.textContent = "0 catégorie";
    return;
  }

  const countEl = document.getElementById("countCategories");
  if (countEl)
    countEl.textContent = `${categoryTotalCount} catégorie${categoryTotalCount > 1 ? "s" : ""}`;

  tbody.innerHTML = allCategories
    .map((c) => {
      const nbSub = subcatCount[c.id] || 0;
      const nbProd = prodCount[c.id] || 0;
      const imgHTML = c.image_url
        ? `<div class="td-img"><img src="${c.image_url}" alt="${escapeHtml(c.nom)}"></div>`
        : `<div class="td-img"><i class="ti ti-category"></i></div>`;

      return `<tr>
        <td>${imgHTML}</div></td>
        <td class="td-name">${escapeHtml(c.nom)}</div></td>
        <td><span class="td-ref">${c.slug}</span></div></td>
        <td><span class="badge badge-subcat">${nbSub} sous-cat.</span></div></td>
        <td>${nbProd} produit${nbProd > 1 ? "s" : ""}</div></td>
        <td class="td-actions">
          <button class="btn-icon btn-edit" onclick="editCategory('${c.id}')"><i class="ti ti-pencil"></i></button>
          <button class="btn-icon btn-delete" onclick="confirmDelete('category','${c.id}','${escapeHtml(c.nom)}',true)"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>`;
    })
    .join("");
}

async function renderSubcategories() {
  const tbody = document.getElementById("subcategoriesBody");
  if (!tbody) return;

  const { data: allProds } = await sb
    .from("products")
    .select("sous_categorie_id");
  const prodCount =
    allProds?.reduce((acc, p) => {
      if (p.sous_categorie_id)
        acc[p.sous_categorie_id] = (acc[p.sous_categorie_id] || 0) + 1;
      return acc;
    }, {}) || {};

  if (!allCategories.length) {
    tbody.innerHTML = `<td><td colspan="5"><div class="empty-state"><i class="ti ti-category-2"></i><p>Aucune sous-catégorie</p></div></td></tr>`;
    const countEl = document.getElementById("countSubcategories");
    if (countEl) countEl.textContent = "0 sous-catégorie";
    return;
  }

  const countEl = document.getElementById("countSubcategories");
  if (countEl)
    countEl.textContent = `${subcategoryTotalCount} sous-catégorie${subcategoryTotalCount > 1 ? "s" : ""}`;

  tbody.innerHTML = allCategories
    .map((c) => {
      const nbProd = prodCount[c.id] || 0;
      const parentName = c.parent_nom || "—";

      return `<tr>
      <td class="td-name">${escapeHtml(c.nom)}</td>
      <td><span class="badge badge-cat">${escapeHtml(parentName)}</span></td>
      <td><span class="td-ref">${c.slug}</span></td>
      <td>${nbProd} produit${nbProd > 1 ? "s" : ""}</td>
      <td class="td-actions">
        <button class="btn-icon btn-edit" onclick="editSubcategory('${c.id}')"><i class="ti ti-pencil"></i></button>
        <button class="btn-icon btn-delete" onclick="confirmDelete('subcategory','${c.id}','${escapeHtml(c.nom)}',true)"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
    })
    .join("");
}

// ── PAGINATION ───────────────────────────────────────────────────
function updatePagination(type) {
  let currentPage, totalPages, containerId, infoId;

  switch (type) {
    case "products":
      currentPage = productPage;
      totalPages = productTotalPages;
      containerId = "pageBtnsProducts";
      infoId = "pageInfoProducts";
      break;
    case "categories":
      currentPage = categoryPage;
      totalPages = categoryTotalPages;
      containerId = "pageBtnsCategories";
      infoId = "pageInfoCategories";
      break;
    case "subcategories":
      currentPage = subcategoryPage;
      totalPages = subcategoryTotalPages;
      containerId = "pageBtnsSubcategories";
      infoId = "pageInfoSubcategories";
      break;
    default:
      return;
  }

  const container = document.getElementById(containerId);
  const info = document.getElementById(infoId);

  if (info) {
    const start =
      (currentPage - 1) *
      (type === "products"
        ? PRODUCTS_PER_PAGE
        : type === "categories"
          ? CATEGORIES_PER_PAGE
          : SUBCATEGORIES_PER_PAGE);
    const end = Math.min(
      start +
        (type === "products"
          ? PRODUCTS_PER_PAGE
          : type === "categories"
            ? CATEGORIES_PER_PAGE
            : SUBCATEGORIES_PER_PAGE),
      type === "products"
        ? productTotalCount
        : type === "categories"
          ? categoryTotalCount
          : subcategoryTotalCount,
    );
    info.textContent = `${start + 1}–${end} sur ${
      type === "products"
        ? productTotalCount
        : type === "categories"
          ? categoryTotalCount
          : subcategoryTotalCount
    }`;
  }

  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = `
    <button class="page-btn" onclick="goToPage('${type}', ${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""}>
      <i class="ti ti-chevron-left"></i>
    </button>
  `;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);

  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? "active" : ""}" onclick="goToPage('${type}', ${i})">${i}</button>`;
  }

  html += `
    <button class="page-btn" onclick="goToPage('${type}', ${currentPage + 1})" ${currentPage === totalPages ? "disabled" : ""}>
      <i class="ti ti-chevron-right"></i>
    </button>
  `;

  container.innerHTML = html;
}

function goToPage(type, page) {
  switch (type) {
    case "products":
      if (page < 1 || page > productTotalPages) return;
      productPage = page;
      loadProducts();
      break;
    case "categories":
      if (page < 1 || page > categoryTotalPages) return;
      categoryPage = page;
      loadCategories();
      break;
    case "subcategories":
      if (page < 1 || page > subcategoryTotalPages) return;
      subcategoryPage = page;
      loadSubcategories();
      break;
  }
}

// ── FILTRES ──────────────────────────────────────────────────────
function filterProducts() {
  const searchEl = document.getElementById("searchProducts");
  const filterCatEl = document.getElementById("filterCat");
  const filterSubcatEl = document.getElementById("filterSubcat");
  const filterBrandEl = document.getElementById("filterBrand");
  const filterStatusEl = document.getElementById("filterStatus");

  searchProduct = searchEl?.value || "";
  filterCatId = filterCatEl?.value || "";
  filterSubcatId = filterSubcatEl?.value || "";
  filterBrandId = filterBrandEl?.value || "";
  filterStatus = filterStatusEl?.value || "";
  productPage = 1;
  loadProducts();
}

function filterCategories() {
  const searchEl = document.getElementById("searchCategories");
  searchCategory = searchEl?.value || "";
  categoryPage = 1;
  loadCategories();
}

function filterSubcategories() {
  const searchEl = document.getElementById("searchSubcategories");
  const filterParentEl = document.getElementById("filterParentCat");
  searchSubcategory = searchEl?.value || "";
  filterParentCatId = filterParentEl?.value || "";
  subcategoryPage = 1;
  loadSubcategories();
}

// ── POPULATE FILTERS ────────────────────────────────────────────
async function populateFilters() {
  const allCats = await loadAllCategoriesForFilters();
  const mainCats = allCats.filter((c) => !c.parent_id);
  const subCats = allCats.filter((c) => c.parent_id);

  const fcat = document.getElementById("filterCat");
  if (fcat) {
    fcat.innerHTML =
      '<option value="">Toutes catégories</option>' +
      mainCats
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`)
        .join("");
  }

  const fsub = document.getElementById("filterSubcat");
  if (fsub) {
    fsub.innerHTML =
      '<option value="">Toutes sous-cat.</option>' +
      subCats
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`)
        .join("");
  }

  const fbrand = document.getElementById("filterBrand");
  if (fbrand && allBrands.length) {
    fbrand.innerHTML =
      '<option value="">Toutes marques</option>' +
      allBrands
        .map((b) => `<option value="${b.id}">${escapeHtml(b.nom)}</option>`)
        .join("");
  }

  const fparent = document.getElementById("filterParentCat");
  if (fparent) {
    fparent.innerHTML =
      '<option value="">Toutes catégories</option>' +
      mainCats
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`)
        .join("");
  }

  const pcat = document.getElementById("productCategorie");
  if (pcat) {
    pcat.innerHTML =
      '<option value="">Sélectionner une catégorie</option>' +
      mainCats
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`)
        .join("");
  }

  const pbrand = document.getElementById("productBrand");
  if (pbrand) {
    pbrand.innerHTML =
      '<option value="">Sélectionner une marque</option>' +
      allBrands
        .map((b) => `<option value="${b.id}">${escapeHtml(b.nom)}</option>`)
        .join("");
  }

  const sparent = document.getElementById("subcategoryParent");
  if (sparent) {
    sparent.innerHTML =
      '<option value="">Sélectionner une catégorie principale</option>' +
      mainCats
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`)
        .join("");
  }
}

function populateBrandFilters() {
  const fbrand = document.getElementById("filterBrand");
  if (fbrand && allBrands.length) {
    const currentValue = fbrand.value;
    fbrand.innerHTML =
      '<option value="">Toutes marques</option>' +
      allBrands
        .map((b) => `<option value="${b.id}">${escapeHtml(b.nom)}</option>`)
        .join("");
    if (currentValue) fbrand.value = currentValue;
  }
}

async function loadSubcatsForProduct() {
  const catId = document.getElementById("productCategorie")?.value;
  if (!catId) {
    const sel = document.getElementById("productSousCategorie");
    if (sel) sel.innerHTML = '<option value="">Aucune sous-catégorie</option>';
    return;
  }

  const { data } = await sb
    .from("categories")
    .select("id, nom")
    .eq("parent_id", catId)
    .order("nom");

  const sel = document.getElementById("productSousCategorie");
  sel.innerHTML =
    '<option value="">Aucune sous-catégorie</option>' +
    (data || [])
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`)
      .join("");
}

// ── CRUD PRODUITS ────────────────────────────────────────────────
function resetProductModal() {
  const fields = [
    "productId",
    "productNom",
    "productRef",
    "productPrix",
    "productDescription",
  ];
  fields.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = "";
  });

  const activeCheck = document.getElementById("productActive");
  if (activeCheck) activeCheck.checked = true;
  const featuredCheck = document.getElementById("productFeatured");
  if (featuredCheck) featuredCheck.checked = false;

  const catSelect = document.getElementById("productCategorie");
  if (catSelect) catSelect.value = "";

  loadSubcatsForProduct();

  const brandSelect = document.getElementById("productBrand");
  if (brandSelect) brandSelect.value = "";

  mainImgFile = null;
  mainImgExistingUrl = null;
  galleryFiles = [null, null, null, null];
  galleryExistingUrls = [null, null, null, null];
  galleryExistingIds = [null, null, null, null];
  resetMainImgPreview();
  for (let i = 0; i < 4; i++) resetGallerySlot(i);
}

function openProductModal(product = null) {
  resetProductModal();
  const title = document.getElementById("modalProductTitle");
  if (title)
    title.textContent = product ? "Modifier le produit" : "Nouveau produit";
  openModal("modalProduct");
}

async function editProduct(id) {
  openProductModal();
  const title = document.getElementById("modalProductTitle");
  if (title) title.textContent = "Modifier le produit";

  try {
    const { data: p, error } = await sb
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    const idField = document.getElementById("productId");
    if (idField) idField.value = p.id;
    const nomField = document.getElementById("productNom");
    if (nomField) nomField.value = p.nom;
    const refField = document.getElementById("productRef");
    if (refField) refField.value = p.reference || "";
    const prixField = document.getElementById("productPrix");
    if (prixField) prixField.value = p.prix;
    const prixAncienField = document.getElementById("productPrixAncien");
    if (prixAncienField) prixAncienField.value = p.prix_ancien || "";
    const descField = document.getElementById("productDescription");
    if (descField) descField.value = p.description || "";
    const activeCheck = document.getElementById("productActive");
    if (activeCheck) activeCheck.checked = p.is_active;
    const featuredCheck = document.getElementById("productFeatured");
    if (featuredCheck) featuredCheck.checked = p.is_featured;
    const catSelect = document.getElementById("productCategorie");
    if (catSelect) catSelect.value = p.categorie_id || "";

    await loadSubcatsForProduct();

    const subSelect = document.getElementById("productSousCategorie");
    if (subSelect) subSelect.value = p.sous_categorie_id || "";
    const brandSelect = document.getElementById("productBrand");
    if (brandSelect) brandSelect.value = p.brand_id || "";

    // Afficher l'image principale existante
    if (p.image_principale) {
      mainImgExistingUrl = p.image_principale;
      const previewWrap = document.getElementById("mainImgPreviewWrap");
      if (previewWrap) {
        previewWrap.innerHTML = `
          <div class="img-preview-wrap">
            <img src="${p.image_principale}" class="img-preview-single" alt="Image actuelle">
            <button type="button" class="img-preview-remove" onclick="resetMainImgPreview()"><i class="ti ti-x"></i></button>
          </div>`;
      }
    } else {
      resetMainImgPreview();
    }

    // Afficher les 4 images supplémentaires depuis les colonnes image_1 à image_4
    const imageUrls = [p.image_1, p.image_2, p.image_3, p.image_4];
    for (let i = 0; i < 4; i++) {
      resetGallerySlot(i);
      if (imageUrls[i]) {
        galleryExistingUrls[i] = imageUrls[i];
        showGallerySlotPreview(i, imageUrls[i]);
      }
    }
  } catch (e) {
    toast("Erreur chargement produit", "error");
    closeModal("modalProduct");
  }
}

async function saveProduct() {
  const id = document.getElementById("productId")?.value;
  const nom = document.getElementById("productNom")?.value.trim();
  const ref = document.getElementById("productRef")?.value.trim();
  const prix = document.getElementById("productPrix")?.value;
  const prixAncien = document.getElementById("productPrixAncien")?.value;
  const catId = document.getElementById("productCategorie")?.value;

  if (!nom || !prix || !catId) {
    toast("Nom, prix et catégorie sont obligatoires", "error");
    return;
  }

  const btn = document.getElementById("btnSaveProduct");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Enregistrement…';
  }

  try {
    let imageUrl = mainImgExistingUrl;
    if (mainImgFile) {
      // Supprimer l'ancienne image si elle existe
      if (mainImgExistingUrl) {
        await deleteStorageFile(mainImgExistingUrl);
      }
      imageUrl = await uploadFile(
        "products",
        mainImgFile,
        document.getElementById("mainImgProgressFill"),
        document.getElementById("mainImgProgressLabel"),
        document.getElementById("mainImgProgress")
      );
    }

    //  Upload des 4 images supplémentaires et mise à jour des URLs
    const imageUrls = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      if (galleryFiles[i]) {
        // Supprimer l'ancienne image si elle existe
        if (galleryExistingUrls[i]) {
          await deleteStorageFile(galleryExistingUrls[i]);
        }
        imageUrls[i] = await uploadFile("products", galleryFiles[i], null, null, null);
      } else {
        imageUrls[i] = galleryExistingUrls[i]; // Garder l'image existante
      }
    }

    const payload = {
      nom,
      reference: ref || null,
      prix: parseFloat(prix),
      prix_ancien: prixAncien ? parseFloat(prixAncien) : null,
      description: document.getElementById("productDescription")?.value.trim() || null,
      categorie_id: catId || null,
      sous_categorie_id: document.getElementById("productSousCategorie")?.value || null,
      brand_id: document.getElementById("productBrand")?.value || null,
      image_principale: imageUrl || null,
      image_1: imageUrls[0],
      image_2: imageUrls[1],
      image_3: imageUrls[2],
      image_4: imageUrls[3],
      is_active: document.getElementById("productActive")?.checked || false,
      is_featured: document.getElementById("productFeatured")?.checked || false,
    };

    console.log("Payload produit:", payload);

    if (id) {
      const { error } = await sb.from("products").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from("products").insert(payload).select();
      if (error) throw error;
    }

    // Réinitialiser les variables
    mainImgFile = null;
    mainImgExistingUrl = null;
    galleryFiles = [null, null, null, null];
    galleryExistingUrls = [null, null, null, null];

    toast(id ? "Produit mis à jour ✓" : "Produit créé ✓", "success");
    closeModal("modalProduct");
    await loadProducts();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Enregistrer';
    }
  }
}

// ── CRUD CATÉGORIES ─────────────────────────────────────────────
function resetCategoryModal() {
  const fields = [
    "categoryId",
    "categoryNom",
    "categorySlug",
    "categoryDescription",
  ];
  fields.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = "";
  });
  catImgFile = null;
  catImgExistingUrl = null;
  const previewWrap = document.getElementById("catImgPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
      <div class="img-upload-text">Cliquer ou glisser une image</div>
      <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo — recommandé 800×400px</div>`;
  }
}

function openCategoryModal() {
  resetCategoryModal();
  const title = document.getElementById("modalCategoryTitle");
  if (title) title.textContent = "Nouvelle catégorie";
  openModal("modalCategory");
}

async function editCategory(id) {
  resetCategoryModal();
  const title = document.getElementById("modalCategoryTitle");
  if (title) title.textContent = "Modifier la catégorie";

  const { data: cat, error } = await sb
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return;

  const idField = document.getElementById("categoryId");
  if (idField) idField.value = cat.id;
  const nomField = document.getElementById("categoryNom");
  if (nomField) nomField.value = cat.nom;
  const slugField = document.getElementById("categorySlug");
  if (slugField) slugField.value = cat.slug;
  const descField = document.getElementById("categoryDescription");
  if (descField) descField.value = cat.description || "";

  const previewWrap = document.getElementById("catImgPreviewWrap");
  if (previewWrap) {
    if (cat.image_url) {
      catImgExistingUrl = cat.image_url;
      previewWrap.innerHTML = `
        <div class="img-preview-wrap">
          <img src="${cat.image_url}" class="img-preview-single" alt="${escapeHtml(cat.nom)}">
          <button type="button" class="img-preview-remove" onclick="removeCatImg()"><i class="ti ti-x"></i></button>
        </div>`;
    } else {
      previewWrap.innerHTML = `
        <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
        <div class="img-upload-text">Cliquer ou glisser une image</div>
        <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo — recommandé 800×400px</div>`;
    }
  }

  openModal("modalCategory");
}

async function saveCategory() {
  const id = document.getElementById("categoryId")?.value;
  const nom = document.getElementById("categoryNom")?.value.trim();
  const slug = document.getElementById("categorySlug")?.value.trim();

  if (!nom || !slug) {
    toast("Nom et slug sont obligatoires", "error");
    return;
  }

  const btn = document.getElementById("btnSaveCategory");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Enregistrement…';
  }

  try {
    let imageUrl = catImgExistingUrl;

    console.log("catImgFile:", catImgFile);
    console.log("catImgExistingUrl:", catImgExistingUrl);

    if (catImgFile) {
      // 🔥 SUPPRIMER L'ANCIENNE IMAGE si elle existe
      if (catImgExistingUrl) {
        await deleteStorageFile(catImgExistingUrl);
      }

      imageUrl = await uploadFile(
        "categories",
        catImgFile,
        document.getElementById("catImgProgressFill"),
        document.getElementById("catImgProgressLabel"),
        document.getElementById("catImgProgress"),
      );
    }

    const payload = {
      nom,
      slug,
      description:
        document.getElementById("categoryDescription")?.value.trim() || null,
      image_url: imageUrl || null,
      parent_id: null,
    };

    console.log("Payload à envoyer:", payload);

    if (id) {
      await sb.from("categories").update(payload).eq("id", id);
    } else {
      await sb.from("categories").insert(payload);
    }

    // Réinitialiser les variables
    catImgFile = null;
    catImgExistingUrl = null;

    toast(id ? "Catégorie mise à jour ✓" : "Catégorie créée ✓", "success");
    closeModal("modalCategory");
    await loadCategories();
    await populateFilters();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Enregistrer';
    }
  }
}

// ── CRUD SOUS-CATÉGORIES ────────────────────────────────────────
function openSubcategoryModal() {
  const fields = [
    "subcategoryId",
    "subcategoryNom",
    "subcategorySlug",
    "subcategoryDescription",
  ];
  fields.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = "";
  });
  const parentSelect = document.getElementById("subcategoryParent");
  if (parentSelect) parentSelect.value = "";
  const title = document.getElementById("modalSubcategoryTitle");
  if (title) title.textContent = "Nouvelle sous-catégorie";
  openModal("modalSubcategory");
}

async function editSubcategory(id) {
  const { data: cat, error } = await sb
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return;

  const idField = document.getElementById("subcategoryId");
  if (idField) idField.value = cat.id;
  const nomField = document.getElementById("subcategoryNom");
  if (nomField) nomField.value = cat.nom;
  const slugField = document.getElementById("subcategorySlug");
  if (slugField) slugField.value = cat.slug;
  const descField = document.getElementById("subcategoryDescription");
  if (descField) descField.value = cat.description || "";
  const parentSelect = document.getElementById("subcategoryParent");
  if (parentSelect) parentSelect.value = cat.parent_id || "";

  const title = document.getElementById("modalSubcategoryTitle");
  if (title) title.textContent = "Modifier la sous-catégorie";
  openModal("modalSubcategory");
}

async function saveSubcategory() {
  const id = document.getElementById("subcategoryId")?.value;
  const nom = document.getElementById("subcategoryNom")?.value.trim();
  const slug = document.getElementById("subcategorySlug")?.value.trim();
  const parent = document.getElementById("subcategoryParent")?.value;

  if (!nom || !slug || !parent) {
    toast("Nom, slug et catégorie parente sont obligatoires", "error");
    return;
  }

  const btn = document.getElementById("btnSaveSubcategory");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Enregistrement…';
  }

  try {
    const payload = {
      nom,
      slug,
      description:
        document.getElementById("subcategoryDescription")?.value.trim() || null,
      parent_id: parent,
    };

    if (id) {
      await sb.from("categories").update(payload).eq("id", id);
    } else {
      await sb.from("categories").insert(payload);
    }

    toast(
      id ? "Sous-catégorie mise à jour ✓" : "Sous-catégorie créée ✓",
      "success",
    );
    closeModal("modalSubcategory");
    await loadSubcategories();
    await populateFilters();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Enregistrer';
    }
  }
}

// ── SUPPRESSION ─────────────────────────────────────────────────
function confirmDelete(type, id, name, cascade) {
  pendingDelete = { type, id };
  const titleEl = document.getElementById("confirmTitle");
  if (titleEl) titleEl.textContent = `Supprimer "${name}" ?`;

  const warningBox = document.getElementById("confirmWarning");
  const warningText = document.getElementById("confirmWarningText");

  if (cascade && (type === "category" || type === "subcategory")) {
    if (warningBox) warningBox.style.display = "flex";
    if (warningText) {
      if (type === "category") {
        warningText.textContent =
          "Cette catégorie principale et toutes ses sous-catégories seront supprimées, ainsi que tous les produits associés.";
      } else {
        warningText.textContent =
          "Tous les produits appartenant à cette sous-catégorie seront également supprimés.";
      }
    }
  } else {
    if (warningBox) warningBox.style.display = "none";
  }

  const descEl = document.getElementById("confirmDesc");
  if (descEl)
    descEl.textContent =
      "Cette action est irréversible et ne peut pas être annulée.";

  const confirmBtn = document.getElementById("btnConfirmDelete");
  if (confirmBtn) confirmBtn.onclick = executeDelete;

  openModal("modalConfirm");
}

async function executeDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  const btn = document.getElementById("btnConfirmDelete");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Suppression…';
  }

  try {
    if (type === "product") {
      // 🔥 Récupérer toutes les images du produit (principale + 4 supplémentaires)
      const { data: product } = await sb
        .from("products")
        .select("image_principale, image_1, image_2, image_3, image_4")
        .eq("id", id)
        .single();

      if (product) {
        // Supprimer l'image principale
        if (product.image_principale) {
          await deleteStorageFile(product.image_principale);
        }
        // Supprimer les 4 images supplémentaires
        for (let i = 1; i <= 4; i++) {
          const imgUrl = product[`image_${i}`];
          if (imgUrl) {
            await deleteStorageFile(imgUrl);
          }
        }
      }

      await sb.from("products").delete().eq("id", id);
      
    } else if (type === "category") {
      const { data: category } = await sb
        .from("categories")
        .select("image_url")
        .eq("id", id)
        .single();

      if (category?.image_url) {
        await deleteStorageFile(category.image_url);
      }
      await sb.from("categories").delete().eq("id", id);
      
    } else if (type === "subcategory") {
      const { data: subcat } = await sb
        .from("categories")
        .select("image_url")
        .eq("id", id)
        .single();

      if (subcat?.image_url) {
        await deleteStorageFile(subcat.image_url);
      }
      await sb.from("categories").delete().eq("id", id);
    }

    toast("Suppression effectuée ✓", "success");
    closeModal("modalConfirm");

    await loadProducts();
    await loadCategories();
    await loadSubcategories();
    await populateFilters();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-trash"></i> Supprimer';
    }
    pendingDelete = null;
  }
}

// ── IMAGE PREVIEW HELPERS ───────────────────────────────────────
function previewMainImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  mainImgFile = file;
  showMainImgPreview(URL.createObjectURL(file));
}

function showMainImgPreview(url) {
  const previewWrap = document.getElementById("mainImgPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-preview-wrap">
        <img src="${url}" class="img-preview-single" alt="Aperçu">
        <button type="button" class="img-preview-remove" onclick="resetMainImgPreview()"><i class="ti ti-x"></i></button>
      </div>`;
  }
}

function resetMainImgPreview() {
  // 🔥 Supprimer l'ancienne image du Storage
  if (mainImgExistingUrl) {
    deleteStorageFile(mainImgExistingUrl);
  }

  mainImgFile = null;
  mainImgExistingUrl = null;

  const previewWrap = document.getElementById("mainImgPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
      <div class="img-upload-text">Cliquer ou glisser une image</div>
      <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo</div>`;
  }
  const input = document.getElementById("mainImgInput");
  if (input) input.value = "";
}

function previewCatImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  // 🔍 LOG: Vérifier le fichier sélectionné
  console.log("Fichier sélectionné:", file.name, file.type, file.size);

  catImgFile = file;
  const url = URL.createObjectURL(file);
  const previewWrap = document.getElementById("catImgPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-preview-wrap">
        <img src="${url}" class="img-preview-single" alt="Aperçu">
        <button type="button" class="img-preview-remove" onclick="removeCatImg()"><i class="ti ti-x"></i></button>
      </div>`;
  }
}

function removeCatImg() {
  //  Supprimer l'ancienne image du Storage
  if (catImgExistingUrl) {
    deleteStorageFile(catImgExistingUrl);
  }

  catImgFile = null;
  catImgExistingUrl = null;

  const previewWrap = document.getElementById("catImgPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
      <div class="img-upload-text">Cliquer ou glisser une image</div>
      <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo — recommandé 800×400px</div>`;
  }
  const input = document.getElementById("catImgInput");
  if (input) input.value = "";
}

function previewGalleryImage(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  galleryFiles[idx] = file;
  showGallerySlotPreview(idx, URL.createObjectURL(file));
}

function showGallerySlotPreview(idx, url) {
  const slot = document.getElementById(`slot-${idx}`);
  if (slot) {
    slot.innerHTML = `
      <img src="${url}" alt="Image ${idx + 1}">
      <button type="button" class="slot-remove" onclick="resetGallerySlot(${idx})"><i class="ti ti-x"></i></button>
      <span class="slot-badge">${idx + 1}</span>`;
  }
}

function resetGallerySlot(idx) {
  // 🔥 Supprimer l'ancienne image de galerie du Storage
  if (galleryExistingUrls[idx]) {
    deleteStorageFile(galleryExistingUrls[idx]);
  }
  
  galleryFiles[idx] = null;
  galleryExistingUrls[idx] = null;
  galleryExistingIds[idx] = null;
  
  const slot = document.getElementById(`slot-${idx}`);
  if (slot) {
    slot.innerHTML = `<input type="file" accept="image/*" onchange="previewGalleryImage(event,${idx})"><i class="ti ti-plus"></i><span class="slot-badge">${idx + 1}</span>`;
  }
}

// ── MODALES ─────────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
}

// ── TABS ────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  const panels = ["products", "categories", "subcategories"];
  panels.forEach((t) => {
    const panel = document.getElementById(`panel-${t}`);
    const tabBtn = document.getElementById(`tab-${t}`);
    if (panel) panel.style.display = t === tab ? "block" : "none";
    if (tabBtn) tabBtn.classList.toggle("active", t === tab);
  });

  if (tab === "products") loadProducts();
  if (tab === "categories") loadCategories();
  if (tab === "subcategories") loadSubcategories();
}

// ── SLUG AUTO ───────────────────────────────────────────────────
function autoSlug(srcId, dstId) {
  const val = document.getElementById(srcId)?.value || "";
  const slug = val
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const dstEl = document.getElementById(dstId);
  if (dstEl) dstEl.value = slug;
}

// ── TOAST ───────────────────────────────────────────────────────
function toast(msg, type = "success") {
  const icons = {
    success: "ti-check",
    error: "ti-alert-circle",
    info: "ti-info-circle",
  };
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="ti ${icons[type] || "ti-info-circle"}"></i> ${msg}`;
  const container = document.getElementById("toastContainer");
  if (container) {
    container.appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }
}

// ── ESCAPE HTML ─────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── RAFRAÎCHISSEMENT ────────────────────────────────────────────
async function refreshAll() {
  await loadProducts();
  await loadCategories();
  await loadSubcategories();
  await loadBrands();
  toast("Données actualisées", "success");
}

// ── DÉMARRAGE ───────────────────────────────────────────────────
async function init() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  await loadBrands();
  await loadProducts();
  await loadCategories();
  await loadSubcategories();
  await populateFilters();

  document.querySelectorAll(".modal-overlay").forEach((o) => {
    o.addEventListener("click", (e) => {
      if (e.target === o) o.classList.remove("open");
    });
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      closeMobileMenu();
    });
  });
}

// Exposer les fonctions globalement
window.switchTab = switchTab;
window.openProductModal = openProductModal;
window.openCategoryModal = openCategoryModal;
window.openSubcategoryModal = openSubcategoryModal;
window.editProduct = editProduct;
window.editCategory = editCategory;
window.editSubcategory = editSubcategory;
window.saveProduct = saveProduct;
window.saveCategory = saveCategory;
window.saveSubcategory = saveSubcategory;
window.confirmDelete = confirmDelete;
window.filterProducts = filterProducts;
window.filterCategories = filterCategories;
window.filterSubcategories = filterSubcategories;
window.loadSubcatsForProduct = loadSubcatsForProduct;
window.previewMainImage = previewMainImage;
window.previewCatImage = previewCatImage;
window.previewGalleryImage = previewGalleryImage;
window.resetGallerySlot = resetGallerySlot;
window.resetMainImgPreview = resetMainImgPreview;
window.removeCatImg = removeCatImg;
window.autoSlug = autoSlug;
window.refreshAll = refreshAll;
window.goToPage = goToPage;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.closeModal = closeModal;

init();
