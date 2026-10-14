-- Aditiva. Primero 06 + respaldo verificado. NO volver a ejecutar 01.
begin;
do $$ begin
 if to_regprocedure('public.rcm_is_editor()') is null or to_regclass('public.article_likes') is null then
 raise exception 'Faltan dependencias: revisar diagnóstico y migraciones existentes'; end if;
end $$;
create table if not exists public.champions_clubs(
 season text not null, id text not null, name text not null, logo text not null check(logo like 'https://%'),
 participating boolean not null default true, primary key(season,id));
create table if not exists public.champions_rankings(
 id uuid primary key default gen_random_uuid(), season text not null, edition text not null check(length(trim(edition)) between 1 and 100),
 team_ids text[] not null, published_at timestamptz not null default clock_timestamp(), published_by uuid not null references auth.users);
create table if not exists public.champions_drafts(
 user_id uuid not null references auth.users on delete cascade, season text not null,
 edition text not null, team_ids text[] not null, base_id uuid, primary key(user_id,season));
create table if not exists public.pick_editions(
 id uuid primary key default gen_random_uuid(), edition text not null check(length(trim(edition)) between 1 and 100),
 starts_at timestamptz not null, closes_at timestamptz not null, published_at timestamptz not null default clock_timestamp(),
 published_by uuid not null references auth.users, check(closes_at>starts_at));
create unique index if not exists rcm_pick_start_once on public.pick_editions(starts_at);
create table if not exists public.sports_picks(
 id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.pick_editions,
 position integer not null check(position in(1,2)), title text not null check(length(trim(title)) between 1 and 120),
 description text not null default '' check(length(description)<=2000), sport text not null check(length(trim(sport)) between 1 and 80),
 event text not null check(length(trim(event)) between 1 and 200), article_id uuid references public.articles on delete set null,
 outcome text not null default 'pending' check(outcome in('pending','won','lost','void')),
 result text not null default '' check(length(result)<=2000), resolved_at timestamptz,
 featured_order integer check(featured_order between 1 and 5), version integer not null default 1,
 unique(edition_id,position),unique(edition_id,id),check(featured_order is null or outcome='won'),
 check(outcome='pending' or (resolved_at is not null and length(trim(result))>0)));
create unique index if not exists rcm_featured_slot on public.sports_picks(featured_order) where featured_order is not null;
create table if not exists public.pick_drafts(
 user_id uuid primary key references auth.users on delete cascade, payload jsonb not null, base_id uuid);
create table if not exists public.pick_votes(
 edition_id uuid not null references public.pick_editions,user_id uuid not null references auth.users on delete cascade,
 pick_id uuid not null,updated_at timestamptz not null default clock_timestamp(),primary key(edition_id,user_id),
 foreign key(edition_id,pick_id) references public.sports_picks(edition_id,id));
create table if not exists public.pick_audit(
 id uuid primary key default gen_random_uuid(),pick_id uuid not null references public.sports_picks,
 changed_by uuid not null references auth.users,changed_at timestamptz not null default clock_timestamp(),before_value jsonb not null,after_value jsonb not null);
