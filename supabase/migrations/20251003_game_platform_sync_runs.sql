-- Track global sync run executions
-- Instead of tracking last sync per-user, we track it globally per sync job run
-- This allows us to use one timestamp for all competitors in a batch

CREATE TABLE IF NOT EXISTS game_platform_sync_runs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  competitors_synced integer DEFAULT 0,
  competitors_failed integer DEFAULT 0,
  error_message text,
  sync_type text DEFAULT 'incremental', -- 'incremental', 'full'
  created_at timestamptz DEFAULT now()
);

-- Index for finding the last successful sync
CREATE INDEX idx_sync_runs_completed ON game_platform_sync_runs(completed_at DESC)
WHERE status = 'completed';

-- Add comment
COMMENT ON TABLE game_platform_sync_runs IS 'Tracks global sync job executions for game platform data. Used to determine the after_time_unix for incremental syncs.';

-- Enable RLS (FERPA compliance requirement)
ALTER TABLE game_platform_sync_runs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view sync runs
CREATE POLICY "Admins can view sync runs"
  ON game_platform_sync_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Only service role can insert/update sync runs (for background jobs)
CREATE POLICY "Service role can manage sync runs"
  ON game_platform_sync_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
