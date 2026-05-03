# Operations

Runbooks for running, deploying, and maintaining the system.

## Files

| File | Purpose | Last verified |
|---|---|---|
| [db-migration-runbook.md](./db-migration-runbook.md) | Database migration workflow (preview + prod) | ✏️ 2026-05-03 — Clarified prod migrations run manually via Supabase Dashboard SQL Editor; modernized Vercel env-var list. |
| [github-workflow-guide.md](./github-workflow-guide.md) | Branching, PR, and preview-environment workflow | ✏️ 2026-05-03 — Local-Docker workflow flagged as documented-but-not-default; corrected merge-PR step (prod migrations are not auto-applied); modern keys. |
| [job-queue-playbook.md](./job-queue-playbook.md) | Background job queue operations | ✏️ 2026-05-03 — Added missing task types (`game_platform_flash_ctf_sync`, `team_image_*`); pointed to canonical registry files. |
| [supabase-cron-spec.md](./supabase-cron-spec.md) | Supabase Cron + Edge Function operations | ⚠️ 2026-05-03 — Largely historical: `pg_cron` is **not** installed in prod; recurring work is driven by `job_queue` rows woken by Vercel Cron. SME review needed to decide between major rewrite or archive. |
| [vercel-job-processing-setup.md](./vercel-job-processing-setup.md) | Vercel-side job-processing setup | ✏️ 2026-05-03 — Corrected the auth model (no `x-job-runner-secret` check); fixed lifecycle status name (`'running'`); replaced pg_cron-driven scheduling claims with the live `job_queue`-row model; modern keys. |
