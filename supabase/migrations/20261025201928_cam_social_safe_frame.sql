-- Run after the thirty safe-frame clips are publicly verified.
set lock_timeout='3s';
set statement_timeout='15s';
update cam_social.ready_pick_videos
set video_url=replace(video_url,'/pick-v1-','/pick-v1-safe-')
where video_url ~ '/pick-v1-(picks|football|champion)-';
-- Only unsent video checks may be refreshed; never resend an accepted post.
update cam_social.deliveries d
set available_at=now(),video_check_request_id=null,video_check_at=null,error=null
from cam_social.events e
where e.event_key=d.event_key and e.source_table='ae_editorial_weekly_picks'
 and d.network in ('instagram','tiktok') and d.status='queued';
