-- CAM SPORTS · NFL «La semana» (4 nov 2026)
-- 1. El laurel: un partido por jornada vale el doble si aciertas (0 si fallas).
-- 2. ¿Le ganas al editor?: las elecciones del panel editorial son públicas.
-- 3. Lo que eligió la comunidad: reparto de elecciones, solo con el partido empezado.
-- 4. Power Rankings: la edición anterior real (la última que estuvo publicada 12 h o más).
-- Todas las clasificaciones suman awarded_points, así que el doble llega solo
-- a la quiniela, al perfil y a las parties.

-- ---------- 1. El laurel ----------
create table if not exists public.cam_nfl_laurels (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  game_id text not null references public.cam_nfl_games(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, season, week)
);
create index if not exists cam_nfl_laurels_game on public.cam_nfl_laurels (game_id);
alter table public.cam_nfl_laurels enable row level security;
drop policy if exists cam_nfl_laurels_own on public.cam_nfl_laurels;
create policy cam_nfl_laurels_own on public.cam_nfl_laurels for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.cam_nfl_laurels from anon, authenticated;

create or replace function public.cam_nfl_set_laurel(p_game_id text)
returns boolean
language plpgsql security definer set search_path to ''
as $$
declare me uuid := auth.uid(); game public.cam_nfl_games%rowtype; current_game public.cam_nfl_games%rowtype;
begin
  if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
  select * into game from public.cam_nfl_games where id = p_game_id;
  if not found or game.status <> 'scheduled' or not game.picks_open or game.kickoff <= statement_timestamp()
     or game.odds_locked_at is null then raise exception 'El partido está bloqueado o no disponible'; end if;
  if not exists (select 1 from public.cam_nfl_picks where game_id = game.id and user_id = me) then
    raise exception 'Guarda tu pronóstico de este partido antes de ponerle el laurel';
  end if;
  -- Un laurel en un partido ya empezado no se mueve.
  select g.* into current_game from public.cam_nfl_laurels l join public.cam_nfl_games g on g.id = l.game_id
   where l.user_id = me and l.season = game.season and l.week = game.week;
  if found and current_game.id <> game.id
     and (current_game.kickoff <= statement_timestamp() or current_game.status <> 'scheduled') then
    raise exception 'Tu laurel de esta jornada ya está en juego';
  end if;
  insert into public.cam_nfl_laurels(user_id, season, week, game_id) values (me, game.season, game.week, game.id)
  on conflict (user_id, season, week) do update set game_id = excluded.game_id, updated_at = now();
  return true;
end $$;

create or replace function public.cam_nfl_clear_laurel(p_season integer, p_week integer)
returns boolean
language plpgsql security definer set search_path to ''
as $$
declare me uuid := auth.uid(); current_game public.cam_nfl_games%rowtype;
begin
  if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
  select g.* into current_game from public.cam_nfl_laurels l join public.cam_nfl_games g on g.id = l.game_id
   where l.user_id = me and l.season = p_season and l.week = p_week;
  if not found then return false; end if;
  if current_game.kickoff <= statement_timestamp() or current_game.status <> 'scheduled' then
    raise exception 'Tu laurel de esta jornada ya está en juego';
  end if;
  delete from public.cam_nfl_laurels where user_id = me and season = p_season and week = p_week;
  return true;
end $$;

-- La liquidación multiplica por dos el partido del laurel (también al corregir un resultado).
create or replace function public.cam_nfl_settlement_trigger()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
begin
 if (new.status,new.home_score,new.away_score,new.winner_id)
    is not distinct from (old.status,old.home_score,old.away_score,old.winner_id) then return new; end if;
 update public.cam_nfl_picks p
 set awarded_points=case when new.status='final' and new.winner_id is not null and p.team_id=new.winner_id
        then (case when p.team_id=new.home_id then new.points_home else new.points_away end)
             * (case when exists (select 1 from public.cam_nfl_laurels l
                                   where l.user_id=p.user_id and l.game_id=new.id) then 2 else 1 end)
        else 0 end,
     settled_at=case when new.status in ('final','tie','cancelled') then now() else null end
 where p.game_id=new.id;
 insert into public.cam_nfl_audit(game_id,action,actor_id,detail)
 values(new.id,'result_changed',auth.uid(),jsonb_build_object(
 'old_status',old.status,'new_status',new.status,'old_winner',old.winner_id,'new_winner',new.winner_id,
 'old_home_score',old.home_score,'new_home_score',new.home_score,'old_away_score',old.away_score,'new_away_score',new.away_score));
 return new;
end $function$;

