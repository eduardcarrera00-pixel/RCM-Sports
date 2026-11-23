-- La Liguilla se abre sin poner la hora (23 nov 2026).
-- 1) cam_liguilla_admin_open acepta p_starts_at nulo: toma el primer saque de cuartos ya publicado
--    (ida en casa del peor sembrado) o, si ESPN aún no lo publicó, un cierre provisional a 48 h.
-- 2) El cierre del cuadro sigue al primer saque real de cuartos mientras el cuadro siga abierto
--    (antes o después del provisional); una vez cerrado nunca se reabre.
-- 3) Los partidos se enlazan desde la apertura, aunque el saque real sea más de 2 h antes del previsto.

create or replace function public.cam_liguilla_admin_open(p_season integer, p_name text, p_starts_at timestamp with time zone, p_teams jsonb, p_reseed boolean DEFAULT true)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare old_id bigint; new_id bigint; i integer; item jsonb; g public.cam_football_games%rowtype;
 sh double precision; sl double precision; d double precision; m double precision; market jsonb := '[]'::jsonb; sr record;
 v_start timestamptz := p_starts_at; v_close text := 'manual';
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_starts_at is not null and p_starts_at <= statement_timestamp() then raise exception 'La liguilla tiene que empezar en el futuro'; end if;
 if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) <> 8 then raise exception 'Hacen falta los 8 clasificados en orden'; end if;
 if (select count(distinct x->>'team_id') from jsonb_array_elements(p_teams) x) <> 8 then raise exception 'Hay un equipo repetido'; end if;
 if exists (select 1 from jsonb_array_elements(p_teams) x where not exists (select 1 from public.cam_football_teams t where t.id = x->>'team_id')) then
   raise exception 'Equipo desconocido'; end if;
 -- Sin hora: el primer saque de cuartos que ya publicó ESPN; si no hay, provisional a 48 h
 -- (el cierre se corrige solo en cuanto llegan los partidos).
 if v_start is null then
   select min(x.kickoff) into v_start
   from public.cam_football_games x cross join generate_series(1, 4) k
   where x.competition = 'ligamx' and x.season = p_season and x.kickoff > statement_timestamp()
     and x.status <> 'cancelled'
     and x.home_id = (p_teams->(8 - k))->>'team_id' and x.away_id = (p_teams->(k - 1))->>'team_id';
   v_close := case when v_start is null then 'provisional' else 'espn' end;
   v_start := coalesce(v_start, date_trunc('minute', statement_timestamp()) + interval '48 hours');
 end if;
 select id into old_id from public.cam_liguilla where competition = 'ligamx' and season = p_season and name = trim(p_name);
 if old_id is not null then
   if exists (select 1 from public.cam_liguilla_picks where liguilla_id = old_id)
      or exists (select 1 from public.cam_liguilla_series s join public.cam_liguilla_series_picks p on p.series_id = s.id where s.liguilla_id = old_id) then
     raise exception 'Ya hay cuadros guardados: no se puede rehacer la apertura'; end if;
   delete from public.cam_liguilla where id = old_id;
 end if;
 insert into public.cam_liguilla(competition, season, name, reseed, starts_at, closes_at, opened_by)
 values ('ligamx', p_season, trim(p_name), coalesce(p_reseed, true), v_start, v_start, auth.uid())
 returning id into new_id;
 for i in 1..8 loop
   item := p_teams->(i - 1);
   insert into public.cam_liguilla_seeds(liguilla_id, seed, team_id, played, points, goal_diff, strength)
   values (new_id, i, item->>'team_id', (item->>'played')::integer, (item->>'points')::integer, (item->>'goal_diff')::integer,
     cam_football_private.table_strength((item->>'played')::integer, (item->>'points')::integer, (item->>'goal_diff')::integer));
 end loop;
 -- Donde ya hay cuotas de la ida de cuartos, mandan las cuotas.
 for i in 1..4 loop
   select * into g from public.cam_football_games x
   where x.competition = 'ligamx' and x.season = p_season and x.kickoff > statement_timestamp()
     and x.home_id = (p_teams->(8 - i))->>'team_id' and x.away_id = (p_teams->(i - 1))->>'team_id'
     and x.probability_home is not null and x.odds_source is distinct from 'automatic_equal_v1'
   order by x.kickoff limit 1;
   if found then
     select strength into sh from public.cam_liguilla_seeds where liguilla_id = new_id and seed = i;
     select strength into sl from public.cam_liguilla_seeds where liguilla_id = new_id and seed = 9 - i;
     d := cam_football_private.market_gap(g.probability_home::double precision, g.probability_away::double precision);
     m := (sh + sl) / 2;
     update public.cam_liguilla_seeds set strength = m + d / 2 where liguilla_id = new_id and seed = i;
     update public.cam_liguilla_seeds set strength = m - d / 2 where liguilla_id = new_id and seed = 9 - i;
     market := market || jsonb_build_object('game', g.id, 'source', g.odds_source);
   end if;
 end loop;
 perform cam_football_private.compute_odds(new_id);
 for i in 1..4 loop
   insert into public.cam_liguilla_series(liguilla_id, round, slot, high_id, low_id)
   values (new_id, 'qf', i - 1, (p_teams->(i - 1))->>'team_id', (p_teams->(8 - i))->>'team_id');
 end loop;
 update public.cam_liguilla set model = jsonb_build_object('version', 'poisson_v1', 'goals', 1.3, 'home', 0.22,
   'strength', '0.55·(pts/pj − 1.45) + 0.30·(dg/pj)', 'market', market, 'close', v_close) where id = new_id;
 perform cam_football_private.refresh(new_id);
 perform cam_football_private.audit(new_id, 'liguilla_open', jsonb_build_object('teams', p_teams, 'starts_at', v_start,
   'close', v_close, 'reseed', p_reseed, 'market', market));
 return new_id;
