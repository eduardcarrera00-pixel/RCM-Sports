-- Cambio de nombre de usuario · prueba SQL en un PostgreSQL local (sin Supabase).
-- Uso: USERNAME_PG="host=127.0.0.1 port=55432 user=postgres" bash tests/username-change.sh
\set ON_ERROR_STOP on

-- ---------- Esquema mínimo de Supabase ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

-- Como en producción (20261015062531_username_auth.sql).
create table public.ae_auth_accounts (
  username text primary key check(username=lower(username) and username ~ '^[a-z0-9_]{3,30}$'),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  reservation uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recovery_hash text,
  recovery_token uuid
);
alter table public.ae_auth_accounts enable row level security;
revoke all on public.ae_auth_accounts from public, anon, authenticated;

create table public.ae_community_picks (id uuid primary key default gen_random_uuid(), user_id uuid, author text, title text);
create table public.ae_pick_comments (id uuid primary key default gen_random_uuid(), user_id uuid, author text, body text);
create table public.comments (id uuid primary key default gen_random_uuid(), article_id text not null default 'a1',
  user_id uuid, author text not null, body text not null default 'x', created_at timestamptz not null default now());
create table public.ae_notifications (id uuid primary key default gen_random_uuid(), actor_id uuid not null,
  event_key text not null, actor_name text not null default 'Usuario');
grant select, insert on public.comments to authenticated;

insert into auth.users (id, raw_user_meta_data, created_at) values
  ('a0000000-0000-4000-8000-000000000001', '{"username":"ana"}', '2026-10-12'),
  ('a0000000-0000-4000-8000-000000000002', '{"username":"beto"}', '2026-10-13'),
  ('a0000000-0000-4000-8000-000000000003', '{"username":"carla"}', '2026-10-14');
insert into public.ae_auth_accounts (username, user_id, email) values
  ('ana', 'a0000000-0000-4000-8000-000000000001', 'a@accounts.aesports.invalid'),
  ('beto', 'a0000000-0000-4000-8000-000000000002', 'b@accounts.aesports.invalid'),
  ('carla', 'a0000000-0000-4000-8000-000000000003', 'c@accounts.aesports.invalid');
insert into public.ae_community_picks (user_id, author, title) values
  ('a0000000-0000-4000-8000-000000000001', 'ana', 'Pick 1'), ('a0000000-0000-4000-8000-000000000002', 'beto', 'Pick 2');
insert into public.ae_pick_comments (user_id, author, body) values ('a0000000-0000-4000-8000-000000000001', 'ana', 'hola');
insert into public.comments (user_id, author) values ('a0000000-0000-4000-8000-000000000001', 'ana');
insert into public.ae_notifications (actor_id, event_key, actor_name) values
  ('a0000000-0000-4000-8000-000000000001', 'take_vote', 'ana'),
  ('a0000000-0000-4000-8000-000000000001', 'welcome', 'CAM SPORTS');

\i supabase/migrations/20261103130000_cam_username_change.sql

-- ---------- Ayudas ----------
create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false) $$;
create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm not ilike p_like then raise exception 'Error inesperado: % (se esperaba %)', sqlerrm, p_like; end if;
    return;
  end;
  raise exception 'Se esperaba un error (%) y no lo hubo: %', p_like, p_sql;
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FALLA: %', what; end if; end $$;

-- ---------- Permisos ----------
set role anon;
select pg_temp.expect_error($q$select public.cam_change_username('x_y_z')$q$, '%permission denied%');
select pg_temp.expect_error($q$select * from public.cam_username_changes$q$, '%permission denied%');
reset role;

-- ---------- Ana cambia su nombre ----------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select pg_temp.expect_error($q$select * from public.cam_username_changes$q$, '%permission denied%');
select pg_temp.check(public.cam_username_available('beto') = 'taken', 'beto está ocupado');
select pg_temp.check(public.cam_username_available('BETO') = 'taken', 'mayúsculas cuentan igual');
select pg_temp.check(public.cam_username_available('ana') = 'same', 'mismo nombre');
select pg_temp.check(public.cam_username_available('a b') = 'invalid', 'espacios');
select pg_temp.check(public.cam_username_available('ab') = 'invalid', 'muy corto');
select pg_temp.check(public.cam_username_available('admin') = 'reserved', 'reservado');
select pg_temp.check(public.cam_username_available('ana_fc') = 'ok', 'libre');
select pg_temp.check((public.cam_username_status()->>'can_change')::boolean, 'puede cambiar la primera vez');
select pg_temp.expect_error($q$select public.cam_change_username('beto')$q$, '%otra persona%');
select pg_temp.expect_error($q$select public.cam_change_username('ana')$q$, '%ya es tu nombre%');
select pg_temp.expect_error($q$select public.cam_change_username('Ana Futbolera')$q$, '%3 a 30%');
select pg_temp.expect_error($q$select public.cam_change_username('soporte')$q$, '%reservado%');
select pg_temp.check(public.cam_change_username('  Ana_FC ')->>'username' = 'ana_fc', 'cambio a ana_fc (minúsculas, sin espacios)');
reset role;

