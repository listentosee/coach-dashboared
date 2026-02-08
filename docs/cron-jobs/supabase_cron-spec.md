# Supabase Cron & Edge Function Implementation Plan

## Phase 1 – Supabase CLI Setup & Verification

### Objectives
- [x] Ensure the Supabase CLI is installed, authenticated, and pointing at project `ejoplrkrqvddiklwsfoj`.
- [x] Capture required environment inputs (service role key, project URL, etc.).
- [x] Validate that the local workspace can manage functions, secrets, and deployments *(verified against hosted project; local stack skipped by design).* 

### Step-by-step
1. **Install / update CLI**
   - [x] `brew install supabase/tap/supabase` or `brew upgrade supabase/tap/supabase`.
   - [x] Verify: `supabase --version` (target 2.40.7 or newer).
2. **Authenticate the workstation**
   - [x] Generate a personal access token from the Supabase dashboard (Account Settings → Access Tokens) with write access.
   - [x] `supabase login --token <personal-access-token>`.
   - [x] Confirm token stored: `supabase projects list`.
3. **Link the local repo to the project**
   - [x] From repo root: `supabase link --project-ref ejoplrkrqvddiklwsfoj`.
   - [x] This writes/updates `supabase/config.toml`.
4. **Baseline configuration**
   - [x] Ensure `supabase/config.toml` contains:
     ```toml
     project_id = "ejoplrkrqvddiklwsfoj"

     [functions]
       [functions.sync]
         verify_jwt = false
     ```
   - [ ] Commit this file so the project ID is versioned.
5. **Secrets management (interactive check)**
   - [x] `supabase secrets list` (should include `PROJECT_URL`, `SERVICE_ROLE_KEY` once we set them in Phase 3).
   - [x] For reproducibility, document secrets in 1Password or equivalent—not in git.

### Verification checklist
- [x] `supabase status` succeeds and displays linked project. *(Validated against hosted project; local stack intentionally skipped.)*
- [x] `supabase functions list` responds (expects `sync` after Phase 3 deployment).
- [x] Able to run read-only commands such as `supabase db list` without error.
- [x] Local `.env` file stays out of version control but can be used with `--env-file` when serving functions.

## Phase 2 – Supabase Cron Scheduling

### Objectives
- [ ] Leverage Supabase `pg_cron` to call the edge function hourly (or chosen cadence) from inside the database network.
- [ ] Store secrets used by cron in Supabase Vault to avoid plaintext credentials.

### Step-by-step
1. **Prepare Vault secrets**
   - [x] Store project URL and service role key in the Supabase Vault (once per environment):
     ```sql
     select vault.create_secret('<project-url>', 'project_url');
     select vault.create_secret('<service-role-key>', 'service_role_key');
     ```
     (If the secret already exists, run `select vault.update_secret('<secret-id>', new_name := '...');` to adjust metadata.)
   - [ ] Alternatively, use Dashboard → Vault UI.
2. **Schedule the cron job**
   - [x] Connect to SQL editor or `supabase db remote commit --db-url ...` and run:
     ```sql
     select cron.schedule(
       job_name => 'sync_game_platform_stats',
       schedule => '0 * * * *',              -- top of every hour
       command  => $$
         select
           net.http_post(
             url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync',
             headers := jsonb_build_object(
               'Content-Type','application/json',
               'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
             ),
             timeout_milliseconds := 10000
           );
       $$
     );
     ```
3. **Write audit queries**
   - [x] Check scheduled jobs: `select * from cron.job;`
   - [x] Inspect last runs: `select * from cron.job_run_details order by start_time desc limit 20;`
     *(current failure: `net.http_post` returns “Out of memory”; Supabase advises checking worker backlog and pg_net settings.)*
4. **Backoff & retry strategy**
   - [ ] If expecting long runtimes, adjust schedule (`'*/15 * * * *'`) and consider wrapping `net.http_post` in a stored procedure that introduces retry on 5xx responses.

### Verification checklist
- [x] `cron.job` table shows `sync_game_platform_stats` active.
- [ ] Job run details indicate HTTP 200 responses; failures produce logged JSON for debugging. *(blocked while `net.http_post` → `Out of memory`; see “Cron Troubleshooting” below.)*
- [x] Supabase Vault entries resolve: `select * from vault.decrypted_secrets` (requires Vault access) should include `project_url` and `service_role_key`.

## Phase 3 – Job Queue Orchestrator (Supabase Cron + App Worker)

