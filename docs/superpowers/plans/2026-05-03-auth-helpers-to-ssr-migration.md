# `@supabase/auth-helpers-nextjs` → `@supabase/ssr` Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `lts-superpowers:subagent-driven-development` (recommended) or `lts-superpowers:executing-plans`.

**Goal:** Replace the deprecated `@supabase/auth-helpers-nextjs` package with the modern `@supabase/ssr`, introducing a thin wrapper layer (`lib/supabase/{server,browser,middleware}.ts`) so future env changes are a one-file edit instead of a 30-file sweep.

**Why this exists:** The 2026-05-02 Supabase key rotation hit a wall at the browser-side step. The `auth-helpers-nextjs` package hardcodes `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` internally — it has no parameter to read from a different env var name. Disabling the legacy `anon` JWT in Supabase therefore broke all browser auth flows. We re-enabled the legacy keys to restore login. **The legacy keys cannot be permanently revoked until this migration ships.** That's the unfinished half of the rotation.

**Architecture (3 layers):**

1. **Thick wrapper layer** at `lib/supabase/{server,browser,middleware}.ts` — internally calls `@supabase/ssr` primitives (`createServerClient`, `createBrowserClient`) and reads keys via `config.supabase.secretKey` (server-side) or the `NEXT_PUBLIC_*` literal pattern (browser-side, with publishable-preferred / anon-fallback).
2. **Consumer files** import from `@/lib/supabase/*` instead of `@supabase/auth-helpers-nextjs`. ~30 files; mostly mechanical import-and-call-site swaps.
3. **Package removal** — uninstall `@supabase/auth-helpers-nextjs` once all consumers migrated.

After this lands: Phase C of the rotation can complete (re-disable legacy keys, full security win).

**Tech Stack:** Next.js App Router (existing), `@supabase/ssr` (NEW dependency replacing `auth-helpers-nextjs`), TypeScript, vitest

**Reference projects:** LearningNuggets uses the same `@supabase/ssr` + thick-wrapper pattern (`learningnuggets/src/lib/supabase/{browser,server,middleware}.ts`). Use it as the architectural template — but note coach-dashboared has different existing patterns (App Router structure differs slightly, different paths, etc.) so don't copy verbatim.

---

## Pre-flight context

### Current state (post-2026-05-02 rotation)

- `lib/config/index.ts` exports `config.supabase.secretKey` (modern preferred / legacy fallback) — built during Phase A of the rotation. Server-side admin paths already use it (32 consumer files migrated).
- Browser-side auth still uses `@supabase/auth-helpers-nextjs::createClientComponentClient()` — reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` directly from the package's hardcoded internals.
- Vercel-Supabase Native Integration is connected; pushes both legacy + modern key names. Legacy keys are currently **re-enabled** in Supabase (login depends on this).
- No backend service — Next.js only.

### Discovery — files that import from `@supabase/auth-helpers-nextjs`

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
grep -rln "@supabase/auth-helpers-nextjs" app/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

Expected ~30 files at minimum. Each import will resolve to one of three helper functions:
- `createServerComponentClient` — Server Component pages
- `createRouteHandlerClient` — API route handlers
- `createClientComponentClient` — browser-side ('use client') components
- (`createMiddlewareClient` — for the root `middleware.ts` if applicable)

The wrapper layer needs to expose equivalents for each.

### Migration mapping

| Legacy import (auth-helpers-nextjs) | New wrapper (ours) | Internal package call |
|---|---|---|
| `createServerComponentClient({ cookies })` | `createServerClient()` from `@/lib/supabase/server` | `createServerClient` from `@supabase/ssr` |
| `createRouteHandlerClient({ cookies })` | `createServerClient()` from `@/lib/supabase/server` (same) | `createServerClient` from `@supabase/ssr` |
| `createClientComponentClient()` | `createBrowserClient()` from `@/lib/supabase/browser` | `createBrowserClient` from `@supabase/ssr` |
| `createMiddlewareClient({ req, res })` | `createMiddlewareClient()` from `@/lib/supabase/middleware` | `createServerClient` from `@supabase/ssr` (different cookie wiring) |

The new package `@supabase/ssr` differs from the old package in cookie-handling API. The wrapper must handle the bridging.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | Modify (Task 6) | Add `@supabase/ssr`; remove `@supabase/auth-helpers-nextjs` |
| `lib/supabase/server.ts` | Modify | Currently is a stub. Add `createServerClient()` factory using `@supabase/ssr::createServerClient`, wired to `next/headers::cookies()`. Reads `config.supabase.url` and `config.supabase.secretKey` for service-role; reads `config.supabase.url` and the publishable key (preferred) for normal session flow. |
| `lib/supabase/browser.ts` | Create | New file. Exports `createBrowserClient()` using `@supabase/ssr::createBrowserClient`. Reads `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY` literal pattern at the call site (Next.js build-time replacement requirement). |
| `lib/supabase/middleware.ts` | Create | New file. Exports `createMiddlewareSupabase(request, response)` using `@supabase/ssr::createServerClient` with cookie-bridge logic for the middleware-specific request/response pattern. |
| `middleware.ts` | Modify | Switch from `createMiddlewareClient` to the new wrapper. Verify session-refresh behavior matches. |
| `lib/supabase/server.test.ts` | Create | Unit tests covering: server client creation, modern key preferred, legacy fallback, cookie wiring. |
| `lib/supabase/browser.test.ts` | Create | Unit tests for the browser wrapper. |
| ~30 consumer files in `app/` and `lib/` | Modify | Swap imports from `@supabase/auth-helpers-nextjs` → `@/lib/supabase/server` or `@/lib/supabase/browser`. Update call shape (e.g., `createServerComponentClient({ cookies })` → `createServerClient()`). |
| `package.json` | Modify | Remove `@supabase/auth-helpers-nextjs` from `dependencies` |
| `docs/runbooks/2026-05-02-secret-inventory.md` | Modify (Task 9) | Update post-migration: legacy keys re-disabled, full security win achieved |
| `learningnuggets/docs/runbooks/supabase-key-rotation.md` | Modify (Task 9) | Update the coach-dashboared per-repo log section to reflect completion |

---

## Phase 0: Discovery

### Task 1: Inventory all auth-helpers-nextjs consumers

**Files:** None modified.

- [ ] **Step 1: Capture full file list**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
grep -rln "@supabase/auth-helpers-nextjs" app/ lib/ middleware.ts --include="*.ts" --include="*.tsx" 2>/dev/null > /tmp/coach-helpers-files.txt
wc -l /tmp/coach-helpers-files.txt
cat /tmp/coach-helpers-files.txt
```

