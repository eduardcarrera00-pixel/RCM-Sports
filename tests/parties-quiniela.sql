-- Parties de Quiniela y resumen del perfil (PostgreSQL local con
-- tests/fixtures/parties-stub.sql; lo ejecuta tests/parties-sql.sh).
-- Comprueba: puntos de quiniela iguales a los de la quiniela general, solo
-- partidos que empiezan después de entrar (joined_at), «Esta semana / Este
-- mes / Total», actividad sin elecciones antes del inicio del partido,
-- privacidad, y las lecturas del perfil (cam_profile_overview y
-- cam_profile_party). Se deshace al final (ROLLBACK).

\set ON_ERROR_STOP 1
begin;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLO: %', msg; end if;
end $$;

insert into auth.users(id, raw_user_meta_data, created_at) values
  ('7c000000-0000-4000-8000-00000000000a', '{"username":"q_ana"}', '2026-10-05T12:00:00Z'),
  ('7c000000-0000-4000-8000-00000000000b', '{"username":"q_beto"}', now()),
  ('7c000000-0000-4000-8000-00000000000c', '{"username":"q_carla"}', now()),
  ('7c000000-0000-4000-8000-00000000000d', '{"username":"q_dani"}', now());

-- Temporadas como en las quinielas: NFL del año (enero-febrero, la anterior);
-- fútbol desde julio.
select set_config('t.nfl_season', (extract(year from now() at time zone 'UTC')::int
  - case when extract(month from now() at time zone 'UTC') < 3 then 1 else 0 end)::text, true);
select set_config('t.fb_season', (extract(year from now() at time zone 'UTC')::int
  - case when extract(month from now() at time zone 'UTC') < 7 then 1 else 0 end)::text, true);

insert into public.nfl_teams(id, name) values ('KC', 'Chiefs'), ('BUF', 'Bills'), ('SF', '49ers'), ('DAL', 'Cowboys');
insert into public.cam_football_teams(id, name, short_name) values ('83', 'FC Barcelona', 'Barcelona'), ('86', 'Real Madrid', 'Real Madrid');

-- NFL. Semana 8 terminada; la semana 9 es la vigente (G3 en juego).
insert into public.cam_nfl_games(id, season, week, home_id, away_id, kickoff, status, home_score, away_score, winner_id, points_home, points_away, odds_locked_at, picks_open) values
  ('900000001', current_setting('t.nfl_season')::int, 8, 'BUF', 'KC', now() - interval '9 days', 'final', 27, 20, 'BUF', 4, 6, now() - interval '10 days', false),
  ('900000002', current_setting('t.nfl_season')::int, 9, 'SF', 'DAL', now() - interval '2 days', 'final', 17, 24, 'DAL', 3, 6, now() - interval '3 days', false),
  ('900000003', current_setting('t.nfl_season')::int, 9, 'KC', 'BUF', now() - interval '1 hour', 'live', 7, 3, null, 4, 5, now() - interval '1 day', false),
  ('900000004', current_setting('t.nfl_season')::int, 9, 'DAL', 'SF', now() + interval '2 days', 'scheduled', null, null, null, 5, 4, now(), true);
-- Fútbol (LaLiga). Jornada 18 terminada; la 19 es la vigente (F2 abierto).
insert into public.cam_football_games(id, competition, season, matchday, home_id, away_id, kickoff, status, home_score, away_score, outcome, points_home, points_draw, points_away, odds_locked_at, picks_open) values
  ('800000001', 'laliga', current_setting('t.fb_season')::int, 18, '83', '86', now() - interval '8 days', 'final', 2, 0, 'home', 3, 8, 6, now() - interval '9 days', false),
  ('800000002', 'laliga', current_setting('t.fb_season')::int, 19, '86', '83', now() - interval '1 day', 'final', 1, 1, 'draw', 4, 8, 5, now() - interval '2 days', false),
  ('800000003', 'laliga', current_setting('t.fb_season')::int, 19, '83', '86', now() + interval '3 days', 'scheduled', null, null, null, 4, 8, 5, now(), true);

