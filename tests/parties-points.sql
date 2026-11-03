-- Parties · reglas de puntos, actividad y acciones (PostgreSQL local con
-- tests/fixtures/parties-stub.sql; lo ejecuta tests/parties-sql.sh).
-- Se deshace al final (ROLLBACK). Cualquier fallo detiene psql con «FALLO: …».

\set ON_ERROR_STOP 1
begin;

-- Utilidad: actuar como un usuario concreto.
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLO: %', msg; end if;
end $$;

insert into auth.users(id, raw_user_meta_data) values
  ('7b000000-0000-4000-8000-00000000000a', '{"username":"ana"}'),
  ('7b000000-0000-4000-8000-00000000000b', '{"username":"beto"}'),
  ('7b000000-0000-4000-8000-00000000000c', '{"username":"carla"}'),
  ('7b000000-0000-4000-8000-00000000000d', '{"username":"dani"}');
insert into public.ae_auth_accounts(username, user_id) values ('ana', '7b000000-0000-4000-8000-00000000000a');

-- ---------------------------------------------------------------------------
-- 1. Nombres y creación
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000a');
do $$
declare v jsonb;
begin
  begin
    perform public.cam_party_create('ab', 'picks', 'all');
    raise exception 'FALLO: nombre de 2 caracteres aceptado';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cam_party_create(repeat('x', 41), 'picks', 'all');
    raise exception 'FALLO: nombre de 41 caracteres aceptado';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cam_party_create('Los del barrio', 'torneo', 'all');
    raise exception 'FALLO: tipo desconocido aceptado';
  exception when invalid_parameter_value then null;
  end;
  v := public.cam_party_create(E'  Los   del\tbarrio ⚽🏈  ', 'picks', 'football');
  perform pg_temp.check((select name from public.cam_parties where id = (v->>'id')::uuid) = 'Los del barrio ⚽🏈', 'nombre limpio con emojis');
  perform pg_temp.check(v->>'code' ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'código de 6 sin letras confusas');
  perform set_config('t.picks', v->>'id', true);
  perform set_config('t.picks_code', v->>'code', true);
  v := public.cam_party_create('Takes NFL', 'takes', 'nfl');
  perform set_config('t.takes', v->>'id', true);
  perform set_config('t.takes_code', v->>'code', true);
end $$;

-- Fechas fijas para poder razonar: Ana entró hace 30 días, Beto hace 10.
update public.cam_party_members set joined_at = now() - interval '30 days'
 where user_id = '7b000000-0000-4000-8000-00000000000a';

select pg_temp.as_user('7b000000-0000-4000-8000-00000000000b');
select public.cam_party_join(lower(current_setting('t.picks_code')));   -- minúsculas también valen
select public.cam_party_join(current_setting('t.takes_code'));
update public.cam_party_members set joined_at = now() - interval '10 days'
 where user_id = '7b000000-0000-4000-8000-00000000000b';

