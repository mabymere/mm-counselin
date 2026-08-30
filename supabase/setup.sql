-- =========================================================
-- MABEL MERELES · SETUP COMPLETO DE SUPABASE
-- =========================================================
-- Cómo correrlo:
-- 1. Entrá a tu proyecto en https://supabase.com/dashboard
-- 2. Menú izquierdo → "SQL Editor" → "New query"
-- 3. Pegá TODO este archivo y tocá "Run" (o Ctrl/Cmd + Enter)
-- 4. Con eso quedan creadas las tablas, los permisos (RLS) y
--    el bucket de Storage "ebooks" con sus políticas.
-- Se puede correr más de una vez sin romper nada (usa
-- "if not exists" / "on conflict" / "drop policy if exists").
-- =========================================================

-- 0. Extensión necesaria para generar UUIDs
create extension if not exists pgcrypto;

-- =========================================================
-- 1. TABLAS
-- =========================================================

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,          -- 'hero' | 'about' | 'approach' | 'ebooks' | 'testimonials' | 'contact'
  title text,
  content jsonb not null default '{}'::jsonb,   -- textos editables de esa sección
  position int not null default 0,              -- orden -> drag & drop del panel
  visible boolean not null default true,
  updated_at timestamptz default now()
);

create table if not exists public.ebooks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_url text,
  cover_path text,                   -- ruta en Storage (para poder borrarla)
  file_url text,                     -- ebook gratuito: descarga directa
  file_path text,                    -- ruta en Storage (para poder borrarla)
  drive_url text,                    -- ebook pago: link privado de Google Drive,
                                      -- solo se entrega después de un pago aprobado
  price numeric not null default 0,  -- 0 = gratis, >0 = va por Mercado Pago
  is_published boolean not null default true,
  downloads_count int not null default 0,   -- contador de descargas/ventas
  show_downloads boolean not null default false, -- mostrar el contador en la web pública
  position int not null default 0,   -- orden -> drag & drop del panel
  created_at timestamptz default now()
);

-- por si ya habías corrido este script antes de que existieran estas columnas
alter table public.ebooks add column if not exists downloads_count int not null default 0;
alter table public.ebooks add column if not exists show_downloads boolean not null default false;
alter table public.ebooks add column if not exists long_description text; -- resumen extendido, para la página propia del ebook
alter table public.ebooks add column if not exists slug text unique;      -- ej: "como_poner_limites_sin_culpa" -> merelesmabel.com/como_poner_limites_sin_culpa
alter table public.ebooks add column if not exists keywords text;         -- palabras clave SEO, separadas por coma

-- para poder sacarle los acentos al generar el slug de los ebooks
-- que ya existían antes de agregar esta columna
create extension if not exists unaccent;

update public.ebooks
set slug = trim(both '_' from regexp_replace(lower(unaccent(title)), '[^a-z0-9]+', '_', 'g'))
where slug is null;

-- función que suma 1 a downloads_count de forma segura: el navegador
-- (con la anon key) solo puede EJECUTAR esta función puntual, nunca
-- editar la fila del ebook directamente.
create or replace function public.increment_ebook_downloads(ebook_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ebooks
  set downloads_count = coalesce(downloads_count, 0) + 1
  where id = ebook_id;
end;
$$;

grant execute on function public.increment_ebook_downloads(uuid) to anon, authenticated, service_role;

-- por si ya habías corrido este script antes de que existiera drive_url,
-- o cuando file_url/file_path eran obligatorios
alter table public.ebooks add column if not exists drive_url text;
alter table public.ebooks alter column file_url drop not null;
alter table public.ebooks alter column file_path drop not null;

-- compras de ebooks pagos vía Mercado Pago. No tiene políticas de
-- lectura/escritura pública a propósito: con RLS activado y sin
-- policies, solo se puede acceder con la service_role key, que
-- únicamente usan las Cloudflare Functions (nunca el navegador).
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  ebook_id uuid references public.ebooks(id) on delete set null,
  payer_email text,
  amount numeric,
  status text not null default 'pending',  -- pending | approved | rejected
  mp_preference_id text,
  mp_payment_id text,
  coupon_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.purchases enable row level security;
alter table public.purchases add column if not exists coupon_code text;

-- cupones de descuento. A diferencia de purchases, Mabel SÍ necesita
-- crearlos/verlos desde el panel (autenticada, vía anon key + RLS),
-- por eso tiene policy para "authenticated". El navegador de un
-- comprador nunca puede leer la tabla completa: la validación del
-- código se hace siempre del lado del servidor (Cloudflare Function
-- con service_role), nunca directo desde el navegador del comprador.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_percent int not null check (discount_percent > 0 and discount_percent <= 100),
  ebook_id uuid references public.ebooks(id) on delete cascade, -- null = vale para todos los ebooks pagos
  max_uses int,           -- null = ilimitado
  used_count int not null default 0,
  active boolean not null default true,
  expires_at timestamptz, -- null = no vence
  created_at timestamptz default now()
);
alter table public.coupons enable row level security;

drop policy if exists "coupons_auth_all" on public.coupons;
create policy "coupons_auth_all" on public.coupons
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text,
  mensaje text not null,
  created_at timestamptz default now()
);

-- por si ya habías corrido este script antes de que existiera la columna telefono
alter table public.messages add column if not exists telefono text;

-- =========================================================
-- 2. SECCIONES INICIALES
--    (orden por defecto con el que ya arranca la web;
--    el panel las puede reordenar/ocultar después)
-- =========================================================
insert into public.sections (key, title, position, visible)
values
  ('hero',         'Portada',      0, true),
  ('about',        'Sobre mí',     1, true),
  ('approach',     'Enfoque',      2, true),
  ('ebooks',       'Ebooks',       3, true),
  ('testimonials', 'Testimonios',  4, true),
  ('faq',          'Preguntas frecuentes', 5, true),
  ('contact',      'Contacto',     6, true)
