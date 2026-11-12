-- Quiniela NFL y Fútbol (12 nov 2026, decisión de Eduard):
--   * Cada acierto vale 2 puntos; fallar vale 0 (ya no se resta nada).
--   * El laurel NFL sigue duplicando el acierto (2 → 4).
--   * Un partido bonus automático por semana NFL y por jornada de cada
--     competición de fútbol: el más parejo según las probabilidades congeladas.
--     Si aciertas y tu opción fue la menos elegida (o fuiste el único que
--     acertó), +5. Si gana lo más elegido o todos eligieron lo mismo, sin bonus.
--   * Toda la temporada se recalcula con 2 por acierto (sin bonus retroactivo).
-- El reparto de elecciones ya se publica solo después del inicio de cada partido.

-- 1) Copia privada del sistema anterior (no expuesta en la API).
create schema if not exists cam_backup;
revoke all on schema cam_backup from public, anon, authenticated;

create table if not exists cam_backup.quiniela_picks_20261112 as
select 'nfl'::text as sport, p.game_id, p.user_id, p.team_id as pick, p.awarded_points, p.settled_at
  from public.cam_nfl_picks p
union all
select 'futbol', p.game_id, p.user_id, p.pick, p.awarded_points, p.settled_at
  from public.cam_football_picks p;

create table if not exists cam_backup.quiniela_games_20261112 as
select 'nfl'::text as sport, g.id as game_id, g.points_home, null::integer as points_draw, g.points_away,
       g.odds_source, false as points_manual
  from public.cam_nfl_games g
union all
select 'futbol', g.id, g.points_home, g.points_draw, g.points_away, g.odds_source, g.points_manual
  from public.cam_football_games g;

-- 2) Marca del partido bonus: como mucho uno por semana NFL / jornada de competición.
alter table public.cam_nfl_games add column if not exists is_bonus boolean not null default false;
alter table public.cam_football_games add column if not exists is_bonus boolean not null default false;
create unique index if not exists cam_nfl_games_one_bonus
  on public.cam_nfl_games(season, week) where is_bonus;
create unique index if not exists cam_football_games_one_bonus
  on public.cam_football_games(competition, season, matchday) where is_bonus;

-- 3) Puntos publicados fijos: cualquier escritor (sincronización, RPC, panel)
--    termina guardando 2. Se ejecuta antes que cam_football_keep_points (orden alfabético).
create or replace function public.cam_nfl_fixed_points()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.points_home is not null then new.points_home := 2; end if;
  if new.points_away is not null then new.points_away := 2; end if;
  return new;
end $$;
create or replace function public.cam_football_fixed_points()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.points_home is not null then new.points_home := 2; end if;
  if new.points_draw is not null then new.points_draw := 2; end if;
  if new.points_away is not null then new.points_away := 2; end if;
  return new;
end $$;
revoke all on function public.cam_nfl_fixed_points() from public, anon, authenticated;
revoke all on function public.cam_football_fixed_points() from public, anon, authenticated;

-- Los partidos sin cuotas («automatic_equal_v1») valían 6/6/6; ahora 2/2/2.
alter table public.cam_football_games drop constraint cam_football_scoring_complete;
alter table public.cam_football_games add constraint cam_football_scoring_complete check (
  ((odds_locked_at is null) and (not picks_open) and probability_home is null and probability_draw is null
    and probability_away is null and points_home is null and points_draw is null and points_away is null)
  or ((odds_locked_at is not null) and points_home is not null and points_draw is not null and points_away is not null
    and ((probability_home is not null and probability_draw is not null and probability_away is not null
          and probability_home > 0 and probability_draw > 0 and probability_away > 0
          and abs(probability_home + probability_draw + probability_away - 1) < 0.00001)
      or (odds_source is not null and odds_source = 'automatic_equal_v1'
          and odds_home is null and odds_draw is null and odds_away is null
          and probability_home is null and probability_draw is null and probability_away is null
          and (points_manual or (points_home = points_draw and points_draw = points_away))))));

-- Normalizar los puntos ya publicados (la protección de puntos congelados se
-- suspende solo durante esta actualización).
alter table public.cam_football_games disable trigger cam_football_keep_points;
update public.cam_football_games set
  points_home = case when points_home is null then null else 2 end,
  points_draw = case when points_draw is null then null else 2 end,
  points_away = case when points_away is null then null else 2 end
where points_home is distinct from 2 and points_home is not null
   or points_draw is distinct from 2 and points_draw is not null
   or points_away is distinct from 2 and points_away is not null;
alter table public.cam_football_games enable trigger cam_football_keep_points;
update public.cam_nfl_games set
  points_home = case when points_home is null then null else 2 end,
  points_away = case when points_away is null then null else 2 end
where points_home is distinct from 2 and points_home is not null
   or points_away is distinct from 2 and points_away is not null;

