-- Legacy/admin sessions can lack user_metadata.username even though their
-- username is registered. Resolve public authors from the account bound to
-- auth.uid(), rather than copying an optional or stale JWT display field.
begin;

create schema if not exists ae_private;

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
  if tg_table_schema <> 'public' or tg_table_name not in ('ae_community_picks','ae_pick_comments') then
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
-- Trigger invocation needs no client EXECUTE or access to the private account
-- table. Existing validation, moderation, settlement and RLS remain in place.
revoke all on function ae_private.pick_public_author() from public,anon,authenticated;

-- PostgreSQL runs BEFORE triggers alphabetically. These follow the existing
-- ae_pick_prepare / ae_comment_prepare triggers, which used the JWT fallback.
drop trigger if exists ae_pick_public_author on public.ae_community_picks;
create trigger ae_pick_public_author
before insert on public.ae_community_picks
for each row execute function ae_private.pick_public_author();

drop trigger if exists ae_comment_public_author on public.ae_pick_comments;
create trigger ae_comment_public_author
before insert on public.ae_pick_comments
for each row execute function ae_private.pick_public_author();

-- Repair existing public labels, including resolved Picks. Rankings, feeds,
-- history and sharing already read author; no score or result is changed.
with names as (
  select u.id, left(coalesce(nullif(btrim(a.username),''),
                            nullif(btrim(u.raw_user_meta_data->>'username'),''),
                            nullif(btrim(u.raw_user_meta_data->>'display_name'),'')),40) as name
    from auth.users u left join public.ae_auth_accounts a on a.user_id=u.id
)
update public.ae_community_picks p
   set author=n.name
  from names n
 where p.user_id=n.id and n.name is not null and p.author is distinct from n.name;

with names as (
  select u.id, left(coalesce(nullif(btrim(a.username),''),
                            nullif(btrim(u.raw_user_meta_data->>'username'),''),
                            nullif(btrim(u.raw_user_meta_data->>'display_name'),'')),40) as name
    from auth.users u left join public.ae_auth_accounts a on a.user_id=u.id
)
update public.ae_pick_comments c
   set author=n.name
  from names n
 where c.user_id=n.id and n.name is not null and c.author is distinct from n.name;

commit;
