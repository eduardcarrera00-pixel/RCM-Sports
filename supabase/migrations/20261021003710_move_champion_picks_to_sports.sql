-- CAM SPORTS: move champion selections to Fútbol/NFL and fold their awards
-- into the existing Picks ranking. Additive and idempotent for current data.

create or replace function public.ae_create_take(
  p_competition text,
  p_period text,
  p_prompt text,
  p_closes_at timestamptz,
  p_points int,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare q uuid; opt text;
begin
  if auth.uid() is null or not public.rcm_is_editor() then
    raise exception 'Solo administradores';
  end if;
  if p_competition is null or p_competition not in ('laliga','premier','ligamx','champions','nfl','colegial')
    or p_period is null or p_period not in ('weekly','season')
    or p_prompt is null or length(trim(p_prompt)) not between 10 and 220
    or p_closes_at is null or p_closes_at <= now()
    or p_points is null or p_points not between 1 and 100
    or p_options is null or cardinality(p_options) not between 2 and 32 or array_ndims(p_options) <> 1
    or exists(select 1 from unnest(p_options) x where x is null or length(trim(x)) not between 1 and 100)
    or (select count(distinct lower(trim(x))) from unnest(p_options) x) <> cardinality(p_options)
  then
    raise exception 'Datos de pregunta inválidos';
  end if;
  insert into public.ae_take_questions(competition,period,prompt,closes_at,points,created_by)
  values(p_competition,p_period,trim(p_prompt),p_closes_at,p_points,auth.uid())
  returning id into q;
  foreach opt in array p_options loop
    insert into public.ae_take_options(question_id,label) values(q,trim(opt));
  end loop;
  return q;
end
$$;

-- NFL has 32 clubs, so seed it directly from the public team catalog. The
-- current Power Ranking controls the payout tiers; unranked clubs pay 20 pts.
do $$
declare
  q uuid;
  ranked text[];
  team record;
  position int;
  payout smallint;
begin
  select id into q
  from public.ae_take_questions
  where competition='nfl' and period='season' and status='open'
  order by created_at desc
  limit 1;

  if q is null then
    insert into public.ae_take_questions(competition,period,season,prompt,closes_at,points,status)
    values('nfl','season','2026/27','¿Quién será campeón de la NFL 2026/27?',
      '2026-10-30 23:59:00+00'::timestamptz,20,'open')
    returning id into q;

    select team_ids into ranked from public.nfl_rankings where id=1;
    for team in select id,name from public.nfl_teams order by name loop
      position := array_position(ranked,team.id);
      payout := case position
        when 1 then 4 when 2 then 5 when 3 then 6 when 4 then 7 when 5 then 9
        when 6 then 10 when 7 then 12 when 8 then 14 when 9 then 16 when 10 then 18
        else 20 end;
      insert into public.ae_take_options(question_id,label,points)
      values(q,team.name,payout);
    end loop;
  end if;
end
$$;

create or replace function public.ae_pick_result_ranking(p_period text default 'month')
returns table(user_id uuid,username text,points numeric,correct_picks bigint,total_resolved bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_period is null or p_period not in ('month','all') then
    raise exception 'Periodo inválido';
  end if;
  return query
    with score_rows as (
      select p.user_id,
        coalesce(nullif(p.author,''),'Aficionado')::text as username,
        p.result_points::numeric as points,
        case when p.outcome='won' then 1 else 0 end as correct,
        p.settled_at
      from public.ae_community_picks p
      where not p.hidden and p.moderation_status='approved'
        and p.outcome in ('won','lost','void') and p.settled_at is not null
      union all
      select p.user_id,
        coalesce(nullif(a.username,''),'Aficionado')::text,
        p.awarded_points::numeric,
        case when p.awarded_points > 0 then 1 else 0 end,
        q.settled_at
      from public.ae_take_predictions p
      join public.ae_take_questions q on q.id=p.question_id
      left join public.ae_auth_accounts a on a.user_id=p.user_id
      where q.status='settled' and q.period='season' and q.settled_at is not null
    ), filtered as (
      select * from score_rows r
      where p_period='all' or date_trunc('month',r.settled_at at time zone 'America/Toronto')
        = date_trunc('month',now() at time zone 'America/Toronto')
    )
    select r.user_id,max(r.username)::text,sum(r.points)::numeric(12,2),
      sum(r.correct)::bigint,count(*)::bigint
    from filtered r
    group by r.user_id
    order by sum(r.points) desc,sum(r.correct) desc,r.user_id
    limit 10;
end
$$;

create or replace function public.ae_pick_result_ranking_worst(p_period text default 'month')
returns table(user_id uuid,username text,points numeric,correct_picks bigint,total_resolved bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_period is null or p_period not in ('month','all') then
    raise exception 'Periodo inválido';
  end if;
  return query
    with score_rows as (
      select p.user_id,
        coalesce(nullif(p.author,''),'Aficionado')::text as username,
        p.result_points::numeric as points,
        case when p.outcome='won' then 1 else 0 end as correct,
        p.settled_at
      from public.ae_community_picks p
      where not p.hidden and p.moderation_status='approved'
        and p.outcome in ('won','lost','void') and p.settled_at is not null
      union all
      select p.user_id,
        coalesce(nullif(a.username,''),'Aficionado')::text,
        p.awarded_points::numeric,
        case when p.awarded_points > 0 then 1 else 0 end,
        q.settled_at
      from public.ae_take_predictions p
      join public.ae_take_questions q on q.id=p.question_id
      left join public.ae_auth_accounts a on a.user_id=p.user_id
      where q.status='settled' and q.period='season' and q.settled_at is not null
    ), filtered as (
      select * from score_rows r
      where p_period='all' or date_trunc('month',r.settled_at at time zone 'America/Toronto')
        = date_trunc('month',now() at time zone 'America/Toronto')
    )
    select r.user_id,max(r.username)::text,sum(r.points)::numeric(12,2),
      sum(r.correct)::bigint,count(*)::bigint
    from filtered r
    group by r.user_id
    order by sum(r.points) asc,sum(r.correct) asc,r.user_id
    limit 10;
end
$$;

revoke all on function public.ae_create_take(text,text,text,timestamptz,int,text[]) from public,anon,authenticated;
revoke all on function public.ae_pick_result_ranking(text) from public,anon,authenticated;
revoke all on function public.ae_pick_result_ranking_worst(text) from public,anon,authenticated;
grant execute on function public.ae_create_take(text,text,text,timestamptz,int,text[]) to authenticated;
grant execute on function public.ae_pick_result_ranking(text) to anon,authenticated;
grant execute on function public.ae_pick_result_ranking_worst(text) to anon,authenticated;

notify pgrst,'reload schema';
