-- CAM SPORTS | Quiniela NFL: public results detail + independent Supabase Cron.
-- This migration never embeds credentials or invents sporting data.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.cam_nfl_public_pick_breakdown(
  p_user_id uuid, p_season integer, p_week integer default null)
returns table(game_id text, team_id text, awarded_points integer, status text)
language sql stable security definer set search_path='' as $$
 select p.game_id,p.team_id,p.awarded_points,g.status
 from public.cam_nfl_picks p
 join public.cam_nfl_games g on g.id=p.game_id
 where p.user_id=p_user_id and g.season=p_season
   and (p_week is null or g.week=p_week)
   and g.status in('final','tie','cancelled') and p.settled_at is not null
 order by g.kickoff desc
 limit 500;
$$;
revoke all on function public.cam_nfl_public_pick_breakdown(uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.cam_nfl_public_pick_breakdown(uuid,integer,integer)
  to anon,authenticated;

-- Cron requires BOTH secrets to exist in Supabase Vault:
-- cam_nfl_sync_url   = https://PROJECT_REF.supabase.co/functions/v1/cam-nfl-sync
-- cam_nfl_cron_token = random token of at least 32 characters, matching
--                      Edge Function CAM_NFL_CRON_SECRET.
-- No secret values are present in this migration.
create or replace function public.cam_nfl_cron_dispatch(p_mode text)
returns bigint
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text; request_id bigint;
begin
 if p_mode not in ('hourly','live') then raise exception 'Cron mode invalid'; end if;
 if p_mode='live' and not exists (
  select 1 from public.cam_nfl_games g where
   g.status='live' or (g.status in ('scheduled','postponed') and
   g.kickoff between statement_timestamp() - interval '5 hours'
                 and statement_timestamp() + interval '20 minutes')
 ) then return null; end if;

 select decrypted_secret into endpoint from vault.decrypted_secrets
 where name='cam_nfl_sync_url' order by created_at desc limit 1;
 select decrypted_secret into token from vault.decrypted_secrets
 where name='cam_nfl_cron_token' order by created_at desc limit 1;
 if endpoint is null or endpoint !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/cam-nfl-sync$'
    or token is null or length(token)<32 then return null; end if;

 select net.http_post(
   url:=endpoint,
   headers:=jsonb_build_object('Content-Type','application/json','x-cam-cron',token),
   body:='{"action":"sync"}'::jsonb,
   timeout_milliseconds:=55000
 ) into request_id;
 insert into public.cam_nfl_audit(action, detail)
 values ('cron_dispatched',jsonb_build_object('mode',p_mode,'request_id',request_id));
 return request_id;
end $$;
revoke all on function public.cam_nfl_cron_dispatch(text) from public,anon,authenticated;

select cron.schedule('cam-nfl-weekly-hourly','7 * * * *',
  'select public.cam_nfl_cron_dispatch(''hourly'')');
select cron.schedule('cam-nfl-results-ten-minutes','*/10 * * * *',
  'select public.cam_nfl_cron_dispatch(''live'')');
notify pgrst,'reload schema';