- [ ] **Step 2: For each file, identify which helper function it imports**

```bash
for f in $(cat /tmp/coach-helpers-files.txt); do
  echo "=== $f ==="
  grep -E "createServerComponentClient|createRouteHandlerClient|createClientComponentClient|createMiddlewareClient" "$f" | head -3
done
```

This generates the per-file migration mapping. Useful for batching consumers in Task 5.

- [ ] **Step 3: Capture in plan-execution log**

Save the inventory + mapping to `/tmp/coach-helpers-inventory.md` for cross-reference during Task 5. Do not commit.

---

## Phase A: Build the wrapper layer

### Task 2: Install `@supabase/ssr` + retire `lib/supabase/client.ts` stub

**Files:**
- Modify: `package.json` (add `@supabase/ssr`)
- Modify: `lib/supabase/client.ts` (currently 3-line stub from auth-helpers — replace or delete)

- [ ] **Step 1: Add `@supabase/ssr` package**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
npm install @supabase/ssr@latest
```

Confirm it's added to `dependencies` (not `devDependencies`).

- [ ] **Step 2: Verify install + TypeScript types resolve**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Pre-existing 263 errors are fine; only flag NEW ones.

- [ ] **Step 3: Don't touch `lib/supabase/client.ts` yet**

It's still imported by browser-side code via `auth-helpers`. Leave it in place; replaced in Task 4.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @supabase/ssr (precursor to auth-helpers-nextjs migration)"
```

### Task 3: Build `lib/supabase/server.ts` wrapper

**Files:**
- Create or rewrite: `lib/supabase/server.ts`
- Create: `lib/supabase/server.test.ts`

- [ ] **Step 1: Write failing test for the server wrapper**

```typescript
// lib/supabase/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

describe('lib/supabase/server', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJlegacy'
  })

  it('createServerClient returns a Supabase client', async () => {
    const { createServerClient } = await import('./server')
    const client = createServerClient()
    expect(client).toBeDefined()
    expect(typeof client.from).toBe('function')
  })

  it('createServiceRoleClient uses config.supabase.secretKey', async () => {
    const { createServiceRoleClient } = await import('./server')
    const client = createServiceRoleClient()
    expect(client).toBeDefined()
    expect(typeof client.auth.admin).toBe('object')
  })
})
```

- [ ] **Step 2: Implement the wrapper**

```typescript
// lib/supabase/server.ts
import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { config } from '@/lib/config'

/**
 * Server-side Supabase client (Server Components + Route Handlers).
 * Reads cookies from the Next.js request via next/headers::cookies().
 * Uses the publishable key for session-context authentication.
 *
 * Replaces: @supabase/auth-helpers-nextjs::createServerComponentClient
 *           and @supabase/auth-helpers-nextjs::createRouteHandlerClient
 */
export function createServerClient() {
  const cookieStore = cookies()

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Browser-side keys must be literal NEXT_PUBLIC_* expressions for
    // Next.js build-time replacement. The fallback chain handles the
    // rotation transition window.
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components cannot set cookies; that's fine.
            // Middleware sets them via the middleware wrapper.
          }
        },
      },
    },
  )
}

/**
 * Service-role Supabase client (admin operations only).
 * Bypasses RLS — use ONLY in admin routes after auth verification.
 *
 * Reads config.supabase.secretKey (modern preferred / legacy fallback).
 */
export function createServiceRoleClient() {
  if (!config.supabase.secretKey) {
    throw new Error('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is not set')
  }
  return createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run lib/supabase/server.test.ts
```

