-- AE SPORTS: bottom 10 chefs by confirmed Pick result points, each month and all-time.
-- Follows the existing ae_pick_result_ranking eligibility and timezone rules.
CREATE OR REPLACE FUNCTION public.ae_pick_result_ranking_worst(p_period text DEFAULT 'month'::text)
RETURNS TABLE(user_id uuid, username text, points numeric, correct_picks bigint, total_resolved bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_period IS NULL OR p_period NOT IN ('month','all') THEN
    RAISE EXCEPTION 'Periodo inválido';
  END IF;
  RETURN QUERY
    SELECT p.user_id,
      COALESCE(NULLIF(MAX(p.author), ''), 'Aficionado')::text,
      SUM(p.result_points)::numeric(12,2),
      COUNT(*) FILTER (WHERE p.outcome = 'won')::bigint,
      COUNT(*)::bigint
    FROM public.ae_community_picks p
    WHERE NOT p.hidden
      AND p.moderation_status = 'approved'
      AND p.outcome IN ('won','lost','void')
      AND p.settled_at IS NOT NULL
      AND (
        p_period = 'all'
        OR date_trunc('month', p.settled_at AT TIME ZONE 'America/Toronto')
          = date_trunc('month', now() AT TIME ZONE 'America/Toronto')
      )
    GROUP BY p.user_id
    ORDER BY SUM(p.result_points) ASC,
      COUNT(*) FILTER (WHERE p.outcome = 'won') ASC, p.user_id
    LIMIT 10;
END
$function$;
REVOKE ALL ON FUNCTION public.ae_pick_result_ranking_worst(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ae_pick_result_ranking_worst(text) TO anon, authenticated, service_role;