end $function$;

create or replace function cam_football_private.link_games(p_liguilla bigint)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare l public.cam_liguilla%rowtype; n1 integer; n2 integer; lo timestamptz;
begin
 select * into l from public.cam_liguilla where id = p_liguilla;
 -- Desde la apertura (o 2 h antes del saque previsto, si eso es antes).
 lo := least(l.starts_at - interval '2 hours', coalesce(l.opened_at, l.starts_at));
 update public.cam_liguilla_series s set leg1_id = (
   select g.id from public.cam_football_games g
   where g.competition = l.competition and g.season = l.season
     and g.kickoff >= lo and g.kickoff < l.starts_at + interval '45 days'
     and g.home_id = s.low_id and g.away_id = s.high_id and g.status <> 'cancelled'
     and not exists (select 1 from public.cam_liguilla_series o where o.leg1_id = g.id or o.leg2_id = g.id)
   order by g.kickoff limit 1)
 where s.liguilla_id = p_liguilla and s.leg1_id is null;
 get diagnostics n1 = row_count;
 update public.cam_liguilla_series s set leg2_id = (
   select g.id from public.cam_football_games g
   where g.competition = l.competition and g.season = l.season
     and g.kickoff >= lo and g.kickoff < l.starts_at + interval '45 days'
     and g.home_id = s.high_id and g.away_id = s.low_id and g.status <> 'cancelled'
     and not exists (select 1 from public.cam_liguilla_series o where o.leg1_id = g.id or o.leg2_id = g.id)
   order by g.kickoff limit 1)
 where s.liguilla_id = p_liguilla and s.leg2_id is null;
 get diagnostics n2 = row_count;
 return n1 + n2;
end $function$;

create or replace function cam_football_private.on_game()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l_id bigint;
begin
 if new.competition <> 'ligamx' then return new; end if;
 select l.id into l_id from public.cam_liguilla l
 where l.competition = new.competition and l.season = new.season
   and new.kickoff >= least(l.starts_at - interval '2 hours', coalesce(l.opened_at, l.starts_at))
   and new.kickoff < l.starts_at + interval '45 days'
 order by l.starts_at desc limit 1;
 if l_id is null then return new; end if;
 if tg_op = 'UPDATE' and (new.home_id, new.away_id, new.kickoff, new.status, new.home_score, new.away_score,
     new.probability_home, new.odds_source) is not distinct from (old.home_id, old.away_id, old.kickoff, old.status,
     old.home_score, old.away_score, old.probability_home, old.odds_source) then return new; end if;
 perform cam_football_private.refresh(l_id);
 return new;
end $$;
revoke all on function cam_football_private.on_game() from public, anon, authenticated;

