# Work Based Learning Hours — Design Spec

- **Date:** 2026-07-03
- **Status:** Approved (design); pending implementation plan
- **Owner:** Scott Young
- **Surface:** Coach Dashboard → Coach Tools → new "Work Based Learning Hours" report

## 1. Summary

Add a standard, coach-facing report — **Work Based Learning Hours** — that estimates how much time each of a coach's students has spent engaging the game platform, derived from challenge-solve timestamps (On-Demand practice) and Flash CTF event participation. The report is scoped to the signed-in coach's own students, reviewable online (mirroring the approved spreadsheet layout), and exportable to Excel.

The estimation algorithm is already validated: it was built and reconciled in the ad-hoc spreadsheet `reports/Competitor Engagement Time Report.xlsx` (2025-26 all-time for Riverside + San Bernardino reconciles to **2,343.1 h** = 1,338.1 h On-Demand + 1,005.0 h Flash CTF). This feature productizes that algorithm as an in-app report for every registered coach.

## 2. Goals / Non-goals

**Goals**
- New Coach Tools page at `/dashboard/work-based-learning-hours`, coach-scoped (own students only; admins may act-as a coach via the existing context cookie).
- Online view mirrors the spreadsheet Detail: per student, one row per On-Demand challenge type + one row per engaged Flash CTF event, plus a bold **TOTAL — all activity** row; grouped by coach; division tabs.
- **All roster students shown**, including those with 0 hours this period (0.0).
- **School-year period presets** (default *2025-26 School Year*; also *Fall 2025*, *Spring 2026*, *All time*).
- **Excel export** of the same data (the 4-sheet workbook: Summary, Detail, Data, Methodology), scoped to the coach + selected period/division.
- The export **always includes a Methodology tab** documenting the estimation method, assumptions, period, scope, and data source — required for **WBL submission legitimacy** (the exported file is what a coach hands to a district/WBL coordinator, so it must be self-explanatory and auditable on its own).

**Non-goals**
- No new sync/ingestion work; reads existing `game_platform_challenge_solves` and `game_platform_flash_ctf_events`.
- No changes to the CTF/ODL classification model (`source` column) or the sync pipeline.
- No precomputed/materialized hours table (compute-on-read).
- No per-competitor drill-down page beyond the report table (the existing report-card feature already covers deep per-student views).

## 3. Estimation algorithm (authoritative)

Computed per student, split into two segments. Assumptions are **program-chosen** and exposed as RPC parameters (defaults below).

**On-Demand (ODL)** — `source = 'odl'` solves only:
- Order a student's solves within a challenge **type** by `solved_at`; a gap `> 30 min` (`p_gap_minutes`) starts a new session.
- Session of ≥2 solves = `(last − first) + 10 min` (`p_tail_minutes`, credits work on the final solve).
- A lone solve (orphan) = `15 min` (`p_orphan_minutes`).
- Each challenge type → one row; minutes = sum of that type's sessions.

**Flash CTF** — from `game_platform_flash_ctf_events` (per student, per event):
- `challenges_solved > 0` → credit the **full event window**: `Inland Empire Mayors Cyber Cup 2026` = **210 min** (`p_ctf_mayors_minutes`, 3.5 h); every other (regular monthly) Flash CTF = **120 min** (`p_ctf_regular_minutes`, 2 h). The Mayors event is matched by exact `flash_ctf_name` (`p_mayors_name`).
- `challenges_solved = 0` → excluded (registered, no engagement).
- Each engaged event → one row.

**Per-student total** = sum of On-Demand type rows + Flash CTF event rows.

**Rationale for event-based CTF (not solve-gap):** CTF events are fixed-duration timed competitions; a student who ran out of time mid-event should get the event window, not the gap between two solves. `ended_at` is NULL in the data, so windows are applied by rule, not read from the table.

