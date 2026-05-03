# Sidecar tracker — `@supabase/auth-helpers-nextjs` → `@supabase/ssr` migration

**Companion to:** [`2026-05-03-auth-helpers-to-ssr-migration.md`](./2026-05-03-auth-helpers-to-ssr-migration.md)

**Inventory generated:** 2026-05-03 (115 files via `grep -rln "@supabase/auth-helpers-nextjs" app/ lib/ middleware.ts`)

**Last updated:** 2026-05-03

---

## Status

| Phase | Item | State |
|---|---|---|
| 0 | Inventory | ✅ Complete |
| A | Task 2: Install `@supabase/ssr` | ✅ |
| A | Task 3: `lib/supabase/server.ts` wrapper + tests | ✅ |
| A | Task 4: `lib/supabase/browser.ts` wrapper + tests + `client.ts` bridge re-export | ✅ |
| A | Task 5: `lib/supabase/middleware.ts` + migrate `middleware.ts` | ✅ |
| B | Task 6 Batch A: `app/api/admin/**` (34) | ✅ 34 / 34 |
| B | Task 6 Batch B: `app/api/messaging/**` (29) | ✅ 29 / 29 |
| B | Task 6 Batch C: `app/api/{competitors,teams}/**` (19) | ✅ 19 / 19 |
| B | Task 6 Batch D: other route handlers (19) | ✅ 19 / 19 |
| B | Task 6 Batch E: Server Components (11) | ✅ 11 / 11 |
| B | Task 6 Batch F: client component (1) | 0 / 1 |
| C | Task 7: Uninstall `@supabase/auth-helpers-nextjs` | ☐ |
| C | Task 8: PR + merge + production deploy | ☐ |
| C | Task 9: Re-disable legacy Supabase keys + doc updates | ☐ |

**Consumer file totals:** 113 in Task 6 (115 total − `middleware.ts` in Task 5 − `lib/supabase/client.ts` in Task 4).

**Done counter:** 112 / 113

---

## Verification cadence

After EACH batch, append to the verification log at the bottom:

```bash
# Precise grep (catches static + dynamic imports, ignores docstring mentions)
grep -rlE "(from\s+['\"]@supabase/auth-helpers-nextjs['\"]|import\s*\(\s*['\"]@supabase/auth-helpers-nextjs['\"])" \
  app/ lib/ middleware.ts --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l
pnpm build 2>&1 | tail -5
```

The grep count should monotonically decrease toward zero. If a NEW file appears (count increases or unexpected entry), add it to **§ Newly discovered files** below — don't silently absorb it into a batch.

---

## Phase A — Wrapper layer (Tasks 2-5)

### Task 2 — Install `@supabase/ssr`

- [x] `pnpm add @supabase/ssr@latest` (project uses pnpm, not npm — plan said npm)
- [x] Confirm in `dependencies` — `@supabase/ssr ^0.10.2`
- [x] `pnpm exec tsc --noEmit` — no NEW errors from `@supabase/ssr` or `@supabase/supabase-js`. Total 268 (baseline was ~263; the 5-delta is pre-existing `ReadonlyRequestCookies` noise, no new ssr-attributable errors)
- [x] Commit

**Notes:**
- Peer-dep warning: `@supabase/ssr@0.10.2` wants `@supabase/supabase-js@^2.102.1`, project has `2.49.4`. NOT NEW — `@supabase/auth-helpers-nextjs` also peers against `^2.76.1` and the project has been running with that mismatch. Deferring `supabase-js` upgrade to a separate task. Track risk if browser-side auth misbehaves during smoke testing.

### Task 3 — `lib/supabase/server.ts`

- [x] Wrote `lib/supabase/server.test.ts` (TDD red phase — 5 failing tests)
- [x] Implemented `lib/supabase/server.ts` — `createServerClient()` + `createServiceRoleClient()`
- [x] `pnpm exec vitest run lib/supabase/server.test.ts` — 5/5 pass
- [x] Commit

