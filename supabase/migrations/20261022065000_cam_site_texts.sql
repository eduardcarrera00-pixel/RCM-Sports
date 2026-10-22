-- CAM SPORTS · Textos fijos editables; sin contenido de usuarios ni HTML ejecutable.
CREATE TABLE IF NOT EXISTS public.cam_site_texts (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9.-]{1,79}$'),
  content text CHECK (content IS NULL OR (char_length(content) BETWEEN 1 AND 600 AND btrim(content) <> '')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cam_site_texts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cam_site_texts_public_read ON public.cam_site_texts;
CREATE POLICY cam_site_texts_public_read ON public.cam_site_texts FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON TABLE public.cam_site_texts FROM anon, authenticated;
GRANT SELECT ON TABLE public.cam_site_texts TO anon, authenticated;

-- Único canal de escritura. La autorización se verifica siempre en PostgreSQL.
CREATE OR REPLACE FUNCTION public.cam_set_site_text(
  p_key text, p_content text, p_settings jsonb DEFAULT '{}'::jsonb
) RETURNS public.cam_site_texts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  me uuid := auth.uid();
  k text; v jsonb; n numeric;
  result_row public.cam_site_texts;
BEGIN
  IF me IS NULL OR NOT public.rcm_is_editor() THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar los textos de CAM SPORTS';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9.-]{1,79}$' THEN
    RAISE EXCEPTION 'Identificador de texto no válido';
  END IF;
  IF p_content IS NOT NULL AND (char_length(p_content) NOT BETWEEN 1 AND 600 OR btrim(p_content) = '') THEN
    RAISE EXCEPTION 'Texto vacío o demasiado largo (máximo 600 caracteres)';
  END IF;
  p_settings := coalesce(p_settings, '{}'::jsonb);
  IF jsonb_typeof(p_settings) <> 'object' OR pg_catalog.pg_column_size(p_settings) > 3000 THEN
    RAISE EXCEPTION 'Formato de estilo no válido';
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(p_settings)
  LOOP
    CASE k
      WHEN 'desktopSize', 'mobileSize' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN 12 AND 72 THEN
          RAISE EXCEPTION 'El tamaño debe estar entre 12 y 72 px';
        END IF;
      WHEN 'desktopWidth', 'mobileWidth' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN 0 AND 1200 THEN
          RAISE EXCEPTION 'Ancho no válido';
        END IF;
      WHEN 'desktopX', 'desktopY', 'mobileX', 'mobileY' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN -12 AND 12 THEN
          RAISE EXCEPTION 'Desplazamiento fuera de los límites seguros';
        END IF;
      WHEN 'desktopAlign', 'mobileAlign' THEN
        IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') NOT IN ('inherit','left','center','right') THEN
          RAISE EXCEPTION 'Alineación no válida';
        END IF;
      WHEN 'weight' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::integer NOT IN (400,500,600,700,800,900) THEN
          RAISE EXCEPTION 'Peso no válido';
        END IF;
      WHEN 'italic' THEN
        IF jsonb_typeof(v) <> 'boolean' THEN RAISE EXCEPTION 'Cursiva no válida'; END IF;
      WHEN 'letterSpacing' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN -0.5 AND 3 THEN
          RAISE EXCEPTION 'Espaciado de letras no válido';
        END IF;
      WHEN 'lineHeight' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN 1 AND 2 THEN
          RAISE EXCEPTION 'Altura de línea no válida';
        END IF;
      WHEN 'padding', 'gap' THEN
        IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN 0 AND 24 THEN
          RAISE EXCEPTION 'Espaciado fuera de rango';
        END IF;
      WHEN 'colorDay', 'colorNight' THEN
        IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') NOT IN ('auto','ink','bronze','blue','muted') THEN
          RAISE EXCEPTION 'Color fuera de la paleta CAM SPORTS';
        END IF;
      ELSE
        RAISE EXCEPTION 'Propiedad de estilo no permitida: %', k;
    END CASE;
  END LOOP;
  INSERT INTO public.cam_site_texts AS t(key,content,settings,updated_by,updated_at)
  VALUES (p_key,p_content,p_settings,me,now())
  ON CONFLICT(key) DO UPDATE SET
    content=EXCLUDED.content,settings=EXCLUDED.settings,updated_by=me,updated_at=now()
  RETURNING t.* INTO result_row;
  RETURN result_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cam_reset_site_text(p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.rcm_is_editor() THEN
    RAISE EXCEPTION 'Solo un administrador puede restaurar los textos de CAM SPORTS';
  END IF;
  DELETE FROM public.cam_site_texts WHERE key=p_key;
END;
$function$;

REVOKE ALL ON FUNCTION public.cam_set_site_text(text,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cam_reset_site_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cam_set_site_text(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cam_reset_site_text(text) TO authenticated;
