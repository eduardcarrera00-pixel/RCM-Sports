-- CAM SPORTS | Phase II: autonomous NFL rounds. Additive upgrade on top of 20261022170000_cam_nfl_quiniela.sql.
-- Initially disabled until real SportsDataIO + Odds credentials are configured and staging validated.
alter table public.cam_nfl_games
  add column if not exists phase text not null default 'REG' check(phase in ('PRE','REG','POST')),
  add column if not exists schedule_provider text,
  add column if not exists external_game_id text;
create unique index if not exists cam_nfl_external_game_unique
 on public.cam_nfl_games(schedule_provider,external_game_id)
 where schedule_provider is not null and external_game_id is not null;
create index if not exists cam_nfl_phase_week_idx on public.cam_nfl_games(season,phase,week,kickoff);

create table if not exists public.cam_nfl_week_state(
 season integer not null check(season between 2020 and 2100),
 phase text not null check(phase in ('PRE','REG','POST')),
 week integer not null check(week between 1 and 22),
 expected_games integer not null default 0 check(expected_games between 0 and 32),
 status text not null default 'pending' check(status in ('pending','ready','open','in_progress','closed','sync_pending')),
 schedule_provider text not null default 'sportsdataio',
 last_success_at timestamptz,
 last_attempt_at timestamptz,
 last_error text,
 opened_at timestamptz,
 closed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(season,phase,week)
);
create table if not exists public.cam_nfl_automation_control(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 provider text not null default 'sportsdataio',
 updated_at timestamptz not null default now()
);
insert into public.cam_nfl_automation_control(singleton,enabled) values(true,false)
 on conflict(singleton) do nothing;
