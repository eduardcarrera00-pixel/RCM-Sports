-- SOLO LECTURA. Guardar resultados y contrastarlos con el respaldo antes de 07.
begin read only;
select version();
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in('articles','editors','comments','comment_votes','article_likes','nfl_rankings','nfl_ranking_drafts','champions_clubs','champions_rankings','sports_picks','pick_editions') order by table_name,ordinal_position;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rcm_%';
select 'articles' as tabla,count(*) as registros from public.articles
union all select 'comments',count(*) from public.comments
union all select 'comment_votes',count(*) from public.comment_votes
union all select 'article_likes',count(*) from public.article_likes
union all select 'editors',count(*) from public.editors;
select id,edition,team_ids,updated_at from public.nfl_rankings;
commit;
