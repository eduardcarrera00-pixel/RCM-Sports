-- NFL automation: week rankings scoped by official phase, never merge postseason Week 1 with REG Week 1.
create or replace function public.cam_nfl_leaderboard_phase(
 p_scope text,p_season integer,p_week integer default null,p_month text default null,p_phase text default 'REG'
) returns table(rank_position bigint,user_id uuid,username text,points bigint,hits bigint,resolved bigint,accuracy numeric)
language plpgsql stable security definer set search_path='' as $fn$
begin
 if p_scope not in ('week','month','season') or p_season not between 2020 and 2100
  or p_phase not in ('PRE','REG','POST')
  or (p_scope='week' and (p_week is null or p_week not between 1 and 22))
  or (p_scope='month' and (p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$'))
 then raise exception 'Periodo inválido';end if;
 return query
 with totals as (
 select p.user_id, sum(p.awarded_points)::bigint pts,
   count(*) filter(where p.team_id=g.winner_id)::bigint wins,count(*)::bigint total
 from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
 where g.season=p_season and g.status='final' and g.winner_id is not null
  and (p_scope<>'week' or (g.week=p_week and g.phase=p_phase))
  and (p_scope<>'month' or to_char(g.kickoff at time zone 'America/New_York','YYYY-MM')=p_month)
 group by p.user_id
 ), ranked as (
 select t.*,round(100.0*t.wins/nullif(t.total,0),1) pct,
 dense_rank() over(order by t.pts desc,t.wins desc,(100.0*t.wins/nullif(t.total,0)) desc) pos from totals t
 )
 select r.pos,r.user_id,
 coalesce(nullif(left(a.username,40),''),nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
 r.pts,r.wins,r.total,r.pct
 from ranked r join auth.users u on u.id=r.user_id
 left join public.ae_auth_accounts a on a.user_id=r.user_id
 order by r.pos,r.user_id;
end $fn$;
revoke all on function public.cam_nfl_leaderboard_phase(text,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_leaderboard_phase(text,integer,integer,text,text) to anon,authenticated;

-- Prevent postponed fixtures from reopening after their previous/earlier kickoff.
alter table public.cam_nfl_games add column if not exists pick_lock_at timestamptz;
update public.cam_nfl_games set pick_lock_at=kickoff where pick_lock_at is null;
create or replace function public.cam_nfl_pick_deadline()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if tg_op='INSERT' then
   new.pick_lock_at:=coalesce(new.pick_lock_at,new.kickoff);
 elsif new.kickoff is distinct from old.kickoff then
   new.pick_lock_at:=least(coalesce(old.pick_lock_at,old.kickoff),new.kickoff);
 else new.pick_lock_at:=coalesce(old.pick_lock_at,old.kickoff);
 end if;
 if new.status<>'scheduled' or new.pick_lock_at<=statement_timestamp() then new.picks_open:=false;end if;
 return new;
end $fn$;
drop trigger if exists cam_nfl_pick_deadline_trg on public.cam_nfl_games;
create trigger cam_nfl_pick_deadline_trg before insert or update on public.cam_nfl_games
 for each row execute function public.cam_nfl_pick_deadline();
revoke all on function public.cam_nfl_pick_deadline() from public,anon,authenticated;

create or replace function public.cam_nfl_save_pick(p_game_id text,p_team_id text)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare me uuid:=auth.uid(); g public.cam_nfl_games%rowtype;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 then raise exception 'Inicia sesión'; end if;
 select * into g from public.cam_nfl_games where id=p_game_id for update;
 if not found or g.status<>'scheduled' or not g.picks_open
  or coalesce(g.pick_lock_at,g.kickoff)<=statement_timestamp()
  or g.odds_locked_at is null
  or not exists(select 1 from public.cam_nfl_week_state w
    where w.season=g.season and w.phase=g.phase and w.week=g.week
    and w.status in ('open','in_progress'))
 then raise exception 'Partido bloqueado o jornada incompleta'; end if;
 if p_team_id not in (g.home_id,g.away_id) then raise exception 'Equipo inválido'; end if;
 insert into public.cam_nfl_picks(game_id,user_id,team_id) values(g.id,me,p_team_id)
 on conflict(game_id,user_id) do update set team_id=excluded.team_id,updated_at=now();
 return true;
end $fn$;
revoke all on function public.cam_nfl_save_pick(text,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_save_pick(text,text) to authenticated;
notify pgrst,'reload schema';