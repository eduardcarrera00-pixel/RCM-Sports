-- Daily promos: add a 13:00 (Toronto) slot and prepare each post 3 hours ahead.
--
-- The 18:00 promo of 2026-10-21 reached TikTok/Instagram 38 minutes late: the
-- event was created 45 minutes before the slot and the two GitHub scheduled
-- workflows (render video, publish site) ran ~50 minutes late. Creating the
-- event 3 hours early gives the video time to be public; deliveries still keep
-- available_at = exact slot time, so nothing is posted early.

insert into cam_social.promo_slots(slot, local_time, images, enabled)
values ('mediodia', '13:00', array[
  'https://camsports.github.io/assets/cam-header-terrace-day.jpg',
  'https://camsports.github.io/assets/cam-footer-village-day.jpg'
], true)
on conflict (slot) do update set local_time = excluded.local_time, images = excluded.images, enabled = true;

create or replace function cam_social.queue_promos(p_now timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
 tz constant text:='America/Toronto';
 s cam_social.settings; sl cam_social.promo_slots; p cam_social.promos;
 local_day date; target timestamptz; k text; last_theme text;
 news_id uuid; news_title text; news_image text;
 title text; xt text; cap text; link text; image text; n int; created jsonb:='[]'::jsonb;
begin
 if not pg_try_advisory_xact_lock(20261021,8) then return '{"busy":true}'::jsonb; end if;
 select * into s from cam_social.settings where id;
 if not found or not s.enabled or s.activated_at is null then return '{"paused":true}'::jsonb; end if;
 local_day:=(p_now at time zone tz)::date;

 for sl in select * from cam_social.promo_slots where enabled order by local_time loop
   target:=(local_day+sl.local_time) at time zone tz;
   continue when p_now<target-interval '3 hours' or p_now>=target+interval '30 minutes';
   k:='promo:'||to_char(local_day,'YYYY-MM-DD')||':'||sl.slot;
   continue when exists(select 1 from cam_social.events where event_key=k);

   select a.id,cam_social.plain(a.title),a.image into news_id,news_title,news_image
   from public.articles a where a.is_public
     and a.created_at>p_now-interval '5 days' and a.created_at<p_now-interval '6 hours'
     and nullif(cam_social.plain(a.title),'') is not null
   order by a.created_at desc limit 1;

   select q.theme into last_theme from cam_social.promos q
   where q.last_used_at is not null order by q.last_used_at desc limit 1;

   select * into p from cam_social.promos q
   where q.active and (q.active_until is null or q.active_until>target)
     and (not q.needs_news or news_id is not null)
   order by (q.theme is not distinct from last_theme), q.last_used_at nulls first, random()
   limit 1;
   continue when not found;

   link:=p.link; image:=sl.images[1+(extract(doy from local_day)::int % greatest(1,cardinality(sl.images)))];
   title:=p.headline; xt:=p.x_text; cap:=p.caption;
   if p.needs_news then
     title:=replace(title,'{noticia}',left(news_title,100));
     xt:=replace(xt,'{noticia}',left(news_title,110));
     cap:=replace(cap,'{noticia}',news_title);
     link:='https://camsports.github.io/?article='||news_id;
     if cam_social.image_url(news_image)<>'https://camsports.github.io/assets/cam-sports-logo.jpeg' then image:=news_image; end if;
   end if;

   insert into cam_social.events(event_key,source_table,source_id,edition,payload,created_at)
   values(k,'promo',p.id,sl.slot,jsonb_build_object(
     'title',left(title,110),
     'kicker',p.kicker,
     'style','promo',
     'x_text',left(xt,240)||E'\n'||link,
     'tiktok_text',left(cap,1500)||E'\n\nEntra a camsports.github.io\n'||p.hashtags,
     'instagram_text',left(cap,1500)||E'\n\nEntra a camsports.github.io\n'||p.hashtags,
     'image_url',cam_social.image_url(image),
     'link',link),p_now)
   on conflict do nothing;
   get diagnostics n=row_count;
   continue when n=0;

   insert into cam_social.deliveries(event_key,network,available_at)
   select k,c.network,target from cam_social.channels c where c.enabled
   on conflict do nothing;

   update cam_social.promos set times_used=times_used+1,last_used_at=p_now where id=p.id;
   created:=created||jsonb_build_object('event',k,'promo',p.id,'at',target);
 end loop;
 return jsonb_build_object('created',created);
end $function$;

-- Every 5 minutes all day: covers every slot in summer and winter time.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'cam-social-promos'),
                      schedule := '*/5 * * * *');
