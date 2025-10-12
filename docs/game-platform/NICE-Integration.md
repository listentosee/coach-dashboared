# NIST NICE Framework Integration - Implementation Plan

**Status:** Design Phase
**Last Updated:** 2025-10-12
**Owner:** Platform Team

## Executive Summary

This document outlines the integration of the **NIST NICE Framework** (National Initiative for Cybersecurity Education) work roles and tasks into the existing game platform infrastructure. The NICE Framework provides a standardized taxonomy of cybersecurity roles, and the game platform already captures `nist_nice_work_roles` as an array of strings in challenge solve data.

**Key Goals:**
- Leverage existing NICE work role data from MetaCTF challenges
- Create reference tables for NICE Framework taxonomy
- Enable filtering, analytics, and reporting by NICE work roles
- Provide coaches with insights into competitor skill coverage across cybersecurity domains
- Align training with national workforce development standards

## Current State Analysis

### Existing Game Platform Data Model

1. **Challenge Solves Table**
   - Location: `supabase/migrations/20250926_game_platform_detail_tables.sql`
   - Schema: `docs/database/db_schema_dump.sql:2230-2245`
   - Tracks individual challenge completions
   - Stores: challenge_id, title, category, points, solved_at timestamp
   - Currently captures NICE work roles in `raw_payload` (jsonb) **but lacks a dedicated structured column**
   - **Current schema does NOT have `nice_work_roles` column** - needs to be added

2. **API Integration**
   - File: `lib/integrations/game-platform/client.ts:110-119`
   - `ChallengeSolveSchema` already includes:
     ```typescript
     nist_nice_work_roles: z.array(z.string())
     ```
   - This data comes from both ODL scores and Flash CTF events
   - Data is currently stored in `raw_payload` but not extracted to a dedicated column

3. **UI Already Displays NICE Roles**
   - File: `components/game-platform/report-card/challenges-table.tsx:207,238-256`
   - The report card component extracts NICE roles from the challenge data at runtime
   - Shows them as small badges in the "NIST Roles" column
   - Limitation: Roles are currently extracted in application layer, not indexed in database

4. **Current Challenge Data Flow**
   ```
   MetaCTF API → GamePlatformClient → game_platform_challenge_solves.raw_payload
                                    ↓
                            UI Component extracts nistRoles from raw_payload
   ```

**Gap:** While the UI displays NICE roles, there's no dedicated database column for efficient querying, filtering, or aggregation by work roles. This integration will add structured storage and enable advanced analytics.

### NIST NICE Framework Data Structure

**Data Source:** https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json

1. **Work Roles** (e.g., "OG-WRL-007", "DD-WRL-003")
   - Unique identifiers with category prefixes
   - Categories:
     - **OG** - Oversee & Govern
     - **DD** - Design & Development
     - **IO** - Operate & Maintain
     - **PD** - Protect & Defend
     - **IN** - Investigate
   - Each has title and descriptive text

2. **Example Work Roles:**
   ```json
   {
     "element_identifier": "OG-WRL-007",
     "title": "Executive Cybersecurity Leadership",
     "text": "Responsible for establishing vision and direction for an organization's cybersecurity operations and resources and their impact on digital and physical spaces."
   },
   {
     "element_identifier": "DD-WRL-003",
     "title": "Secure Software Development",
     "text": "Responsible for developing, creating, modifying, and maintaining computer applications, software, or specialized utility programs."
   }
   ```

3. **Tasks** (e.g., "T0006", "T0020")
   - Granular action items
   - Example: "T0006" - "Advocate organization's official position in legal and legislative proceedings"
   - Example: "T0020" - "Develop content for cyber defense tools"

4. **Document Version**
   - Current: NIST SP 800-181 Rev 1
   - Updated periodically by NIST

## Integration Architecture Design

### Phase 1: Database Schema Enhancement

#### 1.1 New Reference Tables (Static NICE Data)

**Migration File:** `supabase/migrations/YYYYMMDD_nice_framework_tables.sql`

