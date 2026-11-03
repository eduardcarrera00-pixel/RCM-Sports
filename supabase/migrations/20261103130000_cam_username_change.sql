-- CAM SPORTS · Cambiar el nombre de usuario desde el perfil (3 nov 2026).
--
-- El inicio de sesión busca el usuario en public.ae_auth_accounts (el correo
-- interno no cambia), así que basta con renombrar esa fila: la contraseña, el
-- código de recuperación y la sesión siguen igual.
--
-- Reglas (como otras redes: Instagram retiene el nombre anterior unos días,
-- Twitch limita los cambios a uno cada 60 días):
--   · 3 a 30 letras minúsculas, números o guion bajo; no se aceptan nombres reservados.
--   · Un cambio cada 30 días.
--   · Durante 7 días se puede volver una vez al nombre anterior (por si fue un error).
--   · El nombre anterior queda guardado 30 días para su dueño: nadie más puede
--     registrarlo ni usarlo en ese tiempo.
--   · Los Picks, comentarios de Picks, comentarios de noticias y avisos ya
--     publicados pasan a mostrar el nombre nuevo (los Takes, rankings, Quiniela
--     y Parties ya leen el nombre de la cuenta).
-- Además, los comentarios de noticias toman el autor de la cuenta (como ya hacían
-- los Picks), para que nadie pueda firmar con un nombre ajeno.
begin;

create schema if not exists ae_private;

create table if not exists public.cam_username_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_username text not null,
  new_username text not null,
  is_undo boolean not null default false,
  changed_at timestamptz not null default now()
);
create index if not exists cam_username_changes_user_idx on public.cam_username_changes (user_id, changed_at desc);
create index if not exists cam_username_changes_old_idx on public.cam_username_changes (old_username, changed_at desc);
alter table public.cam_username_changes enable row level security;
revoke all on public.cam_username_changes from public, anon, authenticated;
grant all on public.cam_username_changes to service_role;
-- Sin políticas: solo las funciones de abajo leen o escriben el historial.

-- Normas compartidas.
create or replace function ae_private.cam_username_problem(p_username text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_username is null or p_username !~ '^[a-z0-9_]{3,30}$' then 'invalid'
    when p_username ~ '^(admin|administrator|administrador|moderator|moderador|support|soporte|system|sistema|aesports|ae_sports|root|camsports|cam_sports|cam_sports_club|camsportsclub)$' then 'reserved'
    else null end
$$;

-- ¿Lo guarda otra persona (nombre que dejó hace menos de 30 días)?
create or replace function ae_private.cam_username_held_by_other(p_username text, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cam_username_changes c
     where c.old_username = p_username
       and c.changed_at > now() - interval '30 days'
       and c.user_id is distinct from p_user)
$$;
revoke all on function ae_private.cam_username_problem(text) from public, anon, authenticated;
revoke all on function ae_private.cam_username_held_by_other(text, uuid) from public, anon, authenticated;

-- Registro nuevo (función username-auth): no puede quedarse un nombre retenido.
create or replace function ae_private.cam_account_username_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if ae_private.cam_username_held_by_other(new.username, new.user_id) then
    raise exception 'Ese nombre de usuario no está disponible.' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function ae_private.cam_account_username_guard() from public, anon, authenticated;
drop trigger if exists cam_account_username_guard on public.ae_auth_accounts;
create trigger cam_account_username_guard
before insert on public.ae_auth_accounts
for each row execute function ae_private.cam_account_username_guard();

-- Estado del usuario actual: nombre, cuándo puede cambiarlo y si puede deshacer.
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
    'undo_username', case when last_change.id is not null and not last_change.is_undo
                            and last_change.changed_at > now() - interval '7 days'
                            and last_change.new_username = current_name
                          then last_change.old_username end,
    'undo_until', case when last_change.id is not null and not last_change.is_undo
                         and last_change.changed_at > now() - interval '7 days'
                       then last_change.changed_at + interval '7 days' end
  );
end $$;

