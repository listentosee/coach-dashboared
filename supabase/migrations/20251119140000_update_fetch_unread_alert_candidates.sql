-- Allow fetch_unread_alert_candidates to target roles beyond coaches
-- and reuse existing cooldown logic for admins.
CREATE OR REPLACE FUNCTION public.fetch_unread_alert_candidates(
  p_window_minutes integer DEFAULT 1440,
  p_coach_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false,
  p_roles text[] DEFAULT ARRAY['coach']
)
RETURNS TABLE (
  coach_id uuid,
  email text,
  full_name text,
  first_name text,
  mobile_number text,
  unread_count integer,
  email_alerts_enabled boolean,
  email_alert_address text,
  sms_notifications_enabled boolean,
  last_unread_alert_at timestamptz,
  last_unread_alert_count integer
) LANGUAGE sql
SET search_path = public
STABLE
AS $$
  WITH unread AS (
    SELECT
      p.id AS coach_id,
      p.email,
      p.full_name,
      p.first_name,
      p.mobile_number,
      COALESCE(count_unread_by_receipts(p.id), count_unread_messages(p.id)) AS unread_count,
      p.email_alerts_enabled,
      p.email_alert_address,
      p.sms_notifications_enabled,
      p.last_unread_alert_at,
      p.last_unread_alert_count
    FROM public.profiles p
    WHERE (
      p_roles IS NULL
      OR array_length(p_roles, 1) IS NULL
      OR p.role::text = ANY(p_roles)
    )
      AND (p_coach_id IS NULL OR p.id = p_coach_id)
  )
  SELECT *
  FROM unread
  WHERE unread_count > 0
    AND (
      p_force
      OR last_unread_alert_at IS NULL
      OR last_unread_alert_count IS NULL
      OR unread_count > last_unread_alert_count
      OR last_unread_alert_at < now() - make_interval(mins => COALESCE(p_window_minutes, 1440))
    )
  ORDER BY unread_count DESC;
$$;
