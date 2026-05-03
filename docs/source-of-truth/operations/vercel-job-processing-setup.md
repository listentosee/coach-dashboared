# Vercel Job Processing Setup

## Overview

This document describes the scheduled and on-demand job processing system configured for Vercel production. The system uses a job queue pattern where jobs are enqueued into the `job_queue` table and processed by a worker endpoint.

## Scheduled Processing (Vercel Cron)

### Configuration

The Vercel cron is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/jobs/run",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- **Path**: `/api/jobs/run`
- **Schedule**: `*/5 * * * *` (every 5 minutes)
- **Authentication**: Automatic via Vercel's `CRON_SECRET` environment variable

### How It Works

1. Vercel's cron scheduler calls `/api/jobs/run` every 5 minutes
2. The worker endpoint:
   - Checks if job processing is enabled (`job_queue_settings.processing_enabled`)
   - Claims up to 5 pending jobs from the queue (using `job_queue_claim` RPC)
   - Processes each job sequentially using the appropriate handler
   - Updates job status to `succeeded` or `failed` with retry logic
3. Jobs are automatically enqueued by Supabase pg_cron jobs (configured separately)

### Worker Endpoint

**File**: `app/api/jobs/run/route.ts`

**Authentication**: The route accepts a request when **either** of the following is true:
- `Authorization: Bearer ${CRON_SECRET}` matches the configured Vercel `CRON_SECRET`, or
- The request `User-Agent` starts with `vercel-cron/1.0` (UA fallback so Vercel Cron continues to work even if `CRON_SECRET` is unset).

There is **no** `x-job-runner-secret` / `JOB_QUEUE_RUNNER_SECRET` header check in `app/api/jobs/run/route.ts` today. For admin-triggered runs from inside the dashboard, see `app/api/admin/jobs/run-worker/route.ts`, which authenticates via the user’s session + admin role rather than a shared secret.

**Request Body** (optional):
```json
{
  "limit": 5,    // Max jobs to process (capped at 10)
  "force": false // Bypass processing_enabled check
}
```

**Response**:
```json
{
  "status": "ok",
  "processed": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    {
      "id": "job-uuid",
      "status": "succeeded",
      "attempts": 1,
      "lastError": null
    }
  ]
}
```

## On-Demand Job Triggers

Two admin-only endpoints allow manual job triggering:

### 1. Incremental Sync

**Endpoint**: `POST /api/admin/jobs/trigger-sync`

**File**: `app/api/admin/jobs/trigger-sync/route.ts`

**Authentication**: Requires admin role

**Request Body**:
```json
{
  "dryRun": false,     // Optional: simulate without writing
  "coachId": "uuid"    // Optional: limit to specific coach
}
```

**Response**:
```json
{
  "success": true,
  "jobId": "job-uuid",
  "message": "Incremental sync job enqueued successfully"
}
```

**Job Handler**: `game_platform_sync` (in `lib/jobs/handlers/gamePlatformSync.ts`)

**What It Does**:
- Syncs competitor stats from Game Platform API
- Syncs team data with Game Platform
- Sets `needs_totals_refresh` flags when activity is detected

### 2. Totals Sweep

**Endpoint**: `POST /api/admin/jobs/trigger-totals-sweep`

**File**: `app/api/admin/jobs/trigger-totals-sweep/route.ts`

**Authentication**: Requires admin role

**Request Body**:
```json
{
  "dryRun": false,      // Optional: simulate without writing
  "coachId": "uuid",    // Optional: limit to specific coach
  "batchSize": 100      // Optional: competitors per batch
}
```

**Response**:
```json
{
  "success": true,
  "jobId": "job-uuid",
  "message": "Totals sweep job enqueued successfully"
}
```

**Job Handler**: `game_platform_totals_sweep` (in `lib/jobs/handlers/gamePlatformTotalsSweep.ts`)

**What It Does**:
- Processes competitors with `needs_totals_refresh = true`
- Fetches fresh totals from MetaCTF source of truth
- Clears refresh flags after successful update

## Environment Variables

### Required on Vercel

1. **`CRON_SECRET`** (set automatically by Vercel when a cron block is added to `vercel.json`)
   - Used by Vercel cron to authenticate requests to `/api/jobs/run`
   - No manual configuration needed; the route also accepts the `vercel-cron/1.0` user agent as a fallback