-- ---------------------------------------------------------------------------
-- 2. Picks: solo lo publicado tras entrar; mismos puntos que Mejores Chefs
-- ---------------------------------------------------------------------------
insert into public.ae_community_picks(user_id, author, title, legs, american_odds, created_at, moderation_status, outcome, settled_at, settled_by, result_points) values
  -- Ana: dentro del party (después de entrar), resueltos este mes.
  ('7b000000-0000-4000-8000-00000000000a','ana','A1','[{"sport":"Fútbol","event":"X vs Y","selection":"X"}]',250, now()-interval '20 days','approved','won', now(), '7b000000-0000-4000-8000-00000000000a', 2.50),
  ('7b000000-0000-4000-8000-00000000000a','ana','A2','[{"sport":"Fútbol","event":"Z vs W","selection":"W"}]',-150, now()-interval '5 days','approved','lost', now(), '7b000000-0000-4000-8000-00000000000a', -1.50),
  -- Ana: antes de entrar (no cuenta en el party, sí en la general).
  ('7b000000-0000-4000-8000-00000000000a','ana','A0','[{"sport":"Fútbol","event":"Viejo","selection":"V"}]',400, now()-interval '60 days','approved','won', now()-interval '40 days', '7b000000-0000-4000-8000-00000000000a', 4.00),
  -- Ana: NFL (no cuenta en un party de fútbol).
  ('7b000000-0000-4000-8000-00000000000a','ana','A3','[{"sport":"NFL","event":"KC vs BUF","selection":"KC"}]',120, now()-interval '4 days','approved','won', now(), '7b000000-0000-4000-8000-00000000000a', 1.20),
  -- Ana: resuelto hace más de un mes (solo «Total»).
  ('7b000000-0000-4000-8000-00000000000a','ana','A4','[{"sport":"Fútbol","event":"Mes pasado","selection":"M"}]',300, now()-interval '29 days','approved','won', now()-interval '40 days', '7b000000-0000-4000-8000-00000000000a', 3.00),
  -- Beto: dentro, ganado; empate en puntos con Ana este mes se rompe por aciertos.
  ('7b000000-0000-4000-8000-00000000000b','beto','B1','[{"sport":"Fútbol","event":"P vs Q","selection":"P"}]',100, now()-interval '3 days','approved','won', now(), '7b000000-0000-4000-8000-00000000000b', 1.00),
  -- Beto: pendiente de moderación (se ve en la actividad, no puntúa).
  ('7b000000-0000-4000-8000-00000000000b','beto','B2','[{"sport":"Fútbol","event":"R vs S","selection":"R"}]',200, now()-interval '2 days','pending','pending', null, null, 0),
  -- Beto: oculto (ni se ve ni cuenta).
  ('7b000000-0000-4000-8000-00000000000b','beto','B3','[{"sport":"Fútbol","event":"Oculto","selection":"O"}]',200, now()-interval '1 days','approved','won', now(), '7b000000-0000-4000-8000-00000000000b', 2.00);
update public.ae_community_picks set hidden = true where title = 'B3';

do $$
declare r jsonb; total jsonb; month jsonb;
begin
  -- Equivalencia con la clasificación general.
  perform pg_temp.check(not exists (
    select 1 from public.ae_pick_result_ranking('all') g
    full join (select user_id, sum(points)::numeric(12,2) pts, count(*) filter (where outcome='won') c, count(*) n
                 from public.ae_pick_score_rows('all') group by user_id) s using (user_id)
    where g.points is distinct from s.pts or g.correct_picks is distinct from s.c or g.total_resolved is distinct from s.n),
    'ae_pick_score_rows coincide con ae_pick_result_ranking (total)');
  perform pg_temp.check(not exists (
    select 1 from public.ae_pick_result_ranking('month') g
    full join (select user_id, sum(points)::numeric(12,2) pts from public.ae_pick_score_rows('month') group by user_id) s using (user_id)
    where g.points is distinct from s.pts),
    'ae_pick_score_rows coincide con ae_pick_result_ranking (mes)');

  r := public.cam_party_ranking(current_setting('t.picks')::uuid);
  total := r->'total'; month := r->'month';
  -- Total: Ana A1 + A2 + A4 = 2.50 - 1.50 + 3.00 = 4.00 (3 intentos, 2 aciertos).
  perform pg_temp.check((total->0->>'username') = 'ana' and (total->0->>'points')::numeric = 4.00
    and (total->0->>'correct')::int = 2 and (total->0->>'attempts')::int = 3, 'total de Ana: ' || total::text);
  perform pg_temp.check((total->1->>'username') = 'beto' and (total->1->>'points')::numeric = 1.00, 'total de Beto');
  -- Mes: Ana 2.50 - 1.50 = 1.00 (1 acierto); Beto 1.00 (1 acierto). Empate en
  -- puntos y aciertos: gana quien entró antes (Ana).
  perform pg_temp.check((month->0->>'username') = 'ana' and (month->0->>'points')::numeric = 1.00
    and (month->1->>'username') = 'beto' and (month->1->>'points')::numeric = 1.00, 'mes con desempate por antigüedad: ' || month::text);
  perform pg_temp.check((r->'party'->>'member_count')::int = 2 and (r->'party'->>'is_member')::boolean, 'cabecera');
