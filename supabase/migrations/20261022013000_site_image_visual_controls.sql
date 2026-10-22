-- CAM SPORTS: ajustes de tamaño, zoom y encuadre, sin alterar los registros existentes.
alter table public.ae_site_images
  add column if not exists visual jsonb;

alter table public.ae_site_images
  drop constraint if exists ae_site_images_visual_valid;
alter table public.ae_site_images
  add constraint ae_site_images_visual_valid
  check (visual is null or
    (jsonb_typeof(visual) = 'object' and length(visual::text) <= 3000));

-- RPC aislado: conserva intacta la firma de ae_set_site_image usada por editores antiguos.
create or replace function public.ae_set_site_image_visual(
  p_key text,
  p_url text,
  p_focus_x integer,
  p_focus_y integer,
  p_alt text,
  p_visual jsonb
) returns public.ae_site_images
language plpgsql security definer set search_path = ''
as $func$
declare
  me uuid := auth.uid();
  part text;
  cfg jsonb;
  fld text;
  allowed text[] := array['size','zoom','x','y','fit','ratio','customRatio'];
  row_out public.ae_site_images;
begin
  if me is null or not public.rcm_is_editor() then
    raise exception 'Solo un administrador puede modificar imágenes';
  end if;
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9.-]{1,79}$' then
    raise exception 'Clave de imagen no válida';
  end if;
  p_url := nullif(btrim(p_url), '');
  if p_url is not null and
      (p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/\S*$' or char_length(p_url) > 2048) then
    raise exception 'URL de imagen no válida';
  end if;
  if (p_focus_x is null) <> (p_focus_y is null) or
    (p_focus_x is not null and (p_focus_x not between 0 and 100 or p_focus_y not between 0 and 100)) then
    raise exception 'Posición fuera del rango permitido';
  end if;
  p_alt := nullif(btrim(p_alt), '');
  if char_length(p_alt) > 200 then raise exception 'Texto alternativo demasiado largo'; end if;
  if p_visual is not null then
    if jsonb_typeof(p_visual) <> 'object' or length(p_visual::text) > 3000 then
      raise exception 'Configuración visual no válida';
    end if;
    for part in select jsonb_object_keys(p_visual) loop
      if part not in ('desktop', 'mobile') then raise exception 'Dispositivo visual no válido'; end if;
      cfg := p_visual -> part;
      if jsonb_typeof(cfg) <> 'object' then raise exception 'Ajustes visuales no válidos'; end if;
      for fld in select jsonb_object_keys(cfg) loop
        if not (fld = any(allowed)) then raise exception 'Parámetro de imagen desconocido'; end if;
      end loop;
      for fld in select unnest(array['size','zoom','x','y','customRatio']) loop
        if cfg ? fld then
          if jsonb_typeof(cfg->fld) <> 'number' then raise exception 'Valor numérico inválido'; end if;
          if (fld = 'size' and ((cfg->>fld)::numeric < 50 or (cfg->>fld)::numeric > 200)) or
             (fld = 'zoom' and ((cfg->>fld)::numeric < 25 or (cfg->>fld)::numeric > 300)) or
             (fld in ('x','y') and ((cfg->>fld)::numeric < 0 or (cfg->>fld)::numeric > 100)) or
             (fld = 'customRatio' and ((cfg->>fld)::numeric < 0.2 or (cfg->>fld)::numeric > 5)) then
            raise exception 'Valor de imagen fuera del rango';
          end if;
        end if;
      end loop;
      if cfg ? 'fit' and (jsonb_typeof(cfg->'fit') <> 'string' or
          cfg->>'fit' not in ('auto','contain','cover','original','custom')) then
        raise exception 'Modo de ajuste no válido';
      end if;
      if cfg ? 'ratio' and (jsonb_typeof(cfg->'ratio') <> 'string' or
          cfg->>'ratio' not in ('auto','16:9','4:3','1:1','4:5','9:16','original','custom')) then
        raise exception 'Formato no válido';
      end if;
    end loop;
  end if;
  if p_url is null and p_focus_x is null and p_alt is null and p_visual is null then
    delete from public.ae_site_images where key=p_key;
    return null;
  end if;
  insert into public.ae_site_images as s (key,url,focus_x,focus_y,alt,visual,updated_by,updated_at)
  values (p_key,p_url,p_focus_x,p_focus_y,p_alt,p_visual,me,now())
  on conflict (key) do update set
    url=excluded.url,focus_x=excluded.focus_x,focus_y=excluded.focus_y,
    alt=excluded.alt,visual=excluded.visual,updated_by=me,updated_at=now()
  returning s.* into row_out;
  return row_out;
end;
$func$;

revoke all on function public.ae_set_site_image_visual(text,text,integer,integer,text,jsonb) from public,anon;
grant execute on function public.ae_set_site_image_visual(text,text,integer,integer,text,jsonb) to authenticated;
