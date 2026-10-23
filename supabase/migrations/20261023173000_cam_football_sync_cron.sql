-- CAM SPORTS | Cron de la Quiniela de Fútbol, gemelo del de la NFL.
-- El token sigue viviendo en Vault; nadie lo copia a GitHub ni al navegador.
create schema if not exists cam_football_sync_private;
revoke all on schema cam_football_sync_private from public, anon, authenticated;

create or replace function cam_football_sync_private.dispatch(p_mode text)
returns bigint language plpgsql security definer set search_path='' as $$
declare token text; request_id bigint;
begin
 if p_mode not in ('hourly','live') then raise exception 'Unsupported cron mode'; end if;
 -- En modo «live» solo se molesta al proveedor si hay partidos en juego o a punto.
 if p_mode='live' and not exists (
   select 1 from public.cam_football_games where status='live' or
   (status in ('scheduled','postponed') and kickoff between
    statement_timestamp()-interval '4 hours' and statement_timestamp()+interval '20 minutes')
 ) then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets
   where name='cam_nfl_cron_token' limit 1;
 if token is null or length(token)<32 then return null; end if;
 select net.http_post(
   url:='https://zahuhmvmqvxaunqebqaa.supabase.co/functions/v1/cam-football-sync',
   headers:=jsonb_build_object('Content-Type','application/json','x-cam-cron',token),
   body:='{"action":"sync"}'::jsonb,
   timeout_milliseconds:=55000
 ) into request_id;
 return request_id;
end $$;
revoke all on function cam_football_sync_private.dispatch(text) from public, anon, authenticated;

select cron.schedule('cam-football-hourly','23 * * * *',
  $$select cam_football_sync_private.dispatch('hourly')$$)
where not exists (select 1 from cron.job where jobname='cam-football-hourly');

select cron.schedule('cam-football-results-every-10-min','4-59/10 * * * *',
  $$select cam_football_sync_private.dispatch('live')$$)
where not exists (select 1 from cron.job where jobname='cam-football-results-every-10-min');
