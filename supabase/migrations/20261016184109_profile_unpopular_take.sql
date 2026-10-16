-- AE SPORTS: user-selected Unpopular Take for the private profile.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ae_profile_take_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unpopular_take_id uuid REFERENCES public.ae_free_takes(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ae_profile_take_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ae_profile_take_preferences FROM anon, authenticated;

DROP POLICY IF EXISTS ae_profile_take_preferences_owner_read ON public.ae_profile_take_preferences;
CREATE POLICY ae_profile_take_preferences_owner_read
ON public.ae_profile_take_preferences
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.ae_my_profile_unpopular_take()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  me uuid := auth.uid();
  chosen uuid;
BEGIN
  IF me IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
    RAISE EXCEPTION 'Inicia sesión para ver tu perfil';
  END IF;

  SELECT p.unpopular_take_id
    INTO chosen
  FROM public.ae_profile_take_preferences p
  WHERE p.user_id = me;

  RETURN chosen;
END
$function$;

REVOKE ALL ON FUNCTION public.ae_my_profile_unpopular_take() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ae_my_profile_unpopular_take() TO authenticated;

CREATE OR REPLACE FUNCTION public.ae_set_my_profile_unpopular_take(p_take_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
    RAISE EXCEPTION 'Inicia sesión para editar tu perfil';
  END IF;

  IF p_take_id IS NULL THEN
    DELETE FROM public.ae_profile_take_preferences
    WHERE user_id = me;
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ae_free_takes t
    WHERE t.id = p_take_id
      AND t.user_id = me
      AND NOT t.hidden
  ) THEN
    RAISE EXCEPTION 'Solo puedes elegir uno de tus Takes publicados';
  END IF;

  INSERT INTO public.ae_profile_take_preferences(user_id, unpopular_take_id, updated_at)
  VALUES(me, p_take_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET unpopular_take_id = EXCLUDED.unpopular_take_id,
        updated_at = now();

  RETURN p_take_id;
END
$function$;

REVOKE ALL ON FUNCTION public.ae_set_my_profile_unpopular_take(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ae_set_my_profile_unpopular_take(uuid) TO authenticated;

COMMIT;
