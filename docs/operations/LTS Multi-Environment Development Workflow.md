# Multi-Environment Development Workflow

**Version:** 2.1  
**Last Updated:** 2024-11-01  
**Status:** Production - Active Use

------------------------------------------------------------------------

## Overview & Architecture

### Three-Tier Structure

1.  **Persistent dev branch** (Supabase) ← Remote development environment with full Auth support
2.  **Ephemeral preview branches** (Supabase) ← Auto-created on PR open for testing
3.  **Production** (Supabase main) ← Live production environment

### Git Structure

- `main` branch → production Supabase project
- `develop` branch → persistent dev Supabase branch  
- Feature branches → ephemeral preview Supabase branches (auto-created on PR)

### Rationale

Docker local development cannot properly execute Supabase Auth flows. A persistent remote dev branch provides a full Supabase environment with working Auth while maintaining isolation from production. This approach enables safe, parallel development with automated preview environments for every pull request.

### What is a Pull Request?

A pull request (PR) is a proposal and review interface to merge changes from a feature branch into main. Code exists on the feature branch whether or not a PR is created - the PR is the gatekeeper for merging to production.

### The Two Steps of a Pull Request

1.  **Create PR** - Triggers preview environment creation and preview DB migrations
2.  **Merge PR** - Triggers production deployment and production DB migrations

### Why Preview Environments?

They provide an identical production environment for testing without risking live data or user experience. Changes are validated with the actual production stack configuration before going live.

------------------------------------------------------------------------

## Prerequisites & Initial Setup

### A. One-Time Local Environment Setup

**1. Install Supabase CLI**

``` bash
npm install supabase --save-dev
```

**2. Initialize Supabase in your project**

``` bash
supabase init
```

Creates `./supabase` folder with config.toml

**3. Connect to persistent dev branch**

**IMPORTANT:** The dev branch is **shared across the entire team**. Only one person (dev manager) should create it initially. All other team members connect to the existing dev branch.

**Option A: Connect to existing dev branch (most team members)**

Check if dev branch already exists:

``` bash
supabase branches list
# Look for a branch named "develop"
```

If it exists, get the branch project reference:

``` bash
supabase branches get develop
# Copy the "Project ref" from the output
```

**Option B: Create new dev branch (dev manager only, one-time)**

Only run this if the dev branch doesn't exist:

``` bash
supabase --experimental branches create --persistent
# Name it "develop" to match your git branch

# Then get the branch project reference
supabase branches list
# Copy the "BRANCH PROJECT ID" for your develop branch
```

**4. Link CLI to dev branch (NOT production)**

``` bash
supabase link --project-ref <dev-branch-project-id>
```

**Save this reference ID** - you'll need it for CLI guardrails and to share with team members.

**6. Pull current production schema to establish baseline**

``` bash
# Temporarily link to production
supabase link --project-ref <production-project-id>

# Pull schema as migration
supabase db pull

# Re-link to dev branch
supabase link --project-ref <dev-branch-project-id>

# Apply to dev branch
supabase db push
```

This creates migration files from your current production state and applies them to your dev branch.

### B. Environment Variables Configuration

**Create `.env.local` file** (add to `.gitignore`)

Get values from your dev branch:

``` bash
supabase branches get develop
```

Configure `.env.local` to point to **remote dev branch**:

``` bash
# .env.local (for remote dev branch - NOT localhost)
NEXT_PUBLIC_SUPABASE_URL=https://<dev-branch-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev-branch-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<dev-branch-service-role-key>

# Optional: Database connection strings if using Prisma/Drizzle
POSTGRES_URL=postgresql://postgres.[dev-branch-ref]:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
POSTGRES_URL_NON_POOLING=postgresql://postgres.[dev-branch-ref]:[password]@aws-0-us-west-1.compute.amazonaws.com:5432/postgres
```

**Keep `.env` file for production** (committed to Git, used by Vercel):

``` bash
# .env (production credentials)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
```

**Critical distinction:**
- `.env.local` = development (points to dev branch, not committed to Git)
- `.env` = production (points to production, committed to Git, used by Vercel)

### C. Configure config.toml

Edit `./supabase/config.toml`:

``` toml
# Base config for all environments
[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]

[db]
port = 54322
major_version = 15

[db.pooler]
enabled = true
port = 54329
pool_mode = "transaction"

[db.seed]
enabled = true
sql_paths = ['./supabase/seed.sql']

# Auth configuration
[auth]
site_url = "http://localhost:3000"
enable_signup = true

# Persistent dev branch config
[remotes.develop]
project_id = "dev-branch-ref-here"

[remotes.develop.db.seed]
enabled = true
sql_paths = ['./supabase/seed.sql']
```

