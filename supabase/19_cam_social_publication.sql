-- CAM Sports -> Buffer. Only public editorial content; no backfill or browser secrets.
-- Prerequisites already enabled in production: pg_net, pg_cron, Supabase Vault.
create schema if not exists cam_social;
revoke all on schema cam_social from public,anon,authenticated;

create table if not exists cam_social.settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  activated_at timestamptz,
  paused_until timestamptz,
  daily_request_limit int not null default 90 check(daily_request_limit between 1 and 90)
);
insert into cam_social.settings(id) values(true) on conflict do nothing;
create table if not exists cam_social.channels (
  network text primary key check(network in ('twitter','tiktok')),
  channel_id text not null,
  enabled boolean not null default true
);
-- Configure verified channel IDs separately after installing this schema.
create table if not exists cam_social.events (
  event_key text primary key,
  source_table text not null,
  source_id text not null,
  edition text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists cam_social.deliveries (
  id bigint generated always as identity primary key,
  event_key text not null references cam_social.events(event_key),
  network text not null references cam_social.channels(network),
  status text not null default 'queued' check(status in
    ('queued','submitting','accepted','published','failed','uncertain','cancelled')),
  attempts int not null default 0,
  request_id bigint,
  buffer_post_id text,
  external_url text,
  error text,
  available_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(event_key,network)
);
create index if not exists cam_social_ready on cam_social.deliveries(available_at,id) where status='queued';
create table if not exists cam_social.requests (
  id bigint primary key,
  created_at timestamptz not null default now()
);
alter table cam_social.settings enable row level security;
alter table cam_social.channels enable row level security;
alter table cam_social.events enable row level security;
alter table cam_social.deliveries enable row level security;
alter table cam_social.requests enable row level security;
revoke all on all tables in schema cam_social from public,anon,authenticated;
revoke all on all sequences in schema cam_social from public,anon,authenticated;

create or replace function cam_social.plain(p_text text) returns text
language sql immutable set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(coalesce(p_text,''),'<[^>]*>',' ','g'),'\s+',' ','g'));
$$;
create or replace function cam_social.image_url(p_url text) returns text
language sql immutable set search_path='' as $$
 select case when p_url ~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$'
   and p_url !~ '[?#]' and p_url ~* '\.(png|jpe?g)$' then p_url
   else 'https://camsports.github.io/assets/cam-sports-logo.jpeg' end;
$$;

create or replace function cam_social.source_visible(p_event cam_social.events) returns boolean
language plpgsql stable set search_path='' as $$
begin
 case p_event.source_table
 when 'articles' then return exists(select 1 from public.articles where id::text=p_event.source_id and is_public);
 when 'ae_editorial_weekly_picks' then return exists(select 1 from public.ae_editorial_weekly_picks
   where id::text=p_event.source_id and is_published and expires_at>now());
 when 'nfl_rankings' then return exists(select 1 from public.nfl_rankings
   where id::text=p_event.source_id and edition=p_event.edition);
 when 'champions_rankings' then return exists(select 1 from public.champions_rankings
   where id::text=p_event.source_id and edition=p_event.edition);
 else return false;
 end case;
end $$;

-- Runs as postgres via cron or the trigger below. Uncertain submissions are NEVER
-- retried automatically: the API has no documented idempotency key.
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
     'assets',jsonb_build_array(jsonb_build_object('image',jsonb_build_object('url',d.payload->>'image_url'))));
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

create or replace function cam_social.capture() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 r jsonb:=to_jsonb(new); prev jsonb; k text; title text; detail text; caption text;
 link text; image text; edition text; ready boolean; team_list text;
