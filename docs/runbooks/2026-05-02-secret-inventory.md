# 2026-05-02 Secret Inventory & Rotation Decision Matrix — coach-dashboared

**Trigger:** Continuation of the 2026-05-02 Vercel-compromise rotation series. Project has been in production since Oct 2025 and is overdue on the modern Vercel/Supabase integration posture.

**Reference runbook:** `learningnuggets/docs/runbooks/supabase-key-rotation.md` (the portable runbook authored during the LearningNuggets first-run).

**Captured:** 2026-05-02 from local `.env` + Vercel project (`prj_9HfdEd9tIgsVn9DmlOd2LZ4CEpsf`, name `coach-dashboared`).

---

## Pre-flight findings (Phase 0)

### 0a. Project shape

- **Frontend host:** Vercel (`coach-dashboared`)
- **Backend host:** None (Next.js-only — no separate Python/FastAPI service like LearningNuggets has)
- **Framework:** Next.js App Router
- **Test framework:** vitest (NOT jest — important for subagent prompts)
- **TypeScript path alias:** `@/*` → `./*` (root-relative, no `src/` prefix)
- **Auth helper:** ~~`@supabase/auth-helpers-nextjs`~~ → migrated to project-internal wrapper layer (`lib/supabase/{server,browser,middleware}.ts`) backed by `@supabase/ssr`. PR #96 merged 2026-05-03.

### 0b. Local `.env` env-var inventory (43 vars total)

Supabase-relevant subset:

| Variable | Status pre-rotation | Decision |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Set | Keep (public URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (legacy JWT) | **Revoke** in Phase C; replace primary reader with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_URL` | Set | Keep |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (legacy JWT) | **Revoke** in Phase C; replace primary reader with `SUPABASE_SECRET_KEY` |
| `SUPABASE_JWT_SECRET` | Set (legacy HMAC) | **Revoke** in Phase C; no production code consumer once Phase A migrates |
| `SUPABASE_MESSAGES_BUCKET` | Set (storage bucket name) | Keep (not a secret) |
| `POSTGRES_*` (7 vars) | Set | Verify usage in Phase A; if unused → bonus deletion in Phase C |

Modern keys (`SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) are **NOT YET SET** anywhere. Phase B Step 9 generates them.