### D. GitHub/Vercel/Supabase Integrations

**Enable Supabase GitHub Integration:**
1. Supabase Dashboard → Project Settings → Integrations → GitHub
2. Set production branch: `main`
3. Enable "Create preview branches"
4. Configure to track `./supabase` directory
5. Set "Supabase changes only" to avoid creating branches for non-DB changes

**Configure Vercel Integration:**
1. Install via Supabase Dashboard → Integrations → Vercel
2. **Critical:** Enable "Preview" checkbox to sync branch credentials
3. Vercel will receive environment variables per preview branch automatically

**What gets synced to Vercel:**
- `SUPABASE_URL` (branch-specific)
- `SUPABASE_ANON_KEY` (branch-specific)
- `SUPABASE_SERVICE_ROLE_KEY` (branch-specific)
- `POSTGRES_URL` (pooled connection)
- `POSTGRES_URL_NON_POOLING` (direct connection)

------------------------------------------------------------------------

## CLI Guardrails

### Problem

The Supabase CLI has no built-in protection against accidentally linking to production. Running `supabase db push` while linked to the wrong project could apply untested migrations to production.

### Solution 1: Pre-Commit Hook

Create `.git/hooks/pre-commit`:

``` bash
#!/bin/bash

# Check if .supabase/config.toml exists
if [ -f ".supabase/config.toml" ]; then
    LINKED_REF=$(grep 'project_id' .supabase/config.toml | head -1 | cut -d'"' -f2)
    EXPECTED_DEV_REF="your-dev-branch-project-id"
    
    if [ "$LINKED_REF" != "$EXPECTED_DEV_REF" ]; then
        echo "❌ ERROR: CLI is linked to wrong project!"
        echo "Expected: $EXPECTED_DEV_REF"
        echo "Got: $LINKED_REF"
        echo ""
        echo "Re-link to dev branch:"
        echo "  supabase link --project-ref $EXPECTED_DEV_REF"
        exit 1
    fi
fi
```

Make executable:

``` bash
chmod +x .git/hooks/pre-commit
```

**Pros:**
- Prevents commits if linked to wrong project
- No workflow changes needed

**Cons:**
- Doesn't catch `supabase db push` without commit
- Hook doesn't sync across team (not in repo)

### Solution 2: CLI Wrapper Script (Recommended)

Create `scripts/supa`:

``` bash
#!/bin/bash

EXPECTED_REF="your-dev-branch-ref"
CURRENT_REF=$(grep 'project_id' .supabase/config.toml 2>/dev/null | head -1 | cut -d'"' -f2)

if [ "$CURRENT_REF" != "$EXPECTED_REF" ]; then
    echo "⚠️  Wrong project detected! Re-linking to dev branch..."
    supabase link --project-ref "$EXPECTED_REF"
fi

# Pass all arguments to supabase
supabase "$@"
```

Make executable:

``` bash
chmod +x scripts/supa
```

**Usage:**

``` bash
./scripts/supa db push
./scripts/supa db diff -f new_migration
./scripts/supa migration list
```

**Pros:**
- Actively prevents wrong project usage
- Script commits to repo, shared across team
- Auto-corrects linking

**Cons:**
- Team must remember to use wrapper
- Could create alias: `alias supabase='./scripts/supa'`

### Solution 3: Environment Variable Check

Add to your shell profile (`.zshrc`, `.bashrc`):

``` bash
export SUPABASE_DEV_REF="your-dev-branch-ref"

# Override supabase command
supabase() {
    local current_ref=$(grep 'project_id' .supabase/config.toml 2>/dev/null | head -1 | cut -d'"' -f2)
    
    if [ -n "$SUPABASE_DEV_REF" ] && [ "$current_ref" != "$SUPABASE_DEV_REF" ]; then
        echo "⚠️  Relinking to dev branch..."
        command supabase link --project-ref "$SUPABASE_DEV_REF"
    fi
    
    command supabase "$@"
}
```

**Pros:**
- Transparent - no workflow changes
- Personal protection per developer

**Cons:**
- Each developer configures individually
- Doesn't prevent manual `supabase link` to production

### Recommended Approach

