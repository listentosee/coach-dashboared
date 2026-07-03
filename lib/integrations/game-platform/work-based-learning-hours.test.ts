import { describe, it, expect } from 'vitest';
import {
  groupWblRows, summarizeWbl, divisionLabel, segmentLabel,
  type WblRpcRow, type RosterEntry,
} from './work-based-learning-hours';

const roster: RosterEntry[] = [
  { competitorId: 'c1', firstName: 'Ada', lastName: 'Byte', division: 'high_school', syncedUserId: 'u1' },
  { competitorId: 'c2', firstName: 'Ben', lastName: 'Cee', division: 'college', syncedUserId: 'u2' },
  { competitorId: 'c3', firstName: 'Cy', lastName: 'Dee', division: 'middle_school', syncedUserId: null },
];
const rows: WblRpcRow[] = [
  { synced_user_id: 'u1', segment: 'On-Demand', activity: 'Cryptography', solves: 5, sessions: 2, minutes: 70 },
  { synced_user_id: 'u1', segment: 'Flash CTF', activity: 'IE Mayors Cyber Cup 2026 (3.5 h)', solves: 12, sessions: 1, minutes: 210 },
  { synced_user_id: 'u2', segment: 'On-Demand', activity: 'Forensics', solves: 1, sessions: 1, minutes: 15 },
];

describe('groupWblRows', () => {
  it('maps rows onto roster students and splits ODL vs CTF', () => {
    const students = groupWblRows(rows, roster);
    const ada = students.find((s) => s.competitorId === 'c1')!;
    expect(ada.name).toBe('Ada Byte');
    expect(ada.odl).toHaveLength(1);
    expect(ada.ctf).toHaveLength(1);
    expect(ada.odlMinutes).toBe(70);
    expect(ada.ctfMinutes).toBe(210);
    expect(ada.totalMinutes).toBe(280);
  });
  it('zero-fills roster students with no activity', () => {
    const students = groupWblRows(rows, roster);
    const cy = students.find((s) => s.competitorId === 'c3')!;
    expect(cy.odl).toHaveLength(0);
    expect(cy.ctf).toHaveLength(0);
    expect(cy.totalMinutes).toBe(0);
  });
  it('returns one entry per roster student, ordered by last then first name', () => {
    const students = groupWblRows(rows, roster);
    expect(students.map((s) => s.competitorId)).toEqual(['c1', 'c2', 'c3']);
  });
  it('ignores RPC rows whose synced_user_id is not on the roster', () => {
    const extra = [...rows, { synced_user_id: 'ghost', segment: 'On-Demand', activity: 'Web Exploitation', solves: 9, sessions: 3, minutes: 999 } as WblRpcRow];
    const students = groupWblRows(extra, roster);
    expect(summarizeWbl(students).totalMinutes).toBe(280 + 15);
  });
});

describe('summarizeWbl', () => {
  it('splits ODL/CTF totals and averages over all students', () => {
    const s = summarizeWbl(groupWblRows(rows, roster));
    expect(s.studentCount).toBe(3);
    expect(s.odlMinutes).toBe(85);
    expect(s.ctfMinutes).toBe(210);
    expect(s.totalMinutes).toBe(295);
    expect(s.avgMinutes).toBeCloseTo(295 / 3, 5);
  });
  it('handles an empty roster without dividing by zero', () => {
    const s = summarizeWbl([]);
    expect(s).toEqual({ studentCount: 0, totalMinutes: 0, odlMinutes: 0, ctfMinutes: 0, avgMinutes: 0 });
  });
});

describe('divisionLabel', () => {
  it('humanizes division enums', () => {
    expect(divisionLabel('middle_school')).toBe('Middle School');
    expect(divisionLabel('high_school')).toBe('High School');
    expect(divisionLabel('college')).toBe('College');
    expect(divisionLabel(null)).toBe('Unassigned');
  });
});

describe('segmentLabel', () => {
  it('surfaces On-Demand as ODL and leaves Flash CTF unchanged', () => {
    expect(segmentLabel('On-Demand')).toBe('ODL');
    expect(segmentLabel('Flash CTF')).toBe('Flash CTF');
  });
});
