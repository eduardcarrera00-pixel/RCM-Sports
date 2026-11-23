-- Pruebas de public.cam_mcp_admin (conector MCP con administración).
-- Se ejecuta con tests/cam-mcp-admin-sql.sh sobre tests/fixtures/cam-mcp-admin-stub.sql.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLA: %', what; end if;
end $$;
create or replace function pg_temp.adm(p_action text, p_args jsonb default '{}') returns jsonb language sql as $$
  select public.cam_mcp_admin(p_action, p_args)
$$;

-- 1 · Solo service_role puede usarla.
do $$
declare denied int := 0; r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', r);
      perform public.cam_mcp_admin('registro', '{}');
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
  end loop;
  perform pg_temp.check(denied = 2, 'anon y authenticated no pueden ejecutar cam_mcp_admin');
  perform pg_temp.check(not has_schema_privilege('authenticated', 'cam_mcp_private', 'usage'), 'el esquema privado no es accesible');
end $$;

set role service_role;

-- 2 · Lectura con la sesión del administrador; la sesión no sobrevive a la transacción.
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_take_review_queue","args":{"p_sport":"football"}}')->'result'->0->>'title') = 'Lamine Yamal Balón de Oro 2026', 'cola de Takes');
select pg_temp.check(auth.uid() is null, 'la sesión del administrador solo dura la transacción');

-- 3 · Lista cerrada de funciones.
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_danger","args":{"p_x":"hola"}}')->>'error') like 'Función no permitida%', 'función fuera de la lista');
select pg_temp.check((pg_temp.adm('nada')->>'error') like 'Acción desconocida%', 'acción desconocida');

-- 4 · Tipos de argumentos y de resultado.
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_set_take_option_points","args":{"p_question_id":"41df762f-a97c-4e3d-8044-842f86470056","p_points":{"a":3,"b":7}}}')->>'result')::int = 2, 'argumento jsonb');
select pg_temp.check(pg_temp.adm('rpc', '{"fn":"rcm_publish_ranking","args":{"p_edition":"Semana 9","p_team_ids":["SF","MIN","BUF"],"p_expected_updated_at":null}}') = '{"ok":true,"result":null}', 'argumento text[] y función void');
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_set_site_image","args":{"p_key":"portada.laurel","p_url":"https://x.test/a.webp"}}')->'result'->>'updated_by') = 'b5b3c2ca-c2bd-418c-b9ea-6b34612b6976', 'resultado compuesto y autor = administrador');
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_classify_free_take","args":{"p_take_id":"7c0d7a44-72e6-45b9-be3b-4392af6b0da7","p_method":"tier","p_tier":"sorpresa"}}')->'result'->0->>'points')::int = 7, 'tabla con valores por defecto');
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_classify_free_take","args":{"p_take_id":"7c0d7a44-72e6-45b9-be3b-4392af6b0da7","p_method":"x"}}')->>'error') like 'Método inválido%', 'el error de la web vuelve como texto');
select pg_temp.check((pg_temp.adm('rpc', '{"fn":"ae_hide_free_take","args":{"p_take_id":"7c0d7a44-72e6-45b9-be3b-4392af6b0da7"}}')->>'result')::boolean, 'ocultar Take');
select pg_temp.check(not (pg_temp.adm('rpc', '{"fn":"ae_hide_free_take","args":{"p_take_id":"7c0d7a44-72e6-45b9-be3b-4392af6b0da7"}}')->>'result')::boolean, 'ocultar dos veces no cambia nada');

-- 5 · Noticias.
create temp table n as select pg_temp.adm('noticia_publicar', '{"title":"Prueba del conector","category":"NFL","body":"<p>Texto</p>","image":"https://x.test/n.jpg","summary":"Resumen"}') as r;
select pg_temp.check((select (r->>'ok')::boolean from n), 'publicar noticia');
select pg_temp.check((select a.created_by = 'b5b3c2ca-c2bd-418c-b9ea-6b34612b6976' and a.author = 'Eduard Carrera' and a.is_public from public.articles a), 'la noticia queda a nombre del administrador');
select pg_temp.check((pg_temp.adm('noticia_publicar', '{"title":"x","category":"Golf","body":"y","image":"https://x.test/n.jpg"}')->>'error') like 'Categoría no válida%', 'categoría no válida');
select pg_temp.check((pg_temp.adm('noticia_publicar', '{"title":"x","category":"NFL","body":"y","image":"http://x.test/n.jpg"}')->>'error') like '%https%', 'imagen sin https');
select pg_temp.check((pg_temp.adm('noticia_editar', jsonb_build_object('id', (select r->'result'->>'id' from n), 'title', 'Título nuevo', 'is_public', false))->'result'->>'title') = 'Título nuevo', 'editar noticia');
select pg_temp.check((select a.body = '<p>Texto</p>' and not a.is_public from public.articles a), 'editar solo cambia lo indicado');
select pg_temp.check((pg_temp.adm('noticia_ver', jsonb_build_object('id', (select r->'result'->>'id' from n)))->'result'->>'summary') = 'Resumen', 'ver noticia oculta');
select pg_temp.check((pg_temp.adm('noticia_borrar', jsonb_build_object('id', (select r->'result'->>'id' from n)))->'result'->>'title') = 'Título nuevo', 'borrar noticia');
select pg_temp.check(not exists (select 1 from public.articles), 'la noticia ya no está');

