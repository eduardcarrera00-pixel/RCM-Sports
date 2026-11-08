-- A correct prediction earns its published points; a miss loses that prediction's
-- own published points. NFL laurels retain their win-only x2 bonus.
alter table public.cam_nfl_picks drop constraint if exists cam_nfl_picks_awarded_points_check;
alter table public.cam_nfl_picks add constraint cam_nfl_picks_awarded_points_check check (awarded_points between -12 and 24);
alter table public.cam_football_picks drop constraint if exists cam_football_picks_awarded_points_check;
alter table public.cam_football_picks add constraint cam_football_picks_awarded_points_check check (awarded_points between -12 and 12);

-- Preserve the existing server-only trigger execution model and audit trail.
create or replace function public.cam_nfl_settlement_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.status,new.home_score,new.away_score,new.winner_id)
    is not distinct from (old.status,old.home_score,old.away_score,old.winner_id) then return new; end if;
 update public.cam_nfl_picks p
 set awarded_points=case when new.status='final' and new.winner_id is not null then
       (case when p.team_id=new.home_id then new.points_home else new.points_away end)
       * case when p.team_id<>new.winner_id then -1
              when exists(select 1 from public.cam_nfl_laurels l where l.user_id=p.user_id and l.game_id=new.id) then 2
              else 1 end
       else 0 end,
     settled_at=case when (new.status='final' and new.winner_id is not null) or new.status in ('tie','cancelled') then now() else null end
 where p.game_id=new.id;
 insert into public.cam_nfl_audit(game_id,action,actor_id,detail)
 values(new.id,'result_changed',auth.uid(),jsonb_build_object(
 'old_status',old.status,'new_status',new.status,'old_winner',old.winner_id,'new_winner',new.winner_id,
 'old_home_score',old.home_score,'new_home_score',new.home_score,'old_away_score',old.away_score,'new_away_score',new.away_score));
 return new;
end $$;
revoke all on function public.cam_nfl_settlement_trigger() from public,anon,authenticated;

create or replace function public.cam_football_settlement_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.status,new.home_score,new.away_score,new.outcome)
    is not distinct from (old.status,old.home_score,old.away_score,old.outcome) then return new; end if;
 update public.cam_football_picks p
 set awarded_points=case when new.status='final' and new.outcome is not null then
       (case p.pick when 'home' then new.points_home when 'draw' then new.points_draw else new.points_away end)
       * case when p.pick=new.outcome then 1 else -1 end
       else 0 end,
     settled_at=case when (new.status='final' and new.outcome is not null) or new.status='cancelled' then now() else null end
 where p.game_id=new.id;
 insert into public.cam_football_audit(game_id,action,actor_id,detail)
 values(new.id,'result_changed',auth.uid(),jsonb_build_object(
 'old_status',old.status,'new_status',new.status,'old_outcome',old.outcome,'new_outcome',new.outcome,
 'old_home_score',old.home_score,'new_home_score',new.home_score,'old_away_score',old.away_score,'new_away_score',new.away_score));
 return new;
end $$;
revoke all on function public.cam_football_settlement_trigger() from public,anon,authenticated;

-- Recalculate final-only ledgers from their frozen point values. Keep the
-- original settlement timestamps, predictions and underlying game results.
with expected as (
 select p.game_id,p.user_id,
   case when g.status='final' and g.winner_id is not null then
     (case when p.team_id=g.home_id then g.points_home else g.points_away end)
     * case when p.team_id<>g.winner_id then -1
       when exists(select 1 from public.cam_nfl_laurels l where l.user_id=p.user_id and l.game_id=g.id) then 2 else 1 end
     else 0 end points
 from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
 where g.status in ('final','tie','cancelled')
)
update public.cam_nfl_picks p set awarded_points=e.points from expected e
where p.game_id=e.game_id and p.user_id=e.user_id and p.awarded_points is distinct from e.points;
with expected as (
 select p.game_id,p.user_id,
   case when g.status='final' and g.outcome is not null then
     (case p.pick when 'home' then g.points_home when 'draw' then g.points_draw else g.points_away end)
     * case when p.pick=g.outcome then 1 else -1 end
     else 0 end points
 from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
 where g.status in ('final','cancelled')
)
update public.cam_football_picks p set awarded_points=e.points from expected e
where p.game_id=e.game_id and p.user_id=e.user_id and p.awarded_points is distinct from e.points;

-- Existing standings, profiles and Parties already sum the signed ledger.
-- Refresh the league projections now; final monthly awards remain immutable.
select cam_competitive.tick();
