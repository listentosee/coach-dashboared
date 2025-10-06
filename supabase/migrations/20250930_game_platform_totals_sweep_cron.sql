-- Configure cron job for Game Platform totals refresh sweep
-- Runs hourly to process competitors flagged for totals refresh after incremental sync
-- Part of two-phase sync architecture (see docs/game-platform/game-platform-integration.md Section 19.2)

-- Schedule the totals sweep job to run hourly at the top of the hour
select cron.schedule(
  job_name => 'game_platform_totals_sweep_hourly',
  schedule => '0 * * * *',
  command  => $$
    select public.job_queue_enqueue(
      p_task_type := 'game_platform_totals_sweep',
      p_payload := '{}'::jsonb,
      p_run_at := now(),
      p_max_attempts := 3
    );
  $$
);

-- Optional: View configured cron jobs
-- select jobid, jobname, schedule, active from cron.job where jobname like 'game_platform%';

-- Optional: View job execution history
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'game_platform_totals_sweep_hourly') order by start_time desc limit 10;
