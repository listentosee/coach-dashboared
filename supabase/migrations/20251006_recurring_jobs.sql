-- Add recurring job fields to existing job_queue table
-- This allows jobs to be one-time or recurring without a separate table

-- Drop existing functions that will be modified
DROP FUNCTION IF EXISTS job_queue_claim(integer);
DROP FUNCTION IF EXISTS job_queue_mark_succeeded(uuid, jsonb);
DROP FUNCTION IF EXISTS job_queue_mark_failed(uuid, text, integer);

-- Add new columns
ALTER TABLE job_queue
ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_interval_minutes integer,
ADD COLUMN IF NOT EXISTS expires_at timestamptz,
ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

-- Add constraint that recurring jobs must have an interval
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_jobs_must_have_interval'
  ) THEN
    ALTER TABLE job_queue
    ADD CONSTRAINT recurring_jobs_must_have_interval
      CHECK (
        (is_recurring = false AND recurrence_interval_minutes IS NULL)
        OR (is_recurring = true AND recurrence_interval_minutes > 0)
      );
  END IF;
END $$;

-- Index for finding recurring jobs that need to run
CREATE INDEX IF NOT EXISTS idx_job_queue_recurring_next_run
  ON job_queue(is_recurring, last_run_at, run_at)
  WHERE is_recurring = true AND status = 'pending';

-- Recreate the job_queue_claim function to handle recurring jobs
CREATE OR REPLACE FUNCTION job_queue_claim(p_limit integer DEFAULT 5)
RETURNS SETOF job_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claimed_ids uuid[];
BEGIN
  -- First, check for recurring jobs that need to run
  -- A recurring job needs to run if:
  -- 1. It's enabled (status = 'pending')
  -- 2. It hasn't expired (expires_at is NULL or in the future)
  -- 3. It's time to run (run_at <= now OR last_run_at + interval <= now)
  UPDATE job_queue
  SET
    run_at = CASE
      WHEN last_run_at IS NULL THEN run_at
      ELSE last_run_at + (recurrence_interval_minutes || ' minutes')::interval
    END,
    status = 'running',
    attempts = attempts + 1,
    updated_at = now()
  WHERE id IN (
    SELECT id
    FROM job_queue
    WHERE is_recurring = true
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (last_run_at IS NULL AND run_at <= now())
        OR (last_run_at IS NOT NULL AND last_run_at + (recurrence_interval_minutes || ' minutes')::interval <= now())
      )
    ORDER BY run_at
    LIMIT p_limit
  )
  RETURNING id INTO v_claimed_ids;

  -- If we didn't fill the limit with recurring jobs, claim regular jobs
  IF array_length(v_claimed_ids, 1) IS NULL OR array_length(v_claimed_ids, 1) < p_limit THEN
    UPDATE job_queue
    SET
      status = 'running',
      attempts = attempts + 1,
      updated_at = now()
    WHERE id IN (
      SELECT id
      FROM job_queue
      WHERE is_recurring = false
        AND status = 'pending'
        AND run_at <= now()
        AND id != ALL(COALESCE(v_claimed_ids, ARRAY[]::uuid[]))
      ORDER BY run_at
      LIMIT p_limit - COALESCE(array_length(v_claimed_ids, 1), 0)
    )
    RETURNING id INTO v_claimed_ids;
  END IF;

  -- Return all claimed jobs
  RETURN QUERY
  SELECT *
  FROM job_queue
  WHERE id = ANY(v_claimed_ids);
END;
$$;

-- Update mark_succeeded to handle recurring jobs
CREATE OR REPLACE FUNCTION job_queue_mark_succeeded(
  p_job_id uuid,
  p_output jsonb DEFAULT NULL
)
RETURNS job_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job job_queue;
BEGIN
  UPDATE job_queue
  SET
    status = CASE
      WHEN is_recurring = true THEN 'pending'  -- Recurring jobs go back to pending
      ELSE 'succeeded'                          -- One-time jobs are done
    END,
    last_run_at = CASE
      WHEN is_recurring = true THEN now()      -- Track when recurring job last ran
      ELSE NULL
    END,
    output = p_output,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- Update mark_failed to handle recurring jobs
CREATE OR REPLACE FUNCTION job_queue_mark_failed(
  p_job_id uuid,
  p_error text,
  p_retry_in_ms integer DEFAULT NULL
)
RETURNS job_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job job_queue;
  v_should_retry boolean;
BEGIN
  SELECT * INTO v_job FROM job_queue WHERE id = p_job_id;

  -- Recurring jobs always retry (go back to pending)
  -- Regular jobs retry if they haven't hit max attempts and have a retry interval
  v_should_retry := v_job.is_recurring OR (v_job.attempts < v_job.max_attempts AND p_retry_in_ms IS NOT NULL);

  UPDATE job_queue
  SET
    status = CASE
      WHEN v_should_retry THEN 'pending'
      ELSE 'failed'
    END,
    run_at = CASE
      WHEN v_should_retry AND p_retry_in_ms IS NOT NULL THEN now() + (p_retry_in_ms || ' milliseconds')::interval
      WHEN v_should_retry AND v_job.is_recurring THEN last_run_at + (recurrence_interval_minutes || ' minutes')::interval
      ELSE run_at
    END,
    last_run_at = CASE
      WHEN v_job.is_recurring THEN now()
      ELSE NULL
    END,
    last_error = p_error,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- Insert default recurring jobs
INSERT INTO job_queue (task_type, payload, is_recurring, recurrence_interval_minutes, run_at, status)
VALUES
  ('game_platform_sync', '{"dryRun": false}'::jsonb, true, 60, now(), 'pending'),
  ('game_platform_totals_sweep', '{"batchSize": 50}'::jsonb, true, 1440, now(), 'pending')
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN job_queue.is_recurring IS 'If true, this job runs repeatedly on a schedule';
COMMENT ON COLUMN job_queue.recurrence_interval_minutes IS 'How often recurring jobs should run (required if is_recurring = true)';
COMMENT ON COLUMN job_queue.expires_at IS 'When a recurring job should stop running (NULL = forever)';
COMMENT ON COLUMN job_queue.last_run_at IS 'When a recurring job last completed (used to calculate next run time)';
