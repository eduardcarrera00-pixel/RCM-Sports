-- CAM SPORTS: only reveal settled NFL picks, never live/locked predictions.
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

notify pgrst,'reload schema';
