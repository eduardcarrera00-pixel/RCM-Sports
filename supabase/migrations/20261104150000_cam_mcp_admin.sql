-- CAM Sports · conector MCP con administración (4 nov 2026).
--
-- El conector (Edge Function cam-mcp) llama con la clave secreta a
-- public.cam_mcp_admin(acción, argumentos), ejecutable solo por service_role.
-- Esa función actúa como la cuenta de administrador guardada en
-- cam_mcp_private.config: pone sus «claims» de sesión solo durante esta
-- transacción (auth.uid() = esa cuenta) y llama a las mismas funciones que usa
-- la web, que siguen comprobando rcm_is_editor() por dentro. Así todas las reglas
-- de la web (cierres, bloqueos, validaciones) valen igual desde Claude.
--
-- Cada cambio queda en cam_mcp_private.admin_log, también los que fallan (el
-- cambio se deshace, el registro se conserva). Las consultas no se registran.

create schema if not exists cam_mcp_private;
revoke all on schema cam_mcp_private from public;
revoke all on schema cam_mcp_private from anon, authenticated;

create table if not exists cam_mcp_private.config (
  id boolean primary key default true check (id),
  actor_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- Cuenta con la que actúa el conector: la del dueño (eduardcarrera00).
insert into cam_mcp_private.config (id, actor_id)
select true, u.id from auth.users u where u.id = 'b5b3c2ca-c2bd-418c-b9ea-6b34612b6976'
on conflict (id) do nothing;

create table if not exists cam_mcp_private.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  args jsonb not null default '{}'::jsonb,
  ok boolean not null,
  error text
);
create index if not exists admin_log_at_idx on cam_mcp_private.admin_log (at desc);

alter table cam_mcp_private.config enable row level security;
alter table cam_mcp_private.admin_log enable row level security;
revoke all on all tables in schema cam_mcp_private from public;
revoke all on all tables in schema cam_mcp_private from anon, authenticated;

