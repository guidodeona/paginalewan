-- ============================================================================
-- Activemos Joven — schema de autenticacion, roles y comentarios
-- ============================================================================
-- IMPORTANTE al actualizar: despues de cambiar este archivo hay que volver a
-- correrlo entero en el SQL Editor. El frontend tolera las dos versiones
-- (con y sin las secciones 9-12), asi que da igual si se publica primero la
-- web o se corre primero el SQL.
-- Correr una sola vez en el SQL Editor de Supabase (Project > SQL Editor > New
-- query > pegar todo este archivo > Run). Es idempotente: se puede volver a
-- correr sin romper nada si ya existe (usa "if not exists" / "or replace").
--
-- Diseno de seguridad (por que esta hecho asi):
-- - El rol ('user' / 'admin') vive en la tabla `profiles`, en el servidor.
--   Ningun codigo de frontend puede otorgarse el rol admin: el trigger
--   `handle_new_user` siempre crea perfiles nuevos con role='user', y el
--   trigger `prevent_role_escalation` revierte cualquier intento de cambiar
--   `role` que llegue a traves de la API publica (rol 'authenticated').
--   La UNICA forma de promover una cuenta a admin es entrando al SQL Editor
--   o Table Editor de Supabase (con tu cuenta de Supabase, no con la web) y
--   corriendo el UPDATE que se explica al final de este archivo.
-- - Los comentarios NO se editan/borran con UPDATE/DELETE directo desde el
--   navegador: todas las mutaciones pasan por funciones RPC
--   (create_comment, edit_comment, delete_comment, toggle_like) que
--   corren en el servidor (security definer) y verifican ahi mismo si
--   quien llama es el autor o un admin. Row Level Security (RLS) bloquea
--   cualquier otro camino.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Perfiles (extiende auth.users con nuestros propios datos + rol)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);
-- Nota sobre roles futuros: para sumar 'moderator', 'editor', 'author' o
-- 'collaborator' alcanza con ampliar este check constraint (ALTER TABLE
-- profiles DROP CONSTRAINT profiles_role_check, ADD CONSTRAINT ... CHECK
-- (role IN ('admin','user','moderator', ...))) y agregar los permisos
-- correspondientes en is_admin()/las funciones RPC. No hace falta tocar el
-- resto del modelo de datos.

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Blindaje: aunque la policy de arriba permite actualizar la propia fila,
-- este trigger revierte cualquier intento de cambiar `role` que llegue por
-- la API publica (rol 'authenticated'). Solo se puede cambiar `role` desde
-- el SQL Editor / Table Editor de Supabase (fuera del contexto de la API).
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Crea automaticamente un perfil (role='user', siempre) cuando alguien se
-- registra. El nombre para mostrar sale del metadata que manda el formulario
-- de registro; si no viene, se usa la parte del email antes del @.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, display_name, role,
    terms_accepted, terms_accepted_at, terms_version,
    communication_consent, communication_consent_at, communication_consent_updated_at
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    'user',
    coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false),
    case when coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false) then now() else null end,
    nullif(new.raw_user_meta_data->>'terms_version', ''),
    coalesce((new.raw_user_meta_data->>'communication_consent')::boolean, false),
    case when coalesce((new.raw_user_meta_data->>'communication_consent')::boolean, false) then now() else null end,
    now()
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: ¿el usuario que hace la llamada es admin? (se usa en las RPC)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Comentarios
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  is_deleted boolean not null default false,
  is_reported boolean not null default false
);
-- is_reported lo escriben report_comment()/dismiss_comment_reports()
-- (seccion 12).

create index if not exists comments_article_id_idx on public.comments(article_id);
create index if not exists comments_parent_id_idx on public.comments(parent_id);

alter table public.comments enable row level security;

-- Lectura publica (incluye comentarios borrados: el front necesita saber que
-- existieron para mostrar "[Comentario eliminado]" sin romper el hilo).
drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public" on public.comments
  for select using (true);

