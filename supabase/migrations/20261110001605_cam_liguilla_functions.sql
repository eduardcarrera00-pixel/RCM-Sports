-- CAM SPORTS | Liguilla Liga MX: modelo de probabilidades, guardado, liquidación,
-- libro de puntos común de fútbol y lectores (clasificación, parties, liga mensual).
-- Sin cron nuevo: el trigger sobre cam_football_games reacciona a la sincronización.

-- ---------------------------------------------------------------- Modelo
-- Goles de Poisson. Con la misma media en ida y vuelta, la localía se compensa en
-- el global; el desempate (mejor de la tabla, o penales en la final) decide el empate.
create or replace function cam_football_private.compare(la double precision, lb double precision,
 out p_win double precision, out p_tie double precision)
language plpgsql immutable set search_path = '' as $$
declare a double precision := exp(-la); b double precision := exp(-lb); cb double precision := 0; k integer;
begin
 p_win := 0; p_tie := 0;
 for k in 0..30 loop
   if k > 0 then a := a * la / k; b := b * lb / k; end if;
   p_win := p_win + a * cb;
   p_tie := p_tie + a * b;
   cb := cb + b;
 end loop;
end $$;

-- Un partido: s_home y s_away son fuerzas; 0,22 es la ventaja de jugar en casa.
create or replace function cam_football_private.leg(s_home double precision, s_away double precision,
 out p_home double precision, out p_draw double precision, out p_away double precision)
language plpgsql immutable set search_path = '' as $$
declare d double precision := s_home - s_away; r record;
begin
 select * into r from cam_football_private.compare(1.3 * exp(0.22 + d / 2), 1.3 * exp(-d / 2));
 p_home := r.p_win; p_draw := r.p_tie; p_away := greatest(0, 1 - r.p_win - r.p_tie);
end $$;

-- Probabilidad de que pase el mejor de la tabla en una serie de ida y vuelta.
create or replace function cam_football_private.advance(s_high double precision, s_low double precision, is_final boolean)
returns double precision language plpgsql immutable set search_path = '' as $$
declare d double precision := s_high - s_low; k double precision := 1.3 * (1 + exp(0.22)); r record;
begin
 select * into r from cam_football_private.compare(k * exp(d / 2), k * exp(-d / 2));
 return least(0.999999, greatest(0.000001,
   r.p_win + r.p_tie * case when is_final then 0.5 + 0.15 * tanh(d) else 1 end));
end $$;

-- Diferencia de fuerza que reproduce el mercado 1X2 de la ida (en casa del peor sembrado).
create or replace function cam_football_private.market_gap(q_low_home double precision, q_high_away double precision)
returns double precision language plpgsql immutable set search_path = '' as $$
declare lo double precision := -4; hi double precision := 4; mid double precision; r record; i integer;
 target double precision := q_high_away - q_low_home;
begin
 for i in 1..40 loop
   mid := (lo + hi) / 2;
   select * into r from cam_football_private.leg(-mid / 2, mid / 2);
   if r.p_away - r.p_home < target then lo := mid; else hi := mid; end if;
 end loop;
 return (lo + hi) / 2;
end $$;

create or replace function cam_football_private.table_strength(p_played integer, p_points integer, p_goal_diff integer)
returns double precision language sql immutable set search_path = '' as $$
 select 0.55 * (p_points::double precision / p_played - 1.45) + 0.30 * (p_goal_diff::double precision / p_played);
$$;

create or replace function cam_football_private.bracket_points(p double precision)
returns smallint language sql immutable set search_path = '' as $$
 select greatest(1, least(20, round(3 * ln(1 / greatest(p, 0.000001)) / ln(2))))::smallint;
$$;

create or replace function cam_football_private.series_points(p double precision)
returns smallint language sql immutable set search_path = '' as $$
 select greatest(2, least(12, round(2 / greatest(p, 0.000001))))::smallint;
$$;

-- Semifinales: con reclasificación, el mejor que sigue vivo contra el peor; sin ella,
-- cuadro fijo (1/8 contra 4/5 y 2/7 contra 3/6). Devuelve [alto1, bajo1, alto2, bajo2].
create or replace function cam_football_private.semi_pairs(w integer[], p_reseed boolean)
returns integer[] language plpgsql immutable set search_path = '' as $$
declare s integer[];
begin
 if p_reseed then
   select array_agg(x order by x) into s from unnest(w) x;
   return array[s[1], s[4], s[2], s[3]];
 end if;
 return array[least(w[1], w[4]), greatest(w[1], w[4]), least(w[2], w[3]), greatest(w[2], w[3])];
end $$;

-- Con 8 equipos hay 2^4 · 2^2 · 2 = 128 caminos: se calculan todos, sin azar.
create or replace function cam_football_private.compute_odds(p_liguilla bigint)
returns void language plpgsql set search_path = '' as $$
declare
 s double precision[] := array_fill(0::double precision, array[8]);
 team text[] := array_fill(''::text, array[8]);
 semis double precision[] := array_fill(0::double precision, array[8]);
 fin double precision[] := array_fill(0::double precision, array[8]);
 champ double precision[] := array_fill(0::double precision, array[8]);
 qa double precision[] := array_fill(0::double precision, array[4]);
 reseed boolean; r record; mask integer; m2 integer; i integer; w integer[]; pairs integer[];
 pq double precision; p1 double precision; p2 double precision; pf double precision; pc double precision;
 f1 integer; f2 integer; a integer; b integer;
