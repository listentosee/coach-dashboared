import { describe, it, expect } from 'vitest';
import { summarizeStatsBreakdown } from './challenge-breakdown';

describe('summarizeStatsBreakdown', () => {
  it('returns zeros for empty input', () => {
    expect(summarizeStatsBreakdown([])).toEqual({ total: 0, ctf: 0, odl: 0 });
  });

  it('sums challenges_completed as total and monthly_ctf_challenges as ctf', () => {
    const rows = [
      { challenges_completed: 100, monthly_ctf_challenges: 30 },
      { challenges_completed: 50, monthly_ctf_challenges: 10 },
      { challenges_completed: 25, monthly_ctf_challenges: 0 },
    ];
    expect(summarizeStatsBreakdown(rows)).toEqual({ total: 175, ctf: 40, odl: 135 });
  });

  it('treats nulls as zeros', () => {
    const rows = [
      { challenges_completed: null, monthly_ctf_challenges: null },
      { challenges_completed: 10, monthly_ctf_challenges: null },
      { challenges_completed: null, monthly_ctf_challenges: 5 },
    ];
    expect(summarizeStatsBreakdown(rows)).toEqual({ total: 10, ctf: 5, odl: 5 });
  });

  it('clamps odl to 0 when ctf exceeds total (data drift safety)', () => {
    const rows = [{ challenges_completed: 5, monthly_ctf_challenges: 8 }];
    const result = summarizeStatsBreakdown(rows);
    expect(result.odl).toBe(0);
    expect(result.total).toBe(5);
    expect(result.ctf).toBe(8);
  });
});
