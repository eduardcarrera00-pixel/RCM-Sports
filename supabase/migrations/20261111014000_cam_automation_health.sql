-- CAM SPORTS: observabilidad privada de los procesos deportivos.
-- Sin mutar Picks, resultados ni clasificaciones historicas.
create schema if not exists cam_ops;
revoke all on schema cam_ops from public, anon, authenticated;

create table if not exists cam_ops.automation_health (
  check_key text primary key,
  category text not null,
  status text not null check (status in ('ok','warning')),
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  first_warning_at timestamptz
);
alter table cam_ops.automation_health enable row level security;
revoke all on cam_ops.automation_health from public, anon, authenticated;

create or replace function cam_ops.refresh_automation_health()
returns void language plpgsql security invoker set search_path='' as $function$
declare v_today date := (now() at time zone 'America/Toronto')::date;
begin
  -- Comprobar que los cron siguen activos y que su ultima ejecucion termino.
  with required(jobname, max_minutes) as (
    values ('ae-settle-picks',50),('cam-nfl-hourly',100),
      ('cam-nfl-results-every-10-min',30),
      ('cam-football-hourly',100),
      ('cam-football-results-every-10-min',30),
      ('cam-monthly-leagues',35)
  ), observed as (
    select r.jobname,r.max_minutes,j.active,d.start_time,d.status as run_status
    from required r left join cron.job j on j.jobname=r.jobname
    left join lateral (
      select x.start_time,x.status from cron.job_run_details x
      where x.jobid=j.jobid order by x.start_time desc limit 1
    ) d on true
  )
  insert into cam_ops.automation_health(check_key,category,status,details,checked_at,first_warning_at)
  select 'cron:'||jobname,'cron',
    case when coalesce(active,false) and run_status='succeeded'
      and start_time>=now()-make_interval(mins=>max_minutes) then 'ok' else 'warning' end,
    jsonb_build_object('active',coalesce(active,false),'last_run',start_time,
      'last_status',run_status,'maximum_delay_minutes',max_minutes),
    now(),case when coalesce(active,false) and run_status='succeeded'
      and start_time>=now()-make_interval(mins=>max_minutes) then null else now() end
  from observed
  on conflict(check_key) do update
    set status=excluded.status,details=excluded.details,checked_at=excluded.checked_at,
      first_warning_at=case when excluded.status='warning'
        then coalesce(cam_ops.automation_health.first_warning_at,excluded.checked_at)
        else null end;

  -- Un cron "succeeded" solo significa que envio la peticion HTTP.
  -- Verificamos tambien una respuesta 2xx real y reconocible de cada Edge Function.
  with endpoints(check_key,pattern,max_minutes) as (
    values ('http:picks','%"checked"%',95),
      ('http:nfl','%"weeks"%',95),
      ('http:football','%"competitions"%',95)
  ), checks as (
    select e.check_key,e.max_minutes,max(r.created) last_success
    from endpoints e left join net._http_response r
      on r.status_code between 200 and 299 and r.error_msg is null
      and r.content like e.pattern
    group by e.check_key,e.max_minutes
  )
  insert into cam_ops.automation_health(check_key,category,status,details,checked_at,first_warning_at)
  select check_key,'http',
    case when last_success>=now()-make_interval(mins=>max_minutes) then 'ok' else 'warning' end,
    jsonb_build_object('last_success',last_success,'maximum_delay_minutes',max_minutes),
    now(),case when last_success>=now()-make_interval(mins=>max_minutes) then null else now() end
  from checks
  on conflict(check_key) do update
    set status=excluded.status,details=excluded.details,checked_at=excluded.checked_at,
      first_warning_at=case when excluded.status='warning'
        then coalesce(cam_ops.automation_health.first_warning_at,excluded.checked_at)
        else null end;

  -- No adjudicar sin fuente oficial: los retrasos quedan visibles para revision.
  with counts(check_key,category,amount) as (
    select 'picks:overdue','picks',count(*)::bigint
      from public.ae_community_picks where not hidden and moderation_status='approved'
        and outcome='pending' and event_date < v_today-1
    union all
    select 'picks:awaiting_moderation','moderation',count(*)::bigint
      from public.ae_community_picks where not hidden and moderation_status='pending'
        and outcome='pending' and event_date < v_today
    union all
    select 'picks:missing_points','picks',count(*)::bigint
      from public.ae_community_picks where not hidden and moderation_status='approved'
        and outcome in ('won','lost','void') and result_points is null
    union all
    select 'nfl:unsettled_final','nfl',count(*)::bigint
      from public.cam_nfl_picks p join public.cam_nfl_games g on g.id=p.game_id
      where g.status='final' and g.winner_id is not null and (p.settled_at is null or p.awarded_points is null)
    union all
    select 'football:unsettled_final','football',count(*)::bigint
      from public.cam_football_picks p join public.cam_football_games g on g.id=p.game_id
      where g.status='final' and g.outcome is not null and (p.settled_at is null or p.awarded_points is null)
    union all
    select 'leagues:stale_snapshot','leagues',
      case when max(updated_at) is null or max(updated_at)<now()-interval '50 minutes'
        then 1::bigint else 0::bigint end
      from public.cam_league_standings
      where season_month=date_trunc('month',now() at time zone 'America/Toronto')::date
  )
  insert into cam_ops.automation_health(check_key,category,status,details,checked_at,first_warning_at)
  select check_key,category,case when amount=0 then 'ok' else 'warning' end,
    jsonb_build_object('affected_count',amount),now(),
    case when amount=0 then null else now() end
  from counts
  on conflict(check_key) do update
    set status=excluded.status,details=excluded.details,checked_at=excluded.checked_at,
      first_warning_at=case when excluded.status='warning'
        then coalesce(cam_ops.automation_health.first_warning_at,excluded.checked_at)
        else null end;
end $function$;
revoke all on function cam_ops.refresh_automation_health() from public,anon,authenticated;

-- Conserva el mismo secreto, cabeceras y destino; solo mejora la frecuencia.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='ae-settle-picks'),
  schedule := '7,27,47 * * * *'
);
select cron.schedule('cam-automation-health','*/15 * * * *',
  'select cam_ops.refresh_automation_health()');
select cam_ops.refresh_automation_health();