begin
 if tg_op='UPDATE' then prev:=to_jsonb(old); end if;
 -- Do not backfill content while setup is incomplete or deliberately paused.
 if not exists(select 1 from cam_social.settings where id and enabled and activated_at is not null) then return new; end if;
 case tg_table_name
 when 'articles' then
   ready:=coalesce((r->>'is_public')::boolean,false);
   k:='article:'||(r->>'id');
   if tg_op='UPDATE' and coalesce((prev->>'is_public')::boolean,false) then return new; end if;
   title:=cam_social.plain(r->>'title');
   detail:=cam_social.plain(r->>'summary'); caption:='Nueva noticia';
   link:='https://camsports.github.io/?article='||(r->>'id');
   image:=r->>'image';
 when 'ae_editorial_weekly_picks' then
   ready:=coalesce((r->>'is_published')::boolean,false) and (r->>'expires_at')::timestamptz>now();
   k:='weekly:'||(r->>'id');
   if tg_op='UPDATE' and coalesce((prev->>'is_published')::boolean,false) then return new; end if;
   title:=cam_social.plain(r->>'title'); caption:='Pick de la Semana';
   detail:=cam_social.plain(r->>'event_name')||E'\n'||cam_social.plain(r->>'selection')||' · Cuota '||
     case when (r->>'american_odds')::int>0 then '+' else '' end||(r->>'american_odds');
   link:='https://camsports.github.io/?weeklyPick='||(r->>'id');
   image:=coalesce(nullif(r->>'image_url',''),nullif(r->>'banner_url',''));
   if nullif(r->>'image_path','') is not null then image:='https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/'||(r->>'image_path');
   elsif nullif(r->>'banner_path','') is not null then image:='https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/'||(r->>'banner_path'); end if;
 when 'nfl_rankings','champions_rankings' then
   ready:=jsonb_array_length(r->'team_ids')=10;
   edition:=r->>'edition';
   k:=tg_table_name||':'||coalesce(r->>'season','')||':'||edition;
   title:='Power Rankings '||case when tg_table_name='nfl_rankings' then 'NFL' else 'Champions' end;
   caption:=cam_social.plain(edition); link:='https://camsports.github.io/';
   if tg_table_name='nfl_rankings' then
     select string_agg(t.ord||'. '||coalesce(n.name,t.id),E'\n' order by t.ord) into team_list
     from jsonb_array_elements_text(r->'team_ids') with ordinality t(id,ord) left join public.nfl_teams n on n.id=t.id;
   else
     select string_agg(t.ord||'. '||coalesce(c.name,t.id),E'\n' order by t.ord) into team_list
     from jsonb_array_elements_text(r->'team_ids') with ordinality t(id,ord) left join public.champions_clubs c on c.id=t.id and c.season=r->>'season';
   end if;
   detail:=team_list;
 else return new;
 end case;
 if not coalesce(ready,false) then return new; end if;
 insert into cam_social.events(event_key,source_table,source_id,edition,payload)
 values(k,tg_table_name,r->>'id',edition,jsonb_build_object('title',title,
   -- At most 120 Unicode characters + one t.co link: also fits scripts
   -- for which X counts each character twice.
   'x_text',left(caption||E'\n'||title||E'\n'||detail,120)||E'\n'||link,
   'tiktok_text',left(caption||E'\n'||title||E'\n'||detail,1800)||E'\n'||link||E'\n#CAMSports',
   'image_url',cam_social.image_url(image),'link',link)) on conflict do nothing;
 insert into cam_social.deliveries(event_key,network)
 select k,network from cam_social.channels where enabled on conflict do nothing;
 -- Enqueue pg_net work now; the actual HTTP only starts after commit.
 perform cam_social.dispatch();
 return new;
exception when others then
 -- Sharing failures must never discard the editor's article or Pick.
 raise warning 'CAM social capture failed (SQLSTATE %). Check the publication queue.',sqlstate;
 return new;
end $$;

drop trigger if exists cam_social_article on public.articles;
create trigger cam_social_article after insert or update on public.articles for each row execute function cam_social.capture();
drop trigger if exists cam_social_weekly on public.ae_editorial_weekly_picks;
create trigger cam_social_weekly after insert or update on public.ae_editorial_weekly_picks for each row execute function cam_social.capture();
drop trigger if exists cam_social_nfl on public.nfl_rankings;
create trigger cam_social_nfl after insert or update on public.nfl_rankings for each row execute function cam_social.capture();
drop trigger if exists cam_social_champions on public.champions_rankings;
create trigger cam_social_champions after insert or update on public.champions_rankings for each row execute function cam_social.capture();

-- Read-only status for authenticated editors. The key itself is never returned.
create or replace function public.cam_social_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 return jsonb_build_object('enabled',(select enabled from cam_social.settings where id),
   'has_buffer_key',exists(select 1 from vault.secrets where name='cam_buffer_api_key'),
   'paused_until',(select paused_until from cam_social.settings where id),
   'channels',(select jsonb_agg(to_jsonb(c)) from cam_social.channels c),
   'recent',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from
     (select q.event_key,q.network,q.status,q.buffer_post_id,q.external_url,q.error,q.updated_at
      from cam_social.deliveries q order by q.id desc limit 30) d));
end $$;
revoke all on all functions in schema cam_social from public,anon,authenticated;
revoke all on function public.cam_social_status() from public,anon,authenticated;
grant execute on function public.cam_social_status() to authenticated;
select cron.schedule('cam-social-dispatch','* * * * *','select cam_social.dispatch();');
notify pgrst,'reload schema';
