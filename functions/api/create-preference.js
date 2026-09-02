/* =========================================================
   POST /api/create-preference
   Body: { ebook_id: string, payer_email?: string, coupon_code?: string }

   Sirve para DOS casos con la misma lógica:
   - Ebooks gratis con link de Google Drive: precio final = 0 desde
     el arranque, se aprueban directo (como si fuera un cupón 100%).
   - Ebooks pagos: con o sin cupón, si el precio final da $0 se
     aprueban directo; si no, van a Mercado Pago. Si más adelante le
     ponés precio a un ebook que antes era gratis, automáticamente
     empieza a pedir el pago acá mismo, sin tocar nada más.
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

    // ---- validar cupón (solo tiene sentido si el ebook es pago) ----
    const shouldCheckCoupon = coupon_code && Number(ebook.price) > 0;
    const { coupon, error: couponError } = shouldCheckCoupon
      ? await findValidCoupon(env, coupon_code, ebook.id)
      : { coupon: null, error: null };
    if (shouldCheckCoupon && !coupon) return json({ error: couponError }, 400);

    let finalPrice = Number(ebook.price) || 0;
    if (coupon) {
      finalPrice = Math.round(finalPrice * (1 - coupon.discount_percent / 100) * 100) / 100;
    }

    const siteUrl = env.SITE_URL.replace(/\/$/, "");

    // ---- precio final $0 (ebook gratis, o cupón 100%): se aprueba directo ----
    if (finalPrice <= 0) {
      if (!ebook.drive_url) {
        return json({ error: "Este ebook todavía no tiene un archivo de descarga configurado" }, 400);
      }

      const purchase = await sbInsert(env, "purchases", {
        ebook_id: ebook.id,
        payer_email: payer_email || null,
        amount: 0,
        status: "approved",
        coupon_code: coupon ? coupon.code : null,
      });

      if (coupon) {
        await sbUpdate(env, "coupons", `id=eq.${coupon.id}`, { used_count: coupon.used_count + 1 });
      }
      await sbRpc(env, "increment_ebook_downloads", { ebook_id: ebook.id });

      return json({
        free: true,
        redirect: `${siteUrl}/gracias.html?external_reference=${purchase.id}`,
      });
    }

    // ---- precio final > 0: sigue por Mercado Pago ----
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
