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
        file_url text not null,          -- Supabase Storage (bucket "ebooks")
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

   4. RLS sugerida: lectura pública (anon) en sections/ebooks
      solo donde visible/is_published = true; escritura solo
      para el usuario autenticado (Mabel) vía login.html.
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