-- A proposito NO hay policies de insert/update/delete: toda mutacion pasa
-- por las funciones RPC de abajo, que son las unicas con permiso para
-- escribir en esta tabla.

-- ----------------------------------------------------------------------------
-- 3. Likes
-- ----------------------------------------------------------------------------
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_comment_id_idx on public.comment_likes(comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_public" on public.comment_likes;
create policy "comment_likes_select_public" on public.comment_likes
  for select using (true);
-- Igual que en comments: sin policies de insert/delete, todo pasa por
-- toggle_like().

-- ----------------------------------------------------------------------------
-- 4. Funciones RPC (unico camino para crear/editar/borrar/likear)
-- ----------------------------------------------------------------------------
-- Los ids de articulo son el "slug" del archivo HTML (ej.
-- "soberania-o-remate"). La base no conoce la lista de articulos (vive en
-- data/articles.json), pero al menos exige ese formato para que no se puedan
-- crear comentarios/likes/vistas sobre ids arbitrarios.
create or replace function public.is_valid_article_id(p_article_id text)
returns boolean
language sql
immutable
as $$
  select p_article_id is not null
     and char_length(p_article_id) <= 120
     and p_article_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
$$;

create index if not exists comments_author_created_idx on public.comments(author_id, created_at);

create or replace function public.create_comment(p_article_id text, p_parent_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.comments;
  v_body text := trim(p_body);
  v_parent public.comments;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para comentar.' using errcode = '42501';
  end if;
  if not public.is_valid_article_id(p_article_id) then
    raise exception 'Artículo inválido.' using errcode = '22023';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 500 then
    raise exception 'El comentario tiene que tener entre 3 y 500 caracteres.' using errcode = '22023';
  end if;
  -- Una respuesta tiene que colgar de un comentario vivo del MISMO articulo
  -- (sin esto se podian crear respuestas cruzadas entre notas, o colgadas de
  -- un comentario ya eliminado).
  if p_parent_id is not null then
    select * into v_parent from public.comments where id = p_parent_id;
    if v_parent.id is null or v_parent.is_deleted or v_parent.article_id <> p_article_id then
      raise exception 'El comentario al que querés responder ya no existe.' using errcode = 'P0002';
    end if;
  end if;
  -- Limite anti-spam por usuario. Los admins quedan exentos.
  if not public.is_admin() then
    if (select count(*) from public.comments
        where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 3 then
      raise exception 'Estás comentando muy seguido. Esperá un minuto y volvé a intentar.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.comments
        where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Llegaste al límite de comentarios por hora. Volvé a intentar más tarde.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.comments (article_id, parent_id, author_id, body)
  values (p_article_id, p_parent_id, auth.uid(), v_body)
  returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.edit_comment(p_comment_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.comments;
  v_body text := trim(p_body);
begin
  select * into v_comment from public.comments where id = p_comment_id;
  if v_comment is null or v_comment.is_deleted then
    raise exception 'Comentario no encontrado.' using errcode = 'P0002';
  end if;
  if v_comment.author_id <> auth.uid() and not public.is_admin() then
    raise exception 'No tenés permiso para editar este comentario.' using errcode = '42501';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 500 then
    raise exception 'El comentario tiene que tener entre 3 y 500 caracteres.' using errcode = '22023';
  end if;
  update public.comments set body = v_body, updated_at = now()
    where id = p_comment_id
    returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_has_children boolean;
begin
  select author_id into v_author from public.comments where id = p_comment_id;
  if v_author is null then
    raise exception 'Comentario no encontrado.' using errcode = 'P0002';
  end if;
  if v_author <> auth.uid() and not public.is_admin() then
    raise exception 'No tenés permiso para eliminar este comentario.' using errcode = '42501';
  end if;

  select exists(select 1 from public.comments where parent_id = p_comment_id) into v_has_children;

  if v_has_children then
    -- Tiene respuestas: se deja el placeholder "[Comentario eliminado]" para
    -- no dejar esas respuestas huerfanas, sin contexto de que estaban
    -- respondiendo.
    update public.comments set is_deleted = true, body = '' where id = p_comment_id;
  else
    -- Sin respuestas: se borra de verdad, desaparece de la lista.
    delete from public.comments where id = p_comment_id;
  end if;
end;
$$;

create or replace function public.toggle_like(p_comment_id uuid)
returns table(liked boolean, likes_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed boolean;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para dar me gusta.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.comments where id = p_comment_id and not is_deleted) then
    raise exception 'Comentario no encontrado.' using errcode = 'P0002';
  end if;

  -- Borrar primero y, si no habia nada, insertar con "on conflict do nothing":
  -- dos clics simultaneos ya no chocan contra la clave primaria.
  delete from public.comment_likes where comment_id = p_comment_id and user_id = auth.uid();
  v_removed := found;
  if not v_removed then
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, auth.uid())
    on conflict do nothing;
  end if;

  return query
    select not v_removed, (select count(*) from public.comment_likes where comment_id = p_comment_id);
end;
$$;

revoke execute on function public.create_comment(text, uuid, text) from public, anon;
revoke execute on function public.edit_comment(uuid, text) from public, anon;
revoke execute on function public.delete_comment(uuid) from public, anon;
revoke execute on function public.toggle_like(uuid) from public, anon;
grant execute on function public.create_comment(text, uuid, text) to authenticated;
grant execute on function public.edit_comment(uuid, text) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;

-- ============================================================================
-- 5. Perfiles ampliados: datos publicos, datos privados, redes sociales
-- ============================================================================
-- Diseño de privacidad (por que esta separado en 3 tablas en vez de una):
-- `profiles` sigue siendo de lectura publica (se necesita para mostrar
-- nombre/avatar en comentarios). Por eso el telefono y la fecha de
-- nacimiento NO viven ahi: si estuvieran en la misma tabla, cualquiera
-- (incluso sin loguearse) podria leerlos con la misma consulta publica que
-- lee el nombre. Van en `profile_private`, con RLS que solo permite ver la
-- propia fila. Las redes sociales van en su propia tabla porque la
-- visibilidad se decide POR RED (el usuario elige cuales mostrar), y esa
-- regla se aplica con RLS fila por fila, no confiando en que el frontend
-- "elija no mostrar" un campo que en realidad sigue siendo publico.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists avatar_type text not null default 'preset' check (avatar_type in ('preset', 'custom'));
alter table public.profiles add column if not exists avatar_preset_id text default 'avatar-1';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text check (char_length(bio) <= 280);
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists province text;
alter table public.profiles add column if not exists education_level text;
alter table public.profiles add column if not exists education_institution text;
alter table public.profiles add column if not exists education_field text;
alter table public.profiles add column if not exists communication_consent boolean not null default false;
alter table public.profiles add column if not exists communication_consent_at timestamptz;
alter table public.profiles add column if not exists communication_consent_updated_at timestamptz;
alter table public.profiles add column if not exists terms_accepted boolean not null default false;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;

-- Username: unico, formato simple (letras/numeros/guion bajo, 3 a 20 caracteres).
create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username)) where username is not null;
alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$');

-- Datos privados: NUNCA publicos. Solo el dueño de la fila puede leerlos o
-- escribirlos (ademas, comments.js/admin.js jamas los piden en su SELECT).
create table if not exists public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,20}$'),
  birth_date date check (birth_date is null or (birth_date <= current_date and birth_date >= '1900-01-01')),
  updated_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
