-- Read-only all-time scope; existing scoring, month/round scopes and permissions stay intact.
set lock_timeout='3s';
set statement_timeout='30s';
do $migration$
declare definition text; signature text; season_filter text:='g.season=p_season';
begin
 foreach signature in array array[
  'public.cam_nfl_leaderboard(text,integer,integer,text)',
  'public.cam_football_leaderboard(text,integer,text,integer,text)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if strpos(definition,'''all''')=0 then
   if strpos(definition,season_filter)=0 then raise exception 'Inspect changed leaderboard %',signature; end if;
   if strpos(definition,'''week'',''month'',''season''')>0 then
    definition:=replace(definition,'''week'',''month'',''season''','''week'',''month'',''season'',''all''');
   elsif strpos(definition,'''matchday'',''month'',''season''')>0 then
    definition:=replace(definition,'''matchday'',''month'',''season''','''matchday'',''month'',''season'',''all''');
   else raise exception 'Inspect changed scope validation %',signature; end if;
   definition:=replace(definition,season_filter,'(p_scope=''all'' or g.season=p_season)');
   execute definition;
  end if;
 end loop;
 foreach signature in array array[
  'public.cam_nfl_public_pick_breakdown(uuid,integer,integer)',
  'public.cam_football_public_pick_breakdown(uuid,integer,text,integer)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if strpos(definition,'p_season is null')=0 then
   if strpos(definition,season_filter)=0 then raise exception 'Inspect changed public breakdown %',signature; end if;
   execute replace(definition,season_filter,'(p_season is null or g.season=p_season)');
  end if;
 end loop;
end $migration$;
notify pgrst,'reload schema';
