-- CAM SPORTS: monthly leagues. Only the scheduler writes sporting achievements.
-- Public RPCs read aggregate snapshots and run with the caller's privileges.
create schema if not exists cam_competitive;
revoke all on schema cam_competitive from public, anon, authenticated;

create table public.cam_league_competitions (
  id text primary key check (id in ('picks','nfl','football')),
  label text not null,
  starts_on date not null default date_trunc('month',now() at time zone 'America/Toronto')::date,
  minimum integer not null check (minimum > 0)
);
insert into public.cam_league_competitions(id,label,minimum) values
 ('picks','Picks',10),('nfl','Quiniela NFL',1),('football','Quiniela Fútbol',1);

create table public.cam_league_seasons (
  competition text references public.cam_league_competitions(id),
  season_month date not null check (extract(day from season_month)=1),
  available integer not null,
  closed_at timestamptz not null default now(),
  primary key (competition,season_month)
);
create table public.cam_league_members (
  user_id uuid references auth.users(id) on delete cascade,
  competition text references public.cam_league_competitions(id),
  rank_level integer not null default 0 check (rank_level between 0 and 6),
  best_rank integer not null default 0 check (best_rank between 0 and 6),
  inactive_months integer not null default 0,
  elite_streak integer not null default 0,
  last_month date not null,
  primary key (user_id,competition)
);
create index cam_league_members_competition on public.cam_league_members(competition);
create table public.cam_league_standings (
  competition text references public.cam_league_competitions(id),
  season_month date not null,
  user_id uuid references auth.users(id) on delete cascade,
  username text not null,
  points numeric not null,
  correct integer not null,
  resolved integer not null,
  required integer not null,
  available integer not null,
  eligible boolean not null,
  position integer,
  participants integer not null,
  rank_before integer not null check (rank_before between 0 and 6),
  rank_after integer not null check (rank_after between 0 and 6),
  zone text not null,
  next_inactive integer not null,
  next_streak integer not null,
  updated_at timestamptz not null default now(),
  primary key (competition,season_month,user_id)
);
create index cam_league_standings_user_month on public.cam_league_standings(user_id,season_month desc);
create table public.cam_league_history (
  competition text references public.cam_league_competitions(id),
  season_month date not null,
  user_id uuid references auth.users(id) on delete cascade,
  points numeric not null,
  correct integer not null,
  resolved integer not null,
  eligible boolean not null,
  position integer,
  participants integer not null,
  rank_before integer not null,
  rank_after integer not null,
  zone text not null,
  awarded_at timestamptz not null default now(),
  primary key (competition,season_month,user_id)
);
create index cam_league_history_user_month on public.cam_league_history(user_id,season_month desc);