drop policy if exists "profile_private_owner_only" on public.profile_private;
create policy "profile_private_owner_only" on public.profile_private
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Redes sociales: visibilidad real por fila via RLS, no solo un flag que el
-- frontend decide respetar.
create table if not exists public.profile_social_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'facebook')),
  url text not null check (char_length(url) <= 300 and url ~* '^https://'),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, platform)
);
alter table public.profile_social_links enable row level security;

drop policy if exists "social_links_select" on public.profile_social_links;
create policy "social_links_select" on public.profile_social_links
  for select using (is_public = true or auth.uid() = profile_id);

drop policy if exists "social_links_owner_write" on public.profile_social_links;
create policy "social_links_owner_write" on public.profile_social_links
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- ============================================================================
-- 6. Almacenamiento de fotos de perfil (Supabase Storage)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Cada usuario solo puede subir/editar/borrar dentro de su propia carpeta
-- (se espera que el frontend suba a "avatars/<user_id>/archivo.ext").
drop policy if exists "avatar_owner_insert" on storage.objects;
create policy "avatar_owner_insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatar_owner_delete" on storage.objects;
create policy "avatar_owner_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- 7. Likes de articulos (mismo patron que los likes de comentarios)
-- ============================================================================
create table if not exists public.article_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  article_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);
create index if not exists article_likes_article_id_idx on public.article_likes(article_id);