-- 6 · Picks pendientes y moderación directa.
reset role;
insert into public.ae_community_picks (id, author, title, moderation_status, outcome, event_date) values
  ('cd962c8e-fda7-4e08-9b5d-bfb02d1b7bd2', 'ana', 'PSG v Barcelona', 'approved', 'pending', current_date - 1),
  ('cd962c8e-fda7-4e08-9b5d-bfb02d1b7bd3', 'leo', 'Chiefs @ Bills', 'pending', 'pending', current_date + 3),
  ('cd962c8e-fda7-4e08-9b5d-bfb02d1b7bd4', 'eva', 'Final', 'approved', 'pending', current_date + 2);
set role service_role;
create temp table pp as select pg_temp.adm('picks_pendientes')->'result' as r;
select pg_temp.check((select jsonb_array_length(r->'por_moderar') = 1 and jsonb_array_length(r->'por_resolver') = 1 and (r->>'por_jugarse')::int = 1 from pp), 'picks pendientes');
select pg_temp.check((pg_temp.adm('pick_ocultar', '{"id":"cd962c8e-fda7-4e08-9b5d-bfb02d1b7bd2"}')->'result'->>'author') = 'ana', 'ocultar Pick');
select pg_temp.check((pg_temp.adm('pick_ocultar', '{"id":"cd962c8e-fda7-4e08-9b5d-bfb02d1b7bd2"}')->>'error') like '%ya está oculto%', 'ocultar Pick dos veces');

-- 7 · Redes: pausar y reanudar promociones, mensajes.
select pg_temp.check((pg_temp.adm('redes_promos', '{"active":true}')->'result'->>'promos_activas')::boolean, 'reanudar promociones');
reset role;
select pg_temp.check((select active from cron.job where jobid = 3) and (select bool_and(enabled) from cam_social.promo_slots), 'tarea y horas activas');
set role service_role;
select pg_temp.check((pg_temp.adm('redes_promos', '{"active":false}')->'result'->>'entregas_canceladas')::int = 1, 'pausar cancela lo que estaba en cola');
reset role;
select pg_temp.check(not (select active from cron.job where jobid = 3) and (select status from cam_social.deliveries where event_key = 'article:abc') = 'queued', 'solo se cancelan promociones');
set role service_role;
select pg_temp.check((pg_temp.adm('redes_mensaje', '{"new":true,"id":"prueba-noticia","theme":"noticias","kicker":"NOVEDAD","headline":"Lo último de CAM","x_text":"📰 {noticia} y mucho más en CAM Sports","caption":"Texto largo para Instagram y TikTok."}')->'result'->>'needs_news')::boolean, 'mensaje nuevo con {noticia}');
select pg_temp.check((pg_temp.adm('redes_mensaje', '{"id":"prueba-noticia","x_text":"Un texto sin titular de noticia, nada más"}')->'result'->>'x_text') like 'Un texto%', 'editar mensaje');
reset role;
select pg_temp.check(not (select needs_news from cam_social.promos where id = 'prueba-noticia'), 'needs_news se recalcula');
set role service_role;
select pg_temp.check((pg_temp.adm('redes_mensaje', '{"id":"prueba-noticia","x_text":"corto"}')->>'error') is not null, 'las reglas de la tabla siguen valiendo');
select pg_temp.check((pg_temp.adm('redes_todo', '{"active":false}')->'result'->>'publicaciones_automaticas')::boolean = false, 'pausar todo');
select pg_temp.check((pg_temp.adm('redes_estado')->'result'->'general'->>'enabled')::boolean = false, 'estado de redes');

-- 8 · Registro: los cambios (también los fallidos) sí, las consultas no.
reset role;
select pg_temp.check((select count(*) from cam_mcp_private.admin_log where action = 'rpc:ae_take_review_queue') = 0, 'las consultas no se registran');
select pg_temp.check((select count(*) from cam_mcp_private.admin_log where action = 'rpc:ae_danger' and not ok) = 1, 'lo rechazado se registra');
select pg_temp.check((select count(*) from cam_mcp_private.admin_log where action = 'rpc:ae_classify_free_take' and not ok and error like 'Método%') = 1, 'el error de la web se registra');
select pg_temp.check((select count(*) from cam_mcp_private.admin_log where action = 'noticia_publicar' and ok) = 1, 'la publicación se registra');
set role service_role;
select pg_temp.check(jsonb_array_length(pg_temp.adm('registro', '{"limit":5}')->'result') = 5, 'leer el registro');

-- 9 · Si la cuenta deja de ser administradora, no hace nada.
reset role;
update cam_mcp_private.config set actor_id = '11111111-1111-4111-8111-111111111111';
set role service_role;
do $$ begin
  perform public.cam_mcp_admin('registro', '{}');
  raise exception 'FALLA: una cuenta sin permiso de administrador no debe poder usarlo';
exception when others then
  if sqlerrm not like '%ya no es administradora%' then raise; end if;
end $$;
reset role;

\echo 'cam-mcp-admin.sql: OK'
