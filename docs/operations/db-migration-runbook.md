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

---

## Quick Reference
- **Write once, run twice**: preview first, production last.
- Keep migrations small and reversible.
- Always back up prod before applying a new migration.

That’s it—no Supabase CLI required, just versioned SQL and clear steps. Update this document whenever our process changes. 