begin
 select l.reseed into reseed from public.cam_liguilla l where l.id = p_liguilla;
 for r in select seed, strength, team_id from public.cam_liguilla_seeds where liguilla_id = p_liguilla loop
   s[r.seed] := r.strength; team[r.seed] := r.team_id;
 end loop;
 for i in 1..4 loop qa[i] := cam_football_private.advance(s[i], s[9 - i], false); end loop;
 for mask in 0..15 loop
   pq := 1; w := '{}';
   for i in 1..4 loop
     if (mask >> (i - 1)) & 1 = 0 then w := w || i; pq := pq * qa[i];
     else w := w || (9 - i); pq := pq * (1 - qa[i]); end if;
   end loop;
   foreach a in array w loop semis[a] := semis[a] + pq; end loop;
   pairs := cam_football_private.semi_pairs(w, reseed);
   p1 := cam_football_private.advance(s[pairs[1]], s[pairs[2]], false);
   p2 := cam_football_private.advance(s[pairs[3]], s[pairs[4]], false);
   for m2 in 0..3 loop
     f1 := case when m2 & 1 = 0 then pairs[1] else pairs[2] end;
     f2 := case when m2 & 2 = 0 then pairs[3] else pairs[4] end;
     pf := pq * (case when m2 & 1 = 0 then p1 else 1 - p1 end) * (case when m2 & 2 = 0 then p2 else 1 - p2 end);
     fin[f1] := fin[f1] + pf; fin[f2] := fin[f2] + pf;
     a := least(f1, f2); b := greatest(f1, f2);
     pc := cam_football_private.advance(s[a], s[b], true);
     champ[a] := champ[a] + pf * pc; champ[b] := champ[b] + pf * (1 - pc);
   end loop;
 end loop;
 delete from public.cam_liguilla_odds where liguilla_id = p_liguilla;
 insert into public.cam_liguilla_odds(liguilla_id, team_id, stage, probability, points)
 select p_liguilla, team[k.idx], x.stage, round(greatest(least(x.p, 1), 0.000001)::numeric, 6),
        cam_football_private.bracket_points(x.p)
 from generate_series(1, 8) k(idx)
 cross join lateral (values ('semis', semis[k.idx]), ('final', fin[k.idx]), ('champion', champ[k.idx])) x(stage, p);
end $$;

-- Puntos de «¿Quién pasa?». Mientras nadie haya elegido, se pueden recalcular
-- (por ejemplo, cuando aparecen las cuotas reales de la ida).
create or replace function cam_football_private.price_series(p_series bigint)
returns void language plpgsql set search_path = '' as $$
declare sr public.cam_liguilla_series%rowtype; sh double precision; sl double precision;
 g public.cam_football_games%rowtype; d double precision; m double precision; p double precision; src text := 'tabla';
begin
 select * into sr from public.cam_liguilla_series where id = p_series for update;
 if not found or sr.status <> 'open' then return; end if;
 if exists (select 1 from public.cam_liguilla_series_picks where series_id = p_series) then return; end if;
 if sr.odds_source = 'cuotas' then return; end if;
 select strength into sh from public.cam_liguilla_seeds where liguilla_id = sr.liguilla_id and team_id = sr.high_id;
 select strength into sl from public.cam_liguilla_seeds where liguilla_id = sr.liguilla_id and team_id = sr.low_id;
 if sr.leg1_id is not null then
   select * into g from public.cam_football_games where id = sr.leg1_id;
   if g.probability_home is not null and g.odds_source is distinct from 'automatic_equal_v1'
      and g.home_id = sr.low_id then
     d := cam_football_private.market_gap(g.probability_home::double precision, g.probability_away::double precision);
     m := (sh + sl) / 2; sh := m + d / 2; sl := m - d / 2; src := 'cuotas';
   end if;
 end if;
 p := cam_football_private.advance(sh, sl, sr.round = 'final');
 if sr.odds_source is not distinct from src and sr.odds_locked_at is not null then return; end if;
 update public.cam_liguilla_series set probability_high = round(p::numeric, 6),
   points_high = cam_football_private.series_points(p), points_low = cam_football_private.series_points(1 - p),
   odds_source = src, odds_locked_at = clock_timestamp()
 where id = p_series;
end $$;

