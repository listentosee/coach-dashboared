# Job Processor

> **Status (2026-05-03):** describes the current production job-processing system. This doc is the architectural spec; for day-to-day admin operations (monitoring, retry, pause/resume, troubleshooting workflow) see [`job-queue-playbook.md`](./job-queue-playbook.md).

## Overview

Background work in the Coach Dashboard runs through a **scheduled queue processor**: Vercel Cron triggers a Next.js endpoint every 5 minutes; that endpoint claims a small batch of pending jobs from a Supabase Postgres queue, runs each handler, and updates the job's lifecycle status. The combination keeps long-running and bursty work outside the request path while staying within Vercel's per-invocation duration limits.

## Evolution — how we got here

The job processor evolved across three eras as constraints surfaced.

**Era 1 — Vercel Cron, direct.** Originally, Vercel Cron called feature-specific endpoints directly. Problem: individual jobs sometimes exceeded Vercel's per-invocation duration limit (60s on Hobby, 300s on Pro). When a job timed out mid-run, partial state left the system inconsistent and there was no automatic retry path.

**Era 2 — Supabase pg_cron + Edge Functions.** To get longer-running scheduled work, the design moved to `pg_cron` driving a Supabase Edge Function (`sync`). This isolated job execution from Vercel's request lifecycle. The original four-phase plan for that approach is preserved at [`docs/operations/historical-supabase-cron-spec.md`](../../../operations/historical-supabase-cron-spec.md). It didn't fully ship: `pg_cron` is not installed in the production project, Edge Functions added their own deployment friction, and the cron-management UI never landed.

**Era 3 — current hybrid.** Vercel Cron remains the trigger, but it doesn't run handlers directly. Instead it pings a single worker endpoint (`/api/jobs/run`) every 5 minutes. The worker pulls a small batch of jobs from a Postgres `job_queue` table, runs them within the cron window, and persists their state back to Postgres. Long-running or bursty work gets processed across multiple cron invocations because the queue is the source of truth. Recurring jobs re-pend themselves on a per-row interval. One-time jobs auto-delete on success.

## Architecture at a glance

```
Vercel Cron  ──*/5 * * * *──▶  /api/jobs/run  ──runJobs()──▶  job_queue_claim()
                                     │                             │
                                     │                             ▼
                                     │                       (up to 5 jobs
                                     │                        marked 'running')
                                     │                             │
                                     ▼                             ▼
                              processJob() in           lib/jobs/handlers/index.ts
                              lib/jobs/runner.ts            (registered handler)
                                     │                             │
                                     ▼                             │
                          ┌──────────┴──────────┐                  │
                          ▼                     ▼                  │
                    success path          failure path             │
                          │                     │                  │
                          ▼                     ▼                  │
                  one-time → DELETE     mark_failed (retry         │
                  recurring → re-pend    or terminal failed)       │
                  with run_at += interval                          │
```

## The trigger — Vercel Cron

`vercel.json`:

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

- Runs every 5 minutes in production. Vercel Cron is a server-side cron runner; it sets a `User-Agent` header `vercel-cron/1.0` and (when `CRON_SECRET` is configured) attaches `Authorization: Bearer ${CRON_SECRET}`.
- Vercel Cron does not run on preview deploys — only on the production deployment of the project.

## The endpoint — `/api/jobs/run`

**File:** [`app/api/jobs/run/route.ts`](../../../../app/api/jobs/run/route.ts)

**Authentication.** The route accepts a request when **either**:

- `Authorization: Bearer ${CRON_SECRET}` matches Vercel's configured `CRON_SECRET`, OR
- `User-Agent` starts with `vercel-cron/1.0` (UA fallback so Vercel Cron still works if `CRON_SECRET` is unset)

There is no `x-job-runner-secret` / `JOB_QUEUE_RUNNER_SECRET` header check. (`JOB_QUEUE_RUNNER_SECRET` still appears in `.env.example` as a leftover from Era 2 but is not consulted by current code.)

For admin-triggered "run now" from inside the dashboard, see `app/api/admin/jobs/run-worker/route.ts`, which authenticates via the user's session + admin role rather than a shared secret.

