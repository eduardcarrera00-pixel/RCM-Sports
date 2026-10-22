-- CAM SPORTS: production-only Supabase Cron schedule.
-- Execute after both migrations and the cam-nfl-sync Edge Function are deployed.
-- The random token was generated entirely inside Vault by 20261022180000_cam_nfl_cron_vault.sql.
-- Never paste secrets into SQL or GitHub.
select cron.schedule('cam-nfl-results-every-30-min', '17,47 * * 1,2,9-12 *', $job$
 select net.http_post(
   url:='https://zahuhmvmqvxaunqebqaa.supabase.co/functions/v1/cam-nfl-sync',
   headers:=jsonb_build_object(
     'Content-Type','application/json',
     'x-cam-cron',(select decrypted_secret from vault.decrypted_secrets where name='cam_nfl_cron_token')
   ),
   body:='{"action":"sync"}'::jsonb,
   timeout_milliseconds:=60000
 ) as request_id;
$job$);
