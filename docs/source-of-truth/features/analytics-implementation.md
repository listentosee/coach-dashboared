# Admin Analytics Dashboard

> **Status (2026-05-03): IMPLEMENTED — and substantially expanded beyond this checklist.** The bulleted list below was the original feature request. The shipped dashboard at `app/dashboard/admin-tools/analytics/page.tsx` covers all of it and adds: school geographic distribution, demographic breakdowns, division/program-track enrollment mix, Flash CTF participation, school-day vs. outside-school activity buckets (Pacific time), challenge topic clustering, coach summary table with sortable competitor counts, team summary table by division, and a shareable analytics view via `app/api/admin/analytics/share/`. Treat the implementation as the source of truth; this doc is preserved for historical context.

## Location

- **Page**: `app/dashboard/admin-tools/analytics/page.tsx` (server component, ~1,100 lines)
- **API**: `app/api/admin/analytics/route.ts` (lighter JSON endpoint used by other surfaces) and `app/api/admin/analytics/share/route.ts` (shareable view)
- **Components** (under `components/dashboard/admin/`):
  - `demographic-charts.tsx`
  - `coach-summary-table.tsx`
  - `team-summary-table.tsx`
  - `school-distribution-map.tsx`
  - `analytics-share-panel.tsx`
- **Auth**: server-side `supabase.auth.getUser()` + `profiles.role = 'admin'` gate; service-role client (`getServiceRoleSupabaseClient()`) used for cross-coach aggregation.

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
  - Final competition participation and leader board

### Coach Dashboard

#### Status Bar Changes
- Show numbers by status (pending, profile, in_the_game_not_compliant, complete) — replaced the center two blocks with this data view.

#### Competitor list modifications
- Show number of competitors in parenthesis for each Division tab. (Middle (6), High (30), etc.)

---

**Last verified:** 2026-05-03 against commit `e5b937b9`.
**Notes:** Verified analytics page + API route exist; implementation exceeds checklist. Final-competition leaderboard is the one bullet not directly mirrored in the dashboard (coverage moved to separate game-platform views) — left as historical for SME review.
