-- CAM SPORTS: "¿Quién será campeón?" puntúa en la clasificación de Takes
-- (no en Picks) y los perfiles muestran los campeones elegidos.

-- 1) Picks vuelve a contar solo los Picks de la comunidad.
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

-- 2) Filas de Takes: Takes libres puntuados + predicciones de campeón resueltas.
create or replace function public.ae_take_score_rows(p_sport text, p_period text)
returns table(user_id uuid, take_id uuid, title text, body text, outcome text, points integer, scored_at timestamptz)
language sql
stable
security definer
set search_path=''
as $$
  select t.user_id, t.id, t.title, t.body, r.outcome, r.points::integer, r.scored_at
    from public.ae_take_results r
    join public.ae_free_takes t on t.id=r.take_id
   where not t.hidden
     and (p_sport='all' or r.sport=p_sport)
     and (p_period='all'
          or date_trunc('month',r.scored_at at time zone 'America/Toronto')
             = date_trunc('month',now() at time zone 'America/Toronto'))
  union all
  select p.user_id, q.id,
         ('Campeón · '||o.label)::text,
         q.prompt,
         case when coalesce(p.awarded_points,0)>0 then 'won' else 'lost' end,
         coalesce(p.awarded_points,0),
         q.settled_at
    from public.ae_take_predictions p
    join public.ae_take_questions q on q.id=p.question_id
    join public.ae_take_options o on o.id=p.option_id
   where q.status='settled' and q.period='season' and q.settled_at is not null
     and (p_sport='all'
          or (p_sport='nfl' and q.competition='nfl')
          or (p_sport='football' and q.competition in ('laliga','premier','ligamx','champions')))
     and (p_period='all'
          or date_trunc('month',q.settled_at at time zone 'America/Toronto')
             = date_trunc('month',now() at time zone 'America/Toronto'))
$$;
revoke all on function public.ae_take_score_rows(text,text) from public,anon,authenticated;