```sql
-- NICE Framework Work Roles reference table
CREATE TABLE public.nice_framework_work_roles (
  element_identifier text PRIMARY KEY,  -- e.g., 'OG-WRL-007'
  title text NOT NULL,
  description text,
  category text NOT NULL,  -- e.g., 'OG', 'DD', 'IO', 'PD', 'IN'
  category_name text,  -- e.g., 'Oversee & Govern'
  doc_identifier text,  -- 'SP_800_181_rev_1'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_nice_work_roles_category
  ON public.nice_framework_work_roles(category);

-- NICE Framework Tasks reference table
CREATE TABLE public.nice_framework_tasks (
  element_identifier text PRIMARY KEY,  -- e.g., 'T0006'
  description text NOT NULL,
  doc_identifier text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Junction table: Work Role → Tasks (for future task mappings)
CREATE TABLE public.nice_work_role_tasks (
  work_role_id text REFERENCES nice_framework_work_roles(element_identifier) ON DELETE CASCADE,
  task_id text REFERENCES nice_framework_tasks(element_identifier) ON DELETE CASCADE,
  PRIMARY KEY (work_role_id, task_id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_work_role_tasks_work_role
  ON public.nice_work_role_tasks(work_role_id);

CREATE INDEX idx_work_role_tasks_task
  ON public.nice_work_role_tasks(task_id);

-- RLS Policies (read-only for authenticated users)
ALTER TABLE public.nice_framework_work_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nice_framework_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nice_work_role_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_nice_work_roles"
  ON public.nice_framework_work_roles FOR SELECT
  USING (true);

CREATE POLICY "allow_read_nice_tasks"
  ON public.nice_framework_tasks FOR SELECT
  USING (true);

CREATE POLICY "allow_read_nice_work_role_tasks"
  ON public.nice_work_role_tasks FOR SELECT
  USING (true);
```

#### 1.2 Enhance Existing Challenge Solves Table

**Migration File:** `supabase/migrations/YYYYMMDD_add_nice_work_roles_column.sql`

```sql
-- Add structured NICE work roles column
ALTER TABLE public.game_platform_challenge_solves
  ADD COLUMN IF NOT EXISTS nice_work_roles text[] DEFAULT '{}';

-- Create GIN index for efficient array querying
CREATE INDEX IF NOT EXISTS idx_challenge_solves_nice_work_roles
  ON public.game_platform_challenge_solves USING GIN (nice_work_roles);

-- Backfill migration to extract from raw_payload
UPDATE public.game_platform_challenge_solves
SET nice_work_roles = COALESCE(
  (
    SELECT array_agg(elem::text)
    FROM jsonb_array_elements_text(raw_payload->'nist_nice_work_roles') AS elem
  ),
  '{}'
)
WHERE raw_payload IS NOT NULL
  AND raw_payload ? 'nist_nice_work_roles'
  AND nice_work_roles = '{}';
```

### Phase 2: Data Seeding & Management

#### 2.1 NICE Framework Data Seeding Admin Tool

**New Admin Tool Route:** `/dashboard/admin-tools/nice-framework`

**Implementation Files:**
- `app/dashboard/admin-tools/nice-framework/page.tsx` - Admin UI
- `app/api/admin/nice-framework/seed/route.ts` - API endpoint
- `lib/services/nice-framework-service.ts` - Service layer

**Admin UI Features:**
- Display current framework version (from database)
- Show last updated timestamp
- Button to "Fetch & Update NICE Framework Data"
- Progress indicator during seeding
- Summary of changes (new work roles, updated descriptions, etc.)
- Validation warnings for any challenges referencing unknown work role IDs

