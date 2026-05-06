import type { SupabaseClient } from '@supabase/supabase-js';

export interface StatsBreakdownRow {
  challenges_completed: number | null;
  monthly_ctf_challenges: number | null;
}

export interface ChallengeBreakdown {
  total: number;
  ctf: number;
  odl: number;
}

function toNonNegative(n: number): number {
  return n > 0 ? n : 0;
}

export function summarizeStatsBreakdown(rows: StatsBreakdownRow[]): ChallengeBreakdown {
  let total = 0;
  let ctf = 0;
  for (const row of rows) {
    total += row.challenges_completed ?? 0;
    ctf += row.monthly_ctf_challenges ?? 0;
  }
  return { total, ctf, odl: toNonNegative(total - ctf) };
}

export async function getStatsBreakdownForCompetitors(
  client: SupabaseClient,
  competitorIds: string[],
): Promise<ChallengeBreakdown> {
  if (!competitorIds.length) {
    return { total: 0, ctf: 0, odl: 0 };
  }

  const { data, error } = await client
    .from('game_platform_stats')
    .select('challenges_completed, monthly_ctf_challenges')
    .in('competitor_id', competitorIds);

  if (error) throw error;

  return summarizeStatsBreakdown((data ?? []) as StatsBreakdownRow[]);
}
