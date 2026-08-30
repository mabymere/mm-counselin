/* =========================================================
   POST /api/mp-webhook
   Mercado Pago llama a esta URL cuando cambia el estado de
   un pago. Acá se confirma el pago DE VERDAD (consultando a
   la API de Mercado Pago con el access token), nunca hay que
   confiar en los parámetros que vuelven por la URL al navegador.
   ========================================================= */

import { sbUpdate, json } from "../_lib/supabase.js";

export async function onRequestPost({ request, env }) {
  try {
    const url = new URL(request.url);

    // Mercado Pago manda el id del pago por query (?type=payment&data.id=...)
    // o dentro del body, según la integración. Cubrimos ambos casos.
    let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
    let topic = url.searchParams.get("type") || url.searchParams.get("topic");

    if (!paymentId) {
      const body = await request.json().catch(() => ({}));
      paymentId = body?.data?.id || body?.id;
      topic = topic || body?.type || body?.topic;
    }

    // solo nos interesan notificaciones de pagos
    if (!paymentId || (topic && topic !== "payment")) {
      return json({ ok: true, ignored: true });
    }

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
    });
    if (!paymentRes.ok) return json({ ok: false, reason: "No se pudo consultar el pago" }, 200);

    const payment = await paymentRes.json();
    const purchaseId = payment.external_reference;
    if (!purchaseId) return json({ ok: true, ignored: true });

    await sbUpdate(env, "purchases", `id=eq.${purchaseId}`, {
      status: payment.status, // approved | rejected | pending | in_process | ...
      mp_payment_id: String(payment.id),
      payer_email: payment.payer?.email || undefined,
      updated_at: new Date().toISOString(),
    });

    // Mercado Pago solo necesita un 200 rápido, sin importar el contenido.
    return json({ ok: true });
  } catch (err) {
    // devolvemos 200 igual: si Mercado Pago recibe error reintenta,
    // y el error ya quedó registrado para revisar manualmente si hace falta.
    return json({ ok: false, detail: String(err) });
  }
}
