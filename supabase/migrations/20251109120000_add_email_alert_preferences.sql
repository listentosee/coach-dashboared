-- Adds email alert preferences so coaches can opt into daily unread email notifications.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email_alerts_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email_alert_address text,
ADD COLUMN IF NOT EXISTS sms_notifications_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_unread_alert_at timestamptz,
ADD COLUMN IF NOT EXISTS last_unread_alert_count integer;

COMMENT ON COLUMN public.profiles.email_alerts_enabled IS 'Whether the coach wants to receive unread message alerts via email';
COMMENT ON COLUMN public.profiles.email_alert_address IS 'Optional override email address for unread alerts; defaults to login email if null';
COMMENT ON COLUMN public.profiles.sms_notifications_enabled IS 'Whether the coach wants to receive SMS notifications';
COMMENT ON COLUMN public.profiles.last_unread_alert_at IS 'Timestamp of the last unread message alert that was sent (email or SMS)';
COMMENT ON COLUMN public.profiles.last_unread_alert_count IS 'Unread message count that triggered the most recent alert';

-- Track each alert attempt (email or SMS) for auditing and throttling
CREATE TABLE IF NOT EXISTS public.alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  unread_count integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  error_text text
);

CREATE INDEX IF NOT EXISTS idx_alert_log_coach_channel ON public.alert_log (coach_id, channel, sent_at DESC);

ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY alert_log_select_self ON public.alert_log
    FOR SELECT USING (coach_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY alert_log_insert_service ON public.alert_log
    FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.alert_log IS 'Audit log for unread message alerts (email/SMS).';
COMMENT ON COLUMN public.alert_log.channel IS 'Delivery channel used for the alert (email or sms)';
COMMENT ON COLUMN public.alert_log.unread_count IS 'Unread message count at the time the alert was attempted';
COMMENT ON COLUMN public.alert_log.error_text IS 'Error returned by the provider when the alert failed (if any)';

-- Helper function to fetch coaches who need alerts (based on unread count & cooldown)
CREATE OR REPLACE FUNCTION public.fetch_unread_alert_candidates(
  p_window_minutes integer DEFAULT 1440,
  p_coach_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
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
    WHERE p.role = 'coach'
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

COMMENT ON FUNCTION public.fetch_unread_alert_candidates(integer, uuid, boolean) IS 'Returns coaches that need unread message alerts based on unread counts and cooldown rules.';

-- Helper to persist the most recent alert metadata on profiles
CREATE OR REPLACE FUNCTION public.mark_unread_alert_sent(
  p_coach_id uuid,
  p_unread_count integer
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.profiles
  SET last_unread_alert_at = now(),
      last_unread_alert_count = p_unread_count
  WHERE id = p_coach_id;
$$;

COMMENT ON FUNCTION public.mark_unread_alert_sent(uuid, integer) IS 'Updates profile metadata after successfully sending an unread alert.';
