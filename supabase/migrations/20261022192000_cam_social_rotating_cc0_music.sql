-- CAM SPORTS: CC0 music catalog, shuffled least-used rotation, distinct IG/TikTok videos.
-- No old publications are resent, no credentials exposed, and X keeps its JPGs.
-- Source and license evidence: https://en.freepd.cn/music (CC0, commercial use,
-- sync, edits and redistribution allowed; rights claims can still be automated).
create table if not exists cam_social.music_tracks(
  slug text primary key check (slug ~ '^[a-z0-9-]{2,64}$'),
  title text not null,
  source_url text not null check (source_url ~ '^https://en\\.freepd\\.cn/api/music/[A-Fa-f0-9]+$'),
  license_proof_url text not null,
  license text not null check(license='CC0'),
  enabled boolean not null default true
);
alter table cam_social.music_tracks enable row level security;
revoke all on cam_social.music_tracks from public,anon,authenticated;

insert into cam_social.music_tracks(slug,title,source_url,license_proof_url,license,enabled)
values
  ('backbeat','Backbeat','https://en.freepd.cn/api/music/456c656374726f6e69632f4261636b626561742e6d7033','https://en.freepd.cn/music/electronic','CC0',true),
  ('beat-one','Beat One','https://en.freepd.cn/api/music/456c656374726f6e69632f42656174204f6e652e6d7033','https://en.freepd.cn/music/electronic','CC0',true),
  ('arpent','Arpent','https://en.freepd.cn/api/music/456c656374726f6e69632f417270656e742e6d7033','https://en.freepd.cn/music/electronic','CC0',true),
  ('chronos','Chronos','https://en.freepd.cn/api/music/456c656374726f6e69632f4368726f6e6f732e6d7033','https://en.freepd.cn/music/electronic','CC0',true),
  ('fireworks','Fireworks','https://en.freepd.cn/api/music/456c656374726f6e69632f46697265776f726b732e6d7033','https://en.freepd.cn/music/electronic','CC0',true),
  ('hippety-hop','Hippety Hop','https://en.freepd.cn/api/music/456c656374726f6e69632f4869707065747920486f702e6d7033','https://en.freepd.cn/music/electronic','CC0',true),
  ('battle-ready','Battle Ready','https://en.freepd.cn/api/music/457069632f426174746c652052656164792e6d7033','https://en.freepd.cn/music/epic','CC0',true),
  ('adventure','Adventure','https://en.freepd.cn/api/music/457069632f416476656e747572652e6d7033','https://en.freepd.cn/music/epic','CC0',true),
  ('limit-70','Limit 70','https://en.freepd.cn/api/music/5570626561742f4c696d69742037302e6d7033','https://en.freepd.cn/music/upbeat','CC0',true),
  ('motions','Motions','https://en.freepd.cn/api/music/5570626561742f4d6f74696f6e732e6d7033','https://en.freepd.cn/music/upbeat','CC0',true)
on conflict (slug) do nothing;

alter table cam_social.deliveries
  add column if not exists music_track_slug text references cam_social.music_tracks(slug);
create index if not exists cam_social_music_delivery_usage
  on cam_social.deliveries(music_track_slug) where music_track_slug is not null;

-- Assign when each delivery is created, not at render time: retries stay stable.
-- An advisory transaction lock serializes choices from concurrent publishing.
-- Total use counts implement a shuffled bag: each song is used once per cycle,
-- with distinct tracks on Instagram and TikTok for the same event.
create or replace function cam_social.assign_music() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.network not in ('instagram','tiktok') or new.music_track_slug is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(20261022, 2026);
  select t.slug into new.music_track_slug
  from cam_social.music_tracks t
  where t.enabled and t.license='CC0'
  order by
    case when exists(
      select 1 from cam_social.deliveries d
      where d.event_key=new.event_key and d.music_track_slug=t.slug
    ) then 1 else 0 end,
    (select count(*) from cam_social.deliveries d where d.music_track_slug=t.slug),
    random()
  limit 1;
  -- A missing catalog MUST NOT block article creation; dispatch will hold videos.
  return new;
end $$;
drop trigger if exists cam_social_assign_music on cam_social.deliveries;
create trigger cam_social_assign_music before insert on cam_social.deliveries
for each row execute function cam_social.assign_music();
revoke all on function cam_social.assign_music() from public,anon,authenticated;

