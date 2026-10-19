-- Store a whole ticket as one immutable prediction, without dropping its markets.
-- Only widen bounded text lengths; keep pricing, ownership, roles and RLS intact.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.ae_pick_prepare()'::regprocedure);
 if position('between 3 and 160' in definition)=0 and position('between 3 and 640' in definition)=0 then
  raise exception 'Unexpected Pick validator: event length guard missing';
 end if;
 if position('between 2 and 200 ' in definition)=0 and position('between 2 and 2000 ' in definition)=0 then
  raise exception 'Unexpected Pick validator: selection length guard missing';
 end if;
 definition:=replace(definition,'between 3 and 160','between 3 and 640');
 definition:=replace(definition,'between 2 and 200 ','between 2 and 2000 ');
 execute definition;
 definition:=pg_get_functiondef('public.ae_pick_capture_consistency()'::regprocedure);
 if position('>2048' in definition)=0 and position('>16384' in definition)=0 then
  raise exception 'Unexpected capture validator: size guard missing';
 end if;
 execute replace(definition,'>2048','>16384');
end $migration$;
