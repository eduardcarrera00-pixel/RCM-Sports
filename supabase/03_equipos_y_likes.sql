-- Ejecutar SOLO tras respaldo e inspección 00 y 04. No ejecutar 01 otra vez
-- para instalar esta mejora: 01 importa ejemplos históricos. 03 no importa datos.
begin;
do $$ begin
 if to_regprocedure('public.rcm_is_editor()') is null or to_regclass('public.rcm_comment_totals') is null then
  raise exception 'RCM: falta la migración de comunidad; revisar inspección antes de continuar';
 end if;
 if (select data_type from information_schema.columns where table_schema='public' and table_name='articles' and column_name='id') <> 'uuid' then
  raise exception 'RCM: se esperaba articles.id UUID; revisar esquema';
 end if;
end $$;
alter table public.articles add column if not exists football_team text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.articles'::regclass and conname='rcm_football_team') then
  alter table public.articles add constraint rcm_football_team check(
   football_team is null or (category is not null and category='Fútbol' and football_team in ('barcelona','real-madrid','manchester-united')));
 end if;
end $$;
-- No se modifica ninguna publicación anterior: football_team permanece NULL.
create table if not exists public.article_likes(
 article_id uuid not null references public.articles(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(article_id,user_id)
);
alter table public.article_likes enable row level security;
revoke all on public.article_likes from public,anon,authenticated;
grant select,insert,delete on public.article_likes to authenticated;
drop policy if exists rcm_like_owner on public.article_likes;
create policy rcm_like_owner on public.article_likes for all to authenticated
 using(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
 with check(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from public.articles a where a.id=article_id and a.is_public));
drop policy if exists rcm_like_guard on public.article_likes;
create policy rcm_like_guard on public.article_likes as restrictive for all to authenticated
 using(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
 with check(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from public.articles a where a.id=article_id and a.is_public));

create or replace function public.rcm_set_article_like(p_article_id uuid,p_liked boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'RCM: inicia sesión'; end if;
 if p_liked is null then raise exception 'RCM: like inválido'; end if;
 if not exists(select 1 from public.articles where id=p_article_id and is_public) then raise exception 'RCM: publicación no disponible'; end if;
 if p_liked then
  insert into public.article_likes(article_id,user_id) values(p_article_id,auth.uid()) on conflict do nothing;
 else
  delete from public.article_likes where article_id=p_article_id and user_id=auth.uid();
 end if;
end $$;
revoke all on function public.rcm_set_article_like(uuid,boolean) from public,anon;
grant execute on function public.rcm_set_article_like(uuid,boolean) to authenticated;

-- Solo agregados públicos; no se exponen identidades de quienes dieron like.
-- SECURITY DEFINER permite contar todos los likes sin dar SELECT sobre usuarios ajenos.
create or replace function public.rcm_read_article_totals()
returns table(article_id uuid,likes bigint,my_like boolean,top_comment text)
language sql stable security definer set search_path='' as $$
 select a.id,(select count(*) from public.article_likes l where l.article_id=a.id),
 exists(select 1 from public.article_likes l where l.article_id=a.id and l.user_id=auth.uid()),
 (select c.body from public.rcm_comment_totals c where c.article_id=a.id::text and c.upvotes>0
  order by c.upvotes desc,c.created_at desc,c.id limit 1)
 from public.articles a where a.is_public;
$$;
revoke all on function public.rcm_read_article_totals() from public;
grant execute on function public.rcm_read_article_totals() to anon,authenticated;
create or replace view public.rcm_article_totals with(security_invoker=true) as select * from public.rcm_read_article_totals();
grant select on public.rcm_article_totals to anon,authenticated;
notify pgrst,'reload schema';
commit;
