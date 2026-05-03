# Job Queue Operational Playbook

This playbook documents how to monitor, manage, and troubleshoot the background job queue.

## Job Types

| Task Type | Purpose | Typical Usage |
|-----------|---------|---------------|
| `game_platform_sync` | Sync competitors and teams with MetaCTF | Recurring or manual trigger |
| `game_platform_totals_sweep` | Batch compute cumulative scores | Recurring |
| `game_platform_profile_refresh` | Update competitor profiles from game platform | Recurring or manual trigger |
| `game_platform_onboard_competitors` | Bulk add competitors to game platform | One-time (bulk import) |
| `game_platform_onboard_coaches` | Bulk add coaches to game platform | One-time (manual/backfill) |
| `sms_digest_processor` | Batch SMS/email notifications to coaches | Recurring |
| `admin_alert_dispatch` | Batch admin email notifications | Recurring |
| `release_parent_email_verification` | Verify parent emails for release forms | Recurring |
| `message_read_receipts_backfill` | Populate missing read receipts | One-time |
| `competitor_announcement_dispatch` | Send bulk email campaign via SendGrid | One-time (from Mailer Dashboard) |

## Recurring vs One-Time Jobs

- **Recurring jobs** have the `↻` badge with an interval (e.g. `↻ 60m`, `↻ 15m`). After success, they automatically return to `pending` and re-run on schedule. They stay in the queue permanently.
- **One-time jobs** run once. After success, they are **automatically deleted** from the queue to keep the dashboard clean. Failed one-time jobs remain visible for debugging.

When creating a job via the **Create Job** dialog, toggle **Recurring Job** on to set a repeat interval and duration.

## Dashboard Overview

Navigate to **Admin Tools → Job Queue** to see:

- **Status filter tabs** — filter by All, Pending, Running, Succeeded, Failed, Cancelled
- **Automatic Processing toggle** — global kill switch to pause/resume all job processing
- **Run Worker** — manually trigger a processing cycle (claims and runs up to 5 pending jobs)
- **Quick Sync Actions** — one-click buttons to enqueue common sync jobs
- **Create Job** — dialog to create a one-time or recurring job with optional coach filter, schedule, and payload
- **Cron Health** — modal showing recent Vercel Cron execution history and HTTP responses
- **Job table** — shows all jobs with status, attempts, created/last-run/next-scheduled dates, errors, and actions (Retry, Cancel, Delete)

## Daily Monitoring

1. Open **Admin Tools → Job Queue** and confirm:
   - Recurring jobs show `pending` or `running` status and are cycling on schedule.
   - No unexpected `failed` jobs are accumulating.
   - The **Automatic Processing** toggle is on.
2. Click **Cron Health** to verify recent HTTP 200 responses from Vercel Cron.
3. Review any failed jobs — inspect the error message, then **Retry** or **Cancel** as needed.

## Pause & Resume Processing

1. Toggle **Automatic Processing** off in the Job Queue console.
2. Optionally record a pause reason for other admins.
3. When ready, toggle back on and verify via Cron Health that processing has resumed.

## Manual Actions

| Action | What it does |
|--------|-------------|
| **Retry** | Resets a failed/succeeded job back to `pending` for immediate re-execution |
| **Cancel** | Sets job status to `cancelled` (will not run again) |
| **Delete** | Permanently removes the job row from the queue |
| **Run Worker** | Triggers an immediate processing cycle outside the cron schedule |

## Cleanup

- **One-time jobs**: Automatically deleted after successful completion (no manual cleanup needed).
- **Failed jobs**: Stay in the queue for visibility. Delete manually once investigated.
- **Stuck jobs**: If a job is stuck in `running` state (e.g. worker crashed), run `pnpm jobs:cleanup` to mark stuck jobs as failed.
- **Legacy cleanup RPC**: `SELECT job_queue_cleanup(interval '14 days')` removes old succeeded/cancelled jobs. Largely unnecessary now that one-time jobs auto-delete.

## Adding New Job Types

1. Add the task type to `JobTaskType` union in `lib/jobs/types.ts`.
2. Define a payload interface in the same file and add it to `JobPayloadMap`.
3. Create a handler in `lib/jobs/handlers/` and register it in `lib/jobs/handlers/index.ts`.
4. Ship migrations before deploying handler changes.

## Incident Response

1. Identify failing jobs in the queue view or Sentry alerts tagged `job_runner`.
2. Inspect the **Cron Health** modal for recent errors or stalled HTTP responses.
3. Pause **Automatic Processing** if the failure is widespread or caused by an external dependency.
4. Resolve the root cause, retry affected jobs, re-enable processing, and monitor until stable.