**Category normalization (ODL):** case/format variants merged (`Cryptography`/`cryptography`, `Operating Systems`/`operating_systems`, `Reverse Engineering`/`reverse_engineering`, `Binary Exploitation`/`binary_exploitation`, `OSINT`/`osint`, `Miscellaneous`/`miscellaneous`, `Forensics`/`forensics`); `Recon` → Reconnaissance; `Webex` → Web Exploitation. Canonical set: Cryptography, Reconnaissance, Forensics, OSINT, Social, Web Exploitation, Operating Systems, Reverse Engineering, Binary Exploitation, Miscellaneous, Other.

**Data-quality invariants (verified 2026-07-03):** `solved_at` and `challenge_category` have zero nulls; `game_platform_flash_ctf_events.challenges_solved` reconciles 1:1 with `source='flash_ctf'` solve counts (252 of 253 scoped competitors match exactly). Sessionize on `solved_at` (NOT `created_at`, which is sync-ingest time).

## 4. Periods

Boundaries applied as `[start, end)`; ODL filtered by `solved_at`, CTF filtered by `started_at`.

| Preset | Start | End |
|---|---|---|
| **2025-26 School Year** (default) | 2025-08-01 | 2026-08-01 |
| Fall 2025 | 2025-08-01 | 2026-01-01 |
| Spring 2026 | 2026-01-01 | 2026-08-01 |
| All time | −∞ | +∞ (NULL bounds) |

Presets live in a small config module (`lib/reports/wbl-periods.ts`) keyed by slug, so future school years are one entry. School year runs Aug 1 → Jul 31.

## 5. Architecture

Chosen approach: **SQL RPC does the aggregation; a thin TS helper groups/zero-fills; one shared loader feeds both the online JSON route and the Excel export** (so they can never diverge). This mirrors the existing `get_dashboard_category_totals` RPC + service-role-client pattern and keeps the validated algorithm in one place.

```
page.tsx ──fetch──▶ GET /api/coach-reports/work-based-learning-hours?period&division
                        │  auth(getUser) → coach context → roster (RLS user client)
                        │  → get_work_based_learning_hours(ids, window, params) (service-role client)
                        │  → group + zero-fill → JSON
Export button ─fetch─▶ GET .../work-based-learning-hours/export?period&division
                        │  same loadWblReport() → ExcelJS workbook (4 sheets) → attachment
```

### 5.1 SQL RPC
`supabase/migrations/<ts>_work_based_learning_hours_rpc.sql`

```
get_work_based_learning_hours(
  p_synced_user_ids text[],
  p_start timestamptz,            -- NULL = unbounded
  p_end   timestamptz,            -- NULL = unbounded
  p_gap_minutes int default 30,
  p_tail_minutes int default 10,
  p_orphan_minutes int default 15,
  p_ctf_regular_minutes int default 120,
  p_ctf_mayors_minutes int default 210,
  p_mayors_name text default 'Inland Empire Mayors Cyber Cup 2026'
) RETURNS TABLE (
  synced_user_id text,
  segment text,        -- 'On-Demand' | 'Flash CTF'
  activity text,       -- canonical challenge type OR event label
  solves int,
  sessions int,        -- ODL: # sessions; CTF: 1 (one event)
  minutes int
)
```
- `LANGUAGE sql STABLE`. Body = the validated window-function sessionization (ODL, `source='odl'`, date-bounded) `UNION ALL` the CTF event crediting (`challenges_solved > 0`, date-bounded on `started_at`).
- `GRANT EXECUTE ... TO authenticated, service_role;` — called from the API via the service-role stats client (same as `get_dashboard_category_totals`). Returns compact aggregated rows (≤ ~a few thousand for the whole program; per coach far fewer), so no PostgREST row-cap exposure.
- Migration file committed for record; **applied manually in Supabase SQL Editor** (per repo workflow — no CLI apply).

