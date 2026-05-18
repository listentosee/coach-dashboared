# Analytics Non-CTF/CTF Split + Activity Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the admin Analytics "Challenge & Activity" section into separate non-CTF and CTF challenge-solved numbers (each with its own Outside-School-Day breakout), add a line for challenges solved by students who never entered a CTF, and add an org-wide Nov 2025–May 2026 monthly activity line chart.

**Architecture:** All coach-scoped numbers derive from the per-solve table `game_platform_challenge_solves` grouped by its `source` column (`'odl'` vs `'flash_ctf'`), reusing the page's existing paginated fetch. The org-wide time chart is fed by a new SQL aggregation RPC. The Pacific-time activity bucketing logic is extracted from the page into a pure, unit-tested helper because it now runs per-group.

**Tech Stack:** Next.js 15 App Router (server component page), TypeScript, Supabase (service-role client + SQL RPC), recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-18-analytics-ctf-split-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/analytics/activity-buckets.ts` | NEW — pure: `classifyPacificActivity(ts)` + `summarizeActivityBreakdown(timestamps)` |
| `lib/analytics/activity-buckets.test.ts` | NEW — Vitest unit tests for the helper |
| `components/dashboard/admin/challenge-activity-chart.tsx` | NEW — client recharts dual-line monthly chart |
| `supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql` | NEW — org-wide monthly aggregation RPC |
| `app/dashboard/admin-tools/analytics/page.tsx` | MODIFY — add `source` to solves fetch; compute per-group splits + #3 line via helper; restructure tiles; call RPC; render chart |
| `docs/source-of-truth/features/analytics-implementation.md` | MODIFY — SOT update (final task) |

---

## Task 1: Extract the activity-bucket helper (pure, TDD) — ✅ DONE _(commit: f4978c95; +DST/boundary hardening tests, 10/10 pass)_

The page currently inlines Pacific-time classification (`classifyPacificActivity`, `page.tsx:145-163`, plus formatter `page.tsx:39-44` and the `ActivityBucket` type `page.tsx:11`) and a combined accumulator block (`page.tsx:641-697`). We extract the classifier plus a new pure summarizer so it can run three times (non-CTF, CTF, and to replace the old combined card).

**Files:**
- Create: `lib/analytics/activity-buckets.ts`
- Test: `lib/analytics/activity-buckets.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/analytics/activity-buckets.test.ts
import { describe, it, expect } from 'vitest';
import { classifyPacificActivity, summarizeActivityBreakdown } from './activity-buckets';

describe('classifyPacificActivity', () => {
  it('returns unknown for null/invalid', () => {
    expect(classifyPacificActivity(null)).toBe('unknown');
    expect(classifyPacificActivity('not-a-date')).toBe('unknown');
  });

  it('classifies a weekday 12:00 PT as school_day', () => {
    // 2026-01-07 is a Wednesday. 20:00Z = 12:00 PST.
    expect(classifyPacificActivity('2026-01-07T20:00:00Z')).toBe('school_day');
  });

  it('classifies a weekday 07:00 PT as weekday_before_school', () => {
    // 15:00Z = 07:00 PST on a Wednesday.
    expect(classifyPacificActivity('2026-01-07T15:00:00Z')).toBe('weekday_before_school');
  });

  it('classifies a weekday 16:00 PT as weekday_after_school', () => {
    // 2026-01-08 Thursday, 00:00Z = 16:00 PST on 2026-01-07 Wed... use 2026-01-07T23:00Z = 15:00 PST.
    expect(classifyPacificActivity('2026-01-08T00:00:00Z')).toBe('weekday_after_school');
  });

  it('classifies a Saturday as weekend', () => {
    // 2026-01-10 is a Saturday. 20:00Z = 12:00 PST Sat.
    expect(classifyPacificActivity('2026-01-10T20:00:00Z')).toBe('weekend');
  });
});