-- Un partido de la Liga MX entra en su serie: ida en casa del peor sembrado, vuelta en la del mejor.
create or replace function cam_football_private.link_games(p_liguilla bigint)
returns integer language plpgsql set search_path = '' as $$
declare l public.cam_liguilla%rowtype; n1 integer; n2 integer;
begin
 select * into l from public.cam_liguilla where id = p_liguilla;
 update public.cam_liguilla_series s set leg1_id = (
   select g.id from public.cam_football_games g
   where g.competition = l.competition and g.season = l.season and g.kickoff >= l.starts_at - interval '2 hours'
     and g.home_id = s.low_id and g.away_id = s.high_id and g.status <> 'cancelled'
     and not exists (select 1 from public.cam_liguilla_series o where o.leg1_id = g.id or o.leg2_id = g.id)
   order by g.kickoff limit 1)
 where s.liguilla_id = p_liguilla and s.leg1_id is null;
 get diagnostics n1 = row_count;
 update public.cam_liguilla_series s set leg2_id = (
   select g.id from public.cam_football_games g
   where g.competition = l.competition and g.season = l.season and g.kickoff >= l.starts_at - interval '2 hours'
     and g.home_id = s.high_id and g.away_id = s.low_id and g.status <> 'cancelled'
     and not exists (select 1 from public.cam_liguilla_series o where o.leg1_id = g.id or o.leg2_id = g.id)
   order by g.kickoff limit 1)
 where s.liguilla_id = p_liguilla and s.leg2_id is null;
 get diagnostics n2 = row_count;
 return n1 + n2;
end $$;

create or replace function cam_football_private.audit(p_liguilla bigint, p_action text, p_detail jsonb)
returns void language sql set search_path = '' as $$
 insert into public.cam_football_audit(game_id, action, actor_id, detail)
 values (null, p_action, auth.uid(), coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('liguilla', p_liguilla));
$$;

-- Crea la ronda siguiente cuando la anterior está decidida. Si un resultado se corrige
-- después, rehace la ronda siguiente solo si nadie la había pronosticado todavía.
create or replace function cam_football_private.next_rounds(p_liguilla bigint)
returns void language plpgsql set search_path = '' as $$
declare l public.cam_liguilla%rowtype; w integer[]; pairs integer[]; seedmap jsonb; team text[];
 sf public.cam_liguilla_series%rowtype; fh text; fl text; i integer; r record; expected text[]; got text[];
begin
 select * into l from public.cam_liguilla where id = p_liguilla;
 select jsonb_object_agg(team_id, seed), array_agg(team_id order by seed) into seedmap, team
 from public.cam_liguilla_seeds where liguilla_id = p_liguilla;
 -- Semifinales
 if (select count(*) from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'qf' and status = 'decided') = 4 then
   select array_agg((seedmap->>winner_id)::integer order by slot) into w
   from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'qf';
   pairs := cam_football_private.semi_pairs(w, l.reseed);
   expected := array[team[pairs[1]], team[pairs[2]], team[pairs[3]], team[pairs[4]]];
   select array_agg(x order by o) into got from (
     select high_id x, slot * 2 o from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'sf'
     union all select low_id, slot * 2 + 1 from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'sf') q;
   if got is distinct from expected then
     if exists (select 1 from public.cam_liguilla_series s join public.cam_liguilla_series_picks p on p.series_id = s.id
                where s.liguilla_id = p_liguilla and s.round in ('sf', 'final')) then
       perform cam_football_private.audit(p_liguilla, 'liguilla_round_conflict', jsonb_build_object('round', 'sf'));
     else
       delete from public.cam_liguilla_series where liguilla_id = p_liguilla and round in ('sf', 'final');
       insert into public.cam_liguilla_series(liguilla_id, round, slot, high_id, low_id)
       values (p_liguilla, 'sf', 0, expected[1], expected[2]), (p_liguilla, 'sf', 1, expected[3], expected[4]);
     end if;
   end if;
 elsif exists (select 1 from public.cam_liguilla_series where liguilla_id = p_liguilla and round in ('sf', 'final'))
   and not exists (select 1 from public.cam_liguilla_series s join public.cam_liguilla_series_picks p on p.series_id = s.id
                   where s.liguilla_id = p_liguilla and s.round in ('sf', 'final')) then
   delete from public.cam_liguilla_series where liguilla_id = p_liguilla and round in ('sf', 'final');
 end if;
 -- Final
 if (select count(*) from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'sf' and status = 'decided') = 2 then
   select case when (seedmap->>a.winner_id)::integer < (seedmap->>b.winner_id)::integer then a.winner_id else b.winner_id end,
          case when (seedmap->>a.winner_id)::integer < (seedmap->>b.winner_id)::integer then b.winner_id else a.winner_id end
   into fh, fl
   from public.cam_liguilla_series a, public.cam_liguilla_series b
   where a.liguilla_id = p_liguilla and b.liguilla_id = p_liguilla and a.round = 'sf' and b.round = 'sf' and a.slot = 0 and b.slot = 1;
   select * into sf from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'final';
   if not found then
     insert into public.cam_liguilla_series(liguilla_id, round, slot, high_id, low_id) values (p_liguilla, 'final', 0, fh, fl);
   elsif (sf.high_id, sf.low_id) is distinct from (fh, fl)
     and not exists (select 1 from public.cam_liguilla_series_picks where series_id = sf.id) then
     delete from public.cam_liguilla_series where id = sf.id;
     insert into public.cam_liguilla_series(liguilla_id, round, slot, high_id, low_id) values (p_liguilla, 'final', 0, fh, fl);
   end if;
 elsif exists (select 1 from public.cam_liguilla_series s where s.liguilla_id = p_liguilla and s.round = 'final'
               and not exists (select 1 from public.cam_liguilla_series_picks p where p.series_id = s.id)) then
   delete from public.cam_liguilla_series where liguilla_id = p_liguilla and round = 'final';
 end if;