**Combination:**
1. Use **Solution 2** (wrapper script) for team-wide protection
2. Add **Solution 1** (pre-commit hook) as secondary safeguard
3. Document in team onboarding: "Always use `./scripts/supa` instead of `supabase`"

------------------------------------------------------------------------

## Feature Development Workflow

### Step 1: Create Feature Branch

``` bash
git checkout -b feature/branch-name
```

### Step 2: Develop Locally

``` bash
npm run dev  # Starts your app on localhost:3000
```

Then open your browser to `http://localhost:3000` as usual.

**What's different:** Your local frontend connects to the **remote dev branch database** (not local Docker). This happens automatically via `.env.local` credentials.

**Benefits:**
- Frontend runs locally (fast refresh, debugging)
- Database is remote (full Auth, shared state)
- No need to run `supabase start` or manage Docker containers
- **Shared database state across all team members** - coordinate schema changes

**Team Coordination:** Since the dev branch database is shared, communicate with teammates before making major schema changes. Use feature branches and preview environments for isolated testing.

### Step 3: Make Your Changes

- Code changes to application
- Database schema changes via Supabase Studio (dev branch dashboard)
- Test everything against dev branch database

**Dev Branch Studio URL:**
`https://supabase.com/dashboard/project/<dev-branch-ref>`

### Step 4: Capture Database Migrations

If you made schema changes, capture them as a migration:

``` bash
supabase db diff -f migration_name
```

This creates a migration file in `./supabase/migrations/` by comparing your dev branch database state to the migration history.

**Migration naming convention:**
- Use descriptive names: `add_user_profiles`, `update_rls_policies`
- Avoid generic names like `schema_update` or `changes`

**Regenerate TypeScript types:**
After schema changes, update your TypeScript types:

``` bash
supabase gen types typescript --linked > types/supabase.ts
```

Commit the updated types file with your migration:

``` bash
git add supabase/migrations/* types/supabase.ts
```

### Step 5: Test Migrations

Apply your migration to verify it works:

``` bash
supabase db push
```

This pushes your new migration to the dev branch database.

### Step 6: Commit and Push to GitHub

``` bash
git add .
git commit -m "feat: description of changes"
git push origin feature/branch-name
```

**What happens automatically:**
- **Vercel** auto-deploys preview environment (initially points to production DB)

### Step 8: Create Pull Request

**In Cursor:** Source Control panel → "Create Pull Request" button

**What happens automatically:**
- **Supabase** creates ephemeral preview database branch
- **Supabase** runs migrations from `./supabase/migrations/` sequentially
- **Supabase** seeds data from `./supabase/seed.sql`
- **Supabase** deploys edge functions
- **Vercel** receives preview branch credentials
- **Vercel** triggers redeployment with preview branch environment variables

**Timeline:** Typically completes in 2-3 minutes. Supabase may trigger a second Vercel deployment if environment variables weren't ready for the first build.

**PR Workflow:**

    GitHub PR: feature/branch-name → main
    ↓
    Supabase creates ephemeral preview branch
    ↓ 
    Deployment workflow runs:
      1. Clone repo
      2. Pull migrations from main
      3. Wait for services (health check)
      4. Configure (applies config.toml)
      5. Migrate (applies YOUR new migrations)
      6. Seed (runs seed.sql)
      7. Deploy (edge functions)
    ↓
    Vercel receives preview branch credentials
    ↓
    Vercel triggers redeployment with correct env vars

### Step 9: Test in Preview Environment

- Click Vercel preview URL from GitHub PR comment
- Verify all functionality works with preview database
- Check GitHub for Supabase deployment status
- Additional commits trigger new deployments + incremental migrations

**If you need to make changes:**
- Return to Step 3
- Make your changes
- Capture migrations (Step 4)
- Regenerate types (Step 5)
- Push to GitHub (Step 7)
- Preview automatically updates

### Step 10: Merge Pull Request

**In GitHub:** Click "Merge pull request" button

**What happens automatically:**

    Git merge: feature/branch-name → main
    ↓
    Supabase runs production deployment:
      1. Applies NEW migrations incrementally (not from scratch)
      2. Deploys edge functions
      3. Updates config from config.toml
      4. Does NOT run seed.sql (production safety)
    ↓
    Ephemeral preview branch auto-deletes
    ↓
    Vercel production deployment uses main credentials

**⚠️ Important:** Production migrations apply incrementally. If a migration has already been applied, it won't run again. This is tracked in `supabase_migrations.schema_migrations` table.

### Step 11: Update Local Repository

