-- CAM SPORTS / Opiniones: banners independientes (día y noche).
-- Los visitantes leen las URLs. Solamente usuarios del grupo editors pueden modificar.
create table if not exists public.cam_opinions_section_banners (
  section_key text not null check (section_key in ('distinguished', 'debated', 'sports')),
  theme text not null check (theme in ('light', 'dark')),
  image_url text not null check (char_length(image_url) between 9 and 2048 and image_url like 'https://%'),
  updated_at timestamptz not null default now(),
  primary key (section_key, theme)
);

alter table public.cam_opinions_section_banners enable row level security;
grant select on public.cam_opinions_section_banners to anon, authenticated;
grant insert, update, delete on public.cam_opinions_section_banners to authenticated;

create policy cam_opinions_banners_read
  on public.cam_opinions_section_banners
  for select to anon, authenticated
  using (true);

create policy cam_opinions_banners_insert
  on public.cam_opinions_section_banners
  for insert to authenticated
  with check ((select public.rcm_is_editor()));

create policy cam_opinions_banners_update
  on public.cam_opinions_section_banners
  for update to authenticated
  using ((select public.rcm_is_editor()))
  with check ((select public.rcm_is_editor()));

create policy cam_opinions_banners_delete
  on public.cam_opinions_section_banners
  for delete to authenticated
  using ((select public.rcm_is_editor()));

-- Los banners utilizan article-images, cuyo INSERT existente está restringido a editores.
-- No se añade ninguna política de almacenamiento más permisiva.
