-- CAM SPORTS · Las visitas de navegadores automáticos no cuentan.
-- Del 22 al 25 oct 2026 ~2.900 de ~3.300 visitas registradas venían de pruebas
-- automáticas de GitHub (HeadlessChrome). El navegador ya no las envía
-- (assets/cam-analytics.js); esto lo refuerza en el servidor.
-- Mismo cuerpo que antes, con una comprobación del user agent al principio.
create or replace function public.cam_track_site_visit(
  p_session_id uuid, p_visitor_id uuid, p_source text, p_medium text,
  p_campaign text, p_section text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_section text; v_source text; v_agent text;
begin
 if p_session_id is null or p_visitor_id is null then return; end if;
 v_agent := coalesce(nullif(current_setting('request.headers', true), '')::json->>'user-agent', '');
 if v_agent ~* '(headlesschrome|lighthouse|phantomjs|googlebot|bingbot|crawler|spider)' then return; end if;
 v_section := case when p_section=any(array[
   'Inicio','Picks','NFL','Fútbol','Opiniones','Colegial','NBA','Tenis','Ciclismo'
 ]) then p_section else 'Otras' end;
 v_source := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_source,''),'[[:cntrl:]]','','g')),''),'Desconocido'),60);
 insert into public.cam_site_visits(session_id,visitor_id,source,medium,campaign,landing_section)
 values (
   p_session_id,p_visitor_id,v_source,
   left(regexp_replace(coalesce(p_medium,''),'[[:cntrl:]]','','g'),40),
   left(regexp_replace(coalesce(p_campaign,''),'[[:cntrl:]]','','g'),80),
   v_section
 )
 on conflict(session_id) do update set last_seen_at=now()
 where public.cam_site_visits.visitor_id=excluded.visitor_id;
 insert into public.cam_site_sections(session_id,section)
 select p_session_id,v_section where exists(
   select 1 from public.cam_site_visits
   where session_id=p_session_id and visitor_id=p_visitor_id
 )
 on conflict(session_id,section) do nothing;
end; $function$;
