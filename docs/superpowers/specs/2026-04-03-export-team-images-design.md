# Export Team Images Script

## Purpose

Standalone script to download all team images from Supabase Storage, organized into directories by coach name. Run once per year (or on demand) — not part of the app's runtime infrastructure.

## Script

**File:** `scripts/export-team-images.ts`
**Run:** `pnpm tsx scripts/export-team-images.ts`

## Behavior

1. **Connect** to Supabase using service role key from `.env.local` (bypasses RLS)
2. **Query** all teams where `image_url IS NOT NULL`, joined with `profiles` to get coach `display_name` and `email`
3. **Create** output directory `team-images-export/` in the project root
4. **For each team:**
   - Create coach subdirectory using sanitized display name (spaces/special chars replaced with dashes)
   - Download the image from `team-images` storage bucket using the `image_url` path
   - Save as `<Sanitized-Team-Name>.<original-extension>` inside the coach directory
5. **Log** progress per file and print a summary (total exported, skipped, failed)

## Output Structure

```
team-images-export/
  Jane-Smith/
    Cyber-Eagles.png
    Red-Team-Alpha.jpg
  John-Doe/
    Blue-Squad.png
```

## Data Query

```sql
SELECT
  t.id,
  t.name AS team_name,
  t.image_url,
  p.display_name AS coach_name,
  p.email AS coach_email
FROM teams t
JOIN profiles p ON t.coach_id = p.id
WHERE t.image_url IS NOT NULL
ORDER BY p.display_name, t.name;
```

## Filesystem Naming

- `sanitizeName(name)`: Replace any character that isn't alphanumeric, dash, or underscore with a dash. Collapse consecutive dashes. Trim leading/trailing dashes.
- Coach directory: `sanitizeName(coach_display_name)` — fall back to `sanitizeName(coach_email)` if display name is null, then `unknown-<coach_id_prefix>` as last resort.
- Team file: `sanitizeName(team_name).<ext>` where `<ext>` is derived from the `image_url` path (e.g., `.png`, `.jpg`). Default to `.png` if no extension found.

## Edge Cases

- **Duplicate team names under same coach:** Cannot happen (unique constraint `teams_coach_id_name_key`). No special handling needed.
- **Missing image in storage:** Log warning with team name and coach, increment skip counter, continue.
- **Coach with no display name or email:** Use `unknown-<first-8-chars-of-coach-id>` as directory name.
- **Output directory already exists:** Overwrite files (upsert behavior). Log that existing directory was found.

## Environment Requirements

- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Script exits with error if either is missing.

## Dependencies

No new packages. Uses:
- `dotenv/config` (already in project)
- `@supabase/supabase-js` (already in project)
- Node built-ins: `fs`, `path`

## Logging

- Per-file: `  [OK] Jane-Smith/Cyber-Eagles.png (45.2 KB)`
- Per-failure: `  [SKIP] team "Bad Team" (coach: Jane Smith) — image not found in storage`
- Summary: `Done: 47 exported, 2 skipped, 0 failed`

## Not In Scope

- No UI page or admin tool
- No zip packaging
- No upload or sync-back functionality
- Not added to package.json scripts (run directly with `pnpm tsx`)
