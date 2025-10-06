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
        game_platform_id,
        game_platform_synced_at,
        game_platform_sync_error,
        team_members(team_id, teams(id, name, division, affiliation, game_platform_synced_at, game_platform_id)),
        coach:profiles!competitors_coach_id_fkey(school_name)
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
    const gamePlatformIds = (competitors || [])
      .filter(c => c.game_platform_id)
      .map(c => c.game_platform_id);

    let stats: any[] = [];
    let challengeSolves: any[] = [];
    let flashCtfEvents: any[] = [];

    if (competitorIds.length) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const statsClient = (serviceRoleKey && serviceUrl)
        ? createClient(serviceUrl, serviceRoleKey, { auth: { persistSession: false } })
        : supabase;

      const { data: statsData, error: statsError } = await statsClient
        .from('game_platform_stats')
        .select('*')
        .in('competitor_id', competitorIds);
      if (statsError) {
        console.error('Dashboard stats query failed', statsError);
        // Don't fail the whole request, just log and continue with empty stats
        stats = [];
      } else {
        stats = statsData || [];
      }

      // Query challenge solves from the normalized table
      if (gamePlatformIds.length > 0) {
        const { data: solvesData, error: solvesError } = await statsClient
          .from('game_platform_challenge_solves')
          .select('syned_user_id, challenge_title, challenge_category, challenge_points, source, solved_at')
          .in('syned_user_id', gamePlatformIds);

        if (solvesError) {
          console.error('Dashboard challenge solves query failed', solvesError);
          challengeSolves = [];
        } else {
          challengeSolves = solvesData || [];
        }

        // Query Flash CTF events from the normalized table
        const { data: flashData, error: flashError } = await statsClient
          .from('game_platform_flash_ctf_events')
          .select('syned_user_id, event_id, flash_ctf_name, challenges_solved, points_earned, started_at')
          .in('syned_user_id', gamePlatformIds);

        if (flashError) {
          console.error('Dashboard Flash CTF events query failed', flashError);
          flashCtfEvents = [];
        } else {
          flashCtfEvents = flashData || [];
        }
      }
    }

    const statsMap = new Map<string, any>();
    for (const stat of stats) {
      statsMap.set(stat.competitor_id, stat);
    }

    // Group challenge solves by competitor
    const solvesByCompetitor = new Map<string, any[]>();
    for (const solve of challengeSolves) {
      if (!solvesByCompetitor.has(solve.syned_user_id)) {
        solvesByCompetitor.set(solve.syned_user_id, []);
      }
      solvesByCompetitor.get(solve.syned_user_id)!.push(solve);
    }

    // Group Flash CTF events by competitor
    const flashEventsByCompetitor = new Map<string, any[]>();
    for (const event of flashCtfEvents) {
      if (!flashEventsByCompetitor.has(event.syned_user_id)) {
        flashEventsByCompetitor.set(event.syned_user_id, []);
      }
      flashEventsByCompetitor.get(event.syned_user_id)!.push(event);
    }

    const competitorMap = new Map<string, any>();
    const competitorList: any[] = [];
    const teamRoster = new Map<string, any>();

    for (const competitor of competitors || []) {
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

      // Get challenge solves from the normalized table instead of raw_data
      const competitorSolves = competitor.game_platform_id
        ? (solvesByCompetitor.get(competitor.game_platform_id) || [])
        : [];

      // Calculate category counts AND points from actual challenge solves
      const categoryCounts: Record<string, number> = {};
      const categoryPoints: Record<string, number> = {};

      competitorSolves.forEach((solve: any) => {
        const category = solve?.challenge_category || 'Uncategorized';
        categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
        categoryPoints[category] = (categoryPoints[category] ?? 0) + (solve?.challenge_points ?? 0);
      });

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
        coach_school: competitor.coach?.school_name ?? null,
        challenges_completed: challengesCompleted,
        monthly_ctf_challenges: monthlyCtf,
        category_points: categoryPoints,
        category_counts: categoryCounts,
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
        game_platform_id: competitor.game_platform_id,
        status: competitor.status,
        name: `${competitor.first_name} ${competitor.last_name}`.trim(),
      });

      if (team) {
        const roster = teamRoster.get(team.id) ?? {
          teamId: team.id,
          name: team.name,
          division: team.division,
          affiliation: team.affiliation ?? competitor.coach?.school_name ?? null,
          totalMembers: 0,
          syncedMembers: 0,
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
        if (competitor.game_platform_id) {
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

    for (const stat of stats) {
      const competitor = competitorMap.get(stat.competitor_id);
      if (!competitor) continue;

      const challenges = stat.challenges_completed ?? 0;
      const points = stat.total_score ?? 0;
      const lastActivity = stat.last_activity ? new Date(stat.last_activity) : null;

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

    // Calculate Flash CTF momentum data for Monthly CTF panel
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Query Flash CTF events for all synced competitors
    const syncedCompetitorIds = (competitors || [])
      .filter(c => c.game_platform_id)
      .map(c => c.game_platform_id);

    let flashCtfMomentum: any = {
      students: [],
      alerts: { noParticipation: 0, declining: 0 },
      monthlyTotals: []
    };

    // Calculate monthly CTF participants from the normalized flash_ctf_events table
    let monthlyCtfParticipantsFromEvents = 0;

    if (syncedCompetitorIds.length > 0) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const flashClient = (serviceRoleKey && serviceUrl)
        ? createClient(serviceUrl, serviceRoleKey, { auth: { persistSession: false } })
        : supabase;

      const { data: flashEvents } = await flashClient
        .from('game_platform_flash_ctf_events')
        .select('syned_user_id, event_id, flash_ctf_name, challenges_solved, points_earned, started_at, raw_payload')
        .in('syned_user_id', syncedCompetitorIds)
        .gte('started_at', twelveMonthsAgo.toISOString())
        .order('started_at', { ascending: false });

      // Calculate participants within the selected time range
      if (flashEvents && flashEvents.length > 0) {
        const participantsInRange = new Set<string>();
        for (const event of flashEvents) {
          if (!event.started_at) continue;
          const eventDate = new Date(event.started_at);
          // Check if event is within the selected time range
          if (rangeStartTime === null || eventDate >= rangeStartTime) {
            participantsInRange.add(event.syned_user_id);
          }
        }
        monthlyCtfParticipantsFromEvents = participantsInRange.size;
      }

      const studentDataMap = new Map();
      const monthlyTotalsMap = new Map();

      (flashEvents || []).forEach(event => {
        const competitor = competitorMap.get(Array.from(competitorMap.values()).find((c: any) => c.game_platform_id === event.syned_user_id)?.id || '');
        if (!competitor) return;

        const eventDate = new Date(event.started_at);
        const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;

        if (!studentDataMap.has(competitor.id)) {
          studentDataMap.set(competitor.id, {
            competitorId: competitor.id,
            name: `${competitor.first_name} ${competitor.last_name}`.trim(),
            thisMonthEvents: 0,
            last3MonthsEvents: 0,
            totalEvents12mo: 0,
            challengesSolved: 0,
            lastParticipated: null,
          });
        }

        const student = studentDataMap.get(competitor.id);
        student.totalEvents12mo += 1;
        student.challengesSolved += event.challenges_solved || 0;

        if (!student.lastParticipated || event.started_at > student.lastParticipated) {
          student.lastParticipated = event.started_at;
        }

        if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
          student.thisMonthEvents += 1;
        }

        if (eventDate >= threeMonthsAgo) {
          student.last3MonthsEvents += 1;
        }

        const totalCount = monthlyTotalsMap.get(monthKey) || { month: monthKey, participants: new Set() };
        totalCount.participants.add(competitor.id);
        monthlyTotalsMap.set(monthKey, totalCount);
      });

      // Add competitors with no Flash CTF participation
      (competitors || []).forEach(c => {
        if (c.game_platform_id && !studentDataMap.has(c.id)) {
          studentDataMap.set(c.id, {
            competitorId: c.id,
            name: `${c.first_name} ${c.last_name}`.trim(),
            thisMonthEvents: 0,
            last3MonthsEvents: 0,
            totalEvents12mo: 0,
            challengesSolved: 0,
            lastParticipated: null,
          });
        }
      });

      let noParticipation = 0;
      let declining = 0;

      const students = Array.from(studentDataMap.values()).map(student => {
        const last3MonthsAvg = student.last3MonthsEvents / 3;
        let status: 'none' | 'declining' | 'active' = 'active';

        if (student.thisMonthEvents === 0 && student.totalEvents12mo === 0) {
          status = 'none';
          noParticipation += 1;
        } else if (student.thisMonthEvents === 0 && student.totalEvents12mo > 0) {
          status = 'declining';
          declining += 1;
        } else if (last3MonthsAvg > 0 && student.thisMonthEvents < last3MonthsAvg * 0.5) {
          status = 'declining';
          declining += 1;
        }

        return {
          ...student,
          last3MonthsAvg: Math.round(last3MonthsAvg * 10) / 10,
          status,
        };
      });

      students.sort((a, b) => {
        const statusOrder = { none: 0, declining: 1, active: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        if (!a.lastParticipated && !b.lastParticipated) return 0;
        if (!a.lastParticipated) return -1;
        if (!b.lastParticipated) return 1;
        return a.lastParticipated < b.lastParticipated ? -1 : 1;
      });

      const monthlyTotalsArray = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const data = monthlyTotalsMap.get(monthKey);
        monthlyTotalsArray.push({
          month: monthKey,
          participants: data ? data.participants.size : 0,
        });
      }

      // Group Flash CTF events by competitor for drill-down
      const eventsByCompetitor = new Map<string, any[]>();
      (flashEvents || []).forEach(event => {
        const competitor = Array.from(competitorMap.values()).find((c: any) => c.game_platform_id === event.syned_user_id);
        if (!competitor) return;

        if (!eventsByCompetitor.has(competitor.id)) {
          eventsByCompetitor.set(competitor.id, []);
        }
        // Extract challenge details from raw_payload
        const challengeDetails: Array<{ name: string; category: string; points: number; solvedAt: string }> = [];
        if (event.raw_payload && Array.isArray(event.raw_payload.challenge_solves)) {
          event.raw_payload.challenge_solves.forEach((ch: any) => {
            challengeDetails.push({
              name: ch.challenge_title || 'Unknown Challenge',
              category: ch.challenge_category || 'Uncategorized',
              points: ch.challenge_points || 0,
              solvedAt: ch.timestamp_unix ? new Date(ch.timestamp_unix * 1000).toISOString() : event.started_at,
            });
          });
        }

        eventsByCompetitor.get(competitor.id)!.push({
          eventName: event.flash_ctf_name,
          date: event.started_at,
          challenges: event.challenges_solved || 0,
          points: event.points_earned || 0,
          challengeDetails,
        });
      });

      flashCtfMomentum = {
        students,
        alerts: { noParticipation, declining },
        monthlyTotals: monthlyTotalsArray,
        eventsByCompetitor: Object.fromEntries(eventsByCompetitor),
      };
    }

    const response = {
      global: {
        totalCompetitors: competitors?.length ?? 0,
        syncedCompetitors: stats.length,
        activeRecently,
        totalChallenges,
        monthlyCtfParticipants: monthlyCtfParticipantsFromEvents,
        lastSyncedAt,
      },
      leaderboard,
      teams,
      flashCtfMomentum,
      alerts: {
        unsyncedCompetitors,
        syncErrors,
        staleCompetitors: staleStats,
      },
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
