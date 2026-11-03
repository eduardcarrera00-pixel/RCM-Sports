-- Esquema mínimo de Supabase para probar las migraciones de Parties en un
-- PostgreSQL local (tests/parties-sql.sh). Copia solo lo que usan: auth,
-- roles, tablas de Picks y Takes y las funciones de puntos tal como están en
-- producción (ae_take_score_rows y ae_pick_result_ranking, 1 nov 2026;
-- quinielas y sus clasificaciones, 3 nov 2026).

-- Los roles son de todo el servidor: se crean solo si faltan (la prueba se puede repetir).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

-- Privilegios por defecto como en Supabase: todo lo nuevo es accesible por
-- anon/authenticated salvo que la migración lo revoque.
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
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create table public.editors (user_id uuid primary key references auth.users(id));
create function public.rcm_is_editor() returns boolean language sql stable security definer set search_path to '' as $$
  select exists(select 1 from public.editors e where e.user_id=(select auth.uid()));
$$;

create table public.ae_auth_accounts (
  username text primary key,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.ae_community_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author text,
  title text not null,
  explanation text,
  legs jsonb not null default '[]'::jsonb,
  decimal_odds numeric,
  american_odds integer,
  created_at timestamptz not null default now(),
  publication_day date,
  hidden boolean not null default false,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  event_date date,
  outcome text not null default 'pending' check (outcome in ('pending','won','lost','void')),
  settled_at timestamptz,
  settled_by uuid,
  result_points numeric not null default 0
);

create table public.ae_free_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  hidden boolean not null default false,
  competition text
);
alter table public.ae_free_takes enable row level security;