### 5.2 TS helper + loader
- `lib/integrations/game-platform/work-based-learning-hours.ts`
  - Types: `WblRow` (RPC row), `WblStudent` (`{ competitorId, name, division, odl: WblRow[], ctf: WblRow[], totalMinutes }`), `WblReport` (`{ period, coach, students, summary, params }` — `params` is the exact set of algorithm values used for this run, so the Methodology sheet and any audit can print them verbatim).
  - `fetchWblRows(serviceClient, syncedUserIds, period, params?) → WblRow[]` (calls RPC).
  - Pure functions (unit-tested): `groupWblRows(rows, roster) → WblStudent[]` (maps `synced_user_id`→competitor, groups, **zero-fills** every roster student), `summarizeWbl(students) → { totalMinutes, odlMinutes, ctfMinutes, studentCount, avgMinutes }`.
- `lib/reports/work-based-learning-hours.ts` — `loadWblReport({ userClient, serviceClient, coachContextId, periodSlug, division }) → WblReport`. Resolves roster via the RLS user client, calls the helper, applies division filter. **Single source of truth** for both routes.

### 5.3 API routes
- `app/api/coach-reports/work-based-learning-hours/route.ts` (GET): Zod-validate `period`, `division`; `getUser()`; resolve `coachContextId` (non-admin → `user.id`; admin → `admin_coach_id` cookie, else own); `loadWblReport(...)`; return JSON; write a FERPA-safe `activity_logs` row (counts only). 401/403 per report-card precedent.
- `app/api/coach-reports/work-based-learning-hours/export/route.ts` (GET): same auth + `loadWblReport(...)`; build workbook with **ExcelJS** (dynamic `import('exceljs')`); return `NextResponse(buffer)` with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and a sanitized `Content-Disposition` attachment (reuse the `contentDisposition()` helper pattern). Sheets (all four are mandatory in every export): **Summary by Student**, **Detail** (grouped, per-student TOTAL), **Data** (atomic + AutoFilter), **Methodology**. `export const maxDuration = 60`.

**Methodology sheet (required — submission legitimacy).** Included in every export. Contents:
- Report title, the coach + school, the selected period (label + explicit start/end dates), the generation date, and the data source (Coach Dashboard game-platform records).
- The full estimation method from §3 in plain language: ODL sessionization (30-min gap, session = (last−first)+10 min, orphan = 15 min, per challenge type) and Flash CTF event crediting (>0 solves → full window; Mayors Cup 3.5 h, regular 2 h; 0 solves excluded), plus the ODL category normalization.
- The **exact parameter values used for this export** (gap/tail/orphan/CTF-window minutes + Mayors event name), pulled from the RPC call — so the file is self-documenting even if defaults change later.
- Caveats (estimate from solve completion times, not start/idle time; CTF windows applied by rule since `ended_at` is not recorded; ODL sessions are per challenge type).

This sheet is generated by the shared `wbl-workbook.ts` builder from the same `WblReport` (period, coach, params), so it always reflects the actual export — no hand-maintained copy.

### 5.4 UI
- `app/dashboard/work-based-learning-hours/page.tsx` (`'use client'`): period `Select`, division `Tabs` (all/middle_school/high_school/college), summary cards (Total hrs, On-Demand vs Flash CTF, avg/student), the grouped detail table, **Export to Excel** button (`fetch` → `blob` → anchor download, per releases-page pattern), `ActingAsBanner` for admins, `useAdminCoachContext()` for coach scope.
- Components under `components/game-platform/wbl/`: `WblSummaryCards`, `WblDetailTable` (uses `components/ui/table`), `WblPeriodSelect`. Hours displayed to 0.1; the export includes both minutes and hours.
- Zero-activity students render a single **TOTAL — all activity = 0.0 h** row with a muted "no activity this period" note.
- Nav: add `<Link href="/dashboard/work-based-learning-hours">Work Based Learning Hours</Link>` to the Coach Tools group in `app/dashboard/layout.tsx`.