-- ───────────────────────── llamada genérica a una función de la web ─────────────────────────
-- Llama a public.<p_fn> con argumentos con nombre tomados de p_args (las claves son los
-- nombres de los parámetros, p. ej. {"p_take_id": "…"}). Los valores viajan como parámetro
-- ($1), nunca dentro del texto SQL. Solo la usa cam_mcp_private.run con una lista cerrada.
create or replace function cam_mcp_private.call_rpc(p_fn text, p_args jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_oid oid;
  v_retset boolean;
  v_rettype oid;
  v_count int;
  v_call text;
  v_res jsonb;
begin
  select count(*) into v_count
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_fn;
  if v_count = 0 then raise exception 'La función % no existe', p_fn; end if;
  if v_count > 1 then raise exception 'La función % tiene varias versiones', p_fn; end if;

  select p.oid, p.proretset, p.prorettype into v_oid, v_retset, v_rettype
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_fn;

  select coalesce(pg_catalog.string_agg(pg_catalog.format('%I => %s', a.name,
           case
             when a.typ = 'jsonb'::pg_catalog.regtype then pg_catalog.format('($1->%L)', a.name)
             when t.typcategory = 'A' then pg_catalog.format(
               '(case when pg_catalog.jsonb_typeof($1->%L) = ''array'' then (select coalesce(pg_catalog.array_agg(x), ''{}'') from pg_catalog.jsonb_array_elements_text($1->%L) x) end)::%s',
               a.name, a.name, pg_catalog.format_type(a.typ, null))
             else pg_catalog.format('($1->>%L)::%s', a.name, pg_catalog.format_type(a.typ, null))
           end), ', ' order by a.ord), '')
    into v_call
    from pg_catalog.pg_proc p
    -- Sin esquema delante: el unnest de varios arreglos a la vez solo existe así.
    cross join lateral unnest(
      coalesce(p.proallargtypes, p.proargtypes::pg_catalog.oid[]),
      p.proargnames,
      coalesce(p.proargmodes, pg_catalog.array_fill('i'::"char", array[p.pronargs::int]))
    ) with ordinality as a(typ, name, mode, ord)
    join pg_catalog.pg_type t on t.oid = a.typ
   where p.oid = v_oid and a.mode in ('i', 'b') and p_args ? a.name;

  if v_retset then
    execute pg_catalog.format('select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)), ''[]''::jsonb) from public.%I(%s) r', p_fn, v_call)
      into v_res using p_args;
  elsif v_rettype = 'void'::pg_catalog.regtype then
    execute pg_catalog.format('select public.%I(%s)', p_fn, v_call) using p_args;
    v_res := 'null'::jsonb;
  else
    execute pg_catalog.format('select pg_catalog.to_jsonb(public.%I(%s))', p_fn, v_call) into v_res using p_args;
  end if;
  return v_res;
end;
$$;

-- ───────────────────────── acciones ─────────────────────────
create or replace function cam_mcp_private.run(p_action text, a jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- Funciones de la web que el conector puede usar (todas comprueban rcm_is_editor() o son de lectura).
  allowed constant text[] := array[
    -- Takes
    'ae_take_review_queue', 'ae_classify_free_take', 'ae_score_free_take_auto', 'ae_hide_free_take', 'ae_hide_take_reply',
    -- ¿Quién será campeón? y matrices de posiciones
    'ae_create_take', 'ae_set_take_option_points', 'ae_settle_take', 'ae_void_take', 'ae_publish_outlook', 'ae_outlook_points_matrix',
    -- Quinielas
    'cam_nfl_admin_odds', 'cam_nfl_admin_open', 'cam_nfl_admin_result', 'cam_nfl_admin_fix_game',
    'cam_football_admin_odds', 'cam_football_admin_open', 'cam_football_admin_points', 'cam_football_admin_result', 'cam_football_admin_fix_game',
    -- Picks y Pick del editor
    'ae_moderate_community_pick', 'ae_pick_settle_result', 'ae_pick_set_legacy_event_date', 'ae_finalize_community_pick_week',
    'cam_resolve_weekly_pick', 'cam_admin_weekly_results', 'ae_publish_editorial_weekly_pick_visual_v2', 'ae_update_editorial_weekly_pick',
    -- Power Rankings
    'rcm_publish_ranking', 'ae_publish_champions_ranking',
    -- Opiniones
    'ae_publish_opinion', 'ae_update_opinion', 'ae_delete_opinion',
    -- Sitio
    'ae_set_category_visibility', 'cam_set_site_text', 'cam_reset_site_text', 'ae_set_site_image', 'ae_reset_site_image',
    -- Redes y parties
    'cam_social_status', 'cam_party_admin_list', 'cam_party_delete'
  ];
  categories constant text[] := array['Picks', 'Fútbol', 'Fútbol Americano Colegial', 'NFL', 'Básquetbol', 'Tenis', 'Ciclismo'];
  v_id uuid;
  v_text text;
  v_on boolean;
  v_job bigint;
  v_n int;
  v_row jsonb;
  v_limit int := least(greatest(coalesce((a->>'limit')::int, 20), 1), 100);
  v_today date := (pg_catalog.now() at time zone 'America/Toronto')::date;
begin
  case p_action

  when 'rpc' then
    if not coalesce(a->>'fn', '') = any (allowed) then
      raise exception 'Función no permitida desde el conector: %', coalesce(a->>'fn', '(vacía)');
    end if;
    return cam_mcp_private.call_rpc(a->>'fn', coalesce(a->'args', '{}'::jsonb));

  -- ── Noticias (la web escribe directamente en public.articles) ──
  when 'noticia_ver' then
    if a ? 'id' then
      select pg_catalog.to_jsonb(x) into v_row from public.articles x where x.id = (a->>'id')::uuid;
      if v_row is null then raise exception 'No existe esa noticia'; end if;
      return v_row;
    end if;
    return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', x.id, 'title', x.title, 'category', x.category, 'author', x.author, 'is_public', x.is_public,
              'featured', x.featured, 'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
              from (select * from public.articles order by created_at desc limit v_limit) x);

  when 'noticia_publicar' then
    if nullif(pg_catalog.btrim(a->>'title'), '') is null or nullif(pg_catalog.btrim(a->>'body'), '') is null then
      raise exception 'Faltan el título o el texto';
    end if;
    if not coalesce(a->>'category', '') = any (categories) then
      raise exception 'Categoría no válida (usa: %)', pg_catalog.array_to_string(categories, ', ');
    end if;
    if coalesce(a->>'image', '') !~ '^https://' then raise exception 'La imagen debe ser un enlace https'; end if;
    insert into public.articles (title, category, author, image, summary, body, football_team, featured, is_public,
                                 image_focus_x, image_focus_y, created_by)
    values (pg_catalog.btrim(a->>'title'), a->>'category', coalesce(nullif(pg_catalog.btrim(a->>'author'), ''), 'Eduard Carrera'),
            a->>'image', coalesce(a->>'summary', ''), a->>'body', nullif(a->>'football_team', ''),
            coalesce((a->>'featured')::boolean, false), coalesce((a->>'is_public')::boolean, true),
            coalesce((a->>'image_focus_x')::int, 50), coalesce((a->>'image_focus_y')::int, 50), (select auth.uid()))
    returning pg_catalog.jsonb_build_object('id', id, 'title', title, 'category', category, 'is_public', is_public, 'created_at', created_at)
      into v_row;
    return v_row;

  when 'noticia_editar' then
    v_id := (a->>'id')::uuid;
    if a ? 'category' and not coalesce(a->>'category', '') = any (categories) then
      raise exception 'Categoría no válida (usa: %)', pg_catalog.array_to_string(categories, ', ');
    end if;
    if a ? 'image' and coalesce(a->>'image', '') !~ '^https://' then raise exception 'La imagen debe ser un enlace https'; end if;
    if a ? 'title' and nullif(pg_catalog.btrim(a->>'title'), '') is null then raise exception 'El título no puede quedar vacío'; end if;
    if a ? 'body' and nullif(pg_catalog.btrim(a->>'body'), '') is null then raise exception 'El texto no puede quedar vacío'; end if;
    update public.articles x set
      title = case when a ? 'title' then pg_catalog.btrim(a->>'title') else x.title end,
      category = case when a ? 'category' then a->>'category' else x.category end,
      author = case when a ? 'author' then coalesce(nullif(pg_catalog.btrim(a->>'author'), ''), x.author) else x.author end,
      image = case when a ? 'image' then a->>'image' else x.image end,
      summary = case when a ? 'summary' then coalesce(a->>'summary', '') else x.summary end,
      body = case when a ? 'body' then a->>'body' else x.body end,
      football_team = case when a ? 'football_team' then nullif(a->>'football_team', '')
                           when a ? 'category' and a->>'category' <> 'Fútbol' then null else x.football_team end,
      featured = case when a ? 'featured' then (a->>'featured')::boolean else x.featured end,
      is_public = case when a ? 'is_public' then (a->>'is_public')::boolean else x.is_public end,
      image_focus_x = case when a ? 'image_focus_x' then (a->>'image_focus_x')::int else x.image_focus_x end,
      image_focus_y = case when a ? 'image_focus_y' then (a->>'image_focus_y')::int else x.image_focus_y end
    where x.id = v_id
    returning pg_catalog.jsonb_build_object('id', x.id, 'title', x.title, 'category', x.category, 'is_public', x.is_public) into v_row;
    if v_row is null then raise exception 'No existe esa noticia'; end if;
    return v_row;

  when 'noticia_borrar' then
    delete from public.articles x where x.id = (a->>'id')::uuid
    returning pg_catalog.jsonb_build_object('id', x.id, 'title', x.title) into v_row;
    if v_row is null then raise exception 'No existe esa noticia'; end if;
    return v_row;

  when 'comentario_noticia_borrar' then
    delete from public.comments c where c.id = (a->>'id')::uuid
    returning pg_catalog.jsonb_build_object('id', c.id, 'author', c.author, 'body', pg_catalog.left(c.body, 200)) into v_row;
    if v_row is null then raise exception 'No existe ese comentario'; end if;
    return v_row;

  -- ── Picks ──
  when 'picks_pendientes' then
    return pg_catalog.jsonb_build_object(
      'por_moderar', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
        select p.id, p.author, p.title, p.legs, p.american_odds, p.event_date, p.created_at
          from public.ae_community_picks p where not p.hidden and p.moderation_status = 'pending'
         order by p.created_at desc limit v_limit) x),
      'por_resolver', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.event_date nulls first, x.created_at), '[]'::jsonb) from (
        select p.id, p.author, p.title, p.legs, p.american_odds, p.event_date, p.created_at
          from public.ae_community_picks p
         where not p.hidden and p.moderation_status = 'approved' and p.outcome = 'pending'
           and (p.event_date is null or p.event_date <= v_today)
         order by p.event_date nulls first, p.created_at limit v_limit) x),
      'por_jugarse', (select count(*) from public.ae_community_picks p
         where not p.hidden and p.moderation_status = 'approved' and p.outcome = 'pending' and p.event_date > v_today));

  when 'pick_ocultar' then
    update public.ae_community_picks p set hidden = true where p.id = (a->>'id')::uuid and not p.hidden
    returning pg_catalog.jsonb_build_object('id', p.id, 'title', p.title, 'author', p.author) into v_row;
    if v_row is null then raise exception 'Ese Pick no existe o ya está oculto'; end if;
    return v_row;

  when 'comentario_pick_ocultar' then
    update public.ae_pick_comments c set hidden = true where c.id = (a->>'id')::uuid and not c.hidden
    returning pg_catalog.jsonb_build_object('id', c.id, 'author', c.author, 'body', pg_catalog.left(c.body, 200)) into v_row;
    if v_row is null then raise exception 'Ese comentario no existe o ya está oculto'; end if;
    return v_row;

  -- ── Opiniones (incluye borradores) ──
  when 'opinion_ver' then
    if a ? 'id' then
      select pg_catalog.to_jsonb(x) into v_row from public.ae_opinions x where x.id = (a->>'id')::uuid;
      if v_row is null then raise exception 'No existe esa opinión'; end if;
      return v_row;
    end if;
    return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', x.id, 'sport', x.sport, 'title', x.title, 'author', x.author, 'is_published', x.is_published,
              'featured', x.featured, 'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
              from (select * from public.ae_opinions order by created_at desc limit v_limit) x);

  -- ── Redes ──
  when 'redes_estado' then
    return pg_catalog.jsonb_build_object(
      'general', public.cam_social_status(),
      'promos_activas', (select j.active from cron.job j where j.jobname = 'cam-social-promos'),
      'horas_promos', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('hora', s.slot, 'a_las', s.local_time, 'activa', s.enabled) order by s.local_time) from cam_social.promo_slots s),
      'mensajes', (select pg_catalog.jsonb_build_object('total', count(*), 'activos', count(*) filter (where p.active and (p.active_until is null or p.active_until > pg_catalog.now())))
                     from cam_social.promos p));

  when 'redes_mensajes' then
    return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.theme, x.id), '[]'::jsonb) from (
      select p.id, p.theme, p.kicker, p.headline, p.x_text, p.caption, p.hashtags, p.link, p.needs_news, p.active, p.active_until,
             p.times_used, p.last_used_at
        from cam_social.promos p
       where (a->>'theme') is null or p.theme = a->>'theme') x);

  when 'redes_mensaje' then
    v_text := a->>'id';
    if coalesce((a->>'new')::boolean, false) then
      insert into cam_social.promos (id, theme, kicker, headline, x_text, caption, hashtags, link, needs_news, active, active_until)
      values (v_text, a->>'theme', a->>'kicker', a->>'headline', a->>'x_text', a->>'caption', a->>'hashtags',
              coalesce(a->>'link', 'https://camsports.github.io/'),
              pg_catalog.strpos(coalesce(a->>'x_text', '') || coalesce(a->>'headline', '') || coalesce(a->>'caption', ''), '{noticia}') > 0,
              coalesce((a->>'active')::boolean, true), (a->>'active_until')::timestamptz)
      returning pg_catalog.to_jsonb(promos.*) into v_row;
      return v_row;
    end if;
    update cam_social.promos p set
      theme = case when a ? 'theme' then a->>'theme' else p.theme end,
      kicker = case when a ? 'kicker' then a->>'kicker' else p.kicker end,
      headline = case when a ? 'headline' then a->>'headline' else p.headline end,
      x_text = case when a ? 'x_text' then a->>'x_text' else p.x_text end,
      caption = case when a ? 'caption' then a->>'caption' else p.caption end,
      hashtags = case when a ? 'hashtags' then a->>'hashtags' else p.hashtags end,
      link = case when a ? 'link' then a->>'link' else p.link end,
      active = case when a ? 'active' then (a->>'active')::boolean else p.active end,
      active_until = case when a ? 'active_until' then (a->>'active_until')::timestamptz else p.active_until end
    where p.id = v_text
    returning pg_catalog.to_jsonb(p.*) into v_row;
    if v_row is null then raise exception 'No existe el mensaje «%»', v_text; end if;
    update cam_social.promos p
       set needs_news = pg_catalog.strpos(p.x_text || p.headline || p.caption, '{noticia}') > 0
     where p.id = v_text;
    return v_row;

  when 'redes_promos' then
    v_on := (a->>'active')::boolean;
    if v_on is null then raise exception 'Indica si las promociones quedan activas'; end if;
    select j.jobid into v_job from cron.job j where j.jobname = 'cam-social-promos';
    if v_job is null then raise exception 'No encuentro la tarea programada de promociones (cam-social-promos)'; end if;
    perform cron.alter_job(v_job, active := v_on);
    update cam_social.promo_slots set enabled = v_on;
    v_n := 0;
    if not v_on then
      -- Lo que ya estaba en cola (se prepara 3 h antes) tampoco debe salir.
      update cam_social.deliveries d set status = 'cancelled', updated_at = pg_catalog.now()
       where d.event_key like 'promo:%' and d.status = 'queued';
      get diagnostics v_n = row_count;
    end if;
    return pg_catalog.jsonb_build_object('promos_activas', v_on, 'entregas_canceladas', v_n);

  when 'redes_todo' then
    v_on := (a->>'active')::boolean;
    if v_on is null then raise exception 'Indica si las publicaciones automáticas quedan activas'; end if;
    update cam_social.settings s set enabled = v_on where s.id;
    if not found then raise exception 'No encuentro la configuración de redes'; end if;
    return pg_catalog.jsonb_build_object('publicaciones_automaticas', v_on);

  -- ── Sitio ──
  when 'sitio_textos' then
    return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', t.key, 'content', t.content, 'settings', t.settings, 'updated_at', t.updated_at) order by t.key), '[]'::jsonb)
              from public.cam_site_texts t);

  -- ── Registro del conector ──
  when 'registro' then
    return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.at desc), '[]'::jsonb) from (
      select l.at, l.action, l.args, l.ok, l.error from cam_mcp_private.admin_log l order by l.at desc limit v_limit) x);

  else
    raise exception 'Acción desconocida: %', p_action;
  end case;
