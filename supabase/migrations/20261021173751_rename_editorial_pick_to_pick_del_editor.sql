-- CAM SPORTS: user-facing label only. Keep weekly ids, URLs, triggers, and timing unchanged.
-- Run against the existing functions without changing authorization or publication behavior.
DO $cam_branding$
DECLARE
  entry record;
  before_def text;
  after_def text;
BEGIN
  FOR entry IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prokind = 'f'
      AND ((n.nspname = 'cam_social' AND p.proname = 'capture')
        OR (n.nspname = 'public' AND p.proname IN
          ('ae_publish_editorial_weekly_pick', 'ae_update_editorial_weekly_pick', 'cam_resolve_weekly_pick')))
  LOOP
    before_def := pg_get_functiondef(entry.oid);
    after_def := replace(before_def, 'Pick de la Semana', 'Pick del editor');
    IF after_def IS DISTINCT FROM before_def THEN
      EXECUTE after_def;
    END IF;
  END LOOP;
END
$cam_branding$;

UPDATE cam_social.events
SET payload = replace(payload::text, 'Pick de la Semana', 'Pick del editor')::jsonb
WHERE payload::text LIKE '%Pick de la Semana%';