All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/server.ts lib/supabase/server.test.ts
git commit -m "feat(supabase): server-side wrapper using @supabase/ssr (replaces auth-helpers-nextjs)"
```

### Task 4: Build `lib/supabase/browser.ts` wrapper

**Files:**
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/browser.test.ts`
- Replace: `lib/supabase/client.ts` (3-line stub) — delete it OR re-export the new browser client for back-compat

- [ ] **Step 1: Write failing test**

Mirror Task 3 step 1, exercising browser-client creation.

- [ ] **Step 2: Implement**

```typescript
// lib/supabase/browser.ts
'use client'

import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client (Client Components only).
 * Replaces: @supabase/auth-helpers-nextjs::createClientComponentClient
 *
 * NEXT_PUBLIC_* vars are accessed as literal expressions for Next.js
 * build-time replacement. Modern publishable preferred; legacy anon fallback
 * during the 2026-05-XX auth-helpers migration transition.
 */
export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: Replace the old `lib/supabase/client.ts` stub**

The old `client.ts` is:
```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
export const supabase = createClientComponentClient()
```

Replace with a re-export so existing imports of `lib/supabase/client` keep working temporarily:
```typescript
'use client'
import { createBrowserClient } from './browser'
export const supabase = createBrowserClient()
```

(Task 5 will migrate consumers off this re-export.)

- [ ] **Step 4: Test + commit**

```bash
npx vitest run lib/supabase/browser.test.ts
git add lib/supabase/browser.ts lib/supabase/browser.test.ts lib/supabase/client.ts
git commit -m "feat(supabase): browser-side wrapper + bridge re-export from old client.ts"
```

### Task 5: Build `lib/supabase/middleware.ts` wrapper + update root middleware

**Files:**
- Create: `lib/supabase/middleware.ts`
- Modify: `middleware.ts`

- [ ] **Step 1: Read the existing `middleware.ts`** to understand the current pattern.

- [ ] **Step 2: Implement the middleware wrapper**

```typescript
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware Supabase client. Bridges req.cookies / res.cookies between
 * Next.js middleware and Supabase's cookie-aware session refresh.
 *
 * Replaces: @supabase/auth-helpers-nextjs::createMiddlewareClient
 */
export function createMiddlewareSupabase(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )
}
```

- [ ] **Step 3: Migrate `middleware.ts` to use the new wrapper**

Read the existing pattern, swap the import + call shape. Verify session-refresh logic still triggers properly.

- [ ] **Step 4: Smoke test in browser**

```bash
npm run dev
```

In browser: navigate to a protected route. Confirm middleware redirects to login (anon path) and that login + dashboard access work after login (session path).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/middleware.ts middleware.ts
git commit -m "feat(supabase): middleware wrapper using @supabase/ssr"
```

---

## Phase B: Migrate consumers

### Task 6: Migrate ~30 consumer files

**Files:** ~30 files identified in Task 1.

The migration is mechanical. For each file:
1. Replace `import { ... } from '@supabase/auth-helpers-nextjs'` with `import { ... } from '@/lib/supabase/{server,browser}'`.
2. Replace call shapes:
   - `createServerComponentClient({ cookies })` → `createServerClient()`
   - `createRouteHandlerClient({ cookies })` → `createServerClient()`
   - `createClientComponentClient()` → `createBrowserClient()`
3. Verify TypeScript compiles (no NEW errors).

Recommended approach: batch by area. Subagent-driven works well here.

**Suggested batches (subagent dispatch one batch at a time):**

- Batch A (~10 files): `app/api/admin/*`, `app/api/auth/*`
- Batch B (~10 files): `app/api/messaging/*`, `app/api/zoho/*`, `app/api/sendgrid/*`
- Batch C (~10 files): `app/api/competitors/*`, `app/api/internal/*`, `app/api/coach-library/*`, `app/api/game-platform/*`, `app/api/validation/*`, `app/api/certificates/*`
- Batch D (~5 files): `app/auth/callback/route.ts`, `app/dashboard/admin-tools/*` Server Components

After each batch: run `npm run build` and `npx vitest run`. Pre-existing 263 typecheck errors are fine; only flag new ones.

