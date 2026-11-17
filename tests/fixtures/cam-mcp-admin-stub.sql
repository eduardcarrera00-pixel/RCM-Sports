-- Esquema mínimo de Supabase para probar la migración del conector MCP con
-- administración (tests/cam-mcp-admin-sql.sh) en un PostgreSQL local. Las
-- funciones de la web son versiones reducidas con la misma firma y la misma
-- comprobación de administrador que en producción (4 nov 2026).

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
create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

insert into auth.users (id) values
  ('b5b3c2ca-c2bd-418c-b9ea-6b34612b6976'),  -- dueño (administrador)
  ('11111111-1111-4111-8111-111111111111');  -- usuario normal

create table public.editors (user_id uuid primary key references auth.users(id));
insert into public.editors values ('b5b3c2ca-c2bd-418c-b9ea-6b34612b6976');
create function public.rcm_is_editor() returns boolean language sql stable security definer set search_path to '' as $$
  select exists(select 1 from public.editors e where e.user_id=(select auth.uid()));
$$;

-- Noticias
create table public.articles (
  id uuid primary key default gen_random_uuid(), title text not null check (length(trim(title)) > 0), category text not null,
  author text not null, image text, summary text default '', body text not null, featured boolean default false,
  created_at timestamptz default now(), created_by uuid default auth.uid(), is_public boolean default true, legacy_id text,
  football_team text check (football_team is null or (category = 'Fútbol' and football_team = any (array['barcelona','real-madrid','manchester-united']))),
  image_focus_x int default 50 check (image_focus_x between 0 and 100), image_focus_y int default 50 check (image_focus_y between 0 and 100),
  image_zoom boolean default true, image_zoom_pct int default 100
);
create table public.comments (id uuid primary key default gen_random_uuid(), article_id text not null, parent_id uuid, user_id uuid,
  author text not null, body text not null, created_at timestamptz default now());

-- Picks
create table public.ae_community_picks (
  id uuid primary key default gen_random_uuid(), user_id uuid, author text, title text not null, legs jsonb default '[]',
  american_odds int, event_date date, created_at timestamptz default now(), hidden boolean not null default false,
  moderation_status text not null default 'pending', outcome text not null default 'pending'
);
create table public.ae_pick_comments (id uuid primary key default gen_random_uuid(), pick_id uuid, author text, body text not null,
  hidden boolean not null default false);

-- Opiniones y textos del sitio
create table public.ae_opinions (id uuid primary key default gen_random_uuid(), sport text, title text, summary text, body text,
  author text, image text, featured boolean default false, is_published boolean default true, created_at timestamptz default now(),
  created_by uuid);
create table public.cam_site_texts (key text primary key, content text, settings jsonb default '{}', updated_by uuid, updated_at timestamptz default now());

-- Takes (versiones reducidas de las funciones de la web)
create table public.ae_free_takes (id uuid primary key, hidden boolean not null default false, title text);
insert into public.ae_free_takes values ('7c0d7a44-72e6-45b9-be3b-4392af6b0da7', false, 'Lamine Yamal Balón de Oro 2026');
create function public.ae_hide_free_take(p_take_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
  update public.ae_free_takes set hidden = true where id = p_take_id and hidden = false;
  return found;
end $$;
create function public.ae_take_review_queue(p_sport text)
returns table(id uuid, title text, author text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores pueden revisar Takes'; end if;
  if p_sport not in ('nfl','football') then raise exception 'Deporte inválido'; end if;
  return query select t.id, t.title, 'eduardcarrera00'::text from public.ae_free_takes t where not t.hidden;
end $$;
create function public.ae_set_take_option_points(p_question_id uuid, p_points jsonb) returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
  return (select count(*) from jsonb_each(p_points));
end $$;
create function public.ae_classify_free_take(p_take_id uuid, p_method text, p_competition text default null, p_season text default null,
  p_team text default null, p_condition text default null, p_position integer default null, p_tier text default null,
  p_american_odds integer default null, p_rescore boolean default false)
returns table(probability numeric, points integer, trivial boolean, snapshot_id uuid) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
  if p_method = 'tier' and p_tier = 'sorpresa' then return query select 0.2::numeric, 7, false, null::uuid; return; end if;
  raise exception 'Método inválido: table, tier u odds';
end $$;
create function public.rcm_publish_ranking(p_edition text, p_team_ids text[], p_expected_updated_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'RCM: solo administradores'; end if;
  if cardinality(p_team_ids) <> 3 or p_team_ids[1] <> 'SF' then raise exception 'equipos inesperados: %', p_team_ids; end if;
end $$;
create table public.ae_site_images (key text primary key, url text, updated_by uuid);
create function public.ae_set_site_image(p_key text, p_url text default null, p_focus_x integer default null, p_focus_y integer default null, p_alt text default null)
returns public.ae_site_images language plpgsql security definer set search_path = '' as $$
declare r public.ae_site_images;
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo un administrador puede cambiar las imágenes del sitio'; end if;
  insert into public.ae_site_images values (p_key, p_url, auth.uid()) on conflict (key) do update set url = excluded.url returning * into r;
  return r;
end $$;
create function public.cam_reset_site_text(p_key text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
  delete from public.cam_site_texts where key = p_key;
end $$;
-- Una función que no está en la lista del conector.
create function public.ae_danger(p_x text) returns text language sql as $$ select p_x $$;

-- Redes y pg_cron
create schema cam_social;
create table cam_social.settings (id boolean primary key default true, enabled boolean default true);
insert into cam_social.settings values (true, true);
create table cam_social.promo_slots (slot text primary key, local_time time, enabled boolean default true);
insert into cam_social.promo_slots values ('manana', '09:00', false), ('tarde', '18:00', false);
create table cam_social.promos (id text primary key check (id ~ '^[a-z0-9-]{3,60}$'), theme text not null, kicker text not null,
  headline text not null, x_text text not null check (char_length(x_text) between 20 and 230), caption text not null, hashtags text,
  link text check (link ~ '^https://camsports\.github\.io/'), needs_news boolean default false, active boolean default true,
  active_until timestamptz, times_used int default 0, last_used_at timestamptz, created_at timestamptz default now());
create table cam_social.deliveries (id bigint generated always as identity primary key, event_key text, network text, status text,
  updated_at timestamptz);
insert into cam_social.deliveries (event_key, network, status) values
  ('promo:2026-11-05:manana', 'x', 'queued'), ('promo:2026-11-04:tarde', 'x', 'published'), ('article:abc', 'x', 'queued');
create function public.cam_social_status() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
  return jsonb_build_object('enabled', (select enabled from cam_social.settings where id));
end $$;
create schema cron;
create table cron.job (jobid bigint primary key, jobname text, active boolean);
insert into cron.job values (3, 'cam-social-promos', false);
create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null,
  username text default null, active boolean default null) returns void language sql as $$
  update cron.job set active = coalesce(alter_job.active, cron.job.active) where jobid = job_id;
$$;