``` bash
git checkout main
git pull origin main
```

### Step 12: Clean Up

``` bash
git branch -d feature/branch-name  # Delete local feature branch
```

------------------------------------------------------------------------

## Handling Database Schema Changes

### Overview

Schema changes that remove columns, tables, or restructure data require special handling to avoid data loss. Simple `DROP COLUMN` migrations would delete data permanently.

### Strategy: Multi-Step Migrations

Break destructive changes into phases:
1. **Add** new structure (non-destructive)
2. **Transform** data from old to new
3. **Validate** data integrity
4. **Remove** old structure (destructive, but data preserved)

### Migration Flow

- **Dev Branch:** Changes made against remote persistent dev branch
- **Capture:** `supabase db diff` creates migration files
- **Preview:** Supabase runs migrations when PR is created
- **Production:** Supabase runs migrations when PR is merged

### Example 1: Combining Columns

**Scenario:** Merge `first_name` and `last_name` into `full_name`

``` sql
-- migrations/20241101120000_users_add_full_name.sql

-- Step 1: Add new column (non-destructive)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Step 2: Backfill data (transformation)
UPDATE users 
SET full_name = first_name || ' ' || last_name
WHERE full_name IS NULL;

-- Step 3: Make it required (now that data exists)
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;

-- Step 4: Drop old columns (destructive, but data preserved)
ALTER TABLE users DROP COLUMN IF EXISTS first_name;
ALTER TABLE users DROP COLUMN IF EXISTS last_name;
```

**Making it idempotent:**
- `IF NOT EXISTS` prevents errors on re-run
- `WHERE full_name IS NULL` prevents re-processing existing rows
- `IF EXISTS` on DROP won't fail if already dropped

### Example 2: Table Restructuring

**Scenario:** Move user preferences from multiple columns to JSONB

**Migration 1 - Add new structure:**

``` sql
-- 20241101120000_add_user_profiles.sql
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_metadata 
ON user_profiles USING gin(metadata);
```

**Migration 2 - Transform data:**

``` sql
-- 20241101120100_migrate_preferences.sql
INSERT INTO user_profiles (id, metadata)
SELECT 
    id,
    jsonb_build_object(
        'theme', theme_preference,
        'language', language_preference,
        'notifications', notification_settings
    ) as metadata
FROM users
ON CONFLICT (id) DO UPDATE
SET metadata = EXCLUDED.metadata;
```

**Migration 3 - Remove old structure:**

``` sql
-- 20241101120200_cleanup_preferences.sql
ALTER TABLE users DROP COLUMN IF EXISTS theme_preference;
ALTER TABLE users DROP COLUMN IF EXISTS language_preference;
ALTER TABLE users DROP COLUMN IF EXISTS notification_settings;
```

**Why split into 3 migrations?**
- Can deploy incrementally to production
- Can verify data between steps
- Reduces migration execution time per deployment
- Easier to rollback specific steps

### Example 3: Large Table Transformations

**Scenario:** Backfilling 1M+ rows

**Problem:** Single UPDATE locks table, times out, or runs out of memory.

**Solution:** Batch processing

``` sql
-- 20241101120000_backfill_user_slugs.sql

DO $$
DECLARE
    batch_size INT := 1000;
    rows_updated INT;
    total_updated INT := 0;
BEGIN
    LOOP
        -- Update in batches
        UPDATE users 
        SET slug = LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9]+', '-', 'g'))
        WHERE slug IS NULL
        AND id IN (
            SELECT id FROM users 
            WHERE slug IS NULL 
            LIMIT batch_size
        );
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        total_updated := total_updated + rows_updated;
        
        EXIT WHEN rows_updated = 0;
        
        RAISE NOTICE 'Updated % rows (total: %)', rows_updated, total_updated;
        
        -- Throttle to avoid load spikes
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    RAISE NOTICE 'Backfill complete: % total rows updated', total_updated;
END $$;
```

**Benefits:**
- Commits in batches (reduces lock time)
- Progress visibility via NOTICE
- Throttling prevents overwhelming database
- Can resume if interrupted

### Rollback Documentation

Since Supabase doesn't support down migrations, **document the reverse operation in comments:**

