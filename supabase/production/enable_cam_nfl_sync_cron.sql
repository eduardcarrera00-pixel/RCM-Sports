-- CAM SPORTS | Production-only setup after migration and Edge deployment.
-- CRON runs without browser sessions, using a random token from Supabase Vault.
-- Does not embed, output or send secrets to GitHub Pages.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists cam_nfl_sync_private;
revoke all on schema cam_nfl_sync_private from public,anon,authenticated;

create or replace function cam_nfl_sync_private.dispatch(p_mode text)
returns bigint language plpgsql security definer set search_path='' as $$
declare token text; request_id bigint;
begin
 if p_mode not in ('hourly','live') then raise exception 'Unsupported cron mode'; end if;
 if p_mode='live' and not exists (
   select 1 from public.cam_nfl_games where status='live' or
   (status in ('scheduled','postponed') and kickoff between
    statement_timestamp()-interval '5 hours' and statement_timestamp()+interval '20 minutes')
 ) then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets
   where name='cam_nfl_cron_token' limit 1;
 if token is null or length(token)<32 then return null; end if;
 select net.http_post(
   url:='https://zahuhmvmqvxaunqebqaa.supabase.co/functions/v1/cam-nfl-sync',
   headers:=jsonb_build_object('Content-Type','application/json','x-cam-cron',token),
   body:='{"action":"sync"}'::jsonb,
   timeout_milliseconds:=55000
 ) into request_id;
 return request_id;
end $$;
revoke all on function cam_nfl_sync_private.dispatch(text) from public,anon,authenticated;

do $setup$
begin
 -- Avoid concurrent schedule if the existing CAM NFL automator is already installed.
 if not exists(select 1 from cron.job where jobname in ('cam-nfl-hourly','cam-nfl-auto-hourly')) then
   perform cron.schedule('cam-nfl-hourly','7 * * * *',
     'select cam_nfl_sync_private.dispatch(''hourly'')');
 end if;
 if not exists(select 1 from cron.job where jobname in ('cam-nfl-results-every-10-min','cam-nfl-auto-results')) then
   perform cron.schedule('cam-nfl-results-every-10-min','*/10 * * * *',
     'select cam_nfl_sync_private.dispatch(''live'')');
 end if;
 -- Remove the older 30-minute job only after the new 10-minute job exists.
 if exists(select 1 from cron.job where jobname='cam-nfl-results-every-30-min')
   and exists(select 1 from cron.job where jobname in('cam-nfl-results-every-10-min','cam-nfl-auto-results')) then
    perform cron.unschedule('cam-nfl-results-every-30-min');
 end if;
end $setup$;
