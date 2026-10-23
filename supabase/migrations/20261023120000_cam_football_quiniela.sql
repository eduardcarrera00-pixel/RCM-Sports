-- CAM SPORTS | Quiniela de fútbol: LaLiga, Premier, Liga MX y Champions.
-- Mismo libro de cuentas aislado que la quiniela NFL, pero a tres resultados (1X2).
-- Los partidos solo se abren con probabilidades reales congeladas antes del saque.

create table if not exists public.cam_football_teams (
 id text primary key check (id ~ '^[0-9]{1,12}$'),
 name text not null,
 short_name text not null,
 abbreviation text not null,
 logo text,
 updated_at timestamptz not null default now()
);

create table if not exists public.cam_football_games (
 id text primary key check (id ~ '^[0-9]{6,16}$'),
 competition text not null check (competition in ('laliga','premier','ligamx','champions')),
 season integer not null check (season between 2020 and 2100),
 matchday integer not null check (matchday between 1 and 60),
 home_id text not null references public.cam_football_teams(id),
 away_id text not null references public.cam_football_teams(id),
 kickoff timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','live','final','postponed','cancelled')),
 home_score integer check(home_score >= 0),
 away_score integer check(away_score >= 0),
 outcome text check(outcome in ('home','draw','away')),
 odds_home integer,
 odds_draw integer,
 odds_away integer,
 probability_home numeric(8,6),
 probability_draw numeric(8,6),
 probability_away numeric(8,6),
 points_home integer check(points_home between 2 and 12),
 points_draw integer check(points_draw between 2 and 12),
 points_away integer check(points_away between 2 and 12),
 odds_source text,
 odds_locked_at timestamptz,
 picks_open boolean not null default false,
 opening_mode text not null default 'auto' check(opening_mode in ('auto','open','closed')),
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 check(home_id <> away_id),
 -- O no hay mercado congelado, o está completo y suma uno: nunca a medias.
 check((probability_home is null and probability_draw is null and probability_away is null
        and points_home is null and points_draw is null and points_away is null and odds_locked_at is null)
    or (probability_home > 0 and probability_draw > 0 and probability_away > 0
        and abs(probability_home + probability_draw + probability_away - 1) < 0.00001
        and points_home is not null and points_draw is not null and points_away is not null
        and odds_locked_at is not null))
);
create index if not exists cam_football_games_round_idx
 on public.cam_football_games(competition,season,matchday,kickoff);

