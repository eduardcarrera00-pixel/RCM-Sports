-- CAM Sports: administrator-confirmed editorial Pick results.
-- Requires 19_cam_social_publication.sql. No backfill or automatic outcome guesses.
create table if not exists cam_social.weekly_results (
 pick_id uuid primary key references public.ae_editorial_weekly_picks(id),
 outcome text not null check(outcome in ('won','lost')),
 resolved_at timestamptz not null default now(),
 resolved_by uuid not null references auth.users(id),
 snapshot jsonb not null
);
alter table cam_social.weekly_results enable row level security;
revoke all on cam_social.weekly_results from public,anon,authenticated;

-- Public reads expose only the editorial snapshot, never the administrator or queue.
create or replace function public.cam_weekly_pick_result(p_pick_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select r.snapshot||jsonb_build_object('outcome',r.outcome,'resolved_at',r.resolved_at)
 from cam_social.weekly_results r where r.pick_id=p_pick_id;
$$;
revoke all on function public.cam_weekly_pick_result(uuid) from public;
grant execute on function public.cam_weekly_pick_result(uuid) to anon,authenticated;

create or replace function public.cam_admin_weekly_results(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'Página no válida'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
   select p.id,p.title,p.event_name,p.selection,p.american_odds,p.created_at,p.expires_at,p.is_published,
     r.outcome,r.resolved_at,
     coalesce((select jsonb_agg(jsonb_build_object('network',d.network,'status',d.status,'url',d.external_url))
       from cam_social.deliveries d where d.event_key='weekly-won:'||p.id::text),'[]'::jsonb) as social
   from public.ae_editorial_weekly_picks p left join cam_social.weekly_results r on r.pick_id=p.id
   order by p.created_at desc,p.id desc limit 30 offset p_offset
 ) t),'[]'::jsonb);
end $$;
revoke all on function public.cam_admin_weekly_results(integer) from public,anon;
grant execute on function public.cam_admin_weekly_results(integer) to authenticated;

-- Result events remain valid after the original recommendation expires or is replaced.
create or replace function cam_social.source_visible(p_event cam_social.events) returns boolean
language plpgsql stable set search_path='' as $$
begin
 case p_event.source_table
 when 'articles' then return exists(select 1 from public.articles where id::text=p_event.source_id and is_public);
 when 'ae_editorial_weekly_picks' then return exists(select 1 from public.ae_editorial_weekly_picks
   where id::text=p_event.source_id and is_published and expires_at>now());
 when 'ae_editorial_weekly_pick_results' then return exists(select 1 from cam_social.weekly_results
   where pick_id::text=p_event.source_id and outcome='won');
 when 'nfl_rankings' then return exists(select 1 from public.nfl_rankings where id::text=p_event.source_id and edition=p_event.edition);
 when 'champions_rankings' then return exists(select 1 from public.champions_rankings where id::text=p_event.source_id and edition=p_event.edition);
 else return false;
 end case;
end $$;
revoke all on function cam_social.source_visible(cam_social.events) from public,anon,authenticated;

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
     'x_text',left(detail,120)||case when original_x is not null then E'\nPick original: '||original_x else '' end||E'\n'||link,
     'tiktok_text',left(detail,1800)||E'\n'||link||E'\n#CAMSports',
     'image_url',cam_social.image_url(image),'link',link)) on conflict do nothing;
   insert into cam_social.deliveries(event_key,network)
   select k,network from cam_social.channels where enabled on conflict do nothing;
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
-- Preserve the exact recommendation whose outcome the administrator confirmed.
create or replace function cam_social.lock_resolved_weekly_pick() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if row(new.title,new.event_name,new.selection,new.american_odds,new.analysis,new.banner_path,new.image_path,new.banner_url,new.image_url)
    is distinct from row(old.title,old.event_name,old.selection,old.american_odds,old.analysis,old.banner_path,old.image_path,old.banner_url,old.image_url)
    and exists(select 1 from cam_social.weekly_results where pick_id=old.id) then
   raise exception 'El resultado de este Pick ya está confirmado. Publica un Pick nuevo para otra selección.';
 end if;
 return new;
end $$;
revoke all on function cam_social.lock_resolved_weekly_pick() from public,anon,authenticated;
drop trigger if exists cam_lock_weekly_result on public.ae_editorial_weekly_picks;
create trigger cam_lock_weekly_result before update on public.ae_editorial_weekly_picks
 for each row execute function cam_social.lock_resolved_weekly_pick();
notify pgrst,'reload schema';
