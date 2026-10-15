-- AE SPORTS · Banner semanal y portada editorial. Datos anteriores intactos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('article-images','article-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "ae_editorial_assets_insert" on storage.objects;
create policy "ae_editorial_assets_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id='article-images'
  and (name like 'weekly/banner/%' or name like 'weekly/article/%' or name like 'articles/%')
  and public.rcm_is_editor()
);

alter table public.ae_editorial_weekly_picks
  add column if not exists banner_path text,
  add column if not exists image_path text;

create or replace function public.ae_publish_editorial_weekly_pick_visual(
  p_title text,
  p_event_name text,
  p_selection text,
  p_american_odds integer,
  p_analysis text,
  p_expires_at timestamptz,
  p_banner_path text default null,
  p_image_path text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  new_id uuid;
  me uuid:=auth.uid();
begin
  if me is null or not public.rcm_is_editor() then
    raise exception 'Solo administradores pueden publicar el Pick editorial';
  end if;
  if p_title is null or length(btrim(p_title)) not between 5 and 160
    or p_event_name is null or length(btrim(p_event_name)) not between 3 and 160
    or p_selection is null or length(btrim(p_selection)) not between 2 and 180
    or p_analysis is null or length(btrim(p_analysis)) not between 12 and 2400
    or p_american_odds is null
    or not (p_american_odds between 100 and 100000 or p_american_odds between -100000 and -100)
    or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '30 days'
  then raise exception 'Revisa los datos, cuota y cierre del Pick'; end if;

  if p_banner_path is not null then
    if p_banner_path !~ '^weekly/banner/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      or not exists(
        select 1 from storage.objects
        where bucket_id='article-images' and name=p_banner_path and owner_id=me::text
      )
    then raise exception 'El banner debe subirse desde una cuenta administradora'; end if;
  end if;
  if p_image_path is not null then
    if p_image_path !~ '^weekly/article/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      or not exists(
        select 1 from storage.objects
        where bucket_id='article-images' and name=p_image_path and owner_id=me::text
      )
    then raise exception 'La imagen editorial debe subirse desde una cuenta administradora'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1910026);
  update public.ae_editorial_weekly_picks set is_published=false where is_published;
  insert into public.ae_editorial_weekly_picks
    (title,event_name,selection,american_odds,analysis,expires_at,
     created_by,is_published,banner_path,image_path)
  values
    (btrim(p_title),btrim(p_event_name),btrim(p_selection),p_american_odds,
     btrim(p_analysis),p_expires_at,me,true,p_banner_path,p_image_path)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.ae_publish_editorial_weekly_pick_visual(text,text,text,integer,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.ae_publish_editorial_weekly_pick_visual(text,text,text,integer,text,timestamptz,text,text) to authenticated;
notify pgrst,'reload schema';