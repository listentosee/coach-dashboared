import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import type { DemographicChartConfig } from '@/components/dashboard/admin/demographic-charts';

type ActivityBucket = 'school_day' | 'weekday_before_school' | 'weekday_after_school' | 'weekend' | 'unknown';

export type SharedSchoolMapPoint = {
  id: string;
  coachName: string;
  schoolName: string;
  division: string | null;
  lat: number;
  lon: number;
};

export type SharedAnalyticsMetric = {
  label: string;
  value: number;
  secondary?: string;
};

export type SharedMetricRow = {
  label: string;
  value: number;
  secondary?: string;
};

export type SharedAnalyticsReport = {
  generatedAt: string;
  metrics: SharedAnalyticsMetric[];
  schoolMapPoints: SharedSchoolMapPoint[];
  statusCounts: {
    pending: number;
    profile: number;
    in_the_game_not_compliant: number;
    complete: number;
  };
  releasePipeline: {
    notStarted: number;
    sent: number;
    complete: number;
  };
  divisionChart: DemographicChartConfig;
  demographicCharts: DemographicChartConfig[];
  totalChallengesSolved: number;
  linkedPlatformCompetitors: number;
  activityCounts: {
    total: number;
    schoolDay: number;
    outsideSchool: number;
    weekdayBeforeSchool: number;
    weekdayAfterSchool: number;
    weekend: number;
  };
  outsideSchoolPct: number;
  ctfParticipationRows: SharedMetricRow[];
  divisionChallengeRows: SharedMetricRow[];
  topicClusterRows: SharedMetricRow[];
  flashParticipantCount: number;
  flashEntryCount: number;
};

interface ServiceSupabaseLike {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        range: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>;
      };
    };
  };
}

const pacificActivityFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

