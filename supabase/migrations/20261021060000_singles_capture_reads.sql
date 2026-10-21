-- CAM SPORTS · Capturas de apuestas sencillas: una lectura con varias apuestas
-- individuales publica un Pick por apuesta. Cada apuesta de la lectura se usa una sola vez.
alter table public.ae_pick_capture_reads add column if not exists singles boolean not null default false;
alter table public.ae_pick_capture_reads add column if not exists used_indexes integer[] not null default '{}';

create or replace function public.ae_pick_claim_ai_read(p_read_id uuid, p_legs jsonb, p_pick_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.ae_pick_capture_reads; i integer; reading jsonb; leg jsonb; found_index integer;
begin
  select * into r from public.ae_pick_capture_reads
   where id=p_read_id and user_id=auth.uid() and status='read' for update;
  if not found then raise exception 'La lectura de la captura no es válida'; end if;
  if r.used_at is not null then raise exception 'Esta captura ya se usó para publicar un Pick'; end if;
  if r.created_at < now() - interval '2 hours' then raise exception 'La lectura caducó. Vuelve a subir la captura'; end if;

  -- Sencillas: cada Pick lleva una sola apuesta de la lectura, sin repetir ninguna.
  if r.singles then
    if jsonb_array_length(p_legs)<>1 then raise exception 'Cada apuesta sencilla se publica como un Pick propio'; end if;
    leg:=p_legs->0;
    for i in 0..jsonb_array_length(r.readings)-1 loop
      reading:=r.readings->i;
      if not (i = any(r.used_indexes))
        and reading->>'event' is not distinct from leg->>'event'
        and reading->>'selection' is not distinct from leg->>'selection'
        and (reading->>'odds')::numeric is not distinct from (leg->>'odds')::numeric then
        found_index:=i; exit;
      end if;
    end loop;
    if found_index is null then raise exception 'Los datos leídos no coinciden con el Pick o esa apuesta ya se publicó'; end if;
    update public.ae_pick_capture_reads
       set used_indexes=used_indexes||found_index, pick_id=p_pick_id,
           used_at=case when cardinality(used_indexes)+1>=jsonb_array_length(readings) then now() else null end
     where id=r.id;
    return jsonb_build_object('total', null, 'event_date', null);
  end if;

  if jsonb_array_length(r.readings)<>jsonb_array_length(p_legs) then raise exception 'La captura no coincide con las selecciones'; end if;
  for i in 0..jsonb_array_length(p_legs)-1 loop
    reading:=r.readings->i; leg:=p_legs->i;
    if reading->>'event' is distinct from leg->>'event'
      or reading->>'selection' is distinct from leg->>'selection'
      or (reading->>'odds')::numeric is distinct from (leg->>'odds')::numeric then
      raise exception 'Los datos leídos no coinciden con el Pick';
    end if;
  end loop;
  update public.ae_pick_capture_reads set used_at=now(), pick_id=p_pick_id where id=r.id;
  return jsonb_build_object('total', r.total, 'event_date', r.event_date);
end $$;
revoke all on function public.ae_pick_claim_ai_read(uuid,jsonb,uuid) from public, anon;
grant execute on function public.ae_pick_claim_ai_read(uuid,jsonb,uuid) to authenticated;