### Objectives
- Shift Game Platform sync execution into an internal job queue processed by our infrastructure while Supabase cron simply triggers the worker.
- Preserve existing sync logic in `lib/integrations/game-platform` but add durable retries, observability, and manual controls.
- Provide an Admin Tools view so operators can monitor, retry, or cancel jobs.

### Development chunks
1. **Queue schema & migrations**
   - [x] Create `job_queue` table (`id uuid default gen_random_uuid()`, `task_type text`, `payload jsonb`, `status text`, `run_at timestamptz`, `attempts int`, `max_attempts int`, `last_error text`, timestamps).
   - [x] Add indexes on `(status, run_at)` and `(task_type)`; seed helper data for local testing.
   - [x] Enable RLS limiting access to service-role or `is_admin_user()` requests.
2. **Application job service**
   - [x] Implement utilities to enqueue jobs, claim work (`FOR UPDATE SKIP LOCKED`), update status/attempts, and calculate retry/backoff.
   - [x] Register handler for `game_platform_sync` that invokes `syncAllCompetitorGameStats`, honoring `dryRun` and `coachId`, and stores summary/errs back on the row.
   - [ ] Add automated tests covering enqueue/claim/success/failure paths.
3. **Worker endpoint**
   - [x] Build `/api/jobs/run` (Next.js route) that checks a shared secret, processes N due jobs, and returns a JSON report `{ processed, succeeded, failed, results }`.
   - [ ] Emit structured logs per job (id, attempts, duration) for observability/alerts.
4. **Supabase cron integration**
   - [x] Update the cron command to call the worker endpoint with a minimal payload (now reads secrets from Vault: `job_queue_worker_endpoint`, `job_queue_runner_secret`).
   - [x] Store/rotate the shared secret in Vault (`job_queue_runner_secret`) and configure app env `JOB_QUEUE_RUNNER_SECRET`.
   - [x] Confirm cron logs show HTTP 200 responses post-change. *(Latest response: 200 with `{"status":"ok","processed":0,...}`)*
5. **Admin monitoring UI**
   - [x] Add Admin Tools page showing queue metrics, list with filters, toggle for processing, cron health modal, and actions (retry, cancel).
   - [ ] Expose job detail modal (payload, attempt history) and archive/run-now controls.
6. **Operational polish**
   - [x] Add structured logging/Sentry alerts for repeated failures.
   - [x] Schedule cleanup for succeeded jobs older than N days. *(cron: `job_queue_cleanup_daily` @ 03:15 UTC, retains 14 days)*
   - [x] Document maintenance playbook (pause processing, replay jobs, schema updates).

### Verification checklist
- [ ] Enqueue inserts a `pending` row with expected payload/run_at.
- [ ] Worker processes jobs to `succeeded` (or `failed` with `last_error`) and honors retry limits.
- [ ] Supabase cron invocation returns HTTP 200 with minimal payload (no `net.http_post` OOM).
- [ ] Admin UI reflects real-time queue state and manual controls behave.
- [ ] Alerting and cleanup routines keep the queue healthy.

### Notes
- Local `supabase functions serve` remains blocked until Docker (`99-roles.sql`) is fixed; add a `deno task` once local stack is available.
- Future enhancements (staleness filter, run ledger) can be modeled as additional job types or columns on `job_queue`.
- Shared secret and endpoint live in Supabase Vault (`job_queue_runner_secret`, `job_queue_worker_endpoint`); keep the cron payload minimal to avoid heavy `net.http_post` conversions.
- Consider feature flags / env toggles to pause automatic processing while leaving manual tools available.
- Admin UI includes an inline playbook modal for quick access to recovery procedures.
- Configure `JOB_QUEUE_RUNNER_SECRET` in app env and Supabase cron payload; rotate periodically.

## Phase 4 – Cron Jobs Management UI

### Objectives
- Provide Admin Tools interface for viewing, enabling/disabling, and modifying Supabase pg_cron schedules.
- Surface execution history from `cron.job_run_details` for debugging and monitoring.
- Enable admins to manage cron jobs without direct database access.

### Implementation

#### Database Functions
Created security definer functions for cron management:

**Migration: `20250930_cron_management_functions.sql`**

1. **`get_cron_jobs()`** - Returns all cron jobs from `cron.job` table
   - Security: Admin-only access via profile role check
   - Returns: jobid, jobname, schedule, command, database, username, active status

2. **`get_cron_job_runs(limit_count)`** - Returns execution history from `cron.job_run_details`
   - Security: Admin-only access via profile role check
   - Returns: runid, jobid, jobname, status, return_message, start/end times
   - Default limit: 50 recent runs

