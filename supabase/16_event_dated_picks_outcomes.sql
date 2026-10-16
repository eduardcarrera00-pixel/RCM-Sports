-- AE SPORTS: Picks with event dates, verified outcomes and transparent rankings.
-- Expired picks are ARCHIVED, NEVER deleted, so result audits and links survive.
-- Rankings based on results are intentionally independent of vote leaderboards.
ALTER TABLE public.ae_community_picks
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by uuid,
  ADD COLUMN IF NOT EXISTS result_points numeric(12,2) GENERATED ALWAYS AS
    (CASE
      WHEN outcome = 'won' THEN round(abs(american_odds)::numeric / 100,2)
      WHEN outcome = 'lost' THEN -round(abs(american_odds)::numeric / 100,2)
      ELSE 0::numeric
    END) STORED;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ae_community_picks_outcome_check') THEN
    ALTER TABLE public.ae_community_picks ADD CONSTRAINT ae_community_picks_outcome_check
      CHECK (outcome IN ('pending','won','lost','void'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ae_pick_result_settlement_check') THEN
    ALTER TABLE public.ae_community_picks ADD CONSTRAINT ae_pick_result_settlement_check
      CHECK ((outcome='pending' AND settled_at IS NULL AND settled_by IS NULL)
        OR (outcome<>'pending' AND settled_at IS NOT NULL AND settled_by IS NOT NULL));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ae_pick_event_date_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE today date := (now() AT TIME ZONE 'America/Toronto')::date;
BEGIN
  IF NEW.event_date IS NULL THEN
    RAISE EXCEPTION 'Indica la fecha del evento de tu Pick';
  END IF;
  IF NEW.event_date < today OR NEW.event_date > today + 180 THEN
    RAISE EXCEPTION 'El evento debe celebrarse hoy o dentro de los próximos 180 días';
  END IF;
  IF NEW.outcome IS DISTINCT FROM 'pending' OR NEW.settled_at IS NOT NULL OR NEW.settled_by IS NOT NULL THEN
    RAISE EXCEPTION 'El resultado lo valida la administración después del evento';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ae_pick_event_date_guard_on_insert ON public.ae_community_picks;
CREATE TRIGGER ae_pick_event_date_guard_on_insert BEFORE INSERT ON public.ae_community_picks
FOR EACH ROW EXECUTE FUNCTION public.ae_pick_event_date_guard();

CREATE OR REPLACE FUNCTION public.ae_pick_vote_event_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE the_pick uuid; today date := (now() AT TIME ZONE 'America/Toronto')::date;
BEGIN
  the_pick:=CASE WHEN TG_OP='DELETE' THEN OLD.pick_id ELSE NEW.pick_id END;
  IF NOT EXISTS (
    SELECT 1 FROM public.ae_community_picks p
    WHERE p.id=the_pick AND NOT p.hidden AND p.moderation_status='approved'
      AND p.event_date>=today AND p.outcome='pending'
  ) THEN RAISE EXCEPTION 'Este Pick ya venció, está resuelto o no admite votos'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS ae_pick_vote_event_guard_before ON public.ae_pick_votes;
CREATE TRIGGER ae_pick_vote_event_guard_before BEFORE INSERT OR UPDATE OR DELETE
ON public.ae_pick_votes FOR EACH ROW EXECUTE FUNCTION public.ae_pick_vote_event_guard();

-- Preserve RLS-aware visibility and all existing feed columns, adding outcome data.
CREATE OR REPLACE VIEW public.ae_pick_feed AS
SELECT p.id,p.user_id,p.author,p.title,p.explanation,p.legs,
  p.decimal_odds,p.american_odds,p.created_at,p.publication_day,p.hidden,
  (p.created_at AT TIME ZONE 'America/Toronto') >= date_trunc('week',now() AT TIME ZONE 'America/Toronto') AS is_current_week,
  (SELECT count(*) FROM public.ae_pick_votes v WHERE v.pick_id=p.id AND v.value=1) AS upvotes,
  (SELECT count(*) FROM public.ae_pick_votes v WHERE v.pick_id=p.id AND v.value=-1) AS downvotes,
  (SELECT coalesce(sum(v.value),0) FROM public.ae_pick_votes v WHERE v.pick_id=p.id) AS score,
  (SELECT coalesce(max(v.value)::integer,0) FROM public.ae_pick_votes v WHERE v.pick_id=p.id AND v.user_id=auth.uid()) AS my_vote,
  (SELECT count(*) FROM public.ae_pick_comments c WHERE c.pick_id=p.id AND NOT c.hidden) AS comments_count,
  p.moderation_status,
  p.event_date,p.outcome,p.settled_at,p.result_points
FROM public.ae_community_picks p
WHERE NOT p.hidden AND
  (p.moderation_status='approved' OR p.user_id=auth.uid() OR public.rcm_is_editor());

-- Editor confirms official event result. Never infer the outcome from votes.
CREATE OR REPLACE FUNCTION public.ae_pick_settle_result(p_pick_id uuid,p_outcome text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE points numeric; already text; eventday date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.rcm_is_editor() THEN
    RAISE EXCEPTION 'Solo administradores pueden confirmar resultados';
  END IF;
  IF p_outcome NOT IN ('won','lost','void') OR p_outcome IS NULL THEN
    RAISE EXCEPTION 'Resultado inválido';
  END IF;
  SELECT p.outcome,p.event_date INTO already,eventday
  FROM public.ae_community_picks p WHERE p.id=p_pick_id AND NOT p.hidden
    AND p.moderation_status='approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pick no disponible o sin aprobar'; END IF;
  IF eventday IS NULL OR eventday>(now() AT TIME ZONE 'America/Toronto')::date THEN
    RAISE EXCEPTION 'El evento aún no ha terminado o no tiene fecha verificada';
  END IF;
  IF already <> 'pending' THEN
    RAISE EXCEPTION 'El Pick ya tiene un resultado confirmado y no puede modificarse';
  END IF;
  UPDATE public.ae_community_picks SET outcome=p_outcome,settled_at=now(),settled_by=auth.uid()
  WHERE id=p_pick_id RETURNING result_points INTO points;
  RETURN points;
END $$;
REVOKE ALL ON FUNCTION public.ae_pick_settle_result(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ae_pick_settle_result(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ae_pick_settle_result(uuid,text) TO authenticated;

-- Current month or historical totals. Score +abs(odds)/100 for successes,
-- -abs(odds)/100 for failures, 0 for canceled events.
CREATE OR REPLACE FUNCTION public.ae_pick_result_ranking(p_period text DEFAULT 'month')
RETURNS TABLE(user_id uuid,username text,points numeric,correct_picks bigint,total_resolved bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_period NOT IN ('month','all') OR p_period IS NULL THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
  RETURN QUERY
  SELECT p.user_id,
    coalesce(nullif(max(p.author),''),'Aficionado')::text,
    sum(p.result_points)::numeric(12,2),
    count(*) FILTER(WHERE p.outcome='won')::bigint,
    count(*)::bigint
  FROM public.ae_community_picks p
  WHERE NOT p.hidden AND p.moderation_status='approved'
    AND p.outcome IN ('won','lost','void')
    AND (p_period='all'
      OR date_trunc('month',p.event_date::timestamp)=date_trunc('month',(now() AT TIME ZONE 'America/Toronto')))
  GROUP BY p.user_id
  ORDER BY sum(p.result_points) DESC,
    count(*) FILTER(WHERE p.outcome='won') DESC,p.user_id
  LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.ae_pick_result_ranking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ae_pick_result_ranking(text) TO anon, authenticated;

-- Explicit admin recovery for pre-migration Picks (historical records had
-- no event date). Never invent an event date from publication timestamps.
CREATE OR REPLACE FUNCTION public.ae_pick_set_legacy_event_date(p_pick_id uuid,p_event_date date)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
DECLARE day date;
BEGIN
 IF auth.uid() IS NULL OR NOT public.rcm_is_editor() THEN
   RAISE EXCEPTION 'Solo administradores pueden verificar la fecha de Picks antiguos';
 END IF;
 IF p_event_date IS NULL THEN RAISE EXCEPTION 'Indica la fecha real del evento'; END IF;
 UPDATE public.ae_community_picks p SET event_date=p_event_date
 WHERE p.id=p_pick_id AND NOT p.hidden AND p.event_date IS NULL
   AND p.moderation_status IN ('approved','pending')
   AND p_event_date>=p.publication_day
   AND p_event_date<=(now() AT TIME ZONE 'America/Toronto')::date+180
 RETURNING p.event_date INTO day;
 IF day IS NULL THEN RAISE EXCEPTION 'La fecha no es válida o el Pick ya tiene una fecha'; END IF;
 RETURN day;
END $;
REVOKE ALL ON FUNCTION public.ae_pick_set_legacy_event_date(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ae_pick_set_legacy_event_date(uuid,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.ae_pick_set_legacy_event_date(uuid,date) TO authenticated;

CREATE INDEX IF NOT EXISTS ae_pick_event_outcome_idx ON public.ae_community_picks(event_date,outcome)
WHERE NOT hidden AND moderation_status='approved';
