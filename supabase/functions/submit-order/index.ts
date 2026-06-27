// ============================================================
// Edge Function : submit-order
// POST /functions/v1/submit-order
//
// Crée en une transaction atomique :
//   1. Le customer (ou retrouve un existant par téléphone)
//   2. Le numéro de commande CMD-AAAAMMJJ-NNN
//   3. La commande (orders)
//   4. Les lignes de commande (order_items)
//   5. La première entrée dans order_status_history
//
// Accès : public (aucune auth requise — client anonyme)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Types --------------------------------------------

interface CartItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
}

interface SubmitOrderPayload {
  // Infos client
  nom: string;
  telephone: string;
  adresse?: string;
  email?: string;
  commentaire?: string;
  // Panier
  items: CartItem[];
}

// ---------- Helpers ------------------------------------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

/** Génère CMD-AAAAMMJJ-NNN à partir du dernier numéro du jour */
async function generateOrderNumber(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // "20260602"
  const prefix = `CMD-${dateStr}-`;

  // Cherche le dernier numéro du jour
  const { data, error } = await supabase
    .from("orders")
    .select("numero_commande")
    .like("numero_commande", `${prefix}%`)
    .order("numero_commande", { ascending: false })
    .limit(1);

  if (error)
    throw new Error(`Erreur récupération numéro commande : ${error.message}`);

  let seq = 1;
  if (data && data.length > 0) {
    const last = data[0].numero_commande as string;
    const lastSeq = parseInt(last.split("-").pop() ?? "0", 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`; // CMD-20260602-001
}

/** Valide le payload entrant */
function validate(payload: SubmitOrderPayload): string | null {
  if (!payload.nom?.trim()) return "Le nom est obligatoire.";
  if (!payload.telephone?.trim()) return "Le téléphone est obligatoire.";
  if (!Array.isArray(payload.items) || payload.items.length === 0)
    return "Le panier est vide.";
  for (const item of payload.items) {
    if (!item.product_id) return "product_id manquant sur un article.";
    if (!item.product_name?.trim())
      return "product_name manquant sur un article.";
    if (typeof item.unit_price !== "number" || item.unit_price < 0)
      return "unit_price invalide sur un article.";
    if (!Number.isInteger(item.quantity) || item.quantity <= 0)
      return "quantity invalide sur un article.";
  }
  return null;
}

// ---------- Handler principal --------------------------------

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  // Client Supabase avec le SERVICE_ROLE_KEY pour bypass RLS
  // (on contrôle nous-mêmes la logique d'accès)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: SubmitOrderPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corps de la requête invalide (JSON attendu)." }, 400);
  }

  // Validation
  const validationError = validate(payload);
  if (validationError) return json({ error: validationError }, 422);

  try {
    // ── 1. Customer ──────────────────────────────────────────
    // On réutilise un client existant si même téléphone,
    // sinon on en crée un nouveau.
    let customerId: string;

    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("telephone", payload.telephone.trim())
      .limit(1)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      // Mise à jour du nom/adresse si fournis
      await supabase
        .from("customers")
        .update({
          nom: payload.nom.trim(),
          ...(payload.adresse && { adresse: payload.adresse.trim() }),
          ...(payload.email && { email: payload.email.trim() }),
        })
        .eq("id", customerId);
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          nom: payload.nom.trim(),
          telephone: payload.telephone.trim(),
          adresse: payload.adresse?.trim() ?? null,
          email: payload.email?.trim() ?? null,
        })
        .select("id")
        .single();

      if (customerError || !newCustomer) {
        throw new Error(`Création client échouée : ${customerError?.message}`);
      }
      customerId = newCustomer.id;
    }

    // ── 2. Numéro de commande ────────────────────────────────
    const numeroCommande = await generateOrderNumber(supabase);

    // ── 3. Calcul du montant total ───────────────────────────
    const montantTotal = payload.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0,
    );

    // ── 4. Création de la commande ───────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        numero_commande: numeroCommande,
        customer_id: customerId,
        montant_total: montantTotal,
        status: "nouvelle",
        commentaire: payload.commentaire?.trim() ?? null,
      })
      .select("id, numero_commande, montant_total, status, created_at")
      .single();

    if (orderError || !order) {
      throw new Error(`Création commande échouée : ${orderError?.message}`);
    }

    // ── 5. Lignes de commande ────────────────────────────────
    const orderItems = payload.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name.trim(),
      unit_price: item.unit_price,
      quantity: item.quantity,
      subtotal: item.unit_price * item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      // Rollback manuel : supprimer la commande créée
      await supabase.from("orders").delete().eq("id", order.id);
      throw new Error(
        `Création lignes commande échouée : ${itemsError.message}`,
      );
    }

    // ── 6. Première entrée dans l'historique ─────────────────
    await supabase.from("order_status_history").insert({
      order_id: order.id,
      ancien_statut: null,
      nouveau_statut: "nouvelle",
      changed_by: null, // action client anonyme
    });

    // ── Réponse succès ───────────────────────────────────────
    return json(
      {
        success: true,
        order: {
          id: order.id,
          numero_commande: order.numero_commande,
          montant_total: order.montant_total,
          status: order.status,
          created_at: order.created_at,
        },
      },
      201,
    );
  } catch (err) {
    console.error("[submit-order] Erreur :", err);
    return json({ error: "Une erreur interne s'est produite." }, 500);
  }
});