-- Comprobación en vivo mientras se escribe: ok | same | invalid | reserved | taken.
create or replace function public.cam_username_available(p_username text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  wanted text := lower(btrim(coalesce(p_username, '')));
  problem text := ae_private.cam_username_problem(wanted);
begin
  if me is null then raise exception 'Inicia sesión para cambiar tu nombre.'; end if;
  if problem is not null then return problem; end if;
  if exists (select 1 from public.ae_auth_accounts a where a.username = wanted and a.user_id = me) then return 'same'; end if;
  if exists (select 1 from public.ae_auth_accounts a where a.username = wanted)
     or ae_private.cam_username_held_by_other(wanted, me) then
    return 'taken';
  end if;
  return 'ok';
end $$;

create or replace function public.cam_change_username(p_username text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  wanted text := lower(btrim(coalesce(p_username, '')));
  problem text := ae_private.cam_username_problem(wanted);
  account public.ae_auth_accounts%rowtype;
  last_change public.cam_username_changes%rowtype;
  undo boolean := false;
begin
  if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Inicia sesión para cambiar tu nombre.';
  end if;
  if problem = 'invalid' then
    raise exception 'Usa de 3 a 30 letras minúsculas, números o guion bajo (_), sin espacios.';
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

  select * into last_change from public.cam_username_changes c
   where c.user_id = me order by c.changed_at desc, c.id desc limit 1;
  undo := last_change.id is not null and not last_change.is_undo
          and last_change.changed_at > now() - interval '7 days'
          and last_change.new_username = account.username
          and last_change.old_username = wanted;
  if not undo and last_change.changed_at is not null and last_change.changed_at > now() - interval '30 days' then
    raise exception 'Solo puedes cambiar tu nombre una vez cada 30 días. Podrás volver a hacerlo el %.',
      to_char((last_change.changed_at + interval '30 days') at time zone 'America/Toronto', 'DD/MM/YYYY');
  end if;

  if exists (select 1 from public.ae_auth_accounts a where a.username = wanted)
     or ae_private.cam_username_held_by_other(wanted, me) then
    raise exception 'Ese nombre ya lo usa otra persona. Prueba con otro.';
  end if;

  update public.ae_auth_accounts set username = wanted where user_id = me;
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', wanted)
   where id = me;

  -- Lo ya publicado muestra el nombre nuevo.
  update public.ae_community_picks set author = left(wanted, 40) where user_id = me and author is distinct from left(wanted, 40);
  update public.ae_pick_comments set author = left(wanted, 40) where user_id = me and author is distinct from left(wanted, 40);
  update public.comments set author = wanted where user_id = me and author is distinct from wanted;
  update public.ae_notifications set actor_name = left(wanted, 40)
   where actor_id = me and event_key <> 'welcome' and actor_name is distinct from left(wanted, 40);

  insert into public.cam_username_changes (user_id, old_username, new_username, is_undo)
  values (me, account.username, wanted, undo);

  return public.cam_username_status() || jsonb_build_object('previous_username', account.username, 'undo', undo);
end $$;

-- Tarjeta pública de un perfil: nombre y mes en que se unió.
create or replace function public.cam_public_profile_card(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'username', coalesce(nullif(left(a.username, 40), ''), nullif(left(u.raw_user_meta_data->>'username', 40), ''), 'Aficionado'),
    'joined_month', to_char(date_trunc('month', u.created_at at time zone 'America/Toronto'), 'YYYY-MM'))
    from auth.users u left join public.ae_auth_accounts a on a.user_id = u.id
   where u.id = p_user and not coalesce(u.is_anonymous, false)
$$;

revoke all on function public.cam_username_status() from public, anon;
revoke all on function public.cam_username_available(text) from public, anon;
revoke all on function public.cam_change_username(text) from public, anon;
revoke all on function public.cam_public_profile_card(uuid) from public;
grant execute on function public.cam_username_status() to authenticated;
grant execute on function public.cam_username_available(text) to authenticated;
grant execute on function public.cam_change_username(text) to authenticated;
grant execute on function public.cam_public_profile_card(uuid) to anon, authenticated;

-- Comentarios de noticias: el autor sale de la cuenta, como en Picks.
create or replace function ae_private.pick_public_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  public_name text;
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Inicia sesión para participar';
  end if;
  if tg_table_schema <> 'public' or tg_table_name not in ('ae_community_picks','ae_pick_comments','comments') then
    raise exception 'Destino de autor inválido';
  end if;

  select coalesce(nullif(btrim(a.username),''),
                  nullif(btrim(u.raw_user_meta_data->>'username'),''),
                  nullif(btrim(u.raw_user_meta_data->>'display_name'),''))
    into public_name
    from auth.users u
    left join public.ae_auth_accounts a on a.user_id=u.id
   where u.id=actor;

  new.user_id := actor;
  new.author := left(coalesce(public_name,'Aficionado'),40);
  return new;
end
$$;
revoke all on function ae_private.pick_public_author() from public,anon,authenticated;
drop trigger if exists ae_comment_article_author on public.comments;
create trigger ae_comment_article_author
before insert on public.comments
for each row execute function ae_private.pick_public_author();

commit;
