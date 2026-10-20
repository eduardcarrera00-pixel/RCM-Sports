-- CAM SPORTS / 20 de octubre de 2026
-- Conteo privado de sesiones, procedencia UTM/referrer y secciones exploradas.
-- Se aplica una vez a la base de datos de producción. No guarda IP ni URLs completas.
-- No modifica las tablas de usuarios, picks o takes.

create table if not exists public.cam_site_visits (
  session_id uuid primary key,
  visitor_id uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source text not null default 'Desconocido',
  medium text not null default '',
  campaign text not null default '',
  landing_section text not null default 'Inicio'
);
create index if not exists cam_site_visits_started_idx on public.cam_site_visits(started_at desc);
create index if not exists cam_site_visits_visitor_idx on public.cam_site_visits(visitor_id);

create table if not exists public.cam_site_sections (
  session_id uuid not null references public.cam_site_visits(session_id) on delete cascade,
  section text not null,
  first_seen_at timestamptz not null default now(),
  primary key(session_id,section)
);
create index if not exists cam_site_sections_section_idx on public.cam_site_sections(section);

alter table public.cam_site_visits enable row level security;
alter table public.cam_site_sections enable row level security;
revoke all on public.cam_site_visits from public,anon,authenticated;
revoke all on public.cam_site_sections from public,anon,authenticated;

create or replace function public.cam_track_site_visit(
  p_session_id uuid,p_visitor_id uuid,p_source text,p_medium text,
  p_campaign text,p_section text
) returns void
language plpgsql security definer set search_path=''
as $$
declare v_section text; v_source text;
begin
  if p_session_id is null or p_visitor_id is null then return; end if;
  v_section:=case when p_section=any(array[
    'Inicio','Picks','NFL','Fútbol','Opiniones','Colegial','NBA','Tenis','Ciclismo'
  ]) then p_section else 'Otras' end;
  v_source:=left(coalesce(nullif(btrim(regexp_replace(coalesce(p_source,''),'[[:cntrl:]]','','g')),''),'Desconocido'),60);
  insert into public.cam_site_visits(session_id,visitor_id,source,medium,campaign,landing_section)
  values(p_session_id,p_visitor_id,v_source,
    left(regexp_replace(coalesce(p_medium,''),'[[:cntrl:]]','','g'),40),
    left(regexp_replace(coalesce(p_campaign,''),'[[:cntrl:]]','','g'),80),
    v_section)
  on conflict(session_id) do update set last_seen_at=now()
  where public.cam_site_visits.visitor_id=excluded.visitor_id;

  insert into public.cam_site_sections(session_id,section)
  select p_session_id,v_section
  where exists(select 1 from public.cam_site_visits
               where session_id=p_session_id and visitor_id=p_visitor_id)
  on conflict(session_id,section) do nothing;
end; $$;

create or replace function public.cam_analytics_summary()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.rcm_is_editor() then
    raise exception 'Acceso exclusivo para administradores' using errcode='42501';
  end if;

  select jsonb_build_object(
    'total_visits',(select count(*) from public.cam_site_visits),
    'today_visits',(select count(*) from public.cam_site_visits
      where started_at>=(date_trunc('day',now() at time zone 'America/Toronto') at time zone 'America/Toronto')),
    'last7_visits',(select count(*) from public.cam_site_visits where started_at>=now()-interval '7 days'),
    'last30_visits',(select count(*) from public.cam_site_visits where started_at>=now()-interval '30 days'),
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
    'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',d.day_value::date::text,
                         'visits',coalesce(q.n,0)) order by d.day_value),'[]'::jsonb)
      from generate_series((now() at time zone 'America/Toronto')::date-13,
                           (now() at time zone 'America/Toronto')::date,interval '1 day') as d(day_value)
      left join (select (started_at at time zone 'America/Toronto')::date visit_day,count(*) n
                 from public.cam_site_visits where started_at>=now()-interval '15 days'
                 group by 1) q on q.visit_day=d.day_value::date)
  ) into v_result;
  return v_result;
end; $$;

revoke all on function public.cam_track_site_visit(uuid,uuid,text,text,text,text) from public;
grant execute on function public.cam_track_site_visit(uuid,uuid,text,text,text,text) to anon,authenticated;
revoke all on function public.cam_analytics_summary() from public,anon;
grant execute on function public.cam_analytics_summary() to authenticated;
comment on table public.cam_site_visits is
  'Analítica CAM SPORTS: ID aleatorio por navegador, sin IP, nombres, correo ni ruta URL.';
comment on function public.cam_analytics_summary() is
  'Solo agregados; requiere editor verificado con auth.uid().';
