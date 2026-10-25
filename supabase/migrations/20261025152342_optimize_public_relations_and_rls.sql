-- Preserve authorization while caching session checks per statement.
-- Only public operational tables; backup schemas and unused indexes are untouched.
set lock_timeout = '3s';
set statement_timeout = '30s';

do $optimize$
declare p record; q text; w text; ddl text;
begin
  for p in select * from pg_policies where schemaname='public'
    and (tablename,policyname) in (
      ('article_likes','rcm_like_owner'),('article_likes','rcm_like_guard'),
      ('ae_community_picks','ae_pick_insert'),('ae_pick_comments','ae_comment_insert'),
      ('ae_pick_votes','ae_vote_insert'),('ae_pick_votes','ae_vote_update'),
      ('ae_opinions','ae_opinions_insert'))
  loop
    q := p.qual; w := p.with_check;
    if q is not null and q not ilike '%select auth.jwt()%' then
      q := replace(q,'auth.jwt()','(select auth.jwt())');
    end if;
    if w is not null and w not ilike '%select auth.jwt()%' then
      w := replace(w,'auth.jwt()','(select auth.jwt())');
    end if;
    if p.tablename='ae_opinions' then
      w := '((select public.rcm_is_editor()) AND (created_by = (select auth.uid())))';
    end if;
    if q is distinct from p.qual or w is distinct from p.with_check then
      ddl := format('alter policy %I on public.%I',p.policyname,p.tablename);
      if q is not null then ddl:=ddl||' using ('||q||')'; end if;
      if w is not null then ddl:=ddl||' with check ('||w||')'; end if;
      execute ddl;
    end if;
  end loop;
end $optimize$;

-- Equivalent editor/ownership policies already coexist with these legacy copies.
-- Retain all RESTRICTIVE publication, ownership and anonymous-account guards.
drop policy if exists "Solo editores pueden eliminar" on public.articles;
drop policy if exists "Solo editores pueden publicar" on public.articles;
drop policy if exists "Solo editores pueden editar" on public.articles;
drop policy if exists "RCM editors can update article images" on public.articles;
drop policy if exists "Visitors can remove their own votes" on public.comment_votes;
drop policy if exists "Cada editor consulta su permiso" on public.editors;

alter policy rcm_articles_insert on public.articles with check ((select public.rcm_is_editor()));
alter policy rcm_articles_update on public.articles
  using ((select public.rcm_is_editor())) with check ((select public.rcm_is_editor()));
alter policy rcm_articles_delete on public.articles using ((select public.rcm_is_editor()));

-- High-use ownership/thread lookups lack leading indexes for these FK columns.
create index if not exists cam_comment_votes_user_idx on public.comment_votes(user_id);
create index if not exists cam_comments_user_idx on public.comments(user_id);
create index if not exists cam_comments_parent_article_idx on public.comments(parent_id,article_id);
create index if not exists cam_article_likes_user_idx on public.article_likes(user_id);
create index if not exists cam_free_take_votes_user_idx on public.ae_free_take_votes(user_id);
create index if not exists cam_pick_comment_votes_user_idx on public.ae_pick_comment_votes(user_id);
create index if not exists cam_take_replies_parent_idx on public.ae_take_replies(parent_id);
create index if not exists cam_nfl_picks_team_idx on public.cam_nfl_picks(team_id);
