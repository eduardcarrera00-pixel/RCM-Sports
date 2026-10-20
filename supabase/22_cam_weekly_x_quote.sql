-- Winning X notices quote the original Pick without uploading another photo.
-- Existing outcomes/deliveries are not requeued: this prevents duplicates.
CREATE OR REPLACE FUNCTION public.cam_resolve_weekly_pick(p_pick_id uuid, p_outcome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.ae_editorial_weekly_picks; existing cam_social.weekly_results;
 image text; link text; original_x text; detail text; k text; snap jsonb;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_outcome is null or p_outcome not in ('won','lost') then raise exception 'Resultado no válido'; end if;
 select * into p from public.ae_editorial_weekly_picks where id=p_pick_id for update;
 if not found then raise exception 'No se encontró el Pick de la Semana'; end if;
 select * into existing from cam_social.weekly_results where pick_id=p_pick_id;
 if found then
   if existing.outcome<>p_outcome then raise exception 'Este Pick ya tiene un resultado confirmado. No se puede cambiar ni volver a compartir.'; end if;
   return public.cam_weekly_pick_result(p_pick_id);
 end if;
 image:=coalesce(nullif(p.image_url,''),nullif(p.banner_url,''));
 if nullif(p.image_path,'') is not null then image:='https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/'||p.image_path;
 elsif nullif(p.banner_path,'') is not null then image:='https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/'||p.banner_path; end if;
 link:='https://camsports.github.io/?weeklyResult='||p.id::text;
 select external_url into original_x from cam_social.deliveries
 where event_key='weekly:'||p.id::text and network='twitter' and status='published'
 and external_url ~ '^https://(twitter[.]com|x[.]com)/[A-Za-z0-9_]+/status/[0-9]+$';
 snap:=jsonb_build_object('id',p.id,'title',p.title,'event_name',p.event_name,
   'selection',p.selection,'american_odds',p.american_odds,'image_url',cam_social.image_url(image),'link',link,'original_x_url',original_x);
 insert into cam_social.weekly_results(pick_id,outcome,resolved_by,snapshot) values(p.id,p_outcome,auth.uid(),snap);
 if p_outcome='won' then
   k:='weekly-won:'||p.id::text;
   detail:='✅ Pick acertado · Pick de la Semana'||E'\n'||cam_social.plain(p.title)||E'\n'||
     cam_social.plain(p.event_name)||E'\n'||cam_social.plain(p.selection)||' · Cuota '||
     case when p.american_odds>0 then '+' else '' end||p.american_odds::text;
   insert into cam_social.events(event_key,source_table,source_id,payload)
   values(k,'ae_editorial_weekly_pick_results',p.id::text,jsonb_build_object('title','Pick de la Semana acertado',
     'x_text','✅ Pick acertado · Pick de la Semana'||case when original_x is not null then E'\n'||original_x else '' end,
     'x_quote_url',original_x,'x_assets','[]'::jsonb,
     'tiktok_text',left(detail,1800)||E'\n'||link||E'\n#CAMSports',
     'image_url',cam_social.image_url(image),'link',link)) on conflict do nothing;
   insert into cam_social.deliveries(event_key,network,status)
   select k,network,case when network='twitter' and original_x is null then 'manual_reply' else 'queued' end
   from cam_social.channels where enabled on conflict do nothing;
   -- A delivery error must not undo the recorded outcome; queued work is picked up by cron.
   begin perform cam_social.dispatch();
   exception when others then
     raise warning 'CAM weekly result saved; social queue awaits dispatch (SQLSTATE %).',sqlstate;
   end;
 end if;
 return public.cam_weekly_pick_result(p_pick_id);
end $function$
;
revoke all on function public.cam_resolve_weekly_pick(uuid,text) from public,anon;
grant execute on function public.cam_resolve_weekly_pick(uuid,text) to authenticated;


create or replace function cam_social.dispatch() returns jsonb
language plpgsql set search_path='' as $$
declare
 s cam_social.settings; d record; h record; j jsonb; result jsonb;
 token text; request_body jsonb; input jsonb; rid bigint; sent int:=0;
 used_day int; used_burst int;
begin
 if not pg_try_advisory_xact_lock(20261020,19) then return '{"busy":true}'::jsonb; end if;
 -- Responses are collected even when the operator pauses new deliveries.
 for d in select * from cam_social.deliveries where status='submitting' order by id limit 100 loop
   select * into h from net._http_response where id=d.request_id;
   if not found then
     if d.submitted_at<now()-interval '10 minutes' then
       update cam_social.deliveries set status='uncertain',error='No se recibió confirmación. Revisar Buffer antes de reenviar.',updated_at=now() where id=d.id;
     end if;
     continue;
   end if;
   if h.status_code=429 then
     update cam_social.settings set paused_until=now()+interval '24 hours' where id;
     update cam_social.deliveries set status='queued',request_id=null,available_at=now()+interval '24 hours',error='Límite de Buffer; reintento aplazado.',updated_at=now() where id=d.id;
     continue;
   end if;
   if coalesce(h.timed_out,false) or h.error_msg is not null or h.status_code>=500 or h.status_code is null then
     update cam_social.deliveries set status='uncertain',error='Respuesta incierta. Revisar Buffer antes de reenviar.',updated_at=now() where id=d.id;
     continue;
   end if;
   begin j:=h.content::jsonb; exception when others then j:='{}'::jsonb; end;
   result:=j#>'{data,createPost,post}';
   if h.status_code between 200 and 299 and nullif(result->>'id','') is not null then
     update cam_social.deliveries set
       status=case when result->>'status'='sent' then 'published' when result->>'status'='error' then 'failed' else 'accepted' end,
       buffer_post_id=result->>'id',external_url=result->>'externalLink',
       error=case when result->>'status'='error' then 'Buffer no pudo publicar. Revisar el canal en Buffer.' end,updated_at=now() where id=d.id;
   elsif j#>>'{data,createPost,__typename}'='UnexpectedError' then
     update cam_social.deliveries set status='uncertain',error='Error interno de Buffer; comprobar si creó la publicación.',updated_at=now() where id=d.id;
   else
     update cam_social.deliveries set status='failed',error=left(coalesce(j#>>'{data,createPost,message}',j#>>'{errors,0,message}','Buffer rechazó la solicitud.'),400),updated_at=now() where id=d.id;
     if h.status_code in (401,403) then update cam_social.settings set enabled=false where id; end if;
   end if;
 end loop;

 select * into s from cam_social.settings where id;
 if not s.enabled or s.activated_at is null then return '{"paused":true}'::jsonb; end if;
 if s.paused_until>now() then return '{"rate_limited":true}'::jsonb; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='cam_buffer_api_key' limit 1;
 if nullif(token,'') is null then return '{"missing_buffer_key":true}'::jsonb; end if;
 select count(*) into used_day from cam_social.requests where created_at>now()-interval '24 hours';
 select count(*) into used_burst from cam_social.requests where created_at>now()-interval '15 minutes';
 for d in select q.*,e.payload,e.created_at as event_created_at,e.source_table,e.source_id,e.edition,c.channel_id
   from cam_social.deliveries q join cam_social.events e using(event_key)
   join cam_social.channels c using(network)
   where q.status='queued' and q.available_at<=now() and c.enabled
   order by q.id limit 10 for update of q skip locked
 loop
   exit when used_day>=s.daily_request_limit or used_burst>=80;
   if d.event_created_at<s.activated_at or not cam_social.source_visible(
      row(d.event_key,d.source_table,d.source_id,d.edition,d.payload,d.event_created_at)::cam_social.events) then
     update cam_social.deliveries set status='cancelled',error='Contenido retirado, vencido o anterior a la activación.',updated_at=now() where id=d.id;
     continue;
   end if;
   input:=jsonb_build_object('channelId',d.channel_id,'schedulingType','automatic','mode','shareNow',
     'text',case when d.network='twitter' then d.payload->>'x_text' else d.payload->>'tiktok_text' end,
     'assets',case when d.network='twitter' and d.source_table='ae_editorial_weekly_pick_results'
       then '[]'::jsonb else jsonb_build_array(jsonb_build_object('image',jsonb_build_object('url',d.payload->>'image_url'))) end);
   if d.network='tiktok' then input:=input||jsonb_build_object('metadata',jsonb_build_object('tiktok',
     jsonb_build_object('title',left(d.payload->>'title',80)))); end if;
   request_body:=jsonb_build_object('query',
     'mutation CamPublish($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id status externalLink } } ... on MutationError { message } } }',
     'variables',jsonb_build_object('input',input));
   rid:=net.http_post(url:='https://api.buffer.com',body:=request_body,
     headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=15000);
   insert into cam_social.requests(id) values(rid);
   update cam_social.deliveries set status='submitting',request_id=rid,attempts=attempts+1,submitted_at=now(),updated_at=now(),error=null where id=d.id;
   used_day:=used_day+1; used_burst:=used_burst+1; sent:=sent+1;
 end loop;
 delete from cam_social.requests where created_at<now()-interval '31 days';
 return jsonb_build_object('submitted',sent);
end $$;

revoke all on function cam_social.dispatch() from public,anon,authenticated;
notify pgrst,'reload schema';
