# Admin Editing Refactor — Coach Context (Specification)

Purpose and Rationale
- Problem: Admins need to edit coach-owned assets (Competitors, Teams, Releases) without changing ownership or weakening authorization. Cross-cutting edits are currently cumbersome and risky.
- Approach: Introduce an Admin Coach Context that lets an admin select a specific coach to act on. When a coach is selected, reads are scoped and writes are permitted for that coach’s assets. When viewing “All coaches”, reads show everything but edit actions are disabled.
- Why: Maintains data ownership semantics, reduces accidental cross-coach edits, and keeps server-side authorization simple and auditable.

Scope (Admin Context Only)
- In scope: Competitors, Teams, Releases (UI and related API routes).
- Read behavior: “All coaches” shows all; selecting a coach filters to that coach.
- Write behavior: Requires a selected coach; otherwise disabled in UI and rejected by API (403).
- Out of scope: Messaging and other areas (can be revisited later).

UX Overview
- Admin Coach Context Switcher
  - Location: `app/dashboard/layout.tsx` header, visible only for admins.
  - Control: Searchable combobox of coaches (source: `/api/users/coaches`), plus an “All coaches” option.
  - Display: Pill “Acting as: <Coach Name>” with a Clear button when a coach is selected.
- Read vs. Edit affordances
  - All coaches: All edit actions are disabled; show tooltip “Select a coach to edit”.
  - Coach selected: Edit actions are enabled and scoped to that coach’s assets.
- Persistence
  - Store context in a secure, HTTPOnly cookie (e.g., `admin_coach_id`).
  - Client reads context via `GET /api/admin/context` endpoint (not by reading cookie).
  - Clear on logout or via the Clear button.

Security Model
- Authentication: Always derive the current user via `supabase.auth.getUser()` on the server.
- Authorization: Verify admin role (e.g., `profiles.role === 'admin'`) before applying or honoring admin context.
- Context validation: On every request, if `admin_coach_id` cookie exists, verify the coach exists. Ignore cookie if caller is not admin.
- Writes: Require `admin_coach_id`. Validate target rows’ `coach_id` matches `admin_coach_id` before modifying. Reject (403) otherwise.
- RLS: No change to RLS policies; server checks add belt-and-suspenders protection.

State and Persistence Details
- Cookie: `admin_coach_id`
  - Type: string UUID
  - Scope: Path `/`; SameSite `Lax`; HTTPOnly; Secure in production
  - Lifetime: Session (no explicit expiry)
- Server API: `/api/admin/context`
  - GET → `{ coach_id: string | null, coach_name?: string }`
  - POST → `{ coach_id: string | null }` to set/clear context after validating admin and coach existence; sets cookie.

API Changes (Server)
- Add: `app/api/admin/context/route.ts` (GET/POST)
- Update reads (admin, when context set):
  - `app/api/competitors/route.ts` → if admin and `admin_coach_id` set, filter by `coach_id`.
  - `app/api/teams/route.ts` → same.
  - Releases: add a new aggregator endpoint (e.g., `app/api/admin/releases/route.ts`) that returns competitors + agreements joined or separately, filtered by `coach_id` if context set.
- Update writes (admin): REQUIRE context and enforce ownership
  - Competitors: `create`, `update`, `toggle-active`, `regenerate-link`.
  - Teams: `create`, `[id]/update`, `[id]/members/add`, `[id]/members/[competitor_id]` (remove).
  - Releases: sending/printing/upload endpoints (e.g., `/api/zoho/send`, any upload handler used by releases).
  - On failure: `403 { error: 'Select a coach context to edit' }` or `403 { error: 'Target not owned by selected coach' }`.

UI Changes
- Add `components/admin/AdminContextSwitcher.tsx`
  - Props: none; fetches current context; loads coach options via `/api/users/coaches?query=...` (debounced).
  - POST to `/api/admin/context` on select/clear and emits an event (e.g., `window.dispatchEvent(new Event('admin-context-changed'))`).
- Integrate switcher into `app/dashboard/layout.tsx`
  - Show only when admin.
  - Render “Acting as: <Coach>” pill when context active.
- Disable edit actions with tooltip on relevant pages when “All coaches”
  - `app/dashboard/page.tsx`: Edit/Toggle/Assign/Register controls
  - `app/dashboard/competitors/page.tsx`: Any edit/create controls present
  - `app/dashboard/releases/page.tsx`: Send/Print/Upload controls
  - Tooltip content: “Select a coach to edit”
- Filtering (admin reads)
  - When context is set, UI filters visible data to that coach (via server-filtered endpoints where applicable).

Audit Logging
- Extend existing activity logs on admin write paths with:
  - `admin_id`: UUID of admin performing the action
  - `acting_coach_id`: UUID from admin context
  - `action`, `entity_type`, and minimal metadata

Phased Implementation and Testing (Checklist)