**Notes:**
- Plan's literal code used sync `cookies()` from `next/headers`, but Next 15.5 made `cookies()` async. Adapted to async-cookie callbacks (`getAll`/`setAll` await `cookies()` internally) so `createServerClient()` itself stays sync — consumer call shape unchanged.

### Task 4 — `lib/supabase/browser.ts` + bridge re-export

- [x] Wrote `lib/supabase/browser.test.ts` (TDD red phase — 2 failing tests)
- [x] Created `lib/supabase/browser.ts` with `createBrowserClient()` (`'use client'`)
- [x] Replaced `lib/supabase/client.ts` with singleton bridge: `export const supabase = createBrowserClient()`
- [x] `pnpm exec vitest run lib/supabase/{browser,server}.test.ts` — 7/7 pass; 10/10 across config + supabase
- [x] Commit

**Notes:**
- Bridge is a true singleton (matches old behavior — auth-helpers also exported singleton). 20 existing consumers of `import { supabase } from '@/lib/supabase/client'` keep working without per-callsite migration.
- **Verification grep refined.** The original loose grep `grep -rln @supabase/auth-helpers-nextjs` matched docstring mentions in the new wrapper files, falsely inflating the count. Use the precise pattern going forward: `grep -rlE "(from\s+['\"]@supabase/auth-helpers-nextjs['\"]|import\s*\(\s*['\"]@supabase/auth-helpers-nextjs['\"])" app/ lib/ middleware.ts --include="*.ts" --include="*.tsx"`. This catches both static `from '...'` and dynamic `import('...')`.
- Post-Task-4 precise count: **114** (113 static + 1 dynamic via `app/dashboard/teams/page.tsx`).

### Task 5 — `lib/supabase/middleware.ts` + root `middleware.ts`

- [x] Read existing `middleware.ts`
- [x] Created `lib/supabase/middleware.ts` with `createMiddlewareSupabase(request)` returning `{ supabase, response(), redirect(url) }`
- [x] Migrated `middleware.ts` to new wrapper — preserves existing redirects (login, force-reset, admin gate)
- [x] `pnpm dev` smoke: `GET /` → 200, `GET /dashboard` (no auth) → 307 to `/auth/login`, `GET /auth/login` → 200, `GET /dashboard/admin` (no auth) → 307 to `/auth/login`. `[middleware] No session for path /dashboard cookies: 0` log fires correctly
- [x] Commit

**Notes:**
- Wrapper API differs from plan's `createMiddlewareSupabase(request, response)` signature. The @supabase/ssr cookie-bridging pattern requires the response to be re-built inside `setAll`, so the wrapper takes only `request` and returns a `response()` getter and a `redirect(url)` helper that copies auth cookies onto the redirect response. Plan code wouldn't have preserved session refreshes through redirects.

---

## Phase B — Consumer migration (Task 6)

Each file: replace `import ... from '@supabase/auth-helpers-nextjs'` with import from `@/lib/supabase/{server,browser}`, then update call shape per the mapping table in the plan. Run `npm run build` and grep-count check after each batch commit.

### Batch A — `app/api/admin/**` (34 files, `createRouteHandlerClient` → `createServerClient()`)

