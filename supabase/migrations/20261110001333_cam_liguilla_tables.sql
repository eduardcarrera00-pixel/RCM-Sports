-- CAM SPORTS | Liguilla de la Liga MX en la Quiniela de Fútbol.
-- «Tu liguilla»: cada usuario arma su cuadro (4 semifinalistas, 2 finalistas y
-- campeón) antes del primer saque. Cada acierto paga round(3·log2(1/p)), de 1 a 20,
-- con la probabilidad congelada al abrir. El cuadro solo suma.
-- Ronda a ronda: cada serie (ida + vuelta) añade «¿Quién pasa?» con la regla del
-- 1X2 (round(2/p), de 2 a 12; acertar suma y fallar resta). Cierra en el saque de la ida.
-- Los partidos son los de siempre (cam_football_games, sincronizados de ESPN).

create schema if not exists cam_football_private;
revoke all on schema cam_football_private from public, anon, authenticated;

create table if not exists public.cam_liguilla (
 id bigint generated always as identity primary key,
 competition text not null default 'ligamx' check (competition = 'ligamx'),
 season integer not null check (season between 2020 and 2100),
 name text not null check (length(name) between 3 and 60),
 reseed boolean not null default true,
 starts_at timestamptz not null,
 closes_at timestamptz not null,
 opened_at timestamptz not null default now(),
 opened_by uuid,
 model jsonb not null default '{}'::jsonb,
 check (closes_at <= starts_at),
 unique (competition, season, name)
);
create index if not exists cam_liguilla_season_idx on public.cam_liguilla(competition, season, starts_at);

create table if not exists public.cam_liguilla_seeds (
 liguilla_id bigint not null references public.cam_liguilla(id) on delete cascade,
 seed smallint not null check (seed between 1 and 8),
 team_id text not null references public.cam_football_teams(id),
 played smallint not null check (played between 1 and 40),
 points smallint not null check (points between 0 and 120),
 goal_diff smallint not null check (goal_diff between -99 and 99),
 strength double precision not null,
 primary key (liguilla_id, seed),
 unique (liguilla_id, team_id)
);

-- Probabilidad de llegar a cada ronda y los puntos que paga: congelados al abrir.
create table if not exists public.cam_liguilla_odds (
 liguilla_id bigint not null references public.cam_liguilla(id) on delete cascade,
 team_id text not null references public.cam_football_teams(id),
 stage text not null check (stage in ('semis','final','champion')),
 probability numeric(8,6) not null check (probability > 0 and probability <= 1),
 points smallint not null check (points between 1 and 20),
 primary key (liguilla_id, team_id, stage)
);

create table if not exists public.cam_liguilla_series (
 id bigint generated always as identity primary key,
 liguilla_id bigint not null references public.cam_liguilla(id) on delete cascade,
 round text not null check (round in ('qf','sf','final')),
 slot smallint not null check (slot between 0 and 3),
 high_id text not null references public.cam_football_teams(id),
 low_id text not null references public.cam_football_teams(id),
 leg1_id text references public.cam_football_games(id),
 leg2_id text references public.cam_football_games(id),
 probability_high numeric(8,6) check (probability_high > 0 and probability_high < 1),
 points_high smallint check (points_high between 2 and 12),
 points_low smallint check (points_low between 2 and 12),
 odds_source text,
 odds_locked_at timestamptz,
 status text not null default 'open' check (status in ('open','penalties','decided')),
 winner_id text references public.cam_football_teams(id),
 decided_by text check (decided_by in ('auto','admin')),
 decided_at timestamptz,
 check (high_id <> low_id),
 check ((status = 'decided') = (winner_id is not null)),
 check (winner_id is null or winner_id in (high_id, low_id)),
 check ((odds_locked_at is null) = (points_high is null) and (points_high is null) = (points_low is null)),
 unique (liguilla_id, round, slot),
 unique (leg1_id),
 unique (leg2_id)
);
create index if not exists cam_liguilla_series_liguilla_idx on public.cam_liguilla_series(liguilla_id, round);

create table if not exists public.cam_liguilla_series_picks (
 series_id bigint not null references public.cam_liguilla_series(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 team_id text not null references public.cam_football_teams(id),
 awarded_points smallint not null default 0 check (awarded_points between -12 and 12),
 settled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (series_id, user_id)
);
create index if not exists cam_liguilla_series_picks_user_idx on public.cam_liguilla_series_picks(user_id);

-- El cuadro: una fila por elección (hasta 7 por usuario).
create table if not exists public.cam_liguilla_picks (
 liguilla_id bigint not null references public.cam_liguilla(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 stage text not null check (stage in ('semis','final','champion')),
 slot smallint not null check (slot between 0 and 3),
 team_id text not null references public.cam_football_teams(id),
 points smallint not null check (points between 1 and 20),
 awarded_points smallint not null default 0 check (awarded_points between 0 and 20),
 settled_at timestamptz,
 decided_game_id text references public.cam_football_games(id),
 updated_at timestamptz not null default now(),
 primary key (liguilla_id, user_id, stage, slot),
 unique (liguilla_id, user_id, stage, team_id)
);
create index if not exists cam_liguilla_picks_user_idx on public.cam_liguilla_picks(user_id);

alter table public.cam_liguilla enable row level security;
alter table public.cam_liguilla_seeds enable row level security;
alter table public.cam_liguilla_odds enable row level security;
alter table public.cam_liguilla_series enable row level security;
alter table public.cam_liguilla_series_picks enable row level security;
alter table public.cam_liguilla_picks enable row level security;
revoke all on public.cam_liguilla, public.cam_liguilla_seeds, public.cam_liguilla_odds,
 public.cam_liguilla_series, public.cam_liguilla_series_picks, public.cam_liguilla_picks
 from public, anon, authenticated;
grant select on public.cam_liguilla, public.cam_liguilla_seeds, public.cam_liguilla_odds,
 public.cam_liguilla_series to anon, authenticated;
grant select on public.cam_liguilla_series_picks, public.cam_liguilla_picks to authenticated;
create policy cam_liguilla_read on public.cam_liguilla for select to anon, authenticated using (true);
create policy cam_liguilla_seeds_read on public.cam_liguilla_seeds for select to anon, authenticated using (true);
create policy cam_liguilla_odds_read on public.cam_liguilla_odds for select to anon, authenticated using (true);
create policy cam_liguilla_series_read on public.cam_liguilla_series for select to anon, authenticated using (true);
create policy cam_liguilla_series_picks_own on public.cam_liguilla_series_picks for select to authenticated
 using (user_id = (select auth.uid()));
create policy cam_liguilla_picks_own on public.cam_liguilla_picks for select to authenticated
 using (user_id = (select auth.uid()));
-- Sin políticas de escritura: todo pasa por RPC con la hora del servidor.
notify pgrst, 'reload schema';
