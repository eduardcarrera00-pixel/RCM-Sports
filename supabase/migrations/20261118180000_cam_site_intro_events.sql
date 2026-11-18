-- CAM SPORTS · Bienvenida y tarjetas de sección (18 nov 2026, pedido de Eduard).
-- Cuántas visitas ven la bienvenida (o la tarjeta de NFL, Fútbol, Picks o
-- Actualidad), cuántas tocan el botón principal y cuántas la cierran sin tocarlo.
-- Sin IP ni datos personales: la misma sesión y el mismo visitante anónimos del
-- contador de visitas (cam_site_visits). Una fila por visita, tarjeta y acción.
create table if not exists public.cam_site_intro_events (
  session_id uuid not null,
  visitor_id uuid not null,
  card text not null check (card in ('bienvenida','nfl','futbol','picks','actualidad')),
  action text not null check (action in ('vista','paso2','paso3','boton','cerrada','info')),
  created_at timestamptz not null default now(),
  primary key (session_id, card, action)
);
create index if not exists cam_site_intro_events_created_idx on public.cam_site_intro_events (created_at);
alter table public.cam_site_intro_events enable row level security;
revoke all on public.cam_site_intro_events from public, anon, authenticated;

create or replace function public.cam_track_intro(
  p_session_id uuid, p_visitor_id uuid, p_card text, p_action text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_agent text;
begin
  if p_session_id is null or p_visitor_id is null then return; end if;
  if p_card is null or not (p_card = any(array['bienvenida','nfl','futbol','picks','actualidad'])) then return; end if;
  if p_action is null or not (p_action = any(array['vista','paso2','paso3','boton','cerrada','info'])) then return; end if;
  v_agent := coalesce(nullif(current_setting('request.headers', true), '')::json->>'user-agent', '');
  if v_agent ~* '(headlesschrome|lighthouse|phantomjs|googlebot|bingbot|crawler|spider)' then return; end if;
  -- Solo visitas que el contador ya conoce (la misma sesión y el mismo visitante).
  insert into public.cam_site_intro_events(session_id, visitor_id, card, action)
  select p_session_id, p_visitor_id, p_card, p_action
   where exists (select 1 from public.cam_site_visits v
                  where v.session_id = p_session_id and v.visitor_id = p_visitor_id)
  on conflict (session_id, card, action) do nothing;
end; $function$;

-- Resumen de los últimos 30 días para el panel de estadísticas (solo administradores).
create or replace function public.cam_intro_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.rcm_is_editor() then
    raise exception 'Acceso exclusivo para administradores' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'card', c.card,
           'vista', coalesce(s.vista, 0), 'paso2', coalesce(s.paso2, 0), 'paso3', coalesce(s.paso3, 0),
           'boton', coalesce(s.boton, 0), 'cerrada', coalesce(s.cerrada, 0), 'info', coalesce(s.info, 0)
         ) order by c.ord), '[]'::jsonb)
    into v_result
    from (values ('bienvenida', 1), ('nfl', 2), ('futbol', 3), ('picks', 4), ('actualidad', 5)) as c(card, ord)
    left join (
      select e.card,
             count(*) filter (where e.action = 'vista') as vista,
             count(*) filter (where e.action = 'paso2') as paso2,
             count(*) filter (where e.action = 'paso3') as paso3,
             count(*) filter (where e.action = 'boton') as boton,
             count(*) filter (where e.action = 'cerrada') as cerrada,
             count(*) filter (where e.action = 'info') as info
        from public.cam_site_intro_events e
       where e.created_at >= now() - interval '30 days'
       group by e.card
    ) s on s.card = c.card;
  return v_result;
end; $function$;

revoke all on function public.cam_track_intro(uuid, uuid, text, text) from public;
grant execute on function public.cam_track_intro(uuid, uuid, text, text) to anon, authenticated;
revoke all on function public.cam_intro_summary() from public, anon;
grant execute on function public.cam_intro_summary() to authenticated;
