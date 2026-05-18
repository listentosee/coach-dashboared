import { describe, it, expect } from 'vitest';
import { classifyPacificActivity, summarizeActivityBreakdown } from './activity-buckets';

describe('classifyPacificActivity', () => {
  it('returns unknown for null/invalid', () => {
    expect(classifyPacificActivity(null)).toBe('unknown');
    expect(classifyPacificActivity('not-a-date')).toBe('unknown');
  });

  it('classifies a weekday 12:00 PT as school_day', () => {
    expect(classifyPacificActivity('2026-01-07T20:00:00Z')).toBe('school_day');
  });

  it('classifies a weekday 07:00 PT as weekday_before_school', () => {
    expect(classifyPacificActivity('2026-01-07T15:00:00Z')).toBe('weekday_before_school');
  });

  it('classifies a weekday 16:00 PT as weekday_after_school', () => {
    // 2026-01-08T00:00:00Z = Wed Jan 7, 16:00 PST -> after 3pm.
    expect(classifyPacificActivity('2026-01-08T00:00:00Z')).toBe('weekday_after_school');
  });

  it('classifies a Saturday as weekend', () => {
    expect(classifyPacificActivity('2026-01-10T20:00:00Z')).toBe('weekend');
  });

  it('handles Pacific Daylight Time (summer, UTC-7)', () => {
    // 2026-07-06 is a Monday. 16:00Z = 09:00 PDT (UTC-7) -> school_day.
    expect(classifyPacificActivity('2026-07-06T16:00:00Z')).toBe('school_day');
  });

  it('treats 9:00 as school_day and 15:00 as weekday_after_school (boundaries)', () => {
    // 2026-01-07 Wed. 17:00Z = 09:00 PST -> school_day (9 < 9 is false).
    expect(classifyPacificActivity('2026-01-07T17:00:00Z')).toBe('school_day');
    // 23:00Z = 15:00 PST -> weekday_after_school (15 >= 15).
    expect(classifyPacificActivity('2026-01-07T23:00:00Z')).toBe('weekday_after_school');
  });
});

describe('summarizeActivityBreakdown', () => {
  it('returns all-zero for empty input', () => {
    expect(summarizeActivityBreakdown([])).toEqual({
      total: 0, schoolDay: 0, outsideSchool: 0,
      before9: 0, after3: 0, weekend: 0, outsidePct: 0,
    });
  });

  it('ignores unknown timestamps in totals', () => {
    const r = summarizeActivityBreakdown([null, 'bad', '2026-01-07T20:00:00Z']);
    expect(r.total).toBe(1);
    expect(r.schoolDay).toBe(1);
    expect(r.outsideSchool).toBe(0);
    expect(r.outsidePct).toBe(0);
  });

  it('buckets outside-school events and rounds the pct', () => {
    const r = summarizeActivityBreakdown([
      '2026-01-07T20:00:00Z',
      '2026-01-07T15:00:00Z',
      '2026-01-08T00:00:00Z',
      '2026-01-10T20:00:00Z',
    ]);
    expect(r).toEqual({
      total: 4, schoolDay: 1, outsideSchool: 3,
      before9: 1, after3: 1, weekend: 1, outsidePct: 75,
    });
  });
});
