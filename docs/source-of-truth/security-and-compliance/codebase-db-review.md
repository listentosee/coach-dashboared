# Codebase & DB Review (High-Level)

Scope: Static review of the application codebase plus `data/db_schema.sql`. No runtime tests executed. This is not exhaustive.

## Findings (ordered by severity)

1) High — Dry-run flag is ignored when the integration is enabled.
- `lib/integrations/game-platform/service.ts:187-200` always returns `!FEATURE_ENABLED`, so `dryRun: true` is ignored if the feature flag is on. This can cause unintended real API calls during tests or admin dry runs.

2) Medium — Email uniqueness checks can miss conflicts across coaches/profiles.
- `lib/validation/email-uniqueness.ts:62-101` queries `profiles` and `competitors` using the caller’s session; RLS can hide rows, so duplicates outside the caller’s scope may pass.
- `app/api/competitors/bulk-import/route.ts:146-151` calls `assertEmailsUnique` without a service-role client or explicit admin scope.

3) Medium — Competitor status is not constrained at the DB level.
- `data/db_schema.sql:2199-2235` defines `competitors.status` as text with a default but no CHECK/ENUM constraint. Invalid or unexpected statuses can be stored and then break UI logic or automation.

4) Low — Direct client-side Supabase access conflicts with the stated “service_role_key only” direction.
- Example: `app/dashboard/page.tsx:121-138` reads `profiles` directly from the browser client.
- This is normal for RLS-based apps, but it doesn’t align with the requirement that all DB access be authenticated and use the service role key.

5) Low — Admin job creation does not validate `task_type`.
- `app/api/admin/jobs/create/route.ts:27-64` accepts any `task_type` string and payload. Typos or unsupported tasks will enter the queue and fail at runtime.

## Open Questions / Assumptions
- Should email uniqueness be global across all coaches and all profiles? If yes, we should enforce with a service-role check and/or DB-level unique constraints.
- Do you want DB-enforced status constraints (ENUM or CHECK) now that `in_the_game_not_compliant` is live?
- Clarify the target architecture for “service_role_key only” access: server-only DB access with RLS bypass, or hybrid (server + RLS) with public client reads.

## Testing Gaps / Residual Risk
- No automated regression coverage found for email uniqueness across coach boundaries.
- Dry-run behavior is not safe when the feature flag is on; tests can accidentally hit external APIs.