create or replace function public.ae_take_result_ranking(p_sport text, p_period text default 'month')
returns table(user_id uuid, username text, points bigint, correct_takes bigint, total_resolved bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_sport is null or p_sport not in ('nfl','football','all')
    or p_period is null or p_period not in ('month','all') then
    raise exception 'Clasificación inválida';
  end if;
  return query
  select e.user_id,
    coalesce(nullif(left(coalesce(max(acc.username), max(u.raw_user_meta_data->>'username')),40),''),
      nullif(left(max(u.raw_user_meta_data->>'display_name'),40),''),'Aficionado')::text,
    sum(e.points)::bigint,
    count(*) filter(where e.outcome='won')::bigint,
    count(*)::bigint
  from public.ae_take_score_rows(p_sport,p_period) e
  join auth.users u on u.id=e.user_id
  left join public.ae_auth_accounts acc on acc.user_id=e.user_id
  group by e.user_id
  order by sum(e.points) desc,count(*) filter(where e.outcome='won') desc,e.user_id
  limit 10;
end $$;

create or replace function public.ae_take_result_ranking_details(p_sport text, p_period text default 'month')
returns table(user_id uuid, username text, points bigint, correct_takes bigint, total_resolved bigint, best_take_id uuid, best_take_title text, best_take_excerpt text, best_take_points integer)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_sport is null or p_sport not in ('nfl','football','all')
    or p_period is null or p_period not in ('month','all') then
    raise exception 'Clasificación inválida';
  end if;
  return query
  with eligible as (
    select * from public.ae_take_score_rows(p_sport,p_period)
  ),
  totals as (
    select e.user_id, sum(e.points)::bigint as points,
           count(*) filter (where e.outcome='won')::bigint as correct_takes,
           count(*)::bigint as total_resolved
      from eligible e
     group by e.user_id
  ),
  best as (
    select distinct on (e.user_id) e.user_id, e.take_id, e.title,
           left(regexp_replace(e.body, '[[:space:]]+', ' ', 'g'), 180) as excerpt,
           e.points as earned
      from eligible e
     where e.outcome='won'
     order by e.user_id, e.points desc, e.scored_at desc, e.take_id
  )
  select totals.user_id,
         coalesce(nullif(left(coalesce((select acc.username from public.ae_auth_accounts acc where acc.user_id=u.id), u.raw_user_meta_data->>'username'),40),''),
                  nullif(left(u.raw_user_meta_data->>'display_name',40),''),
                  'Aficionado')::text,
         totals.points, totals.correct_takes, totals.total_resolved,
         best.take_id, best.title, best.excerpt, best.earned
    from totals
    join auth.users u on u.id=totals.user_id
    left join best on best.user_id=totals.user_id
   order by totals.points desc, totals.correct_takes desc, totals.user_id
   limit 10;
end
$$;

create or replace function public.ae_take_result_ranking_rookies(p_sport text, p_period text default 'month')
returns table(user_id uuid, username text, points bigint, correct_takes bigint, total_resolved bigint, lost_takes bigint, worst_take_id uuid, worst_take_title text, worst_take_excerpt text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_sport is null or p_sport not in ('nfl','football','all')
     or p_period is null or p_period not in ('month','all') then
    raise exception 'Clasificación inválida';
  end if;
  return query
  with eligible as (
    select * from public.ae_take_score_rows(p_sport,p_period)
  ),
  totals as (
    select e.user_id,
           sum(e.points)::bigint as sum_points,
           count(*) filter(where e.outcome='won')::bigint as wins,
           count(*)::bigint as resolved,
           count(*) filter(where e.outcome='lost')::bigint as losses
      from eligible e
     group by e.user_id
    having count(*) filter(where e.outcome='lost')>0
  ),
  latest_miss as (
    select distinct on (e.user_id) e.user_id,e.take_id,e.title,
      left(regexp_replace(e.body,'[[:space:]]+',' ','g'),180) as excerpt
      from eligible e
     where e.outcome='lost'
     order by e.user_id,e.scored_at desc,e.take_id desc
  )
  select total.user_id,
         coalesce(nullif(left(coalesce((select acc.username from public.ae_auth_accounts acc where acc.user_id=u.id), u.raw_user_meta_data->>'username'),40),''),
                  nullif(left(u.raw_user_meta_data->>'display_name',40),''),
                  'Aficionado')::text,
         total.sum_points,total.wins,total.resolved,total.losses,
         last.take_id,last.title,last.excerpt
    from totals total
    join auth.users u on u.id=total.user_id
    join latest_miss last on last.user_id=total.user_id
   order by total.losses desc,total.wins asc,total.sum_points asc,total.user_id
   limit 10;
end
$$;

-- 3) Campeones elegidos por un usuario (perfil propio y público).
create or replace function public.ae_user_champion_picks(p_user_id uuid)
returns table(question_id uuid, competition text, season text, prompt text, team text,
  points integer, state text, awarded_points integer, winner text, closes_at timestamptz,
  settled_at timestamptz, picked_at timestamptz)
language sql
stable
security definer
set search_path=''
as $$
  select q.id, q.competition, q.season, q.prompt, o.label,
         coalesce(o.points, q.points)::integer,
         case when q.status='settled' then case when coalesce(p.awarded_points,0)>0 then 'won' else 'lost' end
              when q.status='open' and q.closes_at>now() then 'open'
              else 'pending' end,
         coalesce(p.awarded_points,0),
         w.label, q.closes_at, q.settled_at, p.created_at
    from public.ae_take_predictions p
    join public.ae_take_questions q on q.id=p.question_id
    join public.ae_take_options o on o.id=p.option_id
    left join public.ae_take_options w on w.id=q.correct_option_id
   where p.user_id=p_user_id and q.period='season' and q.status<>'void'
   order by coalesce(q.settled_at,q.closes_at) desc,
     array_position(array['laliga','premier','ligamx','champions','nfl','colegial'],q.competition)
   limit 40
$$;

revoke all on function public.ae_pick_result_ranking(text) from public,anon,authenticated;
revoke all on function public.ae_pick_result_ranking_worst(text) from public,anon,authenticated;
revoke all on function public.ae_take_result_ranking(text,text) from public,anon,authenticated;
revoke all on function public.ae_take_result_ranking_details(text,text) from public,anon,authenticated;
revoke all on function public.ae_take_result_ranking_rookies(text,text) from public,anon,authenticated;
revoke all on function public.ae_user_champion_picks(uuid) from public,anon,authenticated;
grant execute on function public.ae_pick_result_ranking(text) to anon,authenticated;
grant execute on function public.ae_pick_result_ranking_worst(text) to anon,authenticated;
grant execute on function public.ae_take_result_ranking(text,text) to anon,authenticated;
grant execute on function public.ae_take_result_ranking_details(text,text) to anon,authenticated;
grant execute on function public.ae_take_result_ranking_rookies(text,text) to anon,authenticated;
grant execute on function public.ae_user_champion_picks(uuid) to anon,authenticated;

notify pgrst,'reload schema';
