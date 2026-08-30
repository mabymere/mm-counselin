/* =========================================================
   SUPABASE CLIENT — compartido entre index.html y login.html
   =========================================================
   1. Creá un proyecto en https://supabase.com
   2. Reemplazá SUPABASE_URL y SUPABASE_ANON_KEY de abajo
      (Project Settings → API). La "anon key" es pública,
      la seguridad real la da Row Level Security (RLS).
   3. Tablas sugeridas (se crean en el próximo paso junto
      con login.html):

      -- secciones de la web, para el drag & drop
      create table public.sections (
        id uuid primary key default gen_random_uuid(),
        key text unique not null,        -- 'hero' | 'about' | 'approach' ...
        title text,
        content jsonb,                   -- textos/imágenes editables
        position int not null default 0, -- orden -> drag & drop
        visible boolean not null default true,
        updated_at timestamptz default now()
      );

      -- ebooks descargables
      create table public.ebooks (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        description text,
        cover_url text,
        cover_path text,                 -- ruta en Storage, para poder borrarla
        file_url text not null,          -- Supabase Storage (bucket "ebooks")
        file_path text not null,         -- ruta en Storage, para poder borrarla
        price numeric default 0,         -- 0 = gratis, luego Mercado Pago
        is_published boolean not null default true,
        position int not null default 0,
        created_at timestamptz default now()
      );

      -- mensajes del formulario de contacto
      create table public.messages (
        id uuid primary key default gen_random_uuid(),
        nombre text not null,
        email text not null,
        mensaje text not null,
        created_at timestamptz default now()
      );

   4. Storage: creá un bucket público llamado "ebooks" (Storage →
      New bucket → Public bucket ON). Ahí se suben las portadas
      (carpeta "covers/") y los archivos (carpeta "files/").

   5. RLS sugerida (activar RLS en las 3 tablas y en el bucket):

      -- sections: lectura pública, escritura solo autenticada
      create policy "sections_public_read" on public.sections
        for select using (true);
      create policy "sections_auth_write" on public.sections
        for all using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated');

      -- ebooks: lectura pública solo de publicados, escritura autenticada
      create policy "ebooks_public_read" on public.ebooks
        for select using (is_published = true);
      create policy "ebooks_auth_all" on public.ebooks
        for all using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated');

      -- messages: cualquiera puede insertar (el formulario), solo
      -- Mabel (autenticada) puede leerlos
      create policy "messages_public_insert" on public.messages
        for insert with check (true);
      create policy "messages_auth_read" on public.messages
        for select using (auth.role() = 'authenticated');

   6. El usuario de Mabel se crea a mano una sola vez desde
      Supabase → Authentication → Add user (email + contraseña).
      login.html no permite registrarse: es un panel privado de
      un solo uso.
   ========================================================= */

const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY-PUBLICA";

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
async function sendContactMessage({ nombre, email, mensaje }) {
  if (!supabaseClient) {
    console.warn("Supabase no configurado: el mensaje no se envió.");
    return { ok: false, reason: "not-configured" };
  }
  const { error } = await supabaseClient.from("messages").insert([{ nombre, email, mensaje }]);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
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
  { key: "contact", title: "Contacto", position: 5, visible: true, content: {} },
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
