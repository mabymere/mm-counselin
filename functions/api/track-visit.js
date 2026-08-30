/* =========================================================
   POST /api/track-visit
   Body: { path: string }

   Registra una visita a la web. Lee la IP real del visitante
   (Cloudflare la expone en el header CF-Connecting-IP) SOLO para
   calcular un hash — la IP real nunca se guarda en ningún lado.
   El hash permite contar "visitantes únicos" sin guardar datos
   personales identificables.
   ========================================================= */

import { sbInsert, json } from "../_lib/supabase.js";

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    // VISIT_HASH_SALT es opcional: si no la configurás en Cloudflare,
    // usa un valor por defecto (funciona igual, pero es mejor
    // configurar una propia — ver functions/README.md).
    const salt = env.VISIT_HASH_SALT || "mabel-web-default-salt";
    const ip_hash = await hashIp(ip, salt);

    let path = "/";
    try {
      const body = await request.json();
      path = String(body?.path || "/").slice(0, 200);
    } catch (_) {
      /* sin body: se guarda con path por defecto */
    }

    await sbInsert(env, "page_visits", { ip_hash, path });
    return json({ ok: true });
  } catch (err) {
    // el tracking nunca debe romper nada visible para el visitante
    return json({ ok: false }, 200);
  }
}
