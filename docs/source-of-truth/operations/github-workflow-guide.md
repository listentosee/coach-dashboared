# GitHub Change Management Workflow Guide
## Production-Level Development with Preview Environments

> **Current practice (2026-05):** the team’s default workflow is feature branch → PR → Vercel preview deploy + Supabase preview DB branch → squash-merge to `main`. The local-Supabase-via-Docker workflow described under PREREQUISITES is documented for completeness but is **not** how schema changes ship today. Per `CLAUDE.md`, migration SQL is applied manually in the Supabase Dashboard SQL Editor for production; preview branches re-apply files in `supabase/migrations/` automatically when a PR is opened. See [`db-migration-runbook.md`](./db-migration-runbook.md) for the canonical migration workflow.

---

## PREREQUISITES

### A. Local Development Environment Setup (ONE-TIME)

**1. Install Supabase CLI**
```bash
npm install supabase --save-dev
```

**2. Initialize Supabase locally**
```bash
supabase init
```
Creates `./supabase` folder with config

**3. Link to your production project** (for pulling schema)
```bash
supabase link --project-ref your-project-id
```

**4. Pull current production schema**
```bash
supabase db pull
```
This creates migration files from your current production state

**5. Create `.env.local` file** (add to `.gitignore`)
Use the output from `supabase status -o env` to populate your local-dev env file. The block below shows the SHAPE of the output — actual values are well-known Supabase local-dev defaults and have been redacted to placeholders here so this doc doesn't trip GitHub secret scanning. The real values you'll see locally are the standard Supabase demo issuer JWTs and are safe ONLY against your local Docker stack — never paste them into any remote env.

```bash
supabase status -o env

Stopped services: [supabase_imgproxy_coach-dashboared supabase_pooler_coach-dashboared]
ANON_KEY="<local-dev anon JWT (issuer: supabase-demo)>"
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
GRAPHQL_URL="http://127.0.0.1:54321/graphql/v1"
INBUCKET_URL="http://127.0.0.1:54324"
JWT_SECRET="<local-dev jwt secret>"
MAILPIT_URL="http://127.0.0.1:54324"
MCP_URL="http://127.0.0.1:54321/mcp"
PUBLISHABLE_KEY="<sb_publishable_LOCAL-DEV-PLACEHOLDER>"
S3_PROTOCOL_ACCESS_KEY_ID="<local-dev S3 access key id>"
S3_PROTOCOL_ACCESS_KEY_SECRET="<local-dev S3 access key secret>"
S3_PROTOCOL_REGION="local"
SECRET_KEY="<sb_secret_LOCAL-DEV-PLACEHOLDER>"
SERVICE_ROLE_KEY="<local-dev service-role JWT (issuer: supabase-demo)>"
STORAGE_S3_URL="http://127.0.0.1:54321/storage/v1/s3"
STUDIO_URL="http://127.0.0.1:54323"
```

**6. Keep `.env` file for production** (committed to Git, used by Vercel)