**Seeding Logic Flow:**
```typescript
// lib/services/nice-framework-service.ts

export class NiceFrameworkService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Fetch NIST NICE Framework data and upsert to database
   */
  async seedFrameworkData(): Promise<SeedResult> {
    // 1. Fetch NIST JSON
    const response = await fetch(
      'https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json'
    );
    const data = await response.json();

    // 2. Parse work roles
    const workRoles = data.elements
      .filter(e => e.element_identifier.includes('-WRL-'))
      .map(e => ({
        element_identifier: e.element_identifier,
        title: e.title,
        description: e.text,
        category: e.element_identifier.split('-')[0],
        category_name: this.getCategoryName(e.element_identifier.split('-')[0]),
        doc_identifier: e.doc_identifier
      }));

    // 3. Parse tasks
    const tasks = data.elements
      .filter(e => e.element_identifier.startsWith('T') && !e.element_identifier.includes('-'))
      .map(e => ({
        element_identifier: e.element_identifier,
        description: e.text,
        doc_identifier: e.doc_identifier
      }));

    // 4. Upsert to database (PostgreSQL ON CONFLICT DO UPDATE)
    const { error: workRoleError } = await this.supabase
      .from('nice_framework_work_roles')
      .upsert(workRoles, { onConflict: 'element_identifier' });

    if (workRoleError) throw workRoleError;

    const { error: taskError } = await this.supabase
      .from('nice_framework_tasks')
      .upsert(tasks, { onConflict: 'element_identifier' });

    if (taskError) throw taskError;

    // 5. Validate existing challenge references
    const orphanedRoles = await this.findOrphanedWorkRoles();

    return {
      workRolesSeeded: workRoles.length,
      tasksSeeded: tasks.length,
      orphanedRoles,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Find work role IDs in challenges that don't exist in reference table
   */
  async findOrphanedWorkRoles(): Promise<string[]> {
    const { data } = await this.supabase.rpc('find_orphaned_nice_work_roles');
    return data || [];
  }

  private getCategoryName(category: string): string {
    const categoryMap: Record<string, string> = {
      'OG': 'Oversee & Govern',
      'DD': 'Design & Development',
      'IO': 'Operate & Maintain',
      'PD': 'Protect & Defend',
      'IN': 'Investigate'
    };
    return categoryMap[category] || category;
  }
}
```

**Database Function for Validation:**
```sql
-- Find work role IDs referenced in challenges but not in reference table
CREATE OR REPLACE FUNCTION find_orphaned_nice_work_roles()
RETURNS TABLE(work_role_id text, challenge_count bigint) AS $$
  SELECT
    UNNEST(nice_work_roles) as work_role_id,
    COUNT(*) as challenge_count
  FROM game_platform_challenge_solves
  WHERE nice_work_roles IS NOT NULL
    AND array_length(nice_work_roles, 1) > 0
  GROUP BY work_role_id
  HAVING NOT EXISTS (
    SELECT 1 FROM nice_framework_work_roles
    WHERE element_identifier = UNNEST(nice_work_roles)
  )
$$ LANGUAGE sql;
```

#### 2.2 Update Strategy

- **Frequency:** Quarterly check for NIST updates (manual admin action)
- **Mechanism:** Admin tool button trigger
- **Versioning:** Track `doc_identifier` to detect framework updates
- **Notifications:** Log updates to admin audit trail

### Phase 3: Service Layer Enhancements

#### 3.1 Update Game Platform Sync

**File:** `lib/integrations/game-platform/service.ts`

Modify the challenge solve ingestion to extract NICE work roles:

```typescript
// When processing challenge_solves from API response
const challengeSolvesToInsert = apiChallengeSolves.map(solve => ({
  syned_user_id: userId,
  metactf_user_id: metactfUserId,
  syned_team_id: teamId,
  challenge_solve_id: solve.challenge_solve_id,
  challenge_id: solve.challenge_id,
  challenge_title: solve.challenge_title,
  challenge_category: solve.challenge_category,
  challenge_points: solve.challenge_points,
  solved_at: new Date(solve.timestamp_unix * 1000),
  nice_work_roles: solve.nist_nice_work_roles || [],  // ← NEW: Extract to dedicated column
  source: 'odl', // or 'flash_ctf'
  raw_payload: solve,
}));
```

**Update Repository Layer:**

```typescript
// lib/integrations/game-platform/repository.ts

interface ChallengeSolveInsert {
  syned_user_id: string;
  metactf_user_id?: number;
  syned_team_id?: string;
  challenge_solve_id: number;
  challenge_id?: number;
  challenge_title?: string;
  challenge_category?: string;
  challenge_points?: number;
  solved_at?: Date;
  nice_work_roles: string[];  // ← NEW
  source: 'odl' | 'flash_ctf';
  raw_payload: any;
}
```

#### 3.2 Create NICE Framework Service

**New File:** `lib/services/nice-framework-service.ts`