describe('summarizeActivityBreakdown', () => {
  it('returns all-zero for empty input', () => {
    expect(summarizeActivityBreakdown([])).toEqual({
      total: 0, schoolDay: 0, outsideSchool: 0,
      before9: 0, after3: 0, weekend: 0, outsidePct: 0,
    });
  });

  it('ignores unknown timestamps in totals', () => {
    const r = summarizeActivityBreakdown([null, 'bad', '2026-01-07T20:00:00Z']);
    expect(r.total).toBe(1);
    expect(r.schoolDay).toBe(1);
    expect(r.outsideSchool).toBe(0);
    expect(r.outsidePct).toBe(0);
  });

  it('buckets outside-school events and rounds the pct', () => {
    const r = summarizeActivityBreakdown([
      '2026-01-07T20:00:00Z', // school_day  (Wed 12:00 PST)
      '2026-01-07T15:00:00Z', // before 9am  (Wed 07:00 PST)
      '2026-01-08T00:00:00Z', // after 3pm   (Wed 16:00 PST)
      '2026-01-10T20:00:00Z', // weekend     (Sat)
    ]);
    expect(r).toEqual({
      total: 4, schoolDay: 1, outsideSchool: 3,
      before9: 1, after3: 1, weekend: 1, outsidePct: 75,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/analytics/activity-buckets.test.ts`
Expected: FAIL — cannot find module `./activity-buckets`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/analytics/activity-buckets.ts
export type ActivityBucket =
  | 'school_day'
  | 'weekday_before_school'
  | 'weekday_after_school'
  | 'weekend'
  | 'unknown';

export interface ActivityBreakdown {
  total: number;
  schoolDay: number;
  outsideSchool: number;
  before9: number;
  after3: number;
  weekend: number;
  outsidePct: number;
}

const pacificActivityFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function classifyPacificActivity(timestamp?: string | null): ActivityBucket {
  if (!timestamp) return 'unknown';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const parts = pacificActivityFormatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hourPart = parts.find((part) => part.type === 'hour')?.value;
  const hour = hourPart ? Number.parseInt(hourPart, 10) : Number.NaN;

  if (!weekday || Number.isNaN(hour)) return 'unknown';

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  if (!isWeekday) return 'weekend';
  if (hour < 9) return 'weekday_before_school';
  if (hour >= 15) return 'weekday_after_school';
  return 'school_day';
}

export function summarizeActivityBreakdown(
  timestamps: Array<string | null | undefined>,
): ActivityBreakdown {
  const r: ActivityBreakdown = {
    total: 0, schoolDay: 0, outsideSchool: 0,
    before9: 0, after3: 0, weekend: 0, outsidePct: 0,
  };

  for (const ts of timestamps) {
    const bucket = classifyPacificActivity(ts);
    if (bucket === 'unknown') continue;
    r.total += 1;
    if (bucket === 'school_day') {
      r.schoolDay += 1;
      continue;
    }
    r.outsideSchool += 1;
    if (bucket === 'weekday_before_school') r.before9 += 1;
    if (bucket === 'weekday_after_school') r.after3 += 1;
    if (bucket === 'weekend') r.weekend += 1;
  }

  r.outsidePct = r.total === 0 ? 0 : Math.round((r.outsideSchool / r.total) * 100);
  return r;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/analytics/activity-buckets.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/activity-buckets.ts lib/analytics/activity-buckets.test.ts
git commit -m "feat(analytics): extract pure activity-bucket helper"
```

---

## Task 2: Add the monthly activity aggregation RPC

Org-wide, ignores the coach filter. Mirrors the established repo pattern in `supabase/migrations/20260204000000_dashboard_category_totals.sql` (`LANGUAGE sql`, granted to `authenticated` + `service_role`; the page calls it with the service-role client which bypasses RLS).

**Files:**
- Create: `supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql
-- Org-wide monthly non-CTF/CTF challenge-solve counts for the admin analytics chart.
CREATE OR REPLACE FUNCTION public.get_analytics_challenge_activity_monthly()
RETURNS TABLE (
  month date,
  source text,
  solves integer
)
LANGUAGE sql
AS $$
  SELECT
    (date_trunc('month', solved_at))::date AS month,
    source,
    COUNT(*)::int AS solves
  FROM public.game_platform_challenge_solves
  WHERE solved_at >= '2025-11-01T00:00:00Z'
    AND solved_at <  '2026-06-01T00:00:00Z'
  GROUP BY date_trunc('month', solved_at), source;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_challenge_activity_monthly() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_challenge_activity_monthly() TO service_role;
```

- [ ] **Step 2: Apply the migration via the Supabase MCP connector**

Use the Supabase MCP `apply_migration` tool (NOT manual SQL-editor entry, per the spec). Name: `analytics_challenge_activity_monthly`. Query: the full SQL body from Step 1.

- [ ] **Step 3: Verify the function exists**

Use the Supabase MCP `execute_sql` tool with:

```sql
SELECT proname FROM pg_proc WHERE proname = 'get_analytics_challenge_activity_monthly';
```
Expected: one row returned.

- [ ] **Step 4: Smoke-test the function returns rows**

Use the Supabase MCP `execute_sql` tool with:

```sql
SELECT * FROM public.get_analytics_challenge_activity_monthly() ORDER BY month, source;
```
Expected: 0+ rows shaped `{ month, source, solves }` with `source` in (`odl`, `flash_ctf`). Empty result is acceptable if no solves fall in the window; note it for the manual UI check.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql
git commit -m "feat(analytics): monthly challenge-activity aggregation RPC"
```

---

## Task 3: Build the activity line chart client component

**Files:**
- Create: `components/dashboard/admin/challenge-activity-chart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/admin/challenge-activity-chart.tsx
"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface ChallengeActivityPoint {
  month: string;   // e.g. "Nov 2025"
  nonCtf: number;
  ctf: number;
}

export function ChallengeActivityChart({ data }: { data: ChallengeActivityPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              color: '#e2e8f0',
            }}
          />
          <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="nonCtf"
            name="Non-CTF solves"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="ctf"
            name="CTF solves"
            stroke="#f472b6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the new component**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep challenge-activity-chart || echo "no errors in challenge-activity-chart"`
Expected: `no errors in challenge-activity-chart` (pre-existing unrelated TS errors elsewhere are expected per project notes — only this file must be clean).

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/admin/challenge-activity-chart.tsx
git commit -m "feat(analytics): challenge activity dual-line chart component"
```

---

## Task 4: Wire the page — add `source`, compute per-group splits + #3 line

Reuse the existing paginated solves fetch. `platformChallengeSolves` is declared at `app/dashboard/admin-tools/analytics/page.tsx:599-604` and fetched at `page.tsx:611-631` selecting `'synced_user_id, challenge_category, challenge_points, solved_at'`.

**Files:**
- Modify: `app/dashboard/admin-tools/analytics/page.tsx`

- [ ] **Step 1: Import the helper**

At the top of `page.tsx`, after the existing component imports (after `import { AnalyticsSharePanel } ...`, `page.tsx:7`), add:

```typescript
import { summarizeActivityBreakdown } from '@/lib/analytics/activity-buckets'
import { ChallengeActivityChart, ChallengeActivityPoint } from '@/components/dashboard/admin/challenge-activity-chart'
```

- [ ] **Step 2: Add `source` to the solves type and fetch**

In the `platformChallengeSolves` declaration (`page.tsx:599-604`), add the field so it reads:

```typescript
  let platformChallengeSolves: Array<{
    synced_user_id: string
    challenge_category: string | null
    challenge_points: number | null
    solved_at: string | null
    source: string | null
  }> = []
```

In the `fetchAllRowsByIds` call for solves (`page.tsx:613-619`), change the `columns` string to include `source`:

```typescript
        columns: 'synced_user_id, challenge_category, challenge_points, solved_at, source',
```

- [ ] **Step 3: Compute the coach-scoped split, per-group breakdowns, and #3 line**

Immediately AFTER the `totalChallengesSolved` accumulation loop ends (`page.tsx:714`, the line `}` closing `for (const competitor of competitorScope)` that increments `totalChallengesSolved`) and BEFORE `const outsideSchoolPct = ...` (`page.tsx:716`), insert:

```typescript
  // Non-CTF vs CTF split from the per-solve table (coach-scoped, source-grouped).
  const nonCtfSolves = platformChallengeSolves.filter((s) => s.source !== 'flash_ctf')
  const ctfSolves = platformChallengeSolves.filter((s) => s.source === 'flash_ctf')

  const nonCtfTotal = nonCtfSolves.length
  const ctfTotal = ctfSolves.length

  const nonCtfActivity = summarizeActivityBreakdown(nonCtfSolves.map((s) => s.solved_at))
  const ctfActivity = summarizeActivityBreakdown(ctfSolves.map((s) => s.solved_at))

  // #3: challenges solved by students who have never entered a CTF.
  const ctfParticipantSyncedIds = new Set(ctfSolves.map((s) => s.synced_user_id))
  const nonCtfSolvesByNonParticipants = nonCtfSolves.filter(
    (s) => !ctfParticipantSyncedIds.has(s.synced_user_id),
  ).length
```

Note: `source` rows are only `'odl'` or `'flash_ctf'` (DB CHECK constraint), so `source !== 'flash_ctf'` cleanly captures all non-CTF (including any null) as ODL.

This step is **additive only** — it does not remove any existing code, so the page still compiles and the old tiles still render after this task. Removal of the now-redundant producers happens atomically with their JSX consumers in Task 5.

- [ ] **Step 4: Typecheck the page touches**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin-tools/analytics/page.tsx" || echo "no new errors in analytics page"`
Expected: `no new errors in analytics page`. (Project has known pre-existing TS errors in unrelated files — only verify the new `nonCtfSolves`/`ctfSolves`/`nonCtfActivity`/`ctfActivity`/`nonCtfSolvesByNonParticipants` additions and the `source` field introduce no NEW errors.)

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/admin-tools/analytics/page.tsx
git commit -m "feat(analytics): compute non-CTF/CTF split + no-CTF-student line"
```

---

## Task 5: Wire the page — fetch chart data + render the new UI

**Files:**
- Modify: `app/dashboard/admin-tools/analytics/page.tsx`

- [ ] **Step 1: Fetch the org-wide monthly chart data**

After the team summary computation, immediately before the `return (` of the component (`page.tsx:847`), insert:

```typescript
  // Org-wide challenge activity (Nov 2025 – May 2026). Ignores the coach filter by design.
  const ACTIVITY_MONTHS: Array<{ key: string; label: string }> = [
    { key: '2025-11', label: 'Nov 2025' },
    { key: '2025-12', label: 'Dec 2025' },
    { key: '2026-01', label: 'Jan 2026' },
    { key: '2026-02', label: 'Feb 2026' },
    { key: '2026-03', label: 'Mar 2026' },
    { key: '2026-04', label: 'Apr 2026' },
    { key: '2026-05', label: 'May 2026' },
  ]
  const { data: activityRpcRows } = await serviceSupabase.rpc('get_analytics_challenge_activity_monthly')
  const activityByKey = new Map<string, { nonCtf: number; ctf: number }>()
  for (const m of ACTIVITY_MONTHS) activityByKey.set(m.key, { nonCtf: 0, ctf: 0 })
  for (const row of (activityRpcRows || []) as Array<{ month: string; source: string; solves: number }>) {
    const key = String(row.month).slice(0, 7) // 'YYYY-MM-DD' -> 'YYYY-MM'
    const bucket = activityByKey.get(key)
    if (!bucket) continue
    if (row.source === 'flash_ctf') bucket.ctf += Number(row.solves) || 0
    else bucket.nonCtf += Number(row.solves) || 0
  }
  const challengeActivityData: ChallengeActivityPoint[] = ACTIVITY_MONTHS.map((m) => ({
    month: m.label,
    nonCtf: activityByKey.get(m.key)?.nonCtf ?? 0,
    ctf: activityByKey.get(m.key)?.ctf ?? 0,
  }))
```

- [ ] **Step 2: Update the section intro blurb**

Replace the `<p>` at `page.tsx:996-998` (currently "Total challenges solved comes from synced aggregate stats. School-day activity is calculated...") with:

```tsx
            <p className="mt-1 text-sm text-meta-muted">
              Challenges solved are split into non-CTF (ODL) and Flash CTF from timestamped solve records. Each group&apos;s outside-school-day percentage uses that group&apos;s own solve count as the denominator (Pacific time, Monday–Friday, 9am–3pm is &ldquo;school day&rdquo;).
            </p>
```

- [ ] **Step 3: Replace the three-tile grid with the two split tiles + Flash CTF tile**

Replace the entire tile grid block — the `<div className="grid grid-cols-1 gap-4 xl:grid-cols-3">` and its three children (`page.tsx:1001-1055`, from `<div className="grid grid-cols-1 gap-4 xl:grid-cols-3">` through its matching closing `</div>` just before `<div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">`) with:

```tsx
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {([
              { title: 'Non-CTF Challenges Solved', total: nonCtfTotal, act: nonCtfActivity },
              { title: 'CTF Challenges Solved', total: ctfTotal, act: ctfActivity },
            ] as const).map((group) => (
              <div key={group.title} className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
                <div className="text-sm text-meta-muted">{group.title}</div>
                <div className="mt-2 text-4xl font-extrabold tracking-wider text-meta-light">{formatNumber(group.total)}</div>
                <div className="mt-4 text-sm text-meta-muted">Outside School Day</div>
                <div className="mt-1 flex items-end gap-3">
                  <div className="text-2xl font-bold tracking-wide text-meta-light">{formatNumber(group.act.outsideSchool)}</div>
                  <div className="pb-1 text-xs text-meta-muted">
                    {group.act.outsidePct}% of {formatNumber(group.act.total)} timestamped solves
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-meta-dark">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300"
                    style={{ width: `${group.act.outsidePct}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-meta-muted">
                  <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                    <div>Before 9am</div>
                    <div className="mt-1 text-sm font-semibold text-meta-light">{formatNumber(group.act.before9)}</div>
                  </div>
                  <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                    <div>After 3pm</div>
                    <div className="mt-1 text-sm font-semibold text-meta-light">{formatNumber(group.act.after3)}</div>
                  </div>
                  <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                    <div>Weekend</div>
                    <div className="mt-1 text-sm font-semibold text-meta-light">{formatNumber(group.act.weekend)}</div>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
              <div className="text-sm text-meta-muted">Flash CTF Participation</div>
              <div className="mt-2 text-4xl font-extrabold tracking-wider text-meta-light">
                {formatNumber(ctfParticipationRows.reduce((sum, row) => sum + row.value, 0))}
              </div>
              <div className="mt-2 text-sm text-meta-muted">
                Unique competitors with at least one Flash CTF event in the current scope.
              </div>
              <div className="mt-3 text-sm text-meta-muted">
                {formatNumber(platformFlashEvents.length)} total event {platformFlashEvents.length === 1 ? 'entry' : 'entries'}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded border border-meta-border/50 bg-meta-dark/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-meta-muted">Challenges solved by students who have never entered a CTF</div>
              <div className="text-2xl font-bold tracking-wide text-meta-light">{formatNumber(nonCtfSolvesByNonParticipants)}</div>
            </div>
          </div>
```

- [ ] **Step 4: Add the activity chart panel**

Immediately AFTER the closing `</div>` of the "Topic Clustering" panel (`page.tsx:1093`, the `</div>` that closes `<div className="mt-6 rounded border border-meta-border/50 bg-meta-dark/30 p-4">`) and BEFORE the section-closing `</div>`, insert:

```tsx
          <div className="mt-6 rounded border border-meta-border/50 bg-meta-dark/30 p-4">
            <div className="mb-3">
              <div className="text-sm text-meta-muted">Trend</div>
              <div className="text-base font-semibold text-meta-light">Challenge Activity Over Time (Nov 2025 – May 2026)</div>
              <p className="mt-1 text-sm text-meta-muted">
                Org-wide non-CTF vs Flash CTF solves by month. This chart always reflects all coaches and ignores the coach filter above.
              </p>
            </div>
            <ChallengeActivityChart data={challengeActivityData} />
          </div>
```

- [ ] **Step 5: Remove the now-dead producers (their JSX consumers are gone after Steps 2–4)**

The old single "Total Challenges Solved" / "Outside School Day Activity" tiles are gone, so their feeder code is now dead. In `app/dashboard/admin-tools/analytics/page.tsx`:

(a) Delete the `activityCounts` object and the `recordActivity` function (originally `page.tsx:641-662`).

(b) Delete the two `recordActivity(...)` call sites: the line `recordActivity(solve.solved_at)` inside the `for (const solve of platformChallengeSolves)` loop, and the line `recordActivity(event.started_at)` inside the `for (const event of platformFlashEvents)` loop. Keep everything else in those loops intact (`topicCounts`, `solveCountBySyncedUserId`, `ctfEntriesByDivision`, `ctfParticipantsByDivision`, `scopeBySyncedUserId`).

(c) Delete the now-unused `outsideSchoolPct` and `recordedActivityCount` derivation (originally `page.tsx:716-719`).

(d) Replace the `totalChallengesSolved` / `linkedPlatformCompetitors` block (originally `page.tsx:699-714`) — which fed only the removed tile — with the trimmed loop that preserves `divisionSolveTotals` (still consumed by "Challenges Solved by Division"):

```typescript
  for (const competitor of competitorScope) {
    const challengesSolved = statsByCompetitorId.get(competitor.competitorId)
      ?? (competitor.syncedUserId ? solveCountBySyncedUserId.get(competitor.syncedUserId) : undefined)
      ?? 0
    divisionSolveTotals.set(
      competitor.divisionLabel,
      (divisionSolveTotals.get(competitor.divisionLabel) ?? 0) + challengesSolved,
    )
  }
```

- [ ] **Step 6: Build to verify the whole page compiles and renders**

Run: `vercel build`
Expected: build succeeds (no errors referencing the analytics page, the new component, or removed symbols). Pre-existing unrelated warnings are acceptable.

- [ ] **Step 7: Manual verification**

Start the dev server (`npm run dev`), open `/dashboard/admin-tools/analytics`:
- Two tiles "Non-CTF Challenges Solved" and "CTF Challenges Solved", each with its own Outside-School-Day breakout (count, %, before-9am/after-3pm/weekend grid).
- The "Flash CTF Participation" tile still renders.
- The "students who have never entered a CTF" line shows a number.
- The "Challenge Activity Over Time" chart renders 7 monthly points with two lines.
- Apply a coach in the filter → the two tiles + the never-entered-CTF line re-scope; the chart stays the same (org-wide).
- Confirm in the browser console there are no React/runtime errors.

If the chart shows all zeros, cross-check against the Task 2 Step 4 smoke-test output to confirm whether that is real (no solves in window) vs a wiring bug.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/admin-tools/analytics/page.tsx
git commit -m "feat(analytics): render split tiles, no-CTF-student line, activity chart"
```

---

## Task 6: Source-of-truth documentation updates

**Why:** The preceding tasks change the admin analytics dashboard's behavior (challenge totals split by source, per-group school-day denominators, a new no-CTF-student metric, a new RPC, a new chart component). `docs/source-of-truth/features/analytics-implementation.md` is the canonical SOT doc for this surface and drifts the moment code lands without it.

**Files (primary target — REQUIRED):**
- Modify: `docs/source-of-truth/features/analytics-implementation.md`

- [ ] **Step 1: `docs/source-of-truth/features/analytics-implementation.md` updates (PRIMARY — REQUIRED)**

In the **Status** blockquote (line 3), replace the trailing sentence list ending `...challenge topic clustering, coach summary table with sortable competitor counts, team summary table by division, and a shareable analytics view via app/api/admin/analytics/share/.` so it also reads, appended before "Treat the implementation as the source of truth":

> The Challenge & Activity section splits challenge solves into non-CTF (ODL) and Flash CTF from the timestamped `game_platform_challenge_solves.source` column, each with its own outside-school-day breakout; adds a coach-scoped "challenges solved by students who have never entered a CTF" line; and renders an org-wide Nov 2025–May 2026 monthly activity line chart (non-CTF vs CTF) fed by the `get_analytics_challenge_activity_monthly()` RPC, which intentionally ignores the coach filter.

In the **Location → Components** list (`page.tsx:9-14` region of the doc), add a bullet:

```markdown
  - `challenge-activity-chart.tsx`
```

Add a new subsection immediately after the **Location** section:

```markdown
## Challenge & Activity data sources

- **Non-CTF vs CTF split, per-group outside-school-day, and the "never entered a CTF" line** are coach-scoped and derived in the page from `game_platform_challenge_solves`, grouped by `source` (`'odl'` = non-CTF, `'flash_ctf'` = CTF). Pacific-time bucketing lives in the pure helper `lib/analytics/activity-buckets.ts` (`classifyPacificActivity`, `summarizeActivityBreakdown`). A student "entered a CTF" iff they have ≥1 `flash_ctf` solve.
- **The monthly activity chart is org-wide and ignores the coach filter.** It is fed by the SQL RPC `get_analytics_challenge_activity_monthly()` (migration `supabase/migrations/20260518000000_analytics_challenge_activity_monthly.sql`), called with the service-role client. Window is fixed `[2025-11-01, 2026-06-01)`, bucketed by `date_trunc('month', solved_at)` and `source`.
- The split totals come from the per-solve table, so they may differ slightly from the stats-based "challenges_completed" number shown on the game-platform dashboard (#108). This is intentional and accepted.
```

- [ ] **Step 2: Sanity grep for stale references**

```bash
grep -rn "Total Challenges Solved\|aggregate stats" "docs/source-of-truth/" CLAUDE.md 2>/dev/null
```
Patch any line that still describes the Challenge & Activity section as a single stats-based "Total Challenges Solved" number to instead describe the non-CTF/CTF split (priority: `docs/source-of-truth/` first).

- [ ] **Step 3: Commit the doc updates**

```bash
git add "docs/source-of-truth/" CLAUDE.md
git commit -m "docs: SOT updates for analytics non-CTF/CTF split + activity chart"
```

---

## Execution Grouping / Handoff Notes

- Tasks 1–3 are independent and can be done in any order (pure helper, RPC migration, chart component).
- Task 4 depends on Task 1 (helper import). Task 5 depends on Tasks 2, 3, and 4.
- Task 6 (SOT docs) runs LAST, after code lands, so the docs describe merged behavior.
- Migration application (Task 2 Steps 2–4) uses the Supabase MCP connector tools, not manual SQL entry.
