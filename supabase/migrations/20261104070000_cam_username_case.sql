-- CAM SPORTS · Nombres de usuario con mayúsculas (4 nov 2026).
-- Aplicada en producción el 4 nov 2026 (por partes con execute_sql, mismo contenido).
--
-- Pedido: que la primera letra del usuario sea mayúscula y que cada uno pueda
-- ponerlo en minúsculas (o como quiera) si lo prefiere; las minúsculas ya no
-- son obligatorias.
--
--   · ae_auth_accounts.username guarda el nombre tal como se ve (Eduard_10).
--   · username_key = lower(username) es lo que se usa para iniciar sesión, para
--     que no haya dos cuentas que solo cambien en mayúsculas y para los nombres
--     retenidos y reservados: «eduard_10», «EDUARD_10» y «Eduard_10» son el mismo.
--   · Cambiar solo mayúsculas y minúsculas desde Editar perfil está permitido
--     siempre: no cuenta como cambio de nombre (ni la espera de 30 días, ni
--     el deshacer de 7 días, ni retiene nada).
--   · Las cuentas existentes y las nuevas (función username-auth) empiezan con
--     mayúscula (paso de datos al final de este archivo).
begin;

-- ---------- Tabla de cuentas ----------
alter table public.ae_auth_accounts drop constraint if exists ae_auth_accounts_username_check;
alter table public.ae_auth_accounts add constraint ae_auth_accounts_username_check
  check (username ~ '^[A-Za-z0-9_]{3,30}$');
alter table public.ae_auth_accounts add column if not exists username_key text
  generated always as (lower(username)) stored;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ae_auth_accounts_username_key_key') then
    alter table public.ae_auth_accounts add constraint ae_auth_accounts_username_key_key unique (username_key);
  end if;
end $$;