alter table public.article_likes enable row level security;
drop policy if exists "article_likes_select_public" on public.article_likes;
create policy "article_likes_select_public" on public.article_likes
  for select using (true);
-- Sin policies de insert/update/delete: todo pasa por toggle_article_like(),
-- igual que toggle_like() para comentarios.

create or replace function public.toggle_article_like(p_article_id text)
returns table(liked boolean, likes_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed boolean;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para dar me gusta.' using errcode = '42501';
  end if;
  if not public.is_valid_article_id(p_article_id) then
    raise exception 'Artículo inválido.' using errcode = '22023';
  end if;

  delete from public.article_likes where article_id = p_article_id and user_id = auth.uid();
  v_removed := found;
  if not v_removed then
    insert into public.article_likes (article_id, user_id) values (p_article_id, auth.uid())
    on conflict do nothing;
  end if;

  return query
    select not v_removed, (select count(*) from public.article_likes where article_id = p_article_id);
end;
$$;

revoke execute on function public.toggle_article_like(text) from public, anon;
grant execute on function public.toggle_article_like(text) to authenticated;

-- ============================================================================
-- 8. Funcion para guardar el consentimiento de comunicaciones con timestamps
-- ============================================================================
-- (El resto de los campos de perfil se actualizan con un UPDATE normal desde
-- el frontend, protegido por la policy "profiles_update_own" que ya existe.
-- Este consentimiento puntual necesita su propia funcion porque hay que
-- fijar dos timestamps distintos de forma consistente: la primera vez que
-- se otorga, y cada vez que se modifica.)
create or replace function public.set_communication_consent(p_consent boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_first_time boolean;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.' using errcode = '42501';
  end if;

  select (communication_consent_at is null) into v_first_time from public.profiles where id = auth.uid();

  update public.profiles
    set communication_consent = p_consent,
        communication_consent_at = case when v_first_time then now() else communication_consent_at end,
        communication_consent_updated_at = now()
    where id = auth.uid()
    returning * into v_profile;

  return v_profile;
end;
$$;

revoke execute on function public.set_communication_consent(boolean) from public, anon;
grant execute on function public.set_communication_consent(boolean) to authenticated;

-- ============================================================================
-- 9. Endurecimiento de `profiles`: que columnas se leen y se escriben
-- ============================================================================
-- La policy "profiles_select_public" deja leer TODAS las filas (hace falta
-- para mostrar nombre/avatar en los comentarios), pero sin esto tambien
-- dejaba leer TODAS las columnas: nombre y apellido, localidad, estudios,
-- consentimientos... a cualquiera con la anon key (que es publica). RLS
-- filtra filas, no columnas, asi que el filtro de columnas se hace con
-- privilegios de Postgres:
-- - Lectura publica: solo lo que se muestra en un comentario.
-- - Escritura: solo los campos que el usuario edita desde /perfil. Las
--   columnas legales (terms_*, communication_*) y el rol quedan fuera:
--   se cambian unicamente via las RPC accept_terms() y
--   set_communication_consent(), que ponen la fecha del lado del servidor.
-- - El dueño lee su fila completa con get_my_profile().
-- OJO: una columna nueva que se agregue a profiles NO queda legible ni
-- editable por la API hasta sumarla a estos grants (seguro por defecto).
revoke select, insert, update, delete on public.profiles from anon, authenticated;
grant select (id, display_name, username, role, avatar_type, avatar_preset_id, avatar_url, bio, created_at)
  on public.profiles to anon, authenticated;
grant update (display_name, username, first_name, last_name, avatar_type, avatar_preset_id, avatar_url,
              bio, location, province, education_level, education_institution, education_field)
  on public.profiles to authenticated;

-- avatar_url solo puede apuntar a una foto subida por el propio usuario a
-- su carpeta del bucket "avatars" (antes se podia poner cualquier URL).
create or replace function public.validate_profile_avatar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
       and new.avatar_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
                              || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'URL de avatar no permitida.' using errcode = '22023';
    end if;
    if new.avatar_preset_id is distinct from old.avatar_preset_id
       and new.avatar_preset_id !~ '^avatar-[0-9]{1,3}$' then
      raise exception 'Avatar inválido.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_profile_avatar on public.profiles;
create trigger trg_validate_profile_avatar
  before update on public.profiles
  for each row execute function public.validate_profile_avatar();

create or replace function public.get_my_profile()
returns public.profiles
language sql
security definer
stable
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke execute on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.accept_terms(p_version text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.' using errcode = '42501';
  end if;
  if p_version is null or char_length(p_version) > 40 then
    raise exception 'Versión de términos inválida.' using errcode = '22023';
  end if;
  update public.profiles
    set terms_accepted = true, terms_accepted_at = now(), terms_version = p_version
    where id = auth.uid()
    returning * into v_profile;
  return v_profile;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- ============================================================================
-- 10. Vistas de articulos (ranking "Lo más leído" compartido)
-- ============================================================================
-- Antes las vistas vivian en el localStorage de cada navegador, asi que
-- cada visitante veia un ranking armado solo con lo que leyo el mismo.
-- El navegador sigue evitando recontar la misma nota dentro de 30 minutos
-- (js/stats.js); esto es un contador publico, no una metrica de auditoria.
create table if not exists public.article_views (
  article_id text primary key check (public.is_valid_article_id(article_id)),
  views bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.article_views enable row level security;

drop policy if exists "article_views_select_public" on public.article_views;
create policy "article_views_select_public" on public.article_views
  for select using (true);
-- Sin policies de escritura: solo via record_article_view().

create or replace function public.record_article_view(p_article_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_views bigint;
begin
  if not public.is_valid_article_id(p_article_id) then
    raise exception 'Artículo inválido.' using errcode = '22023';
  end if;
  -- Tope de filas: evita que alguien llene la tabla inventando ids.
  if not exists(select 1 from public.article_views where article_id = p_article_id)
     and (select count(*) from public.article_views) >= 1000 then
    return 0;
  end if;
  insert into public.article_views as v (article_id, views) values (p_article_id, 1)
  on conflict (article_id) do update set views = v.views + 1, updated_at = now()
  returning v.views into v_views;
  return v_views;
end;
$$;

revoke execute on function public.record_article_view(text) from public;
grant execute on function public.record_article_view(text) to anon, authenticated;

-- ============================================================================
-- 11. Suscripciones al newsletter (formulario de /abramos-debate.html)
-- ============================================================================
-- La tabla no se puede leer desde la web (sin policies de select): los mails
-- se consultan solo desde el dashboard de Supabase (Table Editor).
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);
create unique index if not exists newsletter_subscribers_email_idx on public.newsletter_subscribers (lower(email));
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;

create or replace function public.subscribe_newsletter(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ingresá un email válido.' using errcode = '22023';
  end if;
  -- Si ya estaba suscripto no se informa nada distinto: no revela que
  -- mails estan en la lista.
  insert into public.newsletter_subscribers (email) values (v_email) on conflict do nothing;
end;
$$;

revoke execute on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;

-- Las admins ven y dan de baja suscriptores desde el panel de moderacion.
grant select, delete on public.newsletter_subscribers to authenticated;
drop policy if exists "newsletter_admin_select" on public.newsletter_subscribers;
create policy "newsletter_admin_select" on public.newsletter_subscribers
  for select using (public.is_admin());
drop policy if exists "newsletter_admin_delete" on public.newsletter_subscribers;
create policy "newsletter_admin_delete" on public.newsletter_subscribers
  for delete using (public.is_admin());

-- ============================================================================
-- 12. Reportes de comentarios
-- ============================================================================
-- Cualquier usuario logueado puede reportar un comentario ajeno (una vez por
-- comentario). comments.is_reported se mantiene sincronizado para filtrar
-- rapido en el panel; el detalle (quien y por que) vive en comment_reports,
-- que solo ven las admins (y cada quien sus propios reportes).
create table if not exists public.comment_reports (
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter_id)
);
create index if not exists comment_reports_reporter_created_idx on public.comment_reports(reporter_id, created_at);
alter table public.comment_reports enable row level security;

drop policy if exists "comment_reports_select_own_or_admin" on public.comment_reports;
create policy "comment_reports_select_own_or_admin" on public.comment_reports
  for select using (reporter_id = auth.uid() or public.is_admin());
-- Sin policies de escritura: todo pasa por report_comment()/dismiss_comment_reports().

create or replace function public.report_comment(p_comment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.comments;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para reportar.' using errcode = '42501';
  end if;
  select * into v_comment from public.comments where id = p_comment_id;
  if v_comment.id is null or v_comment.is_deleted then
    raise exception 'Comentario no encontrado.' using errcode = 'P0002';
  end if;
  if v_comment.author_id = auth.uid() then
    raise exception 'No podés reportar tu propio comentario.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'El motivo puede tener hasta 300 caracteres.' using errcode = '22023';
  end if;
  if (select count(*) from public.comment_reports
      where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Enviaste muchos reportes seguidos. Volvé a intentar más tarde.' using errcode = 'P0001';
  end if;
  insert into public.comment_reports (comment_id, reporter_id, reason)
  values (p_comment_id, auth.uid(), v_reason)
  on conflict do nothing;
  update public.comments set is_reported = true where id = p_comment_id;
end;
$$;

create or replace function public.dismiss_comment_reports(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo una administradora puede descartar reportes.' using errcode = '42501';
  end if;
  delete from public.comment_reports where comment_id = p_comment_id;
  update public.comments set is_reported = false where id = p_comment_id;
end;
$$;

revoke execute on function public.report_comment(uuid, text) from public, anon;
revoke execute on function public.dismiss_comment_reports(uuid) from public, anon;
grant execute on function public.report_comment(uuid, text) to authenticated;
grant execute on function public.dismiss_comment_reports(uuid) to authenticated;

-- ============================================================================
-- PASO MANUAL — promover tu cuenta a administradora "ActivemosJoven"
-- ============================================================================
-- 1. Registrate normalmente desde la web con el usuario que va a ser la
--    cuenta admin (por ejemplo con el mail oficial de la organizacion).
-- 2. Volvé a este SQL Editor y corré (reemplazando el email):
--
--    update public.profiles
--    set role = 'admin'
--    where id = (select id from auth.users where email = 'tu-email@ejemplo.com');
--
-- Esta es la UNICA forma de crear un admin: no existe ningun boton ni
-- endpoint en la web que lo permita.
-- ============================================================================
