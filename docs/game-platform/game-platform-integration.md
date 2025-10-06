# Game Platform Integration Spec

## 1. Objectives
- Enable coaches to add compliant competitors to the SynED Game Platform and keep platform rosters in sync with our internal data.
- Mirror team structure and roster changes between Coach Dashboard and the Game Platform in near real-time.
- Provide visibility into Game Platform activity (scores, assignments, sync health) from a dedicated dashboard section.

## 2. Context & Constraints
- The Game Platform provides REST endpoints under `/integrations/syned/v1/...` requiring an `Authorization` header (token format TBD).
- Current competitor statuses progress `pending → profile → compliance → complete`; status becomes `complete` when `game_platform_id` is set.
- App uses Next.js 15 with React Query, Supabase as primary data store, and role-based gating for coaches/admins.
- Network access is restricted; remote calls must be proxied through server-side code (Next.js Route Handlers or Server Actions).

## 3. Success Criteria
1. Coaches can trigger "Add to Game Platform" only after competitor status is `compliance` and the action promotes them to `complete` upon success.
2. Team CRUD operations in Coach Dashboard automatically reflect on the Game Platform (create/update roster assignments within 60s).
3. Dashboard shows synchronized data with last sync timestamps and actionable error states.
4. Integration code is covered by unit/integration tests with mocked Game Platform responses and an operational runbook exists.

## 4. High-Level Architecture
```
Coach UI -> Next.js Route Handlers -> GamePlatformClient (fetch wrapper)
         -> Supabase (store IDs, statuses, audit logs)
Background Sync (cron/job) -> Next.js route or Edge Function -> GamePlatformClient -> Supabase
```
- `GamePlatformClient`: encapsulate base URL, auth header injection, schema validation, retry/backoff.
- Server routes enforce Supabase auth, manage transactions, and update local state before returning to UI.
- Background sync jobs reconcile local records with Game Platform to detect drift.

## 5. API Surface Mapping
- https://api.metactf.com/integrations/syned/v1/e87feecf8513a3cd34496c9a37aba5fe/docs#/
| Domain                | Game Platform Endpoint                                       | Notes |
|----------------------|---------------------------------------------------------------|-------|
| Create competitor    | `POST /users` (body: `UserCreate`)                            | Requires role, email, optional `syned_user_id` for idempotency. |
| Reset password       | `POST /auth/send_password_reset_email`                        | Trigger via coach actions (optional). |
| Create team          | `POST /teams` (body: `TeamCreate`)                            | Needs `syned_coach_user_id` and team metadata. |
| Delete team          | `POST /teams/delete` (body: `{ syned_team_id }`)              | Only callable when team has no members. |
| Assign member        | `POST /users/assign_team`                                     | Body includes `syned_team_id`, `syned_user_id`. |
| List assignments     | `GET /users/get_team_assignments` (body with `syned_team_id`) | Verify GET+body expectation with vendor. |
| Fetch scores         | `GET /scores/get_odl_scores` (body optional)                  | Returns solved challenge metrics per user. |

### Request/Response Handling
- All calls include `Authorization: Bearer ${GAME_PLATFORM_API_TOKEN}` (assume bearer until confirmed).
- Use Zod schemas to validate responses (capture actual payloads during sandbox testing and evolve schemas accordingly).
- Standardize error shape: convert non-2xx into `GamePlatformError` with `status`, `code`, `message`, `context`.

## 6. Supabase Schema Changes
- `competitors` table
  - `game_platform_id UUID` (nullable, unique) — remote `syned_user_id`.
  - `game_platform_sync_error TEXT` — last error message for UI display.
  - `game_platform_synced_at TIMESTAMP` — last successful sync.
- `teams` table
  - `game_platform_id UUID` — remote `syned_team_id`.
  - `game_platform_synced_at TIMESTAMP`.
- `team_memberships` (if exists)
  - `game_platform_synced_at TIMESTAMP` for assignment-level tracking.
- New table `game_platform_scores`
  - `competitor_id UUID` FK, `score_json JSONB`, `fetched_at TIMESTAMP`, optional derived metrics. *(Legacy aggregate store—kept until dashboards move fully to normalized tables.)*
- New table `game_platform_challenge_solves`
  - Columns: `id` (PK), `syned_user_id`, `metactf_user_id`, `challenge_solve_id`, `challenge_id`, `challenge_title`, `challenge_category`, `challenge_points`, `solved_at`, `source` (`odl`\|`flash_ctf`), `raw_payload JSONB`, `ingested_at TIMESTAMP DEFAULT now()`.
  - Constraints: `UNIQUE (syned_user_id, challenge_solve_id)` and indexes on `(syned_user_id, solved_at DESC)` to dedupe vendor responses and speed resume queries.
- New table `game_platform_flash_ctf_events`
  - Columns: `id` (PK), `syned_user_id`, `metactf_user_id`, `event_id` (vendor identifier or derived hash), `name`, `description`, `challenges_solved`, `score`, `started_at`, `ended_at`, `raw_payload JSONB`, `ingested_at TIMESTAMP DEFAULT now()`.
  - Constraint: `UNIQUE (syned_user_id, event_id)`.
- New table `game_platform_sync_state`
  - Columns: `syned_user_id` (PK), `last_odl_synced_at`, `last_flash_ctf_synced_at`, `last_remote_accessed_at`, `last_attempt_at`, `last_result` (`success`\|`failure`), `error_message` TEXT.
- Migration scripts should backfill existing `game_platform_id` where known, seed sync-state rows for current competitors, and add indexes on all new ID columns.

## 7. Backend Integration Plan
1. **Client Wrapper (`lib/game-platform/client.ts`)**
   - Generic `request<T>(config)` handling retries (exponential backoff up to 3 attempts for 5xx/timeouts).
   - Methods: `createUser`, `sendPasswordReset`, `createTeam`, `deleteTeam`, `assignMember`, `getTeamAssignments`, `getOdlScores`.
   - Accept AbortSignal for cancellation and support structured logging.
2. **Service Layer (`lib/game-platform/service.ts`)**
   - `onboardCompetitor(competitorId)` orchestrates user creation, Supabase update, status recompute.
   - `syncTeam(teamId)` ensures remote team exists, creates/updates metadata, syncs roster.
   - `deleteTeamFromGamePlatform(teamId)` calls MetaCTF API to delete team, skips if not synced, logs errors but doesn't block local deletion.
   - `syncScores(teamId | null)` fetches ODL scores, stores snapshots.
3. **Route Handlers (`app/api/game-platform/...`)**
   - `POST /competitors/{id}`: guard on `status === 'compliance'`, invoke service, return updated competitor DTO.
   - `POST /teams/{id}/sync`: triggered from UI or background to push latest roster.
   - `DELETE /api/teams/{id}`: validates no members exist, calls Game Platform deletion API, then deletes local record. Returns error if members exist or if local deletion fails. API deletion failures are logged but don't block local cleanup.
   - `POST /scores/sync`: cron endpoint for scheduled score ingestion.
4. **Status Calculation**
   - After Supabase update, reuse `calculateCompetitorStatus` to set `complete` when `game_platform_id` stored.
   - Consider Supabase trigger to auto-update status on `game_platform_id` change for consistency.

