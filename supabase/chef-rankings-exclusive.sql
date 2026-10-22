-- CAM SPORTS / Picks / Mejores Chefs y Peores Chefs
-- Ejecutado en Supabase production y staging (21 oct 2026).
-- El RPC original de Mejores Chefs y el cálculo de puntos permanecen intactos.
-- La exclusión es por user_id UUID y se realiza ANTES del LIMIT 10.
-- El frontend pasa los 10 user_id de la tabla visible de Mejores Chefs.
create or replace function public.ae_pick_result_ranking_worst_eligible(
  p_period text default 'month'::text,
  p_excluded_user_ids uuid[] default '{}'::uuid[]
)
returns table(user_id uuid, username text, points numeric, correct_picks bigint, total_resolved bigint)
language plpgsql stable security definer
set search_path to ''
as $function$
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
    where not (r.user_id = any(coalesce(p_excluded_user_ids,'{}'::uuid[])))
    group by r.user_id
    order by sum(r.points) asc,sum(r.correct) asc,r.user_id
    limit 10;
end
$function$;
revoke all on function public.ae_pick_result_ranking_worst_eligible(text,uuid[]) from public;
grant execute on function public.ae_pick_result_ranking_worst_eligible(text,uuid[]) to anon, authenticated;
