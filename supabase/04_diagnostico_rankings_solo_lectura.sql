-- Solo lectura. Ejecutar ANTES de 03 para diagnosticar el estado actual.
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('articles','article_likes','nfl_rankings','nfl_ranking_drafts','editors');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
 where schemaname='public' and tablename in ('nfl_rankings','nfl_ranking_drafts','articles','article_likes','editors');
select grantee,table_name,privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('nfl_rankings','nfl_ranking_drafts','article_likes') order by table_name,grantee;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('rcm_publish_ranking','rcm_validate_ranking','rcm_is_editor');
select count(*) published_rows from public.nfl_rankings;
select edition,team_ids,updated_at from public.nfl_rankings;
select count(*) draft_rows from public.nfl_ranking_drafts;
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='articles';
-- Vista del visitante; no escribe datos. Ejecutar como bloque completo.
begin;
set local role anon;
select edition,team_ids,updated_at from public.nfl_rankings;
rollback;
