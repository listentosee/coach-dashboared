-- Recurring jobs table for scheduled background tasks
-- This allows admins to configure recurring jobs without touching vercel.json

CREATE TABLE IF NOT EXISTS recurring_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, -- Friendly name like "Hourly Incremental Sync"
  task_type text NOT NULL, -- e.g., 'game_platform_sync', 'game_platform_totals_sweep'
  payload jsonb DEFAULT '{}'::jsonb, -- Task-specific parameters
  schedule_interval_minutes integer NOT NULL, -- How often to run (e.g., 60 for hourly)
  enabled boolean NOT NULL DEFAULT true,
  last_enqueued_at timestamptz, -- When we last created a job for this
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),

  CONSTRAINT valid_interval CHECK (schedule_interval_minutes > 0),
  CONSTRAINT valid_task_type CHECK (task_type IN ('game_platform_sync', 'game_platform_totals_sweep'))
);

-- Index for finding jobs that need to be scheduled
CREATE INDEX idx_recurring_jobs_enabled_next_run
  ON recurring_jobs(enabled, last_enqueued_at)
  WHERE enabled = true;

-- Function to check which recurring jobs need to be enqueued
CREATE OR REPLACE FUNCTION get_recurring_jobs_to_enqueue()
RETURNS TABLE (
  id uuid,
  name text,
  task_type text,
  payload jsonb,
  schedule_interval_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rj.id,
    rj.name,
    rj.task_type,
    rj.payload,
    rj.schedule_interval_minutes
  FROM recurring_jobs rj
  WHERE rj.enabled = true
    AND (
      rj.last_enqueued_at IS NULL
      OR rj.last_enqueued_at < now() - (rj.schedule_interval_minutes || ' minutes')::interval
    );
END;
$$;

-- Function to mark a recurring job as enqueued
CREATE OR REPLACE FUNCTION mark_recurring_job_enqueued(job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recurring_jobs
  SET last_enqueued_at = now(),
      updated_at = now()
  WHERE id = job_id;
END;
$$;

-- RLS policies
ALTER TABLE recurring_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can manage recurring jobs
CREATE POLICY recurring_jobs_admin_all
  ON recurring_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role can read/update for job scheduling
CREATE POLICY recurring_jobs_service_role
  ON recurring_jobs
  FOR ALL
  TO service_role
  USING (true);

-- Insert default recurring jobs
INSERT INTO recurring_jobs (name, task_type, payload, schedule_interval_minutes, enabled)
VALUES
  ('Hourly Incremental Sync', 'game_platform_sync', '{"dryRun": false}'::jsonb, 60, true),
  ('Daily Totals Sweep', 'game_platform_totals_sweep', '{"batchSize": 50}'::jsonb, 1440, true)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE recurring_jobs IS 'Recurring background jobs scheduled by admins. The cron worker checks this table and enqueues jobs as needed.';
COMMENT ON COLUMN recurring_jobs.schedule_interval_minutes IS 'How often to run this job (e.g., 60 = hourly, 1440 = daily)';
COMMENT ON COLUMN recurring_jobs.last_enqueued_at IS 'Last time we created a job_queue entry for this recurring job';