## 8. Frontend Updates
- Competitor list row (in `app/dashboard/page.tsx`)
  - Show "Add to Game Platform" button when `status === 'compliance' && !game_platform_id`.
  - Disabled tooltip when `status !== 'compliance'` explaining prerequisites.
  - On click, call `/api/game-platform/competitors/{id}`, show loading state, optimistic status update to `complete` or show error.
- Team management UI
  - Ensure create/update forms propagate division & affiliation (match Game Platform enum values).
  - When members are added/removed, show inline badge for remote sync status (e.g., `Synced`, `Pending`, `Error`).
- Dashboard Game Platform section
  - Overview cards: total synced competitors, teams, last sync.
  - Leaderboard and trend charts using cached `game_platform_scores` data.
  - Activity log table with recent sync actions/errors.

## 9. Background Jobs & Sync

The application uses a **job queue system** (see `docs/cron-jobs/supabase_cron-spec.md`) where Supabase `pg_cron` enqueues tasks into the `job_queue` table, and a Next.js worker at `/api/jobs/run` processes them. All jobs respect the `job_queue_settings.processing_enabled` flag and can be monitored/retried via Admin Tools.

### Job Types

#### 1. Incremental Challenge Solves Sync (`game_platform_sync`)
- **Schedule**: Every 30 minutes
- **Handler**: `lib/jobs/handlers/gamePlatformSync.ts`
- **Purpose**:
  - Fetches only new challenge solves using `after_time_unix` parameter from `game_platform_sync_state.last_odl_synced_at`
  - Stores detailed solve records in `game_platform_challenge_solves` and `game_platform_flash_ctf_events`
  - Sets `needs_totals_refresh = true` flag for competitors with new activity
  - Syncs team rosters with MetaCTF platform
- **Performance**: Fast & serverless-friendly (completes in seconds, only fetches incremental data)

#### 2. Totals Refresh Sweep (`game_platform_totals_sweep`)
- **Schedule**: Hourly (top of the hour)
- **Handler**: `lib/jobs/handlers/gamePlatformTotalsSweep.ts`
- **Cron Config**: `supabase/migrations/20250930_game_platform_totals_sweep_cron.sql`
- **Purpose**:
  - Queries competitors where `needs_totals_refresh = true`
  - Fetches fresh aggregate totals from MetaCTF (without `after_time_unix`)
  - Updates `game_platform_stats` with accurate totals (`challenges_completed`, `total_score`, `monthly_ctf_challenges`)
  - Clears `needs_totals_refresh` flag on success
  - Processes batch of 100 competitors per run (configurable via payload)
- **Crash Resistance**: Unflushed flags picked up by next run; failed competitors logged and can be retried
- **Efficiency**: Typically processes only ~0-50% of competitor population (those with new activity)

#### 3. Job Queue Cleanup
- **Schedule**: Daily at 03:15 UTC
- **Purpose**: Archives succeeded/cancelled jobs older than 14 days to keep queue healthy

### Job Queue Worker

- **Endpoint**: `/api/jobs/run`
- **Authentication**: Shared secret in `JOB_QUEUE_RUNNER_SECRET` env var
- **Trigger**: Supabase cron calls worker, which claims and processes pending jobs
- **Observability**:
  - Admin Tools UI shows real-time queue state
  - Structured logging per job (id, attempts, duration)
  - Sentry integration for repeated failures
  - Cron health modal displays execution history

### Manual Triggers

Admins can manually trigger syncs via Admin Tools:
- Enqueue immediate sync: `{ taskType: 'game_platform_sync', payload: { dryRun?: boolean, coachId?: string } }`
- Force totals refresh: `{ taskType: 'game_platform_totals_sweep', payload: { batchSize?: number } }`

### Retry Strategy

- Jobs automatically retry on failure with exponential backoff (default: 5 minute delay)
- Max 3-5 attempts (configurable per job type)
- Failed jobs remain in queue for manual investigation/replay
- Retry controls available in Admin Tools job detail modal

## 10. Error Handling & Observability
- Log each external call with context (`competitorId`, `teamId`) and redacted payloads.
- On failures, update the relevant `game_platform_sync_error` and surface to UI with remediation guidance.
- Integrate with existing monitoring (Sentry) to capture exceptions thrown by service layer.
- Add admin-only page to view sync backlog and force retries.

## 11. Security Considerations
- Store API token in environment (`GAME_PLATFORM_API_TOKEN`), inject via Next.js runtime config, never expose to client.
- Validate inputs against Supabase data before hitting external API to prevent tampering.
- Rate limit coach-triggered sync endpoints to avoid accidental abuse.
- Audit logging: record who triggered manual sync actions (user id, timestamp).

## 12. Testing Strategy
- **Unit Tests**: Mock `fetch` in `GamePlatformClient`; assert correct headers, retries, and error mapping.
- **Service Tests**: Use Supabase test harness or in-memory substitute to ensure status transitions and DB writes.
- **Route Tests**: Next.js Route Handler tests verifying auth gating and payload validation.
- **UI Tests**: Playwright scenarios for enabling/disabling the button, successful sync, and error state display.
- **Manual QA**: Sandbox token to run through competitor onboarding, team creation, roster edits, and score polling.

## 13. Deployment & Rollout
- Feature flag the Game Platform integration (e.g., `NEXT_PUBLIC_GAME_PLATFORM_ENABLED`) to allow progressive rollout.
- Migrate database ahead of code deploy; run data backfills to attach existing external IDs.
- Deploy client + API wrapper, release to internal testers, monitor logs.
- After validation, enable feature for all coaches and communicate workflow changes.

## 14. Open Questions
1. Confirm the expected `Authorization` scheme and token lifecycle (expiry, refresh).
2. Determine whether GET endpoints truly accept JSON bodies; adjust client if query params required.
3. Is there an endpoint for updating/deleting teams or removing team assignments? If not, plan remediation steps.
4. Clarify ODL score payload structure to define schema and scoreboard calculations.
5. Are there rate limits or concurrency constraints we must respect when syncing large rosters?

## 15. Implementation Checklist
- [x] Obtain API credentials and sample payloads from SynED/MetaCTF.
- [x] Implement `GamePlatformClient` scaffold with mocked tests.
- [x] Ship Supabase migrations for new columns/tables and update status triggers.
- [x] Build competitor onboarding route + UI changes behind feature flag.
- [x] Integrate team sync service into team CRUD + membership flows.
- [x] Schedule initial background jobs for synchronization (scores, roster reconciliation) with observability hooks.
- [x] Finalize response schemas based on live payload captures and update validators.
- [ ] Complete integration/QA runbook and document rollback steps.
- [x] Scaffold Game Platform dashboard UI shell.
- [x] Apply final visual/styling tweaks and bind live data to dashboard components.
- [x] **Cron Jobs Management UI** - Admin Tools interface for viewing, creating, toggling, and editing Supabase pg_cron jobs.

