-- Configure cron job for Game Platform incremental sync
-- Runs every 30 minutes to fetch new challenge solves using after_time_unix
-- Part of two-phase sync architecture (see docs/game-platform/game-platform-integration.md Section 19.2)

-- Schedule the incremental sync job to run every 30 minutes
select cron.schedule(
  job_name => 'game_platform_sync_incremental',
  schedule => '*/30 * * * *',
  command  => $$
    select public.job_queue_enqueue(
      p_task_type := 'game_platform_sync',
      p_payload := '{}'::jsonb,
      p_run_at := now(),
      p_max_attempts := 3
    );
  $$
);

-- Optional: View configured cron jobs
-- select jobid, jobname, schedule, active from cron.job where jobname like 'game_platform%';

-- Optional: View job execution history
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'game_platform_sync_incremental') order by start_time desc limit 10;
