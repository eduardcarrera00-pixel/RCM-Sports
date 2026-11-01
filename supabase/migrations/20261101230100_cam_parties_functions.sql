-- CAM SPORTS · Parties (2 de 2): puntos, clasificación, actividad y acciones.
--
-- Los puntos son los de siempre, sin fórmulas nuevas:
--   · Takes: public.ae_take_score_rows() (Takes libres puntuados + «¿Quién será
--     campeón?» resueltas), la misma fuente que ae_take_result_ranking.
--   · Picks: public.ae_pick_score_rows(), con las reglas exactas de
--     ae_pick_result_ranking (Mejores Chefs): Picks visibles y aprobados con
--     resultado confirmado; suman result_points.
-- Dentro de un party solo cuenta lo que cada miembro publicó desde que entró.
-- «Este mes» es el mes de Toronto de la confirmación del resultado, como en la
-- clasificación general.

-- ---------------------------------------------------------------------------
-- Puntos
-- ---------------------------------------------------------------------------

-- Filas de puntos de Picks: mismas condiciones que ae_pick_result_ranking,
-- pero fila a fila (sin agregar ni limitar a 10) para poder filtrar por party.
create function public.ae_pick_score_rows(p_period text)
returns table(pick_id uuid, user_id uuid, legs jsonb, outcome text, points numeric,
              created_at timestamptz, settled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.user_id, p.legs, p.outcome, p.result_points::numeric, p.created_at, p.settled_at
    from public.ae_community_picks p
   where not p.hidden and p.moderation_status = 'approved'
     and p.outcome in ('won','lost','void') and p.settled_at is not null
     and (p_period = 'all'
          or date_trunc('month', p.settled_at at time zone 'America/Toronto')
             = date_trunc('month', now() at time zone 'America/Toronto'));
$$;
comment on function public.ae_pick_score_rows(text) is
  'Filas de puntos de Picks con las mismas reglas que ae_pick_result_ranking (uso interno de Parties).';

-- Deporte de un Pick a partir de sus selecciones: fútbol o NFL solo si todas lo son.
create function public.cam_pick_sport(p_legs jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when count(*) = 0 then 'other'
    when bool_and(lower(coalesce(l->>'sport','')) in ('fútbol','futbol','soccer')) then 'football'
    when bool_and(lower(coalesce(l->>'sport','')) = 'nfl') then 'nfl'
    else 'other' end
  from jsonb_array_elements(case when jsonb_typeof(p_legs) = 'array' then p_legs else '[]'::jsonb end) l;
$$;

-- Filas que puntúan en cada party: solo lo publicado después de entrar.
-- Para añadir Quinielas: otra rama union all con kind = 'quiniela'.
create function public.cam_party_score_rows(p_party_ids uuid[], p_period text)
returns table(party_id uuid, user_id uuid, points numeric, won boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with parties as (
    select pa.id, pa.kind, pa.sport from public.cam_parties pa where pa.id = any(p_party_ids)
  ), members as (
    select m.party_id, m.user_id, m.joined_at
      from public.cam_party_members m join parties pa on pa.id = m.party_id
  ), take_sports as (
    select distinct pa.sport from parties pa where pa.kind = 'takes'
  ), take_rows as (
    select ts.sport, s.user_id, s.take_id, s.outcome, s.points
      from take_sports ts
      cross join lateral public.ae_take_score_rows(ts.sport, p_period) s
  )
  select m.party_id, m.user_id, t.points::numeric, t.outcome = 'won'
    from take_rows t
    join parties pa on pa.kind = 'takes' and pa.sport = t.sport
    join members m on m.party_id = pa.id and m.user_id = t.user_id
    left join public.ae_free_takes ft on ft.id = t.take_id and ft.user_id = t.user_id
    left join public.ae_take_predictions tp on tp.question_id = t.take_id and tp.user_id = t.user_id
   where coalesce(ft.created_at, tp.created_at) >= m.joined_at
  union all
  select m.party_id, m.user_id, r.points, r.outcome = 'won'
    from public.ae_pick_score_rows(p_period) r
    join members m on m.user_id = r.user_id
    join parties pa on pa.id = m.party_id and pa.kind = 'picks'
   where r.created_at >= m.joined_at
     and (pa.sport = 'all' or pa.sport = public.cam_pick_sport(r.legs));
$$;

-- Clasificación de uno o varios parties. Desempate: más aciertos y, después,
-- quien entró antes. Incluye a todos los miembros, también con 0 puntos.
create function public.cam_party_standings(p_party_ids uuid[], p_period text)
returns table(party_id uuid, user_id uuid, username text, joined_at timestamptz,
              points numeric, correct bigint, attempts bigint, "position" bigint, member_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select m.party_id, m.user_id, m.joined_at
      from public.cam_party_members m where m.party_id = any(p_party_ids)
  ), totals as (
    select r.party_id, r.user_id, sum(r.points) as pts,
           count(*) filter (where r.won) as correct, count(*) as attempts
      from public.cam_party_score_rows(p_party_ids, p_period) r
     group by r.party_id, r.user_id
  )
  select m.party_id, m.user_id,
         coalesce(nullif(left(a.username, 40), ''),
                  nullif(left(u.raw_user_meta_data->>'username', 40), ''),
                  nullif(left(u.raw_user_meta_data->>'display_name', 40), ''),
                  'Aficionado')::text,
         m.joined_at,
         coalesce(t.pts, 0)::numeric(12,2),
         coalesce(t.correct, 0)::bigint,
         coalesce(t.attempts, 0)::bigint,
         row_number() over (partition by m.party_id
                            order by coalesce(t.pts, 0) desc, coalesce(t.correct, 0) desc,
                                     m.joined_at, m.user_id),
         count(*) over (partition by m.party_id)
    from members m
    left join totals t on t.party_id = m.party_id and t.user_id = m.user_id
    left join auth.users u on u.id = m.user_id
    left join public.ae_auth_accounts a on a.user_id = m.user_id;
$$;

-- ---------------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------------

create function public.cam_party_require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Inicia sesión para usar los parties.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Nombre limpio: sin caracteres de control ni marcas invisibles de dirección
-- (se conserva el unidor de emojis), espacios simples, de 3 a 40 caracteres.
create function public.cam_party_clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  v := regexp_replace(coalesce(p_name, ''), '[[:cntrl:]​‎‏‪-‮⁦-⁩﻿]', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  if char_length(v) < 3 or char_length(v) > 40 then
    raise exception 'El nombre debe tener entre 3 y 40 caracteres.' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- Código nuevo de 6 caracteres sin letras que se confundan (fuera 0, O, 1, I, L).
create function public.cam_party_new_code_value()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
begin
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.cam_parties where code = c);
  end loop;
  return c;
end;
$$;

-- Quién intenta un código: el usuario, o la IP si no hay sesión.
create function public.cam_party_code_actor()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_headers jsonb;
  v_ip text;
begin
  if v_user is not null then
    return 'u:' || v_user::text;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := btrim(split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1));
  return 'ip:' || coalesce(nullif(v_ip, ''), 'desconocida');
end;
$$;

-- Busca un código y anota el intento. Unos 20 intentos fallidos por hora.
create function public.cam_party_find_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := public.cam_party_code_actor();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id uuid;
begin
  delete from public.cam_party_code_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from public.cam_party_code_attempts a
       where a.actor = v_actor and not a.ok and a.attempted_at > now() - interval '1 hour') >= 20 then
    raise exception 'Demasiados códigos probados. Inténtalo de nuevo en una hora.' using errcode = 'P0001';
  end if;
  if v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    select pa.id into v_id from public.cam_parties pa where pa.code = v_code;
  end if;
  insert into public.cam_party_code_attempts(actor, ok) values (v_actor, v_id is not null);
  return v_id;
end;
$$;

-- Cabecera de un party para quien puede verlo.
create function public.cam_party_header(p_party uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', pa.id, 'name', pa.name, 'kind', pa.kind, 'sport', pa.sport, 'code', pa.code,
    'owner_id', pa.owner_id, 'created_at', pa.created_at,
    'member_count', (select count(*) from public.cam_party_members m where m.party_id = pa.id),
    'max_members', 50,
    'is_owner', pa.owner_id = (select auth.uid()),
    'is_member', public.cam_party_is_member(pa.id),
    'is_admin', public.rcm_is_editor(),
    'show_on_profile', (select m.show_on_profile from public.cam_party_members m
                         where m.party_id = pa.id and m.user_id = (select auth.uid())))
  from public.cam_parties pa where pa.id = p_party;
$$;

-- Si sale el creador, el party pasa al miembro más antiguo; sin miembros, se borra.
create function public.cam_party_after_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_next uuid;
begin
  select pa.owner_id into v_owner from public.cam_parties pa where pa.id = old.party_id for update;
  if not found then
    return null;
  end if;
  select m.user_id into v_next from public.cam_party_members m
   where m.party_id = old.party_id order by m.joined_at, m.user_id limit 1;
  if v_next is null then
    delete from public.cam_parties where id = old.party_id;
  elsif v_owner = old.user_id then
    update public.cam_parties set owner_id = v_next, updated_at = now() where id = old.party_id;
  end if;
  return null;
end;
$$;

create trigger cam_party_members_after_delete
  after delete on public.cam_party_members
  for each row execute function public.cam_party_after_member_delete();

-- ---------------------------------------------------------------------------
-- Acciones (RPC)
-- ---------------------------------------------------------------------------

create function public.cam_party_create(p_name text, p_kind text, p_sport text default 'all')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
  v_name text := public.cam_party_clean_name(p_name);
  v_sport text := coalesce(nullif(p_sport, ''), 'all');
  v_id uuid;
  v_code text;
begin
  if p_kind is null or p_kind not in ('picks','takes') then
    raise exception 'Elige si el party es de Picks o de Takes.' using errcode = '22023';
  end if;
  if v_sport not in ('all','football','nfl') then
    raise exception 'Deporte no válido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cam_party_user:' || v_user::text, 0));
  if (select count(*) from public.cam_parties pa where pa.owner_id = v_user) >= 10 then
    raise exception 'Ya tienes 10 parties creados. Borra alguno para crear otro.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cam_party_members m where m.user_id = v_user) >= 20 then
    raise exception 'Ya estás en 20 parties. Sal de alguno para crear otro.' using errcode = 'P0001';
  end if;
  loop
    v_code := public.cam_party_new_code_value();
    begin
      insert into public.cam_parties(name, kind, sport, code, owner_id, created_by)
      values (v_name, p_kind, v_sport, v_code, v_user, v_user)
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- Otro party se quedó el mismo código en ese instante: probar otro.
    end;
  end loop;
  insert into public.cam_party_members(party_id, user_id) values (v_id, v_user);
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- Vista previa de una invitación: nombre, tipo, deporte y número de miembros.
-- Sin nombres de miembros ni otros datos privados. Funciona sin sesión.
create function public.cam_party_preview(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.cam_party_find_code(p_code);
  v jsonb;
begin
  if v_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select jsonb_build_object(
    'status', 'ok', 'name', pa.name, 'kind', pa.kind, 'sport', pa.sport,
    'member_count', count(m.user_id), 'max_members', 50,
    'is_full', count(m.user_id) >= 50,
    'is_member', public.cam_party_is_member(pa.id),
    'id', case when public.cam_party_is_member(pa.id) then pa.id end)
    into v
    from public.cam_parties pa
    left join public.cam_party_members m on m.party_id = pa.id
   where pa.id = v_id
   group by pa.id;
  return v;
end;
$$;

create function public.cam_party_join(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
  v_id uuid := public.cam_party_find_code(p_code);
begin
  if v_id is null then
    raise exception 'Ese código no es válido o el party ya no existe.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.cam_party_members m where m.party_id = v_id and m.user_id = v_user) then
    return jsonb_build_object('id', v_id, 'already', true);
  end if;
  perform 1 from public.cam_parties pa where pa.id = v_id for update;
  perform pg_advisory_xact_lock(hashtextextended('cam_party_user:' || v_user::text, 0));
  if (select count(*) from public.cam_party_members m where m.party_id = v_id) >= 50 then
    raise exception 'Este party ya tiene 50 miembros.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cam_party_members m where m.user_id = v_user) >= 20 then
    raise exception 'Ya estás en 20 parties. Sal de alguno para unirte.' using errcode = 'P0001';
  end if;
  insert into public.cam_party_members(party_id, user_id) values (v_id, v_user);
  return jsonb_build_object('id', v_id, 'already', false);
end;
$$;

create function public.cam_party_leave(p_party uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
begin
  delete from public.cam_party_members m where m.party_id = p_party and m.user_id = v_user;
  if not found then
    raise exception 'No eres miembro de este party.' using errcode = '42501';
  end if;
  return jsonb_build_object('left', true,
    'deleted', not exists (select 1 from public.cam_parties pa where pa.id = p_party));
end;
$$;

create function public.cam_party_assert_owner(p_party uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
begin
  if not exists (select 1 from public.cam_parties pa where pa.id = p_party and pa.owner_id = v_user) then
    raise exception 'Solo quien administra el party puede hacer esto.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

create function public.cam_party_kick(p_party uuid, p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.cam_party_assert_owner(p_party);
begin
  if p_user is null or p_user = v_owner then
    raise exception 'No puedes expulsarte a ti mismo.' using errcode = '22023';
  end if;
  delete from public.cam_party_members m where m.party_id = p_party and m.user_id = p_user;
  if not found then
    raise exception 'Esa persona ya no está en el party.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('kicked', true);
end;
$$;

create function public.cam_party_rename(p_party uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.cam_party_assert_owner(p_party);
  v_name text := public.cam_party_clean_name(p_name);
begin
  update public.cam_parties set name = v_name, updated_at = now() where id = p_party;
  return jsonb_build_object('name', v_name);
end;
$$;

-- Código nuevo: el enlace anterior deja de valer al instante.
create function public.cam_party_new_code(p_party uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.cam_party_assert_owner(p_party);
  v_code text;
begin
  loop
    v_code := public.cam_party_new_code_value();
    begin
      update public.cam_parties set code = v_code, updated_at = now() where id = p_party;
      exit;
    exception when unique_violation then
    end;
  end loop;
  return jsonb_build_object('code', v_code);
end;
$$;

create function public.cam_party_delete(p_party uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
begin
  if not (public.rcm_is_editor()
          or exists (select 1 from public.cam_parties pa where pa.id = p_party and pa.owner_id = v_user)) then
    raise exception 'Solo quien administra el party puede borrarlo.' using errcode = '42501';
  end if;
  delete from public.cam_parties where id = p_party;
  if not found then
    raise exception 'Este party ya no existe.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

create function public.cam_party_set_visibility(p_party uuid, p_show boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
begin
  update public.cam_party_members m set show_on_profile = coalesce(p_show, true)
   where m.party_id = p_party and m.user_id = v_user;
  if not found then
    raise exception 'No eres miembro de este party.' using errcode = '42501';
  end if;
  return jsonb_build_object('show_on_profile', coalesce(p_show, true));
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas (RPC)
-- ---------------------------------------------------------------------------

-- Mis parties con mi posición en la clasificación total («2.º de 8»).
create function public.cam_party_mine()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v jsonb;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;
  with mine as (
    select m.party_id, m.joined_at, m.show_on_profile
      from public.cam_party_members m where m.user_id = v_user
  ), st as (
    select s.party_id, s."position", s.member_count, s.points
      from public.cam_party_standings(array(select mi.party_id from mine mi), 'all') s
     where s.user_id = v_user
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pa.id, 'name', pa.name, 'kind', pa.kind, 'sport', pa.sport, 'code', pa.code,
           'is_owner', pa.owner_id = v_user, 'member_count', st.member_count,
           'position', st."position", 'points', st.points,
           'show_on_profile', mi.show_on_profile, 'joined_at', mi.joined_at)
           order by mi.joined_at desc), '[]'::jsonb)
    into v
    from mine mi
    join public.cam_parties pa on pa.id = mi.party_id
    left join st on st.party_id = pa.id;
  return v;
end;
$$;

-- Parties que un aficionado muestra en su perfil público: nombre, tipo y
-- posición. El id solo se entrega a quien ya es miembro (o administrador).
create function public.cam_party_public_list(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with shown as (
    select m.party_id from public.cam_party_members m
     where m.user_id = p_user and m.show_on_profile
  ), st as (
    select s.party_id, s."position", s.member_count
      from public.cam_party_standings(array(select sh.party_id from shown sh), 'all') s
     where s.user_id = p_user
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', case when public.cam_party_is_member(pa.id) or public.rcm_is_editor() then pa.id end,
           'name', pa.name, 'kind', pa.kind, 'sport', pa.sport,
           'position', st."position", 'member_count', st.member_count)
           order by st."position", pa.name), '[]'::jsonb)
    from st join public.cam_parties pa on pa.id = st.party_id;
$$;

-- Clasificación del party («Este mes» y «Total» en una sola llamada) y su cabecera.
create function public.cam_party_ranking(p_party uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_header jsonb := public.cam_party_header(p_party);
  v_month jsonb;
  v_total jsonb;
begin
  if v_header is null or not (public.cam_party_is_member(p_party) or public.rcm_is_editor()) then
    raise exception 'Solo los miembros pueden ver este party.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'username', s.username, 'joined_at', s.joined_at,
           'points', s.points, 'correct', s.correct, 'attempts', s.attempts, 'position', s."position",
           'is_owner', s.user_id = (v_header->>'owner_id')::uuid, 'is_me', s.user_id = v_user)
           order by s."position"), '[]'::jsonb)
    into v_month
    from public.cam_party_standings(array[p_party], 'month') s;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'username', s.username, 'joined_at', s.joined_at,
           'points', s.points, 'correct', s.correct, 'attempts', s.attempts, 'position', s."position",
           'is_owner', s.user_id = (v_header->>'owner_id')::uuid, 'is_me', s.user_id = v_user)
           order by s."position"), '[]'::jsonb)
    into v_total
    from public.cam_party_standings(array[p_party], 'all') s;
  return jsonb_build_object('party', v_header, 'month', v_month, 'total', v_total);
end;
$$;

-- Actividad: Picks o Takes de los miembros publicados desde que entraron, del
-- más reciente al más antiguo, de 20 en 20. Solo lo que ya es público.
-- Paginación: p_before / p_before_key son created_at y key del último elemento.
create function public.cam_party_activity(p_party uuid, p_filter text default 'all',
  p_member uuid default null, p_before timestamptz default null, p_before_key text default null,
  p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_party public.cam_parties%rowtype;
  v_filter text := coalesce(nullif(p_filter, ''), 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
  v_more boolean;
begin
  select * into v_party from public.cam_parties pa where pa.id = p_party;
  if not found or not (public.cam_party_is_member(p_party) or public.rcm_is_editor()) then
    raise exception 'Solo los miembros pueden ver este party.' using errcode = '42501';
  end if;
  if v_filter not in ('all','pending','resolved') then
    raise exception 'Filtro no válido.' using errcode = '22023';
  end if;

  with mem as (
    select m.user_id, m.joined_at,
           coalesce(nullif(left(a.username, 40), ''),
                    nullif(left(u.raw_user_meta_data->>'username', 40), ''),
                    nullif(left(u.raw_user_meta_data->>'display_name', 40), ''),
                    'Aficionado')::text as username
      from public.cam_party_members m
      left join auth.users u on u.id = m.user_id
      left join public.ae_auth_accounts a on a.user_id = m.user_id
     where m.party_id = p_party and (p_member is null or m.user_id = p_member)
  ), items as (
    -- Picks públicos (los mismos que muestra la web: visibles, sin rechazar).
    select p.created_at as at, p.id::text as key, p.user_id, p.outcome <> 'pending' as resolved,
           jsonb_build_object(
             'type', 'pick', 'id', p.id, 'key', p.id::text, 'user_id', p.user_id, 'username', mem.username,
             'title', p.title, 'legs', (select coalesce(jsonb_agg(l.value order by l.ordinality), '[]'::jsonb)
                                         from jsonb_array_elements(case when jsonb_typeof(p.legs) = 'array'
                                              then p.legs else '[]'::jsonb end) with ordinality l
                                        where l.ordinality <= 4),
             'legs_count', case when jsonb_typeof(p.legs) = 'array' then jsonb_array_length(p.legs) else 0 end,
             'american_odds', p.american_odds, 'state', p.outcome,
             'points', case when p.outcome <> 'pending' then p.result_points end,
             'moderation_status', p.moderation_status,
             'created_at', p.created_at, 'settled_at', p.settled_at) as data
      from public.ae_community_picks p
      join mem on mem.user_id = p.user_id
     where v_party.kind = 'picks'
       and not p.hidden and p.moderation_status in ('pending','approved')
       and p.created_at >= mem.joined_at
       and (v_party.sport = 'all' or v_party.sport = public.cam_pick_sport(p.legs))
    union all
    -- Takes públicos (no ocultos) con su resultado si ya se puntuaron.
    select t.created_at, t.id::text, t.user_id, r.take_id is not null,
           jsonb_build_object(
             'type', 'take', 'id', t.id, 'key', t.id::text, 'user_id', t.user_id, 'username', mem.username,
             'title', t.title, 'body', left(t.body, 400), 'sport', t.sport, 'competition', t.competition,
             'state', coalesce(r.outcome, 'pending'), 'points', r.points, 'scored_at', r.scored_at,
             'created_at', t.created_at,
             'upvotes', (select count(*) from public.ae_free_take_votes v where v.take_id = t.id and v.value = 1),
             'downvotes', (select count(*) from public.ae_free_take_votes v where v.take_id = t.id and v.value = -1),
             'my_vote', (select v.value from public.ae_free_take_votes v where v.take_id = t.id and v.user_id = v_user))
      from public.ae_free_takes t
      join mem on mem.user_id = t.user_id
      left join public.ae_take_results r on r.take_id = t.id
     where v_party.kind = 'takes'
       and not t.hidden
       and t.created_at >= mem.joined_at
       and (v_party.sport = 'all'
            or (v_party.sport = 'nfl' and t.sport = 'nfl')
            or (v_party.sport = 'football' and t.sport in ('football','laliga','premier','ligamx','champions')))
    union all
    -- «¿Quién será campeón?»: también es un Take (ya se ve en los perfiles públicos).
    select p.created_at, q.id::text || ':' || p.user_id::text, p.user_id,
           q.status = 'settled' and q.settled_at is not null,
           jsonb_build_object(
             'type', 'champion', 'id', q.id, 'key', q.id::text || ':' || p.user_id::text,
             'user_id', p.user_id, 'username', mem.username,
             'title', 'Campeón · ' || o.label, 'body', q.prompt, 'competition', q.competition,
             'state', case when q.status = 'settled' and q.settled_at is not null
                           then case when coalesce(p.awarded_points, 0) > 0 then 'won' else 'lost' end
                           else 'pending' end,
             'points', case when q.status = 'settled' and q.settled_at is not null
                            then coalesce(p.awarded_points, 0)
                            else coalesce(o.points, q.points) end,
             'created_at', p.created_at, 'settled_at', q.settled_at) as data
      from public.ae_take_predictions p
      join mem on mem.user_id = p.user_id
      join public.ae_take_questions q on q.id = p.question_id
      join public.ae_take_options o on o.id = p.option_id
     where v_party.kind = 'takes'
       and q.period = 'season' and q.status <> 'void'
       and p.created_at >= mem.joined_at
       and (v_party.sport = 'all'
            or (v_party.sport = 'nfl' and q.competition = 'nfl')
            or (v_party.sport = 'football' and q.competition in ('laliga','premier','ligamx','champions')))
  ), page as (
    select i.*, row_number() over (order by i.at desc, i.key desc) as rn
      from items i
     where (v_filter = 'all' or (v_filter = 'resolved') = i.resolved)
       and (p_before is null or (i.at, i.key) < (p_before, coalesce(p_before_key, '')))
     order by i.at desc, i.key desc
     limit v_limit + 1
  )
  select coalesce(jsonb_agg(pg.data order by pg.rn) filter (where pg.rn <= v_limit), '[]'::jsonb),
         count(*) > v_limit
    into v_items, v_more
    from page pg;

  return jsonb_build_object('items', v_items, 'more', coalesce(v_more, false));
end;
$$;

-- Moderación: todos los parties para los administradores (rcm_is_editor()).
create function public.cam_party_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.rcm_is_editor() then
    raise exception 'Solo para administradores.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'name', x.name, 'kind', x.kind, 'sport', x.sport,
           'member_count', x.member_count, 'owner_name', x.owner_name, 'created_at', x.created_at)
           order by x.created_at desc), '[]'::jsonb)
    into v
    from (
      select pa.id, pa.name, pa.kind, pa.sport, pa.created_at,
             (select count(*) from public.cam_party_members m where m.party_id = pa.id) as member_count,
             coalesce(nullif(left(a.username, 40), ''), nullif(left(u.raw_user_meta_data->>'username', 40), ''),
                      'Aficionado') as owner_name
        from public.cam_parties pa
        left join auth.users u on u.id = pa.owner_id
        left join public.ae_auth_accounts a on a.user_id = pa.owner_id
       order by pa.created_at desc
       limit 300
    ) x;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: las funciones internas no se pueden llamar desde la web.