on conflict (key) do nothing;

-- por si ya habías corrido este script antes con el orden viejo
-- (contact en 5, faq en 6): lo corregimos para que Preguntas
-- frecuentes quede siempre antes que Contacto.
update public.sections set position = 5 where key = 'faq';
update public.sections set position = 6 where key = 'contact';

-- =========================================================
-- 3. ROW LEVEL SECURITY (RLS) — tablas
-- =========================================================
alter table public.sections enable row level security;
alter table public.ebooks   enable row level security;
alter table public.messages enable row level security;

-- sections: cualquiera puede leer, solo Mabel (autenticada) puede escribir
drop policy if exists "sections_public_read" on public.sections;
create policy "sections_public_read" on public.sections
  for select using (true);

drop policy if exists "sections_auth_write" on public.sections;
create policy "sections_auth_write" on public.sections
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ebooks: lectura pública solo de los publicados; Mabel puede ver/editar todo
drop policy if exists "ebooks_public_read" on public.ebooks;
create policy "ebooks_public_read" on public.ebooks
  for select using (is_published = true);

drop policy if exists "ebooks_auth_all" on public.ebooks;
create policy "ebooks_auth_all" on public.ebooks
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- messages: cualquiera puede enviar (el formulario), solo Mabel puede leerlos
drop policy if exists "messages_public_insert" on public.messages;
create policy "messages_public_insert" on public.messages
  for insert with check (true);

drop policy if exists "messages_auth_read" on public.messages;
create policy "messages_auth_read" on public.messages
  for select using (auth.role() = 'authenticated');

-- =========================================================
-- 4. STORAGE — bucket público "ebooks" + políticas
--    (acá se reemplaza el paso manual de crear el bucket
--    desde la interfaz: queda creado por este script)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('ebooks', 'ebooks', true)
on conflict (id) do nothing;

-- cualquiera puede DESCARGAR archivos del bucket (portadas y ebooks)
drop policy if exists "ebooks_bucket_public_read" on storage.objects;
create policy "ebooks_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'ebooks');

-- solo Mabel (autenticada) puede SUBIR
drop policy if exists "ebooks_bucket_auth_insert" on storage.objects;
create policy "ebooks_bucket_auth_insert"
  on storage.objects for insert
  with check (bucket_id = 'ebooks' and auth.role() = 'authenticated');

-- solo Mabel (autenticada) puede REEMPLAZAR
drop policy if exists "ebooks_bucket_auth_update" on storage.objects;
create policy "ebooks_bucket_auth_update"
  on storage.objects for update
  using (bucket_id = 'ebooks' and auth.role() = 'authenticated');

-- solo Mabel (autenticada) puede BORRAR
drop policy if exists "ebooks_bucket_auth_delete" on storage.objects;
create policy "ebooks_bucket_auth_delete"
  on storage.objects for delete
  using (bucket_id = 'ebooks' and auth.role() = 'authenticated');

-- =========================================================
-- =========================================================
-- MÉTRICAS — visitas a la web (con IP hasheada, nunca en texto
-- plano) y funciones de agregación para el panel. Estas funciones
-- son SECURITY DEFINER (se saltan RLS por dentro) pero el EXECUTE
-- solo está permitido para "authenticated" — o sea, solo Mabel
-- logueada puede pedir estas métricas.
-- =========================================================
create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,   -- hash de la IP, nunca la IP real
  path text,
  created_at timestamptz default now()
);
create index if not exists page_visits_created_at_idx on public.page_visits (created_at);
create index if not exists page_visits_ip_hash_idx on public.page_visits (ip_hash);
alter table public.page_visits enable row level security;
-- sin policies públicas a propósito: solo el service_role (la
-- Cloudflare Function que registra la visita) puede insertar.

create or replace function public.get_visit_metrics()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'total_visits', (select count(*) from page_visits),
    'unique_visitors', (select count(distinct ip_hash) from page_visits),
    'today_visits', (select count(*) from page_visits where created_at >= date_trunc('day', now())),
    'today_unique', (select count(distinct ip_hash) from page_visits where created_at >= date_trunc('day', now())),
    'last_7d_visits', (select count(*) from page_visits where created_at >= now() - interval '7 days'),
    'last_7d_unique', (select count(distinct ip_hash) from page_visits where created_at >= now() - interval '7 days'),
    'last_30d_visits', (select count(*) from page_visits where created_at >= now() - interval '30 days'),
    'last_30d_unique', (select count(distinct ip_hash) from page_visits where created_at >= now() - interval '30 days')
  );
$$;
grant execute on function public.get_visit_metrics() to authenticated;

create or replace function public.get_daily_visits(days int default 14)
returns table(day date, visits bigint, unique_visitors bigint)
language sql
security definer
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*) as visits,
    count(distinct ip_hash) as unique_visitors
  from page_visits
  where created_at >= now() - (days || ' days')::interval
  group by 1
  order by 1;
$$;
grant execute on function public.get_daily_visits(int) to authenticated;

-- LISTO. Después de correr esto solo falta:
--   a) Copiar Project URL + anon key (Project Settings → API)
--      y pegarlas en js/supabase-client.js
--   b) Copiar también el "service_role key" (Project Settings → API,
--      es SECRETA) y cargarla como variable de entorno en Cloudflare
--      Pages junto con el Access Token de Mercado Pago. Ver la guía
--      de /functions/README.md para el detalle de Mercado Pago.
--   c) Crear el usuario de Mabel a mano en
--      Authentication → Users → Add user (email + contraseña)
-- =========================================================
