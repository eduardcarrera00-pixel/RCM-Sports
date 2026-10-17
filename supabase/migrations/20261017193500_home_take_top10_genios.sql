-- AE SPORTS: Top 10 de Genios, manteniendo Anoetos como los diez
-- participantes con menos puntos fuera del podio (Top 3).
-- Mismas columnas, permisos y criterios que la RPC existente; no inventa puestos.
create or replace function public.ae_home_take_point_extremes(p_period text default 'all'::text)
returns table (
  side text, rank_number integer, user_id uuid, username text, points bigint,
  correct_takes bigint, total_resolved bigint, best_take_id uuid,
  best_take_title text, best_take_excerpt text, best_take_points integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_period is null or p_period not in ('month','all') then
    raise exception 'Periodo inválido';
  end if;

  return query
  with eligible as (
    select t.user_id, t.id as take_id, t.title, t.body,
           r.outcome, r.points, r.scored_at
    from public.ae_take_results r
    join public.ae_free_takes t on t.id = r.take_id
    where not t.hidden
      and (p_period = 'all' or
        date_trunc('month', r.scored_at at time zone 'America/Toronto')
        = date_trunc('month', now() at time zone 'America/Toronto'))
  ),
  totals as (
    select e.user_id, sum(e.points)::bigint as points,
           count(*) filter (where e.outcome = 'won')::bigint as correct_takes,
           count(*)::bigint as total_resolved
    from eligible e group by e.user_id
  ),
  best as (
    select distinct on (e.user_id) e.user_id, e.take_id, e.title,
      left(regexp_replace(e.body, '[[:space:]]+', ' ', 'g'), 180) as excerpt,
      e.points::integer as best_points
    from eligible e where e.outcome = 'won'
    order by e.user_id, e.points desc, e.scored_at desc, e.take_id
  ),
  participant as (
    select s.user_id,
      coalesce(nullif(left(u.raw_user_meta_data->>'username', 40), ''),
               nullif(left(u.raw_user_meta_data->>'display_name', 40), ''),
               'Aficionado')::text as username,
      s.points, s.correct_takes, s.total_resolved,
      b.take_id, b.title, b.excerpt, b.best_points
    from totals s
    join auth.users u on u.id = s.user_id
    left join best b on b.user_id = s.user_id
  ),
  highest as (
    select p.user_id,
      row_number() over (order by p.points desc, p.correct_takes desc, p.user_id)::integer as n
    from participant p
    order by p.points desc, p.correct_takes desc, p.user_id
    limit 10
  ),
  lowest as (
    select p.user_id,
      row_number() over (order by p.points asc, p.correct_takes asc, p.user_id)::integer as n
    from participant p
    where not exists (
      select 1 from highest h where h.user_id = p.user_id and h.n <= 3
    )
    order by p.points asc, p.correct_takes asc, p.user_id
    limit 10
  ),
  chosen as (
    select 'genios'::text as side, h.n as rank_number, h.user_id from highest h
    union all
    select 'anoetos'::text as side, l.n as rank_number, l.user_id from lowest l
  )
  select c.side, c.rank_number, p.user_id, p.username, p.points, p.correct_takes,
         p.total_resolved, p.take_id, p.title, p.excerpt, p.best_points
  from chosen c join participant p on p.user_id = c.user_id
  order by case c.side when 'genios' then 1 else 2 end, c.rank_number;
end;
$function$;