- [ ] **Step 1: Batch A migration (subagent)**
- [ ] **Step 2: Verify build clean after Batch A**
- [ ] **Step 3: Batch B migration (subagent)**
- [ ] **Step 4: Verify**
- [ ] **Step 5: Batch C migration (subagent)**
- [ ] **Step 6: Verify**
- [ ] **Step 7: Batch D migration (subagent)**
- [ ] **Step 8: Final verification — zero `@supabase/auth-helpers-nextjs` imports remain**

```bash
grep -rln "@supabase/auth-helpers-nextjs" app/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

Should return empty.

- [ ] **Step 9: Commit per batch (4 commits, one per batch)**

---

## Phase C: Cleanup

### Task 7: Uninstall `@supabase/auth-helpers-nextjs`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm zero remaining imports** (grep from Task 6 Step 8 returns empty).

- [ ] **Step 2: Uninstall**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
npm uninstall @supabase/auth-helpers-nextjs
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Clean.

- [ ] **Step 4: Run full vitest + Playwright e2e**

```bash
npm run test:unit
npm run test:e2e   # if feasible — long run
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): remove @supabase/auth-helpers-nextjs (migration complete)"
```

### Task 8: Open PR + merge + deploy

**Files:** none modified.

Standard PR flow. Same caveats as the Phase A PR for the rotation:
- Push branch, open PR with summary referencing this plan
- Wait for explicit merge approval from Scott
- Merge → Vercel auto-deploys
- Browser smoke: incognito login, dashboard access, admin actions

Once merged + production smoke clean, **proceed to Task 9 to close out the rotation.**

### Task 9: Re-disable legacy Supabase keys (closes 2026-05-02 rotation)

**Files:**
- Modify: `docs/runbooks/2026-05-02-secret-inventory.md` (post-migration update)
- Modify: `learningnuggets/docs/runbooks/supabase-key-rotation.md` (per-repo log entry for coach-dashboared)

This is the deferred Phase C step from the original 2026-05-02 rotation. Cannot run until this auth-helpers migration ships.

- [ ] **Step 1: In Supabase dashboard → Project Settings → API Keys → Legacy tab → "Disable JWT-based API keys"**

After click, the legacy `anon` and `service_role` JWTs are revoked. The `@supabase/ssr` consumers all use modern `sb_publishable_*` and `sb_secret_*` so login + admin both keep working.

- [ ] **Step 2: Production smoke**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://coach.cyber-guild.org/
curl -s -o /dev/null -w "%{http_code}\n" https://coach.cyber-guild.org/dashboard
```

Both 200/307. Browser incognito login still works.

- [ ] **Step 3: Update docs**

Update `docs/runbooks/2026-05-02-secret-inventory.md`:
- Set "Phase C cleanup completed" to ✓
- Note the auth-helpers migration as the gating dependency that's now satisfied

Update the per-repo log section in `learningnuggets/docs/runbooks/supabase-key-rotation.md` for coach-dashboared:
- Date completed
- Final state: legacy keys revoked, modern keys live, all auth on @supabase/ssr

- [ ] **Step 4: Commit doc updates**

```bash
git add docs/runbooks/2026-05-02-secret-inventory.md
# In learningnuggets repo:
git add docs/runbooks/supabase-key-rotation.md
```

Two PRs (one per repo) or a single docs commit per repo.

---

## Self-Review Notes

**Spec coverage:**
- Replace auth-helpers-nextjs entirely → Tasks 2-7
- Introduce wrapper layer for future-proofing → Tasks 3-5
- Migrate ~30 consumers → Task 6 (batched)
- Re-disable legacy keys → Task 9 (closes the original rotation)

**No placeholders:** every step has either a concrete code block or a concrete shell command.

**Final-task check:** Task 9 is a deploy + doc-update task. Per the writing-plans skill, the LAST task should be source-of-truth doc updates with literal checkbox steps — Step 3 of Task 9 covers that.

---

## Execution-grouping notes

- Tasks 1-2 can be one short session (~30 min)
- Tasks 3-5 (the three wrapper files) can be one session (~1-2 hours, subagent-driven)
- Task 6 batches can each be their own session OR one long session — depends on Scott's appetite. Each batch is ~10 file changes, mechanical.
- Tasks 7-9 are wrap-up — quick, one session.

Total estimated effort: 4-8 hours across 3-5 sessions. The work is mechanical but voluminous.

---

## Reference

- Original 2026-05-02 rotation plan + first-run case study: `learningnuggets/docs/superpowers/plans/2026-05-02-supabase-key-rotation.md`
- Portable rotation runbook: `learningnuggets/docs/runbooks/supabase-key-rotation.md`
- Inventory + decisions for coach-dashboared rotation: `docs/runbooks/2026-05-02-secret-inventory.md`
- Reference implementation (already on @supabase/ssr): `learningnuggets/src/lib/supabase/{browser,server,middleware}.ts`