end $$;

-- Recalcula todo lo que depende de los partidos: es idempotente.
create or replace function cam_football_private.refresh(p_liguilla bigint)
returns void language plpgsql set search_path = '' as $$
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
 -- El cuadro cierra en el primer saque real de cuartos, nunca después del previsto.
 select min(g.kickoff) into first_kick from public.cam_liguilla_series s
 join public.cam_football_games g on g.id = s.leg1_id where s.liguilla_id = p_liguilla and s.round = 'qf';
 update public.cam_liguilla set closes_at = least(starts_at, coalesce(first_kick, starts_at))
 where id = p_liguilla and closes_at is distinct from least(starts_at, coalesce(first_kick, starts_at));
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
end $$;

-- La sincronización de siempre escribe los partidos; aquí se enlazan y se liquidan.
create or replace function cam_football_private.on_game()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l_id bigint;
begin
 if new.competition <> 'ligamx' then return new; end if;
 select l.id into l_id from public.cam_liguilla l
 where l.competition = new.competition and l.season = new.season and new.kickoff >= l.starts_at - interval '2 hours'
 order by l.starts_at desc limit 1;
 if l_id is null then return new; end if;
 if tg_op = 'UPDATE' and (new.home_id, new.away_id, new.kickoff, new.status, new.home_score, new.away_score,
     new.probability_home, new.odds_source) is not distinct from (old.home_id, old.away_id, old.kickoff, old.status,
     old.home_score, old.away_score, old.probability_home, old.odds_source) then return new; end if;
 perform cam_football_private.refresh(l_id);
 return new;
end $$;
revoke all on function cam_football_private.on_game() from public, anon, authenticated;
create trigger cam_liguilla_game_sync after insert or update on public.cam_football_games
 for each row execute function cam_football_private.on_game();

-- ---------------------------------------------------------------- Libro de puntos
-- Una sola fuente para clasificación, parties, liga mensual y perfil: 1X2,
-- «¿Quién pasa?» y cuadro. El cuadro no tiene jornada (matchday nulo).
create or replace view cam_football_private.ledger as
 select 'game'::text source, g.id game_id, p.user_id, g.competition, g.season, g.matchday, g.kickoff,
   p.awarded_points::integer points, (p.pick = g.outcome) won
 from public.cam_football_picks p join public.cam_football_games g on g.id = p.game_id
 where g.status = 'final' and g.outcome is not null
 union all
 select 'series', g.id, sp.user_id, l.competition, l.season, g.matchday, coalesce(g.kickoff, s.decided_at),
   sp.awarded_points::integer, sp.team_id = s.winner_id
 from public.cam_liguilla_series_picks sp
 join public.cam_liguilla_series s on s.id = sp.series_id
 join public.cam_liguilla l on l.id = s.liguilla_id
 left join public.cam_football_games g on g.id = s.leg2_id
 where s.status = 'decided' and sp.settled_at is not null
 union all
 select 'bracket', g.id, p.user_id, l.competition, l.season, null::integer, coalesce(g.kickoff, p.settled_at),
   p.awarded_points::integer, p.awarded_points > 0
 from public.cam_liguilla_picks p
 join public.cam_liguilla l on l.id = p.liguilla_id
 left join public.cam_football_games g on g.id = p.decided_game_id
 where p.settled_at is not null;
revoke all on cam_football_private.ledger from public, anon, authenticated;

create or replace function public.cam_football_leaderboard(p_scope text, p_season integer,
 p_competition text default null, p_matchday integer default null, p_month text default null)