create table if not exists public.cam_nfl_sync_runs(
 id bigint generated always as identity primary key,
 mode text not null check(mode in ('hourly','results')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 ok boolean,
 detail jsonb not null default '{}'::jsonb,
 error_text text
);
create index if not exists cam_nfl_sync_runs_recent on public.cam_nfl_sync_runs(started_at desc);
alter table public.cam_nfl_week_state enable row level security;
alter table public.cam_nfl_automation_control enable row level security;
alter table public.cam_nfl_sync_runs enable row level security;
revoke all on public.cam_nfl_week_state,public.cam_nfl_automation_control,public.cam_nfl_sync_runs from public,anon,authenticated;
grant select on public.cam_nfl_week_state to anon,authenticated;
create policy cam_nfl_week_read on public.cam_nfl_week_state for select to anon,authenticated using (
 status in ('open','in_progress','closed') or (auth.uid() is not null and public.rcm_is_editor())
);
-- Pending rounds cannot leak into the public fixture display.
drop policy if exists cam_nfl_games_read on public.cam_nfl_games;
create policy cam_nfl_games_read on public.cam_nfl_games for select to anon,authenticated using (
 exists(
  select 1 from public.cam_nfl_week_state w
   where w.season=cam_nfl_games.season and w.phase=cam_nfl_games.phase
   and w.week=cam_nfl_games.week and w.status in ('open','in_progress','closed')
 ) or (auth.uid() is not null and public.rcm_is_editor())
);
grant select,insert,update,delete on public.cam_nfl_week_state,public.cam_nfl_automation_control,public.cam_nfl_sync_runs to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Only the service role can freeze provider odds. All points are recomputed in Postgres.
create or replace function public.cam_nfl_freeze_provider_odds(
 p_game_id text,p_home integer,p_away integer,p_source text
) returns boolean language plpgsql security invoker set search_path='' as $fn$
declare g public.cam_nfl_games%rowtype; h numeric; a numeric; combined numeric;
begin
 select * into g from public.cam_nfl_games where id=p_game_id for update;
 if not found or g.status <> 'scheduled' or g.kickoff<=statement_timestamp()
  or g.odds_locked_at is not null or g.picks_open
  or exists(select 1 from public.cam_nfl_picks p where p.game_id=p_game_id)
 then return false; end if;
 h:=public.cam_nfl_american_probability(p_home); a:=public.cam_nfl_american_probability(p_away);
 if h is null or a is null or h+a<=0 or length(trim(coalesce(p_source,'')))<3 then
  raise exception 'Invalid verified odds'; end if;
 combined:=h+a; h:=round(h/combined,6); a:=1-h;
 update public.cam_nfl_games set
  odds_home=p_home,odds_away=p_away,probability_home=h,probability_away=a,
  points_home=greatest(2,least(12,round(2/h)::integer)),
  points_away=greatest(2,least(12,round(2/a)::integer)),
  odds_source=left(p_source,64), odds_locked_at=statement_timestamp(),
  picks_open=false where id=p_game_id;
 insert into public.cam_nfl_audit(game_id,action,detail)
  values(p_game_id,'auto_freeze_odds',jsonb_build_object('provider',p_source,'home',p_home,'away',p_away));
 return true;
end $fn$;
revoke all on function public.cam_nfl_freeze_provider_odds(text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_freeze_provider_odds(text,integer,integer,text) to service_role;

-- Atomic completeness gate; reject missing fixture or moneyline snapshots.
create or replace function public.cam_nfl_publish_complete_week(
 p_season integer,p_phase text,p_week integer,p_expected integer
) returns boolean language plpgsql security invoker set search_path='' as $fn$
declare games_total integer; valid_total integer; state_row public.cam_nfl_week_state%rowtype;
begin
 if p_expected<1 or p_expected>32 then raise exception 'Unknown complete schedule size';end if;
 select * into state_row from public.cam_nfl_week_state
 where season=p_season and phase=p_phase and week=p_week for update;
 if not found then raise exception 'No confirmed schedule snapshot'; end if;
 if state_row.schedule_provider <> 'sportsdataio' or state_row.expected_games <> p_expected
 then raise exception 'Schedule snapshot mismatch'; end if;
 select count(*),count(*) filter(where
  status='scheduled' and odds_locked_at is not null
  and probability_home is not null and probability_away is not null
  and points_home is not null and points_away is not null
  and kickoff>statement_timestamp() and schedule_provider='sportsdataio'
 ) into games_total,valid_total
 from public.cam_nfl_games
 where season=p_season and phase=p_phase and week=p_week;
 if games_total<>p_expected or valid_total<>p_expected then
  update public.cam_nfl_week_state set status=case when status in ('open','in_progress','closed') then status else 'pending' end,
   last_error='Incomplete fixtures or frozen odds',updated_at=now()
  where season=p_season and phase=p_phase and week=p_week;
  return false;
 end if;
 if state_row.status in ('in_progress','closed') then return false; end if;
 update public.cam_nfl_week_state set status='open',opened_at=coalesce(opened_at,now()),
  last_error=null,updated_at=now()
 where season=p_season and phase=p_phase and week=p_week;
 update public.cam_nfl_games set picks_open=true
 where season=p_season and phase=p_phase and week=p_week and opening_mode <> 'closed'
  and status='scheduled' and kickoff>statement_timestamp() and odds_locked_at is not null;
 insert into public.cam_nfl_audit(action,detail)
 values('auto_week_open',jsonb_build_object('season',p_season,'phase',p_phase,'week',p_week,'games',p_expected));
 return true;
end $fn$;
revoke all on function public.cam_nfl_publish_complete_week(integer,text,integer,integer) from public,anon,authenticated;
grant execute on function public.cam_nfl_publish_complete_week(integer,text,integer,integer) to service_role;

-- The server gate protects picks even if a client bypasses the page.
create or replace function public.cam_nfl_save_pick(p_game_id text,p_team_id text)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare me uuid:=auth.uid(); g public.cam_nfl_games%rowtype;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 then raise exception 'Inicia sesión'; end if;
 select * into g from public.cam_nfl_games where id=p_game_id for update;
 if not found or g.status<>'scheduled' or not g.picks_open or g.kickoff<=statement_timestamp()
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

-- Supabase Cron -> Edge Function. Jobs will be installed only after integration checks;
-- the function also refuses all calls while automation_control.enabled=false.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists cam_nfl_private;
revoke all on schema cam_nfl_private from public,anon,authenticated;
create or replace function cam_nfl_private.dispatch(p_mode text)
returns void language plpgsql security definer set search_path='' as $fn$
declare active boolean; endpoint text; token text;
begin
 select enabled into active from public.cam_nfl_automation_control where singleton=true;
 if not coalesce(active,false) then return; end if;
 if p_mode='results' and not exists(
  select 1 from public.cam_nfl_games where status='live'
  or (kickoff between now()-interval '6 hours' and now()+interval '15 minutes'
      and status in ('scheduled','postponed','live'))
 ) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='cam_nfl_edge_url' limit 1;
 select decrypted_secret into token from vault.decrypted_secrets where name='cam_nfl_cron_secret' limit 1;
 if endpoint is null or token is null or length(token)<32
   or endpoint !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/cam-nfl-auto$'
 then return; end if;
 perform net.http_post(
  url:=endpoint,
  headers:=jsonb_build_object('Content-Type','application/json','x-cam-cron',token),
  body:=jsonb_build_object('mode',p_mode),timeout_milliseconds:=25000
 );
end $fn$;
revoke all on function cam_nfl_private.dispatch(text) from public,anon,authenticated;
-- pg_cron will execute as the SQL role that installs the job, not as a web user.
select cron.schedule('cam-nfl-auto-hourly','7 * * * *',
 $job$select cam_nfl_private.dispatch('hourly');$job$);
select cron.schedule('cam-nfl-auto-results','*/10 * * * *',
 $job$select cam_nfl_private.dispatch('results');$job$);
notify pgrst,'reload schema';
