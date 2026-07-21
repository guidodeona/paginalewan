-- ============================================================================
-- Activemos Joven — schema de autenticacion, roles y comentarios
-- ============================================================================
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
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    'user'
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
-- is_reported queda listo para un futuro boton "reportar" del lado de los
-- usuarios; hoy no se escribe desde ningun lado.

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
create or replace function public.create_comment(p_article_id text, p_parent_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.comments;
  v_body text := trim(p_body);
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para comentar.' using errcode = '42501';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 500 then
    raise exception 'El comentario tiene que tener entre 3 y 500 caracteres.' using errcode = '22023';
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
begin
  select author_id into v_author from public.comments where id = p_comment_id;
  if v_author is null then
    raise exception 'Comentario no encontrado.' using errcode = 'P0002';
  end if;
  if v_author <> auth.uid() and not public.is_admin() then
    raise exception 'No tenés permiso para eliminar este comentario.' using errcode = '42501';
  end if;
  update public.comments set is_deleted = true, body = '' where id = p_comment_id;
end;
$$;

create or replace function public.toggle_like(p_comment_id uuid)
returns table(liked boolean, likes_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para dar me gusta.' using errcode = '42501';
  end if;
  select exists(
    select 1 from public.comment_likes
    where comment_id = p_comment_id and user_id = auth.uid()
  ) into v_exists;

  if v_exists then
    delete from public.comment_likes where comment_id = p_comment_id and user_id = auth.uid();
  else
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, auth.uid());
  end if;

  return query
    select not v_exists, (select count(*) from public.comment_likes where comment_id = p_comment_id);
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
