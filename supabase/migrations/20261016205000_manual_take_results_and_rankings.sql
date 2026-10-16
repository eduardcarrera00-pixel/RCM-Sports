-- AE SPORTS: human-scored Takes. No published Take receives points automatically.
create table public.ae_take_results (
  take_id uuid primary key references public.ae_free_takes(id) on delete cascade,
  sport text not null check (sport in ('nfl','football')),
  outcome text not null check (outcome in ('won','lost')),
  points smallint not null check (points between 0 and 100 and (outcome='won' and points>=1 or outcome='lost' and points=0)),
  scored_at timestamptz not null default now(),
  scored_by uuid not null references auth.users(id)
);
create index ae_take_results_month on public.ae_take_results(scored_at,sport);
alter table public.ae_take_results enable row level security;
revoke all on public.ae_take_results from public,anon,authenticated;

-- Keep a resolved Take in its reviewed community; this also protects older
-- category-changing RPCs and prevents moving points between sport rankings.
create function public.ae_lock_scored_take_sport()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.sport is distinct from old.sport
    and exists(select 1 from public.ae_take_results where take_id=old.id) then
    raise exception 'Un Take ya puntuado no puede cambiar de comunidad';
  end if;
  return new;
end $$;
create trigger ae_lock_scored_take_sport before update of sport on public.ae_free_takes
for each row execute function public.ae_lock_scored_take_sport();
revoke all on function public.ae_lock_scored_take_sport() from public,anon,authenticated;

create function public.ae_score_free_take(p_take_id uuid,p_outcome text,p_points integer)
returns integer language plpgsql security definer set search_path='' as $$
declare reviewed_sport text;
begin
  if auth.uid() is null or not public.rcm_is_editor() then
    raise exception 'Solo administradores pueden puntuar Takes';
  end if;
  if p_outcome is null or p_outcome not in ('won','lost')
    or p_points is null or p_points not between 0 and 100
    or (p_outcome='won' and p_points=0) or (p_outcome='lost' and p_points<>0) then
    raise exception 'El acierto vale de 1 a 100 puntos; el fallo vale 0';
  end if;
  select case when t.sport='nfl' then 'nfl'
    when t.sport in ('football','laliga','premier','ligamx','champions') then 'football'
    else null end into reviewed_sport
  from public.ae_free_takes t where t.id=p_take_id and not t.hidden for update;
  if reviewed_sport is null then raise exception 'Take no disponible para puntuar'; end if;
  insert into public.ae_take_results(take_id,sport,outcome,points,scored_by)
    values(p_take_id,reviewed_sport,p_outcome,p_points,auth.uid())
  on conflict(take_id) do update set outcome=excluded.outcome,points=excluded.points,
    scored_at=now(),scored_by=excluded.scored_by;
  return p_points;
end $$;
revoke all on function public.ae_score_free_take(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.ae_score_free_take(uuid,text,integer) to authenticated;

create function public.ae_take_result_ranking(p_sport text,p_period text default 'month')
returns table(user_id uuid,username text,points bigint,correct_takes bigint,total_resolved bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_sport is null or p_sport not in ('nfl','football','all')
    or p_period is null or p_period not in ('month','all') then
    raise exception 'Clasificación inválida';
  end if;
  return query
  select t.user_id,
    coalesce(nullif(max(left(u.raw_user_meta_data->>'username',40)),''),
      nullif(max(left(u.raw_user_meta_data->>'display_name',40)),''),'Aficionado')::text,
    sum(r.points)::bigint,
    count(*) filter(where r.outcome='won')::bigint,
    count(*)::bigint
  from public.ae_take_results r
  join public.ae_free_takes t on t.id=r.take_id
  join auth.users u on u.id=t.user_id
  where not t.hidden and (p_sport='all' or r.sport=p_sport)
    and (p_period='all' or date_trunc('month',r.scored_at at time zone 'America/Toronto')
      =date_trunc('month',now() at time zone 'America/Toronto'))
  group by t.user_id
  order by sum(r.points) desc,count(*) filter(where r.outcome='won') desc,t.user_id
  limit 10;
end $$;
revoke all on function public.ae_take_result_ranking(text,text) from public,anon,authenticated;
grant execute on function public.ae_take_result_ranking(text,text) to anon,authenticated;

-- Editors can review every pending Take, including older posts beyond the
-- eight displayed in the public feed. Previously scored Takes remain editable.
create function public.ae_take_review_queue(p_sport text)
returns table(id uuid,title text,author text,sport text,created_at timestamptz,
  outcome text,points smallint,scored_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then
    raise exception 'Solo administradores pueden revisar Takes';
  end if;
  if p_sport is null or p_sport not in ('nfl','football') then raise exception 'Deporte inválido'; end if;
  return query
  select t.id,t.title,
    coalesce(nullif(left(u.raw_user_meta_data->>'username',40),''),
      nullif(left(u.raw_user_meta_data->>'display_name',40),''),'Aficionado')::text,
    t.sport,t.created_at,r.outcome,r.points,r.scored_at
  from public.ae_free_takes t join auth.users u on u.id=t.user_id
  left join public.ae_take_results r on r.take_id=t.id
  where not t.hidden and (case when t.sport='nfl' then 'nfl'
    when t.sport in ('football','laliga','premier','ligamx','champions') then 'football'
    else null end)=p_sport
  order by (r.take_id is null) desc,t.created_at desc,t.id desc
  limit 500;
end $$;
revoke all on function public.ae_take_review_queue(text) from public,anon,authenticated;
grant execute on function public.ae_take_review_queue(text) to authenticated;
notify pgrst,'reload schema';
