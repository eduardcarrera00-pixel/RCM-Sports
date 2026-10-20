-- CAM SPORTS: one private welcome exactly five minutes after a new username account is created.
-- No backfill: existing members and admins do not receive a new notification.
ALTER TABLE public.ae_notifications
  DROP CONSTRAINT IF EXISTS ae_notifications_event_key_check;
ALTER TABLE public.ae_notifications
  ADD CONSTRAINT ae_notifications_event_key_check
  CHECK (event_key = ANY (ARRAY['take_reply','pick_reply','article_reply','take_vote','pick_vote','comment_vote','article_like','welcome']));

ALTER TABLE public.ae_notifications
  DROP CONSTRAINT IF EXISTS ae_notifications_target_kind_check;
ALTER TABLE public.ae_notifications
  ADD CONSTRAINT ae_notifications_target_kind_check
  CHECK (target_kind = ANY (ARRAY['take','pick','article','account']));

CREATE OR REPLACE FUNCTION public.ae_schedule_welcome_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  registered_at timestamptz;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
  END IF;
  SELECT u.created_at INTO registered_at
  FROM auth.users AS u
  WHERE u.id = NEW.user_id AND NOT COALESCE(u.is_anonymous, false);
  IF registered_at IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.ae_notifications
    (recipient_id,actor_id,event_key,target_kind,target_id,source_id,
     actor_name,context_title,created_at)
  VALUES
    (NEW.user_id,NEW.user_id,'welcome','account',NEW.user_id,NEW.user_id,
     'CAM SPORTS','Tu nueva comunidad deportiva',registered_at + interval '5 minutes')
  ON CONFLICT (recipient_id,event_key,source_id,actor_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification must never prevent a new member from registering.
  RAISE LOG 'CAM SPORTS welcome notification: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ae_schedule_welcome_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ae_account_schedule_welcome ON public.ae_auth_accounts;
CREATE TRIGGER ae_account_schedule_welcome
AFTER INSERT OR UPDATE OF user_id ON public.ae_auth_accounts
FOR EACH ROW EXECUTE FUNCTION public.ae_schedule_welcome_notification();