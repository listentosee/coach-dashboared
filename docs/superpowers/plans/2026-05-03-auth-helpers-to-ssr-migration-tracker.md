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
| A | Task 4: `lib/supabase/browser.ts` wrapper + tests + `client.ts` bridge re-export | ☐ |
| A | Task 5: `lib/supabase/middleware.ts` + migrate `middleware.ts` | ☐ |
| B | Task 6 Batch A: `app/api/admin/**` (34) | 0 / 34 |
| B | Task 6 Batch B: `app/api/messaging/**` (29) | 0 / 29 |
| B | Task 6 Batch C: `app/api/{competitors,teams}/**` (19) | 0 / 19 |
| B | Task 6 Batch D: other route handlers (19) | 0 / 19 |
| B | Task 6 Batch E: Server Components (11) | 0 / 11 |
| B | Task 6 Batch F: client component (1) | 0 / 1 |
| C | Task 7: Uninstall `@supabase/auth-helpers-nextjs` | ☐ |
| C | Task 8: PR + merge + production deploy | ☐ |
| C | Task 9: Re-disable legacy Supabase keys + doc updates | ☐ |

**Consumer file totals:** 113 in Task 6 (115 total − `middleware.ts` in Task 5 − `lib/supabase/client.ts` in Task 4).

**Done counter:** 0 / 113

---

## Verification cadence

After EACH batch, append to the verification log at the bottom:

