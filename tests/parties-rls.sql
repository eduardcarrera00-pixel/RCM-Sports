-- Parties · permisos y RLS. Quien no es miembro no puede leer un party, ni sus
-- miembros, ni su clasificación, ni su actividad; nadie escribe directamente
-- en las tablas.
--
-- Todo va dentro de una transacción que se deshace al final (ROLLBACK), así
-- que puede ejecutarse en local (tests/parties-sql.sh) y también contra la
-- base real después de aplicar las migraciones, sin dejar rastro:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/parties-rls.sql
-- Si algo falla, psql se detiene con el mensaje «FALLO: …».

\set ON_ERROR_STOP 1
begin;

insert into auth.users(id, raw_user_meta_data) values
  ('7a000000-0000-4000-8000-000000000001', '{"username":"rls_ana"}'),
  ('7a000000-0000-4000-8000-000000000002', '{"username":"rls_beto"}'),
  ('7a000000-0000-4000-8000-000000000003', '{"username":"rls_carla"}'),
  ('7a000000-0000-4000-8000-000000000004', '{"username":"rls_admin"}');
insert into public.editors(user_id) values ('7a000000-0000-4000-8000-000000000004');

-- Ana crea un party de Takes; Beto se une con el código.
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.party', public.cam_party_create('Prueba RLS ⚽', 'takes', 'all')->>'id', true);
select set_config('test.code', (select code from public.cam_parties where id = current_setting('test.party')::uuid), true);
reset role;

select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.cam_party_join(current_setting('test.code'));
do $$ begin
  if (select count(*) from public.cam_parties) <> 1 then raise exception 'FALLO: el miembro no ve su party'; end if;
  if (select count(*) from public.cam_party_members) <> 2 then raise exception 'FALLO: el miembro no ve a los 2 miembros'; end if;
  if jsonb_array_length(public.cam_party_ranking(current_setting('test.party')::uuid)->'total') <> 2 then
    raise exception 'FALLO: el miembro no ve la clasificación';
  end if;
  perform public.cam_party_activity(current_setting('test.party')::uuid);
end $$;
reset role;

-- Carla, con sesión pero sin ser miembro.
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v jsonb;
begin
  if (select count(*) from public.cam_parties) <> 0 then raise exception 'FALLO: un no miembro lee cam_parties'; end if;
  if (select count(*) from public.cam_party_members) <> 0 then raise exception 'FALLO: un no miembro lee cam_party_members'; end if;
  begin
    perform public.cam_party_ranking(current_setting('test.party')::uuid);
    raise exception 'FALLO: un no miembro lee la clasificación';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_party_activity(current_setting('test.party')::uuid);
    raise exception 'FALLO: un no miembro lee la actividad';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cam_party_members(party_id, user_id)
      values (current_setting('test.party')::uuid, '7a000000-0000-4000-8000-000000000003');
    raise exception 'FALLO: un no miembro se mete en la tabla de miembros';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.cam_parties set name = 'Hackeado' where id = current_setting('test.party')::uuid;
    raise exception 'FALLO: se puede escribir directamente en cam_parties';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.cam_party_standings(array[current_setting('test.party')::uuid], 'all');
    raise exception 'FALLO: la función interna de clasificación es accesible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_party_rename(current_setting('test.party')::uuid, 'Otro nombre');
    raise exception 'FALLO: un no miembro renombra';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_party_delete(current_setting('test.party')::uuid);
    raise exception 'FALLO: un no miembro borra';
  exception when insufficient_privilege then null;
  end;
  -- La invitación sí se ve, sin datos privados.
  v := public.cam_party_preview(current_setting('test.code'));
  if v->>'status' <> 'ok' or (v->>'is_member')::boolean or v ? 'code' or v->>'id' is not null
     or (v->>'member_count')::int <> 2 then
    raise exception 'FALLO: vista previa incorrecta %', v;
  end if;
end $$;
reset role;

-- Visitante sin sesión (anon).
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  begin
    perform 1 from public.cam_parties;
    raise exception 'FALLO: anon lee cam_parties';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_party_ranking(current_setting('test.party')::uuid);
    raise exception 'FALLO: anon lee la clasificación';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cam_party_join(current_setting('test.code'));
    raise exception 'FALLO: anon se une';
  exception when insufficient_privilege then null;
  end;
  if public.cam_party_preview(current_setting('test.code'))->>'status' <> 'ok' then
    raise exception 'FALLO: anon no ve la invitación';
  end if;
  if jsonb_array_length(public.cam_party_public_list('7a000000-0000-4000-8000-000000000001')) <> 1 then
    raise exception 'FALLO: perfil público sin el party';
  end if;
  if public.cam_party_public_list('7a000000-0000-4000-8000-000000000001')->0->>'id' is not null then
    raise exception 'FALLO: el perfil público entrega el id a quien no es miembro';
  end if;
end $$;
reset role;

-- Administrador: ve y puede borrar cualquier party.
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.cam_parties where id = current_setting('test.party')::uuid) <> 1 then
    raise exception 'FALLO: el administrador no ve el party';
  end if;
  perform public.cam_party_ranking(current_setting('test.party')::uuid);
  if jsonb_array_length(public.cam_party_admin_list()) < 1 then raise exception 'FALLO: lista de administración vacía'; end if;
  perform public.cam_party_delete(current_setting('test.party')::uuid);
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.cam_parties where id = current_setting('test.party')::uuid) then
    raise exception 'FALLO: el administrador no pudo borrar';
  end if;
  raise notice 'parties-rls: OK';
end $$;

rollback;