```typescript
export interface WorkRoleDetails {
  element_identifier: string;
  title: string;
  description: string;
  category: string;
  category_name: string;
}

export interface UserWorkRoleProgress {
  work_role_id: string;
  work_role_title: string;
  category: string;
  category_name: string;
  challenges_completed: number;
  total_points: number;
  last_solved_at: string;
  recent_challenges: Array<{
    title: string;
    points: number;
    solved_at: string;
  }>;
}

export class NiceFrameworkService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all work roles with optional category filter
   */
  async getWorkRoles(category?: string): Promise<WorkRoleDetails[]> {
    let query = this.supabase
      .from('nice_framework_work_roles')
      .select('*')
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get details for specific work role
   */
  async getWorkRoleDetails(workRoleId: string): Promise<WorkRoleDetails | null> {
    const { data, error } = await this.supabase
      .from('nice_framework_work_roles')
      .select('*')
      .eq('element_identifier', workRoleId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Get tasks associated with a work role
   */
  async getTasksForWorkRole(workRoleId: string): Promise<Array<{ element_identifier: string; description: string }>> {
    const { data, error } = await this.supabase
      .from('nice_work_role_tasks')
      .select('task_id, nice_framework_tasks(element_identifier, description)')
      .eq('work_role_id', workRoleId);

    if (error) throw error;
    return data?.map(d => d.nice_framework_tasks).filter(Boolean) || [];
  }

  /**
   * Get challenges that map to a specific work role
   */
  async getChallengesByWorkRole(
    workRoleId: string,
    userId?: string,
    limit = 50
  ): Promise<Array<{
    challenge_title: string;
    challenge_category: string;
    challenge_points: number;
    solved_at: string;
    syned_user_id: string;
  }>> {
    let query = this.supabase
      .from('game_platform_challenge_solves')
      .select('challenge_title, challenge_category, challenge_points, solved_at, syned_user_id')
      .contains('nice_work_roles', [workRoleId])
      .order('solved_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('syned_user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get user's progress aggregated by NICE work role
   */
  async getUserWorkRoleProgress(userId: string): Promise<UserWorkRoleProgress[]> {
    // Use database view or complex query
    const { data, error } = await this.supabase
      .rpc('get_user_nice_work_role_progress', { user_id: userId });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get team coverage across NICE work roles
   */
  async getTeamWorkRoleCoverage(teamId: string): Promise<{
    work_role_id: string;
    work_role_title: string;
    category: string;
    unique_competitors: number;
    total_challenges: number;
    total_points: number;
  }[]> {
    const { data, error } = await this.supabase
      .rpc('get_team_nice_work_role_coverage', { team_id: teamId });

    if (error) throw error;
    return data || [];
  }
}
```

**Supporting Database Functions:**

```sql
-- Get user's NICE work role progress
CREATE OR REPLACE FUNCTION get_user_nice_work_role_progress(user_id text)
RETURNS TABLE(
  work_role_id text,
  work_role_title text,
  category text,
  category_name text,
  challenges_completed bigint,
  total_points bigint,
  last_solved_at timestamptz
) AS $$
  SELECT
    role_id as work_role_id,
    wr.title as work_role_title,
    wr.category,
    wr.category_name,
    COUNT(DISTINCT cs.challenge_solve_id) as challenges_completed,
    SUM(cs.challenge_points)::bigint as total_points,
    MAX(cs.solved_at) as last_solved_at
  FROM game_platform_challenge_solves cs
  CROSS JOIN UNNEST(cs.nice_work_roles) AS role_id
  LEFT JOIN nice_framework_work_roles wr ON wr.element_identifier = role_id
  WHERE cs.syned_user_id = user_id
  GROUP BY role_id, wr.title, wr.category, wr.category_name
  ORDER BY challenges_completed DESC, total_points DESC
$$ LANGUAGE sql STABLE;

-- Get team's NICE work role coverage
CREATE OR REPLACE FUNCTION get_team_nice_work_role_coverage(team_id text)
RETURNS TABLE(
  work_role_id text,
  work_role_title text,
  category text,
  unique_competitors bigint,
  total_challenges bigint,
  total_points bigint
) AS $$
  SELECT
    role_id as work_role_id,
    wr.title as work_role_title,
    wr.category,
    COUNT(DISTINCT cs.syned_user_id) as unique_competitors,
    COUNT(DISTINCT cs.challenge_solve_id) as total_challenges,
    SUM(cs.challenge_points)::bigint as total_points
  FROM game_platform_challenge_solves cs
  CROSS JOIN UNNEST(cs.nice_work_roles) AS role_id
  LEFT JOIN nice_framework_work_roles wr ON wr.element_identifier = role_id
  WHERE cs.syned_team_id = team_id
  GROUP BY role_id, wr.title, wr.category
  ORDER BY total_challenges DESC
$$ LANGUAGE sql STABLE;
```

### Phase 4: API Routes

#### 4.1 New API Endpoints

