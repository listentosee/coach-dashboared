# Codebase & DB Review (High-Level)

Scope: Static review of the application codebase plus the schema dump (`data/db_schema_20260208.sql`). No runtime tests executed. This is not exhaustive.

## Findings (ordered by severity)

> **Status (2026-05-03):** All five findings re-verified against commit `c075303a` and still hold. Line numbers updated where the code has shifted; substance unchanged.

1) High — Dry-run flag is ignored when the integration is enabled.
- `lib/integrations/game-platform/service.ts:267-270` (`isDryRunOverride`) always returns `!FEATURE_ENABLED`, so `dryRun: true` is ignored if `GAME_PLATFORM_INTEGRATION_ENABLED=true`. The function takes a `dryRun` parameter but never reads it. This can cause unintended real API calls during tests or admin dry runs.

2) Medium — Email uniqueness checks can miss conflicts across coaches/profiles.
- `lib/validation/email-uniqueness.ts` (`findEmailConflicts`) queries `profiles` and `competitors` using the caller's session; RLS can hide rows, so duplicates outside the caller's scope may pass. `coachScopeId` further narrows the competitor query, which makes cross-coach collisions even less visible.
- `app/api/competitors/bulk-import/route.ts` calls `assertEmailsUnique` without a service-role client or explicit admin scope.

3) Medium — Competitor status is not constrained at the DB level.
- `data/db_schema_20260208.sql` (`competitors` table, line ~2670) defines `competitors.status` as `text` with default `'pending'` but no CHECK/ENUM constraint. Invalid or unexpected statuses can be stored and then break UI logic or automation. Note: `competitor_division` and `metactf_sync_status` are typed enums; `status` was not migrated.

4) Low — Direct client-side Supabase access conflicts with the stated "service_role_key only" direction.
- Example: `app/dashboard/page.tsx` (in `fetchData`) reads `profiles` directly from the browser client.
- This is normal for RLS-based apps, but it doesn't align with the requirement that all DB access be authenticated and use the service role key.

5) Low — Admin job creation does not validate `task_type`.
- `app/api/admin/jobs/create/route.ts:25-28` accepts any `task_type` string and payload (only checks presence). Typos or unsupported tasks will enter the queue and fail at runtime.

## Open Questions / Assumptions
- Should email uniqueness be global across all coaches and all profiles? If yes, we should enforce with a service-role check and/or DB-level unique constraints.
- Do you want DB-enforced status constraints (ENUM or CHECK) now that `in_the_game_not_compliant` is live?
- Clarify the target architecture for “service_role_key only” access: server-only DB access with RLS bypass, or hybrid (server + RLS) with public client reads.

## Testing Gaps / Residual Risk
- No automated regression coverage found for email uniqueness across coach boundaries.
- Dry-run behavior is not safe when the feature flag is on; tests can accidentally hit external APIs.

---

**Last verified:** 2026-05-03 against commit `c075303a`.
**Notes:** All five findings still apply. Refreshed schema-file reference (now `data/db_schema_20260208.sql`) and updated stale line numbers (`isDryRunOverride` now at L267; competitors table at L2644+). Substance of every finding unchanged.
