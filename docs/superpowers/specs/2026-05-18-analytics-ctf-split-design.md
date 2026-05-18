# Analytics — Split Challenges into Non-CTF / CTF + Activity Graph

**Date:** 2026-05-18
**Scope:** `/dashboard/admin-tools/analytics` only. The public shared/exported
report (`app/shared/analytics/[token]`, `lib/analytics/shared-report.ts`) is
explicitly out of scope and keeps its current single "Total Challenges Solved"
presentation.

## Problem

The "Challenge & Activity Analytics" section of the admin Operations Analytics
report shows a single "Total Challenges Solved" number and one combined
"Outside School Day Activity" card. The user wants challenges split into
non-CTF vs CTF, each with its own school-day breakout, a line for challenges
solved by students who never entered a CTF, and a time-series graph comparing
non-CTF vs CTF activity over the season.

## Data Model (confirmed)

- **`game_platform_challenge_solves`** — one row per solved challenge.
  Relevant columns: `synced_user_id`, `challenge_category`,
  `challenge_points`, `solved_at` (timestamptz), `source` CHECK
  (`'odl'` | `'flash_ctf'`). Both ODL and Flash CTF solves are ingested here
  (`lib/integrations/game-platform/service.ts` upserts `source: 'odl'` and
  `source: 'flash_ctf'`).
- **`game_platform_flash_ctf_events`** — event-level Flash CTF entries
  (`challenges_solved`, `started_at`).
- **`game_platform_stats`** — per-competitor aggregate
  (`challenges_completed` = count of ALL solve rows, `monthly_ctf_challenges`
  = sum of flash event `challenges_solved`).

**Decision:** the non-CTF/CTF split is driven by the per-solve table grouped
by `source`, NOT by the aggregate stats. This keeps the two headline numbers,
the per-group Outside-School-Day breakout, and the time graph all internally
consistent (one source). Consequence: the displayed totals may differ slightly
from the stats-based number shown on the game-platform dashboard (#108). This
is accepted.

## Requirements → Implementation

### 1 & 2. Two headline numbers, each with its own Outside-School-Day breakout

The page already fetches every solve for the coach-scoped synced user IDs via
`fetchAllRowsByIds` (chunked + range-paginated, so no PostgREST 1000-row cap).
Add `source` to that existing `.select()` (no new query).

Derive (all respect the existing coach filter, same as current behavior):

- `nonCtfSolves` = solves where `source === 'odl'`
- `ctfSolves` = solves where `source === 'flash_ctf'`
- `nonCtfTotal = nonCtfSolves.length`, `ctfTotal = ctfSolves.length`
- For each group, run its `solved_at` values through the existing Pacific-time
  classifier to produce `{ total, schoolDay, outsideSchool, before9, after3,
  weekend, outsidePct }`.

Extract the bucket logic (currently inline in `page.tsx` as
`classifyPacificActivity` + the `recordActivity`/`activityCounts` block) into
a pure, testable helper: **`lib/analytics/activity-buckets.ts`** exporting
`classifyPacificActivity(timestamp)` and
`summarizeActivityBreakdown(timestamps: (string|null)[])`. It now runs three
times (non-CTF, CTF, and could replace the existing combined usage), so
extraction is warranted.

### 3. Challenges solved by students who never entered a CTF

"Participated in a CTF" = the synced user has ≥1 solve with
`source === 'flash_ctf'`. Compute the set of participant `synced_user_id`s
from `ctfSolves`. The line value = count of `odl` solve rows whose
`synced_user_id` is NOT in that set (scoped to the current coach filter).
Rendered as a single stat line beneath the tiles.

### 4. Activity-over-time graph (Nov 2025 – May 2026)

Org-wide, ignores the coach filter, monthly buckets (7 points: Nov, Dec, Jan,
Feb, Mar, Apr, May). Two lines: non-CTF solves and CTF solves by `solved_at`.

Per the project rule "never sum/count from a `.select()` result; use SQL
aggregation," add a `SECURITY DEFINER` RPC:

```
analytics_challenge_activity_monthly()
  -> returns table(month date, source text, solves bigint)
  filter: solved_at >= '2025-11-01' and solved_at < '2026-06-01'
  group by date_trunc('month', solved_at), source
```

New migration file `supabase/migrations/<ts>_analytics_challenge_activity_monthly.sql`
(kept for record), applied via the Supabase MCP connector tool
(`apply_migration`) rather than manual SQL-editor entry. The page calls it
with the service-role client,
shapes the rows into 7 month buckets (missing months → 0 for both lines), and
passes them to a new client component.

## UI Changes (`app/dashboard/admin-tools/analytics/page.tsx`)

Within the existing "Challenge & Activity Analytics" card, replace the current
3-tile row (`Total Challenges Solved` / `Outside School Day Activity` /
`Flash CTF Participation`):

- **Tile 1 — "Non-CTF Challenges Solved"**: big count + an Outside-School-Day
  mini-panel for the ODL group (outside count, % of that group's timestamped
  solves, and the before-9am / after-3pm / weekend 3-cell grid), reusing the
  existing visual treatment of today's Outside School Day card.
- **Tile 2 — "CTF Challenges Solved"**: identical structure, scoped to
  `flash_ctf` solves.
- **Tile 3 — "Flash CTF Participation"**: unchanged.

Beneath the tiles: a single stat line **"Challenges solved by students who
have never entered a CTF: N"**.

The intro blurb is updated to describe the non-CTF vs CTF split and the
per-group school-day denominators.

"Challenges Solved by Division", "Flash CTF Participation by Division", and
"Topic Clustering" sub-sections are unchanged.

Below the section, a new full-width panel **"Challenge Activity Over Time
(Nov 2025 – May 2026)"** rendering a new client component
**`components/dashboard/admin/challenge-activity-chart.tsx`** — a recharts
`LineChart` (recharts is already this report's charting lib) with two series
(Non-CTF, CTF) over the 7 monthly points, plus a caption noting the graph is
org-wide and ignores the coach filter.

## Components / Files

| File | Change |
|---|---|
| `lib/analytics/activity-buckets.ts` | NEW — pure helpers `classifyPacificActivity`, `summarizeActivityBreakdown` |
| `lib/analytics/activity-buckets.test.ts` | NEW — unit tests for classification + summary |
| `components/dashboard/admin/challenge-activity-chart.tsx` | NEW — client recharts line chart |
| `app/dashboard/admin-tools/analytics/page.tsx` | Add `source` to solves select; compute per-group splits & #3 line using the new helper; restructure tiles; call the new RPC; render the chart |
| `supabase/migrations/<ts>_analytics_challenge_activity_monthly.sql` | NEW — `SECURITY DEFINER` monthly aggregation RPC |

## Testing

- Unit tests for `summarizeActivityBreakdown` (school-day vs before/after/
  weekend classification, unknown/null timestamps, % rounding, empty input).
- Manual: load `/dashboard/admin-tools/analytics`, verify the two tiles, the
  #3 line, and the chart render; toggle the coach filter and confirm the two
  tiles + #3 line re-scope while the chart stays org-wide; run
  `vercel build` locally before pushing.

## Out of Scope

- Public shared/exported analytics report parity.
- Reconciling the per-solve totals with the stats-based dashboard number.
- Changing existing Division / Topic / Flash-CTF-participation sub-sections.