returns table(rank_position bigint, user_id uuid, username text, points bigint, hits bigint, resolved bigint, accuracy numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
 if p_scope not in ('matchday','month','season','all') or p_season not between 2020 and 2100
 or (p_competition is not null and p_competition not in ('laliga','premier','ligamx','champions'))
 or (p_scope='matchday' and (p_matchday is null or p_matchday not between 1 and 60 or p_competition is null))
 or (p_scope='month' and (p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Periodo inválido'; end if;
 return query
 with totals as (
 select l.user_id, sum(l.points)::bigint pts,
 count(*) filter (where l.won)::bigint wins, count(*)::bigint total
 from cam_football_private.ledger l
 where (p_scope='all' or l.season=p_season)
 and (p_competition is null or l.competition=p_competition)
 and (p_scope<>'matchday' or l.matchday=p_matchday)
 and (p_scope<>'month' or to_char(l.kickoff at time zone 'America/Toronto','YYYY-MM')=p_month)
 group by l.user_id
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
end $$;

create or replace function public.cam_quiniela_score_rows(p_period text)
returns table(sport text, game_id text, user_id uuid, kickoff timestamptz, points numeric, won boolean)
language sql stable security definer set search_path = '' as $$
  with week as (
    select w.sport, w.game_id from public.cam_quiniela_week_games() w where p_period = 'week'
  )
  select 'nfl'::text, g.id, p.user_id, g.kickoff, p.awarded_points::numeric, p.team_id = g.winner_id
    from public.cam_nfl_picks p
    join public.cam_nfl_games g on g.id = p.game_id
   where g.status = 'final' and g.winner_id is not null
     and (p_period = 'all'
          or (p_period = 'month'
              and date_trunc('month', g.kickoff at time zone 'America/Toronto')
                  = date_trunc('month', now() at time zone 'America/Toronto'))
          or (p_period = 'week' and exists (select 1 from week w where w.sport = 'nfl' and w.game_id = g.id)))
  union all
  select 'football'::text, l.game_id, l.user_id, l.kickoff, l.points::numeric, l.won
    from cam_football_private.ledger l
   where p_period = 'all'
      or (p_period = 'month'
          and date_trunc('month', l.kickoff at time zone 'America/Toronto')
              = date_trunc('month', now() at time zone 'America/Toronto'))
      or (p_period = 'week' and l.source <> 'bracket'
          and exists (select 1 from week w where w.sport = 'football' and w.game_id = l.game_id));
$$;

create or replace function cam_competitive.refresh_month(p_month date)
returns void language plpgsql security invoker set search_path = '' as $$
declare c record; n integer; needed integer; start_at timestamptz; end_at timestamptz;
begin
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Mes inválido'; end if;
 start_at:=p_month::timestamp at time zone 'America/Toronto';
 end_at:=(p_month+interval '1 month')::timestamp at time zone 'America/Toronto';
 for c in select * from public.cam_league_competitions where starts_on<=p_month loop
   if exists(select 1 from public.cam_league_seasons s where s.competition=c.id and s.season_month=p_month) then continue; end if;
   if c.id='picks' then
     select count(*) into n from public.ae_community_picks p where not p.hidden and p.moderation_status='approved'
       and p.outcome in ('won','lost') and p.settled_at>=start_at and p.settled_at<end_at;
     needed:=c.minimum;
   elsif c.id='nfl' then
     select count(*) into n from public.cam_nfl_games g where g.status='final' and g.winner_id is not null and g.kickoff>=start_at and g.kickoff<end_at;
     needed:=greatest(c.minimum,ceil(n*.5));
   else
     select count(*) into n from public.cam_football_games g where g.status='final' and g.outcome is not null and g.kickoff>=start_at and g.kickoff<end_at;
     needed:=greatest(c.minimum,ceil(n*.5));
   end if;
   delete from public.cam_league_standings where competition=c.id and season_month=p_month;
   insert into public.cam_league_standings(competition,season_month,user_id,username,points,correct,resolved,required,available,eligible,position,participants,rank_before,rank_after,zone,next_inactive,next_streak)
   with events as (
     select p.user_id,coalesce(p.result_points,0)::numeric pts,(p.outcome='won')::integer hit,p.settled_at happened
     from public.ae_community_picks p where c.id='picks' and not p.hidden and p.moderation_status='approved'
       and p.outcome in ('won','lost') and p.settled_at>=start_at and p.settled_at<end_at
     union all
     select p.user_id,p.awarded_points::numeric,(p.team_id=g.winner_id)::integer,g.kickoff
     from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
     where c.id='nfl' and g.status='final' and g.winner_id is not null and p.awarded_points is not null and g.kickoff>=start_at and g.kickoff<end_at
     union all
     -- Fútbol: 1X2, «¿Quién pasa?» y cuadro de la liguilla, el día en que se deciden.
     select l.user_id,l.points::numeric,l.won::integer,l.kickoff
     from cam_football_private.ledger l
     where c.id='football' and l.kickoff>=start_at and l.kickoff<end_at
   ), totals as (
     select user_id,sum(pts) points,sum(hit)::integer correct,count(*)::integer resolved,min(happened) first_result from events group by user_id
   ), ranked as (
     select t.*,row_number() over(order by points desc,correct desc,1.0*correct/resolved desc,first_result,user_id)::integer pos,
       count(*) over()::integer total from totals t where resolved>=needed
   ), people as (
     select user_id from totals union select user_id from public.cam_league_members where competition=c.id
   ), scored as (
     select p.user_id,coalesce(a.username,nullif(u.raw_user_meta_data->>'username',''),'Aficionado') username,
       coalesce(t.points,0) points,coalesce(t.correct,0) correct,coalesce(t.resolved,0) resolved,
       r.pos,r.total,coalesce(m.rank_level,0) current_rank,
       public.cam_league_outcome(coalesce(m.rank_level,0),r.pos,coalesce(r.total,(select count(*)::integer from ranked)),r.pos is not null,
         coalesce(m.inactive_months,0),coalesce(m.elite_streak,0),n) decision
     from people p join auth.users u on u.id=p.user_id
     left join public.ae_auth_accounts a on a.user_id=p.user_id
     left join totals t on t.user_id=p.user_id left join ranked r on r.user_id=p.user_id
     left join public.cam_league_members m on m.user_id=p.user_id and m.competition=c.id
   )
   select c.id,p_month,s.user_id,left(s.username,40),s.points,s.correct,s.resolved,needed,n,s.pos is not null,s.pos,
     coalesce(s.total,(select count(*)::integer from ranked)),s.current_rank,(s.decision->>'rank')::integer,s.decision->>'zone',
     (s.decision->>'inactive')::integer,(s.decision->>'streak')::integer from scored s;
 end loop;
end $$;

-- ---------------------------------------------------------------- Lectura
create or replace function public.cam_liguilla_state(p_season integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.cam_liguilla%rowtype; me uuid := auth.uid(); result jsonb;
begin
 select * into l from public.cam_liguilla where competition = 'ligamx' and season = p_season
 order by starts_at desc limit 1;
 if not found then return null; end if;
 select jsonb_build_object(
   'liguilla', jsonb_build_object('id', l.id, 'name', l.name, 'season', l.season, 'reseed', l.reseed,
     'starts_at', l.starts_at, 'closes_at', l.closes_at, 'open', statement_timestamp() < l.closes_at,
     'server_time', statement_timestamp()),
   'seeds', (select coalesce(jsonb_agg(jsonb_build_object('seed', s.seed, 'team_id', s.team_id, 'name', t.name,
       'short_name', t.short_name, 'abbreviation', t.abbreviation, 'logo', t.logo, 'played', s.played,
       'points', s.points, 'goal_diff', s.goal_diff) order by s.seed), '[]'::jsonb)
     from public.cam_liguilla_seeds s join public.cam_football_teams t on t.id = s.team_id where s.liguilla_id = l.id),
   'odds', (select coalesce(jsonb_agg(jsonb_build_object('team_id', o.team_id, 'stage', o.stage,
       'probability', o.probability, 'points', o.points)), '[]'::jsonb)
     from public.cam_liguilla_odds o where o.liguilla_id = l.id),
   'series', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'round', s.round, 'slot', s.slot,
       'high_id', s.high_id, 'low_id', s.low_id, 'leg1_id', s.leg1_id, 'leg2_id', s.leg2_id,
       'probability_high', s.probability_high, 'points_high', s.points_high, 'points_low', s.points_low,
       'odds_source', s.odds_source, 'status', s.status, 'winner_id', s.winner_id,
       'legs', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'kickoff', g.kickoff, 'status', g.status,
           'home_id', g.home_id, 'away_id', g.away_id, 'home_score', g.home_score, 'away_score', g.away_score,
           'outcome', g.outcome, 'points_home', g.points_home, 'points_draw', g.points_draw, 'points_away', g.points_away,
           'picks_open', g.picks_open, 'odds_locked_at', g.odds_locked_at, 'matchday', g.matchday,
           'competition', g.competition, 'season', g.season) order by g.kickoff), '[]'::jsonb)
         from public.cam_football_games g where g.id in (s.leg1_id, s.leg2_id))
     ) order by case s.round when 'qf' then 1 when 'sf' then 2 else 3 end, s.slot), '[]'::jsonb)
     from public.cam_liguilla_series s where s.liguilla_id = l.id),
   'mine', case when me is null then null else jsonb_build_object(
     'bracket', (select coalesce(jsonb_agg(jsonb_build_object('stage', p.stage, 'slot', p.slot, 'team_id', p.team_id,
         'points', p.points, 'awarded_points', p.awarded_points, 'settled_at', p.settled_at)), '[]'::jsonb)
       from public.cam_liguilla_picks p where p.liguilla_id = l.id and p.user_id = me),
     'series', (select coalesce(jsonb_agg(jsonb_build_object('series_id', p.series_id, 'team_id', p.team_id,
         'awarded_points', p.awarded_points, 'settled_at', p.settled_at)), '[]'::jsonb)
       from public.cam_liguilla_series_picks p join public.cam_liguilla_series s on s.id = p.series_id
       where s.liguilla_id = l.id and p.user_id = me)) end,
   'players', (select count(distinct user_id) from public.cam_liguilla_picks where liguilla_id = l.id)
 ) into result;
 return result;