**Request body** (optional):

```json
{
  "limit": 5,
  "force": false
}
```

- `limit` — max jobs to process this cycle. Default 5; capped at 10 by the runner.
- `force` — bypass the global `processing_enabled` kill switch.

**Response:**

```json
{
  "status": "ok",
  "processed": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "id": "job-uuid", "status": "succeeded", "attempts": 1, "lastError": null }
  ]
}
```

If processing is paused, the response is `{ "status": "paused", "processed": 0, "message": "<reason>" }`.

## The runner — `lib/jobs/runner.ts`

`runJobs(options)` in [`lib/jobs/runner.ts`](../../../../lib/jobs/runner.ts):

1. Reads `job_queue_settings.processing_enabled`. If disabled and `force !== true`, returns `{ status: 'paused' }` immediately.
2. Calls `claimJobs({ limit })` (which wraps the `job_queue_claim` SQL function — see below) to atomically pick up to `limit` pending jobs and mark them `running`.
3. For each claimed job:
   - Looks up the handler in the registry (`lib/jobs/handlers/index.ts::getJobHandler`)
   - Invokes the handler with `(job, { supabase, logger })`
   - On thrown exception OR returned `{ status: 'failed' }`: calls `markJobFailed` (which transitions to `pending` + future `run_at` if `attempts < max_attempts`, otherwise terminal `failed`). Permanent failures are reported to Sentry.
   - On success: calls `markJobSucceeded`. Then **if the resulting row is `succeeded` (i.e. NOT a recurring row that was re-pended), the runner deletes the row** to keep the queue table clean.
4. Returns a per-job result summary.

The runner does not parallelize within a cycle — jobs are processed sequentially. Concurrency comes from running multiple cron cycles, not multiple in-flight jobs per cycle.

## The queue — `public.job_queue`

A row in `job_queue` represents one unit of work. Key columns:

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | PK |
| `task_type` | text | Discriminator that routes to a handler (must be in `JobTaskType` union) |
| `payload` | jsonb | Per-task-type payload (typed by `JobPayloadMap`) |
| `status` | text | `pending` / `running` / `succeeded` / `failed` / `cancelled` |
| `attempts` | int | Incremented at claim time |
| `max_attempts` | int | After this many failures, status goes terminal `failed` |
| `run_at` | timestamptz | Earliest time the row is eligible to be claimed |
| `is_recurring` | boolean | If true, post-success the row goes back to `pending` |
| `recurrence_interval_minutes` | int | For recurring rows, how far in the future to re-pend `run_at` |
| `last_error` | text | Captured from the last failure |
| `output` | jsonb | Captured from the last success |
| `coach_id` | uuid (nullable) | Optional scoping — used by some sync jobs to limit the work to a single coach |

**Schema definition source-of-truth:** see the latest migration that touches `job_queue` in `supabase/migrations/`. The current shape was last verified in `data/db_schema_20260208.sql`.

**Database functions:**

- `job_queue_enqueue(task_type, payload, run_at, max_attempts)` — insert a new pending job
- `job_queue_claim(limit)` — atomically pick `limit` pending jobs whose `run_at <= now()`, lock them with `FOR UPDATE SKIP LOCKED`, set `status = 'running'`, increment `attempts`, return the rows
- `job_queue_mark_succeeded(id, output)` — transition `running` → `succeeded` (and, for recurring rows, immediately back to `pending` with new `run_at`)
- `job_queue_mark_failed(id, error, retry_in)` — transition with retry-or-terminal logic
- `job_queue_cleanup(interval)` — legacy bulk cleanup of old `succeeded`/`cancelled` rows; mostly superseded by per-job auto-delete

A small `job_queue_settings` table (single row, `id = 1`) holds the global kill switch:

| Column | Purpose |
|---|---|
| `processing_enabled` | If `false`, the runner returns immediately without claiming any jobs |
| `paused_reason` | Free-text reason shown in the admin UI when paused |

## Job lifecycle

