-- Aggregate challenge categories for dashboard drilldowns
CREATE OR REPLACE FUNCTION public.get_dashboard_category_totals(p_synced_user_ids text[])
RETURNS TABLE (
  synced_user_id text,
  challenge_category text,
  challenges integer,
  points integer
)
LANGUAGE sql
AS $$
  SELECT
    synced_user_id,
    COALESCE(challenge_category, 'Uncategorized') AS challenge_category,
    COUNT(*)::int AS challenges,
    COALESCE(SUM(challenge_points), 0)::int AS points
  FROM public.game_platform_challenge_solves
  WHERE synced_user_id = ANY(p_synced_user_ids)
  GROUP BY synced_user_id, COALESCE(challenge_category, 'Uncategorized');
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_category_totals(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_category_totals(text[]) TO service_role;
