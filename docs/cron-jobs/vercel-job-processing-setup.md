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

**Authentication**: Accepts two methods:
- Vercel cron: `Authorization: Bearer ${CRON_SECRET}`
- Manual/external: `x-job-runner-secret: ${JOB_QUEUE_RUNNER_SECRET}`

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

1. **`CRON_SECRET`** (Automatically set by Vercel)
   - Used by Vercel cron jobs for authentication
   - No manual configuration needed

2. **`JOB_QUEUE_RUNNER_SECRET`** (Must be set manually)
   - Used for manual/external triggers via `x-job-runner-secret` header
   - Should match the secret stored in Supabase Vault (`job_queue_runner_secret`)
   - Generate a secure random string (e.g., `openssl rand -base64 32`)

### Setting Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `JOB_QUEUE_RUNNER_SECRET` with a secure random value
3. Ensure it's available for Production, Preview, and Development environments as needed
4. Also set this value in Supabase Vault if using Supabase pg_cron triggers

## Job Queue Architecture

### Job Types

1. **`game_platform_sync`**
   - Incremental sync of competitor and team data
   - Typically triggered by Supabase cron every 30 minutes
   - Can be triggered on-demand via `/api/admin/jobs/trigger-sync`

2. **`game_platform_totals_sweep`**
   - Refreshes totals for flagged competitors
   - Typically triggered by Supabase cron every hour
   - Can be triggered on-demand via `/api/admin/jobs/trigger-totals-sweep`

### Job Lifecycle

1. **Enqueued** → Job inserted with `status = 'pending'`, `run_at = now()` (or future time)
2. **Claimed** → Worker calls `job_queue_claim()` which:
   - Finds jobs with `status = 'pending'` and `run_at <= now()`
   - Locks rows with `FOR UPDATE SKIP LOCKED`
   - Updates `status = 'processing'`, increments `attempts`
3. **Processing** → Handler executes business logic
4. **Completed** → Either:
   - **Success**: `status = 'succeeded'`, `completed_at = now()`
   - **Retry**: `status = 'pending'`, `run_at = now() + retry_delay` (if attempts < max_attempts)
   - **Failed**: `status = 'failed'`, `completed_at = now()` (if attempts >= max_attempts)

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

- [ ] Set `JOB_QUEUE_RUNNER_SECRET` environment variable on Vercel
- [ ] Verify `CRON_SECRET` is automatically configured (Vercel sets this)
- [ ] Clear `job_queue` table if starting fresh: `DELETE FROM job_queue;`
- [ ] Ensure Supabase pg_cron jobs are configured (see `supabase_cron-spec.md`)
- [ ] Verify Supabase Vault contains matching secrets:
  - `job_queue_runner_secret`
  - `job_queue_worker_endpoint`
- [ ] Deploy to Vercel
- [ ] Test on-demand triggers via Admin Tools UI
- [ ] Monitor first few cron executions in Vercel logs

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

- [Supabase Cron Specification](./supabase_cron-spec.md) - Supabase pg_cron setup
- [Job Queue Playbook](../job-queue-playbook.md) - Operational procedures
- [Game Platform Integration](../game-platform/game-platform-integration.md) - API integration details