create or replace function cam_football_private.refresh(p_liguilla bigint)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare sr public.cam_liguilla_series%rowtype; g1 public.cam_football_games%rowtype; g2 public.cam_football_games%rowtype;
 hg integer; lg integer; winner text; st text; pass integer; first_kick timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext('cam-liguilla-' || p_liguilla));
 for pass in 1..2 loop
   perform cam_football_private.link_games(p_liguilla);
   for sr in select * from public.cam_liguilla_series where liguilla_id = p_liguilla and status = 'open' loop
     perform cam_football_private.price_series(sr.id);
   end loop;
   for sr in select * from public.cam_liguilla_series where liguilla_id = p_liguilla
             and decided_by is distinct from 'admin' order by round, slot loop
     winner := null; st := 'open';
     if sr.leg1_id is not null and sr.leg2_id is not null then
       select * into g1 from public.cam_football_games where id = sr.leg1_id;
       select * into g2 from public.cam_football_games where id = sr.leg2_id;
       if g1.status = 'final' and g2.status = 'final' and g1.home_score is not null and g1.away_score is not null
          and g2.home_score is not null and g2.away_score is not null then
         hg := (case when g1.home_id = sr.high_id then g1.home_score else g1.away_score end)
             + (case when g2.home_id = sr.high_id then g2.home_score else g2.away_score end);
         lg := (case when g1.home_id = sr.low_id then g1.home_score else g1.away_score end)
             + (case when g2.home_id = sr.low_id then g2.home_score else g2.away_score end);
         if hg > lg then winner := sr.high_id;
         elsif lg > hg then winner := sr.low_id;
         elsif sr.round <> 'final' then winner := sr.high_id;
         else st := 'penalties'; end if;
       end if;
     end if;
     if winner is not null then st := 'decided'; end if;
     if (st, winner) is distinct from (sr.status, sr.winner_id) then
       update public.cam_liguilla_series set status = st, winner_id = winner,
         decided_by = case when winner is null then null else 'auto' end,
         decided_at = case when winner is null then null else now() end
       where id = sr.id;
       perform cam_football_private.audit(p_liguilla, 'liguilla_series_' || st,
         jsonb_build_object('series', sr.id, 'round', sr.round, 'winner', winner));
     end if;
   end loop;
   perform cam_football_private.next_rounds(p_liguilla);
 end loop;
 -- El cuadro cierra en el primer saque real de cuartos. Mientras siga abierto sigue a ESPN
 -- (antes o después del cierre provisional); ya cerrado, nunca se reabre.
 select min(g.kickoff) into first_kick from public.cam_liguilla_series s
 join public.cam_football_games g on g.id = s.leg1_id where s.liguilla_id = p_liguilla and s.round = 'qf';
 if first_kick is not null then
   update public.cam_liguilla set starts_at = first_kick, closes_at = first_kick
   where id = p_liguilla and (starts_at, closes_at) is distinct from (first_kick, first_kick)
     and (first_kick <= closes_at or statement_timestamp() < closes_at);
 end if;
 -- «¿Quién pasa?»: acertar suma y fallar resta los puntos de la opción elegida.
 update public.cam_liguilla_series_picks p set
   awarded_points = x.pts, settled_at = case when x.decided then coalesce(p.settled_at, now()) else null end
 from (
   select sp.series_id, sp.user_id, s.status = 'decided' decided,
     case when s.status <> 'decided' then 0
          else (case when sp.team_id = s.high_id then s.points_high else s.points_low end)
               * case when sp.team_id = s.winner_id then 1 else -1 end end pts
   from public.cam_liguilla_series_picks sp join public.cam_liguilla_series s on s.id = sp.series_id
   where s.liguilla_id = p_liguilla
 ) x
 where p.series_id = x.series_id and p.user_id = x.user_id
   and (p.awarded_points is distinct from x.pts or (p.settled_at is null) = x.decided);
 -- El cuadro: un acierto paga sus puntos el día que se decide; un fallo vale 0.
 with dec as (
   select s.round, s.winner_id, case when s.winner_id = s.high_id then s.low_id else s.high_id end loser, s.leg2_id
   from public.cam_liguilla_series s where s.liguilla_id = p_liguilla and s.status = 'decided'
 ), pk as (
   select p.user_id, p.stage, p.slot, p.points,
     (select d.leg2_id from dec d where d.winner_id = p.team_id
        and d.round = case p.stage when 'semis' then 'qf' when 'final' then 'sf' else 'final' end limit 1) hit_game,
     exists (select 1 from dec d where d.winner_id = p.team_id
        and d.round = case p.stage when 'semis' then 'qf' when 'final' then 'sf' else 'final' end) hit,
     (select d.leg2_id from dec d where d.loser = p.team_id
        and (p.stage = 'champion' or (p.stage = 'final' and d.round in ('qf', 'sf')) or (p.stage = 'semis' and d.round = 'qf')) limit 1) miss_game,
     exists (select 1 from dec d where d.loser = p.team_id
        and (p.stage = 'champion' or (p.stage = 'final' and d.round in ('qf', 'sf')) or (p.stage = 'semis' and d.round = 'qf'))) miss
   from public.cam_liguilla_picks p where p.liguilla_id = p_liguilla
 )
 update public.cam_liguilla_picks p set
   awarded_points = case when pk.hit then pk.points else 0 end,
   settled_at = case when pk.hit or pk.miss then coalesce(p.settled_at, now()) else null end,
   decided_game_id = case when pk.hit then pk.hit_game when pk.miss then pk.miss_game end
 from pk
 where p.liguilla_id = p_liguilla and p.user_id = pk.user_id and p.stage = pk.stage and p.slot = pk.slot
   and (p.awarded_points is distinct from case when pk.hit then pk.points else 0 end
        or (p.settled_at is null) = (pk.hit or pk.miss)
        or p.decided_game_id is distinct from case when pk.hit then pk.hit_game when pk.miss then pk.miss_game end);
end $function$;
