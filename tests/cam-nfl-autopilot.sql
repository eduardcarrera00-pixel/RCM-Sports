-- Run only on disposable staging. Transaction fully rolls back test fixtures/alerts.
begin;
do $qa$
declare u uuid; ok boolean; first_points integer; current_points integer; i integer; log_id bigint;
a1 constant text:='9000000000009911'; a2 constant text:='9000000000009912';
b1 constant text:='9000000000009921'; b2 constant text:='9000000000009922';
begin
 select id into u from auth.users limit 1;
 if u is null then raise exception 'Need one staging user for SQL simulation';end if;
 insert into public.cam_nfl_games(id,season,phase,week,home_id,away_id,kickoff,schedule_provider,external_game_id)
 values
 (a1,2026,'REG',16,'ARI','ATL',now()+interval '10 days','sportsdataio','9911'),
 (a2,2026,'REG',16,'BAL','BUF',now()+interval '11 days','sportsdataio','9912'),
 (b1,2026,'REG',17,'CAR','CHI',now()+interval '17 days','sportsdataio','9921'),
 (b2,2026,'REG',17,'CIN','CLE',now()+interval '18 days','sportsdataio','9922');
 insert into public.cam_nfl_week_state(season,phase,week,expected_games,status,schedule_provider)
 values(2026,'REG',16,2,'pending','sportsdataio'),
       (2026,'REG',17,2,'pending','sportsdataio');
 perform public.cam_nfl_freeze_provider_odds(a1,150,-170,'mocked moneyline test');
 ok:=public.cam_nfl_publish_complete_week(2026,'REG',16,2);
 if ok then raise exception 'FAIL: Week A opened without all frozen odds';end if;
 perform public.cam_nfl_freeze_provider_odds(a2,105,-115,'mocked moneyline test');
 if not public.cam_nfl_publish_complete_week(2026,'REG',16,2) then
   raise exception 'FAIL: Complete Week A did not open';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',u::text,'role','authenticated')::text,true);
 perform public.cam_nfl_save_pick(a1,'ARI');
 update public.cam_nfl_games set status='final',home_score=24,away_score=21,winner_id='ARI' where id=a1;
 select awarded_points into first_points from public.cam_nfl_picks where game_id=a1 and user_id=u;
 if first_points<2 then raise exception 'FAIL: Winning pick not awarded';end if;
 update public.cam_nfl_games set status='final',home_score=24,away_score=21,winner_id='ARI' where id=a1;
 select awarded_points into current_points from public.cam_nfl_picks where game_id=a1 and user_id=u;
 if current_points<>first_points then raise exception 'FAIL: Replayed final doubled points';end if;
 update public.cam_nfl_games set home_score=21,away_score=24,winner_id='ATL' where id=a1;
 if (select awarded_points from public.cam_nfl_picks where game_id=a1 and user_id=u)<>0
 then raise exception 'FAIL: Official correction not compensated';end if;
 update public.cam_nfl_games set status='tie',home_score=21,away_score=21,winner_id=null where id=a1;
 update public.cam_nfl_games set status='cancelled',home_score=null,away_score=null,winner_id=null where id=a2;
 update public.cam_nfl_week_state set status='closed',closed_at=now()
 where season=2026 and phase='REG' and week=16;
 perform public.cam_nfl_freeze_provider_odds(b1,-110,100,'mocked moneyline test');
 perform public.cam_nfl_freeze_provider_odds(b2,125,-145,'mocked moneyline test');
 if not public.cam_nfl_publish_complete_week(2026,'REG',17,2) then
  raise exception 'FAIL: Week B did not open after Week A closed';end if;
 if (select count(*) from public.cam_nfl_picks where game_id=a1 and user_id=u)<>1
 then raise exception 'FAIL: Historical pick disappeared';end if;
 for i in 1..3 loop
   insert into public.cam_nfl_sync_runs(mode) values('hourly') returning id into log_id;
   update public.cam_nfl_sync_runs set ok=false,finished_at=now(),error_text='simulated outage' where id=log_id;
 end loop;
 if (select count(*) from public.cam_nfl_admin_alerts where kind='nfl_sync_hourly' and acknowledged_at is null)<>1
 then raise exception 'FAIL: Persistent errors not alerted or deduplicated';end if;
 raise notice 'PASS: Week A -> scores/replay/correction/tie/cancel -> Week B, historical pick, alerts';
end $qa$;
rollback;