- [x] `app/api/admin/activity-logs/route.ts`
- [x] `app/api/admin/analytics/route.ts`
- [x] `app/api/admin/analytics/share/route.ts`
- [x] `app/api/admin/certificates/generate/route.ts`
- [x] `app/api/admin/certificates/send/route.ts`
- [x] `app/api/admin/certificates/submissions/export/route.ts`
- [x] `app/api/admin/certificates/submissions/route.ts`
- [x] `app/api/admin/coach-library/[id]/route.ts`
- [x] `app/api/admin/coach-library/route.ts`
- [x] `app/api/admin/context/route.ts`
- [x] `app/api/admin/cron-jobs/create/route.ts`
- [x] `app/api/admin/cron-jobs/route.ts`
- [x] `app/api/admin/cron-jobs/schedule/route.ts`
- [x] `app/api/admin/cron-jobs/toggle/route.ts`
- [x] `app/api/admin/job-queue/actions/route.ts`
- [x] `app/api/admin/job-queue/health/route.ts`
- [x] `app/api/admin/job-queue/toggle/route.ts`
- [x] `app/api/admin/jobs/create/route.ts`
- [x] `app/api/admin/jobs/run-worker/route.ts`
- [x] `app/api/admin/jobs/trigger-sync/route.ts`
- [x] `app/api/admin/jobs/trigger-totals-sweep/route.ts`
- [x] `app/api/admin/nice-framework/seed/route.ts`
- [x] `app/api/admin/nice-framework/stats/route.ts`
- [x] `app/api/admin/releases/route.ts`
- [x] `app/api/admin/reset-coach-password/route.ts`
- [x] `app/api/admin/school-geo/[id]/route.ts`
- [x] `app/api/admin/team-images/[candidateId]/accept/route.ts`
- [x] `app/api/admin/team-images/[candidateId]/regen/route.ts`
- [x] `app/api/admin/team-images/[candidateId]/reject/route.ts`
- [x] `app/api/admin/team-images/bulk-generate/route.ts`
- [x] `app/api/admin/team-images/candidates/route.ts`
- [x] `app/api/admin/team-images/generate-for-team/route.ts`
- [x] `app/api/admin/team-images/preload/route.ts`
- [x] `app/api/admin/team-images/status/route.ts`

### Batch B — `app/api/messaging/**` (29 files, `createRouteHandlerClient` → `createServerClient()`)

- [x] `app/api/messaging/announcements/competitors/drafts/[id]/route.ts`
- [x] `app/api/messaging/announcements/competitors/drafts/route.ts`
- [x] `app/api/messaging/announcements/competitors/send/route.ts`
- [x] `app/api/messaging/announcements/send/route.ts`
- [x] `app/api/messaging/conversations/[id]/archive/route.ts`
- [x] `app/api/messaging/conversations/[id]/members/route.ts`
- [x] `app/api/messaging/conversations/[id]/messages/route.ts`
- [x] `app/api/messaging/conversations/[id]/mute/route.ts`
- [x] `app/api/messaging/conversations/[id]/pin/route.ts`
- [x] `app/api/messaging/conversations/[id]/read/route.ts`
- [x] `app/api/messaging/conversations/[id]/threads/route.ts`
- [x] `app/api/messaging/conversations/dm/route.ts`
- [x] `app/api/messaging/conversations/group/route.ts`
- [x] `app/api/messaging/conversations/route.ts`
- [x] `app/api/messaging/conversations/summary/route.ts`
- [x] `app/api/messaging/drafts/[id]/route.ts`
- [x] `app/api/messaging/drafts/route.ts`
- [x] `app/api/messaging/file/route.ts`
- [x] `app/api/messaging/messages/[id]/flag/route.ts`
- [x] `app/api/messaging/messages/recent/route.ts`
- [x] `app/api/messaging/pinned/route.ts`
- [x] `app/api/messaging/read-receipts/route.ts`
- [x] `app/api/messaging/read-status/route.ts`
- [x] `app/api/messaging/search/route.ts`
- [x] `app/api/messaging/threads/[id]/route.ts`
- [x] `app/api/messaging/threads/summary/route.ts`
- [x] `app/api/messaging/unread/count/route.ts`
- [x] `app/api/messaging/upload/route.ts`
- [x] `app/api/messaging/users/route.ts`

### Batch C — `app/api/competitors/**` + `app/api/teams/**` (19 files)

