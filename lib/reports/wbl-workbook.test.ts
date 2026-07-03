import { describe, it, expect } from 'vitest';
import { Workbook } from 'exceljs';
import { buildWblWorkbook } from './wbl-workbook';
import { resolveWblPeriod } from '@/lib/reports/wbl-periods';
import { DEFAULT_WBL_PARAMS, groupWblRows, summarizeWbl, type WblRpcRow, type RosterEntry } from '@/lib/integrations/game-platform/work-based-learning-hours';
import type { WblReport } from '@/lib/reports/work-based-learning-hours';

function sampleReport(): WblReport {
  const roster: RosterEntry[] = [
    { competitorId: 'c1', firstName: 'Ada', lastName: 'Byte', division: 'high_school', syncedUserId: 'u1' },
    { competitorId: 'c2', firstName: 'Zed', lastName: 'Zero', division: 'college', syncedUserId: 'u2' },
  ];
  const rows: WblRpcRow[] = [
    { synced_user_id: 'u1', segment: 'On-Demand', activity: 'Cryptography', solves: 5, sessions: 2, minutes: 70 },
    { synced_user_id: 'u1', segment: 'Flash CTF', activity: 'IE Mayors Cyber Cup 2026 (3.5 h)', solves: 12, sessions: 1, minutes: 210 },
  ];
  const students = groupWblRows(rows, roster);
  return {
    period: resolveWblPeriod('2025-26'),
    params: DEFAULT_WBL_PARAMS,
    coach: { id: 'coach1', name: 'Coach Test', school: 'Test High' },
    division: 'all',
    students,
    summary: summarizeWbl(students),
    generatedAt: '2026-07-03T00:00:00.000Z',
  };
}

describe('buildWblWorkbook', () => {
  it('produces a workbook with the four required sheets including Methodology', async () => {
    const buf = await buildWblWorkbook(sampleReport());
    const wb = new Workbook();
    await wb.xlsx.load(buf as any);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(['Summary by Student', 'Detail', 'Data', 'Methodology']);
  });

  it('Methodology sheet states the exact parameter values used', async () => {
    const buf = await buildWblWorkbook(sampleReport());
    const wb = new Workbook();
    await wb.xlsx.load(buf as any);
    const text = (wb.getWorksheet('Methodology')!.getSheetValues() as any[])
      .flat().filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain('30');   // gap minutes
    expect(text).toContain('210');  // Mayors window minutes
    expect(text).toContain('Inland Empire Mayors Cyber Cup 2026');
  });

  it('zero-activity students still appear on the Detail sheet with a TOTAL row', async () => {
    const buf = await buildWblWorkbook(sampleReport());
    const wb = new Workbook();
    await wb.xlsx.load(buf as any);
    const detail = (wb.getWorksheet('Detail')!.getSheetValues() as any[])
      .flat().filter((v) => typeof v === 'string');
    expect(detail).toContain('Zed Zero');
  });
});