## 6. Security & FERPA
- Coaches see only their own students: middleware gates `/dashboard/*`; roster resolved through the RLS user client (`competitors.coach_id = auth.uid()`); API filters by `coachContextId`.
- Admin act-as uses the existing `admin_coach_id` cookie (`isUserAdmin` + `useAdminCoachContext`), same as the game-platform dashboard.
- The **service-role client is used only** to execute the aggregation RPC, and **only** with an explicit array of the resolved coach's own students' `synced_user_id`s — never a broad query.
- No student PII in logs; `activity_logs` records the action + period + student/hours counts only.

## 7. Testing
- **Unit (Vitest):** `groupWblRows` (grouping, zero-fill of roster, ODL+CTF merge, totals), `summarizeWbl` (ODL/CTF/total split, averages, empty roster), period-boundary resolution (`wbl-periods`), category normalization if done in TS. Fixtures modeled on real shapes.
- **Reconciliation:** a test asserting the RPC + helper reproduce the approved figures for a known student set (2025-26 all-time two-county total ≈ 2,343.1 h; ODL 1,338.1 h; CTF 1,005.0 h) — guards against algorithm drift.
- **E2E (Playwright):** page renders for a coach, division tabs + period select update the table, Export downloads a non-empty `.xlsx`.
- `pnpm lint` (zero warnings) and **`vercel build`** locally before PR.

## 8. Prior Art & Sanctioned Primitives
- **ExcelJS** (`exceljs@^4.4.0`, already a dependency; used in `app/dashboard/bulk-import/page.tsx`) — the sanctioned xlsx primitive; reuse `wb.xlsx.writeBuffer()` + attachment response (cf. certificate CSV export `app/api/admin/certificates/submissions/export/route.ts`, report-card PDF route).
- **Postgres window functions** (`lag(...) over`, `sum(...) over`) — the sanctioned primitive for sessionization; avoids re-implementing session/gap logic in JS.
- **Supabase SQL RPC + service-role stats client** — existing precedent `get_dashboard_category_totals` (`supabase/migrations/20260204000000_dashboard_category_totals.sql`) called from `app/api/game-platform/dashboard/route.ts`.
- **shadcn/ui** `Tabs`, `Table`, `Select`, `Card`; `useAdminCoachContext` (`lib/admin/useAdminCoachContext.ts`); `ActingAsBanner` — existing UI primitives; the report-card feature (`app/api/game-platform/report-card/[competitorId]`) is the page+API+permission precedent.
- **No new libraries introduced.**

## 9. File manifest
- `supabase/migrations/<ts>_work_based_learning_hours_rpc.sql` (new)
- `lib/integrations/game-platform/work-based-learning-hours.ts` (new) + `.test.ts`
- `lib/reports/work-based-learning-hours.ts` (new, shared loader)
- `lib/reports/wbl-periods.ts` (new) + `.test.ts`
- `lib/reports/wbl-workbook.ts` (new, ExcelJS builder) — shared by export route
- `app/api/coach-reports/work-based-learning-hours/route.ts` (new)
- `app/api/coach-reports/work-based-learning-hours/export/route.ts` (new)
- `app/dashboard/work-based-learning-hours/page.tsx` (new)
- `components/game-platform/wbl/*` (new)
- `app/dashboard/layout.tsx` (edit: nav link)
- `docs/source-of-truth/integrations/game-platform-integration.md` (edit: document the RPC + report)
- E2E spec under `tests/` (new)

## 10. Assumptions & open items
- **Hours display precision:** 0.1 h online; export carries minutes + hours. (No rounding to quarter-hours unless later required for official WBL submission.)
- **School-year boundary:** Aug 1 → Jul 31. Adjust in `wbl-periods.ts` if the program uses different term dates.
- **Assumption tuning:** the 30/+10/15/120/210 values are RPC parameters (defaults match the approved spreadsheet); not surfaced as UI controls initially (YAGNI) but changeable without a schema change.
