-- Owner policy: website publication is automatic only on X. Instagram and
-- TikTok are manual. Keep historical deliveries and the manual share tools.
-- Filename matches the version recorded by the production migration service.
update cam_social.channels set enabled=false
where network in ('instagram','tiktok') and enabled;

update cam_social.deliveries
set status='cancelled',
    error='Publicación automática desactivada por el propietario; publicación manual.',
    updated_at=now()
where network in ('instagram','tiktok') and status in ('queued','failed');

-- Stop new non-X jobs even if a legacy producer enumerates all channels.
-- Run before music assignment; old records can still be confirmed/audited.
create or replace function cam_social.x_only_delivery()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.network <> 'twitter' then return null; end if;
  return new;
end $$;
revoke all on function cam_social.x_only_delivery() from public,anon,authenticated;
drop trigger if exists cam_social_00_x_only_delivery on cam_social.deliveries;
create trigger cam_social_00_x_only_delivery before insert on cam_social.deliveries
for each row execute function cam_social.x_only_delivery();

-- Preserve the installed dispatcher's rate limits, confirmation handling and
-- protection against ambiguous sends. Harden its selection independently of
-- the channel flag. Do not resurrect or resend historical posts.
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('cam_social.dispatch()'::regprocedure);
  if strpos(definition,$needle$q.network='twitter'$needle$)=0 then
    if strpos(definition,'q.available_at<=now() and c.enabled')=0 then
      raise exception 'Unexpected dispatcher; inspect before applying X-only policy';
    end if;
    execute replace(definition,'q.available_at<=now() and c.enabled',
      $replacement$q.available_at<=now() and c.enabled and q.network='twitter'$replacement$);
  end if;

  definition:=pg_get_functiondef('cam_social.source_visible(cam_social.events)'::regprocedure);
  if strpos(definition,$needle$when 'daily_plate'$needle$)=0 then
    if strpos(definition,'else return false;')=0 then
      raise exception 'Unexpected visibility guard; inspect before adding daily plates';
    end if;
    execute replace(definition,'else return false;', $replacement$
 when 'daily_plate' then return
   p_event.edition in ('best','worst')
   and (p_event.created_at at time zone 'America/Toronto')::date
       = (now() at time zone 'America/Toronto')::date
   and exists(select 1 from public.ae_community_picks p
     where p.id::text=p_event.source_id and not p.hidden
       and p.moderation_status in ('pending','approved'));
 else return false;$replacement$);
  end if;
end $migration$;

-- Called by the two daily ChatGPT automations. There is deliberately no
-- second pg_cron schedule for the same two posts. Existing dispatch/confirmation
-- crons continue to operate the shared queue.
create or replace function cam_social.queue_daily_plate(
  p_kind text, p_now timestamptz default now()
) returns jsonb language plpgsql set search_path='' as $function$
declare
  tz constant text:='America/Toronto';
  s cam_social.settings; chosen record; local_day date; target timestamptz;
  v_event_key text; label text; selection text; copy text; link text;
  image text; n integer;
begin
  if p_kind is null or p_kind not in ('best','worst') or p_now is null then
    raise exception 'Expected best or worst and a timestamp';
  end if;
  local_day:=(p_now at time zone tz)::date;
  target:=(local_day + case p_kind when 'best' then time '11:00'
                                            else time '15:00' end) at time zone tz;
  if p_now<target or p_now>=target+interval '1 hour' then
    return jsonb_build_object('status','outside_window');
  end if;
  if not pg_try_advisory_xact_lock(20261109,
      case p_kind when 'best' then 11 else 15 end) then
    return jsonb_build_object('status','busy');
  end if;
  select * into s from cam_social.settings where id;
  if not found or not s.enabled or s.activated_at is null
     or s.paused_until>p_now then
    return jsonb_build_object('status','paused');
  end if;
  if not exists(select 1 from cam_social.channels
                where network='twitter' and enabled) then
    return jsonb_build_object('status','x_disabled');
  end if;

  v_event_key:='daily-plate:'||to_char(local_day,'YYYY-MM-DD')||':'||p_kind;
  if exists(select 1 from cam_social.events e where e.event_key=v_event_key) then
    return jsonb_build_object('status','already_queued','event_key',v_event_key);
  end if;

  -- Same ranking as community-picks.js/loadChefLists, frozen at the send time:
  -- this publication week, visible, pending/approved, signed vote balance;
  -- primary vote count, oldest creation, then UUID break ties. Settled Picks
  -- stay eligible, just as they do in the website's weekly tables.
  select f.* into chosen from public.ae_pick_feed f
  where not f.hidden and f.moderation_status in ('pending','approved')
    and f.created_at >= date_trunc('week',p_now at time zone tz) at time zone tz
    and f.created_at <= p_now
    and case p_kind when 'best' then f.score>0 else f.score<0 end
  order by case when p_kind='best' then -f.score else f.score end,
           case when p_kind='best' then -f.upvotes else -f.downvotes end,
           f.created_at, f.id
  limit 1;
  if not found then
    return jsonb_build_object('status','no_candidate');
  end if;

  label:=case p_kind when 'best' then 'Mejor plato del día'
                              else 'Peor plato del día' end;
  select string_agg(cam_social.plain(leg->>'selection'),' + ' order by ord)
    into selection from jsonb_array_elements(chosen.legs) with ordinality x(leg,ord);
  link:='https://camsports.github.io/?s=picks&pick='||chosen.id::text;
  -- At most 120 Unicode characters plus one t.co link, matching the existing
  -- safe X budget. The direct Pick link retains every parlay selection.
  copy:=left(label||' · por votos'||E'\n@'||
    left(ltrim(cam_social.plain(chosen.author),'@'),24)||E'\n'||
    left(cam_social.plain(chosen.title),40)||E'\n'||
    case when chosen.american_odds>0 then '+' else '' end||
    chosen.american_odds::text||' · '||left(coalesce(selection,''),45),120)||E'\n'||link;
  image:='https://camsports.github.io/assets/social-brand/picks.jpg';

  insert into cam_social.events(event_key,source_table,source_id,edition,payload,created_at)
  values(v_event_key,'daily_plate',chosen.id::text,p_kind,jsonb_build_object(
    'title',label,'x_text',copy,'link',link,'image_url',image,
    'pick_id',chosen.id,'author',chosen.author,'pick_title',chosen.title,
    'selection',selection,'american_odds',chosen.american_odds,
    'score',chosen.score,'upvotes',chosen.upvotes,'downvotes',chosen.downvotes,
    'snapshot_at',p_now,'timezone',tz),p_now)
  on conflict do nothing;
  get diagnostics n=row_count;
  if n=0 then
    return jsonb_build_object('status','already_queued','event_key',v_event_key);
  end if;
  insert into cam_social.deliveries(event_key,network,available_at)
    values(v_event_key,'twitter',target) on conflict do nothing;
  -- Reuse the normal publisher; HTTP work starts only after transaction commit.
  perform cam_social.dispatch();
  return jsonb_build_object('status','queued','event_key',v_event_key,
    'pick_id',chosen.id,'label',label,'score',chosen.score);
end $function$;
revoke all on function cam_social.queue_daily_plate(text,timestamptz)
  from public,anon,authenticated;

comment on function cam_social.queue_daily_plate(text,timestamptz) is
  'X only: snapshot the current weekly vote leader daily at 11:00 best / 15:00 worst, America/Toronto. Private automation entrypoint; one event per local date and kind.';
