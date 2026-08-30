/* =========================================================
   POST /api/recover-purchase
   Body: { ebook_id: string, email: string }

   Para cuando alguien pagó de verdad pero perdió la página de
   gracias.html (cerró la pestaña, se cortó la conexión, etc.)
   Busca la compra APROBADA más reciente de ese email para ese
   ebook y devuelve el id para que el navegador redirija a
   gracias.html?external_reference=<id>, reusando toda la lógica
   que ya existe ahí (sin exponer el drive_url directo acá).
   ========================================================= */

import { sbSelect, json } from "../_lib/supabase.js";

export async function onRequestPost({ request, env }) {
  try {
    const { ebook_id, email } = await request.json();
    if (!ebook_id || !email) return json({ error: "Faltan datos" }, 400);

    const rows = await sbSelect(
      env,
      "purchases",
      `ebook_id=eq.${encodeURIComponent(ebook_id)}&payer_email=ilike.${encodeURIComponent(
        email.trim()
      )}&status=eq.approved&select=id,created_at&order=created_at.desc&limit=1`
    );

    const purchase = rows[0];
    if (!purchase) return json({ found: false });

    return json({ found: true, external_reference: purchase.id });
  } catch (err) {
    return json({ error: "Error interno", detail: String(err) }, 500);
  }
}
