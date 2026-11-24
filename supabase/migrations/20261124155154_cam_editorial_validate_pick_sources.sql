-- A scheduled Pick must still match the current fixture and its actual market.
create function cam_editorial.pick_is_current(p_payload jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare leg jsonb; game record; side text; expected_odds integer; local_game boolean;
begin
  for leg in select * from jsonb_array_elements(p_payload->'legs') loop
    if coalesce(leg->>'source_kickoff','')=''
      or (leg->>'source_kickoff')::timestamptz<=statement_timestamp()+interval '1 hour'
      or ((leg->>'source_kickoff')::timestamptz at time zone 'America/Toronto')::date
        is distinct from (p_payload->>'event_date')::date then return false; end if;
    select * into game from (
      select id,status,kickoff,picks_open,odds_home,odds_away,null::integer odds_draw,
        odds_source,odds_locked_at from public.cam_nfl_games
        where id=leg->>'source_game_id' and leg->>'sport'='NFL'
      union all
      select id,status,kickoff,picks_open,odds_home,odds_away,odds_draw,
        odds_source,odds_locked_at from public.cam_football_games
        where id=leg->>'source_game_id' and leg->>'sport'='Fútbol'
    ) fixtures limit 1;
    local_game:=found;
    if local_game and (game.status<>'scheduled' or not game.picks_open
      or game.kickoff is distinct from (leg->>'source_kickoff')::timestamptz) then return false; end if;
    if local_game and lower(coalesce(leg->>'market','moneyline'))='moneyline' then
      side:=leg->>'source_pick';
      expected_odds:=case side when 'home' then game.odds_home
        when 'away' then game.odds_away when 'draw' then game.odds_draw end;
      if expected_odds is null or (leg->>'odds')::integer is distinct from expected_odds
        or game.odds_locked_at is null
        or game.odds_locked_at is distinct from (leg->>'source_odds_locked_at')::timestamptz
        or game.odds_source is distinct from leg->>'source_odds_source' then return false; end if;
    else
      -- External markets are only released while the verified quote is fresh.
      if coalesce(leg->>'source_market_url','') !~ '^https://[^ /]+'
        or coalesce(leg->>'source_observed_at','')=''
        or (leg->>'source_observed_at')::timestamptz<statement_timestamp()-interval '30 minutes'
        or (leg->>'source_observed_at')::timestamptz>statement_timestamp()+interval '5 minutes'
        or not exists(select 1 from jsonb_array_elements(p_payload->'sources') source
          where source->>'url'=leg->>'source_market_url') then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function cam_editorial.pick_is_current(jsonb) from public, anon, authenticated;

create or replace function cam_editorial.tick()
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
        if not cam_editorial.pick_is_current(item.payload) then
          update cam_editorial.queue set status='expired',last_error='Fixture, horario o cuota ya no vigentes' where id=item.id;
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
