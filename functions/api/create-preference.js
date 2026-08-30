/* =========================================================
   POST /api/create-preference
   Body: { ebook_id: string, payer_email?: string, coupon_code?: string }

   1. Busca el ebook en Supabase (con la service_role key).
   2. Si mandaron un cupón, lo valida server-side (nunca hay que
      confiar en un descuento calculado en el navegador) y calcula
      el precio final.
   3. Si el precio final queda en $0 (cupón 100%), Mercado Pago no
      puede procesar ese pago: se aprueba la compra directo acá y
      se devuelve un link a gracias.html, sin pasar por MP.
   4. Si no, crea la preferencia en Mercado Pago con el precio ya
      descontado y devuelve el link de checkout (init_point).
   ========================================================= */

import { sbSelect, sbInsert, sbUpdate, sbRpc, json } from "../_lib/supabase.js";

async function findValidCoupon(env, code, ebookId) {
  if (!code) return { coupon: null, error: null };

  const rows = await sbSelect(
    env,
    "coupons",
    `code=eq.${encodeURIComponent(code.trim().toUpperCase())}&active=eq.true&select=*`
  );
  const coupon = rows[0];
  if (!coupon) return { coupon: null, error: "Cupón inválido o inactivo" };

  if (coupon.ebook_id && coupon.ebook_id !== ebookId) {
    return { coupon: null, error: "Este cupón no aplica a este ebook" };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { coupon: null, error: "Este cupón ya venció" };
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { coupon: null, error: "Este cupón ya alcanzó el máximo de usos" };
  }

  return { coupon, error: null };
}

export async function onRequestPost({ request, env }) {
  try {
    const { ebook_id, payer_email, coupon_code } = await request.json();
    if (!ebook_id) return json({ error: "Falta ebook_id" }, 400);

    const ebooks = await sbSelect(env, "ebooks", `id=eq.${ebook_id}&select=*`);
    const ebook = ebooks[0];
    if (!ebook) return json({ error: "Ebook no encontrado" }, 404);
    if (!ebook.price || ebook.price <= 0) return json({ error: "Este ebook no es pago" }, 400);

    // ---- validar cupón (si mandaron uno) ----
    const { coupon, error: couponError } = await findValidCoupon(env, coupon_code, ebook.id);
    if (coupon_code && !coupon) return json({ error: couponError }, 400);

    let finalPrice = Number(ebook.price);
    if (coupon) {
      finalPrice = Math.round(finalPrice * (1 - coupon.discount_percent / 100) * 100) / 100;
    }

    const siteUrl = env.SITE_URL.replace(/\/$/, "");

    // ---- cupón del 100%: no hay nada que cobrar, se aprueba directo ----
    if (finalPrice <= 0) {
      const purchase = await sbInsert(env, "purchases", {
        ebook_id: ebook.id,
        payer_email: payer_email || null,
        amount: 0,
        status: "approved",
        coupon_code: coupon.code,
      });

      await sbUpdate(env, "coupons", `id=eq.${coupon.id}`, { used_count: coupon.used_count + 1 });
      await sbRpc(env, "increment_ebook_downloads", { ebook_id: ebook.id });

      return json({
        free: true,
        redirect: `${siteUrl}/gracias.html?external_reference=${purchase.id}`,
      });
    }

    // ---- precio final > 0: sigue por Mercado Pago, como siempre ----
    const purchase = await sbInsert(env, "purchases", {
      ebook_id: ebook.id,
      payer_email: payer_email || null,
      amount: finalPrice,
      status: "pending",
      coupon_code: coupon ? coupon.code : null,
    });

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
            unit_price: finalPrice,
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

    if (coupon) {
      await sbUpdate(env, "coupons", `id=eq.${coupon.id}`, { used_count: coupon.used_count + 1 });
    }
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
