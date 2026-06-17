# Session bridge — coach-dashboared 2026-05-02 rotation

**Status:** 80% complete. Server-side admin paths fully on modern keys. Browser-side auth-helpers migration is the open follow-up — see [`2026-05-03-auth-helpers-to-ssr-migration.md`](./2026-05-03-auth-helpers-to-ssr-migration.md).

**Do NOT commit this file.** Bridge files are working-state artifacts between sessions; gitignored via `.env*` is unrelated, but per the standing rule (`feedback_bridge_files_local_only.md`) these stay local.

---

## What shipped this session

### Code (PR #94, merged at `d3cda0ec`)

- `lib/config/index.ts` + `lib/config/index.test.ts` — typed-config module (PAT-CFG-01) with `secretKey` resolver: `process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''`. Three vitest tests.
- 32 consumer files migrated from `process.env.SUPABASE_SERVICE_ROLE_KEY!` to `config.supabase.secretKey`.
- 1 page component (`app/dashboard/activity/page.tsx`) migrated to inline publishable-preferred fallback for `NEXT_PUBLIC_*`.
- `.env.example` introduced (project never had one).
- `.gitignore` cleanup — unblocked 4 pre-existing co-located test files in `lib/`; added `playwright/.auth/` defense-in-depth entry.

### Operational (Vercel + Supabase, no commit artifacts)

- Generated new `sb_secret_*` and `sb_publishable_*` keys in Supabase (`cmcc-coach-dashboard` project, ref `ejoplrkrqvddiklwsfoj`). Old pre-rotation `sb_*` keys deleted.
- Disconnected → reconnected the Vercel-Supabase Native Integration via "Connect Project" on the integration tile. The integration product was installed in the team but had no project link; that was the gating issue.
- Manually deleted 12 conflicting legacy env vars from Vercel (5 Supabase, 7 Postgres) before reconnect — required because the integration refused to push over existing names.
- Production redeployed via `vercel --prod`. Modern keys live in production.
- Local `.env` deduped (3 duplicates removed; LAST occurrence kept per parser convention).

### Docs (committed in PR #94)

- `docs/runbooks/2026-05-02-secret-inventory.md` — per-repo inventory + decision matrix.

### Docs (this session, in `docs/superpowers/plans/`)

- `2026-05-03-auth-helpers-to-ssr-migration.md` — the plan to finish the rotation.
- `2026-05-03-coach-dashboared-rotation-bridge.md` — this file.

---

## What's NOT done — and why

### Phase C cleanup (legacy revoke) is DEFERRED

Legacy `anon` and `service_role` JWT API keys are currently **re-enabled** in Supabase. They had to be — `@supabase/auth-helpers-nextjs` (the package this project uses for browser auth) hardcodes `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` reads in its package source. Disabling the legacy `anon` JWT broke all browser login flows.

**Recovery path:** the auth-helpers → ssr migration plan ([2026-05-03-auth-helpers-to-ssr-migration.md](./2026-05-03-auth-helpers-to-ssr-migration.md)). Once that ships, the new `@supabase/ssr` package reads modern keys via our wrapper layer, and the legacy keys can be revoked.

**Current security posture:**
- ✅ Server-side admin paths (32 consumer files) use modern `sb_secret_*` via `config.supabase.secretKey` — high-blast-radius surface IS rotated
- ⚠️ Browser-side auth still uses legacy `anon` JWT (re-enabled) via auth-helpers-nextjs — partial security win
- ⚠️ Legacy `service_role` JWT in Vercel env (now alongside the modern key) — unused by code, but its value is still active in Supabase as a fallback safety net

The high-priority win is real. The full revoke is gated on the migration.

### Other deferred items

- **Playwright auth-state history scrub** — spawn-task already filed earlier in session (chip in your UI). `playwright/.auth/admin.json` was committed Sept 2025 with a real Supabase session. Token expired long ago, but file should be scrubbed. Independent of this rotation.
- **`@supabase/auth-helpers-nextjs` migration** — covered by the new plan in this folder.
- **Other Vercel-compromise rotations** — Stripe-equivalents, Monday, SendGrid, Zoho, OpenAI, etc. (see inventory file). Each is its own follow-up plan.
- **263 pre-existing TypeScript errors** — technical debt, untouched by this rotation. Separate concern.

---

## Key facts to load into next session's context

### Project-specific