-- All exposed records are deliberately public sporting aggregates. Clients
-- cannot insert or update ranks, final standings or awards.
do $policies$
declare t text;
begin
 foreach t in array array['cam_league_competitions','cam_league_seasons','cam_league_members','cam_league_standings','cam_league_history'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('grant select on public.%I to anon, authenticated',t);
   execute format('create policy public_sporting_results on public.%I for select to anon, authenticated using (true)',t);
 end loop;
end $policies$;

-- One pure rule function shared by previews and the final monthly close.
create function public.cam_league_outcome(
 p_rank integer,p_position integer,p_total integer,p_eligible boolean,
 p_inactive integer,p_streak integer,p_available integer
) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare target integer:=p_rank; inactive integer:=p_inactive; streak integer:=p_streak; zone text:='permanencia';
begin
 if p_rank not between 0 and 6 or p_total<0 or p_inactive<0 or p_streak<0 then
   raise exception 'Parámetros de liga inválidos';
 end if;
 if p_available=0 then zone:='pausa';
 elsif not p_eligible then
   inactive:=p_inactive+1; streak:=0;
   if inactive%2=0 then target:=greatest(0,p_rank-1); end if;
   zone:=case when target<p_rank then 'inactividad' else 'pausa' end;
 else
   inactive:=0;
   streak:=case when p_rank>=5 and p_position<=greatest(1,ceil(p_total*.05)) then p_streak+1 else 0 end;
   if p_rank=6 then
     target:=case when p_position<=greatest(1,ceil(p_total*.10)) then 6 else 5 end;
   elsif p_rank=5 and streak>=2 then target:=6;
   elsif p_position<=greatest(1,ceil(p_total*.20)) then target:=least(5,p_rank+1);
   elsif p_position>p_total-floor(p_total*.20) then target:=greatest(0,p_rank-1);
   end if;
   zone:=case when target>p_rank then 'ascenso' when target<p_rank then 'descenso'
     when p_rank=5 and streak=1 then 'leyenda' else 'permanencia' end;
 end if;
 return jsonb_build_object('rank',target,'zone',zone,'inactive',inactive,'streak',streak);
end $$;
revoke all on function public.cam_league_outcome(integer,integer,integer,boolean,integer,integer,integer) from public;
grant execute on function public.cam_league_outcome(integer,integer,integer,boolean,integer,integer,integer) to anon,authenticated,service_role;

create function cam_competitive.refresh_month(p_month date) returns void
language plpgsql security invoker set search_path='' as $$
declare c record; n integer; needed integer; start_at timestamptz; end_at timestamptz;
begin
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Mes inválido'; end if;
 start_at:=p_month::timestamp at time zone 'America/Toronto';
 end_at:=(p_month+interval '1 month')::timestamp at time zone 'America/Toronto';
 for c in select * from public.cam_league_competitions where starts_on<=p_month loop
   if exists(select 1 from public.cam_league_seasons s where s.competition=c.id and s.season_month=p_month) then continue; end if;
   if c.id='picks' then
     select count(*) into n from public.ae_community_picks p where not p.hidden and p.moderation_status='approved'
       and p.outcome in ('won','lost') and p.settled_at>=start_at and p.settled_at<end_at;
     needed:=c.minimum;
   elsif c.id='nfl' then
     select count(*) into n from public.cam_nfl_games g where g.status='final' and g.winner_id is not null and g.kickoff>=start_at and g.kickoff<end_at;
     needed:=greatest(c.minimum,ceil(n*.5));
   else
     select count(*) into n from public.cam_football_games g where g.status='final' and g.outcome is not null and g.kickoff>=start_at and g.kickoff<end_at;
     needed:=greatest(c.minimum,ceil(n*.5));
   end if;
   delete from public.cam_league_standings where competition=c.id and season_month=p_month;
   insert into public.cam_league_standings(competition,season_month,user_id,username,points,correct,resolved,required,available,eligible,position,participants,rank_before,rank_after,zone,next_inactive,next_streak)
   with events as (
     select p.user_id,coalesce(p.result_points,0)::numeric pts,(p.outcome='won')::integer hit,p.settled_at happened
     from public.ae_community_picks p where c.id='picks' and not p.hidden and p.moderation_status='approved'
       and p.outcome in ('won','lost') and p.settled_at>=start_at and p.settled_at<end_at
     union all
     select p.user_id,p.awarded_points::numeric,(p.team_id=g.winner_id)::integer,g.kickoff
     from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
     where c.id='nfl' and g.status='final' and g.winner_id is not null and p.awarded_points is not null and g.kickoff>=start_at and g.kickoff<end_at
     union all
     select p.user_id,p.awarded_points::numeric,(p.pick=g.outcome)::integer,g.kickoff
     from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
     where c.id='football' and g.status='final' and g.outcome is not null and p.awarded_points is not null and g.kickoff>=start_at and g.kickoff<end_at
   ), totals as (
     select user_id,sum(pts) points,sum(hit)::integer correct,count(*)::integer resolved,min(happened) first_result from events group by user_id
   ), ranked as (
     select t.*,row_number() over(order by points desc,correct desc,1.0*correct/resolved desc,first_result,user_id)::integer pos,
       count(*) over()::integer total from totals t where resolved>=needed
   ), people as (
     select user_id from totals union select user_id from public.cam_league_members where competition=c.id
   ), scored as (
     select p.user_id,coalesce(a.username,nullif(u.raw_user_meta_data->>'username',''),'Aficionado') username,
       coalesce(t.points,0) points,coalesce(t.correct,0) correct,coalesce(t.resolved,0) resolved,
       r.pos,r.total,coalesce(m.rank_level,0) current_rank,
       public.cam_league_outcome(coalesce(m.rank_level,0),r.pos,coalesce(r.total,(select count(*)::integer from ranked)),r.pos is not null,
         coalesce(m.inactive_months,0),coalesce(m.elite_streak,0),n) decision
     from people p join auth.users u on u.id=p.user_id
     left join public.ae_auth_accounts a on a.user_id=p.user_id
     left join totals t on t.user_id=p.user_id left join ranked r on r.user_id=p.user_id
     left join public.cam_league_members m on m.user_id=p.user_id and m.competition=c.id
   )
   select c.id,p_month,s.user_id,left(s.username,40),s.points,s.correct,s.resolved,needed,n,s.pos is not null,s.pos,
     coalesce(s.total,(select count(*)::integer from ranked)),s.current_rank,(s.decision->>'rank')::integer,s.decision->>'zone',
     (s.decision->>'inactive')::integer,(s.decision->>'streak')::integer from scored s;
 end loop;
end $$;

create function cam_competitive.close_month(p_month date) returns void
language plpgsql security invoker set search_path='' as $$
declare c record;
begin
 if now()<((p_month+interval '1 month 12 hours')::timestamp at time zone 'America/Toronto') then raise exception 'El mes sigue abierto'; end if;
 perform pg_advisory_xact_lock(hashtext('cam-monthly-leagues'));
 perform cam_competitive.refresh_month(p_month);
 for c in select * from public.cam_league_competitions where starts_on<=p_month loop
   if exists(select 1 from public.cam_league_seasons s where s.competition=c.id and s.season_month=p_month) then continue; end if;
   insert into public.cam_league_history(competition,season_month,user_id,points,correct,resolved,eligible,position,participants,rank_before,rank_after,zone)
     select competition,season_month,user_id,points,correct,resolved,eligible,position,participants,rank_before,rank_after,zone
     from public.cam_league_standings where competition=c.id and season_month=p_month;
   insert into public.cam_league_members(user_id,competition,rank_level,best_rank,inactive_months,elite_streak,last_month)
     select user_id,competition,rank_after,greatest(rank_before,rank_after),next_inactive,next_streak,p_month
     from public.cam_league_standings where competition=c.id and season_month=p_month
     on conflict(user_id,competition) do update set rank_level=excluded.rank_level,
       best_rank=greatest(cam_league_members.best_rank,excluded.best_rank),inactive_months=excluded.inactive_months,
       elite_streak=excluded.elite_streak,last_month=excluded.last_month;
   insert into public.cam_league_seasons(competition,season_month,available)
     select c.id,p_month,coalesce(max(available),0) from public.cam_league_standings where competition=c.id and season_month=p_month;
 end loop;
end $$;

create function cam_competitive.tick() returns void language plpgsql security invoker set search_path='' as $$
declare m date; current_month date:=date_trunc('month',now() at time zone 'America/Toronto')::date;
begin
 if not pg_try_advisory_xact_lock(hashtext('cam-monthly-leagues')) then return; end if;
 for m in select generate_series((select min(starts_on) from public.cam_league_competitions),current_month-interval '1 month',interval '1 month')::date loop
   if now()>=((m+interval '1 month 12 hours')::timestamp at time zone 'America/Toronto') then perform cam_competitive.close_month(m); end if;
 end loop;
 perform cam_competitive.refresh_month(current_month);
end $$;
revoke all on all functions in schema cam_competitive from public,anon,authenticated;

create function public.cam_league_profile(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('month',date_trunc('month',now() at time zone 'America/Toronto')::date,
 'ranks',(select jsonb_agg(jsonb_build_object('competition',c.id,'label',c.label,'starts_on',c.starts_on,
   'rank',coalesce(m.rank_level,0),'best_rank',coalesce(m.best_rank,0),'inactive_months',coalesce(m.inactive_months,0),
   'last_month',m.last_month,'current',to_jsonb(s)) order by c.id)
   from public.cam_league_competitions c left join public.cam_league_members m on m.competition=c.id and m.user_id=p_user
   left join public.cam_league_standings s on s.competition=c.id and s.user_id=p_user
     and s.season_month=date_trunc('month',now() at time zone 'America/Toronto')::date),
 'awards',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('active',h.season_month=(date_trunc('month',now() at time zone 'America/Toronto')-interval '1 month')::date) order by h.season_month desc,h.position)
   from public.cam_league_history h where h.user_id=p_user and h.eligible and h.position<=10),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.season_month desc,h.competition)
   from public.cam_league_history h where h.user_id=p_user),'[]'::jsonb));
