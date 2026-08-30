/* =========================================================
   SUPABASE CLIENT — compartido entre index.html, login.html y admin.html
   =========================================================
   Las credenciales del proyecto de Mabel (URL + anon key) ya están
   cargadas abajo. Si en algún momento se crea un proyecto de
   Supabase nuevo (por ejemplo, para un entorno de pruebas aparte),
   los pasos son:
   1. Creá un proyecto en https://supabase.com
   2. Corré el script completo de /supabase/setup.sql en
      Supabase → SQL Editor. Ese script crea las tablas, los
      permisos (RLS) Y el bucket de Storage "ebooks" con sus
      políticas — no hace falta crear nada a mano en Storage.
   3. Reemplazá SUPABASE_URL y SUPABASE_ANON_KEY de abajo
      (Project Settings → API). La "anon key" es pública,
      la seguridad real la da Row Level Security (RLS).
   4. Creá el usuario de Mabel a mano, una sola vez, desde
      Authentication → Users → Add user (email + contraseña).
      login.html no permite registrarse: es un panel privado.
   ========================================================= */

const SUPABASE_URL = "https://vvpvsclaextroldblltu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2cHZzY2xhZXh0cm9sZGJsbHR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNDY4MjUsImV4cCI6MjEwMzYyMjgyNX0.32kjThQX84W-O5X5OuNGtd986CUm7jnX8bdsW2J1h6k";

let supabaseClient = null;

try {
  if (window.supabase && SUPABASE_URL.includes("supabase.co") && !SUPABASE_URL.includes("TU-PROYECTO")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.warn("Supabase todavía no está configurado:", err.message);
}

/**
 * Trae los ebooks publicados, ordenados como los dejó Mabel
 * desde el panel. Si Supabase no está configurado todavía,
 * devuelve un array vacío para que la web funcione igual.
 */
async function fetchPublishedEbooks() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("ebooks")
    .select("*")
    .eq("is_published", true)
    .order("position", { ascending: true });

  if (error) {
    console.warn("No se pudieron cargar los ebooks:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Trae el orden y la visibilidad de las secciones definidas
 * desde el panel (drag & drop). Se usa más adelante para
 * reordenar el DOM de index.html dinámicamente.
 */
async function fetchSectionsLayout() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("sections")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    console.warn("No se pudo cargar el orden de secciones:", error.message);
    return [];
  }
  return data || [];
}

/** Guarda un mensaje del formulario de contacto. */
async function sendContactMessage({ nombre, email, telefono, mensaje }) {
  if (!supabaseClient) {
    console.warn("Supabase no configurado: el mensaje no se envió.");
    return { ok: false, reason: "not-configured" };
  }
  const { error } = await supabaseClient.from("messages").insert([{ nombre, email, telefono, mensaje }]);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Suma 1 al contador de descargas de un ebook, vía una función RPC
 * segura (el navegador nunca puede editar la fila directamente).
 * "Fire and forget": si falla, no bloquea la descarga del usuario.
 */
async function incrementEbookDownloads(ebookId) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.rpc("increment_ebook_downloads", { ebook_id: ebookId });
  } catch (err) {
    console.warn("No se pudo sumar la descarga:", err.message);
  }
}

/* =========================================================
   AUTENTICACIÓN — usado por login.html y admin.html
   ========================================================= */

/** Inicia sesión con email + contraseña (la cuenta se crea a mano en Supabase). */
async function authSignIn(email, password) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, session: data.session };
}

/** Cierra la sesión activa. */
async function authSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

/** Devuelve la sesión actual (o null si no hay). */
async function authGetSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session || null;
}

/* =========================================================
   ADMIN — SECCIONES (orden, visibilidad y contenido editable)
   ========================================================= */

const DEFAULT_SECTIONS = [
  { key: "hero", title: "Portada", position: 0, visible: true, content: {} },
  { key: "about", title: "Sobre mí", position: 1, visible: true, content: {} },
  { key: "approach", title: "Enfoque", position: 2, visible: true, content: {} },
  { key: "ebooks", title: "Ebooks", position: 3, visible: true, content: {} },
  { key: "testimonials", title: "Testimonios", position: 4, visible: true, content: {} },
  { key: "faq", title: "Preguntas frecuentes", position: 5, visible: true, content: {} },
  { key: "contact", title: "Contacto", position: 6, visible: true, content: {} },
];

