-- Maintenance and timed publication run in Postgres, without language-model calls.
create schema if not exists cam_editorial;
revoke all on schema cam_editorial from public, anon, authenticated;

create table public.cam_live_revisions (
  channel text primary key,
  revision bigint not null default 0
);
alter table public.cam_live_revisions enable row level security;
revoke all on public.cam_live_revisions from public, anon, authenticated;
grant select on public.cam_live_revisions to anon, authenticated;
create policy cam_live_public_read on public.cam_live_revisions for select
  to anon, authenticated using (true);
insert into public.cam_live_revisions(channel) values
  ('takes'),('picks'),('news'),('community'),('scores');

create function public.cam_read_live_revisions()
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(channel,revision::text),'{}'::jsonb)
  from public.cam_live_revisions;
$$;
revoke all on function public.cam_read_live_revisions() from public;
grant execute on function public.cam_read_live_revisions() to anon, authenticated;

create function cam_editorial.bump_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.cam_live_revisions set revision=revision+1 where channel=TG_ARGV[0];
  return null;
end;
$$;
revoke all on function cam_editorial.bump_revision() from public, anon, authenticated;

do $$
declare item record;
begin
  for item in select * from (values
    ('ae_free_takes','takes'),('ae_free_take_votes','takes'),
    ('ae_take_replies','takes'),('ae_take_reply_votes','takes'),
    ('ae_take_results','takes'),('ae_take_classifications','takes'),
    ('ae_community_picks','picks'),('ae_pick_votes','picks'),
    ('ae_pick_comments','picks'),('ae_pick_comment_votes','picks'),
    ('articles','news'),('comments','community'),('comment_votes','community'),
    ('article_likes','community'),('nfl_rankings','community'),
    ('cam_nfl_games','scores'),('cam_football_games','scores'),
    ('cam_nfl_picks','scores'),('cam_football_picks','scores')
  ) as channels(table_name,channel)
  loop
    if to_regclass('public.'||item.table_name) is not null then
      execute format('create trigger cam_live_revision after insert or update or delete on public.%I for each statement execute function cam_editorial.bump_revision(%L)',item.table_name,item.channel);
    end if;
  end loop;
end;
$$;

-- Explicit server-side ownership allowlist. No authorization uses user-editable metadata.
create table cam_editorial.authors (
  user_id uuid primary key references auth.users(id),
  username text not null unique
);
alter table cam_editorial.authors enable row level security;
insert into cam_editorial.authors(user_id,username)
select a.user_id,a.username from public.ae_auth_accounts a
where (a.user_id,a.username) in (
  ('36bbfda8-6ec6-46e3-acff-71713103990c'::uuid,'sf_49ers'),
  ('52052f29-f8d9-4aee-aaf8-2d8b3d7fd514'::uuid,'bianconera_7'),
  ('1f9bfffc-77cd-470b-a04c-ba7a9005b165'::uuid,'colchonero_sur'),
  ('cda7a193-22cb-408e-9468-b51a46bbde3e'::uuid,'tribuna_azteca'),
  ('dd267052-9f0a-4316-b91e-e0cd2c4b731d'::uuid,'cityzen_10'),
  ('b203e97e-7c75-4543-a2af-0e579b3d9913'::uuid,'kingdom_chiefs'),
  ('7e55129f-1781-4f04-aa3a-8241373311c3'::uuid,'buffalo_mafia'),
  ('b3e20149-75f7-48de-b6bd-ab35f1355a49'::uuid,'cule_1899'),
  ('71ab72b6-9385-41a7-8d90-59e2abb09f08'::uuid,'gunner_norte'),
  ('47a0cc24-fddc-43c6-afe8-90bf56191914'::uuid,'fly_eagles'),
  ('97d53e92-1748-4285-9e8a-c54d7d7d9e8e'::uuid,'madridista_en_serie'),
  ('7af203de-967a-4cd4-bd9c-0e31ca75267a'::uuid,'flock_baltimore'),
  ('0a0cdf6a-bf73-4747-8847-d91ed717b6ef'::uuid,'greenbay_12'),
  ('4aa49b53-2ef9-46d5-8ffc-1b83bfe1cea0'::uuid,'reddevil_77')
);