3. **`toggle_cron_job(job_name, new_active)`** - Enable/disable cron jobs
   - Security: Admin-only access via profile role check
   - Updates `cron.job.active` field by job name

4. **`update_cron_schedule(job_name, new_schedule)`** - Modify cron schedule
   - Security: Admin-only access via profile role check
   - Uses `cron.alter_job()` to update schedule expression
   - Validates job exists before updating

**Migration: `20250930_cron_create_function.sql`**

5. **`create_cron_job(job_name, job_schedule, task_type, task_payload, max_attempts)`** - Create new cron jobs
   - Security: Admin-only access via profile role check
   - Uses `cron.schedule()` to create job that calls `job_queue_enqueue()`
   - Validates job name uniqueness
   - Returns: new job ID
   - Default max_attempts: 3, default payload: `{}`

All functions use `security definer` with `set search_path = public, cron` to access cron schema tables.

#### API Routes
Created REST endpoints for cron operations:

1. **`/api/admin/cron-jobs` (GET)** - Fetch jobs and execution history
   - Validates admin role
   - Calls `get_cron_jobs()` and `get_cron_job_runs()` RPCs
   - Returns combined data for UI rendering

2. **`/api/admin/cron-jobs/create` (POST)** - Create new cron job
   - Validates admin role
   - Accepts `{ jobName, schedule, taskType, payload, maxAttempts }` payload
   - Validates cron expression format (5 fields)
   - Validates JSON payload
   - Calls `create_cron_job()` RPC
   - Returns job ID on success

3. **`/api/admin/cron-jobs/toggle` (POST)** - Enable/disable jobs
   - Validates admin role
   - Accepts `{ jobName, active }` payload
   - Calls `toggle_cron_job()` RPC

4. **`/api/admin/cron-jobs/schedule` (POST)** - Update job schedule
   - Validates admin role
   - Accepts `{ jobName, schedule }` payload
   - Validates cron expression format (5 fields)
   - Calls `update_cron_schedule()` RPC

#### Admin UI Components

**Page: `/app/dashboard/admin-tools/cron-jobs/page.tsx`**
- Server component fetching cron data via RPCs
- Summary cards: Total jobs, Active, Inactive, Recent failures
- Renders CronJobsTable and CronExecutionHistory components

**Component: `CronJobsTable`**
- Client component with TanStack React Table
- Features:
  - **Create Job** button with dialog form
    - Job name input (unique identifier)
    - Schedule input with pattern hints
    - Task type dropdown (available job handlers)
    - JSON payload textarea with validation
    - Max attempts number input
  - Toggle active/inactive status with Switch component
  - Edit schedule with Dialog modal
  - Schedule description helper (e.g., "0 * * * *" → "Hourly")
  - Status badges (active/inactive)
  - Command preview with truncation
- State management for create/toggle/edit loading states
- Form validation (JSON payload, required fields)
- Optimistic UI updates with error handling

**Component: `CronExecutionHistory`**
- Client component showing execution history
- Features:
  - Status badges (succeeded/failed/running)
  - Duration formatting (ms/s/m)
  - Details dialog with full return message
  - Timestamp formatting
  - Status icons (CheckCircle2/XCircle/Clock)

**Navigation:**
Added link to Admin Tools menu in `components/dashboard/admin-tools-link.tsx`

### Cron Job Types

The application currently uses two cron jobs for Game Platform integration:

1. **`game_platform_sync_incremental`** (every 30 minutes)
   - Enqueues `game_platform_sync` job type
   - Uses `after_time_unix` for incremental data fetch
   - Sets `needs_totals_refresh` flags when activity detected

2. **`game_platform_totals_sweep_hourly`** (every hour)
   - Enqueues `game_platform_totals_sweep` job type
   - Processes competitors with `needs_totals_refresh = true`
   - Fetches fresh totals from MetaCTF source of truth

3. **`job_queue_cleanup_daily`** (daily at 03:15 UTC)
   - Deletes succeeded jobs older than 14 days
   - Keeps queue table manageable

4. **`release_parent_email_verification`** (every 60 minutes)
   - Enqueues `release_parent_email_verification` job type
   - Finds minor (`template_kind = 'minor'`) Zoho agreements in `sent` status older than 4 hours with no verification probe sent
   - Sends a lightweight probe email via SendGrid (through the `send-email-alert` Supabase Edge Function) to the parent email
   - SendGrid delivery events (`bounce`, `dropped`, `blocked`) are received at `/api/sendgrid/events` and mark `competitors.parent_email_is_valid = false`
   - This is a **fallback** for the primary real-time validation at profile save time (see `docs/zoho/zoho-sign-integration.md` § 6)
   - Handler: `lib/jobs/handlers/releaseParentEmailVerification.ts`
   - Payload options: `{ staleHours?: number, limit?: number, dryRun?: boolean }`
   - Default: `staleHours = 4`, `limit = 50`

