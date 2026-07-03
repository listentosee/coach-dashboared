# Work Based Learning Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coach-scoped "Work Based Learning Hours" report to Coach Tools that estimates each student's platform engagement time (On-Demand sessionization + Flash CTF event windows), reviewable online and exportable to Excel with a Methodology tab.

**Architecture:** A Postgres RPC (`get_work_based_learning_hours`) does the sessionization + CTF-window aggregation and returns atomic per-(student, segment, activity) rows. Pure TS helpers group those rows onto the coach's roster (zero-filling students with no activity) and summarize them. One shared loader (`loadWblReport`) feeds both the online JSON route and the ExcelJS export route, so they can never diverge. A `'use client'` page renders the grouped table with period + division controls and an Excel download button.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres RPC + RLS + service-role client), TypeScript, ExcelJS (existing dep), Vitest, Playwright, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-03-work-based-learning-hours-design.md`

**SOT audit (done):** Canonical doc `docs/source-of-truth/integrations/game-platform-integration.md`. Invariants confirmed compatible — `source` ('odl'|'flash_ctf') is the ODL/CTF truth (§6); sessionize on `solved_at` not `created_at`; the large `game_platform_challenge_solves` table is read via the service-role stats client / RPC because of RLS + PostgREST's 1000-row cap. Flash CTF `ended_at` is NULL, so windows are rule-based. No conflicts.

**Conventions verified in-repo:**
- API auth: `createServerClient()` + `supabase.auth.getUser()`; admin via `isUserAdmin(supabase, user.id)` (`@/lib/utils/admin-check`); act-as coach via `admin_coach_id` cookie (`cookies()` from `next/headers`). Reference: `app/api/game-platform/dashboard/route.ts:47-88`.
- Service-role stats client: `getServiceRoleSupabaseClient()` from `@/lib/supabase/server`; `const statsClient = serviceClient ?? supabase`. RPC call: `statsClient.rpc('name', {...})`. Reference: same file `:60,136,176`.
- Synced-user-id resolution per competitor: `competitor.game_platform_id || game_platform_profiles.synced_user_id`. Reference: same file `:99-122`.
- Existing RPC precedent: `supabase/migrations/20260204000000_dashboard_category_totals.sql`.
- Excel: `exceljs@^4.4.0` (dynamic `import('exceljs')`), pattern in `app/dashboard/bulk-import/page.tsx:884-892`.
- File download response: `new NextResponse(body, { headers: { 'Content-Type', 'Content-Disposition', 'Cache-Control' } })`. Reference: `app/api/admin/certificates/submissions/export/route.ts:84-91`.
- Coach Tools nav sub-menu: `app/dashboard/layout.tsx:217-245` — `<Link href><Button variant="ghost" size="sm" className="...text-sm">Label</Button></Link>`.
- Unit tests co-located as `*.test.ts` (e.g., `lib/integrations/game-platform/challenge-breakdown.test.ts`); run with `pnpm test:unit`.

---

## File Structure

**Create:**
- `lib/reports/wbl-periods.ts` — school-year period presets + resolver. `.test.ts` alongside.
- `lib/integrations/game-platform/work-based-learning-hours.ts` — params, types, `fetchWblRows` (RPC caller), pure `groupWblRows` / `summarizeWbl` / `divisionLabel`. `.test.ts` alongside.
- `lib/reports/work-based-learning-hours.ts` — `loadWblReport` shared loader (roster resolution + helper orchestration).
- `lib/reports/wbl-workbook.ts` — `buildWblWorkbook` (ExcelJS, 4 sheets incl. Methodology). `.test.ts` alongside.
- `supabase/migrations/20260703000000_work_based_learning_hours_rpc.sql` — the RPC.
- `app/api/coach-reports/work-based-learning-hours/route.ts` — online JSON.
- `app/api/coach-reports/work-based-learning-hours/export/route.ts` — xlsx.
- `app/dashboard/work-based-learning-hours/page.tsx` — page.
- `components/game-platform/wbl/wbl-report-view.tsx` — client view (controls + table + export button).
- `components/game-platform/wbl/wbl-summary-cards.tsx`, `wbl-detail-table.tsx` — presentational.
- `e2e/work-based-learning-hours.spec.ts` — smoke test (place in the Playwright `testDir` from `playwright.config.ts`).

**Modify:**
- `app/dashboard/layout.tsx` — add the Coach Tools nav link.
- `docs/source-of-truth/integrations/game-platform-integration.md` — final SOT task.

---

## Task 1: Period presets (`wbl-periods.ts`)

> ✅ **Complete** — commit `622b4061`. Verified: 5/5 tests pass in isolation; exact exports + ISO bounds; pre-existing unrelated suite failures (mailer) noted, out of scope.

**Files:**
- Create: `lib/reports/wbl-periods.ts`
- Test: `lib/reports/wbl-periods.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/reports/wbl-periods.test.ts
import { describe, it, expect } from 'vitest';
import { resolveWblPeriod, DEFAULT_WBL_PERIOD_SLUG, WBL_PERIODS } from './wbl-periods';

describe('resolveWblPeriod', () => {
  it('defaults to the 2025-26 school year for unknown/empty input', () => {
    expect(resolveWblPeriod(undefined).slug).toBe(DEFAULT_WBL_PERIOD_SLUG);
    expect(resolveWblPeriod('nonsense').slug).toBe('2025-26');
  });
  it('2025-26 school year runs Aug 1 2025 to Aug 1 2026 (exclusive end)', () => {
    const p = resolveWblPeriod('2025-26');
    expect(p.start).toBe('2025-08-01T00:00:00.000Z');
    expect(p.end).toBe('2026-08-01T00:00:00.000Z');
  });
  it('all-time has null bounds', () => {
    const p = resolveWblPeriod('all');
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
  });
  it('exposes fall and spring terms', () => {
    expect(resolveWblPeriod('fall-2025').start).toBe('2025-08-01T00:00:00.000Z');
    expect(resolveWblPeriod('fall-2025').end).toBe('2026-01-01T00:00:00.000Z');
    expect(resolveWblPeriod('spring-2026').start).toBe('2026-01-01T00:00:00.000Z');
    expect(resolveWblPeriod('spring-2026').end).toBe('2026-08-01T00:00:00.000Z');
  });
  it('every preset has a unique slug and a label', () => {
    const slugs = WBL_PERIODS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    WBL_PERIODS.forEach((p) => expect(p.label.length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- lib/reports/wbl-periods.test.ts`
Expected: FAIL — cannot find module `./wbl-periods`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/reports/wbl-periods.ts
export type WblPeriodSlug = '2025-26' | 'fall-2025' | 'spring-2026' | 'all';

export interface WblPeriod {
  slug: WblPeriodSlug;
  label: string;
  /** ISO-8601 UTC, inclusive lower bound; null = unbounded. */
  start: string | null;
  /** ISO-8601 UTC, exclusive upper bound; null = unbounded. */
  end: string | null;
}

