-- CAM SPORTS | NFL quiniela: isolated prediction ledger and audited settlement.
-- Published only after provider games + genuine pre-game odds are available.
create table if not exists public.cam_nfl_games (
 id text primary key check (id ~ '^[0-9]{6,16}$'),
 season integer not null check (season between 2020 and 2100),
 week integer not null check (week between 1 and 22),
 home_id text not null references public.nfl_teams(id),
 away_id text not null references public.nfl_teams(id),
 kickoff timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','live','final','postponed','cancelled','tie')),
 home_score integer check(home_score >= 0),
 away_score integer check(away_score >= 0),
 winner_id text references public.nfl_teams(id),
 odds_home integer,
 odds_away integer,
 probability_home numeric(8,6),
 probability_away numeric(8,6),
 points_home integer check(points_home between 2 and 12),
 points_away integer check(points_away between 2 and 12),
 odds_source text,
 odds_locked_at timestamptz,
 picks_open boolean not null default false,
 opening_mode text not null default 'auto' check(opening_mode in ('auto','open','closed')),
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 check(home_id <> away_id),
 check(winner_id is null or winner_id in (home_id,away_id)),
 check((probability_home is null and probability_away is null and points_home is null and points_away is null and odds_locked_at is null)
    or (probability_home > 0 and probability_away > 0 and abs(probability_home + probability_away - 1) < 0.00001
        and points_home is not null and points_away is not null and odds_locked_at is not null))
);
create index if not exists cam_nfl_games_week_idx on public.cam_nfl_games(season,week,kickoff);
create table if not exists public.cam_nfl_picks (
 game_id text not null references public.cam_nfl_games(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 team_id text not null references public.nfl_teams(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 awarded_points integer not null default 0 check(awarded_points between 0 and 12),
 settled_at timestamptz,
 primary key(game_id,user_id)
);
create index if not exists cam_nfl_picks_user_idx on public.cam_nfl_picks(user_id,game_id);
create table if not exists public.cam_nfl_audit(
 id bigint generated always as identity primary key,
 game_id text references public.cam_nfl_games(id),
 action text not null,
 actor_id uuid,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists cam_nfl_audit_game_idx on public.cam_nfl_audit(game_id,created_at desc);
alter table public.cam_nfl_games enable row level security;
alter table public.cam_nfl_picks enable row level security;
alter table public.cam_nfl_audit enable row level security;
revoke all on public.cam_nfl_games,public.cam_nfl_picks,public.cam_nfl_audit from public,anon,authenticated;
grant select on public.cam_nfl_games to anon,authenticated;
grant select on public.cam_nfl_picks to authenticated;
create policy cam_nfl_games_read on public.cam_nfl_games for select to anon,authenticated using(true);
create policy cam_nfl_picks_own on public.cam_nfl_picks for select to authenticated using(user_id=(select auth.uid()));
-- Deliberately no client INSERT/UPDATE/DELETE policies. All writes are server-controlled.

create or replace function public.cam_nfl_save_pick(p_game_id text,p_team_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); game public.cam_nfl_games%rowtype;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
 select * into game from public.cam_nfl_games where id=p_game_id for update;
 if not found or game.status<>'scheduled' or not game.picks_open or game.kickoff<=statement_timestamp()
    or game.odds_locked_at is null then raise exception 'El partido está bloqueado o no disponible'; end if;
 if p_team_id not in(game.home_id,game.away_id) then raise exception 'Equipo inválido'; end if;
 insert into public.cam_nfl_picks(game_id,user_id,team_id)
 values(game.id,me,p_team_id)
 on conflict(game_id,user_id) do update set team_id=excluded.team_id,updated_at=now();
 return true;
end $$;
revoke all on function public.cam_nfl_save_pick(text,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_save_pick(text,text) to authenticated;

create or replace function public.cam_nfl_american_probability(p_odds integer)
returns numeric language sql immutable set search_path='' as $$
 select case when p_odds is null or abs(p_odds)<100 then null::numeric
 when p_odds>0 then 100.0/(p_odds+100.0)
 else abs(p_odds)::numeric/(abs(p_odds)+100.0) end;
$$;
revoke all on function public.cam_nfl_american_probability(integer) from public,anon,authenticated;

create or replace function public.cam_nfl_admin_odds(p_game_id text,p_home integer,p_away integer,p_source text default 'manual')
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_nfl_games%rowtype; h numeric; a numeric; total numeric;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 select * into g from public.cam_nfl_games where id=p_game_id for update;
 if not found or g.kickoff <= statement_timestamp() or g.status<>'scheduled'
    or g.odds_locked_at is not null or exists(select 1 from public.cam_nfl_picks where game_id=p_game_id)
 then raise exception 'Las probabilidades ya están congeladas o el partido ha comenzado'; end if;
 h:=public.cam_nfl_american_probability(p_home);
 a:=public.cam_nfl_american_probability(p_away);
 if h is null or a is null then raise exception 'Cuotas americanas inválidas'; end if;
 total:=h+a; h:=round(h/total,6); a:=1-h;
 update public.cam_nfl_games
 set odds_home=p_home,odds_away=p_away,probability_home=h,probability_away=a,
     points_home=greatest(2,least(12,round(2/h)::integer)),
     points_away=greatest(2,least(12,round(2/a)::integer)),
     odds_source=left(coalesce(nullif(trim(p_source),''),'manual'),64),
     odds_locked_at=now(),picks_open=(opening_mode<>'closed')
 where id=p_game_id;
 insert into public.cam_nfl_audit(game_id,action,actor_id,detail)
 values(p_game_id,'freeze_odds',auth.uid(),jsonb_build_object('home',p_home,'away',p_away,'source',p_source));
 return true;
end $$;
revoke all on function public.cam_nfl_admin_odds(text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_admin_odds(text,integer,integer,text) to authenticated;

create or replace function public.cam_nfl_admin_open(p_season integer,p_week integer,p_open boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 update public.cam_nfl_games set opening_mode=case when p_open then 'open' else 'closed' end,
    picks_open=p_open
 where season=p_season and week=p_week and status='scheduled'
   and kickoff>statement_timestamp() and (not p_open or odds_locked_at is not null);
 get diagnostics changed=row_count;
 insert into public.cam_nfl_audit(action,actor_id,detail) values
 ('week_open',auth.uid(),jsonb_build_object('season',p_season,'week',p_week,'open',p_open,'games',changed));
 return changed;
end $$;
revoke all on function public.cam_nfl_admin_open(integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.cam_nfl_admin_open(integer,integer,boolean) to authenticated;

create or replace function public.cam_nfl_admin_fix_game(p_game_id text,p_home text,p_away text,p_kickoff timestamptz,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_nfl_games%rowtype;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 select * into g from public.cam_nfl_games where id=p_game_id for update;
 if not found or g.odds_locked_at is not null or g.kickoff<=statement_timestamp() or
 exists(select 1 from public.cam_nfl_picks where game_id=p_game_id)
 then raise exception 'No es posible modificar partidos publicados'; end if;
 if p_home=p_away or p_kickoff is null or p_kickoff<=statement_timestamp() or length(trim(coalesce(p_reason,'')))<8 then
 raise exception 'Corrección inválida o sin justificación'; end if;
 update public.cam_nfl_games set home_id=p_home,away_id=p_away,kickoff=p_kickoff where id=p_game_id;
 insert into public.cam_nfl_audit(game_id,action,actor_id,detail) values
 (p_game_id,'fix_schedule',auth.uid(),jsonb_build_object('old_home',g.home_id,'old_away',g.away_id,'old_kickoff',g.kickoff,'reason',p_reason));
 return true;
end $$;
revoke all on function public.cam_nfl_admin_fix_game(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_admin_fix_game(text,text,text,timestamptz,text) to authenticated;

create or replace function public.cam_nfl_settlement_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.status,new.home_score,new.away_score,new.winner_id)
    is not distinct from (old.status,old.home_score,old.away_score,old.winner_id) then return new; end if;
 update public.cam_nfl_picks p
 set awarded_points=case when new.status='final' and new.winner_id is not null and p.team_id=new.winner_id
        then case when p.team_id=new.home_id then new.points_home else new.points_away end else 0 end,
     settled_at=case when new.status in ('final','tie','cancelled') then now() else null end
 where p.game_id=new.id;
 insert into public.cam_nfl_audit(game_id,action,actor_id,detail)
 values(new.id,'result_changed',auth.uid(),jsonb_build_object(
 'old_status',old.status,'new_status',new.status,'old_winner',old.winner_id,'new_winner',new.winner_id,
 'old_home_score',old.home_score,'new_home_score',new.home_score,'old_away_score',old.away_score,'new_away_score',new.away_score));
 return new;
end $$;
create trigger cam_nfl_settle on public.cam_nfl_games after update of status,home_score,away_score,winner_id
for each row execute function public.cam_nfl_settlement_trigger();
revoke all on function public.cam_nfl_settlement_trigger() from public,anon,authenticated;

create or replace function public.cam_nfl_admin_result(p_game_id text,p_status text,p_home integer,p_away integer,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_nfl_games%rowtype; winner text;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 select * into g from public.cam_nfl_games where id=p_game_id for update;
 if not found or g.kickoff>statement_timestamp() or p_status not in ('final','tie','cancelled')
 or length(trim(coalesce(p_reason,'')))<8 then raise exception 'Resultado o justificación inválida'; end if;
 if p_status='final' then
 if p_home is null or p_away is null or p_home<0 or p_away<0 or p_home=p_away then raise exception 'Marcador inválido'; end if;
 winner:=case when p_home>p_away then g.home_id else g.away_id end;
 elsif p_status='tie' then
 if p_home is null or p_away is null or p_home<0 or p_home<>p_away then raise exception 'Empate inválido'; end if;
 else p_home:=null; p_away:=null; end if;
 update public.cam_nfl_games set status=p_status,home_score=p_home,away_score=p_away,
 winner_id=winner,picks_open=false where id=p_game_id;
 insert into public.cam_nfl_audit(game_id,action,actor_id,detail)
 values(p_game_id,'manual_result',auth.uid(),jsonb_build_object('reason',p_reason,'status',p_status,'home',p_home,'away',p_away));
 return true;
end $$;
revoke all on function public.cam_nfl_admin_result(text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_admin_result(text,text,integer,integer,text) to authenticated;

create or replace function public.cam_nfl_leaderboard(p_scope text,p_season integer,p_week integer default null,p_month text default null)
returns table(position bigint,user_id uuid,username text,points bigint,hits bigint,resolved bigint,accuracy numeric)
language plpgsql stable security definer set search_path='' as $$
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
end $$;
revoke all on function public.cam_nfl_leaderboard(text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.cam_nfl_leaderboard(text,integer,integer,text) to anon,authenticated;

create or replace function public.cam_nfl_profile_summary(p_user_id uuid,p_season integer)
returns table(points bigint,hits bigint,resolved bigint,accuracy numeric,position bigint,last_week integer,last_week_points bigint)
language sql stable security definer set search_path='' as $$
 with r as (select * from public.cam_nfl_leaderboard('season',p_season,null,null) where user_id=p_user_id),
 last as (select g.week, sum(p.awarded_points)::bigint as pts
 from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
 where p.user_id=p_user_id and g.season=p_season and g.status='final' and g.winner_id is not null
 group by g.week order by g.week desc limit 1)
 select coalesce(r.points,0),coalesce(r.hits,0),coalesce(r.resolved,0),
 coalesce(r.accuracy,0),r.position,last.week,coalesce(last.pts,0) from (select 1) singleton
 left join r on true left join last on true;
$$;
revoke all on function public.cam_nfl_profile_summary(uuid,integer) from public,anon,authenticated;
grant execute on function public.cam_nfl_profile_summary(uuid,integer) to anon,authenticated;
notify pgrst,'reload schema';