**NICE Framework Reference Data:**
```
GET  /api/nice-framework/work-roles
     Query params: ?category=OG
     Response: Array<WorkRoleDetails>

GET  /api/nice-framework/work-roles/:id
     Response: WorkRoleDetails + associated tasks

GET  /api/nice-framework/tasks
     Response: Array<TaskDetails>

GET  /api/nice-framework/categories
     Response: Array<{ code: string, name: string, count: number }>
```

**User & Team Analytics:**
```
GET  /api/nice-framework/user-progress/:userId
     Response: Array<UserWorkRoleProgress>

GET  /api/nice-framework/team-coverage/:teamId
     Response: Array<TeamWorkRoleCoverage>

GET  /api/nice-framework/challenges
     Query params: ?work_role_id=DD-WRL-003&user_id=xxx
     Response: Array<ChallengeDetails>
```

**Admin Endpoints:**
```
POST /api/admin/nice-framework/seed
     Body: { force_refresh?: boolean }
     Response: SeedResult

GET  /api/admin/nice-framework/validate
     Response: { orphaned_roles: string[], stale_data: boolean }
```

#### 4.2 Database Views (Optional Performance Optimization)

```sql
-- Materialized view: User progress by NICE work role
CREATE MATERIALIZED VIEW IF NOT EXISTS user_nice_work_role_progress AS
SELECT
  cs.syned_user_id,
  role_id,
  wr.title as work_role_title,
  wr.category,
  wr.category_name,
  COUNT(DISTINCT cs.challenge_solve_id) as challenges_completed,
  SUM(cs.challenge_points) as total_points,
  MAX(cs.solved_at) as last_solved_at
FROM game_platform_challenge_solves cs
CROSS JOIN UNNEST(cs.nice_work_roles) AS role_id
LEFT JOIN nice_framework_work_roles wr ON wr.element_identifier = role_id
GROUP BY cs.syned_user_id, role_id, wr.title, wr.category, wr.category_name;

CREATE UNIQUE INDEX ON user_nice_work_role_progress (syned_user_id, role_id);
CREATE INDEX ON user_nice_work_role_progress (role_id);
CREATE INDEX ON user_nice_work_role_progress (category);

-- Refresh strategy: After each game platform sync
-- Can be triggered by cron job or manually
```

### Phase 5: UI/Dashboard Components

#### 5.1 NICE Work Role Badge Component

**New Component:** `components/nice-framework/work-role-badge.tsx`

```tsx
interface WorkRoleBadgeProps {
  workRoleId: string;
  showCategory?: boolean;
  clickable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function WorkRoleBadge({ workRoleId, showCategory = false, clickable = true, size = 'md' }: WorkRoleBadgeProps) {
  const category = workRoleId.split('-')[0];
  const color = getCategoryColor(category);

  // Fetch work role details from context or API
  const { data: workRole } = useWorkRole(workRoleId);

  return (
    <Badge
      variant={clickable ? 'outline' : 'secondary'}
      className={cn(
        'font-mono',
        getCategoryStyles(category),
        clickable && 'cursor-pointer hover:opacity-80'
      )}
      onClick={clickable ? () => showWorkRoleDialog(workRoleId) : undefined}
    >
      {showCategory && <span className="mr-1">{category}</span>}
      {workRole?.title || workRoleId}
    </Badge>
  );
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'OG': 'blue',    // Oversee & Govern
    'DD': 'green',   // Design & Development
    'IO': 'orange',  // Operate & Maintain
    'PD': 'red',     // Protect & Defend
    'IN': 'purple',  // Investigate
  };
  return colors[category] || 'gray';
}
```