export const WBL_PERIODS: WblPeriod[] = [
  { slug: '2025-26', label: '2025–26 School Year', start: '2025-08-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' },
  { slug: 'fall-2025', label: 'Fall 2025', start: '2025-08-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z' },
  { slug: 'spring-2026', label: 'Spring 2026', start: '2026-01-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' },
  { slug: 'all', label: 'All time', start: null, end: null },
];

export const DEFAULT_WBL_PERIOD_SLUG: WblPeriodSlug = '2025-26';

export function resolveWblPeriod(slug: string | null | undefined): WblPeriod {
  const found = WBL_PERIODS.find((p) => p.slug === slug);
  return found ?? WBL_PERIODS.find((p) => p.slug === DEFAULT_WBL_PERIOD_SLUG)!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- lib/reports/wbl-periods.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reports/wbl-periods.ts lib/reports/wbl-periods.test.ts
git commit -m "feat(wbl): school-year period presets + resolver"
```

---

## Task 2: Types + pure helpers (`work-based-learning-hours.ts`)

> ✅ **Complete** — commit `125d08d8`. Verified: 7/7 tests pass in isolation; correct imports; zero-fill + off-roster handling + no DB/env in module.

**Files:**
- Create: `lib/integrations/game-platform/work-based-learning-hours.ts`
- Test: `lib/integrations/game-platform/work-based-learning-hours.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/integrations/game-platform/work-based-learning-hours.test.ts
import { describe, it, expect } from 'vitest';
import {
  groupWblRows, summarizeWbl, divisionLabel,
  type WblRpcRow, type RosterEntry,
} from './work-based-learning-hours';

const roster: RosterEntry[] = [
  { competitorId: 'c1', firstName: 'Ada', lastName: 'Byte', division: 'high_school', syncedUserId: 'u1' },
  { competitorId: 'c2', firstName: 'Ben', lastName: 'Cee', division: 'college', syncedUserId: 'u2' },
  { competitorId: 'c3', firstName: 'Cy', lastName: 'Dee', division: 'middle_school', syncedUserId: null },
];
const rows: WblRpcRow[] = [
  { synced_user_id: 'u1', segment: 'On-Demand', activity: 'Cryptography', solves: 5, sessions: 2, minutes: 70 },
  { synced_user_id: 'u1', segment: 'Flash CTF', activity: 'IE Mayors Cyber Cup 2026 (3.5 h)', solves: 12, sessions: 1, minutes: 210 },
  { synced_user_id: 'u2', segment: 'On-Demand', activity: 'Forensics', solves: 1, sessions: 1, minutes: 15 },
];

describe('groupWblRows', () => {
  it('maps rows onto roster students and splits ODL vs CTF', () => {
    const students = groupWblRows(rows, roster);
    const ada = students.find((s) => s.competitorId === 'c1')!;
    expect(ada.name).toBe('Ada Byte');
    expect(ada.odl).toHaveLength(1);
    expect(ada.ctf).toHaveLength(1);
    expect(ada.odlMinutes).toBe(70);
    expect(ada.ctfMinutes).toBe(210);
    expect(ada.totalMinutes).toBe(280);
  });
  it('zero-fills roster students with no activity', () => {
    const students = groupWblRows(rows, roster);
    const cy = students.find((s) => s.competitorId === 'c3')!;
    expect(cy.odl).toHaveLength(0);
    expect(cy.ctf).toHaveLength(0);
    expect(cy.totalMinutes).toBe(0);
  });
  it('returns one entry per roster student, ordered by last then first name', () => {
    const students = groupWblRows(rows, roster);
    expect(students.map((s) => s.competitorId)).toEqual(['c1', 'c2', 'c3']);
  });
  it('ignores RPC rows whose synced_user_id is not on the roster', () => {
    const extra = [...rows, { synced_user_id: 'ghost', segment: 'On-Demand', activity: 'Web Exploitation', solves: 9, sessions: 3, minutes: 999 } as WblRpcRow];
    const students = groupWblRows(extra, roster);
    expect(summarizeWbl(students).totalMinutes).toBe(280 + 15);
  });
});

describe('summarizeWbl', () => {
  it('splits ODL/CTF totals and averages over all students', () => {
    const s = summarizeWbl(groupWblRows(rows, roster));
    expect(s.studentCount).toBe(3);
    expect(s.odlMinutes).toBe(85);
    expect(s.ctfMinutes).toBe(210);
    expect(s.totalMinutes).toBe(295);
    expect(s.avgMinutes).toBeCloseTo(295 / 3, 5);
  });
  it('handles an empty roster without dividing by zero', () => {
    const s = summarizeWbl([]);
    expect(s).toEqual({ studentCount: 0, totalMinutes: 0, odlMinutes: 0, ctfMinutes: 0, avgMinutes: 0 });
  });
});

describe('divisionLabel', () => {
  it('humanizes division enums', () => {
    expect(divisionLabel('middle_school')).toBe('Middle School');
    expect(divisionLabel('high_school')).toBe('High School');
    expect(divisionLabel('college')).toBe('College');
    expect(divisionLabel(null)).toBe('Unassigned');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- lib/integrations/game-platform/work-based-learning-hours.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/integrations/game-platform/work-based-learning-hours.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WblPeriod } from '@/lib/reports/wbl-periods';

export interface WblParams {
  gapMinutes: number;
  tailMinutes: number;
  orphanMinutes: number;
  ctfRegularMinutes: number;
  ctfMayorsMinutes: number;
  mayorsName: string;
}

export const DEFAULT_WBL_PARAMS: WblParams = {
  gapMinutes: 30,
  tailMinutes: 10,
  orphanMinutes: 15,
  ctfRegularMinutes: 120,
  ctfMayorsMinutes: 210,
  mayorsName: 'Inland Empire Mayors Cyber Cup 2026',
};

export type WblSegment = 'On-Demand' | 'Flash CTF';

export interface WblRpcRow {
  synced_user_id: string;
  segment: WblSegment;
  activity: string;
  solves: number;
  sessions: number;
  minutes: number;
}

export interface WblActivityRow {
  segment: WblSegment;
  activity: string;
  solves: number;
  sessions: number;
  minutes: number;
}

export interface RosterEntry {
  competitorId: string;
  firstName: string;
  lastName: string;
  division: string | null;
  syncedUserId: string | null;
}

export interface WblStudent {
  competitorId: string;
  firstName: string;
  lastName: string;
  name: string;
  division: string | null;
  odl: WblActivityRow[];
  ctf: WblActivityRow[];
  odlMinutes: number;
  ctfMinutes: number;
  totalMinutes: number;
}

export interface WblSummary {
  studentCount: number;
  totalMinutes: number;
  odlMinutes: number;
  ctfMinutes: number;
  avgMinutes: number;
}

export function divisionLabel(division: string | null): string {
  switch (division) {
    case 'middle_school': return 'Middle School';
    case 'high_school': return 'High School';
    case 'college': return 'College';
    default: return 'Unassigned';
  }
}

function toActivityRow(r: WblRpcRow): WblActivityRow {
  return { segment: r.segment, activity: r.activity, solves: r.solves, sessions: r.sessions, minutes: r.minutes };
}

export function groupWblRows(rows: WblRpcRow[], roster: RosterEntry[]): WblStudent[] {
  const rowsBySynced = new Map<string, WblRpcRow[]>();
  for (const r of rows) {
    if (!rowsBySynced.has(r.synced_user_id)) rowsBySynced.set(r.synced_user_id, []);
    rowsBySynced.get(r.synced_user_id)!.push(r);
  }

  const students: WblStudent[] = roster.map((entry) => {
    const studentRows = entry.syncedUserId ? rowsBySynced.get(entry.syncedUserId) ?? [] : [];
    const odl = studentRows.filter((r) => r.segment === 'On-Demand')
      .sort((a, b) => a.activity.localeCompare(b.activity)).map(toActivityRow);
    const ctf = studentRows.filter((r) => r.segment === 'Flash CTF')
      .sort((a, b) => a.activity.localeCompare(b.activity)).map(toActivityRow);
    const odlMinutes = odl.reduce((n, r) => n + r.minutes, 0);
    const ctfMinutes = ctf.reduce((n, r) => n + r.minutes, 0);
    return {
      competitorId: entry.competitorId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      name: `${entry.firstName} ${entry.lastName}`.trim(),
      division: entry.division,
      odl, ctf, odlMinutes, ctfMinutes,
      totalMinutes: odlMinutes + ctfMinutes,
    };
  });

  return students.sort((a, b) =>
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export function summarizeWbl(students: WblStudent[]): WblSummary {
  const totalMinutes = students.reduce((n, s) => n + s.totalMinutes, 0);
  const odlMinutes = students.reduce((n, s) => n + s.odlMinutes, 0);
  const ctfMinutes = students.reduce((n, s) => n + s.ctfMinutes, 0);
  const studentCount = students.length;
  return {
    studentCount,
    totalMinutes,
    odlMinutes,
    ctfMinutes,
    avgMinutes: studentCount ? totalMinutes / studentCount : 0,
  };
}

/** Calls the SQL RPC. Pass a service-role client (RLS + row-cap on the solves table). */
export async function fetchWblRows(
  statsClient: SupabaseClient,
  syncedUserIds: string[],
  period: WblPeriod,
  params: WblParams = DEFAULT_WBL_PARAMS,
): Promise<WblRpcRow[]> {
  if (!syncedUserIds.length) return [];
  const { data, error } = await statsClient.rpc('get_work_based_learning_hours', {
    p_synced_user_ids: syncedUserIds,
    p_start: period.start,
    p_end: period.end,
    p_gap_minutes: params.gapMinutes,
    p_tail_minutes: params.tailMinutes,
    p_orphan_minutes: params.orphanMinutes,
    p_ctf_regular_minutes: params.ctfRegularMinutes,
    p_ctf_mayors_minutes: params.ctfMayorsMinutes,
    p_mayors_name: params.mayorsName,
  });
  if (error) throw error;
  return (data ?? []) as WblRpcRow[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- lib/integrations/game-platform/work-based-learning-hours.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/game-platform/work-based-learning-hours.ts lib/integrations/game-platform/work-based-learning-hours.test.ts
git commit -m "feat(wbl): types + pure grouping/summary helpers + RPC caller"
```

---

## Task 3: SQL RPC migration

> ⏳ **Migration written + committed; logic verified; DB apply pending (manual, per repo convention).**
> Reconciliation (2026-07-03, live data): On-Demand **80,287 min (1,338.1 h)** — byte-identical to the approved spreadsheet. Flash CTF **60,420 min (1,007.0 h)** and TOTAL **140,707 min (2,345.1 h)** — +120 min (one 2 h Flash CTF participation) above the July-2 snapshot because one participation synced in since; **not** an algorithm difference (both scoping semantics agree at 331 participations; 0 shared synced-ids). The RPC body matches an independent inline run exactly. Anchor gate for future runs: **ODL must equal 80,287 min**; CTF/total may drift upward as live syncs land.
> The function is NOT yet created in the DB (repo convention: user applies SQL in the Supabase SQL Editor). Live routes (T6/T7) and e2e (T9) return real data only after it is applied.

**Files:**
- Create: `supabase/migrations/20260703000000_work_based_learning_hours_rpc.sql`

> This migration is committed for record and **applied manually in the Supabase SQL Editor** (repo workflow — do NOT apply via CLI). Verification (Step 3) runs against a database that already has the function.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260703000000_work_based_learning_hours_rpc.sql
-- Work Based Learning Hours: per-(student, segment, activity) engagement-time estimate.
-- On-Demand: sessionize source='odl' solves per canonical challenge type
--   (gap > p_gap_minutes starts a new session; >=2 solves => (last-first)+p_tail_minutes; orphan => p_orphan_minutes).
-- Flash CTF: any solves (>0) in an event => full window (Mayors => p_ctf_mayors_minutes, else p_ctf_regular_minutes).
-- Windows are rule-based because game_platform_flash_ctf_events.ended_at is not recorded.
CREATE OR REPLACE FUNCTION public.get_work_based_learning_hours(
  p_synced_user_ids text[],
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_gap_minutes int DEFAULT 30,
  p_tail_minutes int DEFAULT 10,
  p_orphan_minutes int DEFAULT 15,
  p_ctf_regular_minutes int DEFAULT 120,
  p_ctf_mayors_minutes int DEFAULT 210,
  p_mayors_name text DEFAULT 'Inland Empire Mayors Cyber Cup 2026'
)
RETURNS TABLE (
  synced_user_id text,
  segment text,
  activity text,
  solves int,
  sessions int,
  minutes int
)
LANGUAGE sql
STABLE
AS $$
  WITH odl AS (
    SELECT s.synced_user_id,
      CASE lower(replace(s.challenge_category, ' ', '_'))
        WHEN 'recon' THEN 'Reconnaissance'
        WHEN 'reconnaissance' THEN 'Reconnaissance'
        WHEN 'webex' THEN 'Web Exploitation'
        WHEN 'web_exploitation' THEN 'Web Exploitation'
        WHEN 'binary_exploitation' THEN 'Binary Exploitation'
        WHEN 'cryptography' THEN 'Cryptography'
        WHEN 'forensics' THEN 'Forensics'
        WHEN 'miscellaneous' THEN 'Miscellaneous'
        WHEN 'operating_systems' THEN 'Operating Systems'
        WHEN 'osint' THEN 'OSINT'
        WHEN 'other' THEN 'Other'
        WHEN 'reverse_engineering' THEN 'Reverse Engineering'
        WHEN 'social' THEN 'Social'
        ELSE initcap(replace(s.challenge_category, '_', ' '))
      END AS category,
      s.solved_at
    FROM public.game_platform_challenge_solves s
    WHERE s.synced_user_id = ANY(p_synced_user_ids)
      AND s.source = 'odl'
      AND s.solved_at IS NOT NULL
      AND (p_start IS NULL OR s.solved_at >= p_start)
      AND (p_end IS NULL OR s.solved_at < p_end)
  ),
  flagged AS (
    SELECT o.synced_user_id, o.category, o.solved_at,
      CASE
        WHEN lag(o.solved_at) OVER w IS NULL
          OR o.solved_at - lag(o.solved_at) OVER w > make_interval(mins => p_gap_minutes)
        THEN 1 ELSE 0
      END AS new_sess
    FROM odl o
    WINDOW w AS (PARTITION BY o.synced_user_id, o.category ORDER BY o.solved_at)
  ),
  sessioned AS (
    SELECT f.synced_user_id, f.category, f.solved_at,
      sum(f.new_sess) OVER (PARTITION BY f.synced_user_id, f.category ORDER BY f.solved_at ROWS UNBOUNDED PRECEDING) AS sess_no
    FROM flagged f
  ),
  sess AS (
    SELECT x.synced_user_id, x.category, x.sess_no,
      count(*) AS n,
      CASE
        WHEN count(*) >= 2
          THEN EXTRACT(EPOCH FROM (max(x.solved_at) - min(x.solved_at))) / 60.0 + p_tail_minutes
        ELSE p_orphan_minutes
      END AS mins
    FROM sessioned x
    GROUP BY x.synced_user_id, x.category, x.sess_no
  ),
  odl_rows AS (
    SELECT s.synced_user_id,
      'On-Demand'::text AS segment,
      s.category AS activity,
      sum(s.n)::int AS solves,
      count(*)::int AS sessions,
      round(sum(s.mins))::int AS minutes
    FROM sess s
    GROUP BY s.synced_user_id, s.category
  ),
  ctf_rows AS (
    SELECT e.synced_user_id,
      'Flash CTF'::text AS segment,
      CASE
        WHEN e.flash_ctf_name = p_mayors_name THEN e.flash_ctf_name || ' (3.5 h)'
        ELSE regexp_replace(e.flash_ctf_name, '^MetaCTF ', '') || ' (2 h)'
      END AS activity,
      e.challenges_solved::int AS solves,
      1 AS sessions,
      CASE WHEN e.flash_ctf_name = p_mayors_name THEN p_ctf_mayors_minutes ELSE p_ctf_regular_minutes END AS minutes
    FROM public.game_platform_flash_ctf_events e
    WHERE e.synced_user_id = ANY(p_synced_user_ids)
      AND e.challenges_solved > 0
      AND (p_start IS NULL OR e.started_at >= p_start)
      AND (p_end IS NULL OR e.started_at < p_end)
  )
  SELECT * FROM odl_rows
  UNION ALL
  SELECT * FROM ctf_rows
$$;

GRANT EXECUTE ON FUNCTION public.get_work_based_learning_hours(text[], timestamptz, timestamptz, int, int, int, int, int, text)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply manually**

Open the Supabase SQL Editor for project `cmcc-coach-dashboard` (`ejoplrkrqvddiklwsfoj`) and run the migration file's contents. Confirm "Success. No rows returned".

- [ ] **Step 3: Verify reconciliation against the approved spreadsheet totals**

Run this in the SQL Editor. It scopes to the two-county roster (the approved report's population) and asserts the all-time totals reproduce the spreadsheet (ODL 80,287 min, CTF 60,300 min, total 140,587 min = 2,343.1 h).

```sql
WITH coach AS (
  SELECT p.id FROM profiles p WHERE p.role='coach' AND (
    p.school_geo->>'county' IN ('Riverside','San Bernardino')
    OR p.id IN ('4eb8afc9-505e-4a45-9bc9-0601911f7df7','d7dada89-d539-491d-8966-cbbffce3c4e6'))
),
ids AS (
  SELECT COALESCE(c.game_platform_id, gpp.synced_user_id) AS sid
  FROM competitors c
  LEFT JOIN game_platform_profiles gpp ON gpp.competitor_id = c.id
  WHERE c.coach_id IN (SELECT id FROM coach)
),
r AS (
  SELECT * FROM get_work_based_learning_hours(
    (SELECT array_agg(DISTINCT sid) FROM ids WHERE sid IS NOT NULL),
    NULL, NULL)
)
SELECT segment, sum(minutes) AS minutes, round(sum(minutes)/60.0,1) AS hours
FROM r GROUP BY segment
UNION ALL
SELECT 'TOTAL', sum(minutes), round(sum(minutes)/60.0,1) FROM r;
```

Expected rows: `On-Demand 80287 (1338.1)`, `Flash CTF 60300 (1005.0)`, `TOTAL 140587 (2343.1)`. If they differ, stop and reconcile the RPC before proceeding.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260703000000_work_based_learning_hours_rpc.sql
git commit -m "feat(wbl): get_work_based_learning_hours RPC (sessionization + CTF windows)"
```

---

## Task 4: Shared report loader (`loadWblReport`)

**Files:**
- Create: `lib/reports/work-based-learning-hours.ts`

> Not unit-tested in isolation (thin DB orchestration over already-tested pure helpers); covered by the RPC reconciliation (Task 3) and the e2e smoke test (Task 9). Keep it minimal.

- [ ] **Step 1: Write the loader**

```ts
// lib/reports/work-based-learning-hours.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveWblPeriod, type WblPeriod } from '@/lib/reports/wbl-periods';
import {
  fetchWblRows, groupWblRows, summarizeWbl,
  DEFAULT_WBL_PARAMS,
  type WblParams, type WblStudent, type WblSummary, type RosterEntry,
} from '@/lib/integrations/game-platform/work-based-learning-hours';

export interface WblReport {
  period: WblPeriod;
  params: WblParams;
  coach: { id: string; name: string | null; school: string | null } | null;
  division: string; // 'all' | division enum
  students: WblStudent[];
  summary: WblSummary;
  generatedAt: string; // ISO
}

export const WBL_DIVISION_FILTERS = ['all', 'middle_school', 'high_school', 'college'] as const;

/**
 * Resolve a coach's roster + engagement rows into a full report.
 * - userClient: RLS-scoped (auth'd) client used to read the coach's own roster.
 * - statsClient: service-role client used ONLY to run the aggregation RPC with the
 *   resolved roster's synced_user_ids (never a broad query).
 */
export async function loadWblReport(opts: {
  userClient: SupabaseClient;
  statsClient: SupabaseClient;
  coachContextId: string | null;
  periodSlug: string | null | undefined;
  division?: string;
  params?: WblParams;
  generatedAt?: string;
}): Promise<WblReport> {
  const period = resolveWblPeriod(opts.periodSlug);
  const params = opts.params ?? DEFAULT_WBL_PARAMS;
  const division = opts.division && (WBL_DIVISION_FILTERS as readonly string[]).includes(opts.division)
    ? opts.division : 'all';
  const generatedAt = opts.generatedAt ?? new Date().toISOString();

  const empty: WblReport = {
    period, params, coach: null, division,
    students: [], summary: summarizeWbl([]), generatedAt,
  };
  if (!opts.coachContextId) return empty;

  // Coach profile (name/school for header + Methodology).
  const { data: coachProfile } = await opts.userClient
    .from('profiles').select('id, full_name, school_name').eq('id', opts.coachContextId).single();

  // Roster (RLS-scoped). Division filter applied here.
  let rosterQuery = opts.userClient
    .from('competitors')
    .select('id, first_name, last_name, division, game_platform_id')
    .eq('coach_id', opts.coachContextId);
  if (division !== 'all') rosterQuery = rosterQuery.eq('division', division);
  const { data: competitors, error: rosterErr } = await rosterQuery;
  if (rosterErr) throw rosterErr;

  const competitorIds = (competitors ?? []).map((c) => c.id);

  // synced_user_id fallback via game_platform_profiles (same as the dashboard).
  const mappingBySid = new Map<string, string>();
  if (competitorIds.length) {
    const { data: mappings } = await opts.userClient
      .from('game_platform_profiles').select('competitor_id, synced_user_id')
      .in('competitor_id', competitorIds);
    for (const m of mappings ?? []) {
      if (m.competitor_id && m.synced_user_id) mappingBySid.set(m.competitor_id, m.synced_user_id);
    }
  }

  const roster: RosterEntry[] = (competitors ?? []).map((c) => ({
    competitorId: c.id,
    firstName: c.first_name ?? '',
    lastName: c.last_name ?? '',
    division: c.division ?? null,
    syncedUserId: (c.game_platform_id as string | null) || mappingBySid.get(c.id) || null,
  }));

  const syncedUserIds = Array.from(
    new Set(roster.map((r) => r.syncedUserId).filter((s): s is string => Boolean(s))),
  );

  const rows = await fetchWblRows(opts.statsClient, syncedUserIds, period, params);
  const students = groupWblRows(rows, roster);

  return {
    period, params, division, generatedAt,
    coach: coachProfile
      ? { id: coachProfile.id, name: coachProfile.full_name ?? null, school: coachProfile.school_name ?? null }
      : { id: opts.coachContextId, name: null, school: null },
    students,
    summary: summarizeWbl(students),
  };
}
```

- [ ] **Step 2: Typecheck compiles**

Run: `pnpm typecheck`
Expected: no NEW errors referencing `lib/reports/work-based-learning-hours.ts` (repo has pre-existing TS errors; `typecheck` exits 0 by design — scan output for this file only).

- [ ] **Step 3: Commit**

```bash
git add lib/reports/work-based-learning-hours.ts
git commit -m "feat(wbl): shared report loader (roster resolution + RPC orchestration)"
```

---

## Task 5: Excel workbook builder (`wbl-workbook.ts`)

**Files:**
- Create: `lib/reports/wbl-workbook.ts`
- Test: `lib/reports/wbl-workbook.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/reports/wbl-workbook.test.ts
import { describe, it, expect } from 'vitest';
import { Workbook } from 'exceljs';
import { buildWblWorkbook } from './wbl-workbook';
import { resolveWblPeriod } from '@/lib/reports/wbl-periods';
import { DEFAULT_WBL_PARAMS, groupWblRows, summarizeWbl, type WblRpcRow, type RosterEntry } from '@/lib/integrations/game-platform/work-based-learning-hours';
import type { WblReport } from '@/lib/reports/work-based-learning-hours';

function sampleReport(): WblReport {
  const roster: RosterEntry[] = [
    { competitorId: 'c1', firstName: 'Ada', lastName: 'Byte', division: 'high_school', syncedUserId: 'u1' },
    { competitorId: 'c2', firstName: 'Zed', lastName: 'Zero', division: 'college', syncedUserId: 'u2' },
  ];
  const rows: WblRpcRow[] = [
    { synced_user_id: 'u1', segment: 'On-Demand', activity: 'Cryptography', solves: 5, sessions: 2, minutes: 70 },
    { synced_user_id: 'u1', segment: 'Flash CTF', activity: 'IE Mayors Cyber Cup 2026 (3.5 h)', solves: 12, sessions: 1, minutes: 210 },
  ];
  const students = groupWblRows(rows, roster);
  return {
    period: resolveWblPeriod('2025-26'),
    params: DEFAULT_WBL_PARAMS,
    coach: { id: 'coach1', name: 'Coach Test', school: 'Test High' },
    division: 'all',
    students,
    summary: summarizeWbl(students),
    generatedAt: '2026-07-03T00:00:00.000Z',
  };
}

describe('buildWblWorkbook', () => {
  it('produces a workbook with the four required sheets including Methodology', async () => {
    const buf = await buildWblWorkbook(sampleReport());
    const wb = new Workbook();
    await wb.xlsx.load(buf as any);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(['Summary by Student', 'Detail', 'Data', 'Methodology']);
  });

  it('Methodology sheet states the exact parameter values used', async () => {
    const buf = await buildWblWorkbook(sampleReport());
    const wb = new Workbook();
    await wb.xlsx.load(buf as any);
    const text = (wb.getWorksheet('Methodology')!.getSheetValues() as any[])
      .flat().filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain('30');   // gap minutes
    expect(text).toContain('210');  // Mayors window minutes
    expect(text).toContain('Inland Empire Mayors Cyber Cup 2026');
  });

  it('zero-activity students still appear on the Detail sheet with a TOTAL row', async () => {
    const buf = await buildWblWorkbook(sampleReport());
    const wb = new Workbook();
    await wb.xlsx.load(buf as any);
    const detail = (wb.getWorksheet('Detail')!.getSheetValues() as any[])
      .flat().filter((v) => typeof v === 'string');
    expect(detail).toContain('Zed Zero');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- lib/reports/wbl-workbook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

```ts
// lib/reports/wbl-workbook.ts
import type { Buffer as NodeBuffer } from 'node:buffer';
import type { WblReport } from '@/lib/reports/work-based-learning-hours';
import { divisionLabel } from '@/lib/integrations/game-platform/work-based-learning-hours';

const HEADER_FILL = 'FF1F3864';
const TOTAL_FILL = 'FFE7EEF8';
const h = (m: number) => Math.round((m / 60) * 10) / 10;

export async function buildWblWorkbook(report: WblReport): Promise<NodeBuffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Coach Dashboard';
  wb.created = new Date(report.generatedAt);

  const periodLabel = report.period.label;
  const dates = report.period.start
    ? `${report.period.start.slice(0, 10)} to ${report.period.end!.slice(0, 10)}`
    : 'All time';

  // ---- Summary by Student ----
  const sum = wb.addWorksheet('Summary by Student');
  sum.columns = [
    { header: 'Student', key: 'name', width: 26 },
    { header: 'Division', key: 'division', width: 14 },
    { header: 'On-Demand Hrs', key: 'odl', width: 15 },
    { header: 'Flash CTF Hrs', key: 'ctf', width: 15 },
    { header: 'Total Hrs', key: 'total', width: 12 },
  ];
  for (const s of report.students) {
    sum.addRow({ name: s.name, division: divisionLabel(s.division), odl: h(s.odlMinutes), ctf: h(s.ctfMinutes), total: h(s.totalMinutes) });
  }
  sum.addRow({
    name: 'TOTAL', division: '',
    odl: h(report.summary.odlMinutes), ctf: h(report.summary.ctfMinutes), total: h(report.summary.totalMinutes),
  });

  // ---- Detail (grouped, per-student TOTAL) ----
  const detail = wb.addWorksheet('Detail');
  detail.columns = [
    { header: 'Student', key: 'student', width: 24 },
    { header: 'Division', key: 'division', width: 13 },
    { header: 'Segment', key: 'segment', width: 12 },
    { header: 'Activity (challenge type / CTF event)', key: 'activity', width: 34 },
    { header: 'Solves', key: 'solves', width: 8 },
    { header: 'Sessions/Events', key: 'sessions', width: 15 },
    { header: 'Est. Minutes', key: 'minutes', width: 12 },
    { header: 'Est. Hours', key: 'hours', width: 10 },
  ];
  for (const s of report.students) {
    const rows = [...s.odl, ...s.ctf];
    for (const r of rows) {
      detail.addRow({ student: s.name, division: divisionLabel(s.division), segment: r.segment, activity: r.activity, solves: r.solves, sessions: r.sessions, minutes: r.minutes, hours: h(r.minutes) });
    }
    const totalRow = detail.addRow({ student: s.name, division: divisionLabel(s.division), segment: '', activity: rows.length ? 'TOTAL — all activity' : 'TOTAL — all activity (no activity this period)', solves: s.odl.concat(s.ctf).reduce((n, r) => n + r.solves, 0), sessions: '', minutes: s.totalMinutes, hours: h(s.totalMinutes) });
    totalRow.font = { bold: true };
    totalRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }; });
  }

  // ---- Data (atomic + filter) ----
  const data = wb.addWorksheet('Data');
  data.columns = [
    { header: 'Student', key: 'student', width: 24 },
    { header: 'Division', key: 'division', width: 13 },
    { header: 'Segment', key: 'segment', width: 12 },
    { header: 'Activity', key: 'activity', width: 34 },
    { header: 'Solves', key: 'solves', width: 8 },
    { header: 'Sessions/Events', key: 'sessions', width: 15 },
    { header: 'Est. Minutes', key: 'minutes', width: 12 },
    { header: 'Est. Hours', key: 'hours', width: 10 },
  ];
  for (const s of report.students) {
    for (const r of [...s.odl, ...s.ctf]) {
      data.addRow({ student: s.name, division: divisionLabel(s.division), segment: r.segment, activity: r.activity, solves: r.solves, sessions: r.sessions, minutes: r.minutes, hours: h(r.minutes) });
    }
  }
  data.autoFilter = { from: 'A1', to: 'H1' };

  // ---- Methodology (required — submission legitimacy) ----
  const m = wb.addWorksheet('Methodology');
  m.getColumn(1).width = 120;
  const p = report.params;
  const lines: Array<[string, boolean]> = [
    ['Work Based Learning Hours — Methodology & Notes', true],
    ['', false],
    [`Coach: ${report.coach?.name ?? ''}${report.coach?.school ? ' — ' + report.coach.school : ''}`, false],
    [`Period: ${periodLabel} (${dates})`, false],
    [`Generated: ${report.generatedAt.slice(0, 10)}`, false],
    ['Data source: Coach Dashboard game-platform records (challenge solves + Flash CTF events).', false],
    ['', false],
    ['Estimation method', true],
    [`On-Demand (practice): for each challenge type, solves are ordered by time and split into sessions; a gap greater than ${p.gapMinutes} minutes starts a new session. A session with 2+ solves = (last - first) + ${p.tailMinutes} minutes; a lone solve = ${p.orphanMinutes} minutes.`, false],
    [`Flash CTF (events): a student credited the full event window if they solved 1 or more challenges in it — ${p.mayorsName} = ${p.ctfMayorsMinutes} minutes (3.5 h); every other (regular monthly) Flash CTF = ${p.ctfRegularMinutes} minutes (2 h). Events with 0 solves are excluded.`, false],
    ['Per-student total = sum of On-Demand type rows + Flash CTF event rows. Challenge-type labels normalize case/format variants (e.g., Recon → Reconnaissance, Webex → Web Exploitation).', false],
    ['', false],
    ['Caveats', true],
    ['This is an estimate: the platform records solve completion times, not start or idle time. Flash CTF windows are applied by rule (the platform does not record event end times). On-Demand sessions are computed per challenge type.', false],
  ];
  lines.forEach(([text, bold]) => {
    const row = m.addRow([text]);
    row.getCell(1).font = { bold, name: 'Calibri', size: bold ? 12 : 11 };
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  });

  // header styling for the three data sheets
  for (const ws of [sum, detail, data]) {
    ws.getRow(1).eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  return (await wb.xlsx.writeBuffer()) as NodeBuffer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- lib/reports/wbl-workbook.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reports/wbl-workbook.ts lib/reports/wbl-workbook.test.ts
git commit -m "feat(wbl): ExcelJS workbook builder with required Methodology sheet"
```

---

## Task 6: Online JSON API route

**Files:**
- Create: `app/api/coach-reports/work-based-learning-hours/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/coach-reports/work-based-learning-hours/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { loadWblReport } from '@/lib/reports/work-based-learning-hours';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const period = request.nextUrl.searchParams.get('period');
    const division = request.nextUrl.searchParams.get('division') ?? 'all';

    const isAdminUser = await isUserAdmin(supabase, user.id);
    const actingCoach = cookieStore.get('admin_coach_id')?.value || null;
    const coachContextId = isAdminUser ? actingCoach : user.id;

    const statsClient = getServiceRoleSupabaseClient() ?? supabase;

    const report = await loadWblReport({
      userClient: supabase,
      statsClient,
      coachContextId,
      periodSlug: period,
      division,
    });

    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('WBL report failed', err);
    return NextResponse.json({ error: 'Failed to load report' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual smoke check**

Run `pnpm dev`, sign in as a coach, and visit `/api/coach-reports/work-based-learning-hours?period=2025-26`.
Expected: 200 JSON with `summary.totalMinutes` and a `students` array; each student has `odl`, `ctf`, `totalMinutes`.

- [ ] **Step 3: Commit**

```bash
git add app/api/coach-reports/work-based-learning-hours/route.ts
git commit -m "feat(wbl): coach-scoped JSON report route"
```

---

## Task 7: Excel export API route

**Files:**
- Create: `app/api/coach-reports/work-based-learning-hours/export/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/coach-reports/work-based-learning-hours/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { loadWblReport } from '@/lib/reports/work-based-learning-hours';
import { buildWblWorkbook } from '@/lib/reports/wbl-workbook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function contentDisposition(filename: string) {
  const safe = filename.replace(/["\r\n]/g, '').trim() || 'report.xlsx';
  const ascii = safe.replace(/[^\x20-\x7E]+/g, '') || 'report.xlsx';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const period = request.nextUrl.searchParams.get('period');
    const division = request.nextUrl.searchParams.get('division') ?? 'all';

    const isAdminUser = await isUserAdmin(supabase, user.id);
    const actingCoach = cookieStore.get('admin_coach_id')?.value || null;
    const coachContextId = isAdminUser ? actingCoach : user.id;

    const statsClient = getServiceRoleSupabaseClient() ?? supabase;

    const report = await loadWblReport({
      userClient: supabase, statsClient, coachContextId, periodSlug: period, division,
    });

    const buffer = await buildWblWorkbook(report);
    const coachSlug = (report.coach?.name ?? 'coach').replace(/[^a-zA-Z0-9]+/g, '_');
    const filename = `Work_Based_Learning_Hours_${coachSlug}_${report.period.slug}.xlsx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('WBL export failed', err);
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual smoke check**

With `pnpm dev` running and signed in as a coach, visit `/api/coach-reports/work-based-learning-hours/export?period=2025-26`.
Expected: a `.xlsx` downloads; opening it shows the four sheets (Summary by Student, Detail, Data, Methodology).

- [ ] **Step 3: Commit**

```bash
git add app/api/coach-reports/work-based-learning-hours/export/route.ts
git commit -m "feat(wbl): coach-scoped Excel export route"
```

---

## Task 8: UI — page + components

**Files:**
- Create: `components/game-platform/wbl/wbl-summary-cards.tsx`
- Create: `components/game-platform/wbl/wbl-detail-table.tsx`
- Create: `components/game-platform/wbl/wbl-report-view.tsx`
- Create: `app/dashboard/work-based-learning-hours/page.tsx`
- Modify: `app/dashboard/layout.tsx` (nav link)

- [ ] **Step 1: Summary cards component**

```tsx
// components/game-platform/wbl/wbl-summary-cards.tsx
'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WblSummary } from '@/lib/integrations/game-platform/work-based-learning-hours';

const h = (m: number) => (Math.round((m / 60) * 10) / 10).toFixed(1);

export function WblSummaryCards({ summary }: { summary: WblSummary }) {
  const items = [
    { label: 'Total Hours', value: h(summary.totalMinutes) },
    { label: 'On-Demand Hours', value: h(summary.odlMinutes) },
    { label: 'Flash CTF Hours', value: h(summary.ctfMinutes) },
    { label: 'Avg Hours / Student', value: h(summary.avgMinutes) },
    { label: 'Students', value: String(summary.studentCount) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-400">{it.label}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-slate-100">{it.value}</CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Detail table component**

```tsx
// components/game-platform/wbl/wbl-detail-table.tsx
'use client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { divisionLabel, type WblStudent } from '@/lib/integrations/game-platform/work-based-learning-hours';

const h = (m: number) => (Math.round((m / 60) * 10) / 10).toFixed(1);

export function WblDetailTable({ students }: { students: WblStudent[] }) {
  if (!students.length) {
    return <p className="text-sm text-slate-400">No students in this division for the selected period.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Division</TableHead>
          <TableHead>Segment</TableHead>
          <TableHead>Activity (challenge type / CTF event)</TableHead>
          <TableHead className="text-right">Solves</TableHead>
          <TableHead className="text-right">Sessions/Events</TableHead>
          <TableHead className="text-right">Est. Hours</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((s) => {
          const rows = [...s.odl, ...s.ctf];
          return (
            <>
              {rows.map((r, i) => (
                <TableRow key={`${s.competitorId}-${i}`}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{divisionLabel(s.division)}</TableCell>
                  <TableCell>{r.segment}</TableCell>
                  <TableCell>{r.activity}</TableCell>
                  <TableCell className="text-right">{r.solves}</TableCell>
                  <TableCell className="text-right">{r.sessions}</TableCell>
                  <TableCell className="text-right">{h(r.minutes)}</TableCell>
                </TableRow>
              ))}
              <TableRow key={`${s.competitorId}-total`} className="bg-slate-800/60 font-semibold">
                <TableCell>{s.name}</TableCell>
                <TableCell>{divisionLabel(s.division)}</TableCell>
                <TableCell />
                <TableCell>{rows.length ? 'TOTAL — all activity' : 'TOTAL — all activity (no activity this period)'}</TableCell>
                <TableCell className="text-right">{rows.reduce((n, r) => n + r.solves, 0)}</TableCell>
                <TableCell />
                <TableCell className="text-right">{h(s.totalMinutes)}</TableCell>
              </TableRow>
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Report view (controls + fetch + export)**

```tsx
// components/game-platform/wbl/wbl-report-view.tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { WBL_PERIODS, DEFAULT_WBL_PERIOD_SLUG } from '@/lib/reports/wbl-periods';
import { WblSummaryCards } from './wbl-summary-cards';
import { WblDetailTable } from './wbl-detail-table';
import type { WblReport } from '@/lib/reports/work-based-learning-hours';

const DIVISIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'middle_school', label: 'Middle' },
  { value: 'high_school', label: 'High' },
  { value: 'college', label: 'College' },
];

export function WblReportView() {
  const [period, setPeriod] = useState<string>(DEFAULT_WBL_PERIOD_SLUG);
  const [division, setDivision] = useState<string>('all');
  const [report, setReport] = useState<WblReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/coach-reports/work-based-learning-hours?period=${period}&division=${division}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((json) => { if (!cancelled) setReport(json); })
      .catch(() => { if (!cancelled) setReport(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, division]);

  const onExport = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/coach-reports/work-based-learning-hours/export?period=${period}&division=${division}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Work_Based_Learning_Hours_${period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WBL_PERIODS.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Tabs value={division} onValueChange={setDivision}>
          <TabsList>
            {DIVISIONS.map((d) => <TabsTrigger key={d.value} value={d.value}>{d.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Button onClick={onExport} disabled={downloading || !report} className="ml-auto">
          <Download className="mr-2 h-4 w-4" />{downloading ? 'Preparing…' : 'Export to Excel'}
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && report && (
        <>
          <WblSummaryCards summary={report.summary} />
          <WblDetailTable students={report.students} />
        </>
      )}
      {!loading && !report && <p className="text-sm text-red-400">Could not load the report.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Page**

```tsx
// app/dashboard/work-based-learning-hours/page.tsx
'use client';
import ActingAsBanner from '@/components/admin/ActingAsBanner';
import { WblReportView } from '@/components/game-platform/wbl/wbl-report-view';

export default function WorkBasedLearningHoursPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Work Based Learning Hours</h1>
        <p className="text-sm text-slate-400">Estimated platform engagement time for your students, from challenge-solve activity and Flash CTF participation.</p>
        <ActingAsBanner />
      </div>
      <WblReportView />
    </div>
  );
}
```

> Confirm the `ActingAsBanner` import path/casing against the repo (`components/admin/ActingAsBanner`, referenced by the teams page). If the default export differs, adjust the import to match; do not invent a new banner.

- [ ] **Step 5: Add the nav link**

In `app/dashboard/layout.tsx`, inside the Coach Tools sub-menu (`:217-245`), add — directly after the `Profile & Settings` `<Link>` block (`:219-223`):

```tsx
                    <Link href="/dashboard/work-based-learning-hours">
                      <Button variant="ghost" size="sm" className="w-full justify-start text-meta-muted hover:bg-meta-accent hover:text-white text-sm">
                        Work Based Learning Hours
                      </Button>
                    </Link>
```

- [ ] **Step 6: Verify controls exist**

Confirm `@/components/ui/select` and `@/components/ui/tabs` exist (shadcn). Run:
```bash
ls components/ui/select.tsx components/ui/tabs.tsx components/ui/table.tsx components/ui/card.tsx components/ui/button.tsx
```
Expected: all five listed. If `select.tsx` is missing, add it via the project's shadcn setup (do not hand-roll a `<select>`).

- [ ] **Step 7: Build**

Run: `pnpm lint && vercel build`
Expected: lint clean; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/work-based-learning-hours/page.tsx components/game-platform/wbl app/dashboard/layout.tsx
git commit -m "feat(wbl): Coach Tools page, report view, and nav link"
```

---

## Task 9: E2E smoke test

**Files:**
- Create: `e2e/work-based-learning-hours.spec.ts` (place in the `testDir` configured in `playwright.config.ts`; adjust the path to match)

- [ ] **Step 1: Write the test**

```ts
// e2e/work-based-learning-hours.spec.ts
import { test, expect } from '@playwright/test';

// Assumes the repo's existing auth setup/fixtures log in a coach (mirror another
// authenticated e2e spec's login/storageState pattern before finalizing).
test('coach can view Work Based Learning Hours and export Excel', async ({ page }) => {
  await page.goto('/dashboard/work-based-learning-hours');
  await expect(page.getByRole('heading', { name: 'Work Based Learning Hours' })).toBeVisible();

  // Summary cards render.
  await expect(page.getByText('Total Hours')).toBeVisible();

  // Export downloads a non-empty .xlsx.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export to Excel/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e -- work-based-learning-hours`
Expected: PASS. If the repo's e2e auth differs, align the login/storageState with an existing authenticated spec first.

- [ ] **Step 3: Commit**

```bash
git add e2e/work-based-learning-hours.spec.ts
git commit -m "test(wbl): e2e smoke — view report + export Excel"
```

---

## Task 10: Source-of-truth documentation updates

**Why:** The preceding tasks add a new RPC (`get_work_based_learning_hours`), a new coach-scoped report surface, and a new compute-on-read helper. The canonical game-platform doc drifts the moment this lands if not updated in the same PR.

**Files (the SOT — under `docs/source-of-truth/`):**
- Modify: `docs/source-of-truth/integrations/game-platform-integration.md`
- (Optional, index only) Modify: `CLAUDE.md` — only if a reference index/pointer changed.

- [ ] **Step 1: `docs/source-of-truth/integrations/game-platform-integration.md` updates**

Append a new section (after the existing RPC/analytics section — search for `get_dashboard_category_totals` and add nearby):

```markdown
### Work Based Learning Hours report

- **RPC:** `get_work_based_learning_hours(p_synced_user_ids text[], p_start timestamptz, p_end timestamptz, p_gap_minutes int=30, p_tail_minutes int=10, p_orphan_minutes int=15, p_ctf_regular_minutes int=120, p_ctf_mayors_minutes int=210, p_mayors_name text='Inland Empire Mayors Cyber Cup 2026')` → `(synced_user_id, segment, activity, solves, sessions, minutes)`. `LANGUAGE sql STABLE`, GRANTed to `authenticated, service_role`. Migration `20260703000000_work_based_learning_hours_rpc.sql`.
- **Estimation model:** On-Demand time = sessionize `source='odl'` solves per canonical challenge type (gap > 30 min splits sessions; ≥2 solves = (last−first)+10 min; orphan = 15 min). Flash CTF time = per event with `challenges_solved > 0`, credit the full window (Mayors Cyber Cup = 3.5 h; regular monthly = 2 h). Windows are rule-based because `game_platform_flash_ctf_events.ended_at` is not recorded.
- **Invariant:** sessionize on `solved_at` (never `created_at`). The report reads the solves table via the service-role stats client (RLS + PostgREST 1000-row cap); coach scoping happens at the API layer by passing only the coach's own students' `synced_user_id`s.
- **Surfaces:** helper `lib/integrations/game-platform/work-based-learning-hours.ts` (pure grouping/summary) + shared loader `lib/reports/work-based-learning-hours.ts`; routes `GET /api/coach-reports/work-based-learning-hours` (JSON) and `…/export` (ExcelJS, 4 sheets incl. required Methodology); page `/dashboard/work-based-learning-hours` (Coach Tools). Period presets in `lib/reports/wbl-periods.ts` (default 2025–26 school year). Reconciles to 2,343.1 h for the Riverside + San Bernardino population (all-time).
```

- [ ] **Step 2: (optional) `CLAUDE.md` index refresh**

Only if CLAUDE.md carries a reference table of RPCs or coach tools; add a one-line pointer to the report + RPC. Do NOT move the architectural prose out of the SOT doc.

- [ ] **Step 3: Sanity grep for stale references**

```bash
grep -rn "work_based_learning\|Work Based Learning" docs/source-of-truth/ CLAUDE.md
```
Confirm the only hits are the new, consistent entries.

- [ ] **Step 4: Commit**

```bash
git add docs/source-of-truth/integrations/game-platform-integration.md CLAUDE.md
git commit -m "docs(SOT): document Work Based Learning Hours RPC + report"
```

---

## Execution grouping / notes

- **Order:** Tasks 1→10 in sequence. Tasks 1, 2, 5 are pure/unit-tested and independent; Task 3 (RPC) must be applied to the DB before the Task 6/7 smoke checks and the Task 9 e2e will return real data. Task 10 runs last (documents merged behavior).
- **DB apply:** the migration is applied by hand in the Supabase SQL Editor (repo workflow); the plan's reconciliation query (Task 3, Step 3) is the gate that the algorithm matches the approved spreadsheet.
- **Before any PR:** `pnpm lint` (zero warnings) and `vercel build` locally, per `CLAUDE.md`.

## Self-review notes (author)

- **Spec coverage:** online mirror-the-spreadsheet view (Task 8), school-year presets (Task 1/8), all-students-incl-zero (groupWblRows zero-fill, Task 2; Detail zero row, Task 5/8), Excel export with required Methodology (Task 5/7), coach scoping + admin act-as (Task 6/7), reconciliation to 2,343.1 h (Task 3). ✓
- **Type consistency:** `WblRpcRow`/`WblStudent`/`WblSummary`/`RosterEntry`/`WblParams`/`WblReport` used identically across Tasks 2, 4, 5, 6, 7, 8. ✓
- **Final task:** Task 10 is the SOT doc update with literal steps. ✓
- **Build-on-Giants:** ExcelJS (existing dep, sanctioned xlsx primitive), Postgres window functions (sessionization), Supabase RPC + service-role (existing precedent), shadcn/ui + `useAdminCoachContext`/`ActingAsBanner`. No new libraries; no re-implemented built-ins. ✓
