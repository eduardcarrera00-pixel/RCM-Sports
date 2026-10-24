alter table public.cam_football_games add column points_manual boolean not null default false;
alter table public.cam_football_games drop constraint cam_football_scoring_complete;
alter table public.cam_football_games add constraint cam_football_scoring_complete check (
  (odds_locked_at is null and not picks_open
   and probability_home is null and probability_draw is null and probability_away is null
   and points_home is null and points_draw is null and points_away is null)
  or
  (odds_locked_at is not null
   and points_home is not null and points_draw is not null and points_away is not null
   and (
     (probability_home is not null and probability_draw is not null and probability_away is not null
      and probability_home > 0 and probability_draw > 0 and probability_away > 0
      and abs(probability_home + probability_draw + probability_away - 1) < 0.00001)
     or
     (odds_source is not null and odds_source = 'automatic_equal_v1'
      and odds_home is null and odds_draw is null and odds_away is null
      and probability_home is null and probability_draw is null and probability_away is null
      and (points_manual or (points_home = 6 and points_draw = 6 and points_away = 6)))
   ))
);
-- Real ESPN 1X2 odds; preserve any game with submitted picks.
create or replace function public.cam_football_freeze_points(
 p_game_id text,p_home integer default null,p_draw integer default null,
 p_away integer default null,p_source text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
 g public.cam_football_games%rowtype;
 h numeric; d numeric; a numeric; total numeric;
 fallback boolean := p_home is null and p_draw is null and p_away is null;
begin
 select * into g from public.cam_football_games where id=p_game_id for update;
 if not found or g.points_manual or (g.odds_locked_at is not null and (g.odds_source is distinct from 'automatic_equal_v1' or fallback)) or g.status<>'scheduled'
    or g.kickoff<=clock_timestamp()
    or exists(select 1 from public.cam_football_picks where game_id=p_game_id)
 then return false; end if;
 if not fallback then
   if p_home is null or p_draw is null or p_away is null
      or abs(p_home::bigint) not between 100 and 99999
      or abs(p_draw::bigint) not between 100 and 99999
      or abs(p_away::bigint) not between 100 and 99999
   then raise exception 'Mercado 1X2 incompleto o inválido'; end if;
   h:=public.cam_football_american_probability(p_home);
   d:=public.cam_football_american_probability(p_draw);
   a:=public.cam_football_american_probability(p_away);
   total:=h+d+a;
   h:=round(h/total,6); d:=round(d/total,6); a:=1-h-d;
   if h<=0 or d<=0 or a<=0 then raise exception 'Probabilidades inválidas'; end if;
 end if;
 update public.cam_football_games set
   odds_home=p_home,odds_draw=p_draw,odds_away=p_away,
   probability_home=h,probability_draw=d,probability_away=a,
   points_home=case when fallback then 6 else public.cam_football_probability_points(h) end,
   points_draw=case when fallback then 6 else public.cam_football_probability_points(d) end,
   points_away=case when fallback then 6 else public.cam_football_probability_points(a) end,
   odds_source=case when fallback then 'automatic_equal_v1'
     else left(coalesce(nullif(trim(p_source),''),'automatic_odds_v1'),64) end,
   odds_locked_at=clock_timestamp(),picks_open=(opening_mode<>'closed')
 where id=p_game_id;
 insert into public.cam_football_audit(game_id,action,detail)
 values(p_game_id,'freeze_points_auto',jsonb_build_object(
   'method',case when fallback then 'equal_v1' else 'odds_v1' end,
   'home',p_home,'draw',p_draw,'away',p_away,'source',p_source));
 return true;
end $$;
revoke all on function public.cam_football_freeze_points(text,integer,integer,integer,text)
 from public,anon,authenticated;
grant execute on function public.cam_football_freeze_points(text,integer,integer,integer,text) to service_role;

-- A published snapshot stays fixed even before the first user submits a pick.
create or replace function public.cam_football_keep_points()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.odds_locked_at is not null and
   (new.odds_home,new.odds_draw,new.odds_away,
    new.probability_home,new.probability_draw,new.probability_away,
    new.points_home,new.points_draw,new.points_away,new.odds_source,new.odds_locked_at,new.points_manual)
   is distinct from
   (old.odds_home,old.odds_draw,old.odds_away,
    old.probability_home,old.probability_draw,old.probability_away,
    old.points_home,old.points_draw,old.points_away,old.odds_source,old.odds_locked_at,old.points_manual)
 then
   if new.points_manual and auth.uid() is not null and public.rcm_is_editor()
      and new.status='scheduled' and new.kickoff>clock_timestamp()
      and (new.odds_home,new.odds_draw,new.odds_away,new.probability_home,new.probability_draw,new.probability_away,new.odds_source,new.odds_locked_at)
          is not distinct from
          (old.odds_home,old.odds_draw,old.odds_away,old.probability_home,old.probability_draw,old.probability_away,old.odds_source,old.odds_locked_at)
      and not exists(select 1 from public.cam_football_picks where game_id=old.id)
   then return new; end if;
   -- Only provisional equal points may gain real odds, before ANY saved pick.
   if not old.points_manual and old.odds_source='automatic_equal_v1'
      and new.odds_source is distinct from 'automatic_equal_v1'
      and new.status='scheduled' and new.kickoff>clock_timestamp()
      and new.probability_home is not null and new.probability_draw is not null
      and new.probability_away is not null
      and not exists(select 1 from public.cam_football_picks where game_id=old.id)
   then return new; end if;
   raise exception 'Los puntos publicados no se pueden modificar';
 end if;
 return new;
end $$;
revoke all on function public.cam_football_keep_points() from public,anon,authenticated;



create or replace function public.cam_football_admin_points(p_game_id text,p_home integer,p_draw integer,p_away integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_football_games%rowtype;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_home is null or p_draw is null or p_away is null or p_home not between 2 and 12
 or p_draw not between 2 and 12 or p_away not between 2 and 12 then raise exception 'Usa puntos enteros de 2 a 12'; end if;
 select * into g from public.cam_football_games where id=p_game_id for update;
 if not found or g.status<>'scheduled' or g.kickoff<=clock_timestamp() or g.odds_locked_at is null
 or exists(select 1 from public.cam_football_picks where game_id=p_game_id)
 then raise exception 'Solo puedes ajustar partidos futuros sin pronósticos guardados'; end if;
 update public.cam_football_games set points_home=p_home,points_draw=p_draw,points_away=p_away,points_manual=true where id=p_game_id;
 insert into public.cam_football_audit(game_id,action,actor_id,detail) values
 (p_game_id,'manual_points',auth.uid(),jsonb_build_object('before',jsonb_build_array(g.points_home,g.points_draw,g.points_away),'after',jsonb_build_array(p_home,p_draw,p_away)));
 return true;
end $$;
revoke all on function public.cam_football_admin_points(text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.cam_football_admin_points(text,integer,integer,integer) to authenticated;
notify pgrst,'reload schema';