Phase 0 — Readiness and Feature Flag
- [x] Add a lightweight feature flag `adminCoachContext` (env or constants) to gate UI and API.
- [x] Document test accounts (1 admin, 2 coaches, sample data).
- Acceptance
  - [x] Feature flag toggles the presence of the new UI/API (no behavior change when off).

Phase 1 — Admin Context API + UI Switcher (Read-only Controls)
- [x] Implement `/api/admin/context` (GET/POST) with cookie persistence and admin checks.
- [x] Add `AdminContextSwitcher` and integrate into `app/dashboard/layout.tsx` (admin-only).
- [x] Disable edit actions with tooltip when “All coaches” selected.
- [x] Do not modify server write routes yet (UI reads can remain as-is for now).
- Acceptance
  - [x] Admin can select/clear a coach; pill updates and persists across reloads.
  - [x] All-coaches mode shows disabled action buttons with tooltip.
  - [x] Non-admin users do not see the switcher and experience no behavior change.
  - [x] Canary: Navigate competitors/teams/releases; verify no unexpected 401/403.

Phase 2 — Server Write Enforcement
- [x] Verify admin role and `admin_coach_id` presence for admin-initiated writes in competitor, team, and release endpoints.
- [x] Ensure target resource `coach_id` equals `admin_coach_id` for all writes.
- [x] Return 403 on missing/invalid context or mismatched ownership.
- [x] Add audit log entries with `acting_coach_id` on successful writes.
- Acceptance
  - [x] All-coaches mode: direct API write attempts return 403.
  - [x] Acting as Coach A: can edit Coach A’s assets; cannot edit Coach B’s (403).
  - [x] Audit logs record admin id and acting coach id on success.

Phase 3 — Read Coherence (Server-Filtered Data for Admin)
- [x] Honor `admin_coach_id` in `GET /api/competitors` and `GET /api/teams` for admin reads.
- [x] Add `GET /api/admin/releases` (or similar) to provide releases data filtered by context.
- [x] Update releases page to consume the new endpoint(s).
- Acceptance
  - [x] Acting as Coach A: lists show only Coach A’s data across competitors/teams/releases.
  - [x] All-coaches mode shows all data but keeps edit disabled in UI.
  - [x] No change for non-admins.

Phase 4 — Polish and QA
- [x] Add banner text near page titles when context is set: “Acting as <Coach>”.
- [x] Ensure context clears on logout and is ignored if user role isn’t admin.
- [x] Add subtle loading state while context changes to avoid flicker.
- [x] Performance pass: verify filtering and data loads are fast; debounce coach search.
- Acceptance
  - [x] Smooth UX switching between contexts; no stale data.
  - [x] No security warnings; no unintended write access without context.

Canary Testing Checklists
- Context Switching
  -[x] Set context to Coach A; reload; pill persists; clearing reverts to All-coaches.
  -[x] Tooltip appears on disabled actions in All-coaches mode.
- Writes (Phase 2+)
  -[] All-coaches: API write returns 403; UI buttons disabled.
  -[] Acting as Coach A: Create/update competitor; add/remove team member; send release — succeed.
  -[] Attempt to target Coach B resources while acting as Coach A → 403.
- Reads (Phase 3+)
  -[] Acting as Coach A: lists show only Coach A’s records.
  - All-coaches: lists show all records; edits still disabled.
- Non-admin Regression
  -[] Coaches unaffected; no context UI; normal reads/writes still work.

Implementation Notes
- Coach directory endpoint: reuse `/api/users/coaches` with optional `?query=` filter; return `{ id, name }` minimal payload.
- Cookie operations: use Next.js `cookies()` and `NextResponse` helpers to set/clear; include `SameSite=Lax`, `HTTPOnly`, `Secure` where appropriate.
- Error messages: consistent and user-safe, e.g., “Select a coach to edit” or “You can only edit assets owned by the selected coach”.
- Telemetry: log context set/cleared events with admin id for auditability (no PII beyond ids/time).

Risks and Mitigations
- Risk: UI and API temporarily out of sync mid-phase → Mitigate with Phase 1 disabling controls before server enforcement, and feature flag to gate exposure.
- Risk: Complex releases data fetch → Mitigate by adding a dedicated admin releases API to centralize filtering.
- Risk: Cookie spoofing attempts → Mitigate with server-side admin validation and coach existence checks on every request.

Out of Scope (for now)
- Messaging; global application of context outside Competitors, Teams, Releases.
- Bulk admin operations across multiple coaches in a single action.

Rollout and Revert
- Rollout: Enable flag in staging; run canary tests; then enable in production.
- Revert: Disable feature flag to hide UI and ignore cookie; server enforcement blocks only when flag is on.

Ownership and Dependencies
- Owner: Admin experience
- Dependencies: Supabase auth and profiles role; existing API routes for competitors/teams; new releases API.

Glossary
- Admin Coach Context: The selected coach for whom the admin is “acting as”, governing what the admin can edit.
- All-coaches: Admin view without a selected coach; read-only mode.
