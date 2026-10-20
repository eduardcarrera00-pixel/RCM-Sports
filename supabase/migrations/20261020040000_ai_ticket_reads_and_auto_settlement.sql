-- AE SPORTS · Lectura de boletos con IA (respaldo del OCR local) y liquidación automática.
-- Nunca se guarda la imagen: solo los datos de la apuesta que la IA leyó en el servidor.

-- 1. Lecturas con IA: las escribe solo la función ae-read-ticket (service_role).
create table if not exists public.ae_pick_capture_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('read','failed')),
  readings jsonb not null default '[]'::jsonb,
  total jsonb,
  event_date date,
  model text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  pick_id uuid
);
create index if not exists ae_pick_capture_reads_user_idx on public.ae_pick_capture_reads(user_id, created_at desc);
alter table public.ae_pick_capture_reads enable row level security;
revoke all on public.ae_pick_capture_reads from anon, authenticated;
comment on table public.ae_pick_capture_reads is
  'Datos de apuesta leídos por IA en el servidor. Sin imágenes. Cada lectura se usa una sola vez para publicar.';

-- Reclama una lectura de IA del propio usuario para el Pick que se está publicando.
create or replace function public.ae_pick_claim_ai_read(p_read_id uuid, p_legs jsonb, p_pick_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.ae_pick_capture_reads; i integer; reading jsonb; leg jsonb;
begin
  select * into r from public.ae_pick_capture_reads
   where id=p_read_id and user_id=auth.uid() and status='read' for update;
  if not found then raise exception 'La lectura de la captura no es válida'; end if;
  if r.used_at is not null then raise exception 'Esta captura ya se usó para publicar un Pick'; end if;
  if r.created_at < now() - interval '2 hours' then raise exception 'La lectura caducó. Vuelve a subir la captura'; end if;
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

-- 2. El validador de publicación acepta también la lectura con IA (además del OCR local).
create or replace function public.ae_pick_capture_consistency()
returns trigger language plpgsql set search_path='' as $function$
declare proof jsonb; reading jsonb; leg jsonb; i integer; total_decimal numeric; total_american integer; claimed jsonb;
begin
 if new.capture_check is null then return new; end if;
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or new.user_id is distinct from auth.uid() then
  raise exception 'Inicia sesión para publicar';
 end if;
 proof:=new.capture_check;
 if pg_catalog.octet_length(proof::text)>16384 or jsonb_typeof(proof) is distinct from 'object' then
  raise exception 'Cotejo de captura inválido';
 end if;

 -- Lectura con IA en el servidor: los datos se comparan con lo que la IA leyó, no con lo que envía el navegador.
 if proof->>'method'='ai_vision' then
  if proof->>'version' is distinct from '1' or coalesce(proof->>'read_id','')!~'^[0-9a-f-]{36}$' then
   raise exception 'Cotejo de captura inválido';
  end if;
  if new.id is null then new.id:=gen_random_uuid(); end if;
  claimed:=public.ae_pick_claim_ai_read((proof->>'read_id')::uuid,new.legs,new.id);
  if claimed->'total' is not null and claimed->'total'<>'null'::jsonb then
   total_decimal:=(claimed->'total'->>'decimal')::numeric;
   total_american:=(claimed->'total'->>'american')::integer;
   if total_american is null or total_american<100 or abs(total_american-new.american_odds)>1 then
    raise exception 'La cuota total del boleto no coincide';
   end if;
   new.decimal_odds:=total_decimal;new.american_odds:=total_american;
  end if;
  if new.american_odds<100 then raise exception 'La cuota total debe ser al menos +100'; end if;
  new.capture_check:=jsonb_build_object('method','ai_vision','version',1,'checked_at',now());
  new.moderation_status:='approved';new.reviewed_at:=now();new.reviewed_by:=null;
  return new;
 end if;

 if proof->>'method' is distinct from 'on_device_ocr' or proof->>'version' is distinct from '1'
    or proof->'confirmed' is distinct from 'true'::jsonb
    or jsonb_typeof(proof->'readings') is distinct from 'array' then
  raise exception 'Cotejo de captura inválido';
 end if;
 if jsonb_array_length(proof->'readings')<>jsonb_array_length(new.legs) then raise exception 'La captura no coincide con las selecciones'; end if;
 for i in 0..jsonb_array_length(new.legs)-1 loop
  reading:=proof->'readings'->i;leg:=new.legs->i;
  if jsonb_typeof(reading) is distinct from 'object'
   or reading->>'event' is distinct from leg->>'event'
   or reading->>'selection' is distinct from leg->>'selection'
   or coalesce(reading->>'odds','')!~ '^-?[0-9]{3,6}$'
   or coalesce(reading->>'confidence','')!~ '^[0-9]{2,3}$' then
   raise exception 'Los datos cotejados no coinciden con el Pick';
  end if;
  if (reading->>'odds')::numeric<>(leg->>'odds')::numeric or (reading->>'confidence')::integer not between 65 and 100 then
   raise exception 'El momio no coincide o no se lee con claridad';
  end if;
 end loop;
 if proof->'total' is not null and proof->'total'<>'null'::jsonb then
  if jsonb_array_length(new.legs)<>2 or jsonb_typeof(proof->'total') is distinct from 'object'
   or coalesce(proof->'total'->>'decimal','')!~ '^[0-9]+(\.[0-9]+)?$'
   or coalesce(proof->'total'->>'american','')!~ '^[0-9]{3,6}$' then raise exception 'Cuota total inválida'; end if;
  total_decimal:=(proof->'total'->>'decimal')::numeric;
  total_american:=(proof->'total'->>'american')::integer;
  if total_decimal<2 or total_decimal>1001 or total_american not between 100 and 100000
   or round((total_decimal-1)*100)<>total_american or abs(total_american-new.american_odds)>1 then
   raise exception 'La cuota total del boleto no coincide';
  end if;
  new.decimal_odds:=total_decimal;new.american_odds:=total_american;
 end if;
 if new.american_odds<100 then raise exception 'La cuota total debe ser al menos +100'; end if;
 new.capture_check:=jsonb_build_object('method','on_device_ocr','version',1,'checked_at',now());
 new.moderation_status:='approved';new.reviewed_at:=now();new.reviewed_by:=null;
 return new;
end $function$;

-- 3. Liquidación automática: registro de cada comprobación (visible para editores).
create table if not exists public.ae_pick_settlement_checks (
  pick_id uuid primary key references public.ae_community_picks(id) on delete cascade,
  status text not null check (status in ('waiting','needs_review','settled')),
  suggested_outcome text check (suggested_outcome in ('won','lost','void')),
  reason text,
  evidence jsonb,
  attempts integer not null default 0,
  last_checked_at timestamptz not null default now()
);
alter table public.ae_pick_settlement_checks enable row level security;
revoke all on public.ae_pick_settlement_checks from anon, authenticated;
grant select on public.ae_pick_settlement_checks to authenticated;
drop policy if exists ae_pick_settlement_checks_editors on public.ae_pick_settlement_checks;
create policy ae_pick_settlement_checks_editors on public.ae_pick_settlement_checks
  for select to authenticated using ((select public.rcm_is_editor()));

-- Liquida un Pick con datos oficiales. Solo la función programada (service_role) puede llamarla.
-- settled_by usa un identificador fijo que significa "verificación automática".
create or replace function public.ae_pick_auto_settle(p_pick_id uuid, p_outcome text, p_reason text, p_evidence jsonb)
returns numeric language plpgsql security definer set search_path='' as $$
declare points numeric;
begin
  if p_outcome is null or p_outcome not in ('won','lost','void') then raise exception 'Resultado inválido'; end if;
  update public.ae_community_picks
     set outcome=p_outcome, settled_at=now(), settled_by='00000000-0000-0000-0000-00000000ae01'::uuid
   where id=p_pick_id and outcome='pending' and not hidden and moderation_status='approved'
     and event_date is not null and event_date <= (now() at time zone 'America/Toronto')::date
  returning result_points into points;
  if not found then return null; end if;
  insert into public.ae_pick_settlement_checks(pick_id,status,suggested_outcome,reason,evidence,attempts,last_checked_at)
  values (p_pick_id,'settled',p_outcome,p_reason,p_evidence,1,now())
  on conflict (pick_id) do update set status='settled',suggested_outcome=excluded.suggested_outcome,
    reason=excluded.reason,evidence=excluded.evidence,attempts=ae_pick_settlement_checks.attempts+1,last_checked_at=now();
  return points;
end $$;
revoke all on function public.ae_pick_auto_settle(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.ae_pick_auto_settle(uuid,text,text,jsonb) to service_role;
