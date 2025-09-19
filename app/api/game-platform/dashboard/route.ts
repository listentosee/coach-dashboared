import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';

function toIsoOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdminUser = await isUserAdmin(supabase, user.id);
    const actingCoachId = isAdminUser ? (cookieStore.get('admin_coach_id')?.value || null) : user.id;

    let competitorsQuery = supabase
      .from('competitors')
      .select(`
        id,
        first_name,
        last_name,
        coach_id,
        status,
        game_platform_id,
        game_platform_synced_at,
        game_platform_sync_error,
        team_members(team_id, teams(id, name, division, affiliation, game_platform_synced_at, game_platform_id))
      `);

    if (isAdminUser) {
      if (actingCoachId && actingCoachId !== user.id) {
        competitorsQuery = competitorsQuery.eq('coach_id', actingCoachId);
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
    let stats: any[] = [];
    if (competitorIds.length) {
      const { data: statsData, error: statsError } = await supabase
        .from('game_platform_stats')
        .select('*')
        .in('competitor_id', competitorIds);
      if (statsError) {
        console.error('Dashboard stats query failed', statsError);
        return NextResponse.json({ error: 'Failed to load platform stats' }, { status: 500 });
      }
      stats = statsData || [];
    }

    const competitorMap = new Map<string, any>();
    for (const competitor of competitors || []) {
      const teamMembership = Array.isArray(competitor.team_members) ? competitor.team_members[0] : null;
      const team = teamMembership?.teams || null;
      competitorMap.set(competitor.id, {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        coach_id: competitor.coach_id,
        status: competitor.status,
        game_platform_id: competitor.game_platform_id,
        game_platform_synced_at: competitor.game_platform_synced_at,
        game_platform_sync_error: competitor.game_platform_sync_error,
        team_id: teamMembership?.team_id || null,
        team,
      });
    }

    const now = Date.now();
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    let totalChallenges = 0;
    let monthlyParticipants = 0;
    let activeRecently = 0;
    let lastSyncedAt: string | null = null;

    const leaderboard: Array<{
      competitorId: string;
      name: string;
      teamName: string | null;
      challenges: number;
      totalPoints: number;
      lastActivity: string | null;
      categoryPoints: Record<string, number>;
    }> = [];

    for (const stat of stats) {
      const competitor = competitorMap.get(stat.competitor_id);
      if (!competitor) continue;

      const challenges = stat.challenges_completed ?? 0;
      const points = stat.total_score ?? 0;
      const lastActivity = stat.last_activity ? new Date(stat.last_activity) : null;
      const raw = stat.raw_data || {};
      const categoryPoints = raw?.scores?.category_points ?? {};
      const flashEntries = raw?.flash_ctfs ?? [];
      const flashChallenges = flashEntries.reduce((sum: number, entry: any) => sum + (entry?.challenges_solved ?? 0), 0);

      totalChallenges += challenges;
      if (flashChallenges > 0) monthlyParticipants += 1;
      if (lastActivity && lastActivity.getTime() >= fourteenDaysAgo) activeRecently += 1;
      if (stat.synced_at) {
        const syncedAtTime = new Date(stat.synced_at).toISOString();
        if (!lastSyncedAt || syncedAtTime > lastSyncedAt) {
          lastSyncedAt = syncedAtTime;
        }
      }

      leaderboard.push({
        competitorId: competitor.id,
        name: `${competitor.first_name} ${competitor.last_name}`.trim(),
        teamName: competitor.team?.name ?? null,
        challenges,
        totalPoints: points,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        categoryPoints,
      });
    }

    leaderboard.sort((a, b) => {
      if (b.challenges === a.challenges) {
        return b.totalPoints - a.totalPoints;
      }
      return b.challenges - a.challenges;
    });

    const teamStats = new Map<string, {
      teamId: string;
      name: string;
      division?: string | null;
      affiliation?: string | null;
      totalChallenges: number;
      totalPoints: number;
      memberCount: number;
      lastSync: string | null;
    }>();

    for (const entry of leaderboard) {
      const competitor = competitorMap.get(entry.competitorId);
      if (!competitor?.team || !competitor.team.id) continue;
      const existing = teamStats.get(competitor.team.id) ?? {
        teamId: competitor.team.id,
        name: competitor.team.name,
        division: competitor.team.division,
        affiliation: competitor.team.affiliation,
        totalChallenges: 0,
        totalPoints: 0,
        memberCount: 0,
        lastSync: toIsoOrNull(competitor.team.game_platform_synced_at),
      };

      existing.totalChallenges += entry.challenges;
      existing.totalPoints += entry.totalPoints;
      existing.memberCount += 1;
      const teamSynced = toIsoOrNull(competitor.team.game_platform_synced_at);
      if (teamSynced && (!existing.lastSync || teamSynced > existing.lastSync)) {
        existing.lastSync = teamSynced;
      }
      teamStats.set(competitor.team.id, existing);
    }

    const teams = Array.from(teamStats.values()).map((team) => ({
      ...team,
      avgScore: team.memberCount ? Math.round(team.totalPoints / team.memberCount) : 0,
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    const unsyncedCompetitors = (competitors || [])
      .filter((c) => !c.game_platform_id)
      .map((c) => ({
        competitorId: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
      }));

    const syncErrors = (competitors || [])
      .filter((c) => !!c.game_platform_sync_error)
      .map((c) => ({
        competitorId: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        error: c.game_platform_sync_error,
      }));

    const staleStats = leaderboard.filter((entry) => {
      if (!entry.lastActivity) return true;
      const ts = new Date(entry.lastActivity).getTime();
      return Number.isNaN(ts) || ts < fourteenDaysAgo;
    });

    const response = {
      global: {
        totalCompetitors: competitors?.length ?? 0,
        syncedCompetitors: stats.length,
        activeRecently,
        totalChallenges,
        monthlyCtfParticipants: monthlyParticipants,
        lastSyncedAt,
      },
      leaderboard,
      teams,
      alerts: {
        unsyncedCompetitors,
        syncErrors,
        staleCompetitors: staleStats,
      },
      controller: {
        isAdmin: isAdminUser,
        coachId: actingCoachId,
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Game Platform dashboard route failed', error);
    return NextResponse.json({ error: error?.message ?? 'Internal server error' }, { status: 500 });
  }
}