- **Repo:** `listentosee/coach-dashboared` (yes, the typo in the name is the actual repo name)
- **Local path:** `/Users/scottyoung/Cursor Projects/coach-dashboared`
- **Framework:** Next.js App Router, no separate backend
- **Test framework:** **vitest** (NOT jest — important for subagent prompts)
- **TypeScript path alias:** `@/*` → `./*` (root-relative, no `src/` prefix)
- **Vercel project ID:** `prj_9HfdEd9tIgsVn9DmlOd2LZ4CEpsf`
- **Supabase project:** `cmcc-coach-dashboard` (ref `ejoplrkrqvddiklwsfoj`)
- **Production domain:** `coach.cyber-guild.org`

### Vercel env state (post-rotation, Native Integration linked)

The integration pushes a hybrid set: both modern (`SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) AND legacy (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`) names alongside. POSTGRES_* re-injected. Most are flagged Sensitive — `vercel env pull` won't show their values, but build/runtime can read them.

The `NEXT_PUBLIC_SUPABASE_ANON_KEY` value is the LEGACY anon JWT (currently re-enabled). After the auth-helpers migration ships, the runtime won't read this name anymore — it'll read `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` via the wrapper.

### Local `.env` state

Deduped (was 73 lines / 46 var-lines / 43 unique → now 70 lines / 43 / 43). Backup at `.env.bak.before-dedupe` (gitignored, safe). Values match Vercel for everything except the Sensitive-flagged secrets (which can't be pulled from Vercel — no source of truth comparison available).

### What worked architecturally

- The PAT-CFG-01 typed config + resolver pattern (mirrored from LearningNuggets) — clean, future-proof.
- The wrapper-layer pattern (proven in LN's `lib/supabase/{server,browser,middleware}.ts`) — what we're applying here in the migration plan.

### What surprised us

- The Vercel-Supabase Native Integration had been INSTALLED but never CONNECTED to the coach-dashboared project. That's why no modern keys synced. Visible in the Supabase Integrations panel as a "Connect Project" button on the cmcc-coach-dashboard tile.
- Vercel's "Sensitive" flag silently excludes server-side secrets from `vercel env pull`. Validation must shift from "pull and probe" to "redeploy and hit live endpoints." This is GOOD — correct security default — just changes the verification pattern.
- Connect Project errors with conflict if existing env vars share names. Manual deletion needed first. Vercel CLI: `vercel env rm <var> <env> --yes` per env per var (no multi-env or all-env one-shot).

### What didn't work

- Disabling legacy keys broke browser auth. The auth-helpers-nextjs package can't be reconfigured to read modern key names without source-patching the package itself. Hence the migration plan.

---

## Pointers for next session

1. **Read the migration plan first:** `2026-05-03-auth-helpers-to-ssr-migration.md` (in this folder).
2. **Reference implementations:** `learningnuggets/src/lib/supabase/{browser,server,middleware}.ts` — copy the architectural pattern, adapt for coach-dashboared's path conventions (`@/lib/...` not `@/src/lib/...`).
3. **Don't re-disable legacy keys** until the migration ships. The current re-enabled state is the safety net.
4. **The 263 pre-existing TypeScript errors are not related** to anything we touched. Don't try to fix them; they predate this work.
5. **Spawn-task is filed** for the Playwright auth-state history scrub — independent priority.

## Carrying-forward checklist

When next session starts:

- [ ] `git log --oneline main..HEAD` — verify branch state matches expectation
- [ ] `npx vitest run lib/config/` — confirm Phase A tests still pass
- [ ] `npm run build` — confirm build is still clean (modulo 263 pre-existing TS errors)
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://coach.cyber-guild.org/` — confirm prod is alive
- [ ] Read the auth-helpers migration plan; pick a starting task (Task 1 if fresh start, or wherever the previous session left off)

---

## Cross-project state at session-end

| Project | Rotation status | Notes |
|---|---|---|
| `learningnuggets` | ✅ Complete (Phases 0–F shipped, 5 PRs merged) | Reference implementation. Some Phase D hardening tasks deferred (separate). |
| `coach-dashboared` | ⚠️ 80% (Phases 0, A, partial B; legacy re-enabled pending auth-helpers migration) | This bridge captures handoff. |
| `cybernuggets` | ⏭ Not started | Likely uses the same `@supabase/auth-helpers-nextjs` pattern based on Scott's earlier comment. Verify before starting. |
| `proficia` | ⏭ Not started | Same caveat. |

When picking up the next project (`cybernuggets` or `proficia`), the FIRST step is to grep their codebase for `@supabase/auth-helpers-nextjs` vs `@supabase/ssr`. If older package: plan their rotation to STOP at "modern keys live, legacy still enabled" and add the auth-helpers migration as a coupled follow-up. Don't repeat coach-dashboared's discovery the hard way.
