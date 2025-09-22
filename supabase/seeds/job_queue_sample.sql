-- Sample jobs for local development/testing only.
-- Invoke manually against a non-production database.
insert into public.job_queue (task_type, payload, status, run_at, max_attempts)
values
  ('game_platform_sync', jsonb_build_object('dryRun', true), 'pending', now(), 3),
  ('game_platform_sync', jsonb_build_object('dryRun', false, 'coachId', null), 'pending', now() + interval '5 minutes', 5);