**Category Color Scheme:**
- **OG (Oversee & Govern)** - Blue (#3B82F6)
- **DD (Design & Development)** - Green (#10B981)
- **IO (Operate & Maintain)** - Orange (#F59E0B)
- **PD (Protect & Defend)** - Red (#EF4444)
- **IN (Investigate)** - Purple (#8B5CF6)

#### 5.2 User Profile: NICE Skills Breakdown

**Add to Competitor Profile:** `app/dashboard/competitors/[id]/page.tsx`

```tsx
<section className="space-y-4">
  <h2 className="text-2xl font-bold">NICE Framework Skills</h2>

  <NiceSkillsBreakdown userId={competitorId} />
</section>
```

**New Component:** `components/nice-framework/skills-breakdown.tsx`

```tsx
export function NiceSkillsBreakdown({ userId }: { userId: string }) {
  const { data: progress } = useUserWorkRoleProgress(userId);

  return (
    <div className="space-y-4">
      {progress?.map(role => (
        <div key={role.work_role_id} className="space-y-2">
          <div className="flex items-center justify-between">
            <WorkRoleBadge workRoleId={role.work_role_id} showCategory />
            <div className="text-sm text-muted-foreground">
              {role.challenges_completed} challenges · {role.total_points} pts
            </div>
          </div>

          <Progress
            value={(role.challenges_completed / maxChallenges) * 100}
            className="h-2"
          />
        </div>
      ))}

      {(!progress || progress.length === 0) && (
        <p className="text-sm text-muted-foreground">
          No NICE Framework data available yet.
        </p>
      )}
    </div>
  );
}
```

#### 5.3 Challenge Details: Work Role Tags

**Update Challenge Table:** `components/game-platform/report-card/challenges-table.tsx`

Add a column showing NICE work roles as badges:

```tsx
{
  accessorKey: 'nice_work_roles',
  header: 'NICE Work Roles',
  cell: ({ row }) => (
    <div className="flex flex-wrap gap-1">
      {row.original.nice_work_roles?.map(roleId => (
        <WorkRoleBadge
          key={roleId}
          workRoleId={roleId}
          size="sm"
        />
      ))}
    </div>
  ),
}
```

#### 5.4 Releases Page Integration

**File:** `app/dashboard/releases/page.tsx`

Add a new section showing NICE Framework coverage in recent releases:

```tsx
<section className="space-y-4">
  <h2 className="text-xl font-semibold">NICE Framework Coverage</h2>

  <ReleaseNiceCoverage releaseId={latestRelease.id} />
</section>
```

**New Component:** `components/releases/nice-coverage.tsx`

```tsx
export function ReleaseNiceCoverage({ releaseId }: { releaseId: string }) {
  // Fetch challenges added in this release and their NICE work roles
  const { data: coverage } = useReleaseNiceCoverage(releaseId);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {coverage?.map(category => (
        <Card key={category.category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className={cn('w-3 h-3 rounded-full', getCategoryBgColor(category.category))} />
              {category.category_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">{category.new_challenges}</div>
              <p className="text-sm text-muted-foreground">new challenges</p>

              <div className="space-y-1">
                {category.work_roles.map(role => (
                  <div key={role.id} className="text-xs">
                    <WorkRoleBadge workRoleId={role.id} size="sm" />
                    <span className="ml-2 text-muted-foreground">
                      {role.challenge_count} challenges
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

#### 5.5 Admin Tool: NICE Framework Manager

**New Page:** `app/dashboard/admin-tools/nice-framework/page.tsx`

```tsx
export default function NiceFrameworkAdminPage() {
  const [isSeeding, setIsSeeding] = useState(false);
  const { data: stats } = useNiceFrameworkStats();

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const response = await fetch('/api/admin/nice-framework/seed', {
        method: 'POST',
      });
      const result = await response.json();
      toast.success(`Seeded ${result.workRolesSeeded} work roles and ${result.tasksSeeded} tasks`);
    } catch (error) {
      toast.error('Failed to seed NICE Framework data');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">NICE Framework Manager</h1>
        <p className="text-muted-foreground">
          Manage NIST NICE Framework reference data
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Framework Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">Work Roles</div>
              <div className="text-2xl font-bold">{stats?.work_roles_count || 0}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Tasks</div>
              <div className="text-2xl font-bold">{stats?.tasks_count || 0}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Last Updated</div>
              <div className="text-sm">{stats?.last_updated || 'Never'}</div>
            </div>
          </div>

          <Button
            onClick={handleSeed}
            disabled={isSeeding}
          >
            {isSeeding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Fetch & Update Framework Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <ValidationResults />
        </CardContent>
      </Card>
    </div>
  );
}
```

### Phase 6: Analytics & Reporting

#### 6.1 Coach Dashboard Enhancements

**New Metrics for Team View:**
- Team coverage across NICE work roles (radar chart)
- Identify gaps in work role exposure
- Trending work roles (most attempted/completed by team)
- Competitor specialization heat map

**New Component:** `components/analytics/nice-coverage-radar.tsx`

```tsx
export function NiceCoverageRadar({ teamId }: { teamId: string }) {
  const { data: coverage } = useTeamNiceCoverage(teamId);

  // Transform to radar chart data
  const chartData = coverage?.map(cat => ({
    category: cat.category_name,
    coverage: (cat.total_challenges / cat.available_challenges) * 100,
  }));

  return <RadarChart data={chartData} />;
}
```

#### 6.2 Leaderboards by Work Role

**New Page:** `app/dashboard/leaderboards/nice/page.tsx`

Features:
- Tab navigation by NICE category (OG, DD, IO, PD, IN)
- Top performers in each category
- Most diverse competitors (breadth across work roles)
- Filters: Time period, division, region

#### 6.3 Gap Analysis Tool

**Coach Tool:** Identify missing work role coverage for their team

```tsx
export function TeamGapAnalysis({ teamId }: { teamId: string }) {
  const { data: gaps } = useTeamNiceGaps(teamId);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Skill Gaps</h3>

      {gaps?.map(gap => (
        <Card key={gap.work_role_id}>
          <CardHeader>
            <WorkRoleBadge workRoleId={gap.work_role_id} />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Only {gap.competitors_with_coverage} of {gap.total_competitors} team members
              have completed challenges in this area.
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              View Recommended Challenges
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Phase 7: Advanced Features (Future Roadmap)

#### 7.1 Skill Recommendations

```
"Based on your progress in Secure Software Development (DD-WRL-003),
you might enjoy these challenges in Systems Architecture (DD-WRL-001)"
```

**Implementation:**
- Collaborative filtering based on challenge solve patterns
- Work role similarity scoring
- Personalized challenge suggestions

#### 7.2 Learning Pathways

Map NICE work roles to structured learning paths:
- Beginner → Intermediate → Advanced challenges per work role
- Progressive skill building
- Prerequisites and recommended sequences

#### 7.3 Certifications Mapping

Show how NICE work roles align with industry certifications:
- CISSP (Certified Information Systems Security Professional)
- CEH (Certified Ethical Hacker)
- OSCP (Offensive Security Certified Professional)
- Security+ (CompTIA Security+)

#### 7.4 Employer Skill Profiles

Allow companies to define desired NICE work role profiles:
- Match competitors to job requirements
- Talent pipeline analytics
- Recruitment tool integration

## Implementation Priorities

### Priority 1: Foundation (High Value, Low Complexity)
**Timeline:** Week 1-2

1. ✅ Database schema for NICE reference tables
2. ✅ Migration to add nice_work_roles column to challenge_solves
3. ✅ Backfill existing data from raw_payload
4. ✅ Admin tool UI for NICE Framework management
5. ✅ Data seeding API endpoint and service

**Success Criteria:**
- NICE work roles reference data populated
- All existing challenge solves have nice_work_roles extracted
- Admin can refresh NICE data via UI

### Priority 2: Core Integration (Medium Term)
**Timeline:** Week 3-4

1. Update sync service to populate nice_work_roles column
2. API endpoints for querying NICE data
3. User progress aggregation by work role (database functions)
4. Basic UI badge component
5. Display work roles in challenge tables

**Success Criteria:**
- New challenge syncs automatically populate NICE work roles
- API endpoints return correct NICE Framework data
- Competitors can see their work role progress

### Priority 3: Analytics & Coach Tools (Long Term)
**Timeline:** Week 5-8

1. Dashboard widgets showing NICE coverage
2. Team gap analysis tool
3. Leaderboards by work role
4. Integration into releases page
5. Materialized views for performance

**Success Criteria:**
- Coaches can view team NICE coverage
- Gap analysis identifies missing skills
- Releases show new work role coverage

### Priority 4: Advanced Features (Future)
**Timeline:** Post-launch

1. Skill recommendations engine
2. Learning pathway builder
3. Certifications mapping
4. Employer skill profiles

## Technical Considerations

### Data Integrity

**Challenge:**
- NIST JSON is authoritative but static
- MetaCTF may reference work role IDs not in NICE Framework

**Solution:**
- Validation function to find orphaned work role IDs
- Admin warning when unknown IDs detected
- Graceful handling in UI (show ID even if not in reference table)

### Performance

**Considerations:**
- NICE reference tables are small (~50 work roles, ~1000 tasks)
- Challenge solve queries with array searching can be slow
- Aggregation queries for analytics may be expensive

**Optimizations:**
- GIN indexes on nice_work_roles array column
- Materialized views for heavy aggregations
- Caching strategy for reference data (rarely changes)
- Database functions for complex queries

### Backwards Compatibility

**Approach:**
- Existing challenge solves have work roles in raw_payload
- Backfill migration ensures no data loss
- New syncs populate both raw_payload and nice_work_roles
- Old queries continue to work

### Testing Strategy

**Unit Tests:**
- NICE data parsing logic
- Work role extraction from API responses
- Category color mapping

**Integration Tests:**
- Sync service with NICE work roles
- Database functions for aggregation
- API endpoints return correct data

**E2E Tests:**
- Admin tool seeding workflow
- User viewing work role progress
- Coach analyzing team coverage

## Migration & Deployment Path

### Week 1: Foundation
- [ ] Create database migrations
- [ ] Deploy migrations to staging
- [ ] Build seeding service
- [ ] Test data ingestion

### Week 2: Admin Tooling
- [ ] Build admin UI page
- [ ] Create seed API endpoint
- [ ] Test full seeding workflow
- [ ] Deploy to production
- [ ] Seed production NICE data

### Week 3: Sync Integration
- [ ] Update game platform sync service
- [ ] Add nice_work_roles to repository types
- [ ] Deploy sync updates
- [ ] Verify new challenge solves populate correctly

### Week 4: API & Basic UI
- [ ] Implement NICE Framework API endpoints
- [ ] Create WorkRoleBadge component
- [ ] Update challenge tables to show work roles
- [ ] Test API responses

### Week 5-6: Analytics
- [ ] Build database aggregation functions
- [ ] Create user progress components
- [ ] Build team coverage dashboard
- [ ] Deploy analytics features

### Week 7-8: Polish & Documentation
- [ ] Releases page integration
- [ ] Leaderboards by work role
- [ ] Coach training documentation
- [ ] User-facing help content

## Success Metrics

### Coverage Metrics
- **Work Role Data Completeness:** % of challenge solves with NICE work roles populated
- **Reference Data Freshness:** Days since last NICE Framework update
- **Validation Health:** Number of orphaned work role IDs

### Engagement Metrics
- **User Interaction:** Click-through rate on work role badges
- **Dashboard Usage:** Coaches viewing NICE analytics
- **Profile Views:** Competitors viewing their NICE skill breakdown

### Business Impact
- **Coach Adoption:** % of coaches using work role filters/analytics
- **Competitor Awareness:** % of competitors who viewed NICE data
- **Team Planning:** Coaches using gap analysis for training

## Questions for Stakeholder Alignment

1. **Visibility:** Should NICE work roles be public (leaderboards) or coach-only?
2. **Explorer UI:** Do we want a dedicated "NICE Framework Explorer" for browsing all work roles?
3. **Releases Integration:** Show work role distribution for each release? Featured work roles?
4. **Reporting Frequency:** Real-time aggregation or nightly rollups for analytics?
5. **Custom Mappings:** Should we manually enhance task→work role mappings beyond NIST data?
6. **Marketing:** How do we communicate this feature to coaches and competitors?
7. **Certification Alignment:** Priority for mapping to industry certifications (CISSP, CEH, etc.)?

## References

- **NIST NICE Framework:** https://www.nist.gov/itl/applied-cybersecurity/nice/nice-framework-resource-center
- **Framework JSON:** https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json
- **NIST SP 800-181 Rev 1:** Workforce Framework for Cybersecurity (NICE Framework)
- **MetaCTF API:** `lib/integrations/game-platform/client.ts`
- **Challenge Solves Schema:** `supabase/migrations/20250926_game_platform_detail_tables.sql`

## Appendix: Category Reference

| Code | Name | Description | Example Work Roles |
|------|------|-------------|-------------------|
| OG | Oversee & Govern | Leadership, policy, and compliance | Executive Cybersecurity Leadership, Cybersecurity Program Manager |
| DD | Design & Development | Building and designing systems | Secure Software Developer, Systems Architect |
| IO | Operate & Maintain | Running and maintaining systems | Systems Administrator, Network Operations Specialist |
| PD | Protect & Defend | Defensive security operations | Incident Responder, Cybersecurity Analyst |
| IN | Investigate | Digital forensics and investigation | Cyber Crime Investigator, Digital Forensics Analyst |

---

**Document Status:** Design Complete - Ready for Implementation Review
**Next Steps:** Technical review → Priority 1 implementation → Stakeholder demo