/** Trae TODAS las secciones para el panel admin (visibles u ocultas). */
async function fetchAllSectionsAdmin() {
  if (!supabaseClient) return DEFAULT_SECTIONS;
  const { data, error } = await supabaseClient.from("sections").select("*").order("position", { ascending: true });
  if (error || !data || !data.length) return DEFAULT_SECTIONS;
  return data;
}

/** Guarda (upsert) el listado completo de secciones: orden, visibilidad y contenido. */
async function saveSectionsLayout(sections) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const rows = sections.map((s, i) => ({
    key: s.key,
    title: s.title,
    content: s.content || {},
    position: i,
    visible: s.visible !== false,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseClient.from("sections").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/* =========================================================
   ADMIN — EBOOKS (CRUD + storage)
   ========================================================= */

/** Trae TODOS los ebooks para el panel admin (publicados u ocultos). */
async function fetchAllEbooksAdmin() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("ebooks").select("*").order("position", { ascending: true });
  if (error) {
    console.warn("No se pudieron cargar los ebooks:", error.message);
    return [];
  }
  return data || [];
}

/** Sube un archivo al bucket "ebooks" y devuelve su URL pública. */
async function uploadEbookFile(file, folder) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabaseClient.storage.from("ebooks").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) return { ok: false, reason: uploadError.message };
  const { data } = supabaseClient.storage.from("ebooks").getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

/** Crea un ebook nuevo. */
async function createEbook(ebook) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const { data, error } = await supabaseClient.from("ebooks").insert([ebook]).select().single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, ebook: data };
}

/** Actualiza un ebook existente por id. */
async function updateEbook(id, patch) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const { error } = await supabaseClient.from("ebooks").update(patch).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Guarda el nuevo orden de una lista de ebooks (drag & drop). */
async function reorderEbooks(orderedIds) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const updates = orderedIds.map((id, i) => supabaseClient.from("ebooks").update({ position: i }).eq("id", id));
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) return { ok: false, reason: failed.error.message };
  return { ok: true };
}

/** Elimina un ebook (fila + archivos en storage, best-effort). */
async function deleteEbook(ebook) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const paths = [ebook.file_path, ebook.cover_path].filter(Boolean);
  if (paths.length) {
    await supabaseClient.storage.from("ebooks").remove(paths);
  }
  const { error } = await supabaseClient.from("ebooks").delete().eq("id", ebook.id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/* =========================================================
   ADMIN — MÉTRICAS
   ========================================================= */

/** Trae los números resumen (visitas totales, únicos, hoy, 7d, 30d). */
async function fetchVisitMetrics() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.rpc("get_visit_metrics");
  if (error) {
    console.warn("No se pudieron cargar las métricas de visitas:", error.message);
    return null;
  }
  return data;
}

/** Trae las visitas día por día (para el mini-gráfico). */
async function fetchDailyVisits(days = 14) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.rpc("get_daily_visits", { days });
  if (error) {
    console.warn("No se pudieron cargar las visitas diarias:", error.message);
    return [];
  }
  return data || [];
}

/** Cuenta total de mensajes recibidos (sin traer todas las filas). */
async function fetchMessagesCount() {
  if (!supabaseClient) return 0;
  const { count, error } = await supabaseClient.from("messages").select("*", { count: "exact", head: true });
  if (error) {
    console.warn("No se pudo contar los mensajes:", error.message);
    return 0;
  }
  return count || 0;
}

/* =========================================================
   ADMIN — MENSAJES DE CONTACTO
   ========================================================= */

async function fetchMessagesAdmin() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("messages").select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn("No se pudieron cargar los mensajes:", error.message);
    return [];
  }
  return data || [];
}

/* =========================================================
   ADMIN — CUPONES DE DESCUENTO
   ========================================================= */

async function fetchAllCouponsAdmin() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("coupons").select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn("No se pudieron cargar los cupones:", error.message);
    return [];
  }
  return data || [];
}

async function createCoupon(coupon) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const { data, error } = await supabaseClient.from("coupons").insert([coupon]).select().single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, coupon: data };
}

async function updateCoupon(id, patch) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const { error } = await supabaseClient.from("coupons").update(patch).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

async function deleteCoupon(id) {
  if (!supabaseClient) return { ok: false, reason: "not-configured" };
  const { error } = await supabaseClient.from("coupons").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