``` sql
-- migrations/20241101120000_users_add_full_name.sql

/*
ROLLBACK PROCEDURE (manual):
Run this SQL if you need to reverse this migration:

1. Add back old columns:
   ALTER TABLE users ADD COLUMN first_name TEXT;
   ALTER TABLE users ADD COLUMN last_name TEXT;

2. Split full_name back to components:
   UPDATE users SET 
     first_name = split_part(full_name, ' ', 1),
     last_name = split_part(full_name, ' ', 2);

3. Remove new column:
   ALTER TABLE users DROP COLUMN full_name;

TESTING:
- Verify on dev branch first
- Check row counts before/after
- Sample 100 random rows for data accuracy
*/

-- FORWARD MIGRATION:
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
-- ... rest of migration
```

### Best Practices

1.  **Test on dev branch first** with realistic data volumes
2.  **Use transactions carefully** - some DDL statements auto-commit
3.  **Add constraints AFTER data migration** - prevents blocking writes
4.  **Monitor execution time** - migrations \>30s may time out
5.  **Have rollback SQL ready** before production deployment

### Testing Checklist

Before merging destructive migrations:

- ☐ Migration runs successfully on dev branch
- ☐ Migration is idempotent (can run multiple times safely)
- ☐ Data transformation verified with sample queries
- ☐ Row counts match before/after transformation
- ☐ Application code handles both old and new schema (during transition)
- ☐ Rollback SQL documented and tested
- ☐ Team notified of breaking changes (if any)

------------------------------------------------------------------------

## Schema Sync from Production to Dev

### When to Sync

- Another developer merged schema changes to production
- Weekly maintenance (recommended cadence)
- Before starting major feature work

### Manual Pull Process

``` bash
# Temporarily link to production
supabase link --project-ref <production-project-id>

# Pull production schema as new migration
supabase db pull

# Review the generated migration file carefully
# Edit if needed to remove unwanted objects

# Re-link to dev branch
supabase link --project-ref <dev-branch-project-id>

# Apply to dev branch
supabase db push

# Commit the migration
git add supabase/migrations/*
git commit -m "sync: pull prod schema changes"
git push origin develop
```

### Important Notes

Always review pulled migrations. They may include:
- Supabase extension objects you don't need to track
- Tables from other systems
- Manual changes made through dashboard that should be reverted

------------------------------------------------------------------------

## GitHub Actions (Optional Validation)

Add additional validation after preview branch creation:

``` yaml
# .github/workflows/validate-migrations.yml
name: Validate Migrations

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      
      # Wait for Supabase preview branch to be ready
      - uses: fountainhead/action-wait-for-check@v1.2.0
        with:
          checkName: Supabase Preview
          ref: ${{ github.event.pull_request.head.sha }}
          token: ${{ secrets.GITHUB_TOKEN }}
      
      # Get preview branch credentials
      - name: Get preview branch creds
        run: |
          supabase --experimental branches get "${{ github.head_ref }}" -o env >> $GITHUB_ENV
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
      
      # Run custom validations
      - name: Validate schema
        run: |
          # Example: Check row counts
          psql "$POSTGRES_URL_NON_POOLING" -c "SELECT COUNT(*) FROM users;"
          
          # Example: Validate RLS policies exist
          psql "$POSTGRES_URL_NON_POOLING" -c "
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename NOT IN (
              SELECT tablename FROM pg_policies WHERE schemaname = 'public'
            );"
```

------------------------------------------------------------------------

## Critical Safeguards

### No Local Docker Required

You do **not** need to run `supabase start` or manage Docker containers. Your local frontend (`localhost:3000`) connects directly to the remote dev branch database via `.env.local` credentials.

### Never Push Directly to Main Branch

Always use feature branches. Direct pushes to main bypass preview testing and automated checks.

### Never Develop Against Production

Always use the remote dev branch. Production should only receive changes through merged pull requests.

### Dev Branch Database is Shared and Persistent

The dev branch database is **shared by the entire team** and maintains state. Coordinate with team members before making schema changes. Major changes should go through feature branches and preview environments first.

### Always Test in Preview Before Merging

Preview environment mirrors production configuration. This is your last safety check before changes go live.

### Monitor GitHub Check Runs

Watch for Supabase migration failures in PR checks. Failed migrations will prevent deployment.

### Handle Migration Conflicts

If multiple PRs are open simultaneously, ensure migration timestamps don't conflict. Later migrations must have later timestamps than earlier ones.

### Environment Variable Separation

- `.env.local` = dev branch (not committed to Git)
- `.env` = production (committed to Git, used by Vercel)

Never commit `.env.local` with dev credentials to the repository.

------------------------------------------------------------------------

## Key Concepts

