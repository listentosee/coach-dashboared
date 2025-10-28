# GitHub Change Management Workflow Guide
## Production-Level Development with Preview Environments

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
Use the output from `supabase -status -o env` to get the values for the local environment variables.
```bash
supabase -status -o env

Stopped services: [supabase_imgproxy_coach-dashboared supabase_pooler_coach-dashboared]
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
GRAPHQL_URL="http://127.0.0.1:54321/graphql/v1"
INBUCKET_URL="http://127.0.0.1:54324"
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
MAILPIT_URL="http://127.0.0.1:54324"
MCP_URL="http://127.0.0.1:54321/mcp"
PUBLISHABLE_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
S3_PROTOCOL_ACCESS_KEY_ID="625729a08b95bf1b7ff351a663f3a23c"
S3_PROTOCOL_ACCESS_KEY_SECRET="850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907"
S3_PROTOCOL_REGION="local"
SECRET_KEY="sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
STORAGE_S3_URL="http://127.0.0.1:54321/storage/v1/s3"
STUDIO_URL="http://127.0.0.1:54323"
```

**6. Keep `.env` file for production** (committed to Git, used by Vercel)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-key>
SUPABASE_SERVICE_ROLE_KEY=<production-key>
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
**In GitHub:** Click "Merge pull request" button

**What happens automatically:**
- **GitHub** merges feature branch into main
- **Supabase** runs migrations against production database
- **Vercel** deploys main branch to production environment
- Supabase preview branch is deleted/paused

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
