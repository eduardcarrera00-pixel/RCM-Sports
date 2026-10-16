-- AE SPORTS · Edición segura del Pick de la Semana, sin crear publicaciones nuevas.
BEGIN;

ALTER TABLE public.ae_editorial_weekly_picks
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.ae_update_editorial_weekly_pick(
  p_pick_id uuid,
  p_expected_edited_at timestamptz,
  p_title text,
  p_event_name text,
  p_selection text,
  p_american_odds integer,
  p_analysis text,
  p_expires_at timestamptz,
  p_banner_path text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_banner_url text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_banner_focus_x integer DEFAULT 50,
  p_banner_focus_y integer DEFAULT 50,
  p_image_focus_x integer DEFAULT 50,
  p_image_focus_y integer DEFAULT 50
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  current_pick public.ae_editorial_weekly_picks%ROWTYPE;
  me uuid := auth.uid();
  direct_banner text := NULLIF(BTRIM(p_banner_url),'');
  direct_image text := NULLIF(BTRIM(p_image_url),'');
BEGIN
  IF me IS NULL OR NOT public.rcm_is_editor() THEN
    RAISE EXCEPTION 'Solo los administradores pueden editar el Pick de la Semana';
  END IF;
  IF p_pick_id IS NULL THEN RAISE EXCEPTION 'Selecciona un Pick para editar'; END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 5 AND 160
     OR p_event_name IS NULL OR char_length(btrim(p_event_name)) NOT BETWEEN 3 AND 160
     OR p_selection IS NULL OR char_length(btrim(p_selection)) NOT BETWEEN 2 AND 180
     OR p_analysis IS NULL OR char_length(btrim(p_analysis)) NOT BETWEEN 12 AND 2400
     OR p_american_odds IS NULL
     OR NOT (p_american_odds BETWEEN 100 AND 100000 OR p_american_odds BETWEEN -100000 AND -100)
     OR p_expires_at IS NULL OR p_expires_at <= now()
     OR p_expires_at > now() + interval '30 days'
  THEN
    RAISE EXCEPTION 'Revisa título, partido, selección, cuota, análisis y cierre futuro';
  END IF;
  IF p_banner_focus_x IS NULL OR p_banner_focus_x NOT BETWEEN 0 AND 100
     OR p_banner_focus_y IS NULL OR p_banner_focus_y NOT BETWEEN 0 AND 100
     OR p_image_focus_x IS NULL OR p_image_focus_x NOT BETWEEN 0 AND 100
     OR p_image_focus_y IS NULL OR p_image_focus_y NOT BETWEEN 0 AND 100
  THEN
    RAISE EXCEPTION 'El encuadre debe estar entre 0 y 100';
  END IF;
  IF (p_banner_path IS NOT NULL AND direct_banner IS NOT NULL)
     OR (p_image_path IS NOT NULL AND direct_image IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Para cada imagen, elige archivo o enlace, no ambos';
  END IF;
  IF (direct_banner IS NOT NULL AND
      (length(direct_banner)>2048 OR direct_banner !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'))
     OR (direct_image IS NOT NULL AND
      (length(direct_image)>2048 OR direct_image !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'))
  THEN
    RAISE EXCEPTION 'Las nuevas imágenes necesitan enlaces HTTPS válidos';
  END IF;
  IF p_banner_path IS NOT NULL THEN
    IF p_banner_path !~ '^weekly/banner/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects
         WHERE bucket_id='article-images' AND name=p_banner_path AND owner_id=me::text
       )
    THEN RAISE EXCEPTION 'El banner nuevo debe subirlo un administrador'; END IF;
  END IF;
  IF p_image_path IS NOT NULL THEN
    IF p_image_path !~ '^weekly/article/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects
         WHERE bucket_id='article-images' AND name=p_image_path AND owner_id=me::text
       )
    THEN RAISE EXCEPTION 'La imagen nueva debe subirla un administrador'; END IF;
  END IF;

  SELECT * INTO current_pick
  FROM public.ae_editorial_weekly_picks
  WHERE id=p_pick_id AND is_published AND expires_at>now()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'El Pick ya no está publicado o ha vencido'; END IF;
  IF current_pick.edited_at IS DISTINCT FROM p_expected_edited_at THEN
    RAISE EXCEPTION 'Otro administrador modificó este Pick. Recarga antes de guardar.';
  END IF;

  UPDATE public.ae_editorial_weekly_picks
    SET title=btrim(p_title),
        event_name=btrim(p_event_name),
        selection=btrim(p_selection),
        american_odds=p_american_odds,
        analysis=btrim(p_analysis),
        expires_at=p_expires_at,
        banner_path=CASE WHEN p_banner_path IS NOT NULL THEN p_banner_path
                         WHEN direct_banner IS NOT NULL THEN NULL ELSE current_pick.banner_path END,
        banner_url=CASE WHEN p_banner_path IS NOT NULL THEN NULL
                        WHEN direct_banner IS NOT NULL THEN direct_banner ELSE current_pick.banner_url END,
        image_path=CASE WHEN p_image_path IS NOT NULL THEN p_image_path
                        WHEN direct_image IS NOT NULL THEN NULL ELSE current_pick.image_path END,
        image_url=CASE WHEN p_image_path IS NOT NULL THEN NULL
                       WHEN direct_image IS NOT NULL THEN direct_image ELSE current_pick.image_url END,
        banner_focus_x=p_banner_focus_x,
        banner_focus_y=p_banner_focus_y,
        image_focus_x=p_image_focus_x,
        image_focus_y=p_image_focus_y,
        edited_at=now(),edited_by=me
  WHERE id=current_pick.id;
  RETURN current_pick.id;
END
$function$;

REVOKE ALL ON FUNCTION public.ae_update_editorial_weekly_pick(
 uuid,timestamptz,text,text,text,integer,text,timestamptz,
 text,text,text,text,integer,integer,integer,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ae_update_editorial_weekly_pick(
 uuid,timestamptz,text,text,text,integer,text,timestamptz,
 text,text,text,text,integer,integer,integer,integer
) TO authenticated;

COMMIT;
