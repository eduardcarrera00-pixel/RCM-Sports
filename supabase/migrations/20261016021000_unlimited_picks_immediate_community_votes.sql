-- AE SPORTS: community participation starts on publication, review follows.
-- Keep RLS, account verification, one vote per person per Pick, and moderation.
BEGIN;

-- Remove only the daily UNIQUE rule; existing records and their dates stay intact.
ALTER TABLE public.ae_community_picks
  DROP CONSTRAINT IF EXISTS ae_community_picks_user_id_publication_day_key;
CREATE INDEX IF NOT EXISTS ae_pick_author_recent_idx
  ON public.ae_community_picks(user_id, created_at DESC);

-- Pending predictions are public for voting and replies, but rejected/hidden
-- records remain invisible except to their author or editors.
ALTER POLICY ae_pick_read ON public.ae_community_picks
  USING (
    ((NOT hidden) AND moderation_status IN ('pending','approved'))
    OR user_id = (SELECT auth.uid())
    OR (SELECT public.rcm_is_editor())
  );

-- Pending and approved Picks both accept community votes until their event.
-- Author self-votes and anonymous accounts are still blocked.
ALTER POLICY ae_vote_insert ON public.ae_pick_votes
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND NOT COALESCE((auth.jwt()->>'is_anonymous')::boolean,false)
    AND EXISTS (
      SELECT 1 FROM public.ae_community_picks p
      WHERE p.id = pick_id
        AND NOT p.hidden
        AND p.moderation_status IN ('pending','approved')
        AND p.outcome = 'pending'
        AND p.event_date >= (now() AT TIME ZONE 'America/Toronto')::date
        AND p.user_id <> (SELECT auth.uid())
    )
  );
ALTER POLICY ae_vote_update ON public.ae_pick_votes
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND NOT COALESCE((auth.jwt()->>'is_anonymous')::boolean,false)
    AND EXISTS (
      SELECT 1 FROM public.ae_community_picks p
      WHERE p.id = pick_id
        AND NOT p.hidden
        AND p.moderation_status IN ('pending','approved')
        AND p.outcome = 'pending'
        AND p.event_date >= (now() AT TIME ZONE 'America/Toronto')::date
        AND p.user_id <> (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.ae_pick_vote_event_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  the_pick uuid;
  today date := (now() AT TIME ZONE 'America/Toronto')::date;
BEGIN
  the_pick := CASE WHEN TG_OP = 'DELETE' THEN OLD.pick_id ELSE NEW.pick_id END;
  IF NOT EXISTS (
    SELECT 1 FROM public.ae_community_picks p
    WHERE p.id = the_pick
      AND NOT p.hidden
      AND p.moderation_status IN ('pending','approved')
      AND p.event_date >= today
      AND p.outcome = 'pending'
  ) THEN
    RAISE EXCEPTION 'Este Pick ya venció, fue rechazado o no admite votos';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.ae_pick_vote_event_guard() FROM PUBLIC, anon, authenticated;

-- Retain existing view columns, ordering, permissions and vote aggregation.
-- Only widen public feed visibility from approved to approved OR pending.
CREATE OR REPLACE VIEW public.ae_pick_feed AS
SELECT
  p.id, p.user_id, p.author, p.title, p.explanation, p.legs,
  p.decimal_odds, p.american_odds, p.created_at, p.publication_day,
  p.hidden,
  (p.created_at AT TIME ZONE 'America/Toronto') >= date_trunc('week', now() AT TIME ZONE 'America/Toronto') AS is_current_week,
  (SELECT count(*) FROM public.ae_pick_votes v WHERE v.pick_id = p.id AND v.value = 1) AS upvotes,
  (SELECT count(*) FROM public.ae_pick_votes v WHERE v.pick_id = p.id AND v.value = -1) AS downvotes,
  (SELECT COALESCE(sum(v.value),0::bigint) FROM public.ae_pick_votes v WHERE v.pick_id = p.id) AS score,
  (SELECT COALESCE(max(v.value)::integer,0) FROM public.ae_pick_votes v WHERE v.pick_id = p.id AND v.user_id = auth.uid()) AS my_vote,
  (SELECT count(*) FROM public.ae_pick_comments c WHERE c.pick_id = p.id AND NOT c.hidden) AS comments_count,
  p.moderation_status, p.event_date, p.outcome, p.settled_at, p.result_points
FROM public.ae_community_picks p
WHERE NOT p.hidden
  AND (p.moderation_status IN ('pending','approved')
       OR p.user_id = auth.uid()
       OR public.rcm_is_editor());

-- Enforce underlying RLS even when the feed is queried through its view.
ALTER VIEW public.ae_pick_feed SET (security_invoker = true);

COMMIT;
