# Feature: Assistant Coach Delegation — Historical Design (Not Built)

> **Status (2026-05-03): HISTORICAL / NOT BUILT.** This document captures a parked design for letting head coaches delegate FERPA-scoped data access to assistant coaches via a `coach_delegation` table, an `is_delegated_coach()` SQL function, RLS policy fan-out, a `delegation_coach_id` cookie, and matching UI. **None of these primitives exist in the codebase as of commit `e5b937b9`** — `git grep` for `coach_delegation`, `is_delegated_coach`, `delegation_coach_id`, or `assistant_coach_id` returns this file only.
>
> The closest existing primitive is the **admin "acting as a coach"** context switch (`useAdminCoachContext` in `lib/admin/useAdminCoachContext.ts`, `admin_coach_id` cookie set by `app/api/admin/context/route.ts`), which is admin-only and was the template this design proposed cloning. That admin acting-as feature is unrelated to assistant-coach delegation.
>
> The `Assist Coach` page at `app/dashboard/admin-tools/assist-coach/page.tsx` is also unrelated — it is the admin temp-password helper backed by `components/dashboard/coach-assist-tool.tsx`, not a delegation surface.
>
> Moved out of `docs/source-of-truth/features/` because that bucket is reserved for current-state documentation. This file is preserved as a forward-looking design reference if delegation is ever revived. Do **not** treat any code/SQL examples below as descriptions of current behavior.

---

**Status**: Parked (1/35 coaches requesting)
**Date**: 2026-02-26
**Complexity**: High — touches RLS policies, 22+ API routes, auth middleware

## Problem

Some coaching programs have assistant coaches who need access to the same competitor and team data as the head coach. Currently, coaches operate in complete isolation (`coach_id = auth.uid()` enforced via RLS).

## Recommended Approach: `coach_delegation` Table + Reuse "Acting As" Pattern

An assistant coach is a regular `coach` with a delegation row granting access. No new role enum needed. The UX mirrors the existing admin `admin_coach_id` context switcher.

### What Can Be Reused From Admin "Acting As"

The admin "acting as" mechanism (`app/api/admin/context/route.ts`, `lib/admin/useAdminCoachContext.ts`) provides the template:
- Cookie-based context (`delegation_coach_id` cookie, same pattern as `admin_coach_id`)
- Context API route (clone admin context route)
- Client hook (clone `useAdminCoachContext`)
- Route handler pattern: the ~22 route files checking `admin_coach_id` get a delegation fallback

### What's New (unavoidable for FERPA)

- `coach_delegation` table with status tracking and audit trail
- `is_delegated_coach()` SECURITY DEFINER SQL function
- RLS policy updates on ALL coach-scoped tables (competitors, teams, team_members, agreements, game_platform_*)
- Delegation management UI (invite, accept, revoke)
- Admin-configurable assistant limit

## Database Schema

### `coach_delegation` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `head_coach_id` | uuid FK → profiles | Coach granting access |
| `assistant_coach_id` | uuid FK → profiles | Coach receiving access |
| `permissions` | jsonb | `{"read": true, "write": true}` default |
| `status` | text | `pending` / `active` / `revoked` |
| `invited_at` | timestamptz | |
| `accepted_at` | timestamptz | |
| `revoked_at` | timestamptz | |
| `revoked_by` | uuid FK → profiles | |

Constraints: `no_self_delegation`, `unique_active_delegation(head_coach_id, assistant_coach_id)`

### `is_delegated_coach()` function

```sql
CREATE OR REPLACE FUNCTION public.is_delegated_coach(p_coach_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.coach_delegation
    WHERE head_coach_id = p_coach_id
      AND assistant_coach_id = auth.uid()
      AND status = 'active'
      AND revoked_at IS NULL
  );
END;
$$;
```

### RLS Policy Change Pattern

Every policy using `coach_id = auth.uid()` adds:
```sql
coach_id = auth.uid() OR public.is_delegated_coach(coach_id)
```

## Affected Route Handlers (~22 files)

All files currently using `admin_coach_id` cookie need a delegation fallback:

```
app/api/competitors/route.ts
app/api/competitors/create/route.ts
app/api/competitors/[id]/update/route.ts
app/api/competitors/[id]/toggle-active/route.ts
app/api/competitors/[id]/regenerate-link/route.ts
app/api/competitors/[id]/disclosure-log/route.ts
app/api/teams/route.ts
app/api/teams/create/route.ts
app/api/teams/[id]/route.ts
app/api/teams/[id]/update/route.ts
app/api/teams/[id]/upload-image/route.ts
app/api/teams/[id]/members/add/route.ts
app/api/teams/[id]/members/[competitor_id]/route.ts
app/api/game-platform/competitors/[id]/route.ts
app/api/game-platform/teams/[id]/sync/route.ts
app/api/game-platform/dashboard/route.ts
app/api/releases/paged/route.ts
app/api/admin/releases/route.ts
app/api/zoho/send/route.ts
app/api/zoho/cancel/route.ts
app/api/zoho/upload-manual/route.ts
```

The code change per route is small — add delegation cookie as fallback:
```ts
// Current:
const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
// New:
const actingCoachId = isAdmin
  ? (cookieStore.get('admin_coach_id')?.value || null)
  : (cookieStore.get('delegation_coach_id')?.value || null)
```

Ideally, extract a shared `getActingCoachId()` utility in `lib/utils/acting-coach.ts`.

## New API Routes Needed

- `GET/POST /api/delegations` — List and create delegations
- `PATCH/DELETE /api/delegations/[id]` — Accept, revoke, cancel
- `GET/POST /api/delegations/context` — Context switching (clone of admin context)

## UI Components Needed

1. **Delegation Manager** (Settings page) — invite from existing coaches, list active/pending, revoke
2. **Context Switcher** (Dashboard header) — "My Account" + list of head coaches, with visual banner
3. **Admin setting** — configurable max assistants per coach

## FERPA Compliance

- Delegation table IS the audit trail (invited_at, accepted_at, revoked_at, revoked_by)
- All actions by assistants logged to `activity_logs` with `acting_as_assistant: true` metadata
- Head coaches can view their assistants' activity logs (new RLS policy)
- Revocation immediately cuts off access (RLS checks `status='active'` in real-time)
- No PII in delegation logs

## Implementation Order (when prioritized)

1. Migration SQL (table, function, RLS updates)
2. API routes (delegations CRUD + context)
3. Extract `getActingCoachId()` utility
4. Update 22 route handlers
5. Client hooks (clone admin pattern)
6. UI: Delegation Manager + Context Switcher
7. Audit logger updates
8. Admin assistant limit setting
9. Testing + `vercel build` verification

## Risk Assessment

- **High blast radius**: Touches RLS policies on core tables (competitors, teams)
- **Testing critical**: Must verify RLS changes don't break existing coach isolation
- **Rollback plan**: Migration should be reversible (drop table, restore original policies)
- Recommend implementing on a preview branch with thorough RLS testing before production

---

**Last verified:** 2026-05-03 against commit `e5b937b9`.
**Notes:** Confirmed zero references to delegation primitives in code (no `coach_delegation` table, no `is_delegated_coach` function, no `delegation_coach_id` cookie). Moved out of SOT to historical archive following the precedent set by `docs/game-platform/historical-nice-full-design.md`.
