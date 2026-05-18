-- supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql
-- Org-wide monthly non-CTF/CTF challenge-solve counts for the admin analytics chart.
CREATE OR REPLACE FUNCTION public.get_analytics_challenge_activity_monthly()
RETURNS TABLE (
  month date,
  source text,
  solves integer
)
LANGUAGE sql
AS $$
  SELECT
    (date_trunc('month', solved_at))::date AS month,
    source,
    COUNT(*)::int AS solves
  FROM public.game_platform_challenge_solves
  WHERE solved_at >= '2025-11-01T00:00:00Z'
    AND solved_at <  '2026-06-01T00:00:00Z'
  GROUP BY date_trunc('month', solved_at), source;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_challenge_activity_monthly() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_challenge_activity_monthly() TO service_role;
