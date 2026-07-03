import type { SupabaseClient } from '@supabase/supabase-js';
import type { WblPeriod } from '@/lib/reports/wbl-periods';

export interface WblParams {
  gapMinutes: number;
  tailMinutes: number;
  orphanMinutes: number;
  ctfRegularMinutes: number;
  ctfMayorsMinutes: number;
  mayorsName: string;
}

export const DEFAULT_WBL_PARAMS: WblParams = {
  gapMinutes: 30,
  tailMinutes: 10,
  orphanMinutes: 15,
  ctfRegularMinutes: 120,
  ctfMayorsMinutes: 210,
  mayorsName: 'Inland Empire Mayors Cyber Cup 2026',
};

export type WblSegment = 'On-Demand' | 'Flash CTF';

export interface WblRpcRow {
  synced_user_id: string;
  segment: WblSegment;
  activity: string;
  solves: number;
  sessions: number;
  minutes: number;
}

export interface WblActivityRow {
  segment: WblSegment;
  activity: string;
  solves: number;
  sessions: number;
  minutes: number;
}

export interface RosterEntry {
  competitorId: string;
  firstName: string;
  lastName: string;
  division: string | null;
  syncedUserId: string | null;
}

export interface WblStudent {
  competitorId: string;
  firstName: string;
  lastName: string;
  name: string;
  division: string | null;
  odl: WblActivityRow[];
  ctf: WblActivityRow[];
  odlMinutes: number;
  ctfMinutes: number;
  totalMinutes: number;
}

export interface WblSummary {
  studentCount: number;
  totalMinutes: number;
  odlMinutes: number;
  ctfMinutes: number;
  avgMinutes: number;
}

export function divisionLabel(division: string | null): string {
  switch (division) {
    case 'middle_school': return 'Middle School';
    case 'high_school': return 'High School';
    case 'college': return 'College';
    default: return 'Unassigned';
  }
}

function toActivityRow(r: WblRpcRow): WblActivityRow {
  return { segment: r.segment, activity: r.activity, solves: r.solves, sessions: r.sessions, minutes: r.minutes };
}

export function groupWblRows(rows: WblRpcRow[], roster: RosterEntry[]): WblStudent[] {
  const rowsBySynced = new Map<string, WblRpcRow[]>();
  for (const r of rows) {
    if (!rowsBySynced.has(r.synced_user_id)) rowsBySynced.set(r.synced_user_id, []);
    rowsBySynced.get(r.synced_user_id)!.push(r);
  }

  const students: WblStudent[] = roster.map((entry) => {
    const studentRows = entry.syncedUserId ? rowsBySynced.get(entry.syncedUserId) ?? [] : [];
    const odl = studentRows.filter((r) => r.segment === 'On-Demand')
      .sort((a, b) => a.activity.localeCompare(b.activity)).map(toActivityRow);
    const ctf = studentRows.filter((r) => r.segment === 'Flash CTF')
      .sort((a, b) => a.activity.localeCompare(b.activity)).map(toActivityRow);
    const odlMinutes = odl.reduce((n, r) => n + r.minutes, 0);
    const ctfMinutes = ctf.reduce((n, r) => n + r.minutes, 0);
    return {
      competitorId: entry.competitorId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      name: `${entry.firstName} ${entry.lastName}`.trim(),
      division: entry.division,
      odl, ctf, odlMinutes, ctfMinutes,
      totalMinutes: odlMinutes + ctfMinutes,
    };
  });

  return students.sort((a, b) =>
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export function summarizeWbl(students: WblStudent[]): WblSummary {
  const totalMinutes = students.reduce((n, s) => n + s.totalMinutes, 0);
  const odlMinutes = students.reduce((n, s) => n + s.odlMinutes, 0);
  const ctfMinutes = students.reduce((n, s) => n + s.ctfMinutes, 0);
  const studentCount = students.length;
  return {
    studentCount,
    totalMinutes,
    odlMinutes,
    ctfMinutes,
    avgMinutes: studentCount ? totalMinutes / studentCount : 0,
  };
}

/** Calls the SQL RPC. Pass a service-role client (RLS + row-cap on the solves table). */
export async function fetchWblRows(
  statsClient: SupabaseClient,
  syncedUserIds: string[],
  period: WblPeriod,
  params: WblParams = DEFAULT_WBL_PARAMS,
): Promise<WblRpcRow[]> {
  if (!syncedUserIds.length) return [];
  const { data, error } = await statsClient.rpc('get_work_based_learning_hours', {
    p_synced_user_ids: syncedUserIds,
    p_start: period.start,
    p_end: period.end,
    p_gap_minutes: params.gapMinutes,
    p_tail_minutes: params.tailMinutes,
    p_orphan_minutes: params.orphanMinutes,
    p_ctf_regular_minutes: params.ctfRegularMinutes,
    p_ctf_mayors_minutes: params.ctfMayorsMinutes,
    p_mayors_name: params.mayorsName,
  });
  if (error) throw error;
  return (data ?? []) as WblRpcRow[];
}
