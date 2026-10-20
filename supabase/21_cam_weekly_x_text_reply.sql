-- X outcome notices are short text replies, never standalone photo posts.
-- Buffer does not support replying to an existing X post: require the official
-- prepared reply composer, without pretending that opening it publishes anything.
alter table cam_social.deliveries drop constraint deliveries_status_check;
alter table cam_social.deliveries add constraint deliveries_status_check check(status in
 ('queued','submitting','accepted','published','failed','uncertain','cancelled','manual_reply'));

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
     'x_text','✅ Pick acertado · Pick de la Semana',
     'x_reply_to',original_x,'x_assets','[]'::jsonb,
     'tiktok_text',left(detail,1800)||E'\n'||link||E'\n#CAMSports',
     'image_url',cam_social.image_url(image),'link',link)) on conflict do nothing;
   insert into cam_social.deliveries(event_key,network,status)
   select k,network,case when network='twitter' then 'manual_reply' else 'queued' end
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

-- Only unsent queued X outcomes are moved to manual reply. Published/submitted
-- posts are untouched. Standard Pick announcements keep their automatic sharing.
update cam_social.events e set payload=e.payload||jsonb_build_object(
 'x_text','✅ Pick acertado · Pick de la Semana','x_assets','[]'::jsonb,
 'x_reply_to',(select external_url from cam_social.deliveries d where d.event_key='weekly:'||e.source_id
              and d.network='twitter' and d.status='published'))
where e.source_table='ae_editorial_weekly_pick_results'
 and exists(select 1 from cam_social.deliveries d where d.event_key=e.event_key and d.network='twitter' and d.status='queued');
update cam_social.deliveries d set status='manual_reply',error=null,updated_at=now()
from cam_social.events e where e.event_key=d.event_key and e.source_table='ae_editorial_weekly_pick_results'
 and d.network='twitter' and d.status='queued';
notify pgrst,'reload schema';
