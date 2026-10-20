-- Reversible production/staging verification: all fixtures and queued work roll back.
begin;
update cam_social.settings set enabled=false where id;
do $test$
declare me uuid; w uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); unknown uuid:=gen_random_uuid();
 r jsonb; n integer; denied boolean;
begin
 select user_id into me from public.editors limit 1;
 if me is null then raise exception 'Test needs an existing editor'; end if;
 perform set_config('request.jwt.claim.sub',me::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',me,'role','authenticated')::text,true);
 insert into public.ae_editorial_weekly_picks(id,title,event_name,selection,american_odds,analysis,expires_at,created_by,is_published,banner_url)
 values(w,'Prueba resultado ganador','Equipo A vs Equipo B','Equipo A gana',150,'Prueba transaccional de resultado editorial.',now()-interval '1 day',me,false,'https://example.com/pick.png'),
       (l,'Prueba resultado fallado','Equipo C vs Equipo D','Equipo C gana',200,'Prueba transaccional de resultado editorial.',now()-interval '1 day',me,false,'https://example.com/pick.png');
 insert into cam_social.events(event_key,source_table,source_id,payload)
 values('weekly:'||w::text,'ae_editorial_weekly_picks',w::text,'{}'::jsonb);
 insert into cam_social.deliveries(event_key,network,status,external_url)
 values('weekly:'||w::text,'twitter','published','https://twitter.com/CAM_SPORTS__/status/1234567890123456789');
 if public.cam_weekly_pick_result(w) is not null then raise exception 'Unsettled result must be empty'; end if;
 denied:=false;begin perform public.cam_resolve_weekly_pick(w,'invalid');exception when others then denied:=true;end;
 if not denied then raise exception 'Invalid outcome accepted'; end if;
 r:=public.cam_resolve_weekly_pick(w,'won');
 if r->>'outcome'<>'won' or r->>'image_url'<>'https://example.com/pick.png' or r->>'original_x_url' is null then raise exception 'Wrong result snapshot'; end if;
 if r ? 'resolved_by' or r ? 'created_by' then raise exception 'Public snapshot leaked administrator'; end if;
 select count(*) into n from cam_social.events where event_key='weekly-won:'||w::text;
 if n<>1 then raise exception 'Winner event missing'; end if;
 select count(*) into n from cam_social.deliveries where event_key='weekly-won:'||w::text;
 if n<>(select count(*) from cam_social.channels where enabled) then raise exception 'Missing channel delivery'; end if;
 if not exists(select 1 from cam_social.events where event_key='weekly-won:'||w::text and payload->>'x_text' like '✅ Pick acertado · Pick de la Semana%' and payload->>'x_quote_url' like '%1234567890123456789%' and payload->'x_assets'='[]'::jsonb) then raise exception 'Winner text/original URL incorrect'; end if;
 if not exists(select 1 from cam_social.deliveries where event_key='weekly-won:'||w::text and network='twitter' and status='queued' and attempts=0) then raise exception 'X must queue a quote without uploading a new photo'; end if;
 perform public.cam_resolve_weekly_pick(w,'won');
 select count(*) into n from cam_social.events where event_key='weekly-won:'||w::text;
 if n<>1 then raise exception 'Duplicate winner event'; end if;
 if exists(select 1 from cam_social.deliveries where event_key='weekly-won:'||w::text and attempts<>0) then raise exception 'Test attempted real publication'; end if;
 denied:=false;begin perform public.cam_resolve_weekly_pick(w,'lost');exception when others then denied:=true;end;
 if not denied then raise exception 'Conflicting outcome accepted'; end if;
 perform public.cam_resolve_weekly_pick(l,'lost');
 if exists(select 1 from cam_social.events where event_key='weekly-won:'||l::text) then raise exception 'A loss was shared'; end if;
 if public.cam_weekly_pick_result(l)->>'outcome'<>'lost' then raise exception 'Loss not recorded'; end if;
 if not (select cam_social.source_visible(e) from cam_social.events e where event_key='weekly-won:'||w::text) then raise exception 'Expired/archived winner must remain shareable'; end if;
 denied:=false;begin update public.ae_editorial_weekly_picks set selection='Selección distinta' where id=w;exception when others then denied:=true;end;
 if not denied then raise exception 'Settled recommendation can be edited'; end if;
 update public.ae_editorial_weekly_picks set is_published=false where id=w;
 if jsonb_array_length(public.cam_admin_weekly_results(0))<2 then raise exception 'Admin history missing'; end if;
 perform set_config('request.jwt.claim.sub',unknown::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',unknown,'role','authenticated')::text,true);
 denied:=false;begin perform public.cam_resolve_weekly_pick(w,'won');exception when others then denied:=true;end;
 if not denied then raise exception 'Non-editor can settle'; end if;
 denied:=false;begin perform public.cam_admin_weekly_results(0);exception when others then denied:=true;end;
 if not denied then raise exception 'Non-editor can read admin history'; end if;
 if has_function_privilege('anon','public.cam_resolve_weekly_pick(uuid,text)','EXECUTE') then raise exception 'Anonymous can settle'; end if;
 if not has_function_privilege('anon','public.cam_weekly_pick_result(uuid)','EXECUTE') then raise exception 'Public cannot read result'; end if;
end $test$;
rollback;
select 'PASS: winner/loss, snapshot, original tweet, expired picks, deduplication, immutability and editor authorization; all fixtures rolled back.' as verification;