Other secrets out of scope for this rotation but flagged for follow-up:
- `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `SENDGRID_API_KEY`, `MONDAY_API_TOKEN`, `FILLOUT_*`, `GAME_PLATFORM_*`, `ZOHO_*`, `CYBERNUGGETS_*`, `ABSTRACT_EMAIL_API_KEY`, `INTERNAL_SYNC_SECRET`, `JOB_QUEUE_RUNNER_SECRET`, `CRON_SECRET`, `ADMIN_CREATION_KEY_HASH` — all part of the Vercel blast radius from the same compromise. Each should get its own rotation plan in priority order.

### 0c. Pre-rotation git history audit

**Both repos clean for `.env*` tracking:** no `.env*` file ever committed.

**One real leak found:**
- `playwright/.auth/admin.json` (1360 bytes), committed `3b4ceb60` ("admin editing refactor phase 4"), Sept 15 2025.
- Contains a real Supabase auth-state JSON with `sb-access-token` JWT (and possibly a refresh token).
- Access token is almost certainly expired (Supabase access tokens are ≤1 hour; this is 8 months old).
- File should not be in history regardless. Tracked via spawn-task; scrub planned independently of the rotation. Path stays in `.gitignore` going forward.

**False positives (won't block rotation):**
- `docs/operations/Solving Supabase Local Development RLS Violations.md` — local-dev (port 54321) default JWTs, publicly known.
- `docs/source-of-truth/operations/github-workflow-guide.md` — same pattern, plus `sb_secret_*` example values from local-dev.

### 0d. Code-readiness check — Phase A REQUIRED, full PAT-CFG-01 migration

| Check | Result |
|---|---|
| Frontend reads modern keys with legacy fallback | ❌ NO — direct legacy reads only |
| Typed-config layer (PAT-CFG-01) | ❌ NO — `process.env.X!` scattered across ~30 files |
| 66 direct `process.env.SUPABASE_*` reads | Confirmed |

Top offenders by read count:
- `app/api/messaging/announcements/competitors/drafts/route.ts` (4)
- `app/api/game-platform/dashboard/route.ts` (4)
- `lib/certificates/public.ts` (3)
- 27+ other files with 2 reads each

**Backend JWT verification:** N/A — no backend. Auth runs in Next.js middleware/route handlers via `@supabase/auth-helpers-nextjs`, which uses the standard Supabase verification path (no HS256 fallback to retire).

---

## Decision matrix

| Phase | Approach | Why |
|---|---|---|
| Phase A | **Full PAT-CFG-01** typed-config migration (Scott directive 2026-05-02) | Project is overdue on modernization. Centralizing now prevents 66 scattered call sites in future rotations. Two-month usage break = perfect window. |
| Phase B | Standard cutover. **No Railway** (no backend). Vercel-Supabase integration handles env sync (same as LearningNuggets). | Simpler than LN — only one host to coordinate. |
| Phase C | Standard cleanup. Includes bonus `POSTGRES_*` deletion if unused (verify in Phase A grep). | No worker service to clean up separately. |
| Phase D | OUT OF SCOPE for this plan. Roll up across all four projects in a single hardening sweep later. | Avoid scope creep. |
| Phase F | Single CLAUDE.md (coach-dashboared has one) + per-repo log entry in the runbook. | Smaller surface than LN's two-repo update. |

---

## Out of scope for this rotation (captured for follow-up)

1. **`@supabase/auth-helpers-nextjs` → `@supabase/ssr` migration.** Deprecated package; modern replacement uses `getClaims()` for JWKS-local verification. Substantial separate migration. Track as `2026-05-XX-coach-dashboared-supabase-ssr-migration.md`.
2. **Playwright auth-state history scrub.** Spawn-task already filed.
3. **Other secret rotations** (Stripe-equivalents, Monday, SendGrid, Zoho, etc.). Same Vercel-compromise blast radius; each needs its own rotation plan. Priority order TBD.

---

## Sign-off

- [x] Phase 0 inventory captured (this file)
- [x] Scott approved Phase A scope: full PAT-CFG-01 (2026-05-02)
- [x] Spawn-task filed for Playwright leak cleanup
- [x] Phase A code migration shipped — PR #94 merged at `d3cda0ec` (2026-05-02)
- [x] Phase B partial: keys generated, integration reconnected, modern keys live for server-side (2026-05-03)
- [x] auth-helpers-nextjs → ssr migration shipped — PR #96 merged at `c3e31044` (2026-05-03). 114 consumers (113 inventoried + 1 newly discovered in `components/`) migrated to a thin wrapper at `lib/supabase/{server,browser,middleware}.ts` over `@supabase/ssr`.
- [x] Phase C cleanup — legacy `anon` and `service_role` JWT keys disabled in Supabase dashboard (2026-05-03). Production verified up: `/` → 200, `/dashboard` → 307 redirect to login (middleware ran cleanly on modern publishable key).
- [x] Phase F partial: per-repo log entry in LearningNuggets runbook updated (2026-05-03)

---

## Post-rotation status (2026-05-03 — COMPLETE)

### What completed

- **Phase A** — server-side admin paths fully on modern `SUPABASE_SECRET_KEY` via `config.supabase.secretKey`. 32 consumer files migrated.
- **Phase B** — new `sb_secret_*` and `sb_publishable_*` keys generated. Native Integration "Connect Project" linked the cmcc-coach-dashboard product to the coach-dashboared Vercel project. 12 conflicting legacy env vars manually deleted from Vercel before reconnect.
- **auth-helpers → ssr migration** — PR #96 merged at `c3e31044`. 114 consumers migrated through a 3-file wrapper layer (`lib/supabase/{server,browser,middleware}.ts`) backed by `@supabase/ssr`. `@supabase/auth-helpers-nextjs` removed from `package.json`.
- **Phase C** — legacy `anon` and `service_role` JWT API keys **disabled** in Supabase. Browser auth now reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` via the wrapper layer. Server-side admin paths read `SUPABASE_SECRET_KEY` via `config.supabase.secretKey`.

### Current security posture

- ✅ Server-side admin paths: on modern `sb_secret_*` keys (`config.supabase.secretKey`)
- ✅ Browser-side auth: on modern `sb_publishable_*` keys (via `@/lib/supabase/browser` wrapper)
- ✅ Middleware: on modern `sb_publishable_*` keys (via `@/lib/supabase/middleware` wrapper)
- ✅ Legacy `anon` and `service_role` JWT API keys revoked in Supabase
- ⚠️ Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` env vars still set in Vercel (and `SUPABASE_JWT_SECRET`) — values are now invalid since the underlying keys are revoked, but the var names remain in Vercel env. Cleanup item: delete these var names in a future Vercel-env tidy pass. Not a current security risk — runtime now reads modern names exclusively.

### Local `.env` housekeeping

- Deduped 2026-05-03 (3 duplicates removed; LAST occurrence kept per parser convention)
- Backup at `.env.bak.before-dedupe`

### Vercel env state

- Native Integration's Connect Project re-synced both modern and legacy var names; POSTGRES_* re-injected
- Most secrets now Sensitive-flagged (won't show values via `vercel env pull` — security improvement)
- Validation pattern shifted from "pull and probe" to "redeploy and hit live endpoints"
