"use strict";

// ── CONFIG SUPABASE ─────────────────────────────────────────────
const SUPA_URL = "https://yrdjnsteaoajypgzqrbs.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZGpuc3RlYW9hanlwZ3pxcmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzYwMDQsImV4cCI6MjA5NjE1MjAwNH0.CtraI2nEk7qPGYtHt7BOKFIrfTCU_NoXG7jP6_2lxZY";

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
let allBrands = [];
let filteredBrands = [];
let currentPage = 1;
const BRANDS_PER_PAGE = 10;
let searchTerm = "";

// Upload fichiers
let brandLogoFile = null;
let brandLogoExistingUrl = null;
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

// ── GESTION DES IMAGES STORAGE ───────────────────────────────────
function getStoragePathFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/public\/(.+)$/);
  if (match) {
    return match[1];
  }
  return null;
}

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

// ── CHARGEMENT DES MARQUES ──────────────────────────────────────
async function loadBrands() {
  const loadingEl = document.getElementById("loadingBrands");
  if (loadingEl) loadingEl.classList.add("show");

  try {
    let query = sb.from("brands").select("*", { count: "exact" });

    if (searchTerm) {
      query = query.ilike("nom", `%${searchTerm}%`);
    }

    const from = (currentPage - 1) * BRANDS_PER_PAGE;
    const to = from + BRANDS_PER_PAGE - 1;

    const { data, error, count } = await query
      .order("nom", { ascending: true })
      .range(from, to);

    if (error) throw error;

    // Récupérer le nombre de produits par marque
    const { data: products } = await sb.from("products").select("brand_id");
    const productCounts = {};
    products?.forEach((p) => {
      if (p.brand_id) {
        productCounts[p.brand_id] = (productCounts[p.brand_id] || 0) + 1;
      }
    });

    allBrands = (data || []).map((b) => ({
      ...b,
      product_count: productCounts[b.id] || 0,
    }));

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / BRANDS_PER_PAGE);
    document.getElementById("countBrands").textContent =
      `${totalCount} marque${totalCount > 1 ? "s" : ""}`;

    renderBrands();
    updatePagination(totalCount, totalPages);

    const badge = document.getElementById("badge-brands");
    if (badge) badge.textContent = totalCount;
  } catch (e) {
    toast("Erreur chargement marques : " + e.message, "error");
  } finally {
    if (loadingEl) loadingEl.classList.remove("show");
  }
}

function renderBrands() {
  const tbody = document.getElementById("brandsBody");
  if (!tbody) return;

  if (!allBrands.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="ti ti-certificate-off"></i><p>Aucune marque trouvée</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = allBrands
    .map((b) => {
      const imgHTML = b.logo_url
        ? `<div class="td-img"><img src="${b.logo_url}" alt="${escapeHtml(b.nom)}"></div>`
        : `<div class="td-img"><i class="ti ti-certificate"></i></div>`;

      return `<tr>
        <td>${imgHTML}</td>
        <td class="td-name">${escapeHtml(b.nom)}</td>
        <td><span class="badge badge-brand">${b.product_count} produit${b.product_count > 1 ? "s" : ""}</span></td>
        <td class="td-actions">
          <button class="btn-icon btn-edit" onclick="editBrand('${b.id}')"><i class="ti ti-pencil"></i></button>
          <button class="btn-icon btn-delete" onclick="confirmDelete('${b.id}','${escapeHtml(b.nom)}')"><i class="ti ti-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");
}

function updatePagination(totalCount, totalPages) {
  const info = document.getElementById("pageInfoBrands");
  const container = document.getElementById("pageBtnsBrands");

  if (totalPages <= 1) {
    container.innerHTML = "";
    if (info)
      info.textContent = `${totalCount} marque${totalCount > 1 ? "s" : ""}`;
    return;
  }

  const start = (currentPage - 1) * BRANDS_PER_PAGE + 1;
  const end = Math.min(currentPage * BRANDS_PER_PAGE, totalCount);
  if (info) info.textContent = `${start}–${end} sur ${totalCount}`;

  let html = `
    <button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""}>
      <i class="ti ti-chevron-left"></i>
    </button>
  `;

  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += `<span class="page-dots">…</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? "active" : ""}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="page-dots">…</span>`;
    html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  html += `
    <button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? "disabled" : ""}>
      <i class="ti ti-chevron-right"></i>
    </button>
  `;

  container.innerHTML = html;
}

function goToPage(page) {
  const total = allBrands.length;
  const totalPages = Math.ceil(total / BRANDS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadBrands();
}

function filterBrands() {
  const searchEl = document.getElementById("searchBrands");
  searchTerm = searchEl?.value || "";
  currentPage = 1;
  loadBrands();
}

// ── CRUD MARQUES ─────────────────────────────────────────────────
function resetBrandModal() {
  document.getElementById("brandId").value = "";
  document.getElementById("brandNom").value = "";
  brandLogoFile = null;
  brandLogoExistingUrl = null;

  const previewWrap = document.getElementById("brandLogoPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
      <div class="img-upload-text">Cliquer ou glisser un logo</div>
      <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo — recommandé 200×200px</div>
    `;
  }
  const input = document.getElementById("brandLogoInput");
  if (input) input.value = "";
}

function openBrandModal() {
  resetBrandModal();
  const title = document.getElementById("modalBrandTitle");
  if (title) title.textContent = "Nouvelle marque";
  openModal("modalBrand");
}

