-- AE SPORTS · Conversaciones de Takes (replies anidadas, persistentes y moderables).
create table if not exists public.ae_take_replies (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null references public.ae_free_takes(id) on delete cascade,
  parent_id uuid references public.ae_take_replies(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 900),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ae_take_reply_no_self_parent check (parent_id is distinct from id)
);
create index if not exists ae_take_replies_take_recent
  on public.ae_take_replies(take_id, created_at, id);
create index if not exists ae_take_replies_author_recent
  on public.ae_take_replies(user_id, created_at desc);
alter table public.ae_take_replies enable row level security;
revoke all on table public.ae_take_replies from public, anon, authenticated;

create or replace function public.ae_take_comment_thread(p_take_id uuid)
returns table (
  id uuid, parent_id uuid, author_id uuid, author text,
  body text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $thread$
  select r.id, r.parent_id, r.user_id,
    coalesce(nullif(left(u.raw_user_meta_data->>'username',40),''),
             nullif(left(u.raw_user_meta_data->>'display_name',40),''),'Aficionado')::text,
    r.body, r.created_at
  from public.ae_take_replies r
  join public.ae_free_takes t on t.id=r.take_id
  join auth.users u on u.id=r.user_id
  where r.take_id=p_take_id and not t.hidden and not r.hidden
  order by r.created_at asc, r.id asc
  limit 250;
$thread$;

create or replace function public.ae_post_take_reply(
  p_take_id uuid, p_body text, p_parent_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $reply$
declare
  me uuid := auth.uid();
  saved uuid;
begin
  if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  then raise exception 'Inicia sesión para comentar'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 2 and 900
  then raise exception 'Escribe entre 2 y 900 caracteres'; end if;
  if not exists(select 1 from public.ae_free_takes where id=p_take_id and not hidden)
  then raise exception 'Este Take no está disponible'; end if;
  if p_parent_id is not null and not exists (
    select 1 from public.ae_take_replies
    where id=p_parent_id and take_id=p_take_id and not hidden and parent_id is null
  ) then raise exception 'La respuesta original no está disponible'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ae-replies:' || me::text));
  if (select count(*) from public.ae_take_replies
      where user_id=me and created_at > now()-interval '1 hour') >= 25
  then raise exception 'Límite de comentarios alcanzado. Inténtalo más tarde'; end if;
  insert into public.ae_take_replies(take_id,parent_id,user_id,body)
  values (p_take_id,p_parent_id,me,btrim(p_body))
  returning id into saved;
  return saved;
end $reply$;

create or replace function public.ae_hide_take_reply(p_reply_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $hide$
begin
  if auth.uid() is null or not public.rcm_is_editor()
  then raise exception 'Solo administradores'; end if;
  update public.ae_take_replies set hidden=true where id=p_reply_id and not hidden;
  return found;
end $hide$;

revoke all on function public.ae_take_comment_thread(uuid) from public,anon,authenticated;
revoke all on function public.ae_post_take_reply(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.ae_hide_take_reply(uuid) from public,anon,authenticated;
grant execute on function public.ae_take_comment_thread(uuid) to anon,authenticated;
grant execute on function public.ae_post_take_reply(uuid,text,uuid) to authenticated;
grant execute on function public.ae_hide_take_reply(uuid) to authenticated;
notify pgrst,'reload schema';