create table cam_editorial.queue (
  id uuid primary key default gen_random_uuid(),
  queue_key text not null unique,
  kind text not null check (kind in ('take','pick')),
  author_id uuid not null references cam_editorial.authors(user_id),
  payload jsonb not null,
  publish_at timestamptz not null,
  expires_at timestamptz not null check (expires_at>publish_at),
  status text not null default 'scheduled' check (status in ('scheduled','published','expired','failed')),
  published_id uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
alter table cam_editorial.queue enable row level security;
create index cam_editorial_queue_due on cam_editorial.queue(publish_at) where status='scheduled';
revoke all on all tables in schema cam_editorial from public, anon, authenticated;

create function cam_editorial.enqueue(
  p_key text,p_kind text,p_author uuid,p_payload jsonb,
  p_publish_at timestamptz,p_expires_at timestamptz
) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved uuid; field text; body_text text;
begin
  perform pg_advisory_xact_lock(hashtext('CAM SPORTS editorial queue v1'));
  -- Repeated requests never overwrite an already scheduled or published item.
  select id into saved from cam_editorial.queue where queue_key=p_key;
  if saved is not null then return saved; end if;
  if p_key is null or length(p_key) not between 8 and 160
    or p_kind is null or p_kind not in ('take','pick')
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_publish_at is null or p_expires_at is null
    or p_publish_at>now()+interval '3 days' or p_publish_at<now()-interval '1 hour'
    or p_expires_at<=greatest(p_publish_at,now())
    or p_expires_at>p_publish_at+interval '7 days' then
    raise exception 'Revisa la clave, contenido y ventana de publicación';
  end if;
  if not exists(select 1 from cam_editorial.authors e join public.ae_auth_accounts a
    on a.user_id=e.user_id and a.username=e.username where e.user_id=p_author) then
    raise exception 'Autor editorial no autorizado';
  end if;
  if coalesce(length(trim(p_payload->>'title')),0) not between 5 and 160
    or coalesce(jsonb_typeof(p_payload->'sources'),'null')<>'array' then
    raise exception 'Faltan título o fuentes';
  end if;
  if jsonb_array_length(p_payload->'sources')=0 or exists(
    select 1 from jsonb_array_elements(p_payload->'sources') source
    where coalesce(source->>'url','') !~ '^https://[^ /]+'
      or coalesce(source->>'checked_at','')=''
  ) then raise exception 'Se requieren fuentes HTTPS consultadas y fechadas'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'sources') source
    where (source->>'checked_at')::timestamptz>now()+interval '5 minutes'
      or (source->>'checked_at')::timestamptz<now()-interval '24 hours') then
    raise exception 'Las fuentes requieren una consulta reciente';
  end if;
  if (select count(*) from cam_editorial.queue where kind=p_kind
      and (publish_at at time zone 'America/Toronto')::date=(p_publish_at at time zone 'America/Toronto')::date)
      >=(case when p_kind='take' then 2 else 5 end) then
    raise exception 'Tanda diaria completa';
  end if;
  if p_kind='take' then
    if coalesce(p_payload->>'sport','') not in ('nfl','football') then raise exception 'Deporte inválido'; end if;
    foreach field in array array['thesis','evidence','reasoning','counterargument','resolution'] loop
      if coalesce(length(trim(p_payload->>field)),0)<20 then
        raise exception 'Falta desarrollar %',field;
      end if;
    end loop;
    body_text:=concat_ws(E'\n\n',p_payload->>'thesis',p_payload->>'evidence',p_payload->>'reasoning',
      p_payload->>'counterargument',p_payload->>'resolution','Editorial CAM SPORTS.');
    if length(body_text)>1800 then raise exception 'Take demasiado largo'; end if;
    p_payload:=p_payload||jsonb_build_object('body',body_text);
  else
    if coalesce(jsonb_typeof(p_payload->'legs'),'null')<>'array' then raise exception 'Selecciones inválidas'; end if;
    if jsonb_array_length(p_payload->'legs') not between 1 and 2
      or coalesce(length(trim(p_payload->>'explanation')),0) not between 20 and 1900
      or coalesce(p_payload->>'event_date','')='' then raise exception 'Pick incompleto'; end if;
  end if;
  insert into cam_editorial.queue(queue_key,kind,author_id,payload,publish_at,expires_at)
    values(p_key,p_kind,p_author,p_payload,p_publish_at,p_expires_at) returning id into saved;
  return saved;
