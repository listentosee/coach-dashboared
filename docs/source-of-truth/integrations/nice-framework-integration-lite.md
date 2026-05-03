# NIST NICE Framework Integration

**Status:** Shipped (2026-05-03) — this is the canonical NICE integration spec.
**Last Updated:** 2026-05-03
**Owner:** Platform Team

> **Reconciliation note:** A more elaborate design (extra `nice_framework_tasks` and `nice_work_role_tasks` reference tables, a `nice_work_roles text[]` column on `game_platform_challenge_solves`, a `NiceFrameworkService` class with team-coverage analytics) was drafted but never built. That design is preserved at [`docs/game-platform/historical-nice-full-design.md`](../../game-platform/historical-nice-full-design.md) for future reference, not as source of truth.

## Goal

Translate NICE work role codes (like "DD-WRL-003") into human-readable names (like "Secure Software Development") wherever they're currently displayed in the UI.

**That's it. Nothing more.**

---

## Current State

✅ **What works:**
- MetaCTF API returns `nist_nice_work_roles` array in challenge data
- Data stored in `game_platform_challenge_solves.raw_payload`
- UI shows work role codes in report card badges

❌ **What's missing:**
- Codes like "DD-WRL-003" are meaningless to users
- No lookup table to translate code → title

---

## Solution: 3 Simple Steps

### Step 1: Reference Table

Create one table to store work role translations:

```sql
-- Migration: supabase/migrations/YYYYMMDD_nice_framework_lookup.sql

CREATE TABLE public.nice_framework_work_roles (
  work_role_id text PRIMARY KEY,       -- 'DD-WRL-003'
  title text NOT NULL,                 -- 'Secure Software Development'
  description text,                    -- Full description
  category text NOT NULL,              -- 'DD', 'OG', 'PD', 'IO', 'IN'
  created_at timestamptz DEFAULT now()
);

-- Anyone can read this reference data
ALTER TABLE public.nice_framework_work_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read" ON public.nice_framework_work_roles FOR SELECT USING (true);
```

### Step 2: Admin Tool to Seed Data

Add a page in admin tools to fetch NICE data from NIST and populate the table.

**Files to create:**
1. `app/dashboard/admin-tools/nice-framework/page.tsx`
2. `app/api/admin/nice-framework/seed/route.ts`

**What it does:**
1. Admin clicks "Fetch NICE Data" button
2. Fetches https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json
3. Extracts work roles (filter for `element_identifier` containing '-WRL-')
4. Upserts into `nice_framework_work_roles` table
5. Shows count: "Loaded 47 work roles"

**Simple admin page:**
```tsx
export default function NiceFrameworkPage() {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  const handleSeed = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/nice-framework/seed', { method: 'POST' });
    const data = await res.json();
    setCount(data.count);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>NICE Framework Reference Data</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm mb-4">Loaded {count} work roles</p>
        <Button onClick={handleSeed} disabled={loading}>
          {loading ? 'Fetching...' : 'Fetch NICE Data from NIST'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Simple API endpoint** (as-built — see [`app/api/admin/nice-framework/seed/route.ts`](../../../app/api/admin/nice-framework/seed/route.ts)):
```typescript
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createServerClient();

  // 1. Verify admin via getUser() + profiles.role
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Fetch NIST data
  const response = await fetch(
    'https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json',
    { cache: 'no-store' }
  );
  const data = await response.json();

  // 3. Parse work roles
  const workRoles = data.elements
    .filter((e: any) => e.element_identifier.includes('-WRL-'))
    .map((e: any) => ({
      work_role_id: e.element_identifier,
      title: e.title,
      description: e.text,
      category: e.element_identifier.split('-')[0],
    }));

  // 4. Upsert via service-role client (bypasses RLS)
  const supabaseAdmin = getServiceRoleSupabaseClient();
  await supabaseAdmin
    .from('nice_framework_work_roles')
    .upsert(workRoles, { onConflict: 'work_role_id' });

  return NextResponse.json({ count: workRoles.length });
}
```

### Step 3: Update UI to Show Titles

Update the challenges table to lookup and display titles instead of codes.

**Option A: Simple client-side lookup**

```tsx
// components/game-platform/report-card/challenges-table.tsx

// Add at top of component
const { data: workRolesMap } = useQuery({
  queryKey: ['nice-work-roles'],
  queryFn: async () => {
    const { data } = await supabase
      .from('nice_framework_work_roles')
      .select('work_role_id, title');

    return (data || []).reduce((acc, role) => {
      acc[role.work_role_id] = role.title;
      return acc;
    }, {} as Record<string, string>);
  },
});

// Update the badge rendering (around line 240-246)
{challenge.nistRoles.slice(0, 2).map(roleId => (
  <span
    key={roleId}
    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
  >
    {workRolesMap?.[roleId] || roleId}
  </span>
))}
```

**Option B: Reusable component**

```tsx
// components/nice-framework/work-role-badge.tsx

export function WorkRoleBadge({ workRoleId }: { workRoleId: string }) {
  const { data: role } = useQuery({
    queryKey: ['nice-work-role', workRoleId],
    queryFn: async () => {
      const { data } = await supabase
        .from('nice_framework_work_roles')
        .select('work_role_id, title')
        .eq('work_role_id', workRoleId)
        .single();
      return data;
    },
  });

  return (
    <Badge variant="secondary" className="text-xs">
      {role?.title || workRoleId}
    </Badge>
  );
}

// Then in challenges-table.tsx:
{challenge.nistRoles.slice(0, 2).map(roleId => (
  <WorkRoleBadge key={roleId} workRoleId={roleId} />
))}
```

---

## That's It!

**Timeline:** 1-2 days

**Deliverables:**
- ✅ Reference table with ~47 NICE work roles
- ✅ Admin tool to refresh data from NIST
- ✅ UI shows "Secure Software Development" instead of "DD-WRL-003"

**NOT doing (save for future):**
- ❌ New database column on challenge_solves
- ❌ Analytics or aggregations
- ❌ Filtering by work role
- ❌ Team coverage dashboards
- ❌ Learning recommendations

---

## NIST Data Reference

**Source:** https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json

**Categories:**
- **OG** - Oversee & Govern
- **DD** - Design & Development
- **IO** - Operate & Maintain
- **PD** - Protect & Defend
- **IN** - Investigate

**Example Work Roles:**
- `OG-WRL-007` → "Executive Cybersecurity Leadership"
- `DD-WRL-003` → "Secure Software Development"
- `PD-WRL-001` → "Cybersecurity Defense Analyst"
- `IO-WRL-001` → "System Administrator"
- `IN-WRL-001` → "Cyber Crime Investigator"

---

**Status:** Shipped — see `nice_framework_work_roles` table, admin tool at `/dashboard/admin-tools/nice-framework`, seed route at `app/api/admin/nice-framework/seed/`, and stats route at `app/api/admin/nice-framework/stats/`. Lookup is consumed by the report-card route at `app/api/game-platform/report-card/[competitorId]/route.ts`.

---

**Last verified:** 2026-05-03 against commit `5b49f3ef`.
**Notes:** Confirmed only `nice_framework_work_roles` exists in `data/db_schema_20260208.sql` (no tasks or junction tables — the full design's extra tables were never built). Updated the seed-route example to match the as-built `createServerClient` + `getServiceRoleSupabaseClient` pattern (the original `createRouteHandlerClient({ cookies })` pattern is from `@supabase/auth-helpers`, which is being phased out). The admin page also exposes a `/api/admin/nice-framework/stats` route used to display counts. Designated this LITE doc as the canonical SOT and pointed to the historical full-design doc for analytics aspirations.