### Usage

**View all cron jobs:**
Navigate to Admin Tools → Cron Jobs to see:
- All scheduled jobs with their cadence
- Active/inactive status
- Recent execution history
- Failure counts and details

**Create a new cron job:**
Click "Create Cron Job" button in the Admin Tools → Cron Jobs page. Fill in:
- **Job Name**: Unique identifier (e.g., `my_scheduled_task`)
- **Schedule**: Cron expression (e.g., `0 * * * *` for hourly)
- **Task Type**: Select from available handlers (`game_platform_sync` or `game_platform_totals_sweep`)
- **Payload**: JSON data for the handler (e.g., `{"dryRun": false, "coachId": null}`)
- **Max Attempts**: Retry limit before marking failed (default: 3)

The job will immediately appear in the job list and begin running on schedule. Jobs enqueue tasks into the `job_queue` table which are processed by `/api/jobs/run`.

**Enable/disable a job:**
Use the toggle switch in the Scheduled Jobs table. Jobs can be disabled without deleting them.

**Update job schedule:**
Click "Edit" button, enter new cron expression (5 fields: `minute hour day month weekday`), and save. Examples:
- `0 * * * *` - Hourly at minute 0
- `*/30 * * * *` - Every 30 minutes
- `0 3 * * *` - Daily at 3:00 AM
- `0 */2 * * *` - Every 2 hours

**Debugging failures:**
Click on any execution in the history table to view:
- Full return message (error details)
- Start and end timestamps
- Job duration
- Status and PID

### Migration Notes
- Migrations must be applied via Supabase Dashboard SQL Editor (Supabase CLI not configured in this project)
- Apply in order:
  1. `20250930_add_totals_refresh_flag.sql` - Adds totals refresh tracking
  2. `20250930_game_platform_totals_sweep_cron.sql` - Creates totals sweep job
  3. `20250930_cron_management_functions.sql` - Creates view/toggle/update functions
  4. `20250930_cron_create_function.sql` - Creates job creation function
- Functions grant execute permissions to `authenticated` role (admin check enforced inside functions)

### Verification
- [x] Admin Tools navigation includes Cron Jobs link
- [x] Cron Jobs page loads with summary statistics
- [x] Can view all scheduled jobs from `cron.job` table
- [x] Can view execution history from `cron.job_run_details`
- [x] Can create new cron jobs via UI with form validation
- [x] Can toggle jobs active/inactive via UI
- [x] Can update cron schedules via UI
- [x] Only admins can access the page and API endpoints
- [x] Task type dropdown populated from available job handlers
- [x] JSON payload validated before submission

### Cron Troubleshooting (per Supabase guidance)
- [ ] Confirm job cadence is reasonable (≥ 1 minute) and no overlap: `select jobid, schedule, active from cron.job;`
- [ ] Inspect recent runs for errors: `select start_time, status, return_message from cron.job_run_details where jobid = 3 order by start_time desc limit 50;`
- [ ] Monitor pg_net queues: `select count(*) pending from net.http_request_queue;` and `select count(*) responses from net._http_response;`
- [ ] Check pg_net config (`pg_net.batch_size`, `pg_net.ttl`) and restart worker if tuning: `select net.worker_restart();`
- [ ] If OOM persists, lower `timeout_milliseconds` (e.g., 5000 → 3000), reduce batch size (`alter role postgres set pg_net.batch_size = 100`), or clear backlog after slowing schedule.
- [ ] Escalate to Supabase support with job id + error context if failures continue after tuning.
### Baseline Sources & Best Practices
- [x] Supabase Docs – Edge Functions Overview & CLI (`supabase.com/docs/guides/functions`) reinforce the explicit extension requirement and secrets workflow.
- [x] Supabase Docs – `pg_cron` & `net` extensions (`supabase.com/docs/guides/database/extensions/pg-cron`) inform the Vault + cron scheduling pattern.
- [x] Supabase Community Insights – posts by Supabase staff (Jan 2024 office hours) advocate Vault-backed secrets and service-role isolation for cron triggers.
- [x] Deno Deploy Guides – emphasize ESM-only modules, `import_map.json`, and environment shimming when sharing code with Node runtimes.
- [x] Internal integration history – `game-platform/service.ts` already encapsulates API contracts; reusing this library avoids duplicated HTTP clients and aligns with prior sync behavior.