## 16. Game Platform Dashboard Layout
- Vision: deliver a single-column analytics hub (no inner sidebar) that mirrors the high-tech aesthetic used in `app/dashboard/admin-tools/analytics/page.tsx` while remaining coach-friendly.
- Global KPIs: five StatCards across the top (Active on Platform, Registered Competitors, Team Enrollment, Total Challenges Solved, Monthly CTF Participation) with value, delta, and sparkline trends.
- Performance Row: left leaderboard table for "Challenges Done" with search/sort, right monthly CTF chart (toggle between pace and absolute scores) sharing the same filters.
- Teams Matrix: responsive grid of team tiles summarizing average scores, solved challenges, last sync; selecting a tile opens a drawer with member breakdown and quick actions (reassign, reset password).
- Access & Alerts: horizontal card duo listing onboarding/sync issues and inactive logins so coaches can triage access problems.
- Activity Timeline: bottom chart enumerating platform events (registrations, team edits, challenge streaks) with a full-screen option for deeper analysis.
- Filters & Responsiveness: stick to top-of-page filters (coach, division, date range) and reuse existing card/table primitives from the admin analytics page to ensure visual cohesion.
- Checklist
  - [x] Scaffold React components (`GlobalStats`, `Leaderboard`, `TeamsGrid`, `AlertsPanel`, `Timeline`) under `app/dashboard/game-platform/` using placeholder data.
  - [x] Wire components to real services once API payloads are confirmed; incorporate loading/error states and "last updated" metadata.

## 17. MetaCTF API Update – Refactoring Plan

### 17.1 API Contract Deltas (Dec 2024)
- `GET /integrations/syned/v1/users`: new lookup by `syned_user_id`; response includes `metactf_user_status` and `metactf_username`.
- `POST /integrations/syned/v1/teams`: payload now requires `syned_team_id`, `division`, and `affiliation` in addition to coach and team name.
- `GET /integrations/syned/v1/users/get_team_assignments`: uses query params (optional `syned_team_id`) and returns `{ assignments, total_count }`.
- `GET /integrations/syned/v1/scores/get_flash_ctf_progress`: new feed exposing Flash CTF event details per user.
- `UserCreate` schema tightened (non-null `first_name`, `last_name`, `email`, `role`, `syned_user_id`); no documented password-reset endpoint in the spec.
- Responses for some `GET` endpoints are declared as HTTP 201; confirm expected status codes before hard-coding.

### 17.2 Phase 1 – Contract Alignment & Client Surface
- [x] Regenerate API type definitions from `metactf-openapi.json`; update Zod schemas and TypeScript interfaces in `GamePlatformClient`.
- [x] Extend client methods for `getUser` and `getFlashCtfProgress`; update existing methods with new required fields and response shapes.
- [x] Normalize HTTP status handling (treat 200/201 as success) and ensure bearer auth configuration matches published scheme.
- [x] Decision gate: confirm payload requirements (`division`, `affiliation`, enumerated `role`) with product owner and vendor; sign off before touching services.

### 17.3 Phase 2 – Service Layer & Data Sync
- [x] Update `onboardCompetitor` flow to populate `UserCreate` fields (map division/affiliation, coach linkage, guard against missing school/region IDs).
- [x] Adjust team sync orchestration to send `syned_team_id` and persist returned `metactf_team_id` / `metactf_coach_id` for reconciliation.
- [x] Replace ad-hoc roster reconciliation with `getTeamAssignments` call; fan out diffs to Supabase and emit structured sync logs.
- [x] Introduce `GamePlatformService.getRemoteUser` for idempotency checks before user creation.
- [x] Decision gate: validate end-to-end happy paths in staging (user + team provisioning, roster assign) before shipping migrations/feature flag updates.

### 17.4 Phase 3 – Scores & Dashboard Enhancements
- [x] Extend background score jobs to call both `get_odl_scores` and `get_flash_ctf_progress`; persist flash CTF payloads (`flash_ctfs` array) in new table or JSON column.
- [x] Surface Flash CTF metrics on the dashboard (timeline and alerts panels) with guards for empty payloads.
- [x] Update Supabase schema proposal to include `metactf_user_status`, `metactf_username`, and flash CTF structures where needed.
- [x] Decision gate: analytics/UX review to confirm dashboard additions align with coach needs before enabling UI changes.

### 17.5 Phase 4 – Testing, Ops, and Rollout
- [ ] Refresh integration tests and mocks to mirror new schemas (user/team create, team assignments, scores, flash CTF).
- [ ] Add regression tests for status normalization (201 vs 200) and optional query params.
- [ ] Update runbook with new endpoints, troubleshooting steps for Flash CTF sync, and vendor escalation paths.
- [ ] Coordinate deployment checklist (migrations, feature flags, background jobs) and schedule post-launch monitoring window.
- [ ] Decision gate: stakeholder sign-off on test results and runbook updates prior to production rollout.

## 18. MetaCTF Mock Environment Plan

### 18.1 Goals & Constraints
- Avoid hitting the production MetaCTF tenant while validating onboarding flows, background jobs, and dashboard observability.
- Provide deterministic, scriptable data scenarios that cover roster CRUD, ODL scores, and Flash CTF progress.
- Keep mock within repo and switchable via configuration so the same client/service code path exercises both real and simulated APIs.
- Capture request/response traces to help coaches understand expected patterns before live launch.

### 18.2 Proposed Architecture
- **Mock Service**: lightweight Fastify server (`scripts/metactf-mock-server.ts`) exposing the same routes defined in `metactf-openapi.json` with contract-level validation (use `zod` derived from OpenAPI).
- **Dual-Mode Data Layer**:
  - Default **in-memory JSON fixtures** (`mocks/metactf/fixtures/*.json`) for disposable local runs and CI.
  - Optional **Postgres-backed store** (Docker/Testcontainers) seeded from the same fixtures to mirror Supabase semantics when deeper testing is needed.
- **Configuration**: add `META_CTF_BASE_URL` env, defaulting to mock during local/dev/test; production/staging set to vendor URL. Feature flag `ENABLE_METACTF_MOCK` guards background job invocation. Storage mode toggled via `META_CTF_MOCK_STORAGE` (`memory` vs `postgres`).
- **Tooling**: provide `pnpm mock:metactf` script that runs the mock server alongside Next.js (`pnpm dev`) and accepts `--storage` flag. Integrate request logging via `pino` and expose `/__admin` endpoints for reset/seed operations.
- **MSW Integration**: for unit/integration tests, share fixtures with MSW handlers in `tests/mocks/metactf-handlers.ts` so Jest/Vitest suites do not need the HTTP server.

### 18.3 Phase A – Scaffolding & Contract Fidelity
- [x] Generate Zod schemas/types from `docs/metactf-openapi.json` (reuse Phase 1 tooling) for mock validation.
- [x] Implement mock server with route parity (`GET/POST` users, teams, assignments, scores, flash CTF).
- [x] Establish storage abstraction with in-memory adapter as the default implementation.
- [x] Ensure responses mirror HTTP status codes/headers expected by the real API.
- [x] Decision gate: contract review with backend team; confirm mock matches vendor spec before data seeding. *(Endpoints, query params, and schemas reconcile with the OpenAPI spec; mock adds 404 fallbacks for not-found entities as a safe extension.)*

