-- Grant read-only permissions to cron schema for RPC functions
-- This allows admin users to view cron jobs and execution history without elevated privileges

-- Grant usage on cron schema to the functions' definer
grant usage on schema cron to postgres;

-- Grant select on cron tables needed for read-only operations
grant select on cron.job to postgres;
grant select on cron.job_run_details to postgres;

-- The existing functions (get_cron_jobs, get_cron_job_runs) already have:
-- - security definer (runs with function owner's permissions)
-- - admin checks removed (handled at API route level)
-- - service role client access (bypasses RLS)

-- No changes needed to function definitions - they already work with these permissions