end $$;

-- Actividad del party de Picks.
do $$
declare a jsonb;
begin
  a := public.cam_party_activity(current_setting('t.picks')::uuid);
  -- Visibles: B2, B1, A2, A1, A4. Ni A3 (NFL), ni A0 (antes de entrar), ni B3 (oculto).
  perform pg_temp.check((select string_agg(x->>'title', ',' order by ord) from jsonb_array_elements(a->'items') with ordinality t(x, ord))
    = 'B2,B1,A2,A1,A4', 'actividad de Picks: ' || (a->'items')::text);
  a := public.cam_party_activity(current_setting('t.picks')::uuid, 'pending');
  perform pg_temp.check(jsonb_array_length(a->'items') = 1 and a->'items'->0->>'title' = 'B2', 'filtro Pendientes');
  a := public.cam_party_activity(current_setting('t.picks')::uuid, 'resolved', '7b000000-0000-4000-8000-00000000000a');
  perform pg_temp.check(jsonb_array_length(a->'items') = 3, 'filtro Resueltos + miembro');
  -- Paginación de 2 en 2.
  a := public.cam_party_activity(current_setting('t.picks')::uuid, 'all', null, null, null, 2);
  perform pg_temp.check(jsonb_array_length(a->'items') = 2 and (a->>'more')::boolean, 'primera página');
  a := public.cam_party_activity(current_setting('t.picks')::uuid, 'all', null,
         (a->'items'->1->>'created_at')::timestamptz, a->'items'->1->>'key', 2);
  perform pg_temp.check((a->'items'->0->>'title') = 'A2' and (a->>'more')::boolean, 'segunda página: ' || (a->'items')::text);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Takes (party NFL): libres puntuados + «¿Quién será campeón?»
-- ---------------------------------------------------------------------------
insert into public.ae_free_takes(id, user_id, sport, title, body, created_at) values
  ('7c000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-00000000000b','nfl','Take NFL acertado','Los Chiefs ganan el Super Bowl seguro.', now()-interval '5 days'),
  ('7c000000-0000-4000-8000-000000000002','7b000000-0000-4000-8000-00000000000b','nfl','Take NFL viejo','Publicado antes de entrar al party.', now()-interval '15 days'),
  ('7c000000-0000-4000-8000-000000000003','7b000000-0000-4000-8000-00000000000b','laliga','Take de fútbol','No es de NFL y no cuenta aquí.', now()-interval '4 days'),
  ('7c000000-0000-4000-8000-000000000004','7b000000-0000-4000-8000-00000000000a','nfl','Take NFL pendiente','Todavía sin resultado confirmado.', now()-interval '2 days'),
  ('7c000000-0000-4000-8000-000000000005','7b000000-0000-4000-8000-00000000000a','nfl','Take oculto','Oculto por moderación, no se ve.', now()-interval '2 days');
update public.ae_free_takes set hidden = true where id = '7c000000-0000-4000-8000-000000000005';
insert into public.ae_take_results(take_id, sport, outcome, points, scored_at) values
  ('7c000000-0000-4000-8000-000000000001','nfl','won',13, now()),
  ('7c000000-0000-4000-8000-000000000002','nfl','won',20, now()),
  ('7c000000-0000-4000-8000-000000000003','football','won',10, now()),
  ('7c000000-0000-4000-8000-000000000005','nfl','won',6, now());