create trigger cam_nfl_fixed_points before insert or update on public.cam_nfl_games
  for each row execute function public.cam_nfl_fixed_points();
create trigger cam_football_fixed_points before insert or update on public.cam_football_games
  for each row execute function public.cam_football_fixed_points();

-- El ajuste manual de puntos por partido deja de tener sentido.
create or replace function public.cam_football_admin_points(p_game_id text, p_home integer, p_draw integer, p_away integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
  raise exception 'Los puntos de la quiniela son fijos: 2 por acierto (+5 en el partido bonus)';
end $$;

-- 4) Regla del bonus. p_winner = elecciones de la opción ganadora; p_counts =
--    elecciones de cada opción. Hay bonus si el ganador fue el único acierto
--    (con al menos dos participantes) o si su opción fue la menos elegida entre
--    las que alguien eligió sin empatar con la más elegida.
create or replace function public.cam_quiniela_bonus_applies(p_winner integer, p_counts integer[])
returns boolean language sql immutable set search_path='' as $$
  select coalesce(coalesce(p_winner, 0) >= 1 and (
    (p_winner = 1 and (select coalesce(sum(c), 0) from unnest(p_counts) c) >= 2)
    or (p_winner = (select min(c) from unnest(p_counts) c where c > 0)
        and p_winner < (select max(c) from unnest(p_counts) c))), false);
$$;

-- 5) Liquidación: acierto 2 (laurel NFL x2), fallo 0, bonus +5.
create or replace function public.cam_nfl_settlement_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_home integer := 0; v_away integer := 0; v_bonus boolean := false;
begin
  if (new.status,new.home_score,new.away_score,new.winner_id)
     is not distinct from (old.status,old.home_score,old.away_score,old.winner_id) then return new; end if;
  if new.is_bonus and new.status='final' and new.winner_id is not null then
    select count(*) filter (where p.team_id=new.home_id), count(*) filter (where p.team_id=new.away_id)
      into v_home, v_away from public.cam_nfl_picks p where p.game_id=new.id;
    v_bonus := public.cam_quiniela_bonus_applies(
      case when new.winner_id=new.home_id then v_home else v_away end, array[v_home, v_away]);
  end if;
  update public.cam_nfl_picks p
  set awarded_points=case when new.status='final' and new.winner_id is not null and p.team_id=new.winner_id then
        2 * case when exists(select 1 from public.cam_nfl_laurels l where l.user_id=p.user_id and l.game_id=new.id)
                 then 2 else 1 end
        + case when v_bonus then 5 else 0 end
        else 0 end,
      settled_at=case when (new.status='final' and new.winner_id is not null) or new.status in ('tie','cancelled') then now() else null end
  where p.game_id=new.id;
  insert into public.cam_nfl_audit(game_id,action,actor_id,detail)
  values(new.id,'result_changed',auth.uid(),jsonb_build_object(
  'old_status',old.status,'new_status',new.status,'old_winner',old.winner_id,'new_winner',new.winner_id,
  'old_home_score',old.home_score,'new_home_score',new.home_score,'old_away_score',old.away_score,'new_away_score',new.away_score,
  'is_bonus',new.is_bonus,'bonus_paid',v_bonus,'picks_home',v_home,'picks_away',v_away));
  return new;
end $$;
revoke all on function public.cam_nfl_settlement_trigger() from public,anon,authenticated;

create or replace function public.cam_football_settlement_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_home integer := 0; v_draw integer := 0; v_away integer := 0; v_bonus boolean := false;
begin
  if (new.status,new.home_score,new.away_score,new.outcome)
     is not distinct from (old.status,old.home_score,old.away_score,old.outcome) then return new; end if;
  if new.is_bonus and new.status='final' and new.outcome is not null then
    select count(*) filter (where p.pick='home'), count(*) filter (where p.pick='draw'), count(*) filter (where p.pick='away')
      into v_home, v_draw, v_away from public.cam_football_picks p where p.game_id=new.id;
    v_bonus := public.cam_quiniela_bonus_applies(
      case new.outcome when 'home' then v_home when 'draw' then v_draw else v_away end,
      array[v_home, v_draw, v_away]);
  end if;
  update public.cam_football_picks p
  set awarded_points=case when new.status='final' and new.outcome is not null and p.pick=new.outcome
        then 2 + case when v_bonus then 5 else 0 end else 0 end,
      settled_at=case when (new.status='final' and new.outcome is not null) or new.status='cancelled' then now() else null end
  where p.game_id=new.id;
  insert into public.cam_football_audit(game_id,action,actor_id,detail)
  values(new.id,'result_changed',auth.uid(),jsonb_build_object(
  'old_status',old.status,'new_status',new.status,'old_outcome',old.outcome,'new_outcome',new.outcome,
  'old_home_score',old.home_score,'new_home_score',new.home_score,'old_away_score',old.away_score,'new_away_score',new.away_score,
  'is_bonus',new.is_bonus,'bonus_paid',v_bonus,'picks_home',v_home,'picks_draw',v_draw,'picks_away',v_away));
  return new;