end $$;

-- Clasificación propia «Tu liguilla»: solo los puntos del cuadro.
create or replace function public.cam_liguilla_leaderboard(p_liguilla bigint)
returns table(rank_position bigint, user_id uuid, username text, points bigint, hits bigint, alive bigint, champion_id text)
language sql stable security definer set search_path = '' as $$
 with totals as (
   select p.user_id, sum(p.awarded_points)::bigint pts, count(*) filter (where p.awarded_points > 0)::bigint wins,
     coalesce(sum(p.points) filter (where p.settled_at is null), 0)::bigint alive,
     max(p.team_id) filter (where p.stage = 'champion') champ
   from public.cam_liguilla_picks p where p.liguilla_id = p_liguilla group by p.user_id
 )
 select dense_rank() over (order by t.pts desc, t.wins desc, t.alive desc)::bigint, t.user_id,
   coalesce(nullif(left(a.username,40),''),nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
   t.pts, t.wins, t.alive, t.champ
 from totals t join auth.users u on u.id = t.user_id left join public.ae_auth_accounts a on a.user_id = t.user_id
 order by 1, t.user_id limit 100;
$$;

-- ---------------------------------------------------------------- Guardar
create or replace function public.cam_liguilla_save_bracket(p_liguilla bigint, p_semis text[], p_finalists text[], p_champion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); l public.cam_liguilla%rowtype; seedmap jsonb; team text[]; w integer[]; pairs integer[];
 i integer; sd integer; n integer := 0; total integer := 0;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Inicia sesión'; end if;
 select * into l from public.cam_liguilla where id = p_liguilla;
 if not found then raise exception 'Liguilla no disponible'; end if;
 if statement_timestamp() >= l.closes_at then raise exception 'El cuadro ya está cerrado: empezó la liguilla'; end if;
 if coalesce(array_length(p_semis, 1), 0) <> 4 or coalesce(array_length(p_finalists, 1), 0) <> 2 then
   raise exception 'Cuadro inválido'; end if;
 select jsonb_object_agg(team_id, seed), array_agg(team_id order by seed) into seedmap, team
 from public.cam_liguilla_seeds where liguilla_id = l.id;
 for i in 1..4 loop
   if p_semis[i] is not null then
     sd := (seedmap->>p_semis[i])::integer;
     if sd is null or sd not in (i, 9 - i) then raise exception 'Cuartos %: elige uno de los dos equipos del cruce', i; end if;
     w := w || sd;
   end if;
 end loop;
 if coalesce(array_length(w, 1), 0) < 4 and (p_finalists[1] is not null or p_finalists[2] is not null or p_champion is not null) then
   raise exception 'Elige primero los cuatro de cuartos'; end if;
 if coalesce(array_length(w, 1), 0) = 4 then
   pairs := cam_football_private.semi_pairs(w, l.reseed);
   for i in 1..2 loop
     if p_finalists[i] is not null and (seedmap->>p_finalists[i])::integer is distinct from pairs[2 * i - 1]
        and (seedmap->>p_finalists[i])::integer is distinct from pairs[2 * i] then
       raise exception 'Semifinal %: elige uno de los dos equipos del cruce', i; end if;
   end loop;
 end if;
 if p_champion is not null and (p_finalists[1] is null or p_finalists[2] is null or p_champion not in (p_finalists[1], p_finalists[2])) then
   raise exception 'El campeón tiene que ser uno de tus finalistas'; end if;
 delete from public.cam_liguilla_picks where liguilla_id = l.id and user_id = me;
 insert into public.cam_liguilla_picks(liguilla_id, user_id, stage, slot, team_id, points)
 select l.id, me, x.stage, x.slot, x.team_id, o.points
 from (select 'semis'::text stage, (k - 1)::smallint slot, p_semis[k] team_id from generate_series(1, 4) k
       union all select 'final', (k - 1)::smallint, p_finalists[k] from generate_series(1, 2) k
       union all select 'champion', 0::smallint, p_champion) x
 join public.cam_liguilla_odds o on o.liguilla_id = l.id and o.team_id = x.team_id and o.stage = x.stage
 where x.team_id is not null;
 get diagnostics n = row_count;
 select coalesce(sum(points), 0) into total from public.cam_liguilla_picks where liguilla_id = l.id and user_id = me;
 return jsonb_build_object('saved', n, 'potential', total, 'closes_at', l.closes_at);
end $$;

create or replace function public.cam_liguilla_save_series_pick(p_series bigint, p_team text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); sr public.cam_liguilla_series%rowtype; g public.cam_football_games%rowtype;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Inicia sesión'; end if;
 select * into sr from public.cam_liguilla_series where id = p_series for update;
 if not found or sr.status <> 'open' or sr.leg1_id is null or sr.odds_locked_at is null then
   raise exception 'Esta serie todavía no está abierta'; end if;
 select * into g from public.cam_football_games where id = sr.leg1_id;
 if g.status <> 'scheduled' or g.kickoff <= statement_timestamp() then
   raise exception '«¿Quién pasa?» se cerró al empezar la ida'; end if;
 if p_team is null then
   delete from public.cam_liguilla_series_picks where series_id = p_series and user_id = me;
   return true;
 end if;
 if p_team not in (sr.high_id, sr.low_id) then raise exception 'Elige uno de los dos equipos de la serie'; end if;
 insert into public.cam_liguilla_series_picks(series_id, user_id, team_id) values (p_series, me, p_team)
 on conflict (series_id, user_id) do update set team_id = excluded.team_id, updated_at = now();
 return true;
end $$;

-- ---------------------------------------------------------------- Administrar
-- Tabla oficial de ESPN para rellenar la apertura (una lectura, solo cuando se pide).
create or replace function public.cam_liguilla_admin_table()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare response extensions.http_response; j jsonb;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 response := extensions.http_get('https://site.api.espn.com/apis/v2/sports/soccer/mex.1/standings');
 if response.status <> 200 then raise exception 'ESPN no respondió (HTTP %)', response.status; end if;
 j := response.content::jsonb;
 return (
   select coalesce(jsonb_agg(item order by (item->>'rank')::integer), '[]'::jsonb) from (
     select jsonb_build_object('team_id', e->'team'->>'id', 'name', e->'team'->>'displayName',
       'rank', st->>'rank', 'played', st->>'gamesPlayed', 'points', st->>'points', 'goal_diff', st->>'pointDifferential') item
     from jsonb_array_elements(j->'children'->0->'standings'->'entries') e
     cross join lateral (select jsonb_object_agg(s->>'name', s->'value') st from jsonb_array_elements(e->'stats') s) x
   ) q);
end $$;

create or replace function public.cam_liguilla_admin_open(p_season integer, p_name text, p_starts_at timestamptz,
 p_teams jsonb, p_reseed boolean default true)
returns bigint language plpgsql security definer set search_path = '' as $$
declare old_id bigint; new_id bigint; i integer; item jsonb; g public.cam_football_games%rowtype;
 sh double precision; sl double precision; d double precision; m double precision; market jsonb := '[]'::jsonb; sr record;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_starts_at is null or p_starts_at <= statement_timestamp() then raise exception 'La liguilla tiene que empezar en el futuro'; end if;
 if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) <> 8 then raise exception 'Hacen falta los 8 clasificados en orden'; end if;
 if (select count(distinct x->>'team_id') from jsonb_array_elements(p_teams) x) <> 8 then raise exception 'Hay un equipo repetido'; end if;
 if exists (select 1 from jsonb_array_elements(p_teams) x where not exists (select 1 from public.cam_football_teams t where t.id = x->>'team_id')) then
   raise exception 'Equipo desconocido'; end if;
 select id into old_id from public.cam_liguilla where competition = 'ligamx' and season = p_season and name = trim(p_name);
 if old_id is not null then
   if exists (select 1 from public.cam_liguilla_picks where liguilla_id = old_id)
      or exists (select 1 from public.cam_liguilla_series s join public.cam_liguilla_series_picks p on p.series_id = s.id where s.liguilla_id = old_id) then
     raise exception 'Ya hay cuadros guardados: no se puede rehacer la apertura'; end if;
   delete from public.cam_liguilla where id = old_id;
 end if;
 insert into public.cam_liguilla(competition, season, name, reseed, starts_at, closes_at, opened_by)
 values ('ligamx', p_season, trim(p_name), coalesce(p_reseed, true), p_starts_at, p_starts_at, auth.uid())
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
   where x.competition = 'ligamx' and x.season = p_season and x.kickoff >= p_starts_at - interval '2 hours'
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
   'strength', '0.55·(pts/pj − 1.45) + 0.30·(dg/pj)', 'market', market) where id = new_id;
 perform cam_football_private.refresh(new_id);
 perform cam_football_private.audit(new_id, 'liguilla_open', jsonb_build_object('teams', p_teams, 'starts_at', p_starts_at,
   'reseed', p_reseed, 'market', market));
 return new_id;
