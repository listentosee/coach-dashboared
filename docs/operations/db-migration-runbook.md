# Database Change Runbook

This guide covers the lightweight workflow we use now that production (prod) and preview share the same Supabase project lineage. Keep these steps in source control so we can resume safely even after a long quiet period.

---

## 0. Prerequisites
- You have the connection info for both databases:
  - **Preview branch** (`devPreview`):
    - `DB_HOST`, `DB_NAME`, `DB_USER` (usually `postgres`), `DB_PASSWORD` or service-role key.
  - **Production** (main branch): same set of credentials.
- `psql` is installed locally.
- Every schema/data change is stored as a standalone SQL file in `supabase/migrations/` with a timestamp prefix.

---

## 1. Authoring a Change
1. Create a new migration file under `supabase/migrations/` (e.g. `20251020_add_program_track.sql`).
2. Write the SQL in **idempotent sections** where possible (`CREATE … IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, etc.).
3. Commit the file before you apply it anywhere, so history stays in sync.

---

## 2. Apply to Preview (`devPreview`)
1. Export the preview credentials as environment variables (or use a `.env.preview` file):
   ```bash
   export PREVIEW_DB_URL="postgresql://postgres:<password>@<host>/<database>"
   ```
2. Run the migration script against preview using `psql`:
   ```bash
   psql "$PREVIEW_DB_URL" -f supabase/migrations/20251020_add_program_track.sql
   ```
3. Smoke-test the application (feature branch / Vercel preview) against the preview Supabase branch.
4. If the change needs seed data, run it here as well.

---

## 3. Prepare for Production
1. Schedule a short maintenance window if the migration is intrusive.
2. Back up production first (either via the Supabase dashboard export or a manual `pg_dump`):
   ```bash
   pg_dump "$PROD_DB_URL" -f backups/20251020_prechange.sql
   ```
3. Double-check that the migration file in `supabase/migrations/` is identical to the one you tested.

---

## 4. Apply to Production
1. Export the production connection string:
   ```bash
   export PROD_DB_URL="postgresql://postgres:<password>@<host>/<database>"
   ```
2. Run the same SQL file with `psql`:
   ```bash
   psql "$PROD_DB_URL" -f supabase/migrations/20251020_add_program_track.sql
   ```
3. Verify key functionality in production (e.g., critical endpoints or dashboards).

---

## 5. Aftercare
- If anything fails, restore from the backup (`psql -f backups/<file>.sql`).
- Document any manual data fixes you made so they can be replayed if we rebuild environments.
- Remember to remove or rotate credentials used for local testing once you’re done.
- If the local Supabase containers misbehave after a pull/repair, run `supabase start` to restart the stack. This reloads `.env` values (including `sslmode=require`) and puts the local CLI in a known-good state.

---

## Quick Reference
- **Write once, run twice**: preview first, production last.
- Keep migrations small and reversible.
- Always back up prod before applying a new migration.
- Treat the Supabase repo and database as a single source of truth—when one drifts, pull or rebuild the baseline before branching.
- Keep application env vars in sync across Vercel and Supabase; previews need the same keys (or safe substitutes) as production.

---

## Supabase Branching & Baselines

### How branching actually works
- Supabase preview branches are database clones. Creating the branch **does not** scan your repo’s `supabase/migrations` folder or look at production’s `schema_migrations`.
- The branch starts from the clone’s current schema. When your PR workflow runs, it applies **only the new migration files** present in the repo. Each branch keeps its own `supabase_migrations.schema_migrations` table.
- If production has ad-hoc SQL changes that were never captured in migrations, they won’t appear in preview branches; you must pull them into a migration first.

### Keeping repo and DB in sync
1. **Avoid ad-hoc SQL.** If you hotfix through the Supabase Dashboard, follow up with `supabase db pull` and commit the generated migration so the repo matches prod.
2. **Baseline reset after drift:**  
   - Archive or delete existing files under `supabase/migrations/` (keep the folder).  
   - Run `supabase db pull --db-url "$PROD_DB_URL"` (or the URL of your canonical schema).  
   - Commit the new baseline migration and push.  
  After this, preview branches can spin up successfully because the repo now reflects the actual schema.
3. **Incremental migrations only** after the baseline—every change should go into `supabase/migrations/` and be applied to preview first, prod second.

### Preview branch failures & recovery
- If a preview build failed because migrations were out of sync, commit the baseline reset and either re-deploy the preview branch or close/reopen the PR so Supabase re-clones with the corrected history.
- Remember each branch’s `schema_migrations` table is isolated—keeping migrations consistent is the only way to guarantee branches all apply cleanly.

---

## Vercel & Supabase Preview Environments

When a pull request opens:
- **Vercel** builds a preview deployment using the `Preview` environment variables.
- **Supabase** provisions a preview branch DB (if branching is enabled) and applies migrations from this repo.

To ensure the preview “stack” works end-to-end:

### 1. Track required environment variables
- Maintain a checked-in `.env.example` (or `/docs/operations/env-reference.md`) listing required keys.
- Keep a `preview.env` (not committed) with safe non-prod defaults for quick testing.

### 2. Configure Vercel
- In **Vercel → Project → Settings → Environment Variables**:
  - **Production** mode: add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and any app-specific keys (`THIRD_PARTY_API_KEY`, etc.). Vercel automatically injects these into serverless functions and frontend builds.
  - **Preview** mode: mirror the same keys (or their preview equivalents). Vercel will expose them to every preview build (e.g., `SUPABASE_URL` pointing at the Supabase preview branch).
- Tip: when you baseline-reset migrations, double-check preview env vars still match the new database (URL/keys).

### 3. Configure Supabase
- **Built-ins** are automatically available: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
- For custom variables used in Edge Functions or RPCs:
  - Production: run `supabase secrets set --env-file .env` or use the **Dashboard → Functions → Secrets** UI.
  - Preview branches: replicate secrets. In CI, run `supabase secrets set` using values stored in GitHub Actions secrets (see example below).
- Example GitHub Actions snippet:
  ```yaml
  - name: Configure Supabase secrets
    run: |
      supabase secrets set \
        --db-url "$SUPABASE_DB_URL" \
        --env-file preview.env
    env:
      SUPABASE_DB_URL: ${{ secrets.PREVIEW_SUPABASE_DB_URL }}
  ```

### 4. Local development
- Use `.env.local` or `.env` to mirror the keys (use the same names as production). Run `supabase secrets set --env-file .env` to push them into the local Supabase stack if you run edge functions locally.

### 5. After updating secrets
- Redeploy Vercel (preview or production) so Next.js sees the new env values.
- Re-deploy Supabase Edge Functions:
  ```bash
  supabase functions deploy <function-name>
  ```
- Confirm preview deployments and the Supabase branch both succeed before merging to main.

### Summary workflow
1. Define keys in `.env.example`.
2. Prod changes → update Vercel Production env + Supabase project secrets.
3. Preview branch opened → CI copies secrets to Supabase preview; Vercel Preview env already has the matching keys.
4. Run migrations (preview DB first, production last) per the earlier steps.

That’s it—no Supabase CLI required, just versioned SQL and clear steps. Update this document whenever our process changes. 
