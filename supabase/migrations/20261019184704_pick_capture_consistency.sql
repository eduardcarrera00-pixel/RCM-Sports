-- Consistencia declarada por el OCR local. No autentica la casa ni un boleto.
-- Nunca recibe imágenes, archivos, texto OCR completo ni datos de saldo/importe.
alter table public.ae_community_picks add column if not exists capture_check jsonb;
grant insert(capture_check) on public.ae_community_picks to authenticated;

create or replace function public.ae_pick_capture_consistency()
returns trigger language plpgsql security invoker set search_path='' as $$
declare proof jsonb; reading jsonb; leg jsonb; i integer; total_decimal numeric; total_american integer;
begin
 if new.capture_check is null then return new; end if;
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or new.user_id is distinct from auth.uid() then
  raise exception 'Inicia sesión para publicar';
 end if;
 proof:=new.capture_check;
 if pg_catalog.octet_length(proof::text)>2048 or jsonb_typeof(proof) is distinct from 'object'
    or proof->>'method' is distinct from 'on_device_ocr' or proof->>'version' is distinct from '1'
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
 -- Un punto de diferencia puede proceder de convertir cuotas decimales
 -- individuales a americanas enteras. Se conserva el total explícito del boleto.
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
 -- Desechar todos los datos del comprobante. Solo queda método, versión y fecha.
 new.capture_check:=jsonb_build_object('method','on_device_ocr','version',1,'checked_at',now());
 new.moderation_status:='approved';new.reviewed_at:=now();new.reviewed_by:=null;
 return new;
end $$;
revoke all on function public.ae_pick_capture_consistency() from public,anon,authenticated;
-- Orden alfabético: después del validador existente ae_pick_prepare.
drop trigger if exists ae_pick_z_capture_consistency on public.ae_community_picks;
create trigger ae_pick_z_capture_consistency before insert on public.ae_community_picks
for each row execute function public.ae_pick_capture_consistency();

create or replace view public.ae_pick_feed with(security_invoker=true) as
select p.id,p.user_id,p.author,p.title,p.explanation,p.legs,p.decimal_odds,p.american_odds,p.created_at,p.publication_day,p.hidden,
 (p.created_at at time zone 'America/Toronto')>=date_trunc('week',now() at time zone 'America/Toronto') as is_current_week,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=1)::bigint as upvotes,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=-1)::bigint as downvotes,
 (select coalesce(sum(v.value),0) from public.ae_pick_votes v where v.pick_id=p.id)::bigint as score,
 (select coalesce(max(v.value)::int,0) from public.ae_pick_votes v where v.pick_id=p.id and v.user_id=auth.uid()) as my_vote,
 (select count(*) from public.ae_pick_comments c where c.pick_id=p.id and not c.hidden)::bigint as comments_count,
 p.moderation_status,p.event_date,p.outcome,p.settled_at,p.result_points,p.capture_check
from public.ae_community_picks p where not p.hidden and
 (p.moderation_status in ('pending','approved') or p.user_id=auth.uid() or (select public.rcm_is_editor()));
comment on column public.ae_community_picks.capture_check is
 'Solo método/versión/fecha del cotejo declarado por OCR local. No es autenticación de la casa. Nunca almacenar imagen o texto OCR.';