select pg_temp.check((select username from public.ae_auth_accounts where user_id = 'a0000000-0000-4000-8000-000000000001') = 'ana_fc', 'cuenta renombrada');
select pg_temp.check((select email from public.ae_auth_accounts where user_id = 'a0000000-0000-4000-8000-000000000001') = 'a@accounts.aesports.invalid', 'el acceso interno no cambia');
select pg_temp.check((select raw_user_meta_data->>'username' from auth.users where id = 'a0000000-0000-4000-8000-000000000001') = 'ana_fc', 'metadatos de la sesión');
select pg_temp.check((select author from public.ae_community_picks where title = 'Pick 1') = 'ana_fc', 'Picks muestran el nombre nuevo');
select pg_temp.check((select author from public.ae_community_picks where title = 'Pick 2') = 'beto', 'Picks ajenos intactos');
select pg_temp.check((select author from public.ae_pick_comments) = 'ana_fc', 'comentarios de Picks');
select pg_temp.check((select author from public.comments) = 'ana_fc', 'comentarios de noticias');
select pg_temp.check((select actor_name from public.ae_notifications where event_key = 'take_vote') = 'ana_fc', 'avisos');
select pg_temp.check((select actor_name from public.ae_notifications where event_key = 'welcome') = 'CAM SPORTS', 'bienvenida intacta');

-- ---------- Espera de 30 días y deshacer en 7 días ----------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select pg_temp.check(not (public.cam_username_status()->>'can_change')::boolean, 'ya no puede cambiar hasta dentro de 30 días');
select pg_temp.check(public.cam_username_status()->>'undo_username' = 'ana', 'puede volver a ana');
select pg_temp.expect_error($q$select public.cam_change_username('ana_nueva')$q$, '%una vez cada 30 días%');
select pg_temp.check(public.cam_change_username('ana')->>'undo' = 'true', 'deshacer: vuelve a ana');
select pg_temp.check(public.cam_username_status()->>'undo_username' is null, 'solo se puede deshacer una vez');
select pg_temp.expect_error($q$select public.cam_change_username('ana_fc')$q$, '%una vez cada 30 días%');
reset role;

-- ---------- Nombres retenidos 30 días ----------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
set role authenticated;
select pg_temp.check(public.cam_username_available('ana_fc') = 'taken', 'ana_fc queda retenido para Ana');
select pg_temp.expect_error($q$select public.cam_change_username('ana_fc')$q$, '%otra persona%');
reset role;
-- Un registro nuevo tampoco puede quedárselo.
insert into auth.users (id) values ('a0000000-0000-4000-8000-000000000009');
select pg_temp.expect_error($q$insert into public.ae_auth_accounts (username, user_id, email) values ('ana_fc', 'a0000000-0000-4000-8000-000000000009', 'z@accounts.aesports.invalid')$q$, '%no está disponible%');
-- Pasados 30 días se libera.
update public.cam_username_changes set changed_at = changed_at - interval '31 days';
insert into public.ae_auth_accounts (username, user_id, email) values ('ana_fc', 'a0000000-0000-4000-8000-000000000009', 'z@accounts.aesports.invalid');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select pg_temp.check((public.cam_username_status()->>'can_change')::boolean, 'tras 30 días puede volver a cambiar');
select pg_temp.check(public.cam_username_available('ana_fc') = 'taken', 'ya es de otra persona');
reset role;

-- ---------- Comentarios: el autor sale de la cuenta ----------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
set role authenticated;
insert into public.comments (user_id, author, body) values ('a0000000-0000-4000-8000-000000000003', 'beto', 'suplantación');
reset role;
select pg_temp.check((select author from public.comments where body = 'suplantación') = 'carla', 'no se puede firmar como otro');

-- ---------- Perfil público ----------
set role anon;
select pg_temp.check(public.cam_public_profile_card('a0000000-0000-4000-8000-000000000002')->>'username' = 'beto', 'tarjeta pública: nombre');
select pg_temp.check(public.cam_public_profile_card('a0000000-0000-4000-8000-000000000002')->>'joined_month' = '2026-10', 'tarjeta pública: mes');
reset role;

do $$ begin raise notice 'username-change: OK'; end $$;