end $$;

-- Penales de la final o correcciones: el administrador decide el ganador de una serie.
create or replace function public.cam_liguilla_admin_winner(p_series bigint, p_team text, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare sr public.cam_liguilla_series%rowtype; g public.cam_football_games%rowtype;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'Escribe el motivo (mínimo 8 letras)'; end if;
 select * into sr from public.cam_liguilla_series where id = p_series for update;
 if not found then raise exception 'Serie no encontrada'; end if;
 if sr.leg2_id is not null then
   select * into g from public.cam_football_games where id = sr.leg2_id;
   if g.kickoff > statement_timestamp() then raise exception 'La vuelta todavía no ha empezado'; end if;
 end if;
 if p_team is null then
   update public.cam_liguilla_series set status = 'open', winner_id = null, decided_by = null, decided_at = null where id = p_series;
 elsif p_team in (sr.high_id, sr.low_id) then
   update public.cam_liguilla_series set status = 'decided', winner_id = p_team, decided_by = 'admin', decided_at = now() where id = p_series;
 else raise exception 'Elige uno de los dos equipos de la serie'; end if;
 perform cam_football_private.audit(sr.liguilla_id, 'liguilla_admin_winner',
   jsonb_build_object('series', p_series, 'team', p_team, 'reason', p_reason));
 perform cam_football_private.refresh(sr.liguilla_id);
 return true;
end $$;

-- Permisos: lo privado no se expone; los RPC públicos validan sesión y fechas.
revoke all on all functions in schema cam_football_private from public, anon, authenticated;
revoke all on function public.cam_liguilla_state(integer), public.cam_liguilla_leaderboard(bigint),
 public.cam_liguilla_save_bracket(bigint, text[], text[], text), public.cam_liguilla_save_series_pick(bigint, text),
 public.cam_liguilla_admin_table(), public.cam_liguilla_admin_open(integer, text, timestamptz, jsonb, boolean),
 public.cam_liguilla_admin_winner(bigint, text, text) from public, anon, authenticated;
grant execute on function public.cam_liguilla_state(integer), public.cam_liguilla_leaderboard(bigint) to anon, authenticated;
grant execute on function public.cam_liguilla_save_bracket(bigint, text[], text[], text),
 public.cam_liguilla_save_series_pick(bigint, text), public.cam_liguilla_admin_table(),
 public.cam_liguilla_admin_open(integer, text, timestamptz, jsonb, boolean),
 public.cam_liguilla_admin_winner(bigint, text, text) to authenticated;
notify pgrst, 'reload schema';