### 18.4 Phase B – Scenario Fixtures & Data Seeding
- [x] Create baseline fixtures: 2 coaches, 3 teams, 12 competitors with mixed divisions/statuses.
- [x] Author Flash CTF timeline fixture covering active, completed, and empty states to drive dashboard visualizations.
- [x] Add helper script `pnpm mock:seed --dataset=<name>` to load alternative scenarios (e.g., sync errors, pending approvals).
- [x] Expose `/__admin/reset` and `/__admin/seed/:dataset` endpoints for UI-triggered reset during demos.
- [x] Implement optional Postgres storage adapter with docker-compose/Testcontainers bootstrap and shared fixture loader. *(`META_CTF_MOCK_STORAGE=postgres`, `META_CTF_MOCK_PG_URL`, docker compose template added.)*
- [x] Decision gate: product/UX sign-off that fixtures cover required coach workflows. *(Approved—baseline fixtures represent core flows for onboarding, dashboard sync, and error states.)*

### 18.5 Phase C – Integration with App & Jobs
- [x] Update `GamePlatformClient` to respect runtime base URLs (`META_CTF_BASE_URL`/`GAME_PLATFORM_API_BASE_URL`) and provide regression smoke tests. *(Client properly reads env vars; mock server tested at `http://localhost:4010`)*
- [x] **Competitor onboarding**
  - [x] Invoke `syncTeamWithGamePlatform` when a newly created user belongs to an active team.
  - [x] Persist `game_platform_id`, `syned_coach_user_id`, and clear sync errors on success.
  - [ ] Update UI to surface retry/clear options when onboarding fails. *(Deferred to Phase D UX polish)*
- [x] **Team lifecycle integration**
  - [x] Trigger `syncTeamWithGamePlatform` on team create/update and member add/remove flows. *(Team deletions remain a manual garbage-collection step until MetaCTF exposes a delete/archive endpoint; our UI prevents deletion while members remain.)*
  - [x] Map division + affiliation from Supabase to MetaCTF. *(Affiliation now falls back to the coach profile `school_name`; division continues to rely on the team record and is sanitized to vendor enums.)*
  - [x] Ensure coach MetaCTF IDs are populated (profile enrichment or mapping table).
  - Division is now required at team creation/edit, and the UI/API prevent assigning competitors outside the team's division.
- [x] **Roster reconciliation jobs**
  - [x] Background worker to compare Supabase roster vs MetaCTF assignments and remediate drift.
  - [x] Scheduled stats/score sync reads both ODL + Flash CTF endpoints for all synced competitors.
- [x] **Dashboard wiring**
  - [x] Verify team tiles render once remote assignments exist; add guardrails for missing data. *(Cards fall back to `'Affiliation unknown'` and disable drilldowns when data is missing.)*
  - [x] Surface coach/school/division metadata pulled from MetaCTF responses where available. *(Team grid and drilldowns display MetaCTF affiliation/division alongside roster counts.)*
  - [x] **Monthly CTF Momentum panel** ✅ **COMPLETED 2025-09-30**
    - [x] Extend dashboard API (`/api/game-platform/dashboard`) to query Flash CTF events from `game_platform_flash_ctf_events` table using service role client
    - [x] Calculate per-competitor Flash CTF metrics: this month events, 3-month average, 12-month total, last participation date
    - [x] Implement status indicators: 🔴 no participation, 🟡 declining (this month < 3mo avg), 🟢 active
    - [x] Create `MonthlyCtfMomentum` component with Score (student table) and Pace (12-month trend) views
    - [x] Wire Score/Pace toggle tabs in dashboard card
    - [x] Apply coach filtering logic matching main dashboard (respects admin_coach_id cookie)
    - [x] Filter to only show competitors with `game_platform_id` set (onboarded to platform)
    - [x] Fix chart overflow with proper container boundaries
    - *(Component displays actionable engagement data for coaches to identify students needing Flash CTF participation encouragement)*
  - [x] **Dashboard branding** ✅ **COMPLETED 2025-09-30**
    - [x] Add MetaCTF logo (`app/public/MetaCTF white.png`) to top right corner of Game Platform Dashboard header
    - *(Logo positioned at h-12 with 80% opacity to maintain visual hierarchy while providing vendor attribution)*
- [x] **Detailed score ingestion** ✅ **COMPLETED 2025-09-29**
  - [x] Implement client helpers for `get_odl_scores` and `get_flash_ctf_progress` detail endpoints. *(Schema updated to include `challenge_solves` array)*
  - [x] Upsert challenge solves into `game_platform_challenge_solves` (unique on `(syned_user_id, challenge_solve_id)`) *(Service layer properly processes ODL and Flash CTF solves)*
  - [x] Persist Flash CTF events into `game_platform_flash_ctf_events` and link nested solves with `source='flash_ctf'`. *(Events and nested challenge solves both stored)*
  - [x] Maintain per-user `game_platform_sync_state` markers (last synced/attempt, error state) to drive resumable jobs. *(Upserts on each sync with timestamps and error messages)*
  - [x] Enhanced mock fixtures: 201 ODL + 202 Flash CTF challenges across 9 domains for realistic testing. *(Generated from `supabase-sync` dataset)*
  - [x] Expose aggregates for dashboards/alerts from normalized tables (topics solved, recent events, counts). *(Data foundation complete; dashboard queries deferred to UI sprint)*
- [x] **Drill-down interactions** ✅ **COMPLETED 2025-09-30**
  - [x] Expose a reusable drill-down dialog component (`components/dashboard/drilldown-dialog.tsx`).
  - [x] Hook the component up for team roster views (members, awaiting add, full roster states).
  - [x] Add competitor challenge topic drilldowns to the "Challenges Done" leaderboard table.
  - [x] **Flash CTF drill-down**: Clicking competitor names in Monthly CTF Momentum table opens drill-down dialog showing their complete Flash CTF event history (event name, date, challenges solved, points earned). *(Implemented using existing DrilldownDialog component with events data populated from `game_platform_flash_ctf_events` via dashboard API)*
- [ ] **Automation**
  - [ ] Playwright/Cypress scenario: onboard competitor with team → verify mock reflects user & assignment → dashboard updates.
  - [ ] API integration tests hitting the mock to validate user+team payloads end-to-end.
- [~] Decision gate: engineering approval after successful E2E run against mock (UI actions + scheduled jobs). *(Manual testing against mock environment required before production deployment)*

### 18.6 Phase D – Observability & Developer Experience
- [ ] Instrument mock server with structured logs and an optional WebSocket/event-stream to simulate vendor webhooks or activity feeds.
- [ ] Add Grafana/Looker exploration doc describing how to interpret log fields during live monitoring.
- [ ] Document local workflow (`pnpm mock:metactf`, env vars, dataset toggles) in the runbook and README snippets.
- [ ] Package reusable fixture builder utilities for writing contract tests and synthetic monitoring scripts.
- [ ] Decision gate: DevRel/Support walkthrough to validate documentation and observability readiness before release.

### 18.7 Local Usage Notes

**IMPORTANT: Dataset Selection**

Two mock datasets are available:
- **`supabase-sync`** ✅ **(RECOMMENDED)** - Contains actual Supabase competitor IDs from `docs/db_data_dump.sql`. Use this for testing with your local/dev database.
- **`baseline`** - Contains generic test IDs for isolated unit testing.

⚠️ **Common Issue**: If ODL score endpoints return 404 errors, verify you're using the correct dataset! Run `npx tsx scripts/verify-mock-data.ts` to check alignment.

**Starting the Mock Server:**

```bash
# Option 1: Use environment variable (recommended - persists across restarts)
# Add to .env: META_CTF_MOCK_DATASET=supabase-sync
npm run mock:metactf

# Option 2: Command line override
npm run mock:metactf -- --dataset=supabase-sync

# Option 3: Use testenv helper (starts Postgres + mock with correct dataset)
npm run testenv
```

