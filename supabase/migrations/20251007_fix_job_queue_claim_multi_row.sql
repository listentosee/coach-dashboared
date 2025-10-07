-- Fix job_queue_claim to properly handle multiple rows
-- The issue: RETURNING id INTO v_claimed_ids fails when multiple rows are returned
-- Solution: Collect IDs properly using a temp table or different approach

CREATE OR REPLACE FUNCTION job_queue_claim(p_limit integer DEFAULT 5)
RETURNS SETOF job_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claimed_ids uuid[];
  v_recurring_ids uuid[];
  v_regular_ids uuid[];
  v_remaining_limit integer;
BEGIN
  -- First, claim recurring jobs that need to run
  WITH recurring_to_claim AS (
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
    FOR UPDATE SKIP LOCKED
  ),
  updated_recurring AS (
    UPDATE job_queue
    SET
      run_at = CASE
        WHEN last_run_at IS NULL THEN run_at
        ELSE last_run_at + (recurrence_interval_minutes || ' minutes')::interval
      END,
      status = 'running',
      attempts = attempts + 1,
      updated_at = now()
    WHERE id IN (SELECT id FROM recurring_to_claim)
    RETURNING id
  )
  SELECT ARRAY_AGG(id) INTO v_recurring_ids FROM updated_recurring;

  -- Calculate remaining limit for regular jobs
  v_remaining_limit := p_limit - COALESCE(array_length(v_recurring_ids, 1), 0);

  -- If we didn't fill the limit with recurring jobs, claim regular jobs
  IF v_remaining_limit > 0 THEN
    WITH regular_to_claim AS (
      SELECT id
      FROM job_queue
      WHERE is_recurring = false
        AND status = 'pending'
        AND run_at <= now()
        AND id != ALL(COALESCE(v_recurring_ids, ARRAY[]::uuid[]))
      ORDER BY run_at
      LIMIT v_remaining_limit
      FOR UPDATE SKIP LOCKED
    ),
    updated_regular AS (
      UPDATE job_queue
      SET
        status = 'running',
        attempts = attempts + 1,
        updated_at = now()
      WHERE id IN (SELECT id FROM regular_to_claim)
      RETURNING id
    )
    SELECT ARRAY_AGG(id) INTO v_regular_ids FROM updated_regular;
  END IF;

  -- Combine all claimed IDs
  v_claimed_ids := COALESCE(v_recurring_ids, ARRAY[]::uuid[]) || COALESCE(v_regular_ids, ARRAY[]::uuid[]);

  -- Return all claimed jobs
  RETURN QUERY
  SELECT *
  FROM job_queue
  WHERE id = ANY(v_claimed_ids);
END;
$$;
