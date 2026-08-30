/* =========================================================
   POST /api/create-preference
   Body: { ebook_id: string }

   1. Busca el ebook en Supabase (con la service_role key).
   2. Crea una fila "pending" en purchases.
   3. Crea la preferencia en Mercado Pago con esa fila como
      external_reference (así el webhook sabe qué compra
      confirmar) y devuelve el link de checkout (init_point).
   ========================================================= */

import { sbSelect, sbInsert, sbUpdate, json } from "../_lib/supabase.js";

export async function onRequestPost({ request, env }) {
  try {
    const { ebook_id, payer_email } = await request.json();
    if (!ebook_id) return json({ error: "Falta ebook_id" }, 400);

    const ebooks = await sbSelect(env, "ebooks", `id=eq.${ebook_id}&select=*`);
    const ebook = ebooks[0];
    if (!ebook) return json({ error: "Ebook no encontrado" }, 404);
    if (!ebook.price || ebook.price <= 0) return json({ error: "Este ebook no es pago" }, 400);

    const purchase = await sbInsert(env, "purchases", {
      ebook_id: ebook.id,
      payer_email: payer_email || null,
      amount: ebook.price,
      status: "pending",
    });

    const siteUrl = env.SITE_URL.replace(/\/$/, "");

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: ebook.title,
            description: ebook.description || undefined,
            quantity: 1,
            currency_id: "ARS",
            unit_price: Number(ebook.price),
          },
        ],
        payer: payer_email ? { email: payer_email } : undefined,
        back_urls: {
          success: `${siteUrl}/gracias.html`,
          pending: `${siteUrl}/gracias.html`,
          failure: `${siteUrl}/gracias.html`,
        },
        auto_return: "approved",
        external_reference: purchase.id,
        notification_url: `${siteUrl}/api/mp-webhook`,
      }),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      return json({ error: "Mercado Pago rechazó la preferencia", detail: errText }, 502);
    }

    const preference = await mpRes.json();

    await sbUpdate(env, "purchases", `id=eq.${purchase.id}`, {
      mp_preference_id: preference.id,
    });

    return json({
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      purchase_id: purchase.id,
    });
  } catch (err) {
    return json({ error: "Error interno", detail: String(err) }, 500);
  }
}