```
                      ┌────────────────────────────┐
                      │                            │
                      ▼                            │ (recurring success:
   ┌──────────┐   claim()   ┌────────────┐         │  re-pend with new run_at)
   │ pending  │────────────▶│  running   │─────────┘
   └──────────┘             └────────────┘
                                  │
                                  ├── handler success ──▶ succeeded
                                  │                          │
                                  │                          ├── one-time: DELETE row
                                  │                          └── recurring: row already re-pended
                                  │
                                  ├── handler failure
                                  │     │
                                  │     ├── attempts < max → pending (run_at = now() + retry_delay)
                                  │     └── attempts >= max → failed (terminal, Sentry alert)
                                  │
                                  └── admin cancel → cancelled
```

## Handlers

A handler is an async function with signature `(job: JobRecord, ctx: { supabase, logger }) => Promise<JobResult | void>`.

The registry lives at [`lib/jobs/handlers/index.ts`](../../../../lib/jobs/handlers/index.ts) and exports `getJobHandler(taskType)`. The full task-type list is the `JobTaskType` union in [`lib/jobs/types.ts`](../../../../lib/jobs/types.ts); see [`job-queue-playbook.md`](./job-queue-playbook.md) for the human-readable table.

**Adding a new task type:**

1. Add to the `JobTaskType` union in `lib/jobs/types.ts`
2. Add a payload interface to the same file and add it to `JobPayloadMap`
3. Create a handler in `lib/jobs/handlers/<myHandler>.ts` and register it in `lib/jobs/handlers/index.ts`
4. Ship any DB migrations BEFORE deploying the handler change (so the queue can hold rows of the new type before the dispatch knows how to handle them — see the playbook's "Adding New Job Types" section)

## Recurring jobs (current cadences)

Live as of 2026-05-03 (verified by inspecting `job_queue` rows where `is_recurring = true`):

| Task type | Interval | Purpose |
|---|---|---|
| `game_platform_sync` | 15 min | Incremental sync of competitors and teams with MetaCTF |
| `game_platform_totals_sweep` | 15 min | Refresh cumulative scores for competitors flagged with `needs_totals_refresh` |
| `game_platform_flash_ctf_sync` | 1440 min (daily) | Sync Flash CTF event participation/results |
| `admin_alert_dispatch` | 5 min | Batch admin email notifications |
| `sms_digest_processor` | 60 min | Batch SMS+email notifications to coaches |
| `release_parent_email_verification` | 60 min | Verify parent emails on release forms |

There is no `pg_cron` scheduling layer in production — these intervals are stored on the `job_queue` rows themselves and applied by the runner when it re-pends a recurring success.

## On-demand triggers

Two admin-only endpoints enqueue specific recurring task types for an immediate run, in addition to the always-on 5-minute cron cycle:

### `POST /api/admin/jobs/trigger-sync`

File: `app/api/admin/jobs/trigger-sync/route.ts`. Auth: admin role.

```json
{ "dryRun": false, "coachId": "uuid" }
```

Enqueues a `game_platform_sync` job for immediate processing. `coachId` scopes the sync to a single coach's competitors.

### `POST /api/admin/jobs/trigger-totals-sweep`

File: `app/api/admin/jobs/trigger-totals-sweep/route.ts`. Auth: admin role.

```json
{ "dryRun": false, "coachId": "uuid", "batchSize": 100 }
```

Enqueues a `game_platform_totals_sweep` job. Honors the existing `needs_totals_refresh` flags.

### Admin "Run Worker" button

`/dashboard/admin-tools/jobs` exposes a **Run Worker** button that hits `app/api/admin/jobs/run-worker/route.ts`. That route authenticates the user as an admin and then invokes the same `runJobs()` function. Useful when you want to drain the queue without waiting for the next cron tick.

## Environment variables

Required in production (Vercel):

- `CRON_SECRET` — set automatically by Vercel when a cron block is present in `vercel.json`. Authenticates Vercel Cron's calls to `/api/jobs/run`. The route also accepts the `vercel-cron/1.0` user agent as a fallback so cron continues to work if this is unset.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — read by `getServiceRoleSupabaseClient()` (with `SUPABASE_SERVICE_ROLE_KEY` retained as a legacy fallback during the 2026-05-02 rotation transition; the legacy JWT key was revoked 2026-05-03 so the fallback is now a no-op)

Out-of-use (Era 2 leftovers):

- `JOB_QUEUE_RUNNER_SECRET` — still in `.env.example` but not consulted by current code. Safe to ignore. Will be removed when the example is next refreshed.

## Monitoring

**Logs.** Each job run emits structured `console.log`/`console.warn`/`console.error` lines tagged with `[job-runner]`, `jobId`, and `taskType`. Visible in Vercel function logs.

**Sentry.** Permanent failures (terminal `failed` state, no more retries) call `Sentry.captureMessage('Job permanently failed', ...)` with `level: 'error'`. Unexpected exceptions call `Sentry.captureException(...)`. Both attach `jobId` and `taskType` as tags.

**Admin UI.** `/dashboard/admin-tools/jobs` shows queue metrics, the global pause toggle, recent Vercel Cron HTTP responses (Cron Health modal), and per-job retry/cancel/delete actions. See [`job-queue-playbook.md`](./job-queue-playbook.md) for the operational walkthrough.

**Health endpoint.** `GET /api/admin/job-queue/health` returns:

- Queue counts by status
- `processing_enabled` value and reason
- Recent run history
- Oldest pending job's age

## Troubleshooting

### Cron isn't running

1. Check Vercel function logs for `/api/jobs/run` invocations on the production deployment
2. Confirm `vercel.json` is in the latest deployment (`vercel inspect <deployment-url>` shows the source files)
3. Verify `CRON_SECRET` is in the environment (Vercel sets it automatically when the cron block is present)
4. Vercel Cron only fires on the production deployment, not previews — confirm the production URL in Vercel matches what you expect

### Jobs not processing

1. Open `/dashboard/admin-tools/jobs` and check the **Automatic Processing** toggle (this reads `job_queue_settings.processing_enabled`)
2. Confirm there are pending jobs: `SELECT id, task_type, status, run_at FROM job_queue WHERE status = 'pending' ORDER BY run_at;`
3. Check Vercel function logs for errors thrown inside `/api/jobs/run`
4. Try **Run Worker** to invoke the runner outside the cron schedule and watch the response

### Jobs failing repeatedly

1. Inspect `job_queue.last_error` for the failing rows
2. Cross-check Sentry for stack traces (filter by tag `taskType:<your-type>`)
3. Run the handler locally with the same payload (each handler has a vitest in `lib/jobs/handlers/*.test.ts` for at least the happy path)
4. For Game Platform handlers, verify MetaCTF API credentials and check for upstream rate-limiting

### Jobs stuck in `running`

If a Vercel function dies mid-handler, the row stays at `status = 'running'` forever. `pnpm jobs:cleanup` (script in `scripts/cleanup-stuck-jobs.ts`) marks stuck rows as `failed` with `last_error = 'Stuck in running state'` so they can be retried.

### Manual on-demand trigger returns 401

1. Confirm you're logged in as an admin user
2. Check `profiles.role = 'admin'` in the database
3. Verify session is valid (not expired) — try logging out and back in

## Related documentation

- [`job-queue-playbook.md`](./job-queue-playbook.md) — admin-facing operational procedures, full task-type table, dashboard walkthrough
- [`db-migration-runbook.md`](./db-migration-runbook.md) — for schema changes touching `job_queue` or related tables
- [`../integrations/game-platform-integration.md`](../integrations/game-platform-integration.md) — the largest consumer of recurring jobs (sync, totals sweep, Flash CTF sync)
- [Historical: `../../../operations/historical-supabase-cron-spec.md`](../../../operations/historical-supabase-cron-spec.md) — Era 2's pg_cron + Edge Function design, never fully shipped

---

**Last verified:** 2026-05-03 against commit `84d367e8`.
**Notes:** Comprehensive rewrite consolidating the previous `vercel-job-processing-setup.md` and `supabase-cron-spec.md`. Captures the 3-era evolution (Vercel Cron direct → Supabase pg_cron + Edge Function → current Vercel-Cron-triggered Postgres queue). The pg_cron design is preserved at `docs/operations/historical-supabase-cron-spec.md` as historical record.