create table public.ae_free_take_votes (
  take_id uuid not null references public.ae_free_takes(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  value smallint not null,
  primary key (take_id, user_id)
);

create table public.ae_take_results (
  take_id uuid primary key references public.ae_free_takes(id) on delete cascade,
  sport text not null check (sport in ('nfl','football')),
  outcome text not null check (outcome in ('won','lost')),
  points smallint not null,
  scored_at timestamptz not null default now()
);

create table public.ae_take_questions (
  id uuid primary key default gen_random_uuid(),
  competition text not null,
  period text not null,
  season text not null default '2026/27',
  prompt text not null,
  closes_at timestamptz not null,
  points integer not null,
  status text not null default 'open',
  correct_option_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create table public.ae_take_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.ae_take_questions(id),
  label text not null,
  points smallint
);
create table public.ae_take_predictions (
  question_id uuid not null references public.ae_take_questions(id),
  user_id uuid not null references auth.users(id),
  option_id uuid not null references public.ae_take_options(id),
  created_at timestamptz not null default now(),
  awarded_points integer,
  primary key (question_id, user_id)
);

-- Copia literal de producción.
CREATE OR REPLACE FUNCTION public.ae_take_score_rows(p_sport text, p_period text)
 RETURNS TABLE(user_id uuid, take_id uuid, title text, body text, outcome text, points integer, scored_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.user_id, t.id, t.title, t.body, r.outcome, r.points::integer, r.scored_at
    from public.ae_take_results r
    join public.ae_free_takes t on t.id=r.take_id
   where not t.hidden
     and (p_sport='all' or r.sport=p_sport)
     and (p_period='all'
          or date_trunc('month',r.scored_at at time zone 'America/Toronto')
             = date_trunc('month',now() at time zone 'America/Toronto'))
  union all
  select p.user_id, q.id,
         ('Campeón · '||o.label)::text,
         q.prompt,
         case when coalesce(p.awarded_points,0)>0 then 'won' else 'lost' end,
         coalesce(p.awarded_points,0),
         q.settled_at
    from public.ae_take_predictions p
    join public.ae_take_questions q on q.id=p.question_id
    join public.ae_take_options o on o.id=p.option_id
   where q.status='settled' and q.period='season' and q.settled_at is not null
     and (p_sport='all'
          or (p_sport='nfl' and q.competition='nfl')
          or (p_sport='football' and q.competition in ('laliga','premier','ligamx','champions')))
     and (p_period='all'
          or date_trunc('month',q.settled_at at time zone 'America/Toronto')
             = date_trunc('month',now() at time zone 'America/Toronto'))
$function$;

-- Copia literal de producción.
CREATE OR REPLACE FUNCTION public.ae_pick_result_ranking(p_period text DEFAULT 'month'::text)
 RETURNS TABLE(user_id uuid, username text, points numeric, correct_picks bigint, total_resolved bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_period is null or p_period not in ('month','all') then
    raise exception 'Periodo inválido';
  end if;
  return query
    with score_rows as (
      select p.user_id,
        coalesce(nullif(p.author,''),'Aficionado')::text as username,
        p.result_points::numeric as points,
        case when p.outcome='won' then 1 else 0 end as correct,
        p.settled_at
      from public.ae_community_picks p
      where not p.hidden and p.moderation_status='approved'
        and p.outcome in ('won','lost','void') and p.settled_at is not null
    ), filtered as (
      select * from score_rows r
      where p_period='all' or date_trunc('month',r.settled_at at time zone 'America/Toronto')
        = date_trunc('month',now() at time zone 'America/Toronto')
    )
    select r.user_id,max(r.username)::text,sum(r.points)::numeric(12,2),
      sum(r.correct)::bigint,count(*)::bigint
    from filtered r
    group by r.user_id
    order by sum(r.points) desc,sum(r.correct) desc,r.user_id
    limit 10;
end
$function$;

-- ---------------------------------------------------------------------------
-- Quinielas NFL y Fútbol (columnas que usan los parties y el perfil).
-- Los pronósticos son privados: cada uno solo ve los suyos (RLS).
-- ---------------------------------------------------------------------------
create table public.nfl_teams (id text primary key, name text not null, logo text);
create table public.cam_nfl_games (
  id text primary key,
  season integer not null,
  week integer not null,
  home_id text not null references public.nfl_teams(id),
  away_id text not null references public.nfl_teams(id),
  kickoff timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','final','postponed','cancelled','tie')),
  home_score integer, away_score integer,
  winner_id text references public.nfl_teams(id),
  points_home integer, points_away integer,
  odds_locked_at timestamptz,
  picks_open boolean not null default false
);
create table public.cam_nfl_picks (
  game_id text not null references public.cam_nfl_games(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null references public.nfl_teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  awarded_points integer not null default 0,
  settled_at timestamptz,
  primary key (game_id, user_id)
);
create table public.cam_football_teams (id text primary key, name text not null, short_name text not null, abbreviation text not null default '', logo text);
create table public.cam_football_games (
  id text primary key,
  competition text not null check (competition in ('laliga','premier','ligamx','champions')),
  season integer not null,
  matchday integer not null,
  home_id text not null references public.cam_football_teams(id),
  away_id text not null references public.cam_football_teams(id),
  kickoff timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','final','postponed','cancelled')),
  home_score integer, away_score integer,
  outcome text check (outcome in ('home','draw','away')),
  points_home integer, points_draw integer, points_away integer,
  odds_locked_at timestamptz,
  picks_open boolean not null default false
);
create table public.cam_football_picks (
  game_id text not null references public.cam_football_games(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  pick text not null check (pick in ('home','draw','away')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  awarded_points integer not null default 0,
  settled_at timestamptz,
  primary key (game_id, user_id)
);
alter table public.cam_nfl_picks enable row level security;
alter table public.cam_football_picks enable row level security;
revoke all on public.cam_nfl_picks, public.cam_football_picks from anon, authenticated;
grant select on public.cam_nfl_picks, public.cam_football_picks to authenticated;
create policy cam_nfl_picks_own on public.cam_nfl_picks for select to authenticated using (user_id = (select auth.uid()));
create policy cam_football_picks_own on public.cam_football_picks for select to authenticated using (user_id = (select auth.uid()));

-- Copia literal de producción (3 nov 2026).
CREATE OR REPLACE FUNCTION public.cam_nfl_leaderboard(p_scope text, p_season integer, p_week integer DEFAULT NULL::integer, p_month text DEFAULT NULL::text)
 RETURNS TABLE(rank_position bigint, user_id uuid, username text, points bigint, hits bigint, resolved bigint, accuracy numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_scope not in ('week','month','season','all') or p_season not between 2020 and 2100
 or (p_scope='week' and (p_week is null or p_week not between 1 and 22))
 or (p_scope='month' and (p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Periodo inválido'; end if;
 return query
 with totals as (
 select p.user_id,sum(p.awarded_points)::bigint pts,
 count(*) filter(where p.team_id=g.winner_id)::bigint wins,count(*)::bigint total
 from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
 where g.status='final' and g.winner_id is not null and (p_scope='all' or g.season=p_season)
 and (p_scope<>'week' or g.week=p_week)
 and (p_scope<>'month' or to_char(g.kickoff at time zone 'America/New_York','YYYY-MM')=p_month)
 group by p.user_id
 ), ranked as (
 select t.*,round(100.0*t.wins/nullif(t.total,0),1) pct,
 dense_rank() over(order by t.pts desc,t.wins desc,
 (100.0*t.wins/nullif(t.total,0)) desc) pos from totals t
 )
 select r.pos,r.user_id,
 coalesce(nullif(left(a.username,40),''),nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
 r.pts,r.wins,r.total,r.pct
 from ranked r join auth.users u on u.id=r.user_id
 left join public.ae_auth_accounts a on a.user_id=r.user_id
 order by r.pos,r.user_id;
end $function$;

-- Copia literal de producción (3 nov 2026).
CREATE OR REPLACE FUNCTION public.cam_football_leaderboard(p_scope text, p_season integer, p_competition text DEFAULT NULL::text, p_matchday integer DEFAULT NULL::integer, p_month text DEFAULT NULL::text)
 RETURNS TABLE(rank_position bigint, user_id uuid, username text, points bigint, hits bigint, resolved bigint, accuracy numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_scope not in ('matchday','month','season','all') or p_season not between 2020 and 2100
 or (p_competition is not null and p_competition not in ('laliga','premier','ligamx','champions'))
 or (p_scope='matchday' and (p_matchday is null or p_matchday not between 1 and 60 or p_competition is null))
 or (p_scope='month' and (p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Periodo inválido'; end if;
 return query
 with totals as (
 select p.user_id,sum(p.awarded_points)::bigint pts,
 count(*) filter(where p.pick=g.outcome)::bigint wins,count(*)::bigint total
 from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
 where g.status='final' and g.outcome is not null and (p_scope='all' or g.season=p_season)
 and (p_competition is null or g.competition=p_competition)
 and (p_scope<>'matchday' or g.matchday=p_matchday)
 and (p_scope<>'month' or to_char(g.kickoff at time zone 'America/Toronto','YYYY-MM')=p_month)
 group by p.user_id
 ), ranked as (
 select t.*,round(100.0*t.wins/nullif(t.total,0),1) pct,
 dense_rank() over(order by t.pts desc,t.wins desc,
 (100.0*t.wins/nullif(t.total,0)) desc) pos from totals t
 )
 select r.pos,r.user_id,
 coalesce(nullif(left(a.username,40),''),nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
 r.pts,r.wins,r.total,r.pct
 from ranked r join auth.users u on u.id=r.user_id
 left join public.ae_auth_accounts a on a.user_id=r.user_id
 order by r.pos,r.user_id;
end $function$;