- [x] `app/api/competitors/[id]/disclosure-log/route.ts`
- [x] `app/api/competitors/[id]/regenerate-link/route.ts`
- [x] `app/api/competitors/[id]/toggle-active/route.ts`
- [x] `app/api/competitors/[id]/update/route.ts`
- [x] `app/api/competitors/bulk-import/check-duplicates/route.ts`
- [x] `app/api/competitors/bulk-import/route.ts`
- [x] `app/api/competitors/check-duplicates/route.ts`
- [x] `app/api/competitors/create/route.ts`
- [x] `app/api/competitors/maintenance/update-statuses/route.ts`
- [x] `app/api/competitors/paged/route.ts`
- [x] `app/api/competitors/route.ts`
- [x] `app/api/teams/[id]/members/[competitor_id]/route.ts`
- [x] `app/api/teams/[id]/members/add/route.ts`
- [x] `app/api/teams/[id]/members/route.ts`
- [x] `app/api/teams/[id]/route.ts`
- [x] `app/api/teams/[id]/update/route.ts`
- [x] `app/api/teams/[id]/upload-image/route.ts`
- [x] `app/api/teams/create/route.ts`
- [x] `app/api/teams/route.ts`

### Batch D — Remaining route handlers (19 files)

> ⚠️ **`app/auth/callback/route.ts`** is the session-sensitive auth handshake. Migrate it manually in its OWN commit, not folded into the subagent batch.

- [x] `app/api/auth/clear-must-change/route.ts`
- [x] `app/api/coach-library/[id]/download/route.ts`
- [x] `app/api/coach-library/route.ts`
- [x] `app/api/coaches/register/route.ts`
- [x] `app/api/cybernuggets/sso/route.ts`
- [x] `app/api/game-platform/competitors/[id]/route.ts`
- [x] `app/api/game-platform/dashboard/route.ts`
- [x] `app/api/game-platform/report-card/[competitorId]/route.ts`
- [x] `app/api/game-platform/teams/[id]/sync/route.ts`
- [x] `app/api/internal/sync/route.ts`
- [x] `app/api/metactf/sso/route.ts`
- [x] `app/api/releases/paged/route.ts`
- [x] `app/api/users/admins/route.ts`
- [x] `app/api/users/coaches/route.ts`
- [x] `app/api/users/directory/route.ts`
- [x] `app/api/zoho/cancel/route.ts`
- [x] `app/api/zoho/send/route.ts`
- [x] `app/api/zoho/upload-manual/route.ts`
- [x] `app/auth/callback/route.ts` ✅ separate commit — manual review

### Batch E — Server Component pages (11 files, `createServerComponentClient` → `createServerClient()`)

- [x] `app/dashboard/admin-tools/activity-logs/page.tsx`
- [x] `app/dashboard/admin-tools/analytics/page.tsx`
- [x] `app/dashboard/admin-tools/assist-coach/page.tsx`
- [x] `app/dashboard/admin-tools/certificates/page.tsx`
- [x] `app/dashboard/admin-tools/coach-library/page.tsx`
- [x] `app/dashboard/admin-tools/game-platform-roster/page.tsx`
- [x] `app/dashboard/admin-tools/jobs/page.tsx`
- [x] `app/dashboard/admin-tools/mailer/page.tsx`
- [x] `app/dashboard/admin-tools/page.tsx`
- [x] `app/dashboard/admin-tools/school-geo/page.tsx`
- [x] `app/dashboard/admin-tools/team-image-generator/page.tsx`

### Batch F — Client component (1 file, `createClientComponentClient` → `createBrowserClient()`)

- [ ] `app/dashboard/teams/page.tsx`

> Note: `lib/supabase/client.ts` is also a `createClientComponentClient` consumer but is replaced as part of Task 4 (becomes the re-export bridge).

---

## Phase C — Cleanup (Tasks 7-9)

### Task 7 — Uninstall `@supabase/auth-helpers-nextjs`

- [ ] Verify zero remaining imports: `grep -rln "@supabase/auth-helpers-nextjs" app/ lib/ --include="*.ts" --include="*.tsx"` returns empty
- [ ] `npm uninstall @supabase/auth-helpers-nextjs`
- [ ] `npm run build` — clean
- [ ] `npm run test:unit`
- [ ] (Optional) `npm run test:e2e`
- [ ] Commit: `chore(deps): remove @supabase/auth-helpers-nextjs (migration complete)`

### Task 8 — PR + merge + deploy

- [ ] Push branch
- [ ] Open PR referencing this plan
- [ ] Wait for explicit merge approval from Scott
- [ ] Merge → Vercel auto-deploys
- [ ] Production smoke: incognito login, dashboard access, admin actions

