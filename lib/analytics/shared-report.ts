import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import type { DemographicChartConfig } from '@/components/dashboard/admin/demographic-charts';

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

export type SharedAnalyticsReport = {
  generatedAt: string;
  metrics: SharedAnalyticsMetric[];
  schoolMapPoints: SharedSchoolMapPoint[];
  divisionChart: DemographicChartConfig;
  demographicCharts: DemographicChartConfig[];
};

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

export async function buildSharedAnalyticsReport(): Promise<SharedAnalyticsReport> {
  const supabase = getServiceRoleSupabaseClient();

  const [
    { count: coachCount },
    { count: competitorCount },
    { count: teamCount },
    { data: schoolRows },
    { data: competitorRows },
    { data: statsRows },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'coach'),
    supabase.from('competitors').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('teams').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id, school_name, division, school_geo')
      .eq('role', 'coach'),
    supabase
      .from('competitors')
      .select('gender, race, ethnicity, division, program_track')
      .eq('is_active', true),
    supabase.from('game_platform_stats').select('challenges_completed'),
  ]);

  const schoolMapPoints: SharedSchoolMapPoint[] = ((schoolRows || []) as Array<{
    id: string;
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
        coachName: 'Participating School',
        schoolName: row.school_name,
        division: row.division ?? null,
        lat,
        lon,
      };
    })
    .filter((row): row is SharedSchoolMapPoint => Boolean(row));

  const activeCompetitors = (competitorRows || []) as Array<{
    gender: string | null;
    race: string | null;
    ethnicity: string | null;
    division: string | null;
    program_track: string | null;
  }>;

  const divisionCounts = new Map<string, number>();
  for (const row of activeCompetitors) {
    const label = formatDivisionLabel(row.division, row.program_track);
    divisionCounts.set(label, (divisionCounts.get(label) ?? 0) + 1);
  }

  const divisionChart: DemographicChartConfig = {
    title: 'Division Mix',
    description: 'Active participant mix by division.',
    data: Array.from(divisionCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  };

  const demographicCharts: DemographicChartConfig[] = [
    {
      title: 'Gender Identity',
      description: 'Self-reported active participant gender.',
      data: buildChartData(activeCompetitors as Array<Record<string, unknown>>, 'gender', 'Not provided'),
    },
    {
      title: 'Race',
      description: 'Self-reported active participant race.',
      data: buildChartData(activeCompetitors as Array<Record<string, unknown>>, 'race', 'Not provided'),
    },
    {
      title: 'Ethnicity',
      description: 'Self-reported active participant ethnicity.',
      data: buildChartData(activeCompetitors as Array<Record<string, unknown>>, 'ethnicity', 'Not provided'),
    },
  ];

  const totalChallengesSolved = (statsRows || []).reduce((sum, row: any) => {
    return sum + (Number(row.challenges_completed) || 0);
  }, 0);

  const metrics: SharedAnalyticsMetric[] = [
    { label: 'Participating Coaches', value: coachCount || 0 },
    { label: 'Active Competitors', value: competitorCount || 0 },
    { label: 'Teams', value: teamCount || 0 },
    { label: 'Challenge Solves', value: totalChallengesSolved },
    { label: 'Mapped Schools', value: schoolMapPoints.length },
  ];

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    schoolMapPoints,
    divisionChart,
    demographicCharts,
  };
}