**Configuration:**
- Control datasets via `META_CTF_MOCK_DATASET=supabase-sync` environment variable
- Control storage via `META_CTF_MOCK_STORAGE=memory|postgres`
- Point app at mock with `GAME_PLATFORM_API_BASE_URL=http://localhost:4010/integrations/syned/v1`

**Admin Endpoints:**
- Reset/seed without restarts: `POST /__admin/reset` or `POST /__admin/seed { "dataset": "supabase-sync" }`
- Discover available datasets: `GET /__admin/datasets`
- Check current dataset: `GET /integrations/syned/v1/` (returns `{ status, storageMode, dataset }`)

**Testing Individual Endpoints:**
```bash
# Verify ODL scores for a specific competitor
curl "http://localhost:4010/integrations/syned/v1/scores/get_odl_scores?syned_user_id=42d2f47f-c965-4ddb-8071-f601a1d0194d"

# Verify team assignments
curl "http://localhost:4010/integrations/syned/v1/users/get_team_assignments?syned_team_id=6eb0aed7-219e-425d-97c9-273640822162"
```

**Dataset Alignment:**
- Postgres mode: run `docker compose -f docker/metactf-mock-compose.yml up -d`, set `META_CTF_MOCK_STORAGE=postgres` and (optionally) `META_CTF_MOCK_PG_URL=postgres://postgres:postgres@localhost:5434/metactf_mock`, then reseed via `npm run mock:seed -- --dataset=baseline`.
- Convenience: `npm run testenv` boots the Docker Postgres container, waits for readiness, and launches the mock server in Postgres mode (respects `META_CTF_MOCK_PG_URL` / `GAME_PLATFORM_API_BASE_URL`).
- **Quick read-only checks** (no reseed): use Node's fetch to hit the mock endpoints directly, e.g.
  ```bash
  node -e "fetch('http://localhost:4010/integrations/syned/v1/users?syned_user_id=219370d2-6876-4856-9aa4-6b7bf5dac947').then(r=>r.json()).then(console.log)"
  node -e "fetch('http://localhost:4010/integrations/syned/v1/users/get_team_assignments?syned_team_id=6eb0aed7-219e-425d-97c9-273640822162').then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
  ```
  This avoids the reset behaviour of `scripts/metactf-mock-seed.ts` and is handy after crashes to verify coaches/teams remain in the mock.

**Data Persistence:**
- **Memory mode** (`META_CTF_MOCK_STORAGE=memory`): Data resets on every restart. Good for isolated unit tests.
- **Postgres mode** (`META_CTF_MOCK_STORAGE=postgres`): Data persists across restarts in the Docker postgres container. Use for integration testing and manual QA.
- **Fresh start**: Use `npm run mock:metactf -- --reset` or `POST http://localhost:4010/__admin/reset` to clear and reload fixtures without restarting.

**Incremental Sync Testing:**
The mock environment now supports testing the two-phase sync architecture (incremental challenge fetch + totals refresh):

**Prerequisites:**
- Mock server running: `npm run testenv` (starts Postgres container + mock server with persistence)
- Next.js dev server running: `npm run dev`
- **Disable automatic job processing:** Navigate to Admin Tools → Jobs and toggle "Processing Enabled" to OFF
  - This prevents jobs from getting stuck in "running" state in dev environment
  - You'll manually trigger the worker when ready to process jobs

1. **Setup test environment:**
   ```bash
   npm run test:sync:setup    # Clears all app statistics and competitor sync metadata
   ```
   This clears:
   - All game platform statistics tables (`game_platform_challenge_solves`, `game_platform_stats`, `game_platform_sync_state`, `game_platform_flash_ctf_events`)
   - Competitor sync fields (`game_platform_synced_at`, `game_platform_sync_error`)

2. **Add initial activity (Wave 1):**
   ```bash
   npm run test:sync:wave1    # Adds challenges with current timestamps to mock server
   ```

3. **Trigger incremental sync:**

   The `game_platform_sync_incremental` cron runs every 30 minutes and enqueues jobs into the queue. Since automatic processing is disabled, manually trigger the worker:

   ```bash
   curl -X POST http://localhost:3000/api/jobs/run \
     -H "Content-Type: application/json" \
     -H "x-job-runner-secret: $(grep JOB_QUEUE_RUNNER_SECRET .env | cut -d '=' -f2)" \
     -d '{"limit": 10}'
   ```

   **Observe:**
   - Check `npm run test:sync:status` to see challenge solves stored
   - `needs_totals_refresh` flags set to `true` in `game_platform_sync_state`

4. **Run totals sweep:**

   The `game_platform_totals_sweep_hourly` cron runs every hour and enqueues jobs. Manually trigger the worker:

   ```bash
   curl -X POST http://localhost:3000/api/jobs/run \
     -H "Content-Type: application/json" \
     -H "x-job-runner-secret: $(grep JOB_QUEUE_RUNNER_SECRET .env | cut -d '=' -f2)" \
     -d '{"limit": 10}'
   ```

   **Observe:**
   - Aggregate stats populated in `game_platform_stats` table
   - `needs_totals_refresh` flags cleared
   - Run `npm run test:sync:status` to verify

5. **Check dashboard:**
   - Navigate to Game Platform Dashboard
   - **Observe:** Stats from Wave 1 displayed (challenges completed, total scores)

6. **Add more activity (Wave 2):**
   ```bash
   npm run test:sync:wave2    # Adds challenges 30 minutes later
   ```

7. **Trigger incremental sync again:**

   Manually trigger worker to process the sync job enqueued by cron:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/run \
     -H "Content-Type: application/json" \
     -H "x-job-runner-secret: $(grep JOB_QUEUE_RUNNER_SECRET .env | cut -d '=' -f2)" \
     -d '{"limit": 10}'
   ```

   **Observe:**
   - Only fetches NEW challenges (uses `after_time_unix` from `last_odl_synced_at`)
   - Only competitors with Wave 2 activity get `needs_totals_refresh = true`
   - Competitors without new activity keep their flags as `false`
   - Check with `npm run test:sync:status`

8. **Run totals sweep again:**

   Manually trigger worker to process the totals sweep job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/run \
     -H "Content-Type: application/json" \
     -H "x-job-runner-secret: $(grep JOB_QUEUE_RUNNER_SECRET .env | cut -d '=' -f2)" \
     -d '{"limit": 10}'
   ```

   **Observe:**
   - Only processes competitors flagged in step 7 (performance optimization)
   - Check with `npm run test:sync:status` to verify selective processing

9. **Monitor sync state:**
   ```bash
   npm run test:sync:status   # Shows sync timestamps, flags, and stats
   ```
   This displays:
   - Sync state table (last sync timestamps, refresh flags)
   - Aggregate stats (challenges completed, total scores)
   - Recent challenge solves