-- ---------- 2. ¿Le ganas al editor? ----------
create table if not exists public.cam_nfl_expert_panel (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null default 'Editor',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.cam_nfl_expert_panel enable row level security;
revoke all on public.cam_nfl_expert_panel from anon, authenticated;

insert into public.cam_nfl_expert_panel(user_id, label, sort_order)
select a.user_id, 'Editor', 0 from public.ae_auth_accounts a
 where lower(a.username) = 'adrianmendozac27'
on conflict (user_id) do nothing;

-- Elecciones del panel para una jornada. Son públicas a propósito: el reto es verlas antes.
create or replace function public.cam_nfl_expert_picks(p_season integer, p_week integer)
returns table(user_id uuid, username text, game_id text, team_id text, awarded_points integer, settled boolean, laurel boolean)
language sql stable security definer set search_path to ''
as $$
  select e.user_id,
         coalesce(nullif(left(a.username,40),''),'Editor')::text,
         p.game_id, p.team_id, p.awarded_points, p.settled_at is not null,
         exists (select 1 from public.cam_nfl_laurels l where l.user_id = e.user_id and l.game_id = p.game_id)
    from public.cam_nfl_expert_panel e
    join public.cam_nfl_picks p on p.user_id = e.user_id
    join public.cam_nfl_games g on g.id = p.game_id
    left join public.ae_auth_accounts a on a.user_id = e.user_id
   where g.season = p_season and g.week = p_week
   order by e.sort_order, g.kickoff
   limit 200;
$$;

-- Tú contra el editor en la jornada (solo partidos resueltos).
create or replace function public.cam_nfl_expert_duel(p_season integer, p_week integer)
returns table(expert_id uuid, expert_name text, expert_points bigint, expert_hits bigint,
              my_points bigint, my_hits bigint, my_picks bigint, resolved bigint)
language sql stable security definer set search_path to ''
as $$
  with expert as (
    select e.user_id, coalesce(nullif(left(a.username,40),''),'Editor')::text as name
      from public.cam_nfl_expert_panel e left join public.ae_auth_accounts a on a.user_id = e.user_id
     order by e.sort_order limit 1
  ), done as (
    select g.id, g.winner_id from public.cam_nfl_games g
     where g.season = p_season and g.week = p_week and g.status in ('final','tie','cancelled')
  )
  select x.user_id, x.name,
         coalesce((select sum(p.awarded_points) from public.cam_nfl_picks p join done d on d.id = p.game_id
                    where p.user_id = x.user_id and p.settled_at is not null),0)::bigint,
         coalesce((select count(*) from public.cam_nfl_picks p join done d on d.id = p.game_id
                    where p.user_id = x.user_id and p.team_id = d.winner_id),0)::bigint,
         coalesce((select sum(p.awarded_points) from public.cam_nfl_picks p join done d on d.id = p.game_id
                    where p.user_id = auth.uid() and p.settled_at is not null),0)::bigint,
         coalesce((select count(*) from public.cam_nfl_picks p join done d on d.id = p.game_id
                    where p.user_id = auth.uid() and p.team_id = d.winner_id),0)::bigint,
         coalesce((select count(*) from public.cam_nfl_picks p join public.cam_nfl_games g on g.id = p.game_id
                    where p.user_id = auth.uid() and g.season = p_season and g.week = p_week),0)::bigint,
         (select count(*) from done)::bigint
    from expert x;
$$;

-- ---------- 3. Lo que eligió la comunidad ----------
-- Solo partidos empezados (las elecciones ya no cambian) y con 5 o más elecciones.
create or replace function public.cam_nfl_pick_split(p_season integer, p_week integer)
returns table(game_id text, home_picks bigint, away_picks bigint, total bigint)
language sql stable security definer set search_path to ''
as $$
  select g.id,
         count(*) filter (where p.team_id = g.home_id),
         count(*) filter (where p.team_id = g.away_id),
         count(*)
    from public.cam_nfl_games g
    join public.cam_nfl_picks p on p.game_id = g.id
   where g.season = p_season and g.week = p_week
     and (g.kickoff <= statement_timestamp() or g.status <> 'scheduled')
   group by g.id
  having count(*) >= 5;
$$;

-- ---------- 4. Power Rankings: la edición anterior real ----------
-- Las correcciones del mismo día no cuentan como edición: se compara con la última
-- versión que estuvo publicada al menos 12 horas y que no es igual a la actual.
create or replace function public.cam_nfl_ranking_previous()
returns table(team_ids text[], edition text, published_until timestamptz)
language sql stable security definer set search_path to ''
as $$
  with versions as (
    select h.team_ids, h.edition, h.superseded_at,
           lag(h.superseded_at) over (order by h.superseded_at, h.id) as published_from
      from public.nfl_ranking_history h
  )
  select v.team_ids::text[], v.edition, v.superseded_at
    from versions v
   where coalesce(array_length(v.team_ids,1),0) = 10
     and (v.published_from is null or v.superseded_at - v.published_from >= interval '12 hours')
     and v.team_ids::text[] is distinct from (select r.team_ids::text[] from public.nfl_rankings r where r.id = 1)
   order by v.superseded_at desc
   limit 1;
$$;

revoke all on function public.cam_nfl_set_laurel(text) from public, anon;
revoke all on function public.cam_nfl_clear_laurel(integer, integer) from public, anon;
grant execute on function public.cam_nfl_set_laurel(text) to authenticated;
grant execute on function public.cam_nfl_clear_laurel(integer, integer) to authenticated;
grant execute on function public.cam_nfl_expert_picks(integer, integer) to anon, authenticated;
grant execute on function public.cam_nfl_expert_duel(integer, integer) to anon, authenticated;
grant execute on function public.cam_nfl_pick_split(integer, integer) to anon, authenticated;
grant execute on function public.cam_nfl_ranking_previous() to anon, authenticated;
