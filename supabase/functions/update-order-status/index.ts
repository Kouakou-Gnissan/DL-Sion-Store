// ============================================================
// Edge Function : update-order-status
// PATCH /functions/v1/update-order-status
//
// Met à jour le statut d'une commande et enregistre
// la transition dans order_status_history.
//
// Accès : admin authentifié uniquement (tous rôles)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Types --------------------------------------------

type OrderStatus =
  | "nouvelle"
  | "confirmee"
  | "en_preparation"
  | "en_livraison"
  | "livree"
  | "annulee";

const VALID_STATUSES: OrderStatus[] = [
  "nouvelle",
  "confirmee",
  "en_preparation",
  "en_livraison",
  "livree",
  "annulee",
];

interface UpdateStatusPayload {
  order_id: string;
  nouveau_statut: OrderStatus;
  note?: string; // commentaire optionnel sur la transition
}

// ---------- Helpers ------------------------------------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

// ---------- Handler principal --------------------------------

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "PATCH") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  // ── Auth : vérifier le JWT de l'admin ─────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentification requise." }, 401);
  }

  // Client avec anon key pour vérifier l'utilisateur connecté
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return json({ error: "Token invalide ou expiré." }, 401);
  }

  // Client service role pour les opérations DB
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Vérifier que l'utilisateur est bien un admin actif
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (adminError || !adminUser) {
    return json({ error: "Accès refusé : compte introuvable." }, 403);
  }

  if (!adminUser.is_active) {
    return json({ error: "Accès refusé : compte désactivé." }, 403);
  }

  // ── Payload ───────────────────────────────────────────────
  let payload: UpdateStatusPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corps de la requête invalide (JSON attendu)." }, 400);
  }

  if (!payload.order_id?.trim()) {
    return json({ error: "order_id est obligatoire." }, 422);
  }

  if (!VALID_STATUSES.includes(payload.nouveau_statut)) {
    return json(
      { error: `Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(", ")}.` },
      422
    );
  }

  try {
    // ── 1. Récupérer le statut actuel de la commande ─────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, numero_commande")
      .eq("id", payload.order_id.trim())
      .single();

    if (orderError || !order) {
      return json({ error: "Commande introuvable." }, 404);
    }

    // Empêcher une transition vers le même statut
    if (order.status === payload.nouveau_statut) {
      return json(
        { error: `La commande est déjà au statut "${payload.nouveau_statut}".` },
        422
      );
    }

    // Empêcher toute modification d'une commande déjà livrée ou annulée
    if (order.status === "livree" || order.status === "annulee") {
      return json(
        { error: `La commande est "${order.status}" et ne peut plus être modifiée.` },
        422
      );
    }

    const ancienStatut = order.status as OrderStatus;

    // ── 2. Mettre à jour le statut ───────────────────────────
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: payload.nouveau_statut })
      .eq("id", payload.order_id);

    if (updateError) {
      throw new Error(`Mise à jour statut échouée : ${updateError.message}`);
    }

    // ── 3. Enregistrer dans l'historique ─────────────────────
    // Note : le trigger SQL sur orders le fait aussi automatiquement,
    // mais on insère ici avec changed_by et note que le trigger ne peut pas connaître.
    // On désactive le trigger en passant par une fonction RPC dédiée si besoin.
    // Pour l'instant on insère manuellement (le trigger créera un doublon — voir note ci-dessous).
    //
    // RECOMMANDATION : désactiver le trigger trg_orders_status_history
    // et laisser cette Edge Function être la seule source d'écriture dans l'historique.
    // ALTER TABLE orders DISABLE TRIGGER trg_orders_status_history;
    //
    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: payload.order_id,
        ancien_statut: ancienStatut,
        nouveau_statut: payload.nouveau_statut,
        changed_by: adminUser.id,
        note: payload.note?.trim() ?? null,
      });

    if (historyError) {
      console.error("[update-order-status] Historique non enregistré :", historyError.message);
      // Non bloquant : le statut a déjà été mis à jour
    }

    // ── Réponse succès ───────────────────────────────────────
    return json({
      success: true,
      order: {
        id: order.id,
        numero_commande: order.numero_commande,
        ancien_statut: ancienStatut,
        nouveau_statut: payload.nouveau_statut,
        updated_by: adminUser.id,
        updated_by_role: adminUser.role,
      },
    });

  } catch (err) {
    console.error("[update-order-status] Erreur :", err);
    return json({ error: "Une erreur interne s'est produite." }, 500);
  }
});
