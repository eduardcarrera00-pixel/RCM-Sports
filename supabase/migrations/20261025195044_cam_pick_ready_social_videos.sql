-- Prepare once, then publish each new Pick without waiting for a GitHub renderer.
-- The flag stays off until all public MP4s have been deployed and verified.
set lock_timeout='3s';
set statement_timeout='30s';

alter table cam_social.settings
  add column if not exists pick_media_cache_enabled boolean not null default false;

create table if not exists cam_social.ready_pick_videos (
  image_key text not null check(image_key in ('picks','football','champion')),
  track_slug text not null references cam_social.music_tracks(slug),
  video_url text not null check(video_url ~ '^https://camsports[.]github[.]io/assets/social-videos/pick-v1-[a-z0-9-]+[.]mp4$'),
  primary key(image_key,track_slug)
);
create index if not exists cam_ready_pick_music_idx on cam_social.ready_pick_videos(track_slug);
alter table cam_social.ready_pick_videos enable row level security;
revoke all on cam_social.ready_pick_videos from public,anon,authenticated;

insert into cam_social.ready_pick_videos(image_key,track_slug,video_url)
select a.image_key,m.slug,
  'https://camsports.github.io/assets/social-videos/pick-v1-'||a.image_key||'-'||m.slug||'.mp4'
from (values('picks'),('football'),('champion')) a(image_key)
cross join cam_social.music_tracks m
where m.slug in ('adventure','arpent','backbeat','battle-ready','beat-one','chronos',
  'fireworks','hippety-hop','limit-70','motions') and m.license='CC0'
on conflict do nothing;

create or replace function cam_social.ready_pick_video_url(
  source_table text, payload jsonb, track text
) returns text language sql stable set search_path='' as $function$
  select v.video_url
  from cam_social.ready_pick_videos v
  join cam_social.music_tracks t on t.slug=v.track_slug and t.enabled and t.license='CC0'
  join cam_social.settings s on s.id and s.pick_media_cache_enabled
  where source_table='ae_editorial_weekly_picks' and v.track_slug=track
    and v.image_key=case when payload->>'brand_image_key' in ('picks','football','champion')
      then payload->>'brand_image_key' else 'picks' end;
$function$;
revoke all on function cam_social.ready_pick_video_url(text,jsonb,text) from public,anon,authenticated;

-- Preserve the current dispatcher, including newer result/confirmation behavior.
-- Change only the media URL; visibility, licensing, HTTP verification, rate
-- limits and duplicate/uncertain-send guards continue to run as before.
do $migration$
declare definition text;
  old_url text := $needle$video_url:='https://camsports.github.io/assets/social-videos/'||md5(d.event_key||':'||d.network)||'.mp4';$needle$;
  new_url text := $replacement$video_url:=coalesce(cam_social.ready_pick_video_url(d.source_table,d.payload,d.music_track_slug),
       'https://camsports.github.io/assets/social-videos/'||md5(d.event_key||':'||d.network)||'.mp4');$replacement$;
begin
  definition:=pg_get_functiondef('cam_social.dispatch()'::regprocedure);
  if strpos(definition,'cam_social.ready_pick_video_url(')=0 then
    if strpos(definition,old_url)=0 then raise exception 'Unexpected social dispatcher; inspect before migrating'; end if;
    execute replace(definition,old_url,new_url);
  end if;
  definition:=pg_get_functiondef('public.cam_social_video_jobs(integer)'::regprocedure);
  if strpos(definition,'cam_social.ready_pick_video_url(')=0 then
    if strpos(definition,'and cam_social.source_visible(e)')=0 then
      raise exception 'Unexpected media worker; inspect before migrating';
    end if;
    execute replace(definition,'and cam_social.source_visible(e)',
      'and cam_social.source_visible(e) and cam_social.ready_pick_video_url(e.source_table,e.payload,d.music_track_slug) is null');
  end if;
end $migration$;

-- No historical event, delivery, result, authorization or channel is changed.
notify pgrst,'reload schema';
