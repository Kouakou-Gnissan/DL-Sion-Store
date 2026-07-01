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
    userAvatarEl.textContent = (session.user.email?.charAt(0) || "A").toUpperCase();

  return true;
}

// ── ÉTAT GLOBAL ─────────────────────────────────────────────────
let allAvis = [];
let filteredAvis = [];
let currentPage = 1;
const AVIS_PER_PAGE = 10;
let searchTerm = "";
let filterStatus = "all";
let filterRating = "all";
let currentAvisId = null;
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

// ── CHARGEMENT DES AVIS ─────────────────────────────────────────
async function loadAvis() {
  const loadingEl = document.getElementById("loadingAvis");
  if (loadingEl) loadingEl.classList.add("show");

  try {
    // 1. D'abord, récupérer les IDs des produits correspondant à la recherche
    let productIds = [];
    if (searchTerm) {
      const { data: products } = await sb
        .from("products")
        .select("id")
        .ilike("nom", `%${searchTerm}%`)
        .limit(50);
      
      if (products && products.length > 0) {
        productIds = products.map(p => p.id);
      }
    }

    // 2. Construire la requête principale
    let query = sb
      .from("product_reviews")
      .select(`
        *,
        products!product_id (id, nom, reference, image_principale)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    // 3. Appliquer la recherche
    if (searchTerm) {
      // Recherche sur le nom du client ET sur le commentaire
      query = query.or(`reviewer_name.ilike.%${searchTerm}%,body.ilike.%${searchTerm}%`);
      
      // Si des produits correspondent, ajouter une condition sur product_id
      if (productIds.length > 0) {
        query = query.or(`product_id.in.(${productIds.join(',')}),reviewer_name.ilike.%${searchTerm}%,body.ilike.%${searchTerm}%`);
      }
    }

    // 4. Appliquer les filtres de statut
    if (filterStatus === "approved") {
      query = query.eq("is_approved", true);
    } else if (filterStatus === "pending") {
      query = query.eq("is_approved", false);
    } else if (filterStatus === "verified") {
      query = query.eq("is_verified", true);
    } else if (filterStatus === "unverified") {
      query = query.eq("is_verified", false);
    }

    if (filterRating !== "all") {
      query = query.eq("rating", parseInt(filterRating));
    }

    const from = (currentPage - 1) * AVIS_PER_PAGE;
    const to = from + AVIS_PER_PAGE - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    allAvis = data || [];
    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / AVIS_PER_PAGE);

    await updateStats();

    document.getElementById("countAvis").textContent = `${totalCount} avis`;

    renderAvis();
    updatePagination(totalCount, totalPages);

  } catch (e) {
    console.error("Erreur loadAvis:", e);
    toast("Erreur chargement avis : " + e.message, "error");
  } finally {
    if (loadingEl) loadingEl.classList.remove("show");
  }
}

async function updateStats() {
  try {
    const { count: total } = await sb
      .from("product_reviews")
      .select("*", { count: "exact", head: true });

    const { count: approved } = await sb
      .from("product_reviews")
      .select("*", { count: "exact", head: true })
      .eq("is_approved", true);

    const { count: pending } = await sb
      .from("product_reviews")
      .select("*", { count: "exact", head: true })
      .eq("is_approved", false);

    const { count: verified } = await sb
      .from("product_reviews")
      .select("*", { count: "exact", head: true })
      .eq("is_verified", true);

    const { count: unverified } = await sb
      .from("product_reviews")
      .select("*", { count: "exact", head: true })
      .eq("is_verified", false);

    document.getElementById("statTotal").textContent = total || 0;
    document.getElementById("statApproved").textContent = approved || 0;
    document.getElementById("statPending").textContent = pending || 0;
    document.getElementById("statVerified").textContent = verified || 0;
    document.getElementById("statUnverified").textContent = unverified || 0;

  } catch (e) {
    console.error("Erreur stats:", e);
  }
}

// ── RENDU DES AVIS ──────────────────────────────────────────────
function renderAvis() {
  const tbody = document.getElementById("avisBody");
  if (!tbody) return;

  if (!allAvis.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-star-off"></i><p>Aucun avis trouvé</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = allAvis
    .map((a, index) => {
      const product = a.products || {};
      const stars = "★".repeat(a.rating) + "☆".repeat(5 - a.rating);
      const isApproved = a.is_approved;
      const isVerified = a.is_verified;
      
      const statusBadge = isApproved 
        ? `<span class="badge badge-approved" onclick="toggleApprove('${a.id}', false)" style="cursor:pointer" title="Cliquer pour désapprouver">
            <i class="ti ti-check"></i> Approuvé
           </span>`
        : `<span class="badge badge-pending" onclick="toggleApprove('${a.id}', true)" style="cursor:pointer" title="Cliquer pour approuver">
            <i class="ti ti-clock"></i> En attente
           </span>`;
      
      const verifiedBadge = isVerified
        ? `<span class="badge badge-verified" onclick="toggleVerify('${a.id}', false)" style="cursor:pointer" title="Cliquer pour retirer la vérification">
            <i class="ti ti-circle-check"></i> Vérifié
           </span>`
        : `<span class="badge badge-unverified" onclick="toggleVerify('${a.id}', true)" style="cursor:pointer" title="Cliquer pour vérifier">
            <i class="ti ti-circle-x"></i> Non vérifié
           </span>`;
      
      const date = new Date(a.created_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });

      return `<tr>
        <td>${(currentPage - 1) * AVIS_PER_PAGE + index + 1}</td>
        <td class="td-name">${escapeHtml(a.reviewer_name)}</td>
        <td class="td-product" title="${escapeHtml(product.nom || 'Produit supprimé')}">
          ${escapeHtml(product.nom || 'Produit supprimé')}
        </td>
        <td><span class="stars-display">${stars}</span></td>
        <td>${escapeHtml((a.body || '').substring(0, 50))}${(a.body || '').length > 50 ? '…' : ''}</td>
        <td>
          ${statusBadge}<br>
          ${verifiedBadge}
        </td>
        <td style="font-size:11px;color:var(--text3)">${date}</td>
        <td class="td-actions">
          <button class="btn-icon btn-view" onclick="viewAvis('${a.id}')" title="Voir détails">
            <i class="ti ti-eye"></i>
          </button>
          <button class="btn-icon btn-delete" onclick="confirmDelete('${a.id}','${escapeHtml(a.reviewer_name)}')" title="Supprimer">
            <i class="ti ti-trash"></i>
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

function updatePagination(totalCount, totalPages) {
  const info = document.getElementById("pageInfoAvis");
  const container = document.getElementById("pageBtnsAvis");

  if (totalPages <= 1) {
    container.innerHTML = "";
    if (info) info.textContent = `${totalCount} avis`;
    return;
  }

  const start = (currentPage - 1) * AVIS_PER_PAGE + 1;
  const end = Math.min(currentPage * AVIS_PER_PAGE, totalCount);
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
  const total = filteredAvis.length || allAvis.length;
  const totalPages = Math.ceil(total / AVIS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  loadAvis();
}

function filterAvis() {
  const searchEl = document.getElementById("searchAvis");
  searchTerm = searchEl?.value || "";
  filterStatus = document.getElementById("filterStatus")?.value || "all";
  filterRating = document.getElementById("filterRating")?.value || "all";
  currentPage = 1;
  loadAvis();
}

// ── TOGGLE STATUTS ──────────────────────────────────────────────

/**
 * Basculer le statut d'approbation d'un avis
 */
async function toggleApprove(id, newStatus) {
  try {
    const { error } = await sb
      .from("product_reviews")
      .update({ is_approved: newStatus })
      .eq("id", id);

    if (error) throw error;

    toast(newStatus ? "✅ Avis approuvé" : "⏳ Avis désapprouvé", "success");
    await loadAvis();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

/**
 * Basculer le statut de vérification d'un avis
 */
async function toggleVerify(id, newStatus) {
  try {
    const { error } = await sb
      .from("product_reviews")
      .update({ is_verified: newStatus })
      .eq("id", id);

    if (error) throw error;

    toast(newStatus ? "✅ Avis marqué comme vérifié" : "❌ Avis marqué comme non vérifié", "success");
    await loadAvis();
  } catch (e) {
    toast("Erreur : " + e.message, "error");
  }
}

// ── GESTION DES AVIS ─────────────────────────────────────────────
async function viewAvis(id) {
  currentAvisId = id;
  const body = document.getElementById("avisDetailBody");
  body.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text3)">
      <i class="ti ti-loader-2" style="animation:spin .8s linear infinite;font-size:24px;display:block;margin-bottom:12px"></i>
      Chargement…
    </div>
  `;
  openModal("modalAvisDetail");

  try {
    const { data: avis, error } = await sb
      .from("product_reviews")
      .select(`
        *,
        products!product_id (id, nom, reference, image_principale, description)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    const product = avis.products || {};
    const stars = "★".repeat(avis.rating) + "☆".repeat(5 - avis.rating);
    const date = new Date(avis.created_at).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    body.innerHTML = `
      <div class="avis-detail-product">
        <img src="${product.image_principale || 'https://placehold.co/60x60/E5E7EB/9CA3AF?text=?'}" alt="${escapeHtml(product.nom || 'Produit')}">
        <div class="info">
          <div class="name">${escapeHtml(product.nom || 'Produit supprimé')}</div>
          <div class="ref">Réf: ${escapeHtml(product.reference || 'N/A')}</div>
          <div class="ref" style="font-size:11px;color:var(--text3)">ID: ${avis.product_id}</div>
        </div>
      </div>

      <div class="avis-detail-meta">
        <div class="item">
          <span class="label">Client</span>
          <span class="value">${escapeHtml(avis.reviewer_name)}</span>
        </div>
        <div class="item">
          <span class="label">Email</span>
          <span class="value">${escapeHtml(avis.reviewer_email || 'Non renseigné')}</span>
        </div>
        <div class="item">
          <span class="label">Note</span>
          <span class="value" style="color:#f5c518">${stars}</span>
        </div>
        <div class="item">
          <span class="label">Date</span>
          <span class="value">${date}</span>
        </div>
        <div class="item">
          <span class="label">Statut approbation</span>
          <span class="value">${avis.is_approved ? '✅ Approuvé' : '⏳ En attente'}</span>
        </div>
        <div class="item">
          <span class="label">Statut vérification</span>
          <span class="value">${avis.is_verified ? '✅ Vérifié (achat confirmé)' : '❌ Non vérifié'}</span>
        </div>
        <div class="item">
          <span class="label">Titre</span>
          <span class="value">${escapeHtml(avis.title || 'Sans titre')}</span>
        </div>
        <div class="item">
          <span class="label">Utile</span>
          <span class="value">${avis.helpful_count || 0} personne${(avis.helpful_count || 0) > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="avis-detail-body">
        <div class="label">Commentaire</div>
        <div class="text">${escapeHtml(avis.body || 'Aucun commentaire')}</div>
      </div>
    `;

    // Configurer les boutons d'action
    const btnApprove = document.getElementById("btnApproveAvis");
    const btnVerify = document.getElementById("btnVerifyAvis");
    const btnDelete = document.getElementById("btnDeleteAvis");

    // Bouton d'approbation
    if (avis.is_approved) {
      btnApprove.innerHTML = '<i class="ti ti-x"></i> Désapprouver';
      btnApprove.style.display = "inline-flex";
      btnApprove.onclick = () => toggleApprove(avis.id, false);
    } else {
      btnApprove.innerHTML = '<i class="ti ti-check"></i> Approuver';
      btnApprove.style.display = "inline-flex";
      btnApprove.onclick = () => toggleApprove(avis.id, true);
    }

    // Bouton de vérification
    if (avis.is_verified) {
      btnVerify.innerHTML = '<i class="ti ti-circle-x"></i> Retirer vérification';
      btnVerify.style.display = "inline-flex";
      btnVerify.onclick = () => toggleVerify(avis.id, false);
    } else {
      btnVerify.innerHTML = '<i class="ti ti-circle-check"></i> Marquer vérifié';
      btnVerify.style.display = "inline-flex";
      btnVerify.onclick = () => toggleVerify(avis.id, true);
    }

    btnDelete.innerHTML = '<i class="ti ti-trash"></i> Supprimer';
    btnDelete.style.display = "inline-flex";
    btnDelete.onclick = () => {
      closeModal("modalAvisDetail");
      confirmDelete(avis.id, avis.reviewer_name);
    };

    // Stocker l'ID pour les actions
    btnApprove.dataset.id = avis.id;
    btnVerify.dataset.id = avis.id;
    btnDelete.dataset.id = avis.id;

  } catch (e) {
    body.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--danger)">
        <i class="ti ti-alert-triangle" style="font-size:32px;display:block;margin-bottom:12px"></i>
        <p>Erreur lors du chargement de l'avis</p>
        <p style="font-size:12px;color:var(--text3);margin-top:8px">${e.message}</p>
      </div>
    `;
  }
}

// ── SUPPRESSION ─────────────────────────────────────────────────
function confirmDelete(id, name) {
  pendingDelete = { id };
  const titleEl = document.getElementById("confirmTitle");
  if (titleEl) titleEl.textContent = `Supprimer l'avis de "${name}" ?`;

  const warningBox = document.getElementById("confirmWarning");
  const warningText = document.getElementById("confirmWarningText");
  if (warningBox) warningBox.style.display = "flex";
  if (warningText) {
    warningText.textContent = "Cette action est irréversible. L'avis sera définitivement supprimé.";
  }

  const descEl = document.getElementById("confirmDesc");
  if (descEl) descEl.textContent = "Cette action ne peut pas être annulée.";

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
    await sb.from("product_reviews").delete().eq("id", id);

    toast("Avis supprimé ✓", "success");
    closeModal("modalConfirm");
    await loadAvis();
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

// ── EXPORT ──────────────────────────────────────────────────────
async function exportAvis() {
  try {
    const { data: avis } = await sb
      .from("product_reviews")
      .select(`
        *,
        products!product_id (id, nom, reference)
      `)
      .order("created_at", { ascending: false });

    if (!avis || !avis.length) {
      toast("Aucun avis à exporter", "error");
      return;
    }

    let csv = "ID,Client,Email,Note,Commentaire,Titre,Approuvé,Vérifié,Utile,Date,Produit,Reference\n";
    avis.forEach(a => {
      const product = a.products || {};
      csv += `${a.id},${a.reviewer_name},${a.reviewer_email || ""},${a.rating},"${(a.body || "").replace(/"/g, '""')}","${(a.title || "").replace(/"/g, '""')}",${a.is_approved},${a.is_verified},${a.helpful_count || 0},${a.created_at},"${product.nom || ""}","${product.reference || ""}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `avis_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    toast("✅ Export CSV effectué", "success");
  } catch (e) {
    toast("Erreur export : " + e.message, "error");
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
  const icons = { success: "ti-check", error: "ti-alert-circle", info: "ti-info-circle" };
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
  await loadAvis();
  toast("Données actualisées", "success");
}

// ── DÉMARRAGE ───────────────────────────────────────────────────
async function init() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  await loadAvis();

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
window.viewAvis = viewAvis;
window.toggleApprove = toggleApprove;
window.toggleVerify = toggleVerify;
window.confirmDelete = confirmDelete;
window.refreshAll = refreshAll;
window.goToPage = goToPage;
window.filterAvis = filterAvis;
window.exportAvis = exportAvis;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.closeModal = closeModal;

init();