end;
$$;

-- ───────────────────────── entrada pública (solo service_role) ─────────────────────────
create or replace function public.cam_mcp_admin(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  read_actions constant text[] := array['noticia_ver', 'opinion_ver', 'picks_pendientes', 'redes_estado', 'redes_mensajes', 'sitio_textos', 'registro'];
  read_rpcs constant text[] := array['ae_take_review_queue', 'cam_admin_weekly_results', 'cam_party_admin_list', 'ae_outlook_points_matrix', 'cam_social_status'];
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_actor uuid;
  v_res jsonb;
  v_err text;
  v_read boolean;
begin
  if p_action is null or p_action !~ '^[a-z_]{2,40}$' then raise exception 'Acción no válida'; end if;
  if pg_catalog.jsonb_typeof(v_args) <> 'object' then raise exception 'Los argumentos deben ser un objeto'; end if;

  select c.actor_id into v_actor from cam_mcp_private.config c where c.id;
  if v_actor is null then raise exception 'El conector no tiene una cuenta de administrador configurada'; end if;

  -- Sesión de esa cuenta solo para esta transacción: auth.uid() y auth.jwt() la ven a ella.
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
    'sub', v_actor, 'role', 'authenticated', 'aud', 'authenticated', 'is_anonymous', false, 'iss', 'cam-mcp')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  if not public.rcm_is_editor() then raise exception 'La cuenta del conector ya no es administradora'; end if;

  v_read := p_action = any (read_actions) or (p_action = 'rpc' and coalesce(v_args->>'fn', '') = any (read_rpcs));

  begin
    v_res := cam_mcp_private.run(p_action, v_args);
  exception when others then
    get stacked diagnostics v_err = message_text;
  end;

  if not v_read or v_err is not null then
    insert into cam_mcp_private.admin_log (action, args, ok, error)
    values (case when p_action = 'rpc' then 'rpc:' || coalesce(v_args->>'fn', '?') else p_action end,
            case when p_action = 'rpc' then coalesce(v_args->'args', '{}'::jsonb) else v_args end,
            v_err is null, v_err);
  end if;

  if v_err is not null then return pg_catalog.jsonb_build_object('ok', false, 'error', v_err); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'result', v_res);
end;
$$;

revoke all on function cam_mcp_private.call_rpc(text, jsonb) from public;
revoke all on function cam_mcp_private.run(text, jsonb) from public;
revoke all on function public.cam_mcp_admin(text, jsonb) from public;
revoke all on function public.cam_mcp_admin(text, jsonb) from anon, authenticated;
grant execute on function public.cam_mcp_admin(text, jsonb) to service_role;

comment on function public.cam_mcp_admin(text, jsonb) is
  'Conector MCP (cam-mcp): ejecuta acciones de administración como la cuenta de cam_mcp_private.config. Solo service_role.';
