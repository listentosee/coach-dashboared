# Admin Analytics Dashboard

> **Status (2026-05-03): IMPLEMENTED — and substantially expanded beyond this checklist.** The bulleted list below was the original feature request. The shipped dashboard at `app/dashboard/admin-tools/analytics/page.tsx` covers all of it and adds: school geographic distribution, demographic breakdowns, division/program-track enrollment mix, Flash CTF participation, school-day vs. outside-school activity buckets (Pacific time), challenge topic clustering, coach summary table with sortable competitor counts, team summary table by division, and a shareable analytics view via `app/api/admin/analytics/share/`. The Challenge & Activity section splits challenge solves into non-CTF (ODL) and Flash CTF from the timestamped `game_platform_challenge_solves.source` column, each with its own outside-school-day breakout; adds a coach-scoped "challenges solved by students who have never entered a CTF" line; and renders an org-wide Nov 2025–May 2026 monthly activity line chart (non-CTF vs CTF) fed by the `get_analytics_challenge_activity_monthly()` RPC, which intentionally ignores the coach filter. Treat the implementation as the source of truth; this doc is preserved for historical context.

## Location

- **Page**: `app/dashboard/admin-tools/analytics/page.tsx` (server component, ~1,100 lines)
- **API**: `app/api/admin/analytics/route.ts` (lighter JSON endpoint used by other surfaces) and `app/api/admin/analytics/share/route.ts` (shareable view)
- **Components** (under `components/dashboard/admin/`):
  - `demographic-charts.tsx`
  - `coach-summary-table.tsx`
  - `team-summary-table.tsx`
  - `school-distribution-map.tsx`
  - `analytics-share-panel.tsx`
  - `challenge-activity-chart.tsx`
- **Auth**: server-side `supabase.auth.getUser()` + `profiles.role = 'admin'` gate; service-role client (`getServiceRoleSupabaseClient()`) used for cross-coach aggregation.

## Challenge & Activity data sources

- **Non-CTF vs CTF split, per-group outside-school-day, and the "never entered a CTF" line** are coach-scoped and derived in the page from `game_platform_challenge_solves`, grouped by `source` (`'odl'` = non-CTF, `'flash_ctf'` = CTF). Pacific-time bucketing lives in the pure helper `lib/analytics/activity-buckets.ts` (`classifyPacificActivity`, `summarizeActivityBreakdown`). A student "entered a CTF" iff they have ≥1 `flash_ctf` solve.
- **The monthly activity chart is org-wide and ignores the coach filter.** It is fed by the SQL RPC `get_analytics_challenge_activity_monthly()` (migration `supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql`), called with the service-role client. Window is fixed `[2025-11-01, 2026-06-01)`, bucketed by `date_trunc('month', solved_at)` and `source`.
- The split totals come from the per-solve table, so they may differ slightly from the stats-based "challenges_completed" number shown on the game-platform dashboard (#108). This is intentional and accepted.

## Original Feature Request (historical)

This was inserted as a sub-menu item under the Admin Tool menu in admin context.

### Data sources
- Coaches (profiles)
- Competitors
- Teams
- Game Platform
- Release

### Analytics Dashboard View
- Number of Coaches (Select individual coach to filter board view or select all)
- Number of competitors
  - by status (pending, profile, in_the_game_not_compliant, complete)
- Release/Agreement status (not started, sent, complete (show digital and manual))
- Game platform activity
  - Competitors
  - Challenge participation
  - Flash CTF participation
  - Final competition participation and leader board — **PARKED**: deferred to a future feature add. Not shipped in the current dashboard; do not treat as a current-state gap.

### Coach Dashboard

#### Status Bar Changes
- Show numbers by status (pending, profile, in_the_game_not_compliant, complete) — replaced the center two blocks with this data view.

#### Competitor list modifications
- Show number of competitors in parenthesis for each Division tab. (Middle (6), High (30), etc.)

---

**Last verified:** 2026-05-03 against commit `e5b937b9`.
**Notes:** Verified analytics page + API route exist; implementation exceeds the original checklist. Final-competition leaderboard is **parked** for a future feature add — not a current-state gap.
