import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { createClient } from '@supabase/supabase-js';

function toIsoOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeChallengeCategoryLabel(raw?: string | null) {
  if (!raw) return 'Uncategorized';
  const cleaned = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Uncategorized';
  switch (cleaned) {
    case 'crypto':
    case 'cryptography':
      return 'Cryptography';
    case 'foren':
    case 'forensics':
      return 'Forensics';
    case 'reven':
    case 'reverse engineering':
    case 'reversing':
      return 'Reverse Engineering';
    case 'binexp':
    case 'binary exploitation':
      return 'Binary Exploitation';
    case 'osint':
      return 'OSINT';
    case 'web':
      return 'Web';
    case 'operating systems':
    case 'operating system':
    case 'os':
      return 'Operating Systems';
    case 'misc':
    case 'miscellaneous':
      return 'Miscellaneous';
    default:
      return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get time range from query params (7d, 30d, 90d, or custom)
    const range = request.nextUrl.searchParams.get('range') || '30d';

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceClient = (serviceRoleKey && serviceUrl)
      ? createClient(serviceUrl, serviceRoleKey, { auth: { persistSession: false } })
      : null;

    const isAdminUser = await isUserAdmin(supabase, user.id);
    const actingCoachCookie = cookieStore.get('admin_coach_id')?.value || null;
    const coachContextId = isAdminUser ? actingCoachCookie : user.id;

    let competitorsQuery = supabase
      .from('competitors')
      .select(`
        id,
        first_name,
        last_name,
        coach_id,
        status,
        years_competing,
        game_platform_id,
        game_platform_synced_at,
        game_platform_sync_error,
        team_members(team_id, teams(id, name, division, affiliation, game_platform_synced_at, game_platform_id)),
        coach:profiles!competitors_coach_id_fkey(full_name, email, school_name)
      `);

    if (isAdminUser) {
      if (actingCoachCookie) {
        competitorsQuery = competitorsQuery.eq('coach_id', actingCoachCookie);
      }
    } else {
      competitorsQuery = competitorsQuery.eq('coach_id', user.id);
    }

    const { data: competitors, error: competitorError } = await competitorsQuery;

    if (competitorError) {
      console.error('Dashboard competitors query failed', competitorError);
      return NextResponse.json({ error: 'Failed to load competitors' }, { status: 500 });
    }

    const competitorIds = (competitors || []).map((c) => c.id);

    let profileMappings: GamePlatformProfileRecord[] = [];
    if (competitorIds.length) {
      const { data: mappingData, error: mappingError } = await supabase
        .from('game_platform_profiles')
        .select('*')
        .in('competitor_id', competitorIds);

      if (mappingError) {
        console.error('Dashboard profile mapping query failed', mappingError);
      } else {
        profileMappings = mappingData ?? [];
      }
    }

    const mappingByCompetitorId = new Map<string, GamePlatformProfileRecord>();
    for (const mapping of profileMappings) {
      if (mapping.competitor_id) {
        mappingByCompetitorId.set(mapping.competitor_id, mapping);
      }
    }

    const gamePlatformIds = (competitors || [])
      .map((c) => c.game_platform_id || mappingByCompetitorId.get(c.id)?.synced_user_id)
      .filter((id): id is string => Boolean(id));

    let challengeSolves: any[] = [];
    let flashCtfEvents: any[] = [];
    let syncStates: any[] = [];
    let stats: any[] = [];
    let categoryTotals: Array<{
      synced_user_id: string;
      challenge_category: string | null;
      challenges: number;
      points: number;
    }> = [];

    if (competitorIds.length) {
      const statsClient = serviceClient ?? supabase;

      const { data: statsData, error: statsError } = await statsClient
        .from('game_platform_stats')
        .select('*')
        .in('competitor_id', competitorIds);
      if (statsError) {
        console.error('Dashboard stats query failed', statsError);
        stats = [];
      } else {
        stats = statsData || [];
      }

      // Query challenge solves from the normalized table (used for recent activity only)
      if (gamePlatformIds.length > 0) {
        const { data: syncStateData, error: syncStateError } = await statsClient
          .from('game_platform_sync_state')
          .select('synced_user_id, last_attempt_at, last_result, last_login_at, error_message')
          .in('synced_user_id', gamePlatformIds);

        if (syncStateError) {
          console.error('Dashboard sync state query failed', syncStateError);
          syncStates = [];
        } else {
          syncStates = syncStateData || [];
        }

        const { data: solvesData, error: solvesError } = await statsClient
          .from('game_platform_challenge_solves')
          .select('synced_user_id, challenge_title, challenge_category, challenge_points, source, solved_at')
          .in('synced_user_id', gamePlatformIds);

        if (solvesError) {
          console.error('Dashboard challenge solves query failed', solvesError);
          challengeSolves = [];
        } else {
          challengeSolves = solvesData || [];
        }

        const { data: categoryData, error: categoryError } = await statsClient
          .rpc('get_dashboard_category_totals', { p_synced_user_ids: gamePlatformIds });

        if (categoryError) {
          console.error('Dashboard category totals RPC failed', categoryError);
          categoryTotals = [];
        } else {
          categoryTotals = categoryData || [];
        }

        // Query Flash CTF events from the normalized table
        const { data: flashData, error: flashError } = await statsClient
          .from('game_platform_flash_ctf_events')
          .select('synced_user_id, event_id, flash_ctf_name, challenges_solved, points_earned, max_points_possible, rank, started_at')
          .in('synced_user_id', gamePlatformIds);

        if (flashError) {
          console.error('Dashboard Flash CTF events query failed', flashError);
          flashCtfEvents = [];
        } else {
          flashCtfEvents = flashData || [];
        }
      }
    }

    // Group challenge solves by competitor (for recent activity only)
    const solvesByCompetitor = new Map<string, any[]>();
    for (const solve of challengeSolves) {
      const key = solve.synced_user_id;
      if (!key) continue;
      if (!solvesByCompetitor.has(key)) {
        solvesByCompetitor.set(key, []);
      }
      solvesByCompetitor.get(key)!.push(solve);
    }

    // Group Flash CTF events by competitor
    const flashEventsByCompetitor = new Map<string, any[]>();
    for (const event of flashCtfEvents) {
      const key = event.synced_user_id;
      if (!key) continue;
      if (!flashEventsByCompetitor.has(key)) {
        flashEventsByCompetitor.set(key, []);
      }
      flashEventsByCompetitor.get(key)!.push(event);
    }

    const statsMap = new Map<string, any>();
    for (const stat of stats) {
      statsMap.set(stat.competitor_id, stat);
    }

    const categoryTotalsByUserId = new Map<string, Array<{ category: string; challenges: number; points: number }>>();
    for (const row of categoryTotals) {
      if (!row?.synced_user_id) continue;
      const list = categoryTotalsByUserId.get(row.synced_user_id) ?? [];
      list.push({
        category: normalizeChallengeCategoryLabel(row.challenge_category),
        challenges: row.challenges ?? 0,
        points: row.points ?? 0,
      });
      categoryTotalsByUserId.set(row.synced_user_id, list);
    }

    const syncStateByUserId = new Map<string, any>();
    for (const state of syncStates) {
      if (state?.synced_user_id) {
        syncStateByUserId.set(state.synced_user_id, state);
      }
    }

    const competitorMap = new Map<string, any>();
    const competitorList: any[] = [];
    const teamRoster = new Map<string, any>();

    // Pre-populate teamRoster with every team in the coach context so that
    // teams with zero members still surface on the dashboard (flagged "Empty").
    {
      let teamsQuery = supabase
        .from('teams')
        .select('id, name, division, affiliation, game_platform_synced_at, game_platform_id, coach_id, profiles!teams_coach_id_fkey(school_name)');
      if (isAdminUser) {
        if (actingCoachCookie) teamsQuery = teamsQuery.eq('coach_id', actingCoachCookie);
      } else {
        teamsQuery = teamsQuery.eq('coach_id', user.id);
      }
      const { data: allTeams } = await teamsQuery;
      for (const t of allTeams ?? []) {
        teamRoster.set(t.id, {
          teamId: t.id,
          name: t.name,
          division: t.division,
          affiliation: t.affiliation ?? (t.profiles as any)?.school_name ?? null,
          totalMembers: 0,
          syncedMembers: 0,
          activeMembers: 0,
          rookieMembers: 0,
          membersWithExperienceKnown: 0,
          membersOnPlatform: [] as Array<{
            competitorId: string;
            name: string;
            status: string | null;
            challengesCompleted: number;
            monthlyCtf: number;
            categoryPoints: Record<string, number>;
            categoryCounts: Record<string, number>;
          }>,
          membersOffPlatform: [] as Array<{ competitorId: string; name: string; status: string | null }>,
          lastSync: toIsoOrNull(t.game_platform_synced_at),
          totalChallenges: 0,
          totalPoints: 0,
        });
      }
    }

    for (const competitor of competitors || []) {
      const profileMapping = mappingByCompetitorId.get(competitor.id) ?? null;
      const syncedUserId = competitor.game_platform_id || profileMapping?.synced_user_id || null;
      const membershipRaw = competitor.team_members;
      const teamMembership = Array.isArray(membershipRaw)
        ? membershipRaw[0] ?? null
        : membershipRaw ?? null;
      const teamRecord = teamMembership?.teams || null;
      const fallbackAffiliation = teamRecord?.affiliation ?? competitor.coach?.school_name ?? null;
      const team = teamRecord
        ? {
            ...teamRecord,
            affiliation: teamRecord.affiliation ?? fallbackAffiliation,
          }
        : null;

      const stat = statsMap.get(competitor.id);
      const challengesCompleted = stat?.challenges_completed ?? 0;
      const monthlyCtf = stat?.monthly_ctf_challenges ?? 0;
      const lastActivity = stat?.last_activity ? toIsoOrNull(stat.last_activity) : null;

      // Calculate category counts AND points from aggregated totals
      const categoryCounts: Record<string, number> = {};
      const categoryPoints: Record<string, number> = {};

      const categoryRows = syncedUserId ? (categoryTotalsByUserId.get(syncedUserId) || []) : [];
      for (const row of categoryRows) {
        categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + row.challenges;
        categoryPoints[row.category] = (categoryPoints[row.category] ?? 0) + row.points;
      }

      competitorMap.set(competitor.id, {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        coach_id: competitor.coach_id,
        status: competitor.status,
        game_platform_id: syncedUserId,
        game_platform_synced_at: competitor.game_platform_synced_at ?? profileMapping?.last_synced_at ?? null,
        game_platform_sync_error: competitor.game_platform_sync_error ?? profileMapping?.sync_error ?? null,
        team_id: teamMembership?.team_id || null,
        team,
        coach_name: competitor.coach?.full_name ?? null,
        coach_school: competitor.coach?.school_name ?? null,
        challenges_completed: challengesCompleted,
        monthly_ctf_challenges: monthlyCtf,
        last_activity: lastActivity,
        category_points: categoryPoints,
        category_counts: categoryCounts,
        game_platform_profile: profileMapping,
      });

      competitorList.push({
        id: competitor.id,
        coach_id: competitor.coach_id,
        team: team ? {
          id: team.id,
          name: team.name,
          division: team.division,
          affiliation: team.affiliation ?? competitor.coach?.school_name ?? null,
        } : null,
        game_platform_id: syncedUserId,
        status: competitor.status,
        name: `${competitor.first_name} ${competitor.last_name}`.trim(),
      });

      if (team) {
        // Pre-populated above from the teams table. Fall back to a fresh
        // entry in the unlikely case the competitor references a team not
        // in the coach's scope.
        const roster = teamRoster.get(team.id) ?? {
          teamId: team.id,
          name: team.name,
          division: team.division,
          affiliation: team.affiliation ?? competitor.coach?.school_name ?? null,
          totalMembers: 0,
          syncedMembers: 0,
          activeMembers: 0,
          rookieMembers: 0,
          membersWithExperienceKnown: 0,
          membersOnPlatform: [] as Array<{
            competitorId: string;
            name: string;
            status: string | null;
            challengesCompleted: number;
            monthlyCtf: number;
            categoryPoints: Record<string, number>;
            categoryCounts: Record<string, number>;
          }>,
          membersOffPlatform: [] as Array<{ competitorId: string; name: string; status: string | null }>,
          lastSync: toIsoOrNull(team.game_platform_synced_at),
          totalChallenges: 0,
          totalPoints: 0,
        };

        roster.totalMembers += 1;

        // Pending competitors — early-rules holdovers without complete
        // demographics — are NOT eligible to compete. They're counted in
        // totalMembers (coach can still see them) but excluded from the
        // first-timer roll-up.
        const isPending = competitor.status === 'pending';
        if (!isPending) {
          roster.activeMembers += 1;
          const yc = (competitor as { years_competing?: number | null }).years_competing;
          if (typeof yc === 'number') {
            roster.membersWithExperienceKnown += 1;
            if (yc === 0) roster.rookieMembers += 1;
          }
        }
        if (syncedUserId) {
          roster.syncedMembers += 1;
          roster.membersOnPlatform.push({
            competitorId: competitor.id,
            name: `${competitor.first_name} ${competitor.last_name}`.trim(),
            status: competitor.status ?? null,
            challengesCompleted,
            monthlyCtf,
            categoryPoints,
            categoryCounts,
          });
        } else {
          roster.membersOffPlatform.push({
            competitorId: competitor.id,
            name: `${competitor.first_name} ${competitor.last_name}`.trim(),
            status: competitor.status ?? null,
          });
        }

        const teamSynced = toIsoOrNull(team.game_platform_synced_at);
        if (teamSynced && (!roster.lastSync || teamSynced > roster.lastSync)) {
          roster.lastSync = teamSynced;
        }

        teamRoster.set(team.id, roster);
      }
    }

    const now = Date.now();
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Calculate time window cutoff based on range parameter
    let rangeStartTime: Date | null;
    switch (range) {
      case '7d':
        rangeStartTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        rangeStartTime = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        rangeStartTime = null; // No time filtering
        break;
      case '30d':
      default:
        rangeStartTime = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    let totalChallenges = 0;
    let activeRecently = 0;
    let lastSyncedAt: string | null = null;
    let lastSyncRunAt: string | null = null;

    // Prefer global sync run tracking (reflects when the sync job actually executed).
    if (serviceClient) {
      try {
        const { data: lastCompleted } = await serviceClient
          .from('game_platform_sync_runs')
          .select('completed_at')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCompleted?.completed_at) {
          lastSyncRunAt = new Date(lastCompleted.completed_at).toISOString();
        } else {
          const { data: latestRun } = await serviceClient
            .from('game_platform_sync_runs')
            .select('started_at, completed_at')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const ts = latestRun?.completed_at ?? latestRun?.started_at ?? null;
          lastSyncRunAt = ts ? new Date(ts).toISOString() : null;
        }
      } catch {
        lastSyncRunAt = null;
      }
    }

    const leaderboard: Array<{
      competitorId: string;
      name: string;
      teamName: string | null;
      challenges: number;
      totalPoints: number;
      lastActivity: string | null;
      categoryPoints: Record<string, number>;
      categoryCounts: Record<string, number>;
    }> = [];

    for (const competitor of competitorMap.values()) {
      if (!competitor?.game_platform_id) continue;

      const challenges = competitor.challenges_completed ?? 0;
      const points = Object.values(competitor.category_points || {}).reduce((sum: number, value: number) => sum + value, 0);
      const lastActivity = competitor.last_activity ? new Date(competitor.last_activity) : null;

      // Use category data already calculated from the database query
      const categoryCounts = competitor.category_counts || {};
      const categoryPoints = competitor.category_points || {};

      // Get Flash CTF events from the normalized table instead of raw_data
      const competitorFlashEvents = competitor.game_platform_id
        ? (flashEventsByCompetitor.get(competitor.game_platform_id) || [])
        : [];
      const flashChallenges = competitorFlashEvents.reduce((sum: number, entry: any) =>
        sum + (entry?.challenges_solved ?? 0), 0);

      totalChallenges += challenges;
      if (lastActivity && lastActivity.getTime() >= fourteenDaysAgo) activeRecently += 1;
      const syncedAtTime = toIsoOrNull(competitor.game_platform_synced_at);
      if (syncedAtTime && (!lastSyncedAt || syncedAtTime > lastSyncedAt)) {
        lastSyncedAt = syncedAtTime;
      }

      leaderboard.push({
        competitorId: competitor.id,
        name: `${competitor.first_name} ${competitor.last_name}`.trim(),
        teamName: competitor.team?.name ?? null,
        challenges,
        totalPoints: points,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        categoryPoints,
        categoryCounts,
      });
    }

    leaderboard.sort((a, b) => {
      if (b.challenges === a.challenges) {
        return b.totalPoints - a.totalPoints;
      }
      return b.challenges - a.challenges;
    });

    for (const entry of leaderboard) {
      const competitor = competitorMap.get(entry.competitorId);
      if (!competitor?.team || !competitor.team.id) continue;
      const roster = teamRoster.get(competitor.team.id) ?? {
        teamId: competitor.team.id,
        name: competitor.team.name,
        division: competitor.team.division,
        affiliation: competitor.team.affiliation,
        totalMembers: 0,
        syncedMembers: 0,
        membersOnPlatform: [] as Array<{ competitorId: string; name: string; status: string | null }>,
        membersOffPlatform: [] as Array<{ competitorId: string; name: string; status: string | null }>,
        lastSync: toIsoOrNull(competitor.team.game_platform_synced_at),
        totalChallenges: 0,
        totalPoints: 0,
      };

      roster.totalChallenges += entry.challenges;
      roster.totalPoints += entry.totalPoints;
      const teamSynced = toIsoOrNull(competitor.team.game_platform_synced_at);
      if (teamSynced && (!roster.lastSync || teamSynced > roster.lastSync)) {
        roster.lastSync = teamSynced;
      }

      teamRoster.set(competitor.team.id, roster);
    }

    const teams = Array.from(teamRoster.values()).map((team) => ({
      ...team,
      memberCount: team.syncedMembers,
      pendingMembers: Math.max(team.totalMembers - team.syncedMembers, 0),
      avgScore: team.syncedMembers ? Math.round(team.totalPoints / team.syncedMembers) : 0,
      // Empty = no rostered members at all (after the teams-table pre-populate
      // we keep these visible so the coach can see the gap).
      isEmpty: team.totalMembers === 0,
      // All-first-timers is computed on ACTIVE members (status != pending):
      // every active member must have years_competing recorded, and every
      // one of them must be 0. Teams with only pending members don't flag.
      allFirstTimers:
        team.activeMembers > 0 &&
        team.membersWithExperienceKnown === team.activeMembers &&
        team.rookieMembers === team.activeMembers,
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    const unsyncedCompetitors = (competitors || [])
      .filter((c) => {
        const mapping = mappingByCompetitorId.get(c.id);
        return !c.game_platform_id && !mapping?.synced_user_id;
      })
      .map((c) => ({
        competitorId: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        coachName: c.coach?.full_name ?? null,
      }));

    const syncErrors = (competitors || [])
      .map((c) => {
        const mapping = mappingByCompetitorId.get(c.id);
        return {
          competitorId: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          coachName: c.coach?.full_name ?? null,
          error: c.game_platform_sync_error ?? mapping?.sync_error ?? null,
          coachName: c.coach?.full_name ?? null,
        };
      })
      .filter((entry) => !!entry.error);

    const approvalConflicts = (competitors || [])
      .map((c) => {
        const mapping = mappingByCompetitorId.get(c.id);
        const syncedUserId = c.game_platform_id || mapping?.synced_user_id || null;
        if (!syncedUserId) return null;
        const syncState = syncStateByUserId.get(syncedUserId) ?? null;
        if (!syncState || syncState.last_result !== 'failure') return null;

        const message = typeof syncState.error_message === 'string' ? syncState.error_message : '';
        const normalized = message.toLowerCase();
        const needsApproval = normalized.includes('not approved') || normalized.includes('pending_approval') || normalized.includes('pending approval');
        if (!needsApproval) return null;

        return {
          competitorId: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          coachName: c.coach?.full_name ?? null,
          syncedUserId,
          type: 'approval',
          message,
          lastAttemptAt: toIsoOrNull(syncState.last_attempt_at),
        };
      })
      .filter(Boolean);

    const activationNeeded = (competitors || [])
      .map((c) => {
        const mapping = mappingByCompetitorId.get(c.id);
        if (!mapping || mapping.status !== 'user_created') return null;
        const syncedUserId = c.game_platform_id || mapping.synced_user_id || null;
        if (!syncedUserId) return null;
        const syncState = syncStateByUserId.get(syncedUserId) ?? null;
        if (syncState?.last_login_at) return null;

        return {
          competitorId: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          coachName: c.coach?.full_name ?? null,
          syncedUserId,
          type: 'activation',
          message: 'Activation needed: confirm the competitor received their MetaCTF welcome email and activated their account.',
          lastAttemptAt: null,
        };
      })
      .filter(Boolean);

    const actionRequired = (() => {
      const merged = new Map<string, any>();
      for (const item of approvalConflicts) {
        if (item?.competitorId) merged.set(item.competitorId, item);
      }
      for (const item of activationNeeded) {
        if (item?.competitorId && !merged.has(item.competitorId)) {
          merged.set(item.competitorId, item);
        }
      }
      return Array.from(merged.values());
    })();

    const staleStats = leaderboard.filter((entry) => {
      if (!entry.lastActivity) return true;
      const ts = new Date(entry.lastActivity).getTime();
      return Number.isNaN(ts) || ts < fourteenDaysAgo;
    });

    const recentActivity = (() => {
      const events: Array<{ at: string; label: string; type: 'sync' | 'challenge' | 'ctf' }> = [];
      const rangeStartMs = rangeStartTime ? rangeStartTime.getTime() : null;

      const competitorBySyncedUserId = new Map<string, { competitorId: string; name: string }>();
      for (const competitor of competitors || []) {
        const mapping = mappingByCompetitorId.get(competitor.id);
        const syncedUserId = competitor.game_platform_id || mapping?.synced_user_id || null;
        if (!syncedUserId) continue;
        competitorBySyncedUserId.set(syncedUserId, {
          competitorId: competitor.id,
          name: `${competitor.first_name} ${competitor.last_name}`.trim(),
        });
      }

      const syncAt = lastSyncRunAt ?? lastSyncedAt;
      if (syncAt) {
        const iso = toIsoOrNull(syncAt);
        if (iso) {
          events.push({
            at: iso,
            label: 'Stats sync completed',
            type: 'sync',
          });
        }
      }

      const solveEvents = (challengeSolves || [])
        .map((solve: any) => {
          const solvedAt = toIsoOrNull(solve?.solved_at);
          if (!solvedAt) return null;
          const solvedMs = new Date(solvedAt).getTime();
          if (rangeStartMs !== null && solvedMs < rangeStartMs) return null;

          const syncedUserId = typeof solve?.synced_user_id === 'string' ? solve.synced_user_id : null;
          const competitor = syncedUserId ? competitorBySyncedUserId.get(syncedUserId) : null;
          const name = competitor?.name ?? 'Unknown competitor';

          const title = typeof solve?.challenge_title === 'string' && solve.challenge_title.trim().length > 0
            ? solve.challenge_title.trim()
            : 'a challenge';
          const shortTitle = title.length > 90 ? `${title.slice(0, 89)}…` : title;
          const category = typeof solve?.challenge_category === 'string' && solve.challenge_category.trim().length > 0
            ? solve.challenge_category.trim()
            : null;
          const points = typeof solve?.challenge_points === 'number' ? solve.challenge_points : null;

          const label = `${name} solved “${shortTitle}”${category ? ` (${category})` : ''}${points !== null ? ` (+${points})` : ''}`;
          return { at: solvedAt, label, type: 'challenge' as const };
        })
        .filter((entry): entry is { at: string; label: string; type: 'challenge' } => Boolean(entry))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 6);

      const ctfEvents = (flashCtfEvents || [])
        .map((event: any) => {
          const startedAt = toIsoOrNull(event?.started_at);
          if (!startedAt) return null;
          const startedMs = new Date(startedAt).getTime();
          if (rangeStartMs !== null && startedMs < rangeStartMs) return null;

          const syncedUserId = typeof event?.synced_user_id === 'string' ? event.synced_user_id : null;
          const competitor = syncedUserId ? competitorBySyncedUserId.get(syncedUserId) : null;
          const name = competitor?.name ?? 'Unknown competitor';

          const ctfName = typeof event?.flash_ctf_name === 'string' && event.flash_ctf_name.trim().length > 0
            ? event.flash_ctf_name.trim()
            : 'Flash CTF';
          const solved = typeof event?.challenges_solved === 'number' ? event.challenges_solved : null;
          const points = typeof event?.points_earned === 'number' ? event.points_earned : null;

          const label = `${name} played ${ctfName}${solved !== null ? ` (${solved} challenges)` : ''}${points !== null ? ` (+${points} pts)` : ''}`;
          return { at: startedAt, label, type: 'ctf' as const };
        })
        .filter((entry): entry is { at: string; label: string; type: 'ctf' } => Boolean(entry))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 6);

      events.push(...solveEvents, ...ctfEvents);
      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return events.slice(0, 8);
    })();

    // Build Flash CTF momentum data

    let flashCtfMomentum: any = { students: [] };

    // Calculate monthly CTF participants from the normalized flash_ctf_events table
    let monthlyCtfParticipantsFromEvents = 0;

    // Build reverse lookup: synced_user_id -> competitor record
    const syncedIdToCompetitor = new Map<string, any>();
    for (const competitor of competitorMap.values()) {
      if (competitor.game_platform_id) {
        syncedIdToCompetitor.set(competitor.game_platform_id, competitor);
      }
    }

    // Use the full set of synced IDs (includes profile mapping fallbacks)
    const allSyncedIds = Array.from(syncedIdToCompetitor.keys());

    if (allSyncedIds.length > 0) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const flashClient = (serviceRoleKey && serviceUrl)
        ? createClient(serviceUrl, serviceRoleKey, { auth: { persistSession: false } })
        : supabase;

      const { data: flashEvents } = await flashClient
          .from('game_platform_flash_ctf_events')
          .select('synced_user_id, event_id, flash_ctf_name, challenges_solved, points_earned, max_points_possible, rank, started_at, raw_payload')
          .in('synced_user_id', allSyncedIds)
        .order('started_at', { ascending: false });

      // Calculate participants within the selected time range
      if (flashEvents && flashEvents.length > 0) {
        const participantsInRange = new Set<string>();
        for (const event of flashEvents) {
          if (!event.started_at) continue;
          const eventDate = new Date(event.started_at);
          if (rangeStartTime === null || eventDate >= rangeStartTime) {
            if (event.synced_user_id) {
              participantsInRange.add(event.synced_user_id);
            }
          }
        }
        monthlyCtfParticipantsFromEvents = participantsInRange.size;
      }

      // Group events by competitor, building per-student summaries with nested events
      const studentDataMap = new Map<string, {
        competitorId: string;
        name: string;
        totalCtfs: number;
        totalScore: number;
        events: any[];
      }>();

      (flashEvents || []).forEach(event => {
        if (!event.synced_user_id) return;
        const competitor = syncedIdToCompetitor.get(event.synced_user_id);
        if (!competitor) return;

        if (!studentDataMap.has(competitor.id)) {
          studentDataMap.set(competitor.id, {
            competitorId: competitor.id,
            name: `${competitor.first_name} ${competitor.last_name}`.trim(),
            totalCtfs: 0,
            totalScore: 0,
            events: [],
          });
        }

        const student = studentDataMap.get(competitor.id)!;
        student.totalCtfs += 1;
        student.totalScore += event.points_earned || 0;

        // Extract challenge details from raw_payload
        const challengeDetails: Array<{ name: string; category: string; points: number; solvedAt: string }> = [];
        const rawPayload = typeof event.raw_payload === 'string'
          ? (() => { try { return JSON.parse(event.raw_payload); } catch { return null; } })()
          : event.raw_payload;

        if (rawPayload && Array.isArray(rawPayload.challenge_solves)) {
          rawPayload.challenge_solves.forEach((ch: any) => {
            challengeDetails.push({
              name: ch.challenge_title || 'Unknown Challenge',
              category: normalizeChallengeCategoryLabel(ch.challenge_category),
              points: ch.challenge_points || 0,
              solvedAt: ch.timestamp_unix ? new Date(ch.timestamp_unix * 1000).toISOString() : event.started_at,
            });
          });
        }

        const payloadMaxPoints = typeof rawPayload?.max_points_possible === 'number'
          ? rawPayload.max_points_possible : null;
        const payloadRank = typeof rawPayload?.rank === 'number'
          ? rawPayload.rank : null;

        student.events.push({
          eventName: event.flash_ctf_name,
          date: event.started_at,
          challenges: event.challenges_solved || 0,
          points: event.points_earned || 0,
          pointsPossible: event.max_points_possible ?? payloadMaxPoints ?? null,
          rank: event.rank ?? payloadRank ?? null,
          challengeDetails,
        });
      });

      // Sort students by total score descending
      const students = Array.from(studentDataMap.values())
        .sort((a, b) => b.totalScore - a.totalScore);

      flashCtfMomentum = { students };
    }

    const response = {
      global: {
        totalCompetitors: competitors?.length ?? 0,
        syncedCompetitors: (competitors || []).filter((c) => {
          const mapping = mappingByCompetitorId.get(c.id);
          return Boolean(c.game_platform_id || mapping?.synced_user_id);
        }).length,
        activeRecently,
        totalChallenges,
        monthlyCtfParticipants: monthlyCtfParticipantsFromEvents,
        lastSyncedAt: lastSyncRunAt ?? lastSyncedAt,
      },
      leaderboard,
      teams,
      flashCtfMomentum,
      alerts: {
        unsyncedCompetitors,
        syncErrors,
        actionRequired,
        staleCompetitors: staleStats,
      },
      recentActivity,
      controller: {
        isAdmin: isAdminUser,
        coachId: coachContextId,
      },
      competitors: competitorList,
    };

    console.log('[dashboard] coachContext', coachContextId, 'teams', teams.length, 'competitors', competitors?.length ?? 0);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Game Platform dashboard route failed', error);
    return NextResponse.json({ error: error?.message ?? 'Internal server error' }, { status: 500 });
  }
}
