import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getGamePlatformProfile } from '@/lib/integrations/game-platform/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// NIST NICE Work Role code mappings
const NIST_ROLE_NAMES: Record<string, string> = {
  'SP-SYS-001': 'Information Systems Security Manager',
  'SP-SYS-002': 'Information Systems Security Officer',
  'PR-CDA-001': 'Cyber Defense Analyst',
  'PR-INF-001': 'Cyber Defense Infrastructure Support Specialist',
  'AN-TWA-001': 'Threat/Warning Analyst',
  'CO-OPL-001': 'Cyber Ops Planner',
  'OM-ANA-001': 'All-Source Analyst',
  'OM-NET-001': 'Network Operations Specialist',
  'OV-PMA-001': 'Privacy Officer/Privacy Compliance Manager',
  'OV-TEA-001': 'Information Technology Program Auditor',
  'OV-MGT-001': 'Information Technology Project Manager',
  'OV-LGA-001': 'Cyber Legal Advisor',
  'OV-TEA-002': 'Information Technology Investment/Portfolio Manager',
  'IN-FOR-001': 'Digital Forensics Analyst',
  'IN-FOR-002': 'Cyber Crime Investigator',
  'AN-ASA-001': 'Exploitation Analyst',
  'CO-CLO-001': 'Cyber Intel Planner',
  'SP-DEV-001': 'Software Developer',
  'SP-DEV-002': 'Secure Software Assessor',
  'SP-ARC-001': 'Enterprise Architect',
  'SP-ARC-002': 'Security Architect',
  'SP-TRD-001': 'Research & Development Specialist',
  'SP-TRD-002': 'Systems Developer',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ competitorId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { competitorId } = await params;

    // Get competitor and verify access
    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select(`
        id,
        first_name,
        last_name,
        email_personal,
        email_school,
        grade,
        division,
        game_platform_id,
        game_platform_synced_at,
        coach_id,
        team_members(
          teams(
            id,
            name,
            division
          )
        )
      `)
      .eq('id', competitorId)
      .single();

    if (competitorError || !competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const isOwningCoach = competitor.coach_id === user.id;

    if (!isAdmin && !isOwningCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If no game platform ID, return minimal data
    const profileMapping = await getGamePlatformProfile(supabase, { competitorId: competitor.id }).catch(() => null);
    const syncedUserId = profileMapping?.synced_user_id ?? competitor.game_platform_id ?? null;

    // Fetch summary stats
    const { data: summaryData } = syncedUserId
      ? await supabase
          .from('game_platform_challenge_solves')
          .select('challenge_points, solved_at, challenge_category')
          .eq('synced_user_id', syncedUserId)
      : { data: null };

    const totalChallenges = summaryData?.length || 0;
    const totalPoints = summaryData?.reduce((sum, c) => sum + (c.challenge_points || 0), 0) || 0;

    const odlChallenges = summaryData?.filter(c => c.solved_at).length || 0; // Simplified
    const daysActive = new Set(summaryData?.map(c => c.solved_at?.split('T')[0])).size || 0;
    const lastActivity = summaryData?.[0]?.solved_at || null;

    // Fetch domain breakdown
    const { data: domainData } = syncedUserId
      ? await supabase.rpc('get_domain_stats', {
          p_syned_user_id: syncedUserId
        })
      : { data: null };

    // Fallback if RPC doesn't exist - calculate manually
    let domains = [];
    if (!domainData && summaryData) {
      const domainMap = new Map<string, { challenges: number; points: number; minPoints: number; maxPoints: number }>();

      for (const challenge of summaryData) {
        const categoryRaw = (challenge as any).challenge_category || 'miscellaneous';
        const category = normalizeChallengeCategoryLabel(categoryRaw);
        const points = challenge.challenge_points || 0;

        if (!domainMap.has(category)) {
          domainMap.set(category, { challenges: 0, points: 0, minPoints: points, maxPoints: points });
        }

        const stats = domainMap.get(category)!;
        stats.challenges++;
        stats.points += points;
        stats.minPoints = Math.min(stats.minPoints, points);
        stats.maxPoints = Math.max(stats.maxPoints, points);
      }

      domains = Array.from(domainMap.entries())
        .map(([category, stats], index) => ({
          category,
          challengesCompleted: stats.challenges,
          totalPoints: stats.points,
          avgDifficulty: stats.maxPoints > 400 ? 'hard' : stats.maxPoints > 200 ? 'medium' : 'easy',
          rank: index + 1,
          strength: stats.points > totalPoints / 5 ? 'strong' : stats.challenges < 3 ? 'growth_area' : 'developing'
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((d, i) => ({ ...d, rank: i + 1 }));
    } else {
      const normalizedDomains = (domainData || []).map((domain: any, index: number) => {
        const categoryRaw = domain.category ?? domain.challenge_category ?? 'miscellaneous';
        const category = normalizeChallengeCategoryLabel(categoryRaw);
        const challengesCompleted = Number(
          domain.challengesCompleted ?? domain.challenges_completed ?? domain.challenges ?? 0,
        ) || 0;
        const totalPointsValue = Number(
          domain.totalPoints ?? domain.total_points ?? domain.points ?? 0,
        ) || 0;
        const avgDifficulty = domain.avgDifficulty ?? domain.avg_difficulty ?? 'easy';
        const strength = domain.strength
          ?? (totalPointsValue > totalPoints / 5
            ? 'strong'
            : challengesCompleted < 3
              ? 'growth_area'
              : 'developing');
        const rank = Number(domain.rank) || index + 1;

        return {
          category,
          challengesCompleted,
          totalPoints: totalPointsValue,
          avgDifficulty,
          strength,
          rank,
        };
      });

      domains = normalizedDomains
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((domain, index) => ({ ...domain, rank: index + 1 }));
    }

    // Fetch ALL challenges for NIST role calculation
    const { data: allChallenges } = syncedUserId
      ? await supabase
          .from('game_platform_challenge_solves')
          .select('*')
          .eq('synced_user_id', syncedUserId)
      : { data: null };

    // Fetch recent challenges for display (limited to 50)
    const recentChallenges = allChallenges?.slice(0, 50).sort((a, b) =>
      new Date(b.solved_at).getTime() - new Date(a.solved_at).getTime()
    ) || [];

    // Fetch Flash CTF events
    const { data: flashCtfEvents } = syncedUserId
      ? await supabase
          .from('game_platform_flash_ctf_events')
          .select('*')
          .eq('synced_user_id', syncedUserId)
          .order('started_at', { ascending: false })
      : { data: null };

    // Build activity timeline (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const timelineMap = new Map<string, { points: number; challenges: number }>();

    for (const challenge of summaryData || []) {
      if (!challenge.solved_at) continue;
      const date = challenge.solved_at.split('T')[0];
      const solvedDate = new Date(date);

      if (solvedDate >= ninetyDaysAgo) {
        if (!timelineMap.has(date)) {
          timelineMap.set(date, { points: 0, challenges: 0 });
        }
        const stats = timelineMap.get(date)!;
        stats.points += challenge.challenge_points || 0;
        stats.challenges++;
      }
    }

    const activityTimeline = Array.from(timelineMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Generate insights
    const insights = generateInsights({
      domains,
      activityTimeline,
      flashCtfEvents: flashCtfEvents || [],
      totalChallenges,
    });

    // Calculate NIST coverage with points per role from ALL challenges
    const nistRolesMap = new Map<string, number>(); // role_id -> total points
    for (const challenge of allChallenges || []) {
      const roles = (challenge.raw_payload as any)?.nist_nice_work_roles || [];
      const points = challenge.challenge_points || 0;
      roles.forEach((role: string) => {
        nistRolesMap.set(role, (nistRolesMap.get(role) || 0) + points);
      });
    }

    // Fetch work role details from database
    const { data: workRolesData } = await supabase
      .from('nice_framework_work_roles')
      .select('work_role_id, title')
      .in('work_role_id', Array.from(nistRolesMap.keys()));

    const workRolesMap = new Map<string, string>();
    workRolesData?.forEach(role => {
      workRolesMap.set(role.work_role_id, role.title);
    });

    // Sort by points and take top 7
    const allRoles = Array.from(nistRolesMap.entries())
      .map(([roleId, points]) => ({
        code: roleId,
        name: workRolesMap.get(roleId) || NIST_ROLE_NAMES[roleId] || roleId,
        points
      }))
      .sort((a, b) => b.points - a.points);

    console.log(`[NIST] Total roles found: ${allRoles.length}, taking top 7`);
    const nistRoleDetails = allRoles.slice(0, 7);
    console.log(`[NIST] Returning ${nistRoleDetails.length} roles:`, nistRoleDetails.map(r => r.name));

    // Build response
    return NextResponse.json({
      competitor: {
        id: competitor.id,
        name: `${competitor.first_name} ${competitor.last_name}`,
        email: competitor.email_school || competitor.email_personal,
        grade: competitor.grade,
        division: competitor.division,
        team: competitor.team_members?.[0]?.teams?.name || null,
        teamDivision: competitor.team_members?.[0]?.teams?.division || null,
        gamePlatformSynced: Boolean(syncedUserId),
        syncStatus: profileMapping?.status ?? null,
        syncError: profileMapping?.sync_error ?? null,
        lastSynced: competitor.game_platform_synced_at,
      },
      summary: {
        totalPoints,
        totalChallenges,
        odlChallenges,
        flashCtfEvents: flashCtfEvents?.length || 0,
        lastActivity,
        daysActive,
      },
      domains,
      recentChallenges: (recentChallenges || []).map(c => ({
        id: c.id,
        solvedAt: c.solved_at,
        title: c.challenge_title,
        category: c.challenge_category,
        source: c.source === 'odl' ? 'ODL' : c.source,
        points: c.challenge_points,
        nistRoles: (c.raw_payload as any)?.nist_nice_work_roles || [],
      })),
      flashCtfEvents: (flashCtfEvents || []).map(e => ({
        eventId: e.event_id,
        name: e.flash_ctf_name,
        date: e.started_at,
        rank: e.rank ?? (e.raw_payload as any)?.rank ?? null,
        challengesSolved: e.challenges_solved,
        pointsEarned: e.points_earned,
        pointsPossible: e.max_points_possible ?? (e.raw_payload as any)?.max_points_possible ?? null,
        topCategory: null, // Would need to calculate from challenge solves
      })),
      activityTimeline,
      insights,
      nistCoverage: {
        rolesCovered: nistRoleDetails,
        totalRoles: nistRoleDetails.length,
        coveragePercent: Math.round((nistRoleDetails.length / 7) * 100), // Out of top 7 displayed
      },
    });

  } catch (error: any) {
    console.error('[report-card] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateInsights({
  domains,
  activityTimeline,
  flashCtfEvents,
  totalChallenges,
}: {
  domains: any[];
  activityTimeline: any[];
  flashCtfEvents: any[];
  totalChallenges: number;
}) {
  const insights = [];

  // Strength identification
  const topDomains = domains.slice(0, 3);
  for (const domain of topDomains) {
    if (domain.challengesCompleted >= 5) {
      insights.push({
        type: 'strength',
        message: `Strong in ${domain.category}! Completed ${domain.challengesCompleted} challenges.`,
        priority: 'high'
      });
    }
  }

  // Growth areas
  const weakDomains = domains
    .filter(d => d.challengesCompleted > 0 && d.challengesCompleted < 3)
    .sort((a, b) => a.challengesCompleted - b.challengesCompleted);
  const allCategories = [
    'web', 'cryptography', 'osint', 'forensics',
    'binary_exploitation', 'reverse_engineering',
    'networking', 'operating_systems', 'miscellaneous'
  ];
  const normalizeCategoryKey = (raw?: string | null) => {
    if (!raw) return null;
    const cleaned = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    switch (cleaned) {
      case 'crypto':
      case 'cryptography':
        return 'cryptography';
      case 'foren':
      case 'forensics':
        return 'forensics';
      case 'reven':
      case 'reverse engineering':
      case 'reversing':
        return 'reverse_engineering';
      case 'binexp':
      case 'binary exploitation':
        return 'binary_exploitation';
      case 'osint':
        return 'osint';
      case 'web':
        return 'web';
      case 'operating systems':
      case 'operating system':
      case 'os':
        return 'operating_systems';
      case 'misc':
      case 'miscellaneous':
        return 'miscellaneous';
      default:
        return cleaned.replace(/\s+/g, '_');
    }
  };

  const exploredCategories = new Set(
    domains
      .filter(d => d.challengesCompleted > 0)
      .map(d => normalizeCategoryKey(d.category))
      .filter((value): value is string => Boolean(value))
  );
  const missingCategories = allCategories.filter(c => !exploredCategories.has(c));

  if (missingCategories.length > 0) {
    const formattedDomains = missingCategories
      .map(c => c.replace('_', ' '))
      .map(c => c.charAt(0).toUpperCase() + c.slice(1))
      .slice(0, 5)
      .join(', ');
    const extraCount = Math.max(missingCategories.length - 5, 0);

    insights.push({
      type: 'growth_area',
      message: `${missingCategories.length} domain${missingCategories.length > 1 ? 's' : ''} not yet explored: ${formattedDomains}${extraCount ? ` (+${extraCount} more)` : ''}. Try one starter challenge in a new domain this week.`,
      priority: 'medium'
    });
  }

  if (weakDomains.length > 0) {
    const focus = weakDomains
      .slice(0, 3)
      .map(d => `${d.category.replace('_', ' ')} (${d.challengesCompleted})`)
      .map(c => c.charAt(0).toUpperCase() + c.slice(1))
      .join(', ');

    insights.push({
      type: 'growth_area',
      message: `Lightly explored: ${focus}. Aim for 2–3 more challenges to build momentum.`,
      priority: 'medium'
    });
  }

  // Recent activity
  const last7Days = activityTimeline.slice(-7);
  const recentActivity = last7Days.some(d => d.challenges > 0);

  if (recentActivity) {
    const recentPoints = last7Days.reduce((sum, d) => sum + d.points, 0);
    const recentChallenges = last7Days.reduce((sum, d) => sum + d.challenges, 0);
    insights.push({
      type: 'activity',
      message: `Active in last 7 days: ${recentChallenges} challenges, ${recentPoints} points earned!`,
      priority: 'high'
    });
  } else if (totalChallenges > 0) {
    insights.push({
      type: 'activity',
      message: 'No recent activity in the last 7 days. Encourage continued practice!',
      priority: 'medium'
    });
  }

  // Flash CTF progress
  if (flashCtfEvents.length >= 2) {
    const sorted = [...flashCtfEvents].sort((a, b) =>
      new Date(a.date || a.started_at).getTime() - new Date(b.date || b.started_at).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];

    if (latest.rank && previous.rank && latest.rank < previous.rank) {
      insights.push({
        type: 'flash_ctf',
        message: `Rank improved from #${previous.rank} to #${latest.rank} in latest Flash CTF! 📈`,
        priority: 'high'
      });
    }

    insights.push({
      type: 'flash_ctf',
      message: `Participated in ${flashCtfEvents.length} Flash CTF events. Great consistency!`,
      priority: 'medium'
    });
  }

  // Milestone celebrations
  if (totalChallenges >= 50 && totalChallenges < 55) {
    insights.push({
      type: 'milestone',
      message: `Approaching 50 challenge milestone! (${totalChallenges}/50)`,
      priority: 'high'
    });
  } else if (totalChallenges >= 100) {
    insights.push({
      type: 'milestone',
      message: `Impressive! Completed ${totalChallenges} challenges. Elite level! 🏆`,
      priority: 'high'
    });
  }

  return insights.length > 0 ? insights : [
    {
      type: 'getting_started',
      message: 'Just getting started! First challenges are the hardest - keep going!',
      priority: 'medium'
    }
  ];
}

function normalizeChallengeCategoryLabel(raw?: string | null) {
  if (!raw) return 'Miscellaneous';
  const cleaned = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Miscellaneous';
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