$$;
revoke all on function public.cam_league_profile(uuid) from public;
grant execute on function public.cam_league_profile(uuid) to anon,authenticated,service_role;

create function public.cam_league_board(p_competition text,p_month date default date_trunc('month',now() at time zone 'America/Toronto')::date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_competition not in ('picks','nfl','football') or extract(day from p_month)<>1 then raise exception 'Liga inválida'; end if;
 return jsonb_build_object('competition',p_competition,'month',p_month,
   'closed',exists(select 1 from public.cam_league_seasons where competition=p_competition and season_month=p_month),
   'rows',coalesce((select jsonb_agg(to_jsonb(s) order by s.position nulls last,s.resolved desc,s.user_id) from
    (select * from public.cam_league_standings where competition=p_competition and season_month=p_month
     order by position nulls last,resolved desc,user_id limit 100)s),'[]'::jsonb));
end $$;
revoke all on function public.cam_league_board(text,date) from public;
grant execute on function public.cam_league_board(text,date) to anon,authenticated,service_role;

create function public.cam_league_identities(p_users uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(x.user_id,jsonb_build_object('ranks',
   coalesce((select jsonb_agg(to_jsonb(m)) from public.cam_league_members m where m.user_id=x.user_id),'[]'::jsonb),
   'awards',coalesce((select jsonb_agg(to_jsonb(h)) from public.cam_league_history h where h.user_id=x.user_id and h.eligible and h.position<=10
    and h.season_month=(date_trunc('month',now() at time zone 'America/Toronto')-interval '1 month')::date),'[]'::jsonb))),'{}'::jsonb)
 from (select distinct unnest(p_users[1:50]) user_id)x;
$$;
revoke all on function public.cam_league_identities(uuid[]) from public;
grant execute on function public.cam_league_identities(uuid[]) to anon,authenticated,service_role;

-- Scheduler only: no public function can award or modify a rank.
-- BEGIN HOSTED SCHEDULER
select cron.schedule('cam-monthly-leagues','9,24,39,54 * * * *','select cam_competitive.tick()');
select cam_competitive.tick();
-- END HOSTED SCHEDULER