-- ---------- Normas compartidas ----------
create or replace function ae_private.cam_username_problem(p_username text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_username is null or p_username !~ '^[A-Za-z0-9_]{3,30}$' then 'invalid'
    when lower(p_username) ~ '^(admin|administrator|administrador|moderator|moderador|support|soporte|system|sistema|aesports|ae_sports|root|camsports|cam_sports|cam_sports_club|camsportsclub)$' then 'reserved'
    else null end
$$;

create or replace function ae_private.cam_username_held_by_other(p_username text, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cam_username_changes c
     where lower(c.old_username) = lower(p_username)
       and c.changed_at > now() - interval '30 days'
       and c.user_id is distinct from p_user)
$$;
revoke all on function ae_private.cam_username_problem(text) from public, anon, authenticated;
revoke all on function ae_private.cam_username_held_by_other(text, uuid) from public, anon, authenticated;

-- ---------- Estado: puede cambiar las mayúsculas siempre ----------
create or replace function public.cam_username_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  current_name text;
  last_change public.cam_username_changes%rowtype;
  joined timestamptz;
begin
  if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Inicia sesión para ver tu cuenta.';
  end if;
  select a.username into current_name from public.ae_auth_accounts a where a.user_id = me;
  select u.created_at into joined from auth.users u where u.id = me;
  select * into last_change from public.cam_username_changes c
   where c.user_id = me order by c.changed_at desc, c.id desc limit 1;
  return jsonb_build_object(
    'username', current_name,
    'joined_at', joined,
    'last_change_at', last_change.changed_at,
    'next_change_at', case when last_change.changed_at is null then null
                           else last_change.changed_at + interval '30 days' end,
    'can_change', current_name is not null and
                  (last_change.changed_at is null or last_change.changed_at <= now() - interval '30 days'),
    'can_change_case', current_name is not null,
    'undo_username', case when last_change.id is not null and not last_change.is_undo
                            and last_change.changed_at > now() - interval '7 days'
                            and lower(last_change.new_username) = lower(current_name)
                          then last_change.old_username end,
    'undo_until', case when last_change.id is not null and not last_change.is_undo
                         and last_change.changed_at > now() - interval '7 days'
                       then last_change.changed_at + interval '7 days' end
  );
end $$;

-- Comprobación en vivo: ok | same | case (solo mayúsculas) | invalid | reserved | taken.
create or replace function public.cam_username_available(p_username text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  wanted text := regexp_replace(btrim(coalesce(p_username, '')), '^@+', '');
  problem text := ae_private.cam_username_problem(wanted);
begin
  if me is null then raise exception 'Inicia sesión para cambiar tu nombre.'; end if;
  if problem is not null then return problem; end if;
  if exists (select 1 from public.ae_auth_accounts a where a.user_id = me and a.username = wanted) then return 'same'; end if;
  if exists (select 1 from public.ae_auth_accounts a where a.user_id = me and a.username_key = lower(wanted)) then return 'case'; end if;
  if exists (select 1 from public.ae_auth_accounts a where a.username_key = lower(wanted))
     or ae_private.cam_username_held_by_other(wanted, me) then
    return 'taken';
  end if;
  return 'ok';
end $$;

create or replace function public.cam_change_username(p_username text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  wanted text := regexp_replace(btrim(coalesce(p_username, '')), '^@+', '');
  problem text := ae_private.cam_username_problem(wanted);
  account public.ae_auth_accounts%rowtype;
  last_change public.cam_username_changes%rowtype;
  undo boolean := false;
  case_only boolean := false;
begin
  if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Inicia sesión para cambiar tu nombre.';
  end if;
  if problem = 'invalid' then
    raise exception 'Usa de 3 a 30 letras, números o guion bajo (_), sin espacios.';
  elsif problem = 'reserved' then
    raise exception 'Ese nombre está reservado. Elige otro.';
  end if;

  -- Una sola operación a la vez por cuenta.
  select * into account from public.ae_auth_accounts a where a.user_id = me for update;
  if not found then
    raise exception 'Tu cuenta no tiene nombre de usuario. Escríbenos y lo revisamos.';
  end if;
  if account.username = wanted then
    raise exception 'Ese ya es tu nombre de usuario.';
  end if;
  -- Solo mayúsculas y minúsculas: el mismo nombre, se permite siempre.
  case_only := account.username_key = lower(wanted);

  if not case_only then
    select * into last_change from public.cam_username_changes c
     where c.user_id = me order by c.changed_at desc, c.id desc limit 1;
    undo := last_change.id is not null and not last_change.is_undo
            and last_change.changed_at > now() - interval '7 days'
            and lower(last_change.new_username) = account.username_key
            and lower(last_change.old_username) = lower(wanted);
    if not undo and last_change.changed_at is not null and last_change.changed_at > now() - interval '30 days' then
      raise exception 'Solo puedes cambiar tu nombre una vez cada 30 días. Podrás volver a hacerlo el %.',
        to_char((last_change.changed_at + interval '30 days') at time zone 'America/Toronto', 'DD/MM/YYYY');
    end if;
    if exists (select 1 from public.ae_auth_accounts a where a.username_key = lower(wanted))
       or ae_private.cam_username_held_by_other(wanted, me) then
      raise exception 'Ese nombre ya lo usa otra persona. Prueba con otro.';
    end if;
  end if;

  update public.ae_auth_accounts set username = wanted where user_id = me;
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', wanted)
   where id = me;

  -- Lo ya publicado muestra el nombre nuevo.
  update public.ae_community_picks set author = left(wanted, 40) where user_id = me and author is distinct from left(wanted, 40);
  update public.ae_pick_comments set author = left(wanted, 40) where user_id = me and author is distinct from left(wanted, 40);
  -- Comentarios de noticias: solo los que siguen en una noticia existente (la
  -- comprobación de hilo de rcm_check_parent rechaza respuestas de noticias borradas,
  -- que además ya no se muestran).
  update public.comments c set author = wanted
   where c.user_id = me and c.author is distinct from wanted
     and (c.parent_id is null or exists (
       select 1 from public.comments p join public.articles a
         on (a.id::text = p.article_id::text or a.legacy_id = p.article_id::text)
        where p.id = c.parent_id and (a.id::text = c.article_id::text or a.legacy_id = c.article_id::text)));
  update public.ae_notifications set actor_name = left(wanted, 40)
   where actor_id = me and event_key <> 'welcome' and actor_name is distinct from left(wanted, 40);

  if not case_only then
    insert into public.cam_username_changes (user_id, old_username, new_username, is_undo)
    values (me, account.username, wanted, undo);
  end if;

  return public.cam_username_status()
      || jsonb_build_object('previous_username', account.username, 'undo', undo, 'case_only', case_only);
end $$;

revoke all on function public.cam_username_status() from public, anon;
revoke all on function public.cam_username_available(text) from public, anon;
revoke all on function public.cam_change_username(text) from public, anon;
grant execute on function public.cam_username_status() to authenticated;
grant execute on function public.cam_username_available(text) to authenticated;
grant execute on function public.cam_change_username(text) to authenticated;

commit;

-- ---------- Datos: la primera letra de los nombres actuales, en mayúscula ----------
-- (en producción se aplicó después de publicar la nueva función username-auth,
-- que ya busca por username_key).
begin;
create temporary table cam_case_renames on commit drop as
  select a.user_id, a.username as old_name, upper(left(a.username, 1)) || substr(a.username, 2) as new_name
    from public.ae_auth_accounts a
   where a.username ~ '^[a-z]';

update public.ae_auth_accounts a set username = r.new_name
  from cam_case_renames r where a.username = r.old_name;
update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', r.new_name)
  from cam_case_renames r where u.id = r.user_id;
update public.ae_community_picks p set author = left(r.new_name, 40)
  from cam_case_renames r where p.user_id = r.user_id and p.author = left(r.old_name, 40);
update public.ae_pick_comments p set author = left(r.new_name, 40)
  from cam_case_renames r where p.user_id = r.user_id and p.author = left(r.old_name, 40);
update public.comments c set author = r.new_name
  from cam_case_renames r
 where c.user_id = r.user_id and c.author = r.old_name
   and (c.parent_id is null or exists (
     select 1 from public.comments p join public.articles a
       on (a.id::text = p.article_id::text or a.legacy_id = p.article_id::text)
      where p.id = c.parent_id and (a.id::text = c.article_id::text or a.legacy_id = c.article_id::text)));
update public.ae_notifications n set actor_name = left(r.new_name, 40)
  from cam_case_renames r
 where n.actor_id = r.user_id and n.event_key <> 'welcome' and n.actor_name = left(r.old_name, 40);
-- El historial también, para que «Volver a @…» muestre el nombre como se ve ahora.
update public.cam_username_changes set old_username = upper(left(old_username, 1)) || substr(old_username, 2)
 where old_username ~ '^[a-z]';
update public.cam_username_changes set new_username = upper(left(new_username, 1)) || substr(new_username, 2)
 where new_username ~ '^[a-z]';
commit;