### Shared Dev Branch vs Isolated Preview Branches

- **Dev branch:** Shared by entire team, persistent, used for daily development
- **Preview branches:** Isolated per PR, ephemeral, auto-created for testing

The shared dev branch enables team collaboration while preview branches provide isolation for feature testing.

### Branch Linking

When you `supabase link` to dev branch, ALL CLI commands target that branch until you re-link. The CLI guardrails prevent accidental production linking.

### Migration Order

Migrations apply sequentially by timestamp. After rebasing/merging, verify timestamps are still chronological.

### Incremental Migrations

Production migrations apply incrementally. If a migration has already been applied, it won't run again. This is tracked in the `supabase_migrations.schema_migrations` table.

### Seed Data Behavior

- **Persistent dev branch:** Requires `enabled = true` in config.toml
- **Ephemeral preview branches:** Runs seed.sql automatically
- **Production:** Explicitly ignores seed.sql for safety

### RLS Policies

Test Row Level Security policies thoroughly on dev branch. Auth works properly there, unlike local Docker environments.

### Branch Auto-Pause

Preview branches pause after inactivity. First connection after pause may timeout - retry once to wake it up.

### Migration Conflicts Between Developers

When multiple developers work on schemas simultaneously, migration timestamps may conflict. Resolve by renaming files with new timestamps after rebase.

------------------------------------------------------------------------

## Configuration Reference

### Directory Structure

    your-repo/
    ├── supabase/
    │   ├── config.toml           # Branch configurations
    │   ├── seed.sql              # Test data for dev/preview
    │   ├── migrations/
    │   │   └── 20241031_*.sql   # Timestamped migrations
    │   └── functions/            # Edge functions
    ├── .github/
    │   └── workflows/
    │       └── validate-migrations.yml
    ├── scripts/
    │   └── supa                  # CLI wrapper for guardrails
    ├── .env                      # Production (committed)
    └── .env.local               # Dev branch (gitignored)

### config.toml Complete Structure

``` toml
# Base config for all environments
[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]

[db]
port = 54322
major_version = 15

[db.pooler]
enabled = true
port = 54329
pool_mode = "transaction"

[db.seed]
enabled = true
sql_paths = ['./supabase/seed.sql']

# Auth configuration
[auth]
site_url = "http://localhost:3000"
enable_signup = true

# Persistent dev branch config
[remotes.develop]
project_id = "dev-branch-ref-here"

[remotes.develop.db.seed]
enabled = true
sql_paths = ['./supabase/seed.sql']

# No [remotes.main] needed - that's your linked production project
```

------------------------------------------------------------------------

## Troubleshooting

### Accidentally Ran `supabase start`

**Symptom:** Docker containers running, but app still connects to remote dev branch

**Solution:**
This is harmless but unnecessary. You don't need local Docker for this workflow.

``` bash
supabase stop  # Stop Docker containers
npm run dev    # Continue development as normal
```

Your `.env.local` points to the remote dev branch, so the app ignores local Docker anyway.

### CLI Linked to Wrong Project

**Symptom:** Commands affect unexpected database

**Solution:**

``` bash
# Check current link
cat .supabase/config.toml | grep project_id

# Re-link to dev branch
supabase link --project-ref <dev-branch-project-id>

# Or use the wrapper script
./scripts/supa db push  # Auto-corrects linking
```

### Migration Conflicts

**Symptom:** Migration timestamps out of order or duplicate

**Solution:**

``` bash
# List migrations
supabase migration list

# Rename migration file with new timestamp
mv supabase/migrations/20241101_old.sql supabase/migrations/20241102_new.sql

# Ensure later migrations have later timestamps than production
```

Resolve like Git conflicts: merge or rebase from production branch, then verify timestamp order.

### Preview Deployment Using Wrong Database

**Symptom:** Preview environment shows production data

**Solution:**
- Verify Vercel-Supabase integration "Preview" checkbox is enabled
- Check that PR was created (not just pushed to branch)
- Verify Supabase GitHub check runs completed successfully
- Wait for automatic redeployment (Supabase triggers this)

### Production Deployment Fails After Merge

**Symptom:** Migration errors in production after PR merge

**Solution:**
- Check Supabase migration logs in dashboard
- Verify migrations ran successfully during preview testing
- Check for migration timestamp conflicts with other merged PRs
- Review migration for idempotency issues

### Dev Branch Connection Issues

**Symptom:** Application can't connect to dev branch

**Solution:**

