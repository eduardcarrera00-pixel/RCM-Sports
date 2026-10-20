-- Opiniones: endurecimiento. Aplicada en producción el 20 oct 2026 (versión 20261020135233).
-- Imagen solo por HTTPS, autor acotado, vistas solo de opiniones publicadas y
-- funciones de escritura reservadas a usuarios autenticados (además del control de editor).
alter table public.ae_opinions
  add constraint ae_opinions_image_https check (image is null or (char_length(image) <= 2048 and image ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$')),
  add constraint ae_opinions_author_len check (char_length(btrim(author)) between 1 and 80);

create or replace function public.ae_bump_opinion_view(p_opinion_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not exists (select 1 from public.ae_opinions where id = p_opinion_id and is_published) then return; end if;
  insert into public.ae_opinion_views (opinion_id, views, updated_at)
  values (p_opinion_id, 1, now())
  on conflict (opinion_id) do update set views = public.ae_opinion_views.views + 1, updated_at = now();
end; $$;

revoke execute on function public.ae_publish_opinion(text,text,text,text,text,text,integer,integer,boolean,boolean) from public, anon;
revoke execute on function public.ae_update_opinion(uuid,text,text,text,text,text,text,integer,integer,boolean,boolean) from public, anon;
revoke execute on function public.ae_delete_opinion(uuid) from public, anon;
grant execute on function public.ae_publish_opinion(text,text,text,text,text,text,integer,integer,boolean,boolean) to authenticated;
grant execute on function public.ae_update_opinion(uuid,text,text,text,text,text,text,integer,integer,boolean,boolean) to authenticated;
grant execute on function public.ae_delete_opinion(uuid) to authenticated;
grant execute on function public.ae_bump_opinion_view(uuid) to anon, authenticated;
revoke insert, update, delete on public.ae_opinion_views from anon, authenticated;
