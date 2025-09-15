# Phase 3 Canary Test Plan

Scope: Replace client `getSession()` with `getUser()` on dashboard pages to remove warnings and keep behavior unchanged.

## Smoke

[pass] Sign in/out (admin and coach). Sign out returns to login.
[] Middleware gate: Visiting `/dashboard/*` while signed out redirects to `/auth/login`.
[pass] No Supabase warnings about using `getSession()` in console or server logs for these pages.

## Dashboard Page (`/dashboard`)

[pass] Loads without errors for coach; shows stats and tables.
[pass] Loads without errors for admin; shows stats and tables.
[pass] Coach profile name loads (fallbacks to email when absent).
[pass] Conversations/Teams/Competitors sections render as before.
[pass] Auth refresh: switching accounts triggers data reload (via `onAuthStateChange`).

Data validation
- [pass] Competitors count, active/pending/profile/compliance stats make sense relative to data.
- [pass] Teams count matches `/api/teams` response.

Interactions
- [pass] Toggle Show Inactive affects list immediately.
- [pass] Division filter buttons filter counts and list accordingly.
- [pass] Team member counts present for each team in dropdowns.

Regression checks (sanity)
- [pass] Edit competitor dialog still opens and saves.
- [pass] Regenerate profile link returns a URL and refreshes row.
- [pass] Toggle active/inactive still works.

## Competitors Page (`/dashboard/competitors`)

[pass] Loads without errors for coach; lists own competitors only.
[pass] Loads without errors for admin (behavior unchanged; ensure no auth errors).
[pass] Search by name/email filters results.
[pass] Status chips render and dates display.

## Messaging Surfaces (spot check)

[pass] Attach in composer still works after auth changes (image and doc).
[pass] DM/group creation and posting unaffected (no 401/500 regressions).

## Logs and Warnings

[pass] No `getSession` warnings emitted when loading the above pages.
[pass] No new auth errors introduced in server logs.

Notes
- These pages now call `supabase.auth.getUser()` for initial auth state and keep `onAuthStateChange` for refresh. Expect a small extra network call on first load (acceptable for stronger guarantees).
