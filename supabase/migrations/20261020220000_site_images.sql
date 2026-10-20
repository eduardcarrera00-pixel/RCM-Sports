-- Imágenes del sitio editables por los administradores.
-- Cada clave (p. ej. 'opiniones.icono') corresponde a una imagen fija del código
-- (ver assets/ae-site-images.js, SITE_IMAGES). Si no hay fila, la página usa la
-- imagen original; una fila guarda el reemplazo (url) y/o el encuadre (focus_x/y).
-- Lectura pública; escritura solo con ae_set_site_image / ae_reset_site_image.
create table if not exists public.ae_site_images (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9.-]{1,79}$'),
  url text check (url is null or (url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/\S*$' and char_length(url) <= 2048)),
  focus_x integer check (focus_x between 0 and 100),
  focus_y integer check (focus_y between 0 and 100),
  alt text check (alt is null or char_length(alt) <= 200),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check ((focus_x is null) = (focus_y is null))
);

alter table public.ae_site_images enable row level security;

drop policy if exists ae_site_images_read on public.ae_site_images;
create policy ae_site_images_read on public.ae_site_images for select using (true);

revoke insert, update, delete on public.ae_site_images from anon, authenticated;
grant select on public.ae_site_images to anon, authenticated;

create or replace function public.ae_set_site_image(
  p_key text,
  p_url text default null,
  p_focus_x integer default null,
  p_focus_y integer default null,
  p_alt text default null
) returns public.ae_site_images
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := auth.uid();
  row_out public.ae_site_images;
begin
  if me is null or not public.rcm_is_editor() then
    raise exception 'Solo un administrador puede cambiar las imágenes del sitio';
  end if;
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9.-]{1,79}$' then
    raise exception 'Clave de imagen no válida';
  end if;
  p_url := nullif(btrim(p_url), '');
  if p_url is not null and (p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/\S*$' or char_length(p_url) > 2048) then
    raise exception 'El enlace de la imagen debe empezar por https://';
  end if;
  if (p_focus_x is null) <> (p_focus_y is null) then
    raise exception 'El encuadre necesita los dos valores';
  end if;
  if p_focus_x is not null and (p_focus_x not between 0 and 100 or p_focus_y not between 0 and 100) then
    raise exception 'El encuadre debe estar entre 0 y 100';
  end if;
  p_alt := nullif(btrim(p_alt), '');
  if p_alt is not null and char_length(p_alt) > 200 then
    raise exception 'El texto alternativo no puede superar 200 caracteres';
  end if;
  if p_url is null and p_focus_x is null and p_alt is null then
    delete from public.ae_site_images where key = p_key;
    return null;
  end if;
  insert into public.ae_site_images as s (key, url, focus_x, focus_y, alt, updated_by, updated_at)
  values (p_key, p_url, p_focus_x, p_focus_y, p_alt, me, now())
  on conflict (key) do update
    set url = excluded.url, focus_x = excluded.focus_x, focus_y = excluded.focus_y,
        alt = excluded.alt, updated_by = me, updated_at = now()
  returning s.* into row_out;
  return row_out;
end;
$function$;

create or replace function public.ae_reset_site_image(p_key text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.rcm_is_editor() then
    raise exception 'Solo un administrador puede restaurar las imágenes del sitio';
  end if;
  delete from public.ae_site_images where key = p_key;
end;
$function$;

revoke all on function public.ae_set_site_image(text, text, integer, integer, text) from public, anon;
revoke all on function public.ae_reset_site_image(text) from public, anon;
grant execute on function public.ae_set_site_image(text, text, integer, integer, text) to authenticated;
grant execute on function public.ae_reset_site_image(text) to authenticated;