```bash
grep -rln "@supabase/auth-helpers-nextjs" app/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l
npm run build 2>&1 | tail -5
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

- [ ] Write `lib/supabase/browser.test.ts` (failing test first)
- [ ] Create `lib/supabase/browser.ts` with `createBrowserClient()`
- [ ] Replace `lib/supabase/client.ts` with re-export bridge from `./browser`
- [ ] `npx vitest run lib/supabase/browser.test.ts` — all pass
- [ ] Commit: `feat(supabase): browser-side wrapper + bridge re-export from old client.ts`

### Task 5 — `lib/supabase/middleware.ts` + root `middleware.ts`

- [ ] Read existing `middleware.ts` to understand current pattern
- [ ] Create `lib/supabase/middleware.ts` with `createMiddlewareSupabase(request, response)`
- [ ] Migrate `middleware.ts` to new wrapper
- [ ] `npm run dev` — manual smoke: protected-route redirect + login + dashboard access
- [ ] Commit: `feat(supabase): middleware wrapper using @supabase/ssr`

---

## Phase B — Consumer migration (Task 6)

Each file: replace `import ... from '@supabase/auth-helpers-nextjs'` with import from `@/lib/supabase/{server,browser}`, then update call shape per the mapping table in the plan. Run `npm run build` and grep-count check after each batch commit.

### Batch A — `app/api/admin/**` (34 files, `createRouteHandlerClient` → `createServerClient()`)

- [ ] `app/api/admin/activity-logs/route.ts`
- [ ] `app/api/admin/analytics/route.ts`
- [ ] `app/api/admin/analytics/share/route.ts`
- [ ] `app/api/admin/certificates/generate/route.ts`
- [ ] `app/api/admin/certificates/send/route.ts`
- [ ] `app/api/admin/certificates/submissions/export/route.ts`
- [ ] `app/api/admin/certificates/submissions/route.ts`
- [ ] `app/api/admin/coach-library/[id]/route.ts`
- [ ] `app/api/admin/coach-library/route.ts`
- [ ] `app/api/admin/context/route.ts`
- [ ] `app/api/admin/cron-jobs/create/route.ts`
- [ ] `app/api/admin/cron-jobs/route.ts`
- [ ] `app/api/admin/cron-jobs/schedule/route.ts`
- [ ] `app/api/admin/cron-jobs/toggle/route.ts`
- [ ] `app/api/admin/job-queue/actions/route.ts`
- [ ] `app/api/admin/job-queue/health/route.ts`
- [ ] `app/api/admin/job-queue/toggle/route.ts`
- [ ] `app/api/admin/jobs/create/route.ts`
- [ ] `app/api/admin/jobs/run-worker/route.ts`
- [ ] `app/api/admin/jobs/trigger-sync/route.ts`
- [ ] `app/api/admin/jobs/trigger-totals-sweep/route.ts`
- [ ] `app/api/admin/nice-framework/seed/route.ts`
- [ ] `app/api/admin/nice-framework/stats/route.ts`
- [ ] `app/api/admin/releases/route.ts`
- [ ] `app/api/admin/reset-coach-password/route.ts`
- [ ] `app/api/admin/school-geo/[id]/route.ts`
- [ ] `app/api/admin/team-images/[candidateId]/accept/route.ts`
- [ ] `app/api/admin/team-images/[candidateId]/regen/route.ts`
- [ ] `app/api/admin/team-images/[candidateId]/reject/route.ts`
- [ ] `app/api/admin/team-images/bulk-generate/route.ts`
- [ ] `app/api/admin/team-images/candidates/route.ts`
- [ ] `app/api/admin/team-images/generate-for-team/route.ts`
- [ ] `app/api/admin/team-images/preload/route.ts`
- [ ] `app/api/admin/team-images/status/route.ts`

### Batch B — `app/api/messaging/**` (29 files, `createRouteHandlerClient` → `createServerClient()`)

- [ ] `app/api/messaging/announcements/competitors/drafts/[id]/route.ts`
- [ ] `app/api/messaging/announcements/competitors/drafts/route.ts`
- [ ] `app/api/messaging/announcements/competitors/send/route.ts`
- [ ] `app/api/messaging/announcements/send/route.ts`
- [ ] `app/api/messaging/conversations/[id]/archive/route.ts`
- [ ] `app/api/messaging/conversations/[id]/members/route.ts`
- [ ] `app/api/messaging/conversations/[id]/messages/route.ts`
- [ ] `app/api/messaging/conversations/[id]/mute/route.ts`
- [ ] `app/api/messaging/conversations/[id]/pin/route.ts`
- [ ] `app/api/messaging/conversations/[id]/read/route.ts`
- [ ] `app/api/messaging/conversations/[id]/threads/route.ts`
- [ ] `app/api/messaging/conversations/dm/route.ts`
- [ ] `app/api/messaging/conversations/group/route.ts`
- [ ] `app/api/messaging/conversations/route.ts`
- [ ] `app/api/messaging/conversations/summary/route.ts`
- [ ] `app/api/messaging/drafts/[id]/route.ts`
- [ ] `app/api/messaging/drafts/route.ts`
- [ ] `app/api/messaging/file/route.ts`
- [ ] `app/api/messaging/messages/[id]/flag/route.ts`
- [ ] `app/api/messaging/messages/recent/route.ts`
- [ ] `app/api/messaging/pinned/route.ts`
- [ ] `app/api/messaging/read-receipts/route.ts`
- [ ] `app/api/messaging/read-status/route.ts`
- [ ] `app/api/messaging/search/route.ts`
- [ ] `app/api/messaging/threads/[id]/route.ts`
- [ ] `app/api/messaging/threads/summary/route.ts`
- [ ] `app/api/messaging/unread/count/route.ts`
- [ ] `app/api/messaging/upload/route.ts`
- [ ] `app/api/messaging/users/route.ts`

### Batch C — `app/api/competitors/**` + `app/api/teams/**` (19 files)

- [ ] `app/api/competitors/[id]/disclosure-log/route.ts`
- [ ] `app/api/competitors/[id]/regenerate-link/route.ts`
- [ ] `app/api/competitors/[id]/toggle-active/route.ts`
- [ ] `app/api/competitors/[id]/update/route.ts`
- [ ] `app/api/competitors/bulk-import/check-duplicates/route.ts`
- [ ] `app/api/competitors/bulk-import/route.ts`
- [ ] `app/api/competitors/check-duplicates/route.ts`
- [ ] `app/api/competitors/create/route.ts`
- [ ] `app/api/competitors/maintenance/update-statuses/route.ts`
- [ ] `app/api/competitors/paged/route.ts`
- [ ] `app/api/competitors/route.ts`
- [ ] `app/api/teams/[id]/members/[competitor_id]/route.ts`
- [ ] `app/api/teams/[id]/members/add/route.ts`
- [ ] `app/api/teams/[id]/members/route.ts`
- [ ] `app/api/teams/[id]/route.ts`
- [ ] `app/api/teams/[id]/update/route.ts`
- [ ] `app/api/teams/[id]/upload-image/route.ts`
- [ ] `app/api/teams/create/route.ts`
- [ ] `app/api/teams/route.ts`

### Batch D — Remaining route handlers (19 files)

> ⚠️ **`app/auth/callback/route.ts`** is the session-sensitive auth handshake. Migrate it manually in its OWN commit, not folded into the subagent batch.

- [ ] `app/api/auth/clear-must-change/route.ts`
- [ ] `app/api/coach-library/[id]/download/route.ts`
- [ ] `app/api/coach-library/route.ts`
- [ ] `app/api/coaches/register/route.ts`
- [ ] `app/api/cybernuggets/sso/route.ts`
- [ ] `app/api/game-platform/competitors/[id]/route.ts`
- [ ] `app/api/game-platform/dashboard/route.ts`
- [ ] `app/api/game-platform/report-card/[competitorId]/route.ts`
- [ ] `app/api/game-platform/teams/[id]/sync/route.ts`
- [ ] `app/api/internal/sync/route.ts`
- [ ] `app/api/metactf/sso/route.ts`
- [ ] `app/api/releases/paged/route.ts`
- [ ] `app/api/users/admins/route.ts`
- [ ] `app/api/users/coaches/route.ts`
- [ ] `app/api/users/directory/route.ts`
- [ ] `app/api/zoho/cancel/route.ts`
- [ ] `app/api/zoho/send/route.ts`
- [ ] `app/api/zoho/upload-manual/route.ts`
- [ ] `app/auth/callback/route.ts` ⚠️ **separate commit, manual review**

### Batch E — Server Component pages (11 files, `createServerComponentClient` → `createServerClient()`)

- [ ] `app/dashboard/admin-tools/activity-logs/page.tsx`
- [ ] `app/dashboard/admin-tools/analytics/page.tsx`
- [ ] `app/dashboard/admin-tools/assist-coach/page.tsx`
- [ ] `app/dashboard/admin-tools/certificates/page.tsx`
- [ ] `app/dashboard/admin-tools/coach-library/page.tsx`
- [ ] `app/dashboard/admin-tools/game-platform-roster/page.tsx`
- [ ] `app/dashboard/admin-tools/jobs/page.tsx`
- [ ] `app/dashboard/admin-tools/mailer/page.tsx`
- [ ] `app/dashboard/admin-tools/page.tsx`
- [ ] `app/dashboard/admin-tools/school-geo/page.tsx`
- [ ] `app/dashboard/admin-tools/team-image-generator/page.tsx`

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

_(none yet)_

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
