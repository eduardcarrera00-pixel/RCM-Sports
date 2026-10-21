-- Auto-musicalized TikTok publishing. Preserve X photo delivery and deduplication.
-- No old events are enqueued and no external service credentials are added.
alter table cam_social.deliveries
 add column if not exists video_check_request_id bigint,
 add column if not exists video_check_at timestamptz;

-- Public RPC shows only already-public editorial content waiting to be posted.
-- GitHub Actions does not receive the Buffer API key or database write credentials.
create or replace function public.cam_social_video_jobs(max_jobs integer default 8) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('event_key',j.event_key,
   'title',j.payload->>'title','image_url',j.payload->>'image_url')
   order by j.created_at),'[]'::jsonb)
 from (
   select e.event_key,e.payload,e.created_at
   from cam_social.deliveries d
   join cam_social.events e using(event_key)
   join cam_social.settings s on s.id=true
   join cam_social.channels c on c.network=d.network
   where d.network='tiktok' and d.status='queued'
     and c.enabled and s.enabled and s.activated_at is not null
     and e.created_at>=s.activated_at
     and cam_social.source_visible(e)
   order by e.created_at
   limit greatest(1,least(coalesce(max_jobs,8),12))
 ) j;
$$;
revoke all on function public.cam_social_video_jobs(integer) from public,anon,authenticated;
grant execute on function public.cam_social_video_jobs(integer) to anon,authenticated;

create or replace function cam_social.dispatch() returns jsonb
language plpgsql set search_path='' as $$
declare
 s cam_social.settings; d record; h record; v record; j jsonb; result jsonb; video_url text;
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
   -- TikTok must never receive the still photo without embedded audio. The public
   -- video is rendered by the scheduled GitHub worker. A one-byte HTTP range
   -- request verifies the deployed MP4 before Buffer is asked to publish.
   if d.network='tiktok' then
     video_url:='https://camsports.github.io/assets/social-videos/'||md5(d.event_key)||'.mp4';
     if d.video_check_request_id is null then
       rid:=net.http_get(url:=video_url,headers:='{"Range":"bytes=0-0"}'::jsonb,timeout_milliseconds:=15000);
       update cam_social.deliveries set video_check_request_id=rid,video_check_at=now(),
         available_at=now()+interval '1 minute',error='Esperando el vídeo con música de CAM Sports',
         updated_at=now() where id=d.id;
       continue;
     end if;
     select * into v from net._http_response where id=d.video_check_request_id;
     if not found and d.video_check_at>now()-interval '3 minutes' then continue; end if;
     if not found or coalesce(v.status_code,0) not in (200,206)
       or coalesce(lower(v.headers->>'content-type'),'') not like 'video/mp4%' then
       update cam_social.deliveries set video_check_request_id=null,video_check_at=null,
         available_at=now()+interval '4 minutes',error='Esperando archivo MP4 público con música',
         updated_at=now() where id=d.id;
       continue;
     end if;
   end if;
   input:=jsonb_build_object('channelId',d.channel_id,'schedulingType','automatic','mode','shareNow',
     'text',case when d.network='twitter' then d.payload->>'x_text' else d.payload->>'tiktok_text' end,
     'assets',jsonb_build_array(jsonb_build_object('image',jsonb_build_object('url',d.payload->>'image_url'))));
   if d.network='tiktok' then
     input:=input||jsonb_build_object('assets',jsonb_build_array(
       jsonb_build_object('video',jsonb_build_object('url',video_url,
         'metadata',jsonb_build_object('thumbnailOffset',2000)))));
     input:=input||jsonb_build_object('metadata',jsonb_build_object('tiktok',
       jsonb_build_object('title',left(d.payload->>'title',80))));
   end if;
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


notify pgrst,'reload schema';
