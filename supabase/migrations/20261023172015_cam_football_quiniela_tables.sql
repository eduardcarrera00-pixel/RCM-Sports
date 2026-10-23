-- CAM SPORTS | Quiniela de fútbol: LaLiga, Premier, Liga MX y Champions.
-- Mismo libro de cuentas aislado que la quiniela NFL, pero a tres resultados (1X2).
-- Los partidos solo se abren con probabilidades reales congeladas antes del saque.

create table if not exists public.cam_football_teams (
 id text primary key check (id ~ '^[0-9]{1,12}$'),
 name text not null,
 short_name text not null,
 abbreviation text not null,
 logo text,
 updated_at timestamptz not null default now()
);

create table if not exists public.cam_football_games (
 id text primary key check (id ~ '^[0-9]{6,16}$'),
 competition text not null check (competition in ('laliga','premier','ligamx','champions')),
 season integer not null check (season between 2020 and 2100),
 matchday integer not null check (matchday between 1 and 60),
 home_id text not null references public.cam_football_teams(id),
 away_id text not null references public.cam_football_teams(id),
 kickoff timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','live','final','postponed','cancelled')),
 home_score integer check(home_score >= 0),
 away_score integer check(away_score >= 0),
 outcome text check(outcome in ('home','draw','away')),
 odds_home integer,
 odds_draw integer,
 odds_away integer,
 probability_home numeric(8,6),
 probability_draw numeric(8,6),
 probability_away numeric(8,6),
 points_home integer check(points_home between 2 and 12),
 points_draw integer check(points_draw between 2 and 12),
 points_away integer check(points_away between 2 and 12),
 odds_source text,
 odds_locked_at timestamptz,
 picks_open boolean not null default false,
 opening_mode text not null default 'auto' check(opening_mode in ('auto','open','closed')),
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 check(home_id <> away_id),
 -- O no hay mercado congelado, o está completo y suma uno: nunca a medias.
 check((probability_home is null and probability_draw is null and probability_away is null
        and points_home is null and points_draw is null and points_away is null and odds_locked_at is null)
    or (probability_home > 0 and probability_draw > 0 and probability_away > 0
        and abs(probability_home + probability_draw + probability_away - 1) < 0.00001
        and points_home is not null and points_draw is not null and points_away is not null
        and odds_locked_at is not null))
);
create index if not exists cam_football_games_round_idx
 on public.cam_football_games(competition,season,matchday,kickoff);

create table if not exists public.cam_football_picks (
 game_id text not null references public.cam_football_games(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 pick text not null check(pick in ('home','draw','away')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 awarded_points integer not null default 0 check(awarded_points between 0 and 12),
 settled_at timestamptz,
 primary key(game_id,user_id)
);
create index if not exists cam_football_picks_user_idx on public.cam_football_picks(user_id,game_id);

create table if not exists public.cam_football_audit(
 id bigint generated always as identity primary key,
 game_id text references public.cam_football_games(id),
 action text not null,
 actor_id uuid,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists cam_football_audit_game_idx on public.cam_football_audit(game_id,created_at desc);

alter table public.cam_football_teams enable row level security;
alter table public.cam_football_games enable row level security;
alter table public.cam_football_picks enable row level security;
alter table public.cam_football_audit enable row level security;
revoke all on public.cam_football_teams,public.cam_football_games,public.cam_football_picks,public.cam_football_audit
 from public,anon,authenticated;
grant select on public.cam_football_teams,public.cam_football_games to anon,authenticated;
grant select on public.cam_football_picks to authenticated;
create policy cam_football_teams_read on public.cam_football_teams for select to anon,authenticated using(true);
create policy cam_football_games_read on public.cam_football_games for select to anon,authenticated using(true);
create policy cam_football_picks_own on public.cam_football_picks for select to authenticated using(user_id=(select auth.uid()));
-- Sin políticas de escritura para clientes: todo pasa por RPC con servidor de por medio.
notify pgrst,'reload schema';
