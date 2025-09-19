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
| Domain                | Game Platform Endpoint                                       | Notes |
|----------------------|---------------------------------------------------------------|-------|
| Create competitor    | `POST /users` (body: `UserCreate`)                            | Requires role, email, optional `syned_user_id` for idempotency. |
| Reset password       | `POST /auth/send_password_reset_email`                        | Trigger via coach actions (optional). |
| Create team          | `POST /teams` (body: `TeamCreate`)                            | Needs `syned_coach_user_id` and team metadata. |
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
  - `competitor_id UUID` FK, `score_json JSONB`, `fetched_at TIMESTAMP`, optional derived metrics.
- Migration scripts should backfill existing `game_platform_id` where known; add indexes on the new ID columns.

## 7. Backend Integration Plan
1. **Client Wrapper (`lib/game-platform/client.ts`)**
   - Generic `request<T>(config)` handling retries (exponential backoff up to 3 attempts for 5xx/timeouts).
   - Methods: `createUser`, `sendPasswordReset`, `createTeam`, `assignMember`, `getTeamAssignments`, `getOdlScores`.
   - Accept AbortSignal for cancellation and support structured logging.
2. **Service Layer (`lib/game-platform/service.ts`)**
   - `onboardCompetitor(competitorId)` orchestrates user creation, Supabase update, status recompute.
   - `syncTeam(teamId)` ensures remote team exists, creates/updates metadata, syncs roster.
   - `syncScores(teamId | null)` fetches ODL scores, stores snapshots.
3. **Route Handlers (`app/api/game-platform/...`)**
   - `POST /competitors/{id}`: guard on `status === 'compliance'`, invoke service, return updated competitor DTO.
   - `POST /teams/{id}/sync`: triggered from UI or background to push latest roster.
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
- **Roster Reconciliation**: Nightly job fetches `get_team_assignments` per team, compares to Supabase memberships, flags discrepancies (store in alert table).
- **Score Polling**: Hourly Vercel Cron job hits `/api/game-platform/sync/scores?secret=***` (secret stored as `GAME_PLATFORM_CRON_SECRET`; reference in `vercel.json` as `@GAME_PLATFORM_CRON_SECRET`) to hydrate `game_platform_stats`; this same endpoint can be triggered on-demand with `dryRun=true` via POST.
- **Retry Queue**: For failed sync operations, enqueue retries (simple table with exponential backoff metadata processed by cron).

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
- [~] Schedule initial background jobs for synchronization (scores, roster reconciliation) with observability hooks. *(Hourly scores cron configured; roster reconciliation still pending.)*
- [x] Finalize response schemas based on live payload captures and update validators.
- [ ] Complete integration/QA runbook and document rollback steps.
- [x] Scaffold Game Platform dashboard UI shell.
- [x] Apply final visual/styling tweaks and bind live data to dashboard components.

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
