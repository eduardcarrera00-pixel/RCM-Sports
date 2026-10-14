-- Aditiva; ejecutar 10 y respaldo antes. No altera tablas históricas.
begin;
do $$ begin if to_regprocedure('public.rcm_is_editor()') is null then raise exception 'Falta comunidad';end if;end $$;
create table if not exists public.ae_competitions(id text primary key,provider_league text unique not null,period text not null,market text not null);
insert into public.ae_competitions values('NFL','NFL','game','ml'),('UCL','UEFA_CHAMPIONS_LEAGUE','reg','ml3way') on conflict do nothing;
create table if not exists public.ae_seasons(id text primary key,starts_at timestamptz not null,ends_at timestamptz not null,provider text not null default 'sportsgameodds' check(provider='sportsgameodds'),bookmaker text not null default 'draftkings' check(bookmaker='draftkings'),rules text not null default 'ae-v1',check(ends_at>starts_at));
create table if not exists public.ae_weeks(id uuid primary key default gen_random_uuid(),season text not null references public.ae_seasons,starts_at timestamptz unique not null,ends_at timestamptz not null,max_picks integer not null default 5 check(max_picks between 1 and 20),check(ends_at=starts_at+interval '7 days'));
create table if not exists public.ae_events(id text primary key,competition text not null references public.ae_competitions,home_id text not null,away_id text not null,home text not null,away text not null,starts_at timestamptz not null,original_start timestamptz not null,status text not null default 'OPEN' check(status in('OPEN','CLOSED','UNDER_REVIEW','FINAL','CANCELLED')),verified_at timestamptz not null,revision text not null,check(home_id<>away_id));
create table if not exists public.ae_offers(id uuid primary key default gen_random_uuid(),event_id text not null references public.ae_events,week_id uuid not null references public.ae_weeks,selection text not null check(selection in('home','away','draw')),odd_id text not null,period text not null,market text not null,line numeric,american integer not null check(american>=100 or american<=-100),bookmaker text not null check(bookmaker='draftkings'),provider_updated_at timestamptz not null,fetched_at timestamptz not null default clock_timestamp(),closes_at timestamptz not null,available boolean not null,verified_at timestamptz not null,version text not null,unique(event_id,selection));
create table if not exists public.ae_picks(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,offer_id uuid not null references public.ae_offers,event_id text not null references public.ae_events,week_id uuid not null references public.ae_weeks,request_id uuid not null,accepted_at timestamptz not null default clock_timestamp(),unique(user_id,event_id),unique(user_id,request_id));
create table if not exists public.ae_results(id uuid primary key default gen_random_uuid(),event_id text not null references public.ae_events,version text not null,period text not null,home_score numeric,away_score numeric,state text not null check(state in('FINAL','VOID','CANCELLED','UNDER_REVIEW')),evidence jsonb not null,created_at timestamptz not null default clock_timestamp(),unique(event_id,version));
create table if not exists public.ae_settlements(id uuid primary key default gen_random_uuid(),pick_id uuid not null references public.ae_picks,result_id uuid not null references public.ae_results,state text not null check(state in('WIN','LOSS','VOID','PUSH','CANCELLED','UNDER_REVIEW')),points numeric(14,2) not null,created_at timestamptz not null default clock_timestamp(),unique(pick_id,result_id));
create table if not exists public.ae_ledger(id uuid primary key default gen_random_uuid(),pick_id uuid not null references public.ae_picks,settlement_id uuid not null unique references public.ae_settlements,delta numeric(14,2) not null,created_at timestamptz not null default clock_timestamp());
create table if not exists public.ae_spotlights(id integer primary key check(id=1),offer_ids uuid[] not null check(cardinality(offer_ids)=2),version integer not null default 1);
create table if not exists public.ae_highlights(pick_id uuid primary key references public.ae_picks,position integer unique not null check(position between 1 and 5),title text not null,description text not null default '',article_id uuid references public.articles on delete set null);
create table if not exists public.ae_audit(id uuid primary key default gen_random_uuid(),actor uuid references auth.users,action text not null,reason text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default clock_timestamp());
create table if not exists public.ae_sync_log(id uuid primary key default gen_random_uuid(),status text not null,objects integer not null default 0,detail text not null,created_at timestamptz not null default clock_timestamp());
create table if not exists public.ae_sync_lock(id integer primary key check(id=1),until_at timestamptz not null);
alter table public.ae_events add column if not exists admin_hold boolean not null default false;
create table if not exists public.ae_recheck_queue(event_id text primary key references public.ae_events,requested_at timestamptz not null default clock_timestamp());
create index if not exists ae_pick_week_user on public.ae_picks(week_id,user_id);
create index if not exists ae_pick_event on public.ae_picks(event_id);
create index if not exists ae_event_time on public.ae_events(starts_at);
create index if not exists ae_settlement_latest on public.ae_settlements(pick_id,created_at desc,id desc);
-- No browser writes to tables; no raw provider payloads exposed publicly.
do $$ declare t text; begin
 foreach t in array array['ae_competitions','ae_seasons','ae_weeks','ae_events','ae_offers','ae_picks','ae_results','ae_settlements','ae_ledger','ae_spotlights','ae_highlights','ae_audit','ae_sync_log','ae_sync_lock','ae_recheck_queue'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['ae_competitions','ae_seasons','ae_weeks','ae_spotlights','ae_highlights'] loop
 execute format('grant select on public.%I to anon,authenticated',t);
 execute format('drop policy if exists ae_read on public.%I',t);
 execute format('create policy ae_read on public.%I for select using(true)',t);
 end loop;
 foreach t in array array['ae_events','ae_offers','ae_results','ae_settlements','ae_audit','ae_sync_log'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('drop policy if exists ae_admin_read on public.%I',t);
 execute format('create policy ae_admin_read on public.%I for select using(public.rcm_is_editor())',t);
 end loop;
end $$;
grant select on public.ae_picks,public.ae_ledger to authenticated;
drop policy if exists ae_own_pick on public.ae_picks;
create policy ae_own_pick on public.ae_picks for select using(user_id=auth.uid() or public.rcm_is_editor());
drop policy if exists ae_own_ledger on public.ae_ledger;
create policy ae_own_ledger on public.ae_ledger for select using(exists(select 1 from public.ae_picks p where p.id=pick_id and (p.user_id=auth.uid() or public.rcm_is_editor())));
create or replace function public.ae_points(p_american integer) returns numeric language plpgsql immutable set search_path='' as $$
begin if p_american is null or abs(p_american::numeric)<100 then raise exception 'Cuota americana inválida';end if;return round(case when p_american>0 then p_american::numeric/100 else 100/abs(p_american::numeric) end,2);end $$;
create or replace function public.ae_no_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Registro histórico inmutable';end $$;
do $$ declare t text;begin foreach t in array array['ae_picks','ae_results','ae_settlements','ae_ledger'] loop
 execute format('drop trigger if exists ae_immutable on public.%I',t);
 execute format('create trigger ae_immutable before update or delete on public.%I for each row execute function public.ae_no_mutation()',t);end loop;end $$;
create or replace function public.ae_freeze_offer() returns trigger language plpgsql set search_path='' as $$ begin
 if (to_jsonb(new)-'available'-'verified_at') is distinct from (to_jsonb(old)-'available'-'verified_at') then raise exception 'Cuota y oferta congeladas';end if;return new;end $$;
drop trigger if exists ae_offer_immutable on public.ae_offers;
create trigger ae_offer_immutable before update on public.ae_offers for each row execute function public.ae_freeze_offer();

create or replace function public.ae_configure_week(p_season text,p_start timestamptz,p_limit integer,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.ae_weeks; sid uuid;begin
 if not public.rcm_is_editor() or auth.uid() is null then raise exception 'Solo administradores';end if;
 if length(trim(p_reason))<5 or p_reason is null then raise exception 'Explica el motivo';end if;
 if p_start<>date_trunc('week',p_start at time zone 'UTC') at time zone 'UTC' then raise exception 'La semana empieza el lunes 00:00 UTC';end if;
 if not exists(select 1 from public.ae_seasons where id=p_season and p_start>=starts_at and p_start+interval '7 days'<=ends_at) then raise exception 'Temporada no configurada';end if;
 perform pg_advisory_xact_lock(73319,11);
 select * into w from public.ae_weeks where starts_at=p_start;
 if w.id is not null and w.starts_at<=now() then raise exception 'Reglas de semana iniciada bloqueadas';end if;
 if w.id is null and p_start<=now() and (p_limit<>5 or p_start+interval '7 days'<=now()) then raise exception 'La semana actual solo admite el límite inicial de cinco';end if;
 insert into public.ae_weeks(season,starts_at,ends_at,max_picks) values(p_season,p_start,p_start+interval '7 days',p_limit)
 on conflict(starts_at) do update set max_picks=excluded.max_picks returning id into sid;
 insert into public.ae_audit(actor,action,reason,before_value,after_value) values(auth.uid(),'configure_week',p_reason,to_jsonb(w),jsonb_build_object('week_id',sid,'max_picks',p_limit));return sid;
end $$;
create or replace function public.ae_configure_season(p_id text,p_start timestamptz,p_end timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores';end if;
 if p_id is null or length(p_id) not between 1 and 40 or p_reason is null or length(trim(p_reason))<5 then raise exception 'Identificador y motivo requeridos';end if;
 perform pg_advisory_xact_lock(73319,11);
 if exists(select 1 from public.ae_seasons where tstzrange(starts_at,ends_at,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'Temporada existente o solapada: no se modifica';end if;
 insert into public.ae_seasons(id,starts_at,ends_at) values(p_id,p_start,p_end);
 insert into public.ae_audit(actor,action,reason,after_value) values(auth.uid(),'create_season',p_reason,jsonb_build_object('season',p_id,'starts_at',p_start,'ends_at',p_end));
end $$;
-- Only the private worker receives EXECUTE; frontend/admin cannot fabricate evidence.
create or replace function public.ae_ingest(p_event jsonb,p_offers jsonb,p_version text) returns void language plpgsql security definer set search_path='' as $$
declare e public.ae_events; c public.ae_competitions; w public.ae_weeks; o jsonb; fresh boolean; stamp timestamptz;start_time timestamptz;eid text;begin
 eid:=p_event->>'id';start_time:=(p_event->>'starts_at')::timestamptz;
 select * into c from public.ae_competitions where id=p_event->>'competition';if c.id is null then raise exception 'Competición inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended('ae-event:'||eid,0));
 select * into e from public.ae_events where id=eid for update;
 if e.id is not null and (e.home_id<>p_event->>'home_id' or e.away_id<>p_event->>'away_id' or e.competition<>c.id) then raise exception 'Identidad de evento incompatible';end if;
 insert into public.ae_events(id,competition,home_id,away_id,home,away,starts_at,original_start,status,verified_at,revision)
 values(eid,c.id,p_event->>'home_id',p_event->>'away_id',p_event->>'home',p_event->>'away',start_time,start_time,p_event->>'status',clock_timestamp(),p_version)
 on conflict(id) do update set starts_at=excluded.starts_at,status=case when ae_events.admin_hold or ae_events.original_start<>excluded.starts_at then 'UNDER_REVIEW' else excluded.status end,verified_at=excluded.verified_at,revision=excluded.revision;
 select * into e from public.ae_events where id=eid;
 update public.ae_offers set available=false where event_id=eid;
 if e.status<>'OPEN' or start_time<=clock_timestamp()+interval '5 minutes' or start_time>clock_timestamp()+interval '48 hours' then return;end if;
 select * into w from public.ae_weeks where start_time>=starts_at and start_time<ends_at;
 if w.id is null then return;end if;
 if jsonb_array_length(p_offers)<>(case when c.id='NFL' then 2 else 3 end) then return;end if;
 if (select count(distinct value->>'selection') from jsonb_array_elements(p_offers))<>jsonb_array_length(p_offers) then raise exception 'Selecciones duplicadas';end if;
 for o in select value from jsonb_array_elements(p_offers) loop
 stamp:=(o->>'provider_updated_at')::timestamptz;
 if o->>'period'<>c.period or o->>'market'<>c.market or o->>'bookmaker'<>'draftkings' or o->>'selection' not in('home','away','draw') or (c.id='NFL' and o->>'selection'='draw') or stamp is null or stamp<clock_timestamp()-interval '20 minutes' or stamp>clock_timestamp()+interval '1 minute' or coalesce((o->>'available')::boolean,false)=false then return;end if;
 perform public.ae_points((o->>'american')::integer);
 end loop;
 for o in select value from jsonb_array_elements(p_offers) loop
 insert into public.ae_offers(event_id,week_id,selection,odd_id,period,market,american,bookmaker,provider_updated_at,closes_at,available,verified_at,version)
 values(eid,w.id,o->>'selection',o->>'odd_id',c.period,c.market,(o->>'american')::integer,'draftkings',(o->>'provider_updated_at')::timestamptz,start_time-interval '5 minutes',true,clock_timestamp(),p_version)
 on conflict(event_id,selection) do update set available=true,verified_at=clock_timestamp();
 end loop;
end $$;
create or replace function public.ae_confirm_pick(p_offer uuid,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ae_offers;e public.ae_events;w public.ae_weeks;existing public.ae_picks;pid uuid;begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión';end if;
 if p_request is null then raise exception 'Falta identificador de solicitud';end if;
 perform pg_advisory_xact_lock(hashtextextended('ae-user:'||auth.uid()::text,0));
 select * into existing from public.ae_picks where user_id=auth.uid() and request_id=p_request;
 if existing.id is not null then if existing.offer_id<>p_offer then raise exception 'Solicitud ya usada';end if;return existing.id;end if;
 select * into o from public.ae_offers where id=p_offer;
 if o.id is null then raise exception 'Oferta no disponible';end if;
 perform pg_advisory_xact_lock(hashtextextended('ae-event:'||o.event_id,0));
 select * into o from public.ae_offers where id=p_offer;
 select * into e from public.ae_events where id=o.event_id;
 select * into w from public.ae_weeks where id=o.week_id;
 if not o.available or e.status<>'OPEN' or e.starts_at<>e.original_start or o.closes_at<=clock_timestamp() or o.verified_at<clock_timestamp()-interval '20 minutes' or o.fetched_at<clock_timestamp()-interval '48 hours' or e.starts_at<=clock_timestamp()+interval '5 minutes' or w.starts_at>clock_timestamp() or w.ends_at<=clock_timestamp() then raise exception 'Oferta cerrada, desactualizada o en revisión';end if;
 if exists(select 1 from public.ae_picks where user_id=auth.uid() and event_id=o.event_id) then raise exception 'Ya confirmaste un pick de este encuentro';end if;
 if (select count(*) from public.ae_picks where user_id=auth.uid() and week_id=w.id)>=w.max_picks then raise exception 'Límite semanal alcanzado';end if;
 insert into public.ae_picks(user_id,offer_id,event_id,week_id,request_id) values(auth.uid(),o.id,o.event_id,w.id,p_request) returning id into pid;return pid;
end $$;
create or replace function public.ae_settle(p_event text,p_version text,p_period text,p_home_id text,p_away_id text,p_home numeric,p_away numeric,p_state text,p_evidence jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.ae_events;c public.ae_competitions;r uuid;s uuid;p record;outcome text;target numeric;prior numeric;begin
 perform pg_advisory_xact_lock(hashtextextended('ae-event:'||p_event,0));
 select * into e from public.ae_events where id=p_event;
 select * into c from public.ae_competitions where id=e.competition;
 if e.id is null or e.home_id<>p_home_id or e.away_id<>p_away_id or c.period<>p_period then raise exception 'Evento o período incompatible';end if;
 if p_version is null or length(p_version)<16 or jsonb_typeof(p_evidence) is distinct from 'object' or p_evidence->>'provider' is distinct from 'sportsgameodds' then raise exception 'Falta evidencia';end if;
 if p_state='FINAL' and (p_evidence->>'finalized' is distinct from 'true' or p_home is null or p_away is null or p_home<0 or p_away<0 or p_home<>trunc(p_home) or p_away<>trunc(p_away)) then raise exception 'Resultado no definitivo';end if;
 if p_state='FINAL' and e.starts_at>clock_timestamp() then raise exception 'Encuentro futuro';end if;
 select id into r from public.ae_results where event_id=p_event order by created_at desc,id desc limit 1;
 if r is not null and (select evidence->>'fingerprint' from public.ae_results where id=r)=p_version then return r;end if;
 p_evidence:=p_evidence||jsonb_build_object('fingerprint',p_version);
 p_version:=p_version||':'||coalesce(r::text,'initial');
 insert into public.ae_results(event_id,version,period,home_score,away_score,state,evidence) values(p_event,p_version,p_period,p_home,p_away,p_state,p_evidence) returning id into r;
 update public.ae_events set status=case when p_state='FINAL' then 'FINAL' else 'UNDER_REVIEW' end where id=e.id;
 update public.ae_offers set available=false where event_id=e.id;
 for p in select k.*,o.selection,o.american from public.ae_picks k join public.ae_offers o on o.id=k.offer_id where k.event_id=e.id loop
 outcome:=case when p_state<>'FINAL' then p_state when c.id='NFL' and p_home=p_away then 'PUSH' when (p.selection='home' and p_home>p_away) or (p.selection='away' and p_away>p_home) or (p.selection='draw' and p_home=p_away) then 'WIN' else 'LOSS' end;
 target:=case outcome when 'WIN' then public.ae_points(p.american) when 'LOSS' then -public.ae_points(p.american) else 0 end;
 select coalesce(sum(delta),0) into prior from public.ae_ledger where pick_id=p.id;
 insert into public.ae_settlements(pick_id,result_id,state,points) values(p.id,r,outcome,target) returning id into s;
 insert into public.ae_ledger(pick_id,settlement_id,delta) values(p.id,s,target-prior);
 end loop;return r;
end $$;
-- Public output is bounded and contains usernames only, never emails/auth metadata.
create or replace function public.ae_offer_board() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x->>'starts_at'),'[]') from (
 select jsonb_build_object('id',o.id,'event_id',e.id,'competition',e.competition,'home',e.home,'away',e.away,'starts_at',e.starts_at,'selection',o.selection,'american',o.american,'points',public.ae_points(o.american),'closes_at',o.closes_at,'bookmaker',o.bookmaker,'version',o.version,'period',o.period,'market',o.market,'open',o.available and e.status='OPEN' and e.starts_at=e.original_start and o.closes_at>now() and o.verified_at>now()-interval '20 minutes' and o.fetched_at>now()-interval '48 hours' and w.starts_at<=now() and w.ends_at>now()) x
 from public.ae_offers o join public.ae_events e on e.id=o.event_id join public.ae_weeks w on w.id=o.week_id where e.starts_at>now()-interval '1 day' order by e.starts_at limit 300) t;
$$;
create or replace function public.ae_stats(p_competition text default null,p_from timestamptz default null,p_until timestamptz default null) returns jsonb language sql stable security definer set search_path='' as $$
 with picks as (
 select p.*,o.american,o.selection,e.home,e.away,e.competition,e.starts_at,coalesce(s.state,case when e.status='UNDER_REVIEW' then 'UNDER_REVIEW' else 'PENDING' end) state,coalesce(s.points,0) points,s.created_at settled_at,
 coalesce(nullif(u.raw_user_meta_data->>'username',''),'Usuario') username
 from public.ae_picks p join public.ae_offers o on o.id=p.offer_id join public.ae_events e on e.id=p.event_id join public.ae_weeks w on w.id=p.week_id join auth.users u on u.id=p.user_id
 left join lateral(select * from public.ae_settlements where pick_id=p.id order by created_at desc,id desc limit 1)s on true
 where (p_competition is null or e.competition=p_competition) and (p_from is null or w.starts_at>=p_from) and (p_until is null or w.starts_at<p_until)),
 totals as(select user_id,max(username) username,sum(points) points,count(*) total,count(*) filter(where state='WIN') wins,count(*) filter(where state='LOSS') losses,count(*) filter(where state in('PENDING','UNDER_REVIEW')) pending,min(accepted_at) first_pick from picks group by user_id),
 ranked as(select *,row_number() over(order by points desc,wins desc,losses asc,first_pick,user_id) position,round(100.0*wins/nullif(wins+losses,0),2) accuracy from totals)
 select jsonb_build_object('top',coalesce((select jsonb_agg(to_jsonb(t)-'user_id'-'first_pick' order by position) from ranked t where position<=10),'[]'),
 'me',(select to_jsonb(t)-'user_id'-'first_pick' from ranked t where user_id=auth.uid()),
 'own_best',(select to_jsonb(t)-'user_id'-'request_id' from picks t where state='WIN' and user_id=auth.uid() order by points desc,accepted_at,id limit 1),
 'best',(select to_jsonb(t)-'user_id'-'request_id' from picks t where state='WIN' and american>0 order by american desc,accepted_at,id limit 1));
$$;
create or replace function public.ae_my_picks(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x->>'accepted_at' desc,x->>'id' desc),'[]') from(select jsonb_build_object('id',p.id,'event_id',e.id,'home',e.home,'away',e.away,'competition',e.competition,'selection',o.selection,'american',o.american,'potential',public.ae_points(o.american),'accepted_at',p.accepted_at,'state',coalesce(s.state,case when e.status='UNDER_REVIEW' then 'UNDER_REVIEW' else 'PENDING' end),'points',coalesce(s.points,0),'result',case when r.state='FINAL' then r.home_score||'–'||r.away_score else null end) x
 from public.ae_picks p join public.ae_offers o on o.id=p.offer_id join public.ae_events e on e.id=p.event_id
 left join lateral(select * from public.ae_settlements where pick_id=p.id order by created_at desc,id desc limit 1)s on true left join public.ae_results r on r.id=s.result_id
 where p.user_id=auth.uid() and (p_before is null or (p.accepted_at,p.id)<(p_before,p_before_id)) order by p.accepted_at desc,p.id desc limit 100)t;
$$;
create or replace function public.ae_curate(p_kind text,p_data jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[];before_data jsonb;begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores';end if;
 if p_reason is null or length(trim(p_reason))<5 then raise exception 'Explica el motivo';end if;
 perform pg_advisory_xact_lock(73319,12);
 if p_kind='spotlights' then
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
 if cardinality(ids)<>2 or (select count(distinct x) from unnest(ids)x)<>2 or exists(select 1 from unnest(ids)x where not exists(select 1 from public.ae_offers o join public.ae_events e on e.id=o.event_id where o.id=x and o.available and o.closes_at>now() and e.status='OPEN')) then raise exception 'Elige dos ofertas abiertas distintas';end if;
 select to_jsonb(s) into before_data from public.ae_spotlights s where id=1;
 insert into public.ae_spotlights(id,offer_ids) values(1,ids) on conflict(id) do update set offer_ids=excluded.offer_ids,version=ae_spotlights.version+1;
 elsif p_kind='highlight' then
 select to_jsonb(h) into before_data from public.ae_highlights h where pick_id=(p_data->>'pick_id')::uuid;
 if nullif(p_data->>'position','') is null then delete from public.ae_highlights where pick_id=(p_data->>'pick_id')::uuid;
 else
 if (select state from public.ae_settlements where pick_id=(p_data->>'pick_id')::uuid order by created_at desc,id desc limit 1) is distinct from 'WIN' then raise exception 'Solo aciertos verificados';end if;
 if nullif(p_data->>'article_id','') is not null and not exists(select 1 from public.articles where id=(p_data->>'article_id')::uuid and is_public and category='Picks') then raise exception 'Análisis no disponible';end if;
 insert into public.ae_highlights(pick_id,position,title,description,article_id) values((p_data->>'pick_id')::uuid,(p_data->>'position')::integer,left(p_data->>'title',120),left(coalesce(p_data->>'description',''),1000),nullif(p_data->>'article_id','')::uuid)
 on conflict(pick_id) do update set position=excluded.position,title=excluded.title,description=excluded.description,article_id=excluded.article_id;
 end if;
 else raise exception 'Operación inválida';end if;
 insert into public.ae_audit(actor,action,reason,before_value,after_value) values(auth.uid(),p_kind,p_reason,before_data,p_data);
end $$;
create or replace function public.ae_public_highlights() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x->>'position'),'[]') from(select jsonb_build_object('pick_id',h.pick_id,'position',h.position,'title',h.title,'description',h.description,'article_id',case when exists(select 1 from public.articles a where a.id=h.article_id and a.is_public) then h.article_id else null end,'competition',e.competition,'home',e.home,'away',e.away,'selection',o.selection,'american',o.american,'points',s.points,'result',r.home_score||'–'||r.away_score,'date',s.created_at) x
 from public.ae_highlights h join public.ae_picks p on p.id=h.pick_id join public.ae_offers o on o.id=p.offer_id join public.ae_events e on e.id=p.event_id
 join lateral(select * from public.ae_settlements where pick_id=p.id order by created_at desc,id desc limit 1)s on s.state='WIN' join public.ae_results r on r.id=s.result_id)t;
$$;
create or replace function public.ae_worker_lock() returns boolean language plpgsql security definer set search_path='' as $$ declare got int;begin
 insert into public.ae_sync_lock values(1,clock_timestamp()+interval '4 minutes') on conflict(id) do update set until_at=excluded.until_at where ae_sync_lock.until_at<clock_timestamp();get diagnostics got=row_count;return got=1;end $$;
create or replace function public.ae_hold_event(p_event text,p_hold boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare old_value jsonb;begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores';end if;
 if p_reason is null or length(trim(p_reason))<5 or p_hold is null then raise exception 'Motivo requerido';end if;
 perform pg_advisory_xact_lock(hashtextextended('ae-event:'||p_event,0));
 select to_jsonb(e) into old_value from public.ae_events e where id=p_event;
 if old_value is null then raise exception 'Encuentro inexistente';end if;
 update public.ae_events set admin_hold=p_hold,status='UNDER_REVIEW' where id=p_event;
 update public.ae_offers set available=false where event_id=p_event;
 insert into public.ae_audit(actor,action,reason,before_value,after_value) values(auth.uid(),'hold_event',p_reason,old_value,jsonb_build_object('event_id',p_event,'admin_hold',p_hold));
end $$;
create or replace function public.ae_worker_usage() returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(objects),0)::bigint from public.ae_sync_log where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
$$;
create or replace function public.ae_request_recheck(p_event text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores';end if;
 if p_reason is null or length(trim(p_reason))<5 then raise exception 'Motivo requerido';end if;
 insert into public.ae_recheck_queue(event_id) values(p_event) on conflict(event_id) do update set requested_at=clock_timestamp();
 insert into public.ae_audit(actor,action,reason,after_value) values(auth.uid(),'request_recheck',p_reason,jsonb_build_object('event_id',p_event));
end $$;
-- Explicit allowlist; service_role is Supabase's backend-only role.
do $$ declare f record;begin for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,3)='ae_' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname in('ae_offer_board','ae_stats','ae_public_highlights') then execute format('grant execute on function %s to anon,authenticated',f.signature);
 elsif f.proname in('ae_confirm_pick','ae_my_picks','ae_curate','ae_configure_week','ae_configure_season','ae_hold_event','ae_request_recheck') then execute format('grant execute on function %s to authenticated',f.signature);
 elsif f.proname in('ae_ingest','ae_settle','ae_worker_lock','ae_worker_usage') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;end $$;
grant select,delete on public.ae_recheck_queue to service_role;
grant select,insert on public.ae_sync_log to service_role;
grant select on public.ae_events,public.ae_picks,public.ae_results,public.ae_weeks,public.ae_seasons to service_role;
notify pgrst,'reload schema';commit;