end $$;
revoke all on function public.cam_football_settlement_trigger() from public,anon,authenticated;

-- 6) Elección automática del partido bonus. Candidatos: partidos ya abiertos
--    (con puntos congelados) que empiezan en más de 30 min. Gana el más parejo
--    entre local y visitante; los que tienen cuotas van antes que los que no.
--    Una vez que alguien eligió el partido bonus (o empezó), ya no se mueve.
create or replace function public.cam_quiniela_assign_bonus()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; v_current text; v_locked boolean; v_best text; v_changes integer := 0;
begin
  for r in select distinct g.season, g.week from public.cam_nfl_games g
           where g.status='scheduled' and g.kickoff > clock_timestamp() loop
    select g.id,
           exists(select 1 from public.cam_nfl_picks p where p.game_id=g.id)
           or g.status in ('live','final','tie')
           or (g.status='scheduled' and g.kickoff <= clock_timestamp() + interval '30 minutes')
      into v_current, v_locked
      from public.cam_nfl_games g where g.season=r.season and g.week=r.week and g.is_bonus;
    if v_current is not null and v_locked then continue; end if;
    select g.id into v_best from public.cam_nfl_games g
     where g.season=r.season and g.week=r.week and g.status='scheduled'
       and g.kickoff > clock_timestamp() + interval '30 minutes' and g.odds_locked_at is not null
     order by (g.probability_home is null),
              abs(coalesce(g.probability_home,0.5) - coalesce(g.probability_away,0.5)),
              g.kickoff desc, g.id
     limit 1;
    if v_best is null or v_best is not distinct from v_current then continue; end if;
    update public.cam_nfl_games set is_bonus=false where season=r.season and week=r.week and is_bonus;
    update public.cam_nfl_games set is_bonus=true where id=v_best;
    insert into public.cam_nfl_audit(game_id,action,detail)
    values(v_best,'bonus_assigned',jsonb_build_object('previous',v_current));
    v_changes := v_changes + 1;
  end loop;

  for r in select distinct g.competition, g.season, g.matchday from public.cam_football_games g
           where g.status='scheduled' and g.kickoff > clock_timestamp() loop
    select g.id,
           exists(select 1 from public.cam_football_picks p where p.game_id=g.id)
           or g.status in ('live','final')
           or (g.status='scheduled' and g.kickoff <= clock_timestamp() + interval '30 minutes')
      into v_current, v_locked
      from public.cam_football_games g
     where g.competition=r.competition and g.season=r.season and g.matchday=r.matchday and g.is_bonus;
    if v_current is not null and v_locked then continue; end if;
    select g.id into v_best from public.cam_football_games g
     where g.competition=r.competition and g.season=r.season and g.matchday=r.matchday
       and g.status='scheduled' and g.kickoff > clock_timestamp() + interval '30 minutes'
       and g.odds_locked_at is not null
     order by (g.probability_home is null),
              abs(coalesce(g.probability_home,0.5) - coalesce(g.probability_away,0.5)),
              g.kickoff desc, g.id
     limit 1;
    if v_best is null or v_best is not distinct from v_current then continue; end if;
    update public.cam_football_games set is_bonus=false
     where competition=r.competition and season=r.season and matchday=r.matchday and is_bonus;
    update public.cam_football_games set is_bonus=true where id=v_best;
    insert into public.cam_football_audit(game_id,action,detail)
    values(v_best,'bonus_assigned',jsonb_build_object('previous',v_current));
    v_changes := v_changes + 1;
  end loop;
  return v_changes;
end $$;
revoke all on function public.cam_quiniela_assign_bonus() from public, anon, authenticated;

select cron.schedule('cam-quiniela-bonus', '2-59/10 * * * *', 'select public.cam_quiniela_assign_bonus()');

-- 7) Recalcular la temporada: 2 por acierto (laurel x2), 0 por fallo, empate
--    NFL y anulados 0. No hay bonus retroactivo: no había partido bonus.
update public.cam_nfl_picks p
set awarded_points = case when g.status='final' and g.winner_id is not null and p.team_id=g.winner_id then
      2 * case when exists(select 1 from public.cam_nfl_laurels l where l.user_id=p.user_id and l.game_id=g.id)
               then 2 else 1 end
      else 0 end
from public.cam_nfl_games g
where g.id=p.game_id and g.status in ('final','tie','cancelled');

update public.cam_football_picks p
set awarded_points = case when g.status='final' and g.outcome is not null and p.pick=g.outcome then 2 else 0 end
from public.cam_football_games g
where g.id=p.game_id and g.status in ('final','cancelled');

select public.cam_quiniela_assign_bonus();
select cam_competitive.tick();
