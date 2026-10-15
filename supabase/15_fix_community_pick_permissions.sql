-- AE SPORTS 2026-10-15: permisos mínimos para operaciones de la comunidad.
-- Las políticas RLS existentes siguen controlando autenticación, propiedad y moderación.
-- No se permite escritura a anon ni se conceden columnas de estado/user_id.
grant insert (title,explanation,legs) on table public.ae_community_picks to authenticated;
grant update (hidden) on table public.ae_community_picks to authenticated;

grant insert (pick_id,parent_id,body) on table public.ae_pick_comments to authenticated;
grant update (hidden) on table public.ae_pick_comments to authenticated;

grant insert (pick_id,value) on table public.ae_pick_votes to authenticated;
grant update (value) on table public.ae_pick_votes to authenticated;

-- Los permisos DELETE/SELECT ya existentes se mantienen, así como los triggers,
-- restricciones UNIQUE y RLS: sólo el propietario puede votar y los editores
-- pueden ocultar entradas; un usuario anónimo no puede publicar.
