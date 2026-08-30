/* =========================================================
   GET /api/purchase-status?ref=<purchase_id>
   Usado por gracias.html. Solo devuelve el link privado de
   Google Drive si el pago está realmente aprobado en nuestra
   base (que a su vez solo la actualiza el webhook). Nunca
   expone la tabla purchases completa ni el drive_url de otros
   ebooks.
   ========================================================= */

import { sbSelect, json } from "../_lib/supabase.js";

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const ref = url.searchParams.get("ref");
    if (!ref) return json({ error: "Falta ref" }, 400);

    const purchases = await sbSelect(env, "purchases", `id=eq.${ref}&select=*`);
    const purchase = purchases[0];
    if (!purchase) return json({ status: "not_found" }, 404);

    if (purchase.status !== "approved") {
      return json({
        status: purchase.status,
        // true solo si el webhook de Mercado Pago llegó a registrar un
        // pago real para esta compra. Si nunca llegó, es que la persona
        // no completó el pago (haya "vuelto a la tienda" o lo que sea).
        has_payment: !!purchase.mp_payment_id,
      });
    }

    const ebooks = await sbSelect(env, "ebooks", `id=eq.${purchase.ebook_id}&select=title,drive_url,cover_url`);
    const ebook = ebooks[0];

    return json({
      status: "approved",
      title: ebook?.title || "",
      cover_url: ebook?.cover_url || "",
      drive_url: ebook?.drive_url || "",
    });
  } catch (err) {
    return json({ error: "Error interno", detail: String(err) }, 500);
  }
}
