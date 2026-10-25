-- Apply after deploying the pick-v2 renderer. Only new Picks receive this format.
set lock_timeout='3s';
set statement_timeout='30s';

-- Runs after brand rotation, restoring the actual editor-selected photograph.
create or replace function cam_social.pick_video_payload()
returns trigger language plpgsql security definer set search_path='' as $function$
declare p jsonb; photo text;
begin
  if new.source_table<>'ae_editorial_weekly_picks' then return new; end if;
  select to_jsonb(w) into p from public.ae_editorial_weekly_picks w
  where w.id::text=new.source_id;
  if p is null then return new; end if;
  photo:=case
    when nullif(p->>'image_path','') is not null then
      'https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/'||(p->>'image_path')
    when nullif(p->>'image_url','') is not null then p->>'image_url'
    when nullif(p->>'banner_path','') is not null then
      'https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/'||(p->>'banner_path')
    else nullif(p->>'banner_url','') end;
  new.payload:=new.payload||jsonb_build_object(
    'video_version','pick-v2',
    'event_name',cam_social.plain(p->>'event_name'),
    'selection',regexp_replace(coalesce(p->>'selection',''),'<[^>]*>','','g'),
    'american_odds',(p->>'american_odds')::integer,
    'image_url',case when photo is null then new.payload->>'image_url'
                     else cam_social.image_url(photo) end);
  return new;
end $function$;
revoke all on function cam_social.pick_video_payload() from public,anon,authenticated;
drop trigger if exists cam_social_pick_video_payload on cam_social.events;
create trigger cam_social_pick_video_payload before insert on cam_social.events
for each row execute function cam_social.pick_video_payload();

-- Legacy events keep their existing ready clips. New Picks always render their
-- own photo and complete selection snapshot, even when the cache is enabled.
create or replace function cam_social.ready_pick_video_url(
  source_table text, payload jsonb, track text
) returns text language sql stable set search_path='' as $function$
  select v.video_url from cam_social.ready_pick_videos v
  join cam_social.music_tracks t on t.slug=v.track_slug and t.enabled and t.license='CC0'
  join cam_social.settings s on s.id and s.pick_media_cache_enabled
  where source_table='ae_editorial_weekly_picks' and v.track_slug=track
    and coalesce(payload->>'video_version','')<>'pick-v2'
    and v.image_key=case when payload->>'brand_image_key' in ('picks','football','champion')
      then payload->>'brand_image_key' else 'picks' end;
$function$;
revoke all on function cam_social.ready_pick_video_url(text,jsonb,text) from public,anon,authenticated;

do $migration$
declare definition text;
  old_url text := $needle$'https://camsports.github.io/assets/social-videos/'||md5(d.event_key||':'||d.network)$needle$;
  new_url text := $replacement$'https://camsports.github.io/assets/social-videos/'||case when d.payload->>'video_version'='pick-v2' then 'pick-v2-' else 'safe-v2-' end||md5(d.event_key||':'||d.network)$replacement$;
begin
  definition:=pg_get_functiondef('cam_social.dispatch()'::regprocedure);
  if strpos(definition,'pick-v2-')=0 then
    if strpos(definition,old_url)=0 then raise exception 'Unexpected social dispatcher'; end if;
    execute replace(definition,old_url,new_url);
  end if;
end $migration$;

-- This existing read-only public RPC intentionally exposes only public, queued
-- content and its licensed soundtrack; channel credentials stay private.
create or replace function public.cam_social_video_jobs(max_jobs integer default 8)
returns jsonb language sql stable security definer set search_path='' as $function$
 select coalesce(jsonb_agg(jsonb_build_object(
   'event_key',j.event_key,'network',j.network,
   'title',j.payload->>'title','image_url',j.payload->>'image_url',
   'style',coalesce(j.payload->>'style','news'),'kicker',j.payload->>'kicker',
   'video_version',j.payload->>'video_version',
   'event_name',j.payload->>'event_name','selection',j.payload->>'selection',
   'american_odds',j.payload->'american_odds',
   'track_slug',j.track_slug,'music_url',j.source_url
 ) order by j.created_at,j.network),'[]'::jsonb)
 from (
   select e.event_key,e.payload,e.created_at,d.network,t.slug track_slug,t.source_url
   from cam_social.deliveries d join cam_social.events e using(event_key)
   join cam_social.channels c using(network)
   join cam_social.music_tracks t on t.slug=d.music_track_slug
   join cam_social.settings s on s.id
   where d.network in ('instagram','tiktok') and d.status='queued'
     and c.enabled and t.enabled and t.license='CC0'
     and s.enabled and s.activated_at is not null and e.created_at>=s.activated_at
     and cam_social.source_visible(e)
     and cam_social.ready_pick_video_url(e.source_table,e.payload,d.music_track_slug) is null
   order by e.created_at,d.network
   limit greatest(1,least(coalesce(max_jobs,8),12))
 ) j;
$function$;
revoke all on function public.cam_social_video_jobs(integer) from public,anon,authenticated;
grant execute on function public.cam_social_video_jobs(integer) to anon,authenticated;
-- A check for the old filename cannot validate the new media URL. Preserve the
-- scheduled release time and never touch accepted, sent or uncertain deliveries.
update cam_social.deliveries
set video_check_request_id=null,video_check_at=null,error=null
where network in ('instagram','tiktok') and status='queued';
notify pgrst,'reload schema';