### Task 9 — Re-disable legacy keys + doc updates

- [ ] Supabase dashboard → Project Settings → API Keys → Legacy tab → Disable JWT-based API keys
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://coach.cyber-guild.org/` → 200
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://coach.cyber-guild.org/dashboard` → 200/307
- [ ] Browser incognito login still works
- [ ] Update `docs/runbooks/2026-05-02-secret-inventory.md` (Phase C ✓)
- [ ] Update `learningnuggets/docs/runbooks/supabase-key-rotation.md` per-repo log
- [ ] Commit doc updates (one PR per repo)

---

## § Newly discovered files

> If a new `@supabase/auth-helpers-nextjs` import appears mid-migration (e.g. due to a merge from `main` or a file that was missed by the original grep), add it here with date and the batch you absorbed it into.

- **`components/game-platform/report-card/challenges-table.tsx`** (uses `createClientComponentClient`) — discovered during Batch E by re-scanning the full repo (the original inventory grep only searched `app/ lib/ middleware.ts`, missing `components/`). Folding into Batch F. Adjusts Batch F count: 1 → 2. Total consumer count: 113 → 114 (still ≠ 115 because the wrapper-`client.ts` bridge in Task 4 and `middleware.ts` in Task 5 count toward the original 115 separately).

---

## § Out-of-scope discoveries

> Things noticed during migration that are NOT this work — file them here so they're not lost. Don't fix them inline.

_(none yet)_

---

## § Verification log

| Date | After | grep count | build | notes |
|---|---|---:|---|---|
| 2026-05-03 | inventory | 115 | — | baseline |
| 2026-05-03 | Task 2 (install ssr) | 115 | typecheck only — 268 errors (baseline ~263, no ssr-attributable) | peer-dep warning vs supabase-js@2.49.4 noted; pre-existing pattern |
| 2026-05-03 | Task 3 (server wrapper) | 115 | 8/8 vitest pass (config + server.test) | async-cookie pattern adopted for Next 15.5 |
| 2026-05-03 | Task 4 (browser + bridge) | 114 (precise) | 10/10 vitest pass | switched to precise grep; original loose grep had false positives from docstring mentions |
| 2026-05-03 | Task 5 (middleware) | 113 (precise) | dev smoke: redirects 307 correctly, no errors | new wrapper exposes `{supabase, response(), redirect(url)}`; cookie-preserving redirect helper handles session refresh |
| 2026-05-03 | Batch A (admin, 34 files) | 79 | `pnpm build` ✅; tsc 237 errors (down from 268 baseline as ReadonlyRequestCookies errors disappeared) | subagent migration; cookies import preserved in `context/route.ts` and `releases/route.ts` for non-Supabase admin_coach_id reads |
| 2026-05-03 | Batch B (messaging, 29 files) | 50 | tsc 199 errors (down from 237) | zero variations — fully canonical pattern; 9 files had multiple-handler swaps |
| 2026-05-03 | Batch C (competitors+teams, 19 files) | 31 | tsc 180 errors (down from 199) | one variation: `competitors/[id]/update/route.ts` had `createRouteHandlerClient({ cookies })` raw form (no closure) — handled identically; 13 files retain cookieStore for `admin_coach_id` reads |
| 2026-05-03 | Batch D-auto (mixed, 18 files) | 13 | tsc 164 errors (down from 180) | 7 files retain cookieStore for admin_coach_id; auth/callback excluded for manual migration |
| 2026-05-03 | Batch D-manual (auth/callback) | 12 | `pnpm build` ✅; tsc 164 errors (stable) | manual swap of OAuth/email-link callback handler — exchangeCodeForSession + setSession both write cookies via wrapper's setAll, redirect response inherits via Next.js cookie store merging |
| 2026-05-03 | Batch E (server components, 11 files) | 2 | tsc 155 errors (down from 164) | createServerComponentClient → createServerClient (same wrapper); 2 files had `cookies as any` cast removed cleanly |
