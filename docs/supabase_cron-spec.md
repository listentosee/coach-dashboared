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
   - [x] Add Admin Tools page showing queue metrics, list with filters, and actions (retry, cancel).
   - [ ] Expose job detail modal (payload, attempt history) and archive/run-now controls.
6. **Operational polish**
   - [x] Add structured logging/Sentry alerts for repeated failures.
   - [x] Schedule cleanup for succeeded jobs older than N days. *(cron: `job_queue_cleanup_daily` @ 03:15 UTC, retains 14 days)*
   - [ ] Document maintenance playbook (pause processing, replay jobs, schema updates).

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
- Configure `JOB_QUEUE_RUNNER_SECRET` in app env and Supabase cron payload; rotate periodically.

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
