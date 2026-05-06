import type { SupabaseClient } from '@supabase/supabase-js';

export type ChallengeSolveSource = 'odl' | 'flash_ctf';

export interface ChallengeSolveRow {
  synced_user_id: string | null;
  source: ChallengeSolveSource | string | null;
}

export interface ChallengeBreakdown {
  odl: number;
  ctf: number;
  total: number;
}

export interface ChallengeBreakdownResult extends ChallengeBreakdown {
  perUser: Map<string, ChallengeBreakdown>;
}

function emptyBreakdown(): ChallengeBreakdown {
  return { odl: 0, ctf: 0, total: 0 };
}

export function summarizeChallengeBreakdown(rows: ChallengeSolveRow[]): ChallengeBreakdownResult {
  const perUser = new Map<string, ChallengeBreakdown>();
  let odl = 0;
  let ctf = 0;

  for (const row of rows) {
    const userId = row.synced_user_id ?? '';
    let entry = perUser.get(userId);
    if (!entry) {
      entry = emptyBreakdown();
      perUser.set(userId, entry);
    }

    if (row.source === 'flash_ctf') {
      entry.ctf += 1;
      ctf += 1;
    } else {
      entry.odl += 1;
      odl += 1;
    }
    entry.total += 1;
  }

  return { odl, ctf, total: odl + ctf, perUser };
}

export async function getChallengeBreakdown(
  client: SupabaseClient,
  syncedUserIds: string[],
): Promise<ChallengeBreakdownResult> {
  if (!syncedUserIds.length) {
    return { ...emptyBreakdown(), perUser: new Map() };
  }

  const { data, error } = await client
    .from('game_platform_challenge_solves')
    .select('synced_user_id, source')
    .in('synced_user_id', syncedUserIds);

  if (error) throw error;

  return summarizeChallengeBreakdown((data ?? []) as ChallengeSolveRow[]);
}