2. **Modern Supabase keys** (must be set manually)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` — read by `getServiceRoleSupabaseClient()` (with `SUPABASE_SERVICE_ROLE_KEY` retained only as a legacy fallback during the 2026-05-02 rotation window)

3. **`JOB_QUEUE_RUNNER_SECRET`** *(optional / legacy)*
   - Listed in `.env.example` but **not currently consulted by `/api/jobs/run`** (the route authenticates via `CRON_SECRET` or the Vercel Cron user agent only). Was used in earlier designs that called the worker from `pg_cron`; safe to keep set or to leave unset.

### Setting Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add the modern Supabase key trio above
3. Ensure each is available for Production, Preview, and Development as needed

## Job Queue Architecture

### Job Types

The full task-type list lives in `lib/jobs/types.ts` (`JobTaskType` union); see [`job-queue-playbook.md`](./job-queue-playbook.md) for the canonical table. Two are highlighted here because they have admin-only "trigger now" endpoints:

1. **`game_platform_sync`**
   - Incremental sync of competitor and team data
   - Driven by a recurring `job_queue` row (currently 15-minute cadence; see `supabase-cron-spec.md` for why this is **not** a `pg_cron` schedule)
   - Can be triggered on-demand via `/api/admin/jobs/trigger-sync`

2. **`game_platform_totals_sweep`**
   - Refreshes totals for flagged competitors
   - Driven by a recurring `job_queue` row (currently 15-minute cadence)
   - Can be triggered on-demand via `/api/admin/jobs/trigger-totals-sweep`

### Job Lifecycle

The `JobStatus` union (`lib/jobs/types.ts`) is `'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'`.

1. **Enqueued** → Job inserted with `status = 'pending'`, `run_at = now()` (or future time)
2. **Claimed** → Worker calls `job_queue_claim()` which:
   - Finds jobs with `status = 'pending'` and `run_at <= now()`
   - Locks rows with `FOR UPDATE SKIP LOCKED`
   - Updates `status = 'running'`, increments `attempts`
3. **Running** → Handler executes business logic
4. **Completed** → Either:
   - **Success (one-time)**: row is marked `succeeded` then **deleted** by the runner (`lib/jobs/runner.ts`) so the queue stays clean.
   - **Success (recurring)**: row is flipped back to `'pending'` with a new `run_at = now() + recurrence_interval_minutes`. Recurring jobs are never auto-deleted.
   - **Retry**: `status = 'pending'`, `run_at = now() + retry_delay` (if `attempts < max_attempts`)
   - **Failed**: `status = 'failed'` (if `attempts >= max_attempts`)

### Database Functions

- `job_queue_enqueue(task_type, payload, run_at, max_attempts)` → Insert new job
- `job_queue_claim(limit)` → Claim pending jobs for processing
- `job_queue_mark_succeeded(id, output)` → Mark job as succeeded
- `job_queue_mark_failed(id, error, retry_in)` → Mark job as failed (with optional retry)

### Admin Controls

**Job Queue Settings** (`job_queue_settings` table):
- `processing_enabled` (boolean) → Global pause switch
- `paused_reason` (text) → Displayed when paused

**Admin UI**: Available at `/dashboard/admin-tools/jobs`
- View queue metrics (pending, processing, succeeded, failed)
- Toggle processing on/off
- Retry or cancel individual jobs
- View job details and error logs

## Monitoring & Observability

### Logs

Jobs emit structured logs with:
- Job ID, task type, attempts
- Success/failure status
- Error messages and stack traces
- Processing duration

### Sentry Integration

- Job failures are captured in Sentry with context:
  - Tags: `jobId`, `taskType`
  - Extra: `attempts`, `maxAttempts`, error details
- Permanent failures (max attempts reached) trigger error-level alerts

### Health Checks

**Endpoint**: `GET /api/admin/job-queue/health`

Returns:
- Queue statistics (pending, processing, failed counts)
- Processing enabled status
- Recent job run history
- Oldest pending job age

## Deployment Checklist

Before deploying to Vercel production:

- [ ] Verify `CRON_SECRET` is configured on Vercel (Vercel sets this automatically when you add the cron block in `vercel.json`)
- [ ] Confirm modern Supabase keys are present on Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Legacy `SUPABASE_SERVICE_ROLE_KEY` was retired in the 2026-05-02 rotation.
- [ ] Confirm the recurring `job_queue` rows exist for the schedules you expect (see [`supabase-cron-spec.md`](./supabase-cron-spec.md) for the live cadences; pg_cron is **not** used today).
- [ ] Deploy to Vercel
- [ ] Test on-demand triggers via Admin Tools UI (`/dashboard/admin-tools/jobs`)
- [ ] Monitor first few cron executions in Vercel logs

> Historical: earlier iterations of this system used Supabase Vault secrets `job_queue_runner_secret` / `job_queue_worker_endpoint` to let `pg_cron` call into `/api/jobs/run`. Those are no longer used because production isn’t running `pg_cron` at all — Vercel Cron is the scheduler.

## Troubleshooting

### Cron not running

1. Check Vercel logs for cron execution
2. Verify `vercel.json` is deployed (check deployment files)
3. Ensure `CRON_SECRET` is set (automatic in production)

### Jobs not processing

1. Check `job_queue_settings.processing_enabled` → should be `true`
2. Verify jobs exist with `SELECT * FROM job_queue WHERE status = 'pending';`
3. Check Vercel function logs for errors in `/api/jobs/run`
4. Ensure `JOB_QUEUE_RUNNER_SECRET` environment variable is set

### Jobs failing repeatedly

1. Check `job_queue.last_error` column for error messages
2. Review Sentry for detailed stack traces
3. Test job handler locally with same payload
4. Verify Game Platform API credentials and endpoints
5. Check for rate limiting or API quota issues

### Manual trigger returns 401

1. Ensure you're logged in as an admin user
2. Check `profiles.role = 'admin'` in database
3. Verify session is valid (not expired)

## Related Documentation

- [Supabase Cron Specification](./supabase-cron-spec.md) - Historical pg_cron design (note: pg_cron is no longer the scheduler)
- [Job Queue Playbook](./job-queue-playbook.md) - Operational procedures and full task-type table
- [Game Platform Integration](../integrations/game-platform-integration.md) - API integration details

---

**Last verified:** 2026-05-03 against commit `84d367e8`.
**Notes:** Corrected the auth model — `/api/jobs/run` only checks `CRON_SECRET` or the `vercel-cron/1.0` user agent (no `x-job-runner-secret`/`JOB_QUEUE_RUNNER_SECRET` enforcement); fixed lifecycle status name (`'running'`, not `'processing'`) and noted one-time-job auto-deletion plus recurring-job re-pending behavior; updated env-var list to the modern Supabase keys; replaced "Supabase cron" references with the actual `job_queue`-row-driven scheduling. Pointed at `lib/jobs/types.ts` and the playbook for the canonical task list (the doc previously listed only 2 of the 13 task types).