-- Any already queued video jobs, if present, receive an immutable assignment.
-- Only queued deliveries are backfilled, never accepted/published/history.
update cam_social.deliveries d
set music_track_slug=(
  select t.slug from cam_social.music_tracks t
  where t.enabled and t.license='CC0'
  order by (select count(*) from cam_social.deliveries u where u.music_track_slug=t.slug),
           random() limit 1
)
where d.network in ('instagram','tiktok') and d.status='queued'
  and d.music_track_slug is null;

-- Anonymous worker can read ONLY visible queued editorial metadata and the
-- authorized CC0 URL; it does not get database writes, accounts or keys.
create or replace function public.cam_social_video_jobs(max_jobs integer default 8)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'event_key',j.event_key, 'network',j.network,
   'title',j.payload->>'title', 'image_url',j.payload->>'image_url',
   'style',coalesce(j.payload->>'style','news'), 'kicker',j.payload->>'kicker',
   'track_slug',j.track_slug, 'music_url',j.source_url
 ) order by j.created_at,j.network),'[]'::jsonb)
 from (
   select e.event_key,e.payload,e.created_at,d.network,
          t.slug as track_slug,t.source_url
   from cam_social.deliveries d
   join cam_social.events e using(event_key)
   join cam_social.channels c using(network)
   join cam_social.music_tracks t on t.slug=d.music_track_slug
   join cam_social.settings s on s.id=true
   where d.network in ('instagram','tiktok') and d.status='queued'
     and c.enabled and t.enabled and t.license='CC0'
     and s.enabled and s.activated_at is not null and e.created_at>=s.activated_at
     and cam_social.source_visible(e)
   order by e.created_at,d.network
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
   -- TikTok and Instagram must wait for the MP4 with embedded audio. The public
   -- video is rendered by the scheduled GitHub worker. A one-byte HTTP range
   -- request verifies the deployed MP4 before Buffer is asked to publish.
   if d.network in ('tiktok','instagram') then
     -- Never publish legacy synthesized audio or an unassigned/unlicensed clip.
     if d.music_track_slug is null or not exists (
       select 1 from cam_social.music_tracks mt
       where mt.slug=d.music_track_slug and mt.enabled and mt.license='CC0'
     ) then
       update cam_social.deliveries set available_at=now()+interval '5 minutes',
         error='Sin pista musical autorizada; publicación de vídeo en espera.',
         updated_at=now() where id=d.id;
       continue;
     end if;
     video_url:='https://camsports.github.io/assets/social-videos/'||md5(d.event_key||':'||d.network)||'.mp4';
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
       or coalesce(lower(v.headers->>'content-type'),lower(v.headers->>'Content-Type'),lower(v.content_type),'') not like 'video/mp4%' then
       update cam_social.deliveries set video_check_request_id=null,video_check_at=null,
         available_at=now()+interval '4 minutes',error='Esperando archivo MP4 público con música',
         updated_at=now() where id=d.id;
       continue;
     end if;
   end if;
   input:=jsonb_build_object('channelId',d.channel_id,'schedulingType','automatic','mode','shareNow',
     'text',case when d.network='twitter' then d.payload->>'x_text'
       when d.network='instagram' then coalesce(d.payload->>'instagram_text',d.payload->>'tiktok_text')
       else d.payload->>'tiktok_text' end,
     'assets',jsonb_build_array(jsonb_build_object('image',jsonb_build_object('url',d.payload->>'image_url'))));
   if d.network in ('tiktok','instagram') then
     input:=input||jsonb_build_object('assets',jsonb_build_array(
       jsonb_build_object('video',jsonb_build_object('url',video_url,
         'metadata',jsonb_build_object('thumbnailOffset',2000)))));
     if d.network='instagram' then
       input:=input||jsonb_build_object('metadata',jsonb_build_object('instagram',
         jsonb_build_object('type','reel','shouldShareToFeed',true)));
     else
       input:=input||jsonb_build_object('metadata',jsonb_build_object('tiktok',
         jsonb_build_object('title',left(d.payload->>'title',80))));
     end if;
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


revoke all on function cam_social.dispatch() from public,anon,authenticated;
notify pgrst,'reload schema';