async function editBrand(id) {
  resetBrandModal();
  const title = document.getElementById("modalBrandTitle");
  if (title) title.textContent = "Modifier la marque";

  const { data: brand, error } = await sb
    .from("brands")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return;

  document.getElementById("brandId").value = brand.id;
  document.getElementById("brandNom").value = brand.nom;

  const previewWrap = document.getElementById("brandLogoPreviewWrap");
  if (previewWrap) {
    if (brand.logo_url) {
      brandLogoExistingUrl = brand.logo_url;
      previewWrap.innerHTML = `
        <div class="img-preview-wrap">
          <img src="${brand.logo_url}" class="img-preview-single" alt="${escapeHtml(brand.nom)}">
          <button type="button" class="img-preview-remove" onclick="removeBrandLogo()"><i class="ti ti-x"></i></button>
        </div>
      `;
    } else {
      previewWrap.innerHTML = `
        <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
        <div class="img-upload-text">Cliquer ou glisser un logo</div>
        <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo — recommandé 200×200px</div>
      `;
    }
  }

  openModal("modalBrand");
}

async function saveBrand() {
  const id = document.getElementById("brandId")?.value;
  const nom = document.getElementById("brandNom")?.value.trim();

  if (!nom) {
    toast("Le nom de la marque est obligatoire", "error");
    return;
  }

  const btn = document.getElementById("btnSaveBrand");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Enregistrement…';
  }

  try {
    let logoUrl = brandLogoExistingUrl;
    
    if (brandLogoFile) {
      if (brandLogoExistingUrl) {
        await deleteStorageFile(brandLogoExistingUrl);
      }
      
      logoUrl = await uploadFile(
        "brands",
        brandLogoFile,
        document.getElementById("brandLogoProgressFill"),
        document.getElementById("brandLogoProgressLabel"),
        document.getElementById("brandLogoProgress")
      );
    }

    const payload = {
      nom,
      logo_url: logoUrl || null,
    };

    if (id) {
      await sb.from("brands").update(payload).eq("id", id);
    } else {
      await sb.from("brands").insert(payload);
    }

    brandLogoFile = null;
    brandLogoExistingUrl = null;

    toast(id ? "Marque mise à jour ✓" : "Marque créée ✓", "success");
    closeModal("modalBrand");
    await loadBrands();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Enregistrer';
    }
  }
}

function removeBrandLogo() {
  if (brandLogoExistingUrl) {
    deleteStorageFile(brandLogoExistingUrl);
  }

  brandLogoFile = null;
  brandLogoExistingUrl = null;

  const previewWrap = document.getElementById("brandLogoPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-upload-icon"><i class="ti ti-photo-up"></i></div>
      <div class="img-upload-text">Cliquer ou glisser un logo</div>
      <div class="img-upload-hint">JPG, PNG, WEBP — max 2 Mo — recommandé 200×200px</div>
    `;
  }
  const input = document.getElementById("brandLogoInput");
  if (input) input.value = "";
}

function previewBrandLogo(e) {
  const file = e.target.files[0];
  if (!file) return;
  brandLogoFile = file;
  const url = URL.createObjectURL(file);
  const previewWrap = document.getElementById("brandLogoPreviewWrap");
  if (previewWrap) {
    previewWrap.innerHTML = `
      <div class="img-preview-wrap">
        <img src="${url}" class="img-preview-single" alt="Aperçu">
        <button type="button" class="img-preview-remove" onclick="removeBrandLogo()"><i class="ti ti-x"></i></button>
      </div>
    `;
  }
}

// ── SUPPRESSION ─────────────────────────────────────────────────
function confirmDelete(id, name) {
  pendingDelete = { id };
  const titleEl = document.getElementById("confirmTitle");
  if (titleEl) titleEl.textContent = `Supprimer "${name}" ?`;

  const warningBox = document.getElementById("confirmWarning");
  const warningText = document.getElementById("confirmWarningText");

  if (warningBox) warningBox.style.display = "flex";
  if (warningText) {
    warningText.textContent =
      "Cette marque sera supprimée. Les produits associés ne seront pas supprimés mais perdront leur référence de marque.";
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
  const { id } = pendingDelete;
  const btn = document.getElementById("btnConfirmDelete");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Suppression…';
  }

  try {
    // Récupérer le logo avant suppression
    const { data: brand } = await sb
      .from("brands")
      .select("logo_url")
      .eq("id", id)
      .single();

    if (brand?.logo_url) {
      await deleteStorageFile(brand.logo_url);
    }

    // Supprimer la marque
    await sb.from("brands").delete().eq("id", id);

    toast("Suppression effectuée ✓", "success");
    closeModal("modalConfirm");
    await loadBrands();
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

// ── MODALES ─────────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
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
  await loadBrands();
  toast("Données actualisées", "success");
}

// ── DÉMARRAGE ───────────────────────────────────────────────────
async function init() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  await loadBrands();

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
window.openBrandModal = openBrandModal;
window.editBrand = editBrand;
window.saveBrand = saveBrand;
window.confirmDelete = confirmDelete;
window.refreshAll = refreshAll;
window.goToPage = goToPage;
window.filterBrands = filterBrands;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.closeModal = closeModal;
window.previewBrandLogo = previewBrandLogo;
window.removeBrandLogo = removeBrandLogo;

init();