end;
$$;

create function cam_editorial.tick()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item record; saved uuid; published integer:=0; expired integer:=0;
  prior_claims text:=current_setting('request.jwt.claims',true); err text;
begin
  if not pg_try_advisory_xact_lock(hashtext('CAM SPORTS editorial queue v1')) then
    return jsonb_build_object('status','busy');
  end if;
  update cam_editorial.queue set status='expired'
    where status='scheduled' and expires_at<=statement_timestamp();
  get diagnostics expired=ROW_COUNT;
  for item in select * from cam_editorial.queue
    where status='scheduled' and publish_at<=statement_timestamp()
      and expires_at>statement_timestamp() order by publish_at,id limit 7 for update skip locked
  loop
    begin
      if not exists(select 1 from cam_editorial.authors e join public.ae_auth_accounts a
        on a.user_id=e.user_id and a.username=e.username where e.user_id=item.author_id) then
        raise exception 'La identidad editorial cambió';
      end if;
      if item.kind='pick' then
        -- Normal publication must still validate the current fixture and locked odds.
        if exists(select 1 from jsonb_array_elements(item.payload->'legs') leg
          where coalesce(leg->>'source_kickoff','')='' or
            (leg->>'source_kickoff')::timestamptz<=statement_timestamp()+interval '1 hour') then
          update cam_editorial.queue set status='expired',last_error='Encuentro demasiado próximo' where id=item.id;
          expired:=expired+1; continue;
        end if;
      elsif coalesce(item.payload->>'source_game_id','')<>'' then
        if not exists(
          select 1 from public.cam_nfl_games where id=item.payload->>'source_game_id'
            and item.payload->>'sport'='nfl' and status='scheduled' and kickoff>statement_timestamp()
          union all
          select 1 from public.cam_football_games where id=item.payload->>'source_game_id'
            and item.payload->>'sport'='football' and status='scheduled' and kickoff>statement_timestamp()
        ) then
          update cam_editorial.queue set status='expired',last_error='El encuentro ya no admite una previa' where id=item.id;
          expired:=expired+1; continue;
        end if;
      end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',item.author_id::text,
        'role','authenticated','is_anonymous',false)::text,true);
      execute 'set local role authenticated';
      if item.kind='take' then
        saved:=public.ae_post_free_take(item.payload->>'sport',item.payload->>'title',
          item.payload->>'body',item.payload->>'competition');
      else
        insert into public.ae_community_picks(title,explanation,legs,event_date)
          values(item.payload->>'title',item.payload->>'explanation',item.payload->'legs',
            (item.payload->>'event_date')::date) returning id into saved;
      end if;
      execute 'reset role';
      perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
      update cam_editorial.queue set status='published',published_id=saved,published_at=statement_timestamp(),
        attempts=attempts+1,last_error=null where id=item.id;
      published:=published+1;
    exception when others then
      get stacked diagnostics err=MESSAGE_TEXT;
      execute 'reset role';
      perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
      update cam_editorial.queue set attempts=attempts+1,last_error=left(err,400),
        status=case when attempts>=2 then 'failed' else 'scheduled' end where id=item.id;
    end;
  end loop;
  return jsonb_build_object('status','ok','published',published,'expired',expired);
end;
$$;
revoke all on all functions in schema cam_editorial from public, anon, authenticated;

-- The cron worker does not browse, generate text, vote, or consume AI tokens.
select cron.schedule('cam-editorial-publish','*/5 * * * *','select cam_editorial.tick();');
