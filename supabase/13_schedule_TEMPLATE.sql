-- TEMPLATE: NO ejecutar hasta configurar los secretos en Vault y desplegar ae-sync.
-- No pegar claves privadas en GitHub. Configurar ae_sync_url y ae_cron_secret en Vault.
-- Requiere pg_cron, pg_net, supabase_vault habilitados por el propietario.
-- Ejecutar una sola vez en el proyecto aprobado. Cada 10 min; revisar presupuesto primero.
select cron.schedule('ae-sports-sync','*/10 * * * *',$job$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='ae_sync_url'),
 headers:=jsonb_build_object('Content-Type','application/json','x-ae-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='ae_cron_secret')),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
-- Para pausar: select cron.unschedule('ae-sports-sync');