insert into public.ae_take_questions(id, competition, period, prompt, closes_at, points, status, settled_at) values
  ('7d000000-0000-4000-8000-000000000001','nfl','season','¿Quién será campeón de la NFL?', now()-interval '1 day', 5, 'settled', now());
insert into public.ae_take_options(id, question_id, label, points) values
  ('7e000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001','Kansas City Chiefs',4);
insert into public.ae_take_predictions(question_id, user_id, option_id, created_at, awarded_points) values
  ('7d000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-00000000000a','7e000000-0000-4000-8000-000000000001', now()-interval '25 days', 4);

do $$
declare r jsonb; a jsonb;
begin
  r := public.cam_party_ranking(current_setting('t.takes')::uuid);
  -- Beto: 13 (el de 20 es anterior a su entrada; el de fútbol no es NFL).
  -- Ana: campeón 4 pts (el Take oculto no cuenta).
  perform pg_temp.check(r->'total'->0->>'username' = 'beto' and (r->'total'->0->>'points')::numeric = 13
    and r->'total'->1->>'username' = 'ana' and (r->'total'->1->>'points')::numeric = 4, 'Takes NFL: ' || (r->'total')::text);
  a := public.cam_party_activity(current_setting('t.takes')::uuid);
  perform pg_temp.check((select string_agg(x->>'title', ',' order by ord) from jsonb_array_elements(a->'items') with ordinality t(x, ord))
    = 'Take NFL pendiente,Take NFL acertado,Campeón · Kansas City Chiefs', 'actividad de Takes: ' || (a->'items')::text);
  a := public.cam_party_activity(current_setting('t.takes')::uuid, 'resolved');
  perform pg_temp.check(jsonb_array_length(a->'items') = 2, 'Takes resueltos');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Salir y volver: se empieza de cero
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000b');
select public.cam_party_leave(current_setting('t.takes')::uuid);
select public.cam_party_join(current_setting('t.takes_code'));
do $$
declare r jsonb;
begin
  r := public.cam_party_ranking(current_setting('t.takes')::uuid);
  perform pg_temp.check((select (x->>'points')::numeric from jsonb_array_elements(r->'total') x where x->>'username' = 'beto') = 0,
    'al volver Beto empieza de cero');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Opciones del creador, visibilidad y traspaso
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000b');
do $$ begin
  begin
    perform public.cam_party_rename(current_setting('t.picks')::uuid, 'Intento');
    raise exception 'FALLO: un miembro renombra';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_party_kick(current_setting('t.picks')::uuid, '7b000000-0000-4000-8000-00000000000a');
    raise exception 'FALLO: un miembro expulsa';
  exception when insufficient_privilege then null;
  end;
  -- Ocultar del perfil.
  perform public.cam_party_set_visibility(current_setting('t.picks')::uuid, false);
  perform pg_temp.check(jsonb_array_length(public.cam_party_public_list('7b000000-0000-4000-8000-00000000000b')) = 1,
    'perfil público de Beto sin el party oculto');
  perform pg_temp.check((select count(*) from jsonb_array_elements(public.cam_party_mine())) = 2, 'mis parties siguen siendo 2');
end $$;

select pg_temp.as_user('7b000000-0000-4000-8000-00000000000a');
do $$
declare old_code text := current_setting('t.picks_code'); v jsonb;
begin
  perform public.cam_party_rename(current_setting('t.picks')::uuid, 'Nuevo nombre');
  v := public.cam_party_new_code(current_setting('t.picks')::uuid);
  perform pg_temp.check(v->>'code' <> old_code, 'código nuevo');
  perform pg_temp.check(public.cam_party_preview(old_code)->>'status' = 'not_found', 'el enlace viejo deja de valer');
  perform pg_temp.check(public.cam_party_preview(v->>'code')->>'name' = 'Nuevo nombre', 'el enlace nuevo vale');
  perform set_config('t.picks_code', v->>'code', true);
  -- Mis parties: posición «1.º de 2».
  perform pg_temp.check((select (x->>'position')::int from jsonb_array_elements(public.cam_party_mine()) x
                          where x->>'id' = current_setting('t.picks')) = 1, 'posición en mis parties');
  -- El creador se va: el party pasa al miembro más antiguo (Beto).
  perform public.cam_party_leave(current_setting('t.picks')::uuid);