``` bash
# Verify .env.local points to correct dev branch
cat .env.local | grep SUPABASE_URL

# Get correct credentials
supabase branches get develop

# Update .env.local with correct values
```

### Migration Fails on Preview Branch

**Symptom:** Supabase check fails when PR is opened

**Solution:**
1. Check GitHub PR for detailed error message
2. Click "View logs" in Supabase deployment comment
3. Fix migration SQL
4. Push fix to feature branch
5. Preview automatically retries

### Seed Data Not Applying

**Symptom:** Preview branch database is empty

**Solution:**
- Verify `./supabase/seed.sql` exists
- Check config.toml has seed enabled for dev branch
- Review seed.sql for syntax errors
- Check Supabase deployment logs for seed errors

------------------------------------------------------------------------

## FERPA Compliance Note

Preview branches use `./supabase/seed.sql` for test data. **Ensure this file contains only synthetic/anonymized data, never production student records.**

All team members must understand:
- Seed data is visible in preview environments
- Preview URLs may be shared during code review
- Never copy production student data to seed files
- Use realistic but fictional data for testing

------------------------------------------------------------------------

## Advanced Topics

### Storage Buckets & File Uploads

**Bucket isolation per environment:**
- **Dev branch:** Has its own storage buckets (isolated from production)
- **Preview branches:** Each gets isolated storage buckets
- **Production:** Separate production storage

**File upload testing:**

``` typescript
// Use environment-aware bucket access
const { data, error } = await supabase
  .storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, file)
```

Storage buckets are automatically configured per branch by Supabase branching.

**Seed data with files:**
If your seed data references files, you have two options:
1. Upload sample files manually to dev branch storage via Supabase Studio
2. Create a seed script that uploads files programmatically

**FERPA Note:** Never upload real student files to dev/preview branches. Use placeholder images/documents.

### Secrets Management

**Problem:** Third-party API keys (Stripe, SendGrid, etc.) can't go in `.env` files or config.toml.

**Solution: Supabase Secrets (for Edge Functions)**

``` bash
# Set secrets for dev branch
supabase secrets set STRIPE_SECRET_KEY=sk_test_... --project-ref <dev-branch-ref>

# Set secrets for production
supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref <production-ref>
```

**For Next.js environment variables:**
- Dev branch: Set in Vercel project settings under "Preview" environment
- Production: Set in Vercel project settings under "Production" environment
- Preview branches automatically inherit "Preview" environment variables

**Critical:** Use different API keys for each environment (test keys for dev/preview, live keys for production).

### RLS Policy Testing

**Why critical:** FERPA compliance depends on proper Row Level Security.

**Testing strategy:**

1.  **Create test users with different roles in seed.sql:**

``` sql
-- seed.sql
INSERT INTO auth.users (id, email, role) VALUES
  ('test-admin-id', 'admin@test.com', 'admin'),
  ('test-coach-id', 'coach@test.com', 'coach'),
  ('test-student-id', 'student@test.com', 'student');
```

2.  **Test in dev branch:**

``` typescript
// Test as coach
const { data: coachData } = await supabase
  .auth.signInWithPassword({
    email: 'coach@test.com',
    password: 'test123'
  })

// Verify coach can only see their assigned students
const { data: students } = await supabase
  .from('students')
  .select('*')
```

3.  **Automated RLS tests in GitHub Actions:**
    Add to your validation workflow to verify policies work correctly in preview branches.

4.  **Common RLS patterns:**

``` sql
-- Coach can only see their students
CREATE POLICY "Coaches see own students"
ON students FOR SELECT
USING (auth.uid() = coach_id);

-- Students see only their own data
CREATE POLICY "Students see own data"
ON student_records FOR SELECT
USING (auth.uid() = student_id);
```

### Migration Conflicts Between PRs

**Scenario:** Two developers open PRs with conflicting migrations.

**Problem:**
- PR \#1: Creates migration `20241101120000_add_users.sql`
- PR \#2: Creates migration `20241101120000_add_posts.sql` (same timestamp!)

Both PRs work in isolation, but merging both causes conflicts.

**Prevention:**
1. Communicate schema changes in team channel before starting
2. Keep feature branches short-lived (\< 2 days)
3. Pull latest main frequently

**Resolution if it happens:**

