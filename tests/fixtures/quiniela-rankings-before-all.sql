CREATE OR REPLACE FUNCTION public.cam_football_leaderboard(p_scope text, p_season integer, p_competition text DEFAULT NULL::text, p_matchday integer DEFAULT NULL::integer, p_month text DEFAULT NULL::text)
 RETURNS TABLE(rank_position bigint, user_id uuid, username text, points bigint, hits bigint, resolved bigint, accuracy numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_scope not in ('matchday','month','season') or p_season not between 2020 and 2100
 or (p_competition is not null and p_competition not in ('laliga','premier','ligamx','champions'))
 or (p_scope='matchday' and (p_matchday is null or p_matchday not between 1 and 60 or p_competition is null))
 or (p_scope='month' and (p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Periodo inválido'; end if;
 return query
 with totals as (
 select p.user_id,sum(p.awarded_points)::bigint pts,
 count(*) filter(where p.pick=g.outcome)::bigint wins,count(*)::bigint total
 from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
 where g.status='final' and g.outcome is not null and g.season=p_season
 and (p_competition is null or g.competition=p_competition)
 and (p_scope<>'matchday' or g.matchday=p_matchday)
 and (p_scope<>'month' or to_char(g.kickoff at time zone 'America/Toronto','YYYY-MM')=p_month)
 group by p.user_id
 ), ranked as (
 select t.*,round(100.0*t.wins/nullif(t.total,0),1) pct,
 dense_rank() over(order by t.pts desc,t.wins desc,
 (100.0*t.wins/nullif(t.total,0)) desc) pos from totals t
 )
 select r.pos,r.user_id,
 coalesce(nullif(left(a.username,40),''),nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
 r.pts,r.wins,r.total,r.pct
 from ranked r join auth.users u on u.id=r.user_id
 left join public.ae_auth_accounts a on a.user_id=r.user_id
 order by r.pos,r.user_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cam_football_public_pick_breakdown(p_user_id uuid, p_season integer, p_competition text DEFAULT NULL::text, p_matchday integer DEFAULT NULL::integer)
 RETURNS TABLE(game_id text, pick text, awarded_points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.game_id,p.pick,p.awarded_points
 from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
 where p.user_id=p_user_id and g.season=p_season and g.status='final' and g.outcome is not null
 and (p_competition is null or g.competition=p_competition)
 and (p_matchday is null or g.matchday=p_matchday)
 order by g.kickoff desc limit 200;
$function$
;

CREATE OR REPLACE FUNCTION public.cam_nfl_leaderboard(p_scope text, p_season integer, p_week integer DEFAULT NULL::integer, p_month text DEFAULT NULL::text)
 RETURNS TABLE(rank_position bigint, user_id uuid, username text, points bigint, hits bigint, resolved bigint, accuracy numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_scope not in ('week','month','season') or p_season not between 2020 and 2100
 or (p_scope='week' and (p_week is null or p_week not between 1 and 22))
 or (p_scope='month' and (p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Periodo inválido'; end if;
 return query
 with totals as (
 select p.user_id,sum(p.awarded_points)::bigint pts,
 count(*) filter(where p.team_id=g.winner_id)::bigint wins,count(*)::bigint total
 from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
 where g.status='final' and g.winner_id is not null and g.season=p_season
 and (p_scope<>'week' or g.week=p_week)
 and (p_scope<>'month' or to_char(g.kickoff at time zone 'America/New_York','YYYY-MM')=p_month)
 group by p.user_id
 ), ranked as (
 select t.*,round(100.0*t.wins/nullif(t.total,0),1) pct,
 dense_rank() over(order by t.pts desc,t.wins desc,
 (100.0*t.wins/nullif(t.total,0)) desc) pos from totals t
 )
 select r.pos,r.user_id,
 coalesce(nullif(left(a.username,40),''),nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
 r.pts,r.wins,r.total,r.pct
 from ranked r join auth.users u on u.id=r.user_id
 left join public.ae_auth_accounts a on a.user_id=r.user_id
 order by r.pos,r.user_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cam_nfl_public_pick_breakdown(p_user_id uuid, p_season integer, p_week integer DEFAULT NULL::integer)
 RETURNS TABLE(game_id text, team_id text, awarded_points integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.game_id,p.team_id,p.awarded_points,g.status
 from public.cam_nfl_picks p
 join public.cam_nfl_games g on g.id=p.game_id
 where p.user_id=p_user_id and g.season=p_season
   and (p_week is null or g.week=p_week)
   and g.status in('final','tie','cancelled') and p.settled_at is not null
 order by g.kickoff desc
 limit 500;
$function$
;