This workflow validates:
- ✅ Incremental sync using `after_time_unix` parameter (only fetches new data)
- ✅ Selective totals refresh (only flagged competitors processed)
- ✅ Timestamp tracking prevents duplicate ingestion
- ✅ Performance optimization (doesn't re-fetch all historical data)
- ✅ Two-phase architecture (fast incremental sync + targeted totals refresh)

## 19. MetaCTF API Enhancements Backlog

### 19.1 Team Deletion Support ✅ **COMPLETED 2025-09-30**
- **Requirement**: Provide an endpoint to archive or delete a team so roster removals in Coach Dashboard can propagate upstream without manual cleanup steps.
- **MetaCTF Solution**: Added `POST /integrations/syned/v1/teams/delete` endpoint accepting `{ syned_team_id: string }`.
- **Implementation**:
  - Added `deleteTeam()` method to `GamePlatformClient` ([lib/integrations/game-platform/client.ts:190](lib/integrations/game-platform/client.ts:190))
  - Added `deleteTeamFromGamePlatform()` service function ([lib/integrations/game-platform/service.ts:470](lib/integrations/game-platform/service.ts:470))
  - Updated `DELETE /api/teams/[id]` endpoint to:
    - Validate team has no members (backend enforcement)
    - Call MetaCTF API before local deletion
    - Log errors but continue with local cleanup (graceful degradation)
  - Team deletion triggers when coach deletes team in teams management (UI enforces "no members" constraint)
- **Result**: Teams lifecycle fully synchronized between Coach Dashboard and MetaCTF platform

### 19.2 ODL & Flash CTF Incremental Sync ✅ **COMPLETED 2025-09-30**
- **Requirement**: Add timestamp parameter to only extract records created after specified time to reduce bandwidth and improve performance.
- **MetaCTF Solution**: Added `after_time_unix` (optional integer) parameter to `GET /integrations/syned/v1/scores/get_odl_scores` endpoint.
- **Architecture**: Two-phase sync with separate Supabase cron jobs for serverless optimization

  **Job 1: Incremental Challenge Solves Sync** (runs every 30 minutes)
  - Fetches only new challenge solves using `after_time_unix` from `game_platform_sync_state.last_odl_synced_at`
  - Stores detailed solve records in `game_platform_challenge_solves` and `game_platform_flash_ctf_events`
  - Sets `needs_totals_refresh = true` flag for competitors with new activity
  - Fast & serverless-friendly (completes in seconds)

  **Job 2: Totals Refresh Sweep** (runs hourly)
  - Queries competitors where `needs_totals_refresh = true`
  - Fetches fresh aggregate totals (without `after_time_unix`) for flagged competitors only
  - Updates `game_platform_stats` with accurate totals (`challenges_completed`, `total_score`, `monthly_ctf_challenges`)
  - Clears `needs_totals_refresh` flag on success
  - Crash-resistant: unflushed flags picked up by next run
  - Typically processes small batch (<50% of population)

- **Implementation**:
  - Updated `GetScoresPayload` interface to include `after_time_unix` parameter ([lib/integrations/game-platform/client.ts:52](lib/integrations/game-platform/client.ts:52))
  - Modified `getScores()` method to pass `after_time_unix` as query parameter ([lib/integrations/game-platform/client.ts:202](lib/integrations/game-platform/client.ts:202))
  - Updated `syncCompetitorGameStats()` to:
    - Retrieve `last_odl_synced_at` from sync state table
    - Convert to Unix timestamp and pass to API
    - Store only challenge solve details (not totals)
    - Set `needs_totals_refresh` flag when new solves detected
  - Added `refreshCompetitorTotals()` function to fetch and update aggregate totals
  - Added `sweepPendingTotalsRefresh()` function to process all flagged competitors
  - Created `/api/internal/sync-totals` route for totals sweep cron job
  - Database migration: Added `needs_totals_refresh` boolean column + index to `game_platform_sync_state` table

- **Job Queue Configuration**:

  The application uses a job queue system (see `docs/cron-jobs/supabase_cron-spec.md`) where Supabase cron enqueues tasks that are processed by the app worker at `/api/jobs/run`.

  **Migration**: `supabase/migrations/20250930_game_platform_totals_sweep_cron.sql`
  ```sql
  -- Totals refresh sweep (hourly at :00)
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
  ```

  **Note**: The incremental sync job (`game_platform_sync`) already exists and runs every 30 minutes. The new `game_platform_totals_sweep` job complements it by refreshing aggregate totals for flagged competitors.

- **Performance Benefits**:
  - **Bandwidth reduction**: Only fetch new challenge solves (after 100+ solves, only 1-2 new records vs full dataset)
  - **Selective refresh**: Only refresh totals for ~0-50% of competitors with new activity
  - **Serverless-optimized**: Both jobs complete in seconds, respecting platform constraints
  - **Scalability**: Performance improves as population grows (smaller % active each sync)
  - **Accuracy**: Totals always come from MetaCTF source of truth, not calculations

- **Crash Resistance**:
  - Refresh flags persisted in database, not memory
  - Failed syncs don't advance timestamps, will retry from same point
  - Sweep job recovers unflushed flags from previous crashes
  - Can manually set `needs_totals_refresh = true` from other app areas

- **Result**: Efficient, resilient sync architecture that scales with growing competitor population while maintaining data accuracy

## 20. Production Scaling: Batched Sync Architecture

> **Note**: Flash CTF sentinel optimization (Section 22) has been implemented and reduces Flash CTF API calls by 95%. This batching plan focuses on ODL sync distribution.

### 20.1 Problem Statement

The current sync implementation queries the game platform API for **all competitors** on every sync run, even when only a small subset has new activity. While the global timestamp optimization reduces data transfer (only fetching new challenges), we still make N API calls for N competitors.

**Performance concerns at scale:**
- **Current**: 300 competitors = 300 ODL API calls every 30 minutes = 14,400 calls/day
- **Flash CTF**: Optimized via sentinel user (Section 22) = 48 calls/day
- **Rate limits**: MetaCTF may impose limits (TBD - need vendor confirmation)
- **Serverless constraints**: Next.js/Vercel has execution time limits per request
- **Database load**: Processing all competitors creates unnecessary DB queries

### 20.2 Proposed Solution: Rotating Batch Sync

Instead of syncing all competitors simultaneously, **rotate through the population in batches**, ensuring everyone gets synced within a reasonable window (e.g., 2-4 hours).

**Architecture:**
- Divide competitors into batches (50-100 per batch)
- Each sync run processes one batch
- Track batch cursor in `game_platform_sync_runs` table
- When all batches complete, reset cursor and repeat

**Example with 400 competitors:**
- Batch size: 50 competitors
- Total batches: 8
- Sync frequency: 30 minutes
- Full cycle time: 4 hours (8 batches × 30 min)
- Each competitor syncs every 4 hours

### 20.3 Implementation Plan

#### Phase 1: Batch Infrastructure (Week 1)
**Goal**: Add batching capability without changing current behavior

**Tasks:**
1. Add batch tracking to `game_platform_sync_runs` table:
   ```sql
   ALTER TABLE game_platform_sync_runs ADD COLUMN batch_number INTEGER DEFAULT 0;
   ALTER TABLE game_platform_sync_runs ADD COLUMN batch_size INTEGER DEFAULT 100;
   ALTER TABLE game_platform_sync_runs ADD COLUMN total_batches INTEGER DEFAULT 1;
   ```

2. Add helper function to calculate batches:
   ```typescript
   // lib/integrations/game-platform/batching.ts
   export function calculateBatchBounds(
     totalCompetitors: number,
     batchSize: number,
     currentBatch: number
   ): { offset: number; limit: number };
   ```

3. Update `syncAllCompetitorGameStats` to accept batch parameters:
   ```typescript
   // Optional batch params - if not provided, syncs all (backward compatible)
   export interface SyncAllCompetitorStatsParams {
     // ... existing params
     batchNumber?: number;
     batchSize?: number;
   }
   ```

4. **Testing**: Run with `batchSize=10` to verify batching logic without production impact

**Deployment**: Deploy infrastructure changes, run in "single batch mode" (batch 0, size = all competitors)

**Success Criteria**: ✅ All tests pass, sync behavior unchanged, batch tracking fields populated

---

#### Phase 2: Batch Rotation Logic (Week 2)
**Goal**: Implement batch cursor rotation

**Tasks:**
1. Add batch cursor retrieval logic:
   ```typescript
   async function getNextBatch(supabase): Promise<{ batchNumber: number; batchSize: number }> {
     // Get last sync run
     // If last batch was N, return N+1
     // If N+1 exceeds total batches, return 0 (restart cycle)
   }
   ```

2. Update sync job handler to use batch cursor:
   ```typescript
   // lib/jobs/handlers/gamePlatformSync.ts
   export const handleGamePlatformIncrementalSync: JobHandler<'game_platform_incremental_sync'> = async (job, ctx) => {
     const batchInfo = await getNextBatch(ctx.supabase);

     await syncAllCompetitorGameStats({
       ...ctx,
       batchNumber: batchInfo.batchNumber,
       batchSize: batchInfo.batchSize,
     });
   };
   ```

3. Add configuration:
   ```bash
   # .env
   GAME_PLATFORM_SYNC_BATCH_SIZE=50  # Competitors per batch
   ```

4. **Testing**:
   - Manual test with `BATCH_SIZE=5` and 22 test competitors
   - Verify 5 batches complete full rotation
   - Confirm each competitor synced exactly once per cycle

**Deployment**:
- Start with conservative batch size (100)
- Monitor for 48 hours
- Verify all competitors sync within expected window

**Success Criteria**:
- ✅ Each batch processes correct subset
- ✅ Cursor rotates through all competitors
- ✅ No competitors skipped or double-synced

---

#### Phase 3: Smart Prioritization (Week 3)
**Goal**: Sync active users more frequently than inactive ones

**Tasks:**
1. Add activity scoring:
   ```sql
   -- Migration: Add activity score to competitors
   ALTER TABLE competitors ADD COLUMN game_platform_activity_score INTEGER DEFAULT 0;

   -- Calculated from:
   -- - Days since last activity (from game_platform_sync_state.last_remote_accessed_at)
   -- - Total challenges in last 30 days
   -- - Flash CTF participation
   ```

2. Implement tiered sync frequencies:
   ```typescript
   enum SyncTier {
     HIGH = 'high',      // Active users: every 30 min (batches 0-2)
     MEDIUM = 'medium',  // Moderate: every 2 hours (batches 3-6)
     LOW = 'low'         // Inactive: every 8 hours (batches 7-10)
   }
   ```

3. Update batch selection to honor tiers:
   ```typescript
   function selectBatchCompetitors(
     allCompetitors: Competitor[],
     batchNumber: number,
     batchSize: number
   ): Competitor[] {
     // Sort by tier first, then round-robin within tier
     // Ensures high-priority users sync more frequently
   }
   ```

4. **Testing**:
   - Create test dataset with 10 active, 30 moderate, 60 inactive users
   - Verify active users sync 16x more frequently than inactive

**Deployment**:
- Enable prioritization for subset of users (A/B test)
- Monitor sync freshness by tier
- Roll out to 100% if metrics improve

**Success Criteria**:
- ✅ Active users average <1 hour sync lag
- ✅ Inactive users sync within 8-hour SLA
- ✅ Overall API call volume reduced 30-40%

---

#### Phase 4: Monitoring & Tuning (Week 4)
**Goal**: Add observability and self-tuning

**Tasks:**
1. Add sync run telemetry:
   ```typescript
   interface SyncRunMetrics {
     batchNumber: number;
     competitorsProcessed: number;
     competitorsWithNewData: number;
     apiCallCount: number;
     duration: number;
     errors: number;
   }
   ```

2. Create admin dashboard panel:
   - Batch completion timeline (bar chart showing batches 0-N over time)
   - Sync lag histogram (how fresh is each competitor's data?)
   - API usage graph (calls per hour, identify spikes)
   - Error rate by batch

3. Add auto-tuning recommendations:
   ```typescript
   // If >80% of batches return empty results, increase batch size
   // If API errors spike, decrease batch size
   // If sync lag exceeds SLA, add more batches per cycle
   ```

4. **Testing**: Run for 1 week, collect metrics, validate accuracy

**Deployment**: Dashboard available to admins, auto-tuning disabled initially

**Success Criteria**:
- ✅ Dashboard shows real-time sync health
- ✅ Alerts fire when sync lag exceeds thresholds
- ✅ Tuning recommendations match manual analysis

---

### 20.4 Rollback Plan

Each phase is backward-compatible and can be disabled via feature flag:

```bash
# .env
GAME_PLATFORM_BATCH_SYNC_ENABLED=false  # Reverts to sync-all behavior
GAME_PLATFORM_PRIORITIZATION_ENABLED=false  # Disables tiered sync
```

**Emergency rollback**: Set both flags to `false`, redeploy

### 20.5 Success Metrics

Track these KPIs before/after each phase:

| Metric | Baseline (Current) | Target (Phase 3) |
|--------|-------------------|------------------|
| API calls per sync | 300-400 | 50-100 |
| Sync duration | 30-60 sec | 5-10 sec |
| Average data freshness | <30 min | <2 hours |
| Active user freshness | <30 min | <30 min (maintained) |
| API error rate | <1% | <0.5% |

### 20.6 Open Questions for Product/Engineering

1. **Sync SLA**: What's acceptable staleness for inactive users? (Proposed: 8 hours)
2. **Batch size**: Start conservative (100) or aggressive (50)? Depends on API rate limits
3. **Activity scoring**: Use simple "days since last activity" or complex ML model?
4. **MetaCTF rate limits**: Need vendor confirmation on API quotas
5. **Manual refresh**: Should coaches be able to force immediate sync for specific competitors?

### 20.7 Dependencies & Prerequisites

- ✅ Global sync timestamp (completed)
- ✅ Sync run tracking table (completed)
- ✅ Selective totals refresh (completed)
- ⏳ Vendor confirmation on rate limits (pending)
- ⏳ Load testing against mock server (pending)

### 20.8 Timeline Estimate

- **Phase 1**: 3-5 days (infrastructure)
- **Phase 2**: 3-5 days (rotation logic)
- **Phase 3**: 5-7 days (prioritization)
- **Phase 4**: 3-5 days (monitoring)
- **Total**: 3-4 weeks for full implementation

**Recommended approach**: Deploy Phase 1-2 before user launch, defer Phase 3-4 based on actual usage patterns

---

## 21. Bug Fix: Incremental Sync Reporting (2025-10-03)

### 21.1 Problem

Incremental sync was incorrectly reporting all competitors as "synced" even when they had no new activity:
```
{ total: 22, synced: 22, skipped: 0 }  // ❌ Wrong - only 1 had new data
```

Expected behavior after adding 1 new challenge:
```
{ total: 22, synced: 1, skipped: 21 }  // ✅ Correct
```

### 21.2 Root Cause

The mock server was **not filtering** `challenge_solves` by the `after_time_unix` query parameter. The API returned all historical challenges regardless of the timestamp filter, causing the sync service to incorrectly detect "new data" for every competitor.

### 21.3 Fix Applied

**Mock Server Updates** ([metactf-mock-server.ts](../../scripts/metactf-mock-server.ts), [storage/postgres.ts](../../scripts/metactf-mock/storage/postgres.ts), [storage/memory.ts](../../scripts/metactf-mock/storage/memory.ts)):

1. Updated `MetactfMockStorage.getOdlScores()` signature to accept optional `afterTimeUnix` parameter
2. Added filtering logic in both Postgres and memory storage backends:
   ```typescript
   if (afterTimeUnix && scores.challenge_solves) {
     scores.challenge_solves = scores.challenge_solves.filter(
       (solve) => solve.timestamp_unix > afterTimeUnix
     );
   }
   ```
3. Updated endpoint to extract and pass `after_time_unix` from query params:
   ```typescript
   const { syned_user_id, after_time_unix } = queryOdlScoresSchema.parse(request.query);
   const response = await storage.getOdlScores(syned_user_id, after_time_unix);
   ```

**Sync Service Updates** ([lib/integrations/game-platform/service.ts](../../lib/integrations/game-platform/service.ts)):

Modified new data detection to only check ODL solves (which are now properly filtered by the API):
```typescript
// Return 'synced' only if we actually found new data
// Note: We only check ODL solves here because the API filters by after_time_unix.
// Flash CTF data is not filtered by the API, so we sync it opportunistically.
const hasNewData = hasNewOdlSolves;

return {
  competitorId,
  status: hasNewData ? 'synced' : 'skipped_no_new_data',
};
```

### 21.4 Testing

After applying fix:

1. Restart mock server to apply filtering changes
2. Run incremental sync without new activity → should report `synced: 0, skipped: 22`
3. Add 1 challenge for 1 competitor
4. Run incremental sync → should report `synced: 1, skipped: 21`
5. Verify totals refresh only processes the 1 competitor with `needs_totals_refresh = true`

### 21.5 Impact on Production

**MetaCTF API Behavior**: The production MetaCTF API **does** filter by `after_time_unix` (confirmed by vendor). This fix ensures our mock server matches production behavior during testing.

**Performance Impact**: With proper filtering:
- **Before**: 22 competitors × 48 syncs/day = 1,056 "false positive" syncs
- **After**: Only competitors with actual new activity trigger totals refresh
- **Savings**: ~99% reduction in unnecessary totals calculations during low-activity periods

---

## 22. Flash CTF Sentinel Optimization (2025-10-03)

### 22.1 Problem

Flash CTF events are **monthly** and **global** (if one user can participate, all users can). However, the Flash CTF API endpoint doesn't support `after_time_unix` filtering, so it always returns all historical events for a user.

**Before optimization**: Every sync made Flash CTF API calls for all competitors:
- 22 competitors × 48 syncs/day = **1,056 Flash CTF API calls/day**
- 99% of these calls returned the same historical data (no new events)

### 22.2 Solution: Sentinel User Detection

Since Flash CTF events are global, we only need to check **one user** to detect new events:

1. **Sentinel Check** (before competitor loop):
   - Pick first competitor as "sentinel user"
   - Fetch their Flash CTF events
   - Compare event IDs against known events in database
   - If new event detected → sync Flash CTF for ALL users
   - Otherwise → skip Flash CTF API calls entirely

2. **Conditional Flash CTF Sync**:
   - Pass `skipFlashCtfSync` flag to `syncCompetitorGameStats()`
   - Only fetch Flash CTF data if flag is `false`
   - Maintains backward compatibility for standalone syncs

### 22.3 Implementation

**Sentinel Detection** ([lib/integrations/game-platform/service.ts](../../lib/integrations/game-platform/service.ts#L1231-L1274)):

```typescript
// Sentinel user detection for Flash CTF events
let hasNewFlashCtfEvent = false;

if (competitors && competitors.length > 0) {
  const sentinelUser = competitors[0];

  const sentinelFlash = await resolvedClient.getFlashCtfProgress({
    syned_user_id: sentinelUser.game_platform_id!,
  });

  const sentinelEventIds = (sentinelFlash?.flash_ctfs || [])
    .map((e: any) => e.event_id)
    .filter(Boolean);

  if (sentinelEventIds.length > 0) {
    const { data: knownEvents } = await statsClient
      .from('game_platform_flash_ctf_events')
      .select('event_id')
      .in('event_id', sentinelEventIds);

    const knownEventIds = new Set((knownEvents || []).map((e: any) => e.event_id));
    const newEventIds = sentinelEventIds.filter((id: string) => !knownEventIds.has(id));

    if (newEventIds.length > 0) {
      hasNewFlashCtfEvent = true;
      logger?.info?.(`✨ New Flash CTF event(s) detected: ${newEventIds.join(', ')}`);
    }
  }
}

// Pass flag to each competitor sync
skipFlashCtfSync: !hasNewFlashCtfEvent
```

**Conditional API Call** ([lib/integrations/game-platform/service.ts](../../lib/integrations/game-platform/service.ts#L805-L816)):

```typescript
let flash: any = null;

// Only fetch Flash CTF data if sentinel detected new events
if (!skipFlashCtfSync) {
  try {
    flash = await resolvedClient.getFlashCtfProgress({ syned_user_id: synedUserId });
  } catch (err: any) {
    // Handle errors...
  }
}
```

### 22.4 Performance Impact

**API Call Reduction**:
- **Before**: 22 Flash CTF calls per sync
- **After**: 1 sentinel call + 0-22 calls (only if new event)
- **Typical case** (no new events): 1 call instead of 22 = **95% reduction**
- **New event case**: 1 + 22 = 23 calls (acceptable once/month)

**Example: 300 Competitors, 48 Syncs/Day**:
- **Before**: 300 × 48 = 14,400 Flash CTF API calls/day
- **After (no new events)**: 48 sentinel calls/day = **99.7% reduction**
- **After (new event detected)**: 48 + (300 × 1) = 348 calls = **97.6% reduction** (only happens once/month)

### 22.5 Integration with Batching Plan

This optimization is **complementary** to the batching architecture (Section 20):

**Phase 0** (Pre-batching):
- ✅ Sentinel Flash CTF detection (implemented)
- ✅ Incremental ODL sync with `after_time_unix` (implemented)

**Phase 1-4** (Batching):
- Sentinel check remains at batch level (1 call per batch rotation)
- When new Flash CTF detected → all batches include Flash CTF sync for that rotation cycle
- Flash CTF sync flag persists for ~1 day to ensure all competitors processed

**Combined Savings** (300 competitors, batches of 50):
- **Daily syncs**: 48 batch rotations
- **ODL calls**: 300 incremental syncs (filtered by `after_time_unix`)
- **Flash CTF calls**: 48 sentinel checks + 0-300 full syncs (only when new event)
- **Total API calls/day**: ~350 (vs 14,400 without optimizations) = **97.6% reduction**
