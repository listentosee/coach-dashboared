# Job Queue Operational Playbook

This playbook documents how to monitor, pause, resume, and recover the Game Platform job queue.

## Daily Checklist
- Open **Admin Tools → Job Queue** and confirm:
  - Pending/Running tiles remain low and jobs move to **Succeeded**.
  - Automatic processing toggle is on unless maintenance is planned.
  - `View cron health` modal shows recent HTTP 200 responses and no growing `net.http_request_queue` backlog.
- Review the queue table for repeated failures; use **Retry** or **Cancel** as needed.

## Pause & Resume Processing
1. Toggle **Automatic Processing** off in the Job Queue console.
2. Optionally record a pause reason for other admins.
3. When ready, toggle back on and run the cron health check to confirm 200 responses.

## Manual Replay / Retry
- Use **Retry** from the table to push a job back to `pending` for immediate execution.
- Use **Cancel** to stop jobs that should not run (sets status to `cancelled`).
- Need a fresh sync? Enqueue a `game_platform_sync` job via SQL if necessary (see engineering runbook).

## Cleanup
- A daily cron (`job_queue_cleanup_daily`) removes succeeded/cancelled jobs older than 14 days.
- Trigger manual cleanup from SQL if you need to reclaim space sooner: `select job_queue_cleanup(interval '7 days');`.

## Schema & Code Changes
- Add new job types by extending `JobTaskType` and registering handlers in `lib/jobs/handlers/index.ts`.
- Ship migrations before deploying worker/cron changes.

## Incident Response
1. Identify failing jobs in the queue view or Sentry alerts tagged `job_runner`.
2. Inspect the cron health modal for recent errors or stalled HTTP responses.
3. Pause automatic processing if the failure is widespread or external.
4. Resolve the root cause, retry affected jobs, re-enable processing, and monitor until stable.

## Contacts
- Primary: Engineering on-call.
- Escalation: Platform team for Supabase cron/pg_net issues.