-- Public read, no direct administrative writes. All mutations below are authorized RPCs.
do $$ declare t text; begin
 foreach t in array array['champions_clubs','champions_rankings','champions_drafts','pick_editions','sports_picks','pick_drafts','pick_votes','pick_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['champions_clubs','champions_rankings'] loop
 execute format('grant select on public.%I to anon,authenticated',t);
 execute format('drop policy if exists public_read on public.%I',t);
 execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
 end loop;
 foreach t in array array['champions_drafts','pick_drafts'] loop
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('drop policy if exists owner_editor on public.%I',t);
 execute format('create policy owner_editor on public.%I for all to authenticated using(user_id=auth.uid() and public.rcm_is_editor()) with check(user_id=auth.uid() and public.rcm_is_editor())',t);
 end loop;
end $$;
grant select on public.pick_editions,public.sports_picks to anon,authenticated;
drop policy if exists edition_read on public.pick_editions;
create policy edition_read on public.pick_editions for select using(starts_at<=now() or public.rcm_is_editor());
drop policy if exists pick_read on public.sports_picks;
create policy pick_read on public.sports_picks for select using(exists(select 1 from public.pick_editions e where e.id=edition_id));
grant select on public.pick_votes,public.pick_audit to authenticated;
drop policy if exists vote_owner on public.pick_votes;
create policy vote_owner on public.pick_votes for select using(user_id=auth.uid());
drop policy if exists audit_editor on public.pick_audit;
create policy audit_editor on public.pick_audit for select using(public.rcm_is_editor());

create or replace function public.rcm_publish_champions(p_season text,p_edition text,p_team_ids text[],p_expected_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous uuid; new_id uuid;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 perform pg_advisory_xact_lock(hashtextextended('champions:'||p_season,0));
 select id into previous from public.champions_rankings where season=p_season order by published_at desc,id desc limit 1;
 if previous is distinct from p_expected_id then raise exception 'RCM_CONFLICT: otra edición fue publicada'; end if;
 if p_team_ids is null or cardinality(p_team_ids)<>10 or array_ndims(p_team_ids)<>1 or array_lower(p_team_ids,1)<>1
 or (select count(distinct x) from unnest(p_team_ids) x)<>10
 or exists(select 1 from unnest(p_team_ids) x where not exists(select 1 from public.champions_clubs c where c.season=p_season and c.id=x and c.participating)) then raise exception 'Selecciona diez clubes distintos de la temporada'; end if;
 insert into public.champions_rankings(season,edition,team_ids,published_by) values(p_season,trim(p_edition),p_team_ids,auth.uid()) returning id into new_id;
 insert into public.champions_drafts values(auth.uid(),p_season,trim(p_edition),p_team_ids,new_id)
 on conflict(user_id,season) do update set edition=excluded.edition,team_ids=excluded.team_ids,base_id=excluded.base_id;
 return new_id;
end $$;
create or replace function public.rcm_publish_picks(p_payload jsonb,p_expected_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous uuid; new_id uuid; o jsonb; n int:=0; start_time timestamptz; close_time timestamptz;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 perform pg_advisory_xact_lock(73319,3);
 select id into previous from public.pick_editions order by published_at desc,id desc limit 1;
 if previous is distinct from p_expected_id then raise exception 'RCM_CONFLICT: otra edición fue publicada'; end if;
 if jsonb_typeof(p_payload->'options') is distinct from 'array' or jsonb_array_length(p_payload->'options')<>2 then raise exception 'Selecciona exactamente dos picks'; end if;
 start_time:=(p_payload->>'starts_at')::timestamptz; close_time:=(p_payload->>'closes_at')::timestamptz;
 if start_time is null or close_time is null or close_time<=clock_timestamp() or close_time<=start_time then raise exception 'Horario de publicación o cierre inválido'; end if;
 if exists(select 1 from public.pick_editions where starts_at>=start_time) then raise exception 'La nueva edición debe comenzar después de las ediciones ya programadas'; end if;
 insert into public.pick_editions(edition,starts_at,closes_at,published_by) values(trim(p_payload->>'edition'),start_time,close_time,auth.uid()) returning id into new_id;
 for o in select value from jsonb_array_elements(p_payload->'options') loop
 n:=n+1;
 if nullif(o->>'article_id','') is not null and not exists(select 1 from public.articles where id=(o->>'article_id')::uuid and category='Picks' and is_public) then raise exception 'Vincula una publicación pública de Picks'; end if;
 insert into public.sports_picks(edition_id,position,title,description,sport,event,article_id)
 values(new_id,n,trim(o->>'title'),coalesce(o->>'description',''),trim(o->>'sport'),trim(o->>'event'),nullif(o->>'article_id','')::uuid);
 end loop;
 delete from public.pick_drafts where user_id=auth.uid();
 return new_id;
end $$;
create or replace function public.rcm_choose_pick(p_edition_id uuid,p_pick_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.pick_editions;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión para apoyar un pick'; end if;
 perform pg_advisory_xact_lock(73319,3);
 select * into e from public.pick_editions where id=p_edition_id;
 if e.id is null or e.starts_at>clock_timestamp() or e.closes_at<=clock_timestamp()
 or exists(select 1 from public.pick_editions where starts_at>e.starts_at and starts_at<=clock_timestamp()) then raise exception 'La votación está cerrada'; end if;
 if not exists(select 1 from public.sports_picks where edition_id=e.id and id=p_pick_id and outcome='pending') then raise exception 'Pick no disponible'; end if;
 insert into public.pick_votes(edition_id,user_id,pick_id) values(e.id,auth.uid(),p_pick_id)
 on conflict(edition_id,user_id) do update set pick_id=excluded.pick_id,updated_at=clock_timestamp();
end $$;
create or replace function public.rcm_pick_totals() returns table(pick_id uuid,votes bigint,my_vote boolean)
language sql stable security definer set search_path='' as $$
 select p.id,count(v.user_id),coalesce(bool_or(v.user_id=auth.uid()),false)
 from public.sports_picks p join public.pick_editions e on e.id=p.edition_id and e.starts_at<=now()
 left join public.pick_votes v on v.pick_id=p.id group by p.id;
$$;
create or replace function public.rcm_update_pick(p_id uuid,p_expected_version integer,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.sports_picks; updated public.sports_picks;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 perform pg_advisory_xact_lock(73319,3);
 select * into previous from public.sports_picks where id=p_id for update;
 if previous.id is null or previous.version is distinct from p_expected_version then raise exception 'RCM_CONFLICT: recarga el historial'; end if;
 if nullif(p_data->>'article_id','') is not null and not exists(select 1 from public.articles where id=(p_data->>'article_id')::uuid and category='Picks' and is_public) then raise exception 'Publicación de Picks inválida'; end if;
 -- Resolving an option closes the whole ballot, so users cannot switch to a known winner.
 if p_data->>'outcome'<>'pending' then
 update public.pick_editions set closes_at=greatest(starts_at+interval '1 microsecond',least(closes_at,clock_timestamp())) where id=previous.edition_id;
 end if;
 update public.sports_picks set title=p_data->>'title',description=coalesce(p_data->>'description',''),sport=p_data->>'sport',event=p_data->>'event',
 article_id=nullif(p_data->>'article_id','')::uuid,outcome=p_data->>'outcome',result=coalesce(p_data->>'result',''),
 resolved_at=case when p_data->>'outcome'='pending' then null else coalesce((p_data->>'resolved_at')::timestamptz,clock_timestamp()) end,
 featured_order=nullif(p_data->>'featured_order','')::integer,version=version+1 where id=p_id returning * into updated;
 insert into public.pick_audit(pick_id,changed_by,before_value,after_value) values(p_id,auth.uid(),to_jsonb(previous),to_jsonb(updated));
end $$;
-- Exact denominator excludes pending and void outcomes; no invented counters.
create or replace view public.rcm_pick_performance with(security_invoker=true) as
 select sport,count(*) filter(where outcome in('won','lost')) resolved,count(*) filter(where outcome='won') won,
 count(*) filter(where outcome='lost') lost,
 round(100.0*count(*) filter(where outcome='won')/nullif(count(*) filter(where outcome in('won','lost')),0),1) win_percent
 from public.sports_picks group by sport;
grant select on public.rcm_pick_performance to anon,authenticated;
revoke all on function public.rcm_publish_champions(text,text,text[],uuid),public.rcm_publish_picks(jsonb,uuid),public.rcm_choose_pick(uuid,uuid),public.rcm_update_pick(uuid,integer,jsonb),public.rcm_pick_totals() from public,anon,authenticated;
grant execute on function public.rcm_publish_champions(text,text,text[],uuid),public.rcm_publish_picks(jsonb,uuid),public.rcm_choose_pick(uuid,uuid),public.rcm_update_pick(uuid,integer,jsonb) to authenticated;
grant execute on function public.rcm_pick_totals() to anon,authenticated;
notify pgrst,'reload schema';
commit;