> **Note (2026-05):** the legacy JWT keys `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` were revoked during the 2026-05-02 rotation. Use the modern names below.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
SUPABASE_SECRET_KEY=<sb_secret_…>
```

### B. GitHub/Vercel/Supabase Integrations
- Supabase GitHub integration enabled (for branching)
- Vercel connected to GitHub repo
- Vercel-Supabase integration enabled

---

## FEATURE DEVELOPMENT WORKFLOW

### 1. Start Local Supabase
```bash
supabase start
```
Spins up local Postgres in Docker. Copy the `anon key` and `API URL` to `.env.local` (first time only. See instructions above.)

### 2. Create Feature Branch
```bash
git checkout -b feature-branch-name
```

### 3. Develop Locally
```bash
npm run dev  # Points to localhost:54321 (local Supabase)
```
- Make code changes
- Make database schema changes via Supabase Studio (http://localhost:54323) or SQL
- Test everything locally against local DB with local seed data

### 4. Capture Database Migrations
```bash
supabase db diff -f migration_name
```
Creates migration file comparing local DB state to migration history

### 5. Commit and Push to GitHub
```bash
git add .
git commit -m "Description of changes"
git push origin feature-branch-name
```
- **Vercel** auto-deploys preview environment (initially points to production DB)

### 6. Create Pull Request
**In Cursor:** Source Control panel → "Create Pull Request" button

**What happens automatically:**
- **Supabase** creates preview database branch
- **Supabase** runs migrations from `./supabase/migrations/`
- **Supabase** seeds data from `./supabase/seed.sql`
- **Vercel** updates preview deployment environment variables to point to Supabase preview branch

### 7. Test in Preview Environment
- Click Vercel preview URL from GitHub PR
- Verify all functionality works with preview database
- Additional commits trigger new deployments + incremental migrations
- Repeat steps 3-5 as needed

### 8. Merge Pull Request
**In GitHub:** Use **"Squash and merge"** (project convention; keeps `main` history linear).

**What happens automatically:**
- **GitHub** squash-merges the feature branch into `main`.
- **Vercel** deploys `main` to production (`coach.cyber-guild.org`).
- **Supabase** preview branch is torn down.

**What does NOT happen automatically:**
- **Supabase does not auto-apply new migrations to production.** Per `CLAUDE.md`, migration SQL is run manually in the Supabase Dashboard SQL Editor against production after the PR merges (see [`db-migration-runbook.md`](./db-migration-runbook.md)). The migration files in `supabase/migrations/` are preserved as historical record and as the source of truth for preview-branch re-runs.

### 9. Update Local Repository
```bash
git checkout main
git pull origin main
supabase db reset  # Resets local DB to match new migration state
```

### 10. Stop Local Supabase (optional, when done for the day)
```bash
supabase stop
```

### 11. Clean Up
```bash
git branch -d feature-branch-name  # Delete local feature branch
```

---

## CRITICAL SAFEGUARDS

- **Never push directly to main branch** - always use feature branches
- **Never develop directly against production** - use local Supabase instance
- **Local DB is disposable** - `supabase db reset` wipes it, that's expected
- **Always test in preview before merging** - preview environment mirrors production
- **Monitor GitHub check runs** - watch for Supabase migration failures
- **Handle migration conflicts** - if multiple PRs open, ensure migration timestamps don't conflict
- **Environment variable separation:**
  - `.env.local` = local development (not committed)
  - `.env` = production (committed to Git, used by Vercel)

---

## FERPA COMPLIANCE NOTE

Preview branches use `./supabase/seed.sql` for test data. **Ensure this file contains only synthetic/anonymized data, never production student records.**

---

## KEY CONCEPTS

### What is a Pull Request?
A proposal and review interface to merge changes from a feature branch into main. Code exists on the feature branch whether or not a PR is created - the PR is the gatekeeper for merging to production.

### The Two Steps of a Pull Request
1. **Create PR** - Triggers preview environment creation and preview DB migrations
2. **Merge PR** - Triggers production deployment and production DB migrations

### Why Preview Environments?
They provide an identical production environment for testing without risking live data or user experience. Changes are validated with the actual production stack configuration before going live.

### Migration Flow
- **Local:** Changes made against local Docker Postgres
- **Capture:** `supabase db diff` creates migration files
- **Preview:** Supabase runs migrations when PR is created
- **Production:** Supabase runs migrations when PR is merged

---

## TROUBLESHOOTING

### Local Supabase won't start
- Check Docker is running
- Check ports 54321-54323 aren't in use
- Run `supabase stop` then `supabase start`

### Migration conflicts
- Ensure migration files have unique timestamps
- Later migrations must have later timestamps than production
- Resolve like Git conflicts: merge or rebase from production branch

### Preview deployment using wrong database
- Verify Vercel-Supabase integration is enabled
- Check that PR was created (not just pushed to branch)
- Verify Supabase GitHub check runs completed successfully

### Production deployment fails after merge
- Check Supabase migration logs in dashboard
- Verify migrations ran successfully during preview testing
- Check for migration timestamp conflicts with other merged PRs

---

**Last verified:** 2026-05-03 against commit `84d367e8`.
**Notes:** Added a top-of-doc clarifier that the local-Supabase-via-Docker workflow is documented but not the team’s default path; updated env-var examples to use the post-2026-05-02 modern Supabase key names (`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); corrected the "merge PR" section — production migrations are run manually in the Supabase Dashboard, not auto-applied; called out squash-merge as the project convention.