-- Pronósticos (como los deja la liquidación: awarded_points al terminar).
insert into public.cam_nfl_picks(game_id, user_id, team_id, awarded_points, settled_at, updated_at) values
  ('900000001', '7c000000-0000-4000-8000-00000000000a', 'BUF', 4, now() - interval '9 days', now() - interval '10 days'),
  ('900000001', '7c000000-0000-4000-8000-00000000000b', 'KC', 0, now() - interval '9 days', now() - interval '10 days'),
  ('900000002', '7c000000-0000-4000-8000-00000000000a', 'DAL', 6, now() - interval '2 days', now() - interval '3 days'),
  ('900000002', '7c000000-0000-4000-8000-00000000000b', 'SF', 0, now() - interval '2 days', now() - interval '3 days'),
  ('900000003', '7c000000-0000-4000-8000-00000000000a', 'KC', 0, null, now() - interval '2 days'),
  ('900000003', '7c000000-0000-4000-8000-00000000000b', 'BUF', 0, null, now() - interval '2 days'),
  ('900000004', '7c000000-0000-4000-8000-00000000000a', 'DAL', 0, null, now() - interval '2 hours'),
  ('900000004', '7c000000-0000-4000-8000-00000000000b', 'SF', 0, null, now() - interval '2 hours');
