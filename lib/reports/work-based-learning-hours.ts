// lib/reports/work-based-learning-hours.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveWblPeriod, type WblPeriod } from '@/lib/reports/wbl-periods';
import {
  fetchWblRows, groupWblRows, summarizeWbl,
  DEFAULT_WBL_PARAMS,
  type WblParams, type WblStudent, type WblSummary, type RosterEntry,
} from '@/lib/integrations/game-platform/work-based-learning-hours';

export interface WblReport {
  period: WblPeriod;
  params: WblParams;
  coach: { id: string; name: string | null; school: string | null } | null;
  division: string; // 'all' | division enum
  students: WblStudent[];
  summary: WblSummary;
  generatedAt: string; // ISO
}

export const WBL_DIVISION_FILTERS = ['all', 'middle_school', 'high_school', 'college'] as const;

/**
 * Resolve a coach's roster + engagement rows into a full report.
 * - userClient: RLS-scoped (auth'd) client used to read the coach's own roster.
 * - statsClient: service-role client used ONLY to run the aggregation RPC with the
 *   resolved roster's synced_user_ids (never a broad query).
 */
export async function loadWblReport(opts: {
  userClient: SupabaseClient;
  statsClient: SupabaseClient;
  coachContextId: string | null;
  periodSlug: string | null | undefined;
  division?: string;
  params?: WblParams;
  generatedAt?: string;
}): Promise<WblReport> {
  const period = resolveWblPeriod(opts.periodSlug);
  const params = opts.params ?? DEFAULT_WBL_PARAMS;
  const division = opts.division && (WBL_DIVISION_FILTERS as readonly string[]).includes(opts.division)
    ? opts.division : 'all';
  const generatedAt = opts.generatedAt ?? new Date().toISOString();

  const empty: WblReport = {
    period, params, coach: null, division,
    students: [], summary: summarizeWbl([]), generatedAt,
  };
  if (!opts.coachContextId) return empty;

  // Coach profile (name/school for header + Methodology).
  const { data: coachProfile } = await opts.userClient
    .from('profiles').select('id, full_name, school_name').eq('id', opts.coachContextId).single();

  // Roster (RLS-scoped). Division filter applied here.
  let rosterQuery = opts.userClient
    .from('competitors')
    .select('id, first_name, last_name, division, game_platform_id')
    .eq('coach_id', opts.coachContextId);
  if (division !== 'all') rosterQuery = rosterQuery.eq('division', division);
  const { data: competitors, error: rosterErr } = await rosterQuery;
  if (rosterErr) throw rosterErr;

  const competitorIds = (competitors ?? []).map((c) => c.id);

  // synced_user_id fallback via game_platform_profiles (same as the dashboard).
  const mappingBySid = new Map<string, string>();
  if (competitorIds.length) {
    const { data: mappings } = await opts.userClient
      .from('game_platform_profiles').select('competitor_id, synced_user_id')
      .in('competitor_id', competitorIds);
    for (const m of mappings ?? []) {
      if (m.competitor_id && m.synced_user_id) mappingBySid.set(m.competitor_id, m.synced_user_id);
    }
  }

  const roster: RosterEntry[] = (competitors ?? []).map((c) => ({
    competitorId: c.id,
    firstName: c.first_name ?? '',
    lastName: c.last_name ?? '',
    division: c.division ?? null,
    syncedUserId: (c.game_platform_id as string | null) || mappingBySid.get(c.id) || null,
  }));

  const syncedUserIds = Array.from(
    new Set(roster.map((r) => r.syncedUserId).filter((s): s is string => Boolean(s))),
  );

  const rows = await fetchWblRows(opts.statsClient, syncedUserIds, period, params);
  const students = groupWblRows(rows, roster);

  return {
    period, params, division, generatedAt,
    coach: coachProfile
      ? { id: coachProfile.id, name: coachProfile.full_name ?? null, school: coachProfile.school_name ?? null }
      : { id: opts.coachContextId, name: null, school: null },
    students,
    summary: summarizeWbl(students),
  };
}