end $$;
do $$ begin
  perform pg_temp.check((select owner_id from public.cam_parties where id = current_setting('t.picks')::uuid)
    = '7b000000-0000-4000-8000-00000000000b', 'traspaso al miembro más antiguo');
end $$;
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000b');
do $$ begin
  perform pg_temp.check((public.cam_party_leave(current_setting('t.picks')::uuid)->>'deleted')::boolean, 'sin miembros se borra');
  perform pg_temp.check(not exists (select 1 from public.cam_parties where id = current_setting('t.picks')::uuid), 'borrado');
end $$;

-- Expulsar.
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.cam_party_kick(current_setting('t.takes')::uuid, '7b000000-0000-4000-8000-00000000000b');
  perform pg_temp.check((select count(*) from public.cam_party_members where party_id = current_setting('t.takes')::uuid) = 1, 'expulsado');
  begin
    perform public.cam_party_kick(current_setting('t.takes')::uuid, '7b000000-0000-4000-8000-00000000000a');
    raise exception 'FALLO: el creador se expulsa a sí mismo';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Límites: 10 creados, 20 en total, 50 miembros, 20 códigos fallidos
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000c');
do $$ begin
  for i in 1..10 loop perform public.cam_party_create('Party ' || i, 'takes', 'all'); end loop;
  begin
    perform public.cam_party_create('Party 11', 'takes', 'all');
    raise exception 'FALLO: se crearon 11 parties';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- Dani está en 20 parties: no puede unirse a uno más.
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000d');
do $$
declare c text;
begin
  for c in select code from public.cam_parties where owner_id = '7b000000-0000-4000-8000-00000000000c' loop
    perform public.cam_party_join(c);
  end loop;
  for i in 1..10 loop perform public.cam_party_create('Dani ' || i, 'picks', 'all'); end loop;
  perform pg_temp.check((select count(*) from public.cam_party_members where user_id = '7b000000-0000-4000-8000-00000000000d') = 20, '20 parties');
  begin
    perform public.cam_party_join(current_setting('t.takes_code'));
    raise exception 'FALLO: 21 parties';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- 50 miembros como máximo.
do $$
declare v_party uuid := current_setting('t.takes')::uuid;
begin
  insert into auth.users(id) select ('7f000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 50) i;
  insert into public.cam_party_members(party_id, user_id)
    select v_party, ('7f000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 49) i;
  perform pg_temp.as_user('7f000000-0000-4000-8000-000000000050');
  begin
    perform public.cam_party_join(current_setting('t.takes_code'));
    raise exception 'FALLO: miembro 51';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.check((public.cam_party_preview(current_setting('t.takes_code'))->>'is_full')::boolean, 'la invitación dice que está lleno');
end $$;

-- Códigos al azar: al fallo 21 dentro de una hora se bloquea.
select pg_temp.as_user('7b000000-0000-4000-8000-00000000000c');
do $$
declare blocked boolean := false;
begin
  for i in 1..20 loop
    perform pg_temp.check(public.cam_party_preview('ZZZZZ' || substr('ABCDEFGHJKMNPQRSTUVW', i, 1))->>'status' = 'not_found', 'código falso');
  end loop;
  begin
    perform public.cam_party_preview(current_setting('t.takes_code'));
  exception when raise_exception then blocked := sqlerrm like 'Demasiados%';
  end;
  perform pg_temp.check(blocked, 'límite de intentos');
end $$;

do $$ begin raise notice 'parties-points: OK'; end $$;
rollback;