``` bash
# After PR #1 merges, developer #2:
git checkout main
git pull origin main

# Return to feature branch
git checkout feature/branch-2
git rebase main

# Rename migration with new timestamp
mv supabase/migrations/20241101120000_add_posts.sql \
   supabase/migrations/20241101130000_add_posts.sql

# Retest migration
supabase db push

# Push updated branch
git add .
git commit -m "fix: update migration timestamp after rebase"
git push origin feature/branch-2 --force-with-lease
```

Preview branch will automatically rebuild with corrected timestamp.

### Dev Branch Lifecycle & Reset Strategy

**When dev branch gets "dirty":**
- Too much test data accumulates
- Schema has experimental changes not in migrations
- Database state doesn't match production + migrations

**Reset strategy (use sparingly):**

**Option 1: Soft reset (recommended)**

``` bash
# Delete all data but keep schema
supabase db reset --linked --db-url <dev-branch-connection-string>
```

**Option 2: Fresh pull from production**

``` bash
# Link to production
supabase link --project-ref <production-ref>

# Pull current schema
supabase db pull

# Re-link to dev
supabase link --project-ref <dev-branch-ref>

# Apply migrations
supabase db push
```

**Recommended cadence:** Monthly or when significant drift occurs.

**Team communication:** Notify team before resetting shared dev branch!

### Webhook & Integration Testing

**Problem:** External services (Stripe, webhooks) need to POST to your API, but preview URLs are unique per PR.

**Solutions:**

**Option 1: Webhook forwarding tools**

``` bash
# Use ngrok or similar to forward to preview URL
ngrok http https://your-preview-url.vercel.app

# Point webhook to ngrok URL
```

**Option 2: Webhook testing services**
- Use Stripe CLI for Stripe webhooks: `stripe listen --forward-to localhost:3000/api/webhooks`
- Use webhook.site for general webhook testing

**Option 3: Mock webhooks in tests**

``` typescript
// In your test suite
const mockWebhookPayload = {
  type: 'payment.succeeded',
  data: { /* ... */ }
}

await fetch('/api/webhooks/stripe', {
  method: 'POST',
  body: JSON.stringify(mockWebhookPayload)
})
```

**Best practice:** Test webhook handlers in dev branch first, then verify in preview, deploy to production.

### Future Considerations

**Edge Functions (when needed):**
- Deploy with migrations: `supabase functions deploy`
- Environment-specific configurations via secrets
- Test in preview branches before production

**Connection Pooling (for advanced use):**
- Use `POSTGRES_URL` for most queries (pooled)
- Use `POSTGRES_URL_NON_POOLING` for:
- Long-running transactions
- DDL migrations
- Tools that require direct connections (Prisma Migrate)

------------------------------------------------------------------------

## Quick Reference

### Common Commands

``` bash
# Link to dev branch
supabase link --project-ref <dev-branch-ref>

# Generate migration from Studio changes
supabase db diff -f migration_name

# Apply migrations to linked branch
supabase db push

# Pull production schema
supabase db pull

# Create new migration file
supabase migration new migration_name

# List all branches
supabase branches list

# Get branch details
supabase branches get <branch-name>

# View migration status
supabase migration list
```

### Critical URLs

- **Dev Branch Studio:** `https://supabase.com/dashboard/project/<dev-branch-ref>`
- **Dev Branch API:** `https://<dev-branch-ref>.supabase.co`
- **Branches Dashboard:** `https://supabase.com/dashboard/project/<main-ref>/branches`
- **Production Dashboard:** `https://supabase.com/dashboard/project/<production-ref>`

------------------------------------------------------------------------

## Next Steps

### Initial Setup Checklist

- ☐ Create persistent dev branch
- ☐ Configure config.toml with dev branch ref
- ☐ Set up `.env.local` pointing to dev branch
- ☐ Set up CLI guardrails (wrapper script + pre-commit hook)
- ☐ Enable Supabase GitHub integration
- ☐ Enable Vercel integration with Preview checkbox
- ☐ Pull production schema to dev branch
- ☐ Create and test seed.sql with synthetic data

### Team Onboarding

- ☐ Document and share dev branch project ref with all team members
- ☐ Document rollback procedures for existing migrations
- ☐ Test full workflow with sample PR
- ☐ Train team on new workflow
- ☐ Review FERPA compliance requirements
- ☐ Establish weekly schema sync routine
- ☐ Set up team communication channel for dev branch schema changes

------------------------------------------------------------------------

## Questions / Issues Log

*Use this section to track questions as you implement and refine the workflow.*

1.  \[Date\] Question/Issue description
    - Resolution: ...
    - Updated sections: ...
