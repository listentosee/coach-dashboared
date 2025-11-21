-- Queue of admin alerts keyed by message so we only notify once per message/recipient
CREATE TABLE IF NOT EXISTS public.admin_alert_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure we never enqueue the same message twice for the same admin/channel
CREATE UNIQUE INDEX IF NOT EXISTS admin_alert_queue_recipient_message_idx
  ON public.admin_alert_queue (recipient_id, message_id);

-- RLS: only service role can read/write; block anonymous/authenticated
ALTER TABLE public.admin_alert_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_alert_queue_service_rw') THEN
    CREATE POLICY admin_alert_queue_service_rw ON public.admin_alert_queue
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