function normalizeLabel(value: string | null | undefined) {
  if (!value) return null;
  const base = value.trim().toLowerCase();
  if (!base) return null;
  return base
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDivisionLabel(division?: string | null, programTrack?: string | null) {
  const normalizedDivision = (division || '').trim().toLowerCase();
  if (normalizedDivision === 'college') {
    return (programTrack || '').trim().toLowerCase() === 'adult_ed' ? 'ROP College' : 'Traditional College';
  }
  if (normalizedDivision === 'middle_school') return 'Middle School';
  if (normalizedDivision === 'high_school') return 'High School';
  return 'Unassigned';
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

function classifyPacificActivity(timestamp?: string | null): ActivityBucket {
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

function buildChartData(
  rows: Array<Record<string, unknown>>,
  key: string,
  fallbackLabel: string
): DemographicChartConfig['data'] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = typeof row[key] === 'string' ? (row[key] as string) : null;
    const label = normalizeLabel(raw) || fallbackLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

async function fetchAllRowsByIds<T>({
  client,
  table,
  columns,
  idColumn,
  ids,
  chunkSize = 50,
  pageSize = 1000,
}: {
  client: ServiceSupabaseLike;
  table: string;
  columns: string;
  idColumn: string;
  ids: string[];
  chunkSize?: number;
  pageSize?: number;
}): Promise<T[]> {
  if (!ids.length) return [];

  const rows: T[] = [];

  for (let chunkStart = 0; chunkStart < ids.length; chunkStart += chunkSize) {
    const chunk = ids.slice(chunkStart, chunkStart + chunkSize);
    let from = 0;

    while (true) {
      const { data, error } = await client
        .from(table)
        .select(columns)
        .in(idColumn, chunk)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const page = (data || []) as T[];
      rows.push(...page);

      if (page.length < pageSize) break;
      from += pageSize;
    }
  }

  return rows;
}

export async function buildSharedAnalyticsReport(): Promise<SharedAnalyticsReport> {
  const supabase = getServiceRoleSupabaseClient();

  const [
    { count: coachCount },
    { count: competitorCount },
    { count: teamCount },
    { data: schoolRows },
    { data: demographicData },
    { data: allCompetitors },
    { data: agreementsData },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'coach'),
    supabase.from('competitors').select('id', { count: 'exact', head: true }),
    supabase.from('teams').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id, full_name, email, school_name, division, school_geo')
      .eq('role', 'coach'),
    supabase
      .from('competitors')
      .select('gender, race, ethnicity, level_of_technology, years_competing, division, program_track')
      .in('status', ['profile', 'in_the_game_not_compliant', 'complete', 'compliance']),
    supabase
      .from('competitors')
      .select('id, division, program_track, game_platform_id, status, participation_agreement_date, media_release_date'),
    supabase.from('agreements').select('competitor_id, manual_completed_at, zoho_completed'),
  ]);

  const schoolMapPoints: SharedSchoolMapPoint[] = ((schoolRows || []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    school_name: string | null;
    division: string | null;
    school_geo: { lat?: unknown; lon?: unknown } | null;
  }>)
    .map((row) => {
      const lat = typeof row.school_geo?.lat === 'number' ? row.school_geo.lat : null;
      const lon = typeof row.school_geo?.lon === 'number' ? row.school_geo.lon : null;
      if (lat === null || lon === null || !row.school_name) return null;

      return {
        id: row.id,
        coachName: row.full_name || row.email || row.id,
        schoolName: row.school_name,
        division: row.division ?? null,
        lat,
        lon,
      };
    })
    .filter((row): row is SharedSchoolMapPoint => Boolean(row));

  const competitorRows = (demographicData || []) as Array<{
    gender: string | null;
    race: string | null;
    ethnicity: string | null;
    level_of_technology: string | null;
    years_competing: number | null;
    division: string | null;
    program_track: string | null;
  }>;

  const divisionCounts = new Map<string, number>();
  for (const row of competitorRows) {
    const label = formatDivisionLabel(row.division, row.program_track);
    divisionCounts.set(label, (divisionCounts.get(label) ?? 0) + 1);
  }

  const divisionChart: DemographicChartConfig = {
    title: 'Division Mix',
    description: 'Middle school, high school, and college tracks.',
    data: Array.from(divisionCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  };

  const demographicCharts: DemographicChartConfig[] = [
    {
      title: 'Gender Identity',
      description: 'Self-reported gender from competitor profiles.',
      data: buildChartData(competitorRows as Array<Record<string, unknown>>, 'gender', 'Not provided'),
    },
    {
      title: 'Race',
      description: 'Self-reported race categories.',
      data: buildChartData(competitorRows as Array<Record<string, unknown>>, 'race', 'Not provided'),
    },
    {
      title: 'Ethnicity',
      description: 'Self-reported ethnicity.',
      data: buildChartData(competitorRows as Array<Record<string, unknown>>, 'ethnicity', 'Not provided'),
    },
    {
      title: 'Technology Access',
      description: 'Preferred level of technology reported by competitors.',
      data: buildChartData(competitorRows as Array<Record<string, unknown>>, 'level_of_technology', 'Not provided'),
    },
  ];

  const yearsCounts = new Map<string, number>();
  for (const row of competitorRows) {
    const value = row.years_competing;
    let label = 'Not provided';
    if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
      if (value < 1) label = '< 1 year';
      else if (value < 3) label = '1-2 years';
      else if (value < 5) label = '3-4 years';
      else label = '5+ years';
    }
    yearsCounts.set(label, (yearsCounts.get(label) ?? 0) + 1);
  }

  if (yearsCounts.size) {
    demographicCharts.push({
      title: 'Years Participating',
      description: 'How long competitors have been participating.',
      data: Array.from(yearsCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    });
  }

  const rawCompetitors = (allCompetitors || []) as Array<{
    id: string;
    division: string | null;
    program_track: string | null;
    game_platform_id: string | null;
    status: string | null;
    participation_agreement_date: string | null;
    media_release_date: string | null;
  }>;

  const statusCounts = {
    pending: 0,
    profile: 0,
    in_the_game_not_compliant: 0,
    complete: 0,
  };

  for (const competitor of rawCompetitors) {
    if (competitor.status === 'pending') statusCounts.pending += 1;
    if (competitor.status === 'profile' || competitor.status === 'compliance') statusCounts.profile += 1;
    if (competitor.status === 'in_the_game_not_compliant') statusCounts.in_the_game_not_compliant += 1;
    if (competitor.status === 'complete') statusCounts.complete += 1;
  }

  const agreementRows = (agreementsData || []) as Array<{
    competitor_id: string | null;
    manual_completed_at: string | null;
    zoho_completed: boolean | null;
  }>;

  const completeRelease = rawCompetitors.filter((competitor) =>
    Boolean(competitor.participation_agreement_date) || Boolean(competitor.media_release_date)
  ).length;

  const sentIds = new Set(
    agreementRows
      .filter((row) => row.competitor_id && !row.manual_completed_at && !row.zoho_completed)
      .map((row) => row.competitor_id as string)
  );

  const releasePipeline = {
    sent: sentIds.size,
    complete: completeRelease,
    notStarted: Math.max((competitorCount || 0) - completeRelease - sentIds.size, 0),
  };

  const { data: competitorTeamRows } = await supabase
    .from('competitors')
    .select(`
      id,
      division,
      program_track,
      game_platform_id,
      team_members(team_id, teams(id, division))
    `);

  const platformCompetitors = ((competitorTeamRows || []) as unknown) as Array<{
    id: string;
    division: string | null;
    program_track: string | null;
    game_platform_id: string | null;
    team_members:
      | Array<{ team_id: string | null; teams: { id: string; division: string | null } | null }>
      | { team_id: string | null; teams: { id: string; division: string | null } | null }
      | null;
  }>;

  const platformCompetitorIds = platformCompetitors.map((competitor) => competitor.id);

  let platformMappings: Array<{ competitor_id: string | null; synced_user_id: string | null }> = [];
  let platformStatsRows: Array<{ competitor_id: string; challenges_completed: number | null }> = [];

  if (platformCompetitorIds.length) {
    const [{ data: mappingData }, { data: statsData }] = await Promise.all([
      supabase
        .from('game_platform_profiles')
        .select('competitor_id, synced_user_id')
        .in('competitor_id', platformCompetitorIds),
      supabase
        .from('game_platform_stats')
        .select('competitor_id, challenges_completed')
        .in('competitor_id', platformCompetitorIds),
    ]);

    platformMappings = (mappingData || []) as typeof platformMappings;
    platformStatsRows = (statsData || []) as typeof platformStatsRows;
  }

  const syncedUserIdByCompetitorId = new Map<string, string>();
  for (const mapping of platformMappings) {
    if (mapping.competitor_id && mapping.synced_user_id) {
      syncedUserIdByCompetitorId.set(mapping.competitor_id, mapping.synced_user_id);
    }
  }

  const statsByCompetitorId = new Map<string, number>();
  for (const row of platformStatsRows) {
    statsByCompetitorId.set(row.competitor_id, Number(row.challenges_completed) || 0);
  }

  const competitorScope = platformCompetitors.map((competitor) => {
    const teamMembership = Array.isArray(competitor.team_members)
      ? competitor.team_members[0] ?? null
      : competitor.team_members ?? null;
    const teamDivision = teamMembership?.teams?.division ?? null;
    const divisionLabel = formatDivisionLabel(teamDivision || competitor.division, competitor.program_track);
    const syncedUserId = competitor.game_platform_id || syncedUserIdByCompetitorId.get(competitor.id) || null;
    return {
      competitorId: competitor.id,
      divisionLabel,
      syncedUserId,
    };
  });

  const syncedUserIds = Array.from(
    new Set(
      competitorScope
        .map((competitor) => competitor.syncedUserId)
        .filter((value): value is string => Boolean(value))
    )
  );

  let platformChallengeSolves: Array<{
    synced_user_id: string;
    challenge_category: string | null;
    solved_at: string | null;
  }> = [];
  let platformFlashEvents: Array<{
    synced_user_id: string;
    event_id: string;
    started_at: string | null;
  }> = [];

  if (syncedUserIds.length) {
    const [solvesData, flashData] = await Promise.all([
      fetchAllRowsByIds<typeof platformChallengeSolves[number]>({
        client: supabase as unknown as ServiceSupabaseLike,
        table: 'game_platform_challenge_solves',
        columns: 'synced_user_id, challenge_category, solved_at',
        idColumn: 'synced_user_id',
        ids: syncedUserIds,
      }),
      fetchAllRowsByIds<typeof platformFlashEvents[number]>({
        client: supabase as unknown as ServiceSupabaseLike,
        table: 'game_platform_flash_ctf_events',
        columns: 'synced_user_id, event_id, started_at',
        idColumn: 'synced_user_id',
        ids: syncedUserIds,
      }),
    ]);

    platformChallengeSolves = solvesData;
    platformFlashEvents = flashData;
  }

  const divisionSolveTotals = new Map<string, number>();
  const divisionLinkedCompetitors = new Map<string, number>();
  const ctfEntriesByDivision = new Map<string, number>();
  const ctfParticipantsByDivision = new Map<string, Set<string>>();
  const scopeBySyncedUserId = new Map<string, { divisionLabel: string }>();
  const solveCountBySyncedUserId = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  const activityCounts = {
    total: 0,
    schoolDay: 0,
    outsideSchool: 0,
    weekdayBeforeSchool: 0,
    weekdayAfterSchool: 0,
    weekend: 0,
  };

  const recordActivity = (timestamp?: string | null) => {
    const bucket = classifyPacificActivity(timestamp);
    if (bucket === 'unknown') return;
    activityCounts.total += 1;
    if (bucket === 'school_day') {
      activityCounts.schoolDay += 1;
      return;
    }
    activityCounts.outsideSchool += 1;
    if (bucket === 'weekday_before_school') activityCounts.weekdayBeforeSchool += 1;
    if (bucket === 'weekday_after_school') activityCounts.weekdayAfterSchool += 1;
    if (bucket === 'weekend') activityCounts.weekend += 1;
  };

  for (const competitor of competitorScope) {
    divisionSolveTotals.set(competitor.divisionLabel, divisionSolveTotals.get(competitor.divisionLabel) ?? 0);
    ctfEntriesByDivision.set(competitor.divisionLabel, ctfEntriesByDivision.get(competitor.divisionLabel) ?? 0);
    ctfParticipantsByDivision.set(competitor.divisionLabel, ctfParticipantsByDivision.get(competitor.divisionLabel) ?? new Set());
    if (competitor.syncedUserId) {
      divisionLinkedCompetitors.set(
        competitor.divisionLabel,
        (divisionLinkedCompetitors.get(competitor.divisionLabel) ?? 0) + 1
      );
      scopeBySyncedUserId.set(competitor.syncedUserId, { divisionLabel: competitor.divisionLabel });
    }
  }

  for (const solve of platformChallengeSolves) {
    solveCountBySyncedUserId.set(
      solve.synced_user_id,
      (solveCountBySyncedUserId.get(solve.synced_user_id) ?? 0) + 1
    );
    const topic = normalizeChallengeCategoryLabel(solve.challenge_category);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    recordActivity(solve.solved_at);
  }

  for (const event of platformFlashEvents) {
    recordActivity(event.started_at);
    const scope = scopeBySyncedUserId.get(event.synced_user_id);
    if (!scope) continue;
    ctfEntriesByDivision.set(scope.divisionLabel, (ctfEntriesByDivision.get(scope.divisionLabel) ?? 0) + 1);
    const participants = ctfParticipantsByDivision.get(scope.divisionLabel) ?? new Set<string>();
    participants.add(event.synced_user_id);
    ctfParticipantsByDivision.set(scope.divisionLabel, participants);
  }

  let totalChallengesSolved = 0;
  let linkedPlatformCompetitors = 0;

  for (const competitor of competitorScope) {
    if (competitor.syncedUserId) linkedPlatformCompetitors += 1;
    const challengesSolved =
      statsByCompetitorId.get(competitor.competitorId) ??
      (competitor.syncedUserId ? solveCountBySyncedUserId.get(competitor.syncedUserId) : undefined) ??
      0;
    divisionSolveTotals.set(
      competitor.divisionLabel,
      (divisionSolveTotals.get(competitor.divisionLabel) ?? 0) + challengesSolved
    );
    totalChallengesSolved += challengesSolved;
  }

  const outsideSchoolPct =
    activityCounts.total === 0 ? 0 : Math.round((activityCounts.outsideSchool / activityCounts.total) * 100);

  const ctfParticipationRows: SharedMetricRow[] = Array.from(ctfParticipantsByDivision.entries())
    .map(([label, participants]) => {
      const participantCount = participants.size;
      const entryCount = ctfEntriesByDivision.get(label) ?? 0;
      const linkedCount = divisionLinkedCompetitors.get(label) ?? 0;
      const participationRate = linkedCount === 0 ? 0 : Math.round((participantCount / linkedCount) * 100);
      return {
        label,
        value: participantCount,
        secondary: `${entryCount.toLocaleString()} event ${entryCount === 1 ? 'entry' : 'entries'}${linkedCount ? ` • ${participationRate}% of linked competitors` : ''}`,
      };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const divisionChallengeRows: SharedMetricRow[] = Array.from(divisionSolveTotals.entries())
    .map(([label, value]) => ({
      label,
      value,
      secondary: `${(divisionLinkedCompetitors.get(label) ?? 0).toLocaleString()} linked competitors`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const rawTopicRows: SharedMetricRow[] = Array.from(topicCounts.entries())
    .map(([label, value]) => ({
      label,
      value,
      secondary: `${platformChallengeSolves.length === 0 ? 0 : Math.round((value / platformChallengeSolves.length) * 100)}% of solves`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const topicClusterRows: SharedMetricRow[] =
    rawTopicRows.length <= 8
      ? rawTopicRows
      : [
          ...rawTopicRows.slice(0, 7),
          {
            label: 'Other',
            value: rawTopicRows.slice(7).reduce((sum, row) => sum + row.value, 0),
            secondary: `${Math.round(
              (rawTopicRows.slice(7).reduce((sum, row) => sum + row.value, 0) /
                Math.max(platformChallengeSolves.length, 1)) *
                100
            )}% of solves`,
          },
        ];

  const metrics: SharedAnalyticsMetric[] = [
    { label: 'Coaches', value: coachCount || 0 },
    { label: 'Competitors', value: competitorCount || 0 },
    { label: 'Teams', value: teamCount || 0 },
  ];

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    schoolMapPoints,
    statusCounts,
    releasePipeline,
    divisionChart,
    demographicCharts,
    totalChallengesSolved,
    linkedPlatformCompetitors,
    activityCounts,
    outsideSchoolPct,
    ctfParticipationRows,
    divisionChallengeRows,
    topicClusterRows,
    flashParticipantCount: ctfParticipationRows.reduce((sum, row) => sum + row.value, 0),
    flashEntryCount: platformFlashEvents.length,
  };
}
