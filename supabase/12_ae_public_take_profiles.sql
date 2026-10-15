-- Public historic author profiles, with editing/deletion disabled for reader accounts.
revoke update,delete on table public.ae_free_takes from public,anon,authenticated;
create or replace function public.ae_public_take_feed(p_sport text default 'all')
returns table(id uuid,author_id uuid,author text,sport text,title text,body text,created_at timestamptz,upvotes bigint,downvotes bigint,my_vote smallint)
language sql stable security definer set search_path='' as $f$
select t.id,t.user_id,coalesce(nullif(left(u.raw_user_meta_data->>'username',40),''),nullif(left(u.raw_user_meta_data->>'display_name',40),''),'Aficionado')::text,t.sport,t.title,t.body,t.created_at,
(select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=1)::bigint,
(select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=-1)::bigint,
(select v.value from public.ae_free_take_votes v where v.take_id=t.id and v.user_id=auth.uid())
from public.ae_free_takes t join auth.users u on u.id=t.user_id
where not t.hidden and (p_sport='all' or t.sport=p_sport)
order by t.created_at desc,t.id desc limit 200;
$f$;
create or replace function public.ae_public_take_profile(p_author_id uuid)
returns table(id uuid,author_id uuid,author text,sport text,title text,body text,created_at timestamptz,upvotes bigint,downvotes bigint,my_vote smallint)
language sql stable security definer set search_path='' as $f$
select t.id,t.user_id,coalesce(nullif(left(u.raw_user_meta_data->>'username',40),''),nullif(left(u.raw_user_meta_data->>'display_name',40),''),'Aficionado')::text,t.sport,t.title,t.body,t.created_at,
(select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=1)::bigint,
(select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=-1)::bigint,
(select v.value from public.ae_free_take_votes v where v.take_id=t.id and v.user_id=auth.uid())
from public.ae_free_takes t join auth.users u on u.id=t.user_id
where t.user_id=p_author_id and not t.hidden
order by t.created_at desc,t.id desc limit 500;
$f$;
revoke all on function public.ae_public_take_feed(text) from public,anon,authenticated;
revoke all on function public.ae_public_take_profile(uuid) from public,anon,authenticated;
grant execute on function public.ae_public_take_feed(text) to anon,authenticated;
grant execute on function public.ae_public_take_profile(uuid) to anon,authenticated;
notify pgrst,'reload schema';