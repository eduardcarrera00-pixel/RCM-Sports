-- AE SPORTS: editable editorial image framing and monthly Pick rankings.
BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS image_focus_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focus_y integer NOT NULL DEFAULT 50;
ALTER TABLE public.articles
  ADD CONSTRAINT ae_articles_image_focus_range
  CHECK (image_focus_x BETWEEN 0 AND 100 AND image_focus_y BETWEEN 0 AND 100);

ALTER TABLE public.ae_editorial_weekly_picks
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS banner_focus_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_focus_y integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focus_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focus_y integer NOT NULL DEFAULT 50;
ALTER TABLE public.ae_editorial_weekly_picks
  ADD CONSTRAINT ae_weekly_media_focus_range
  CHECK (banner_focus_x BETWEEN 0 AND 100 AND banner_focus_y BETWEEN 0 AND 100
     AND image_focus_x BETWEEN 0 AND 100 AND image_focus_y BETWEEN 0 AND 100);
ALTER TABLE public.ae_editorial_weekly_picks
  ADD CONSTRAINT ae_weekly_https_image_urls
  CHECK (
    (banner_url IS NULL OR
     (length(banner_url) BETWEEN 9 AND 2048 AND banner_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'))
    AND
    (image_url IS NULL OR
     (length(image_url) BETWEEN 9 AND 2048 AND image_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'))
  );

-- Keep the previous, admin-protected publisher and its storage ownership
-- checks; add only framing and direct HTTPS image references in one transaction.
CREATE OR REPLACE FUNCTION public.ae_publish_editorial_weekly_pick_visual_v2(
  p_title text, p_event_name text, p_selection text, p_american_odds integer,
  p_analysis text, p_expires_at timestamptz,
  p_banner_path text, p_image_path text,
  p_banner_url text, p_image_url text,
  p_banner_focus_x integer, p_banner_focus_y integer,
  p_image_focus_x integer, p_image_focus_y integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  new_id uuid;
  direct_banner text := NULLIF(BTRIM(p_banner_url),'');
  direct_image text := NULLIF(BTRIM(p_image_url),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.rcm_is_editor() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  IF COALESCE(p_banner_focus_x,-1) NOT BETWEEN 0 AND 100
     OR COALESCE(p_banner_focus_y,-1) NOT BETWEEN 0 AND 100
     OR COALESCE(p_image_focus_x,-1) NOT BETWEEN 0 AND 100
     OR COALESCE(p_image_focus_y,-1) NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'El encuadre debe estar entre 0 y 100';
  END IF;
  IF (direct_banner IS NOT NULL AND
      (length(direct_banner) > 2048 OR direct_banner !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'))
     OR (direct_image IS NOT NULL AND
      (length(direct_image) > 2048 OR direct_image !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$')) THEN
    RAISE EXCEPTION 'Las URL de imagen deben usar HTTPS y un dominio válido';
  END IF;
  -- Original function validates editor identity, content, file paths and ownership.
  new_id := public.ae_publish_editorial_weekly_pick_visual(
    p_title, p_event_name, p_selection, p_american_odds,
    p_analysis, p_expires_at, p_banner_path, p_image_path
  );
  UPDATE public.ae_editorial_weekly_picks SET
    banner_url = CASE WHEN p_banner_path IS NULL THEN direct_banner ELSE NULL END,
    image_url = CASE WHEN p_image_path IS NULL THEN direct_image ELSE NULL END,
    banner_focus_x=p_banner_focus_x, banner_focus_y=p_banner_focus_y,
    image_focus_x=p_image_focus_x, image_focus_y=p_image_focus_y
  WHERE id=new_id AND created_by=auth.uid();
  RETURN new_id;
END
$function$;
REVOKE ALL ON FUNCTION public.ae_publish_editorial_weekly_pick_visual_v2(
 text,text,text,integer,text,timestamptz,text,text,text,text,integer,integer,integer,integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ae_publish_editorial_weekly_pick_visual_v2(
 text,text,text,integer,text,timestamptz,text,text,text,text,integer,integer,integer,integer
) TO authenticated;

-- Confirm outcomes of legacy Picks without forcing admins to invent a date.
-- New Picks still require a real, elapsed event_date; legacy records must have
-- been published before today and remain approved.
CREATE OR REPLACE FUNCTION public.ae_pick_settle_result(p_pick_id uuid,p_outcome text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  points numeric;
  old_outcome text;
  eventday date;
  published date;
  today date := (now() AT TIME ZONE 'America/Toronto')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.rcm_is_editor() THEN
    RAISE EXCEPTION 'Solo administradores pueden confirmar resultados';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('won','lost','void') THEN
    RAISE EXCEPTION 'Resultado inválido';
  END IF;
  SELECT p.outcome,p.event_date,p.publication_day
    INTO old_outcome,eventday,published
  FROM public.ae_community_picks p
  WHERE p.id=p_pick_id AND NOT p.hidden AND p.moderation_status='approved'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pick no disponible o sin aprobar'; END IF;
  IF old_outcome <> 'pending' THEN RAISE EXCEPTION 'Resultado ya confirmado'; END IF;
  IF eventday IS NOT NULL AND eventday > today THEN
    RAISE EXCEPTION 'El evento todavía no ha llegado';
  END IF;
  IF eventday IS NULL AND (published >= today OR published > DATE '2026-10-15') THEN
    RAISE EXCEPTION 'Los Picks nuevos necesitan una fecha de evento';
  END IF;
  UPDATE public.ae_community_picks
    SET outcome=p_outcome,settled_at=now(),settled_by=auth.uid()
  WHERE id=p_pick_id RETURNING result_points INTO points;
  RETURN points;
END
$function$;

-- Generated result_points already awards +abs(american_odds)/100 for wins,
-- the negative for losses and zero for void. Do not recalculate it in JS.
-- Monthly window uses the confirmation date in Toronto. On day 1 it naturally
-- starts fresh, while the historical ranking remains unchanged.
CREATE OR REPLACE FUNCTION public.ae_pick_result_ranking(p_period text DEFAULT 'month')
RETURNS TABLE(user_id uuid,username text,points numeric,correct_picks bigint,total_resolved bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF p_period IS NULL OR p_period NOT IN ('month','all') THEN
    RAISE EXCEPTION 'Periodo inválido';
  END IF;
  RETURN QUERY
    SELECT p.user_id,
      COALESCE(NULLIF(max(p.author),''),'Aficionado')::text,
      sum(p.result_points)::numeric(12,2),
      count(*) FILTER(WHERE p.outcome='won')::bigint,
      count(*)::bigint
    FROM public.ae_community_picks p
    WHERE NOT p.hidden AND p.moderation_status='approved'
      AND p.outcome IN ('won','lost','void')
      AND p.settled_at IS NOT NULL
      AND (p_period='all' OR date_trunc('month',p.settled_at AT TIME ZONE 'America/Toronto')
             = date_trunc('month',now() AT TIME ZONE 'America/Toronto'))
    GROUP BY p.user_id
    ORDER BY sum(p.result_points) DESC,
             count(*) FILTER(WHERE p.outcome='won') DESC,p.user_id
    LIMIT 10;
END
$function$;
COMMIT;
