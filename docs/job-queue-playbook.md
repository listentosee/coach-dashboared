# Job Queue Operational Playbook

This playbook documents how to monitor, pause, resume, and recover the Game Platform job queue.

## Quick Links
- Admin UI: `/dashboard/admin-tools/jobs`
- Worker endpoint: `/api/jobs/run`
- SQL helpers: `job_queue_enqueue`, `job_queue_claim`, `job_queue_mark_succeeded`, `job_queue_mark_failed`, `job_queue_cleanup`

## Daily Monitoring
- Check the Admin UI:
  - Verify the **status tiles** show low pending/running counts.
  - Verify jobs are transitioning to **Succeeded** (or retrying when expected).
- Cron health:
  - `select * from cron.job_run_details order by start_time desc limit 20;`
  - `select count(*) from net.http_request_queue;` should stay low.
  - `select created, status_code, error_msg from net._http_response order by created desc limit 5;`
- Alerts: Sentry events tagged `job_runner` flag failures without retries.

## Pause & Resume Processing
### Pause automatic processing
1. Disable the worker secret by updating Vault to a dummy value:
   ```sql
   select vault.update_secret('d8a9d3fc-e58e-427a-adfe-4b749f8c081d', new_secret := 'PAUSED');
   ```
2. Optional: set a maintenance flag env (`JOB_QUEUE_DISABLED=true`) and redeploy so the worker returns 503.
3. Cron runs will fail with 401—acknowledge in runbook.

### Resume processing
1. Restore `job_queue_runner_secret` in Vault and `.env`.
2. Re-run the smoke test:
   ```sql
   with secrets as (
     select
       (select decrypted_secret from vault.decrypted_secrets where name = 'job_queue_worker_endpoint') as endpoint,
       (select decrypted_secret from vault.decrypted_secrets where name = 'job_queue_runner_secret') as secret
   )
   select net.http_post(
     url := (select endpoint from secrets),
     headers := jsonb_build_object('Content-Type','application/json','x-job-runner-secret',(select secret from secrets)),
     body := jsonb_build_object('limit',1),
     timeout_milliseconds := 5000
   );
   ```
3. Confirm cron history records HTTP 200.

## Manual Replay / Retry
- From the Admin UI, use **Retry now** to reset a job to `pending` with `run_at = now()`.
- To replay a job via SQL:
  ```sql
  update job_queue
     set status = 'pending', run_at = now(), last_error = null, completed_at = null
   where id = '<job-id>';
  ```
- To force a fresh job, call the RPC:
  ```sql
  select job_queue_enqueue('game_platform_sync', jsonb_build_object('dryRun', false));
  ```

## Cancelling Jobs
- Admin UI **Cancel** marks the job as `cancelled` and sets `completed_at`.
- Via SQL:
  ```sql
  update job_queue set status = 'cancelled', completed_at = now() where id = '<job-id>';
  ```

## Cleanup
- Automatic: daily cron `job_queue_cleanup_daily` removes succeeded/cancelled jobs older than 14 days.
- Manual trigger:
  ```sql
  select job_queue_cleanup(interval '7 days');
  ```

## Schema Changes
- Add new job types by extending the `JobTaskType` union in `lib/jobs/types.ts` and registering handlers in `lib/jobs/handlers/index.ts`.
- Include migrations to create any additional tables/data referenced by new handlers.
- Deploy migrations **before** application code that enqueues new task types.

## Incident Response
1. Identify failing jobs:
   - Admin UI last_error column.
   - `select * from job_queue where status = 'failed';`
   - Sentry traces.
2. Fix root cause (e.g., upstream API, data issue).
3. Use `Retry now` (or SQL) to rerun affected jobs.
4. Confirm `cron.job_run_details` resumes HTTP 200.

## Contacts
- Primary: Engineering on-call.
- Escalation: Platform team for Supabase cron/pg_net issues.
