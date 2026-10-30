-- Resumen de visitas para el conector MCP de CAM Sports (función cam-mcp).
-- Misma cuenta que cam_analytics_summary(), pero sin sesión de usuario:
-- solo la puede ejecutar service_role (la función cam-mcp, tras comprobar su clave).
create or replace function public.cam_mcp_analytics_summary()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
 select jsonb_build_object(
  'total_visits',(select count(*) from public.cam_site_visits),
  'today_visits',(select count(*) from public.cam_site_visits
    where started_at >= (date_trunc('day',now() at time zone 'America/Toronto') at time zone 'America/Toronto')),
  'last7_visits',(select count(*) from public.cam_site_visits where started_at>=now()-interval '7 days'),
  'last30_visits',(select count(*) from public.cam_site_visits where started_at>=now()-interval '30 days'),
  'unique7',(select count(distinct visitor_id) from public.cam_site_visits where started_at>=now()-interval '7 days'),
  'unique30',(select count(distinct visitor_id) from public.cam_site_visits where started_at>=now()-interval '30 days'),
  'sources',(select coalesce(jsonb_agg(jsonb_build_object('name',q.source,'visits',q.n) order by q.n desc),'[]'::jsonb)
    from (select source,count(*) n from public.cam_site_visits
      where started_at>=now()-interval '30 days' group by source order by n desc limit 10) q),
  'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('name',q.campaign,'visits',q.n) order by q.n desc),'[]'::jsonb)
    from (select campaign,count(*) n from public.cam_site_visits
      where started_at>=now()-interval '30 days' and campaign<>'' group by campaign order by n desc limit 8) q),
  'sections',(select coalesce(jsonb_agg(jsonb_build_object('name',q.section,'visits',q.n) order by q.n desc),'[]'::jsonb)
    from (select s.section,count(*) n from public.cam_site_sections s
      join public.cam_site_visits v using(session_id)
      where v.started_at>=now()-interval '30 days' group by s.section order by n desc limit 10) q),
  'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',d.day_value::date::text,'visits',coalesce(q.n,0))
            order by d.day_value),'[]'::jsonb)
    from generate_series((now() at time zone 'America/Toronto')::date-13,
                         (now() at time zone 'America/Toronto')::date,
                         interval '1 day') as d(day_value)
    left join (select (started_at at time zone 'America/Toronto')::date as visit_day,count(*) n
               from public.cam_site_visits
               where started_at>=now()-interval '15 days' group by 1) q
    on q.visit_day=d.day_value::date)
 );
$function$;

revoke all on function public.cam_mcp_analytics_summary() from public;
revoke all on function public.cam_mcp_analytics_summary() from anon;
revoke all on function public.cam_mcp_analytics_summary() from authenticated;
grant execute on function public.cam_mcp_analytics_summary() to service_role;

comment on function public.cam_mcp_analytics_summary() is
  'Resumen de visitas para el conector MCP (cam-mcp). Solo service_role.';