create table if not exists public.cam_football_picks (
 game_id text not null references public.cam_football_games(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 pick text not null check(pick in ('home','draw','away')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 awarded_points integer not null default 0 check(awarded_points between 0 and 12),
 settled_at timestamptz,
 primary key(game_id,user_id)
);
create index if not exists cam_football_picks_user_idx on public.cam_football_picks(user_id,game_id);

create table if not exists public.cam_football_audit(
 id bigint generated always as identity primary key,
 game_id text references public.cam_football_games(id),
 action text not null,
 actor_id uuid,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists cam_football_audit_game_idx on public.cam_football_audit(game_id,created_at desc);

alter table public.cam_football_teams enable row level security;
alter table public.cam_football_games enable row level security;
alter table public.cam_football_picks enable row level security;
alter table public.cam_football_audit enable row level security;
revoke all on public.cam_football_teams,public.cam_football_games,public.cam_football_picks,public.cam_football_audit
 from public,anon,authenticated;
grant select on public.cam_football_teams,public.cam_football_games to anon,authenticated;
grant select on public.cam_football_picks to authenticated;
create policy cam_football_teams_read on public.cam_football_teams for select to anon,authenticated using(true);
create policy cam_football_games_read on public.cam_football_games for select to anon,authenticated using(true);
create policy cam_football_picks_own on public.cam_football_picks for select to authenticated using(user_id=(select auth.uid()));
-- Sin políticas de escritura para clientes: todo pasa por RPC con servidor de por medio.

-- ---------------------------------------------------------------- pronósticos
create or replace function public.cam_football_save_pick(p_game_id text,p_pick text)
returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); game public.cam_football_games%rowtype;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
 if p_pick not in ('home','draw','away') then raise exception 'Pronóstico inválido'; end if;
 select * into game from public.cam_football_games where id=p_game_id for update;
 if not found or game.status<>'scheduled' or not game.picks_open or game.kickoff<=statement_timestamp()
    or game.odds_locked_at is null then raise exception 'El partido está bloqueado o no disponible'; end if;
 insert into public.cam_football_picks(game_id,user_id,pick)
 values(game.id,me,p_pick)
 on conflict(game_id,user_id) do update set pick=excluded.pick,updated_at=now();
 return true;
end $$;
revoke all on function public.cam_football_save_pick(text,text) from public,anon,authenticated;
grant execute on function public.cam_football_save_pick(text,text) to authenticated;

-- ------------------------------------------------------------------- mercados
create or replace function public.cam_football_american_probability(p_odds integer)
returns numeric language sql immutable set search_path='' as $$
 select case when p_odds is null or abs(p_odds)<100 then null::numeric
 when p_odds>0 then 100.0/(p_odds+100.0)
 else abs(p_odds)::numeric/(abs(p_odds)+100.0) end;
$$;
revoke all on function public.cam_football_american_probability(integer) from public,anon,authenticated;

create or replace function public.cam_football_admin_odds(
 p_game_id text,p_home integer,p_draw integer,p_away integer,p_source text default 'manual')
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_football_games%rowtype; h numeric; d numeric; a numeric; total numeric;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 select * into g from public.cam_football_games where id=p_game_id for update;
 if not found or g.kickoff <= statement_timestamp() or g.status<>'scheduled'
    or g.odds_locked_at is not null or exists(select 1 from public.cam_football_picks where game_id=p_game_id)
 then raise exception 'Las probabilidades ya están congeladas o el partido ha comenzado'; end if;
 h:=public.cam_football_american_probability(p_home);
 d:=public.cam_football_american_probability(p_draw);
 a:=public.cam_football_american_probability(p_away);
 if h is null or d is null or a is null then raise exception 'Cuotas americanas inválidas'; end if;
 -- Se quita el margen de la casa repartiendo el exceso entre los tres resultados.
 total:=h+d+a; h:=round(h/total,6); d:=round(d/total,6); a:=1-h-d;
 if a<=0 then raise exception 'Cuotas incoherentes'; end if;
 update public.cam_football_games
 set odds_home=p_home,odds_draw=p_draw,odds_away=p_away,
     probability_home=h,probability_draw=d,probability_away=a,
     points_home=greatest(2,least(12,round(2/h)::integer)),
     points_draw=greatest(2,least(12,round(2/d)::integer)),
     points_away=greatest(2,least(12,round(2/a)::integer)),
     odds_source=left(coalesce(nullif(trim(p_source),''),'manual'),64),
     odds_locked_at=now(),picks_open=(opening_mode<>'closed')
 where id=p_game_id;
 insert into public.cam_football_audit(game_id,action,actor_id,detail)
 values(p_game_id,'freeze_odds',auth.uid(),
   jsonb_build_object('home',p_home,'draw',p_draw,'away',p_away,'source',p_source));
 return true;
end $$;
revoke all on function public.cam_football_admin_odds(text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.cam_football_admin_odds(text,integer,integer,integer,text) to authenticated;

create or replace function public.cam_football_admin_open(
 p_competition text,p_season integer,p_matchday integer,p_open boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 update public.cam_football_games set opening_mode=case when p_open then 'open' else 'closed' end,
    picks_open=p_open
 where competition=p_competition and season=p_season and matchday=p_matchday and status='scheduled'
   and kickoff>statement_timestamp() and (not p_open or odds_locked_at is not null);
 get diagnostics changed=row_count;
 insert into public.cam_football_audit(action,actor_id,detail) values
 ('round_open',auth.uid(),jsonb_build_object('competition',p_competition,'season',p_season,
   'matchday',p_matchday,'open',p_open,'games',changed));
 return changed;
end $$;
revoke all on function public.cam_football_admin_open(text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.cam_football_admin_open(text,integer,integer,boolean) to authenticated;

create or replace function public.cam_football_admin_fix_game(
 p_game_id text,p_home text,p_away text,p_kickoff timestamptz,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_football_games%rowtype;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 select * into g from public.cam_football_games where id=p_game_id for update;
 if not found or g.odds_locked_at is not null or g.kickoff<=statement_timestamp() or
 exists(select 1 from public.cam_football_picks where game_id=p_game_id)
 then raise exception 'No es posible modificar partidos publicados'; end if;
 if p_home=p_away or p_kickoff is null or p_kickoff<=statement_timestamp()
    or length(trim(coalesce(p_reason,'')))<8 then
 raise exception 'Corrección inválida o sin justificación'; end if;
 update public.cam_football_games set home_id=p_home,away_id=p_away,kickoff=p_kickoff where id=p_game_id;
 insert into public.cam_football_audit(game_id,action,actor_id,detail) values
 (p_game_id,'fix_schedule',auth.uid(),jsonb_build_object('old_home',g.home_id,'old_away',g.away_id,
   'old_kickoff',g.kickoff,'reason',p_reason));
 return true;
end $$;
revoke all on function public.cam_football_admin_fix_game(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.cam_football_admin_fix_game(text,text,text,timestamptz,text) to authenticated;

-- ---------------------------------------------------------------- liquidación
create or replace function public.cam_football_settlement_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.status,new.home_score,new.away_score,new.outcome)
    is not distinct from (old.status,old.home_score,old.away_score,old.outcome) then return new; end if;
 update public.cam_football_picks p
 set awarded_points=case when new.status='final' and new.outcome is not null and p.pick=new.outcome
        then case new.outcome when 'home' then new.points_home
                              when 'draw' then new.points_draw
                              else new.points_away end
        else 0 end,
     settled_at=case when new.status in ('final','cancelled') then now() else null end
 where p.game_id=new.id;
 insert into public.cam_football_audit(game_id,action,actor_id,detail)
 values(new.id,'result_changed',auth.uid(),jsonb_build_object(
 'old_status',old.status,'new_status',new.status,'old_outcome',old.outcome,'new_outcome',new.outcome,
 'old_home_score',old.home_score,'new_home_score',new.home_score,
 'old_away_score',old.away_score,'new_away_score',new.away_score));
 return new;
end $$;
drop trigger if exists cam_football_settle on public.cam_football_games;
create trigger cam_football_settle after update of status,home_score,away_score,outcome
on public.cam_football_games for each row execute function public.cam_football_settlement_trigger();
revoke all on function public.cam_football_settlement_trigger() from public,anon,authenticated;

create or replace function public.cam_football_admin_result(
 p_game_id text,p_status text,p_home integer,p_away integer,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.cam_football_games%rowtype; result text;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 select * into g from public.cam_football_games where id=p_game_id for update;
 if not found or g.kickoff>statement_timestamp() or p_status not in ('final','cancelled')
 or length(trim(coalesce(p_reason,'')))<8 then raise exception 'Resultado o justificación inválida'; end if;
 if p_status='final' then
 if p_home is null or p_away is null or p_home<0 or p_away<0 then raise exception 'Marcador inválido'; end if;
 result:=case when p_home>p_away then 'home' when p_home<p_away then 'away' else 'draw' end;
 else p_home:=null; p_away:=null; end if;
 update public.cam_football_games set status=p_status,home_score=p_home,away_score=p_away,
 outcome=result,picks_open=false where id=p_game_id;
 insert into public.cam_football_audit(game_id,action,actor_id,detail)
 values(p_game_id,'manual_result',auth.uid(),jsonb_build_object('reason',p_reason,'status',p_status,
   'home',p_home,'away',p_away));
 return true;
end $$;
revoke all on function public.cam_football_admin_result(text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.cam_football_admin_result(text,text,integer,integer,text) to authenticated;

-- -------------------------------------------------------------- clasificación
create or replace function public.cam_football_leaderboard(
 p_scope text,p_season integer,p_competition text default null,
 p_matchday integer default null,p_month text default null)
returns table(rank_position bigint,user_id uuid,username text,points bigint,hits bigint,resolved bigint,accuracy numeric)
language plpgsql stable security definer set search_path='' as $$
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
end $$;
revoke all on function public.cam_football_leaderboard(text,integer,text,integer,text) from public,anon,authenticated;
grant execute on function public.cam_football_leaderboard(text,integer,text,integer,text) to anon,authenticated;

-- Los pronósticos ajenos solo se publican cuando el partido ya está liquidado.
create or replace function public.cam_football_public_pick_breakdown(
 p_user_id uuid,p_season integer,p_competition text default null,p_matchday integer default null)
returns table(game_id text,pick text,awarded_points integer)
language sql stable security definer set search_path='' as $$
 select p.game_id,p.pick,p.awarded_points
 from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
 where p.user_id=p_user_id and g.season=p_season and g.status='final' and g.outcome is not null
 and (p_competition is null or g.competition=p_competition)
 and (p_matchday is null or g.matchday=p_matchday)
 order by g.kickoff desc limit 200;
$$;
revoke all on function public.cam_football_public_pick_breakdown(uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.cam_football_public_pick_breakdown(uuid,integer,text,integer) to anon,authenticated;

create or replace function public.cam_football_profile_summary(p_user_id uuid,p_season integer)
returns table(points bigint,hits bigint,resolved bigint,accuracy numeric,rank_position bigint,
 last_competition text,last_matchday integer,last_points bigint)
language sql stable security definer set search_path='' as $$
 with r as (select * from public.cam_football_leaderboard('season',p_season,null,null,null) where user_id=p_user_id),
 last as (select g.competition, g.matchday, sum(p.awarded_points)::bigint as pts
 from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
 where p.user_id=p_user_id and g.season=p_season and g.status='final' and g.outcome is not null
 group by g.competition,g.matchday order by max(g.kickoff) desc limit 1)
 select coalesce(r.points,0),coalesce(r.hits,0),coalesce(r.resolved,0),
 coalesce(r.accuracy,0),r.rank_position,last.competition,last.matchday,coalesce(last.pts,0)
 from (select 1) singleton left join r on true left join last on true;
$$;
revoke all on function public.cam_football_profile_summary(uuid,integer) from public,anon,authenticated;
grant execute on function public.cam_football_profile_summary(uuid,integer) to anon,authenticated;

notify pgrst,'reload schema';
