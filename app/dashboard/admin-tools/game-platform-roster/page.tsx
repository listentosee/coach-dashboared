import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GamePlatformRosterTable, type GamePlatformRosterRow } from '@/components/dashboard/admin/game-platform-roster-table';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

export const dynamic = 'force-dynamic';

type SearchParams = {
  coach_id?: string;
};

type CoachRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type CompetitorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_school: string | null;
  email_personal: string | null;
  game_platform_id: string | null;
};

type ProfileRow = {
  competitor_id: string | null;
  metactf_role: string | null;
  synced_user_id: string | null;
  metactf_user_id: number | null;
  metactf_username: string | null;
  status: string | null;
};

type SyncStateRow = {
  synced_user_id: string;
  last_result: string | null;
  last_attempt_at: string | null;
  last_remote_accessed_at: string | null;
  last_login_at: string | null;
  error_message: string | null;
};

const formatCompetitorName = (first?: string | null, last?: string | null) => {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || 'Unnamed competitor';
};

export default async function GamePlatformRosterPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : undefined;
  const coachId = resolvedParams?.coach_id?.trim() || '';

  const { data: coaches } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'coach')
    .order('full_name');

  const coachRows = (coaches as CoachRow[] | null) || [];
  const selectedCoach = coachRows.find((coach) => coach.id === coachId) || null;
  const coachLabel = selectedCoach
    ? (selectedCoach.full_name || selectedCoach.email || selectedCoach.id)
    : null;

  let rows: GamePlatformRosterRow[] = [];
  let errorMessage: string | null = null;

  if (coachId) {
    const { data: competitors, error: competitorError } = await supabase
      .from('competitors')
      .select('id, first_name, last_name, email_school, email_personal, game_platform_id')
      .eq('coach_id', coachId)
      .order('last_name', { ascending: true });

    if (competitorError) {
      errorMessage = competitorError.message;
    } else {
      const competitorRows = (competitors as CompetitorRow[] | null) || [];
      const competitorIds = competitorRows.map((competitor) => competitor.id);

      let profileMappings: ProfileRow[] = [];
      if (competitorIds.length) {
        const { data: mappingData } = await supabase
          .from('game_platform_profiles')
          .select('competitor_id, metactf_role, synced_user_id, metactf_user_id, metactf_username, status')
          .in('competitor_id', competitorIds);

        profileMappings = (mappingData as ProfileRow[] | null) || [];
      }

      const mappingByCompetitorId = new Map<string, ProfileRow>();
      for (const mapping of profileMappings) {
        if (mapping.competitor_id) {
          mappingByCompetitorId.set(mapping.competitor_id, mapping);
        }
      }

      const syncedUserIds = competitorRows
        .map((competitor) => {
          const mapping = mappingByCompetitorId.get(competitor.id);
          return competitor.game_platform_id || mapping?.synced_user_id || null;
        })
        .filter((value): value is string => Boolean(value));

      const uniqueSyncedIds = Array.from(new Set(syncedUserIds));

      let syncStates: SyncStateRow[] = [];
      if (uniqueSyncedIds.length) {
        const fetchSyncStates = async (client: any) => {
          const { data: syncStateData, error: syncStateError } = await client
            .from('game_platform_sync_state')
            .select('synced_user_id, last_result, last_attempt_at, last_remote_accessed_at, last_login_at, error_message')
            .in('synced_user_id', uniqueSyncedIds);

          if (syncStateError) {
            throw syncStateError;
          }
          return (syncStateData as SyncStateRow[] | null) || [];
        };

        try {
          const serviceSupabase = getServiceRoleSupabaseClient();
          syncStates = await fetchSyncStates(serviceSupabase);
        } catch (err) {
          console.error('Service role query failed for game_platform_sync_state', err);
          try {
            syncStates = await fetchSyncStates(supabase);
          } catch (fallbackError) {
            console.error('Fallback query failed for game_platform_sync_state', fallbackError);
          }
        }
      }

      const syncStateByUserId = new Map<string, SyncStateRow>();
      for (const state of syncStates) {
        if (state?.synced_user_id) {
          syncStateByUserId.set(state.synced_user_id, state);
        }
      }

      rows = competitorRows.map((competitor) => {
        const mapping = mappingByCompetitorId.get(competitor.id);
        const syncedUserId = competitor.game_platform_id || mapping?.synced_user_id || null;
        const syncState = syncedUserId ? syncStateByUserId.get(syncedUserId) : null;

        return {
          competitor_id: competitor.id,
          competitor_name: formatCompetitorName(competitor.first_name, competitor.last_name),
          email_school: competitor.email_school ?? null,
          email_personal: competitor.email_personal ?? null,
          game_platform_id: competitor.game_platform_id ?? mapping?.synced_user_id ?? null,
          metactf_role: mapping?.metactf_role ?? null,
          metactf_user_id: mapping?.metactf_user_id ?? null,
          metactf_username: mapping?.metactf_username ?? null,
          metactf_status: mapping?.status ?? null,
          last_result: syncState?.last_result ?? null,
          last_attempt_at: syncState?.last_attempt_at ?? null,
          last_accessed_at: syncState?.last_remote_accessed_at ?? null,
          last_login_at: syncState?.last_login_at ?? null,
          error_message: syncState?.error_message ?? null,
        };
      });
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Game Platform Roster</h1>
        <p className="text-meta-muted mt-2">
          Review MetaCTF profile mappings and sync health for each student.
        </p>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Coach Selection</CardTitle>
          <CardDescription className="text-meta-muted">
            Choose a coach to view their students&apos; game platform details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" action="/dashboard/admin-tools/game-platform-roster" method="get">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-meta-muted" htmlFor="coach_id">Coach</label>
              <select
                id="coach_id"
                name="coach_id"
                defaultValue={coachId}
                className="min-w-[260px] bg-meta-dark border border-meta-border text-meta-light px-3 py-2 rounded"
              >
                <option value="">Select a coach</option>
                {coachRows.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.full_name || coach.email || coach.id}
                  </option>
                ))}
              </select>
            </div>
            <button className="px-4 py-2 rounded bg-meta-accent text-white" type="submit">
              Apply
            </button>
          </form>

          {!coachId && (
            <div className="rounded border border-dashed border-meta-border p-4 text-sm text-meta-muted">
              Select a coach to load their roster.
            </div>
          )}

          {coachId && (
            <>
              <div className="text-sm text-meta-muted">
                {coachLabel ? `Showing ${rows.length} students for ${coachLabel}.` : `Showing ${rows.length} students.`}
              </div>

              {errorMessage ? (
                <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  Failed to load roster: {errorMessage}
                </div>
              ) : (
                <GamePlatformRosterTable rows={rows} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
