-- SOLO LECTURA. Guardar la salida antes de autorizar 11. No devuelve datos personales.
select current_database() database_name, current_user db_role, now() checked_at;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in('articles','editors','nfl_rankings','champions_rankings','sports_picks','ae_events','ae_picks') order by table_name,ordinal_position;
select to_regprocedure('public.rcm_is_editor()') editor_check;
select c.relname,c.relrowsecurity,pg_total_relation_size(c.oid) bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and (c.relname like 'ae\_%' escape '\' or c.relname in('articles','comments','comment_votes','article_likes','nfl_rankings','champions_rankings','sports_picks','pick_votes')) and c.relkind='r';
select c.relname,query_to_xml(format('select count(*) as rows from public.%I',c.relname),false,true,'') row_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in('articles','comments','comment_votes','article_likes','nfl_rankings','champions_rankings','sports_picks','pick_votes');
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
-- Requisitos: articles.id UUID, editors y rcm_is_editor() instalados. Si ya existen ae_* con
-- otro esquema, comparar primero: CREATE IF NOT EXISTS no sustituye una revisión de compatibilidad.
