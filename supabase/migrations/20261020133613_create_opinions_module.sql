-- Opiniones: columnas y noticias comentadas por la redacción, por deporte.
-- Aplicada en producción el 20 oct 2026 (versión 20261020133613).
create table public.ae_opinions (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport = any (array['nfl','futbol','colegial','ciclismo','tenis'])),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  summary text not null default '' check (char_length(summary) <= 300),
  body text not null check (char_length(btrim(body)) between 20 and 8000),
  image text,
  image_focus_x integer not null default 50 check (image_focus_x between 0 and 100),
  image_focus_y integer not null default 50 check (image_focus_y between 0 and 100),
  author text not null default 'Redacción',
  is_published boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  edited_at timestamptz,
  edited_by uuid references auth.users(id)
);

create index ae_opinions_sport_idx on public.ae_opinions (sport, created_at desc);
create index ae_opinions_published_idx on public.ae_opinions (is_published, created_at desc);

alter table public.ae_opinions enable row level security;

-- Lectura: pública si está publicada; los administradores ven también los borradores.
create policy ae_opinions_read on public.ae_opinions
  for select using (is_published or public.rcm_is_editor());
create policy ae_opinions_insert on public.ae_opinions
  for insert with check (public.rcm_is_editor() and created_by = auth.uid());
create policy ae_opinions_update on public.ae_opinions
  for update using (public.rcm_is_editor()) with check (public.rcm_is_editor());
create policy ae_opinions_delete on public.ae_opinions
  for delete using (public.rcm_is_editor());

create table public.ae_opinion_views (
  opinion_id uuid primary key references public.ae_opinions(id) on delete cascade,
  views bigint not null default 0 check (views >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ae_opinion_views enable row level security;
create policy ae_opinion_views_read on public.ae_opinion_views for select using (true);

create or replace function public.ae_publish_opinion(
  p_sport text, p_title text, p_summary text, p_body text,
  p_author text default 'Redacción', p_image text default null,
  p_image_focus_x integer default 50, p_image_focus_y integer default 50,
  p_featured boolean default false, p_is_published boolean default true
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  new_id uuid;
  me uuid := auth.uid();
begin
  if me is null or not public.rcm_is_editor() then
    raise exception 'Solo un administrador puede publicar en Opiniones';
  end if;
  if p_sport is null or p_sport not in ('nfl','futbol','colegial','ciclismo','tenis') then
    raise exception 'Deporte no válido';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 5 and 160 then
    raise exception 'El título debe tener entre 5 y 160 caracteres';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 20 and 8000 then
    raise exception 'El contenido debe tener entre 20 y 8000 caracteres';
  end if;
  if p_summary is not null and char_length(p_summary) > 300 then
    raise exception 'El resumen no puede superar 300 caracteres';
  end if;
  insert into public.ae_opinions
    (sport, title, summary, body, author, image, image_focus_x, image_focus_y, featured, is_published, created_by)
  values
    (p_sport, btrim(p_title), coalesce(btrim(p_summary),''), btrim(p_body),
     coalesce(nullif(btrim(p_author),''),'Redacción'), p_image,
     coalesce(p_image_focus_x,50), coalesce(p_image_focus_y,50),
     coalesce(p_featured,false), coalesce(p_is_published,true), me)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.ae_update_opinion(
  p_opinion_id uuid, p_sport text, p_title text, p_summary text, p_body text, p_author text,
  p_image text default null, p_image_focus_x integer default 50, p_image_focus_y integer default 50,
  p_featured boolean default false, p_is_published boolean default true
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.rcm_is_editor() then
    raise exception 'Solo un administrador puede editar en Opiniones';
  end if;
  if p_opinion_id is null or not exists (select 1 from public.ae_opinions where id = p_opinion_id) then
    raise exception 'La opinión no existe';
  end if;
  if p_sport is null or p_sport not in ('nfl','futbol','colegial','ciclismo','tenis') then
    raise exception 'Deporte no válido';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 5 and 160 then
    raise exception 'El título debe tener entre 5 y 160 caracteres';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 20 and 8000 then
    raise exception 'El contenido debe tener entre 20 y 8000 caracteres';
  end if;
  update public.ae_opinions set
    sport = p_sport, title = btrim(p_title), summary = coalesce(btrim(p_summary),''),
    body = btrim(p_body), author = coalesce(nullif(btrim(p_author),''),'Redacción'),
    image = p_image, image_focus_x = coalesce(p_image_focus_x,50), image_focus_y = coalesce(p_image_focus_y,50),
    featured = coalesce(p_featured,false), is_published = coalesce(p_is_published,true),
    edited_at = now(), edited_by = me
  where id = p_opinion_id;
  return p_opinion_id;
end;
$$;

create or replace function public.ae_delete_opinion(p_opinion_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null or not public.rcm_is_editor() then
    raise exception 'Solo un administrador puede borrar en Opiniones';
  end if;
  delete from public.ae_opinions where id = p_opinion_id;
end;
$$;

create or replace function public.ae_bump_opinion_view(p_opinion_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.ae_opinion_views (opinion_id, views, updated_at)
  values (p_opinion_id, 1, now())
  on conflict (opinion_id) do update
    set views = public.ae_opinion_views.views + 1, updated_at = now();
end;
$$;