-- ---------------------------------------------------------------------------

revoke all on function public.ae_pick_score_rows(text) from public, anon, authenticated;
revoke all on function public.cam_pick_sport(jsonb) from public, anon, authenticated;
revoke all on function public.cam_party_score_rows(uuid[], text) from public, anon, authenticated;
revoke all on function public.cam_party_standings(uuid[], text) from public, anon, authenticated;
revoke all on function public.cam_party_require_user() from public, anon, authenticated;
revoke all on function public.cam_party_clean_name(text) from public, anon, authenticated;
revoke all on function public.cam_party_new_code_value() from public, anon, authenticated;
revoke all on function public.cam_party_code_actor() from public, anon, authenticated;
revoke all on function public.cam_party_find_code(text) from public, anon, authenticated;
revoke all on function public.cam_party_header(uuid) from public, anon, authenticated;
revoke all on function public.cam_party_assert_owner(uuid) from public, anon, authenticated;
revoke all on function public.cam_party_after_member_delete() from public, anon, authenticated;

revoke all on function public.cam_party_create(text, text, text) from public, anon;
revoke all on function public.cam_party_join(text) from public, anon;
revoke all on function public.cam_party_leave(uuid) from public, anon;
revoke all on function public.cam_party_kick(uuid, uuid) from public, anon;
revoke all on function public.cam_party_rename(uuid, text) from public, anon;
revoke all on function public.cam_party_new_code(uuid) from public, anon;
revoke all on function public.cam_party_delete(uuid) from public, anon;
revoke all on function public.cam_party_set_visibility(uuid, boolean) from public, anon;
revoke all on function public.cam_party_mine() from public, anon;
revoke all on function public.cam_party_ranking(uuid) from public, anon;
revoke all on function public.cam_party_activity(uuid, text, uuid, timestamptz, text, integer) from public, anon;
revoke all on function public.cam_party_admin_list() from public, anon;
grant execute on function public.cam_party_create(text, text, text) to authenticated;
grant execute on function public.cam_party_join(text) to authenticated;
grant execute on function public.cam_party_leave(uuid) to authenticated;
grant execute on function public.cam_party_kick(uuid, uuid) to authenticated;
grant execute on function public.cam_party_rename(uuid, text) to authenticated;
grant execute on function public.cam_party_new_code(uuid) to authenticated;
grant execute on function public.cam_party_delete(uuid) to authenticated;
grant execute on function public.cam_party_set_visibility(uuid, boolean) to authenticated;
grant execute on function public.cam_party_mine() to authenticated;
grant execute on function public.cam_party_ranking(uuid) to authenticated;
grant execute on function public.cam_party_activity(uuid, text, uuid, timestamptz, text, integer) to authenticated;
grant execute on function public.cam_party_admin_list() to authenticated;

-- La invitación y los parties de un perfil público se ven también sin sesión.
revoke all on function public.cam_party_preview(text) from public;
revoke all on function public.cam_party_public_list(uuid) from public;
grant execute on function public.cam_party_preview(text) to anon, authenticated;
grant execute on function public.cam_party_public_list(uuid) to anon, authenticated;
