-- Run only as a database owner. All fixtures, publication flags and settings roll back.
-- No article, real Pick or social delivery is committed or sent.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
update cam_social.settings set enabled=false where id;
do $test$
<<verification>>
declare
  editor_ids uuid[]; me uuid; pick_id uuid; new_id uuid; revision timestamptz;
  rejected boolean; failure text; outsider uuid:=gen_random_uuid();
begin
  select array_agg(user_id order by user_id) into editor_ids from public.editors;
  if coalesce(array_length(editor_ids,1),0)=0 then raise exception 'An editor is required'; end if;
  perform set_config('request.jwt.claim.sub',editor_ids[1]::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',editor_ids[1],'role','authenticated')::text,true);
  set local role authenticated;
  pick_id:=public.ae_publish_editorial_weekly_pick_visual_v2(
    'Prueba transaccional editorial','Equipo A contra Equipo B','Equipo A gana',150,
    'Análisis de prueba que se revertirá al terminar.',now()+interval '1 day',
    null,null,null,null,50,50,50,50);
  reset role;

  foreach me in array editor_ids loop
    select edited_at into revision from public.ae_editorial_weekly_picks where id=pick_id;
    perform set_config('request.jwt.claim.sub',me::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',me,'role','authenticated')::text,true);
    set local role authenticated;
    new_id:=public.ae_update_editorial_weekly_pick(pick_id,revision,
      'Prueba editada por otro administrador','Equipo A contra Equipo B','Equipo A gana',175,
      'Análisis de prueba actualizado por un administrador autorizado.',now()+interval '1 day');
    if new_id is distinct from pick_id then raise exception 'Edit changed the Pick identity'; end if;
    reset role;
    if not exists(select 1 from public.ae_editorial_weekly_picks where id=pick_id and edited_by=me)
      then raise exception 'An editor could not save'; end if;
  end loop;

  insert into cam_social.weekly_results(pick_id,outcome,resolved_by,snapshot)
    values(pick_id,'won',editor_ids[1],jsonb_build_object('title','Resultado de prueba inmutable'));
  foreach me in array editor_ids loop
    select edited_at into revision from public.ae_editorial_weekly_picks where id=pick_id;
    perform set_config('request.jwt.claim.sub',me::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',me,'role','authenticated')::text,true);
    set local role authenticated;
    -- The first replacement archives the fixture. Check the immutable guard before that.
    if me=editor_ids[1] then
      rejected:=false;
      begin
        perform public.ae_update_editorial_weekly_pick(pick_id,revision,
          'No se debe modificar el resultado','Equipo A contra Equipo B','Equipo B gana',200,
          'Este cambio debe rechazarse para conservar el resultado.',now()+interval '1 day');
      exception when others then
        failure:=sqlerrm;rejected:=failure like '%resultado%confirmado%';
      end;
      if not rejected then raise exception 'Immutable result check failed: %',failure; end if;
    end if;
    new_id:=public.ae_publish_editorial_weekly_pick_visual_v2(
      'Nuevo Pick después del resultado','Equipo C contra Equipo D','Equipo C gana',200,
      'Cada administrador puede publicar una selección nueva.',now()+interval '1 day',
      null,null,null,null,50,50,50,50);
    if new_id=pick_id then raise exception 'Replacement reused the result identity'; end if;
    reset role;
    if not exists(select 1 from cam_social.weekly_results where weekly_results.pick_id=verification.pick_id and outcome='won'
      and snapshot->>'title'='Resultado de prueba inmutable') then raise exception 'Replacement lost history'; end if;
  end loop;

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  set local role authenticated;
  rejected:=false;
  begin
    perform public.ae_publish_editorial_weekly_pick_visual_v2('Publicación no autorizada',
      'Equipo C contra Equipo D','Equipo C gana',200,'No se permite publicar sin permiso editorial.',
      now()+interval '1 day',null,null,null,null,50,50,50,50);
  exception when others then rejected:=sqlerrm like '%administrador%'; end;
  if not rejected then raise exception 'Non-editor can publish'; end if;
  reset role;
  if has_function_privilege('anon','public.ae_update_editorial_weekly_pick(uuid,timestamptz,text,text,text,integer,text,timestamptz,text,text,text,text,integer,integer,integer,integer)','EXECUTE')
    then raise exception 'Anonymous can update'; end if;
end $test$;
rollback;
select 'PASS: every editor edits a pending Pick and publishes a replacement; result/history preserved, reader denied, all writes rolled back.' as verification,
  (select count(*) from public.editors) as editors_verified;
