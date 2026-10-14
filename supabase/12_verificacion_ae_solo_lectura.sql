-- SOLO LECTURA. Ejecutar después de 11; no modifica usuarios, cuotas ni puntos.
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'ae\_%' escape '\' and c.relkind='r' order by c.relname;
select routine_name,grantee,privilege_type from information_schema.routine_privileges where specific_schema='public' and routine_name like 'ae\_%' escape '\' order by routine_name,grantee;
select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public' and table_name like 'ae\_%' escape '\' and grantee in('anon','authenticated','service_role') order by table_name,grantee;
select event_id,selection,count(*) from public.ae_offers group by event_id,selection having count(*)>1;
select user_id,event_id,count(*) from public.ae_picks group by user_id,event_id having count(*)>1;
select p.id,coalesce(l.total,0) ledger_total,s.points current_points from public.ae_picks p
left join lateral(select sum(delta) total from public.ae_ledger where pick_id=p.id)l on true
left join lateral(select points from public.ae_settlements where pick_id=p.id order by created_at desc,id desc limit 1)s on true
where coalesce(l.total,0)<>coalesce(s.points,0);
select ae_points(504) plus_504,ae_points(-110) minus_110;
select status,count(*),sum(objects) returned_objects,max(created_at) latest from public.ae_sync_log group by status;
select ae_offer_board() offers,ae_public_highlights() highlights,ae_stats() ranking;
-- Esperado: RLS true en todas; ninguna escritura de navegador; worker RPC solo service_role;
-- cero duplicados/diferencias de ledger; 5.04 y 0.91. Comparar conteos históricos con 10.
