-- AE SPORTS: unified NFL/Fútbol Take composer with manual competition field.
BEGIN;

ALTER TABLE public.ae_free_takes
  ADD COLUMN IF NOT EXISTS competition text;

UPDATE public.ae_free_takes
SET competition = CASE sport
  WHEN 'nfl' THEN 'NFL'
  WHEN 'laliga' THEN 'LaLiga'
  WHEN 'premier' THEN 'Premier League'
  WHEN 'ligamx' THEN 'Liga MX'
  WHEN 'champions' THEN 'Champions League'
  WHEN 'colegial' THEN 'Fútbol colegial'
  WHEN 'general' THEN 'Deporte en general'
  WHEN 'football' THEN 'Fútbol'
  ELSE 'Deportes'
END
WHERE competition IS NULL OR btrim(competition) = '';

ALTER TABLE public.ae_free_takes
  DROP CONSTRAINT IF EXISTS ae_free_takes_competition_length;
ALTER TABLE public.ae_free_takes
  ADD CONSTRAINT ae_free_takes_competition_length
  CHECK (competition IS NULL OR char_length(btrim(competition)) BETWEEN 2 AND 80);

DROP FUNCTION IF EXISTS public.ae_post_free_take(text,text,text);
DROP FUNCTION IF EXISTS public.ae_post_free_take(text,text,text,text);

CREATE FUNCTION public.ae_post_free_take(
  p_sport text,
  p_title text,
  p_body text,
  p_competition text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  me uuid := auth.uid();
  saved uuid;
  clean_competition text;
BEGIN
  IF me IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
    RAISE EXCEPTION 'Inicia sesión';
  END IF;

  IF p_sport IS NULL OR p_sport NOT IN ('football','nfl','laliga','premier','ligamx','champions','colegial','general')
     OR p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 5 AND 160
     OR p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 15 AND 1800 THEN
    RAISE EXCEPTION 'Revisa el título, contenido y deporte';
  END IF;

  clean_competition := nullif(trim(p_competition),'');
  IF clean_competition IS NULL THEN
    clean_competition := CASE p_sport
      WHEN 'nfl' THEN 'NFL'
      WHEN 'football' THEN 'Fútbol'
      WHEN 'laliga' THEN 'LaLiga'
      WHEN 'premier' THEN 'Premier League'
      WHEN 'ligamx' THEN 'Liga MX'
      WHEN 'champions' THEN 'Champions League'
      WHEN 'colegial' THEN 'Fútbol colegial'
      ELSE 'Deporte en general'
    END;
  END IF;

  IF length(clean_competition) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Escribe el deporte o competición (2 a 80 caracteres)';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(me::text));
  IF (SELECT count(*) FROM public.ae_free_takes WHERE user_id=me AND created_at>now()-interval '24 hours')>=5 THEN
    RAISE EXCEPTION 'Máximo cinco Takes en 24 horas';
  END IF;

  INSERT INTO public.ae_free_takes(user_id,sport,competition,title,body)
  VALUES(me,p_sport,clean_competition,trim(p_title),trim(p_body))
  RETURNING id INTO saved;

  RETURN saved;
END
$function$;

REVOKE ALL ON FUNCTION public.ae_post_free_take(text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ae_post_free_take(text,text,text,text) TO authenticated;

DROP FUNCTION IF EXISTS public.ae_public_take_feed(text);

CREATE FUNCTION public.ae_public_take_feed(p_sport text DEFAULT 'all'::text)
RETURNS TABLE(
  id uuid,
  author_id uuid,
  author text,
  sport text,
  competition text,
  title text,
  body text,
  created_at timestamptz,
  upvotes bigint,
  downvotes bigint,
  my_vote smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    t.id,
    t.user_id,
    coalesce(
      nullif(left(u.raw_user_meta_data->>'username',40),''),
      nullif(left(u.raw_user_meta_data->>'display_name',40),''),
      'Aficionado'
    )::text,
    t.sport,
    coalesce(nullif(trim(t.competition),''), CASE t.sport
      WHEN 'nfl' THEN 'NFL'
      WHEN 'football' THEN 'Fútbol'
      WHEN 'laliga' THEN 'LaLiga'
      WHEN 'premier' THEN 'Premier League'
      WHEN 'ligamx' THEN 'Liga MX'
      WHEN 'champions' THEN 'Champions League'
      WHEN 'colegial' THEN 'Fútbol colegial'
      ELSE 'Deporte en general'
    END)::text,
    t.title,
    t.body,
    t.created_at,
    (SELECT count(*) FROM public.ae_free_take_votes v WHERE v.take_id=t.id AND v.value=1)::bigint,
    (SELECT count(*) FROM public.ae_free_take_votes v WHERE v.take_id=t.id AND v.value=-1)::bigint,
    (SELECT v.value FROM public.ae_free_take_votes v WHERE v.take_id=t.id AND v.user_id=auth.uid())
  FROM public.ae_free_takes t
  JOIN auth.users u ON u.id=t.user_id
  WHERE NOT t.hidden AND (p_sport='all' OR t.sport=p_sport)
  ORDER BY t.created_at DESC,t.id DESC
  LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.ae_public_take_feed(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ae_public_take_feed(text) TO anon, authenticated;

COMMIT;