insert into public.cam_football_picks(game_id, user_id, pick, awarded_points, settled_at, updated_at) values
  ('800000001', '7c000000-0000-4000-8000-00000000000a', 'home', 3, now() - interval '8 days', now() - interval '9 days'),
  ('800000002', '7c000000-0000-4000-8000-00000000000a', 'draw', 8, now() - interval '1 day', now() - interval '2 days'),
  ('800000002', '7c000000-0000-4000-8000-00000000000b', 'home', 0, now() - interval '1 day', now() - interval '2 days'),
  ('800000003', '7c000000-0000-4000-8000-00000000000b', 'away', 0, null, now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- 1. Crear un party de Quiniela, invitar y unirse
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7c000000-0000-4000-8000-00000000000a');
do $$
declare v jsonb;
begin
  v := public.cam_party_create('Los Compas 🏈', 'quiniela', 'all');
  perform set_config('t.q', v->>'id', true);
  perform set_config('t.q_code', v->>'code', true);
  v := public.cam_party_create('Solo NFL', 'quiniela', 'nfl');
  perform set_config('t.qnfl', v->>'id', true);
  perform set_config('t.qnfl_code', v->>'code', true);
  v := public.cam_party_create('Picks del barrio', 'picks', 'all');
  perform set_config('t.picks', v->>'id', true);
end $$;
update public.cam_party_members set joined_at = now() - interval '30 days'
 where user_id = '7c000000-0000-4000-8000-00000000000a';

select pg_temp.as_anon();
do $$
declare v jsonb := public.cam_party_preview(current_setting('t.qnfl_code'));
begin
  perform pg_temp.check(v->>'kind' = 'quiniela' and v->>'sport' = 'nfl' and v->>'status' = 'ok', 'la invitación dice Quiniela · NFL: ' || v::text);
end $$;

select pg_temp.as_user('7c000000-0000-4000-8000-00000000000b');
select public.cam_party_join(current_setting('t.q_code'));
select public.cam_party_join(current_setting('t.qnfl_code'));
-- Beto entró hace 3 días: el partido de hace 9 días (G1) no le cuenta.
update public.cam_party_members set joined_at = now() - interval '3 days'
 where user_id = '7c000000-0000-4000-8000-00000000000b';

-- ---------------------------------------------------------------------------
-- 2. Clasificación: Esta semana · Este mes · Total, en una llamada
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb := public.cam_party_ranking(current_setting('t.q')::uuid);
  n jsonb := public.cam_party_ranking(current_setting('t.qnfl')::uuid);
  p jsonb;
  ana jsonb; beto jsonb;
  month_pts numeric;
begin
  perform pg_temp.check(r ? 'week' and r ? 'month' and r ? 'total', 'tres periodos en una llamada');
  -- Total: los mismos puntos que la quiniela general (G1 4 + G2 6 + F1 3 + F2 8).
  ana := r->'total'->0; beto := r->'total'->1;
  perform pg_temp.check(ana->>'username' = 'q_ana' and (ana->>'points')::numeric = 21
                        and (ana->>'correct')::int = 4 and (ana->>'attempts')::int = 4, 'total de Ana: ' || ana::text);
  perform pg_temp.check(beto->>'username' = 'q_beto' and (beto->>'points')::numeric = 0
                        and (beto->>'attempts')::int = 2, 'Beto: G1 y F1 son anteriores a su entrada: ' || beto::text);
  -- Esta semana: semana 9 de la NFL (G2) y jornada 19 de LaLiga (F2).
  ana := r->'week'->0;
  perform pg_temp.check((ana->>'points')::numeric = 14 and (ana->>'attempts')::int = 2, 'semana de Ana: ' || ana::text);
  perform pg_temp.check((r->'week'->1->>'attempts')::int = 2, 'semana de Beto');
  -- Este mes: partidos del mes de Toronto en curso.
  select coalesce(sum(x.pts), 0) into month_pts from (values
      (now() - interval '9 days', 4), (now() - interval '2 days', 6),
      (now() - interval '8 days', 3), (now() - interval '1 day', 8)) as x(kick, pts)
   where date_trunc('month', x.kick at time zone 'America/Toronto') = date_trunc('month', now() at time zone 'America/Toronto');
  p := (select e from jsonb_array_elements(r->'month') e where e->>'username' = 'q_ana');
  perform pg_temp.check((p->>'points')::numeric = month_pts, 'mes de Ana: ' || p::text || ' esperado ' || month_pts);
  -- Party solo NFL: el fútbol no cuenta.
  perform pg_temp.check((n->'total'->0->>'points')::numeric = 10, 'party NFL: ' || (n->'total')::text);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Actividad: solo partidos empezados y posteriores a la entrada
-- ---------------------------------------------------------------------------
do $$
declare
  a jsonb := public.cam_party_activity(current_setting('t.q')::uuid);
  keys text[];
  live jsonb; done jsonb; it jsonb;
begin
  select array_agg(e->>'key') into keys from jsonb_array_elements(a->'items') e;
  perform pg_temp.check(not exists (select 1 from unnest(keys) k where k like '%900000004%' or k like '%800000003%'),
                        'nunca se ve una elección antes del inicio: ' || keys::text);
  perform pg_temp.check(not ('nfl:900000001:7c000000-0000-4000-8000-00000000000b' = any(keys)), 'G1 de Beto es anterior a su entrada');
  perform pg_temp.check('nfl:900000001:7c000000-0000-4000-8000-00000000000a' = any(keys), 'G1 de Ana sí');
  perform pg_temp.check(cardinality(keys) = 8, '8 pronósticos visibles: ' || keys::text);
  it := (select e from jsonb_array_elements(a->'items') e where e->>'key' = 'football:800000002:7c000000-0000-4000-8000-00000000000a');
  perform pg_temp.check(it->>'pick_label' = 'Empate' and it->>'state' = 'won' and (it->>'points')::int = 8
                        and it->>'home_name' = 'Real Madrid', 'pronóstico de empate: ' || it::text);
  it := (select e from jsonb_array_elements(a->'items') e where e->>'key' = 'nfl:900000003:7c000000-0000-4000-8000-00000000000b');
  perform pg_temp.check(it->>'state' = 'pending' and it->>'pick_label' = 'Bills' and (it->>'points')::int = 5, 'en juego: ' || it::text);
  live := public.cam_party_activity(current_setting('t.q')::uuid, 'pending');
  perform pg_temp.check(jsonb_array_length(live->'items') = 2, 'En juego: solo G3 (Ana y Beto)');
  done := public.cam_party_activity(current_setting('t.q')::uuid, 'resolved', '7c000000-0000-4000-8000-00000000000b');
  perform pg_temp.check(jsonb_array_length(done->'items') = 2, 'Resueltos de Beto: G2 y F2');
  -- De 20 en 20 con p_before / p_before_key: la segunda página empieza donde acaba la primera.
  a := public.cam_party_activity(current_setting('t.q')::uuid, 'all', null, null, null, 3);
  perform pg_temp.check(jsonb_array_length(a->'items') = 3 and (a->>'more')::boolean, 'primera página');
  it := a->'items'->2;
  a := public.cam_party_activity(current_setting('t.q')::uuid, 'all', null, (it->>'created_at')::timestamptz, it->>'key', 20);
  perform pg_temp.check(jsonb_array_length(a->'items') = 5 and not (a->>'more')::boolean, 'segunda página');
end $$;

-- Las tablas de pronósticos siguen privadas: Beto solo ve los suyos.
set local role authenticated;
do $$ begin
  perform pg_temp.check((select count(*) from public.cam_nfl_picks) = 4, 'RLS cam_nfl_picks');
  perform pg_temp.check(not exists (select 1 from public.cam_nfl_picks where user_id <> '7c000000-0000-4000-8000-00000000000b'), 'RLS: nada ajeno');
  perform pg_temp.check((select count(*) from public.cam_football_picks) = 2, 'RLS cam_football_picks');
  begin
    perform * from public.cam_quiniela_score_rows('all');
    raise exception 'FALLO: la función interna de puntos de quiniela es accesible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.cam_quiniela_week_games();
    raise exception 'FALLO: la función interna de la semana es accesible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_profile_quiniela_standing('7c000000-0000-4000-8000-00000000000a');
    raise exception 'FALLO: la función interna del perfil es accesible';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Carla no es miembro: no ve la actividad.
select pg_temp.as_user('7c000000-0000-4000-8000-00000000000c');
set local role authenticated;
do $$ begin
  begin
    perform public.cam_party_activity(current_setting('t.q')::uuid);
    raise exception 'FALLO: un no miembro ve la actividad de quiniela';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Mis parties: posición de esta semana en los de Quiniela
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7c000000-0000-4000-8000-00000000000a');
do $$
declare m jsonb := public.cam_party_mine();
  q jsonb := (select e from jsonb_array_elements(m) e where e->>'id' = current_setting('t.q'));
  p jsonb := (select e from jsonb_array_elements(m) e where e->>'id' = current_setting('t.picks'));
begin
  perform pg_temp.check((q->>'week_position')::int = 1 and (q->>'position')::int = 1 and (q->>'member_count')::int = 2, 'Mis parties: ' || q::text);
  perform pg_temp.check(p ? 'week_position' and p->'week_position' = 'null'::jsonb, 'Picks sin posición semanal');
  -- Un party de Picks no trae «Esta semana».
  perform pg_temp.check(not (public.cam_party_ranking(current_setting('t.picks')::uuid) ? 'week'), 'un party de Picks no trae semana');
end $$;
-- Ana oculta «Solo NFL» de su perfil.
select public.cam_party_set_visibility(current_setting('t.qnfl')::uuid, false);

-- ---------------------------------------------------------------------------
-- 5. Resumen del perfil (cam_profile_overview)
-- ---------------------------------------------------------------------------
insert into public.ae_free_takes(id, user_id, sport, title, body, created_at, hidden, competition) values
  ('7d000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-00000000000a', 'laliga', 'Oculto', 'x', now() - interval '20 days', true, 'LaLiga'),
  ('7d000000-0000-4000-8000-000000000002', '7c000000-0000-4000-8000-00000000000a', 'laliga', 'Mbappé Pichichi', 'x', now() - interval '15 days', false, 'LaLiga'),
  ('7d000000-0000-4000-8000-000000000003', '7c000000-0000-4000-8000-00000000000a', 'champions', 'El Madrid gana la Champions', 'x', now() - interval '10 days', false, 'Champions League'),
  ('7d000000-0000-4000-8000-000000000004', '7c000000-0000-4000-8000-00000000000a', 'nfl', 'Chiefs al Super Bowl', 'x', now() - interval '5 days', false, null),
  ('7d000000-0000-4000-8000-000000000005', '7c000000-0000-4000-8000-00000000000b', 'nfl', 'Take de Beto', 'x', now() - interval '5 days', false, null),
  ('7d000000-0000-4000-8000-000000000006', '7c000000-0000-4000-8000-00000000000b', 'nfl', 'Otro de Beto', 'x', now() - interval '2 days', false, null);
insert into public.ae_take_results(take_id, sport, outcome, points, scored_at) values
  ('7d000000-0000-4000-8000-000000000001', 'football', 'won', 20, now() - interval '3 days'),   -- oculto: no cuenta
  ('7d000000-0000-4000-8000-000000000002', 'football', 'won', 13, now() - interval '4 days'),
  ('7d000000-0000-4000-8000-000000000003', 'football', 'won', 13, now() - interval '1 day'),    -- empate: el más reciente
  ('7d000000-0000-4000-8000-000000000004', 'nfl', 'lost', 0, now() - interval '1 day'),
  ('7d000000-0000-4000-8000-000000000005', 'nfl', 'lost', 0, now() - interval '1 day');
insert into public.ae_free_take_votes(take_id, user_id, value) values
  ('7d000000-0000-4000-8000-000000000002', '7c000000-0000-4000-8000-00000000000b', 1),
  ('7d000000-0000-4000-8000-000000000002', '7c000000-0000-4000-8000-00000000000c', 1),
  ('7d000000-0000-4000-8000-000000000003', '7c000000-0000-4000-8000-00000000000b', 1),
  ('7d000000-0000-4000-8000-000000000004', '7c000000-0000-4000-8000-00000000000c', -1),
  ('7d000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-00000000000c', 1),
  ('7d000000-0000-4000-8000-000000000006', '7c000000-0000-4000-8000-00000000000a', 1);
insert into public.ae_community_picks(id, user_id, author, title, legs, american_odds, created_at, moderation_status, outcome, settled_at, result_points, hidden) values
  ('7e000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-00000000000a', 'q_ana', 'Barça gana', '[{"sport":"Fútbol","event":"Barcelona vs Sevilla","selection":"Barcelona · MONEYLINE (3-WAY)"}]', 140, now() - interval '9 days', 'approved', 'won', now() - interval '8 days', 1.40, false),
  ('7e000000-0000-4000-8000-000000000002', '7c000000-0000-4000-8000-00000000000a', 'q_ana', 'Parlay', '[{"sport":"NFL","event":"KC vs BUF","selection":"KC"}]', 300, now() - interval '7 days', 'approved', 'won', now() - interval '6 days', 3.00, false),
  ('7e000000-0000-4000-8000-000000000003', '7c000000-0000-4000-8000-00000000000a', 'q_ana', 'Oculto', '[]', 900, now() - interval '6 days', 'approved', 'won', now() - interval '5 days', 9.00, true),
  ('7e000000-0000-4000-8000-000000000004', '7c000000-0000-4000-8000-00000000000a', 'q_ana', 'Rechazado', '[]', 100, now() - interval '5 days', 'rejected', 'pending', null, 0, false),
  ('7e000000-0000-4000-8000-000000000005', '7c000000-0000-4000-8000-00000000000a', 'q_ana', 'Fallado', '[]', 150, now() - interval '4 days', 'approved', 'lost', now() - interval '3 days', -1.50, false),
  ('7e000000-0000-4000-8000-000000000006', '7c000000-0000-4000-8000-00000000000a', 'q_ana', 'Pendiente', '[]', 200, now() - interval '1 day', 'pending', 'pending', null, 0, false),
  ('7e000000-0000-4000-8000-000000000007', '7c000000-0000-4000-8000-00000000000b', 'q_beto', 'Último de Beto', '[]', 110, now() - interval '1 day', 'pending', 'pending', null, 0, false);

select pg_temp.as_anon();
set local role anon;
do $$
declare
  o jsonb := public.cam_profile_overview('7c000000-0000-4000-8000-00000000000a');
  b jsonb := public.cam_profile_overview('7c000000-0000-4000-8000-00000000000b');
  d jsonb := public.cam_profile_overview('7c000000-0000-4000-8000-00000000000d');
begin
  perform pg_temp.check(o->>'username' = 'q_ana' and o->>'joined_month' = '2026-10', 'identidad: ' || o::text);
  -- Takes: 3 públicos (el oculto no), 3 apoyos y 1 cuestionamiento.
  perform pg_temp.check((o->'takes'->>'count')::int = 3 and (o->'takes'->>'up')::int = 3 and (o->'takes'->>'down')::int = 1, 'cifras de Takes: ' || (o->'takes')::text);
  perform pg_temp.check(o->'takes'->'top'->>'kind' = 'best' and o->'takes'->'top'->>'title' = 'El Madrid gana la Champions'
                        and (o->'takes'->'top'->>'points')::int = 13, 'mejor Take (empate → el más reciente): ' || (o->'takes'->'top')::text);
  -- Picks: 4 públicos (oculto y rechazado no), 2 acertados y 1 fallado.
  perform pg_temp.check((o->'picks'->>'count')::int = 4 and (o->'picks'->>'won')::int = 2 and (o->'picks'->>'lost')::int = 1, 'cifras de Picks: ' || (o->'picks')::text);
  perform pg_temp.check(o->'picks'->'top'->>'kind' = 'best' and o->'picks'->'top'->>'title' = 'Parlay', 'mejor Pick: ' || (o->'picks'->'top')::text);
  -- Quiniela: 1.º en las dos (solo Ana suma puntos).
  perform pg_temp.check((o->'quiniela'->'nfl'->>'position')::int = 1 and (o->'quiniela'->'nfl'->>'points')::int = 10
                        and (o->'quiniela'->'nfl'->>'hits')::int = 2 and (o->'quiniela'->'nfl'->>'of')::int = 2, 'NFL: ' || (o->'quiniela'->'nfl')::text);
  perform pg_temp.check((o->'quiniela'->'football'->>'points')::int = 11 and (o->'quiniela'->'football'->>'of')::int = 2, 'Fútbol: ' || (o->'quiniela'->'football')::text);
  -- Parties de quiniela visibles: «Los Compas» sí, «Solo NFL» (oculto) no; sin id para un visitante.
  perform pg_temp.check(jsonb_array_length(o->'quiniela'->'parties') = 1 and o->'quiniela'->'parties'->0->>'name' = 'Los Compas 🏈'
                        and o->'quiniela'->'parties'->0->'id' = 'null'::jsonb, 'parties del resumen: ' || (o->'quiniela'->'parties')::text);
  -- Beto: sin Takes acertados → el más apoyado; sin Picks acertados → el último.
  perform pg_temp.check(b->'takes'->'top'->>'kind' = 'supported' and b->'takes'->'top'->>'title' = 'Otro de Beto', 'Take más apoyado: ' || (b->'takes'->'top')::text);
  perform pg_temp.check(b->'picks'->'top'->>'kind' = 'last' and b->'picks'->'top'->>'title' = 'Último de Beto', 'último Pick: ' || (b->'picks'->'top')::text);
  perform pg_temp.check((b->'quiniela'->'nfl'->>'position')::int = 2, 'Beto 2.º en NFL');
  -- Dani no ha participado: todo vacío.
  perform pg_temp.check((d->'takes'->>'count')::int = 0 and d->'takes'->'top' = 'null'::jsonb and d->'picks'->'top' = 'null'::jsonb
                        and d->'quiniela'->'nfl' = 'null'::jsonb and jsonb_array_length(d->'quiniela'->'parties') = 0, 'vacío: ' || d::text);
  perform pg_temp.check(public.cam_profile_overview('7c000000-0000-4000-8000-0000000000ff') is null, 'usuario inexistente');
end $$;
reset role;

-- Beto (miembro) sí recibe el id del party en el resumen de Ana.
select pg_temp.as_user('7c000000-0000-4000-8000-00000000000b');
do $$ begin
  perform pg_temp.check(public.cam_profile_overview('7c000000-0000-4000-8000-00000000000a')->'quiniela'->'parties'->0->>'id' = current_setting('t.q'), 'id para un miembro');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Pestaña Mi Party (cam_profile_party)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7c000000-0000-4000-8000-00000000000a');
do $$
declare v jsonb := public.cam_profile_party('7c000000-0000-4000-8000-00000000000a');
begin
  perform pg_temp.check((v->>'own')::boolean and jsonb_array_length(v->'parties') = 3, 'propio: los 3 parties, también el oculto: ' || (v->'parties')::text);
  perform pg_temp.check(v->'parties'->0->>'kind' = 'quiniela' and v->'parties'->2->>'kind' = 'picks', 'Quiniela primero');
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(v->'parties') e where e->>'name' = 'Solo NFL' and (e->>'show_on_profile') = 'false'), 'oculto marcado');
  perform pg_temp.check((select (e->>'week_position')::int from jsonb_array_elements(v->'parties') e where e->>'name' = 'Los Compas 🏈') = 1, 'posición semanal');
  perform pg_temp.check(jsonb_array_length(v->'recent') = 3
                        and v->'recent'->0->>'pick_label' = 'Empate' and v->'recent'->1->>'away_name' = 'Cowboys'
                        and v->'recent'->2->>'sport' = 'football', '3 últimos resueltos: ' || (v->'recent')::text);
  perform pg_temp.check(v->>'last_sport' = 'nfl', 'último pronóstico: ' || coalesce(v->>'last_sport', 'null'));
  perform pg_temp.check((v->'quiniela'->'football'->>'resolved')::int = 2, 'quiniela compacta');
end $$;

select pg_temp.as_anon();
set local role anon;
do $$
declare v jsonb := public.cam_profile_party('7c000000-0000-4000-8000-00000000000a');
begin
  perform pg_temp.check(not (v->>'own')::boolean and jsonb_array_length(v->'parties') = 2, 'público: sin el oculto: ' || (v->'parties')::text);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(v->'parties') e where e->'id' <> 'null'::jsonb or e ? 'code'), 'sin id ni código para un visitante');
  perform pg_temp.check(v->'last_sport' = 'null'::jsonb, 'sin último pronóstico ajeno');
  -- Ningún pronóstico sin terminar en lo público.
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(v->'recent') e where e->>'state' not in ('won','lost')), 'solo terminados');
end $$;
reset role;

do $$ begin raise notice 'parties-quiniela: OK'; end $$;
rollback;
