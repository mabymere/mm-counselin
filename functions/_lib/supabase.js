/* =========================================================
   _lib/supabase.js — helper mínimo para hablar con Supabase
   desde las Cloudflare Functions, usando la service_role key
   (nunca se expone al navegador; vive solo en variables de
   entorno de Cloudflare).
   ========================================================= */

function headers(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** SELECT genérico. query ej: "id=eq.123&select=*" */
export async function sbSelect(env, table, query) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: headers(env),
  });
  if (!res.ok) throw new Error(`Supabase select ${table} falló: ${res.status}`);
  return res.json();
}

/** INSERT genérico. Devuelve la fila creada. */
export async function sbInsert(env, table, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(env, { Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data[0];
}

/** UPDATE genérico por filtro (ej: "id=eq.123"). */
export async function sbUpdate(env, table, filter, patch) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: headers(env, { Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase update ${table} falló: ${res.status} ${await res.text()}`);
  return res.json();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
