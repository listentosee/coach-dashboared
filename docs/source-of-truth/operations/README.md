# Operations

Runbooks for running, deploying, and maintaining the system.

## Files

| File | Purpose | Last verified |
|---|---|---|
| [db-migration-runbook.md](./db-migration-runbook.md) | Database migration workflow (preview + prod) | ✏️ 2026-05-03 — Clarified prod migrations run manually via Supabase Dashboard SQL Editor; modernized Vercel env-var list. |
| [github-workflow-guide.md](./github-workflow-guide.md) | Branching, PR, and preview-environment workflow | ✏️ 2026-05-03 — Local-Docker workflow flagged as documented-but-not-default; corrected merge-PR step (prod migrations are not auto-applied); modern keys. Sample `supabase status -o env` block redacted to placeholders. |
| [job-processor.md](./job-processor.md) | Background job processor — architecture, evolution, trigger/runner/queue/handlers | ✏️ 2026-05-03 — Comprehensive rewrite consolidating the prior `vercel-job-processing-setup.md` + `supabase-cron-spec.md`. Captures the 3-era evolution. |
| [job-queue-playbook.md](./job-queue-playbook.md) | Background job queue operations (admin-facing) | ✏️ 2026-05-03 — Added missing task types (`game_platform_flash_ctf_sync`, `team_image_*`); pointed to canonical registry files. |

## Archived from this bucket

- `supabase-cron-spec.md` (Era 2 pg_cron + Edge Function design, never fully shipped) → moved to [`docs/operations/historical-supabase-cron-spec.md`](../../operations/historical-supabase-cron-spec.md)
- `vercel-job-processing-setup.md` → renamed in place to `job-processor.md` and rewritten as the comprehensive architectural spec
