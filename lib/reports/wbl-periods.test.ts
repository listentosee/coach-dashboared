import { describe, it, expect } from 'vitest';
import { resolveWblPeriod, DEFAULT_WBL_PERIOD_SLUG, WBL_PERIODS } from './wbl-periods';

describe('resolveWblPeriod', () => {
  it('defaults to the 2025-26 school year for unknown/empty input', () => {
    expect(resolveWblPeriod(undefined).slug).toBe(DEFAULT_WBL_PERIOD_SLUG);
    expect(resolveWblPeriod('nonsense').slug).toBe('2025-26');
  });
  it('2025-26 school year runs Aug 1 2025 to Aug 1 2026 (exclusive end)', () => {
    const p = resolveWblPeriod('2025-26');
    expect(p.start).toBe('2025-08-01T00:00:00.000Z');
    expect(p.end).toBe('2026-08-01T00:00:00.000Z');
  });
  it('all-time has null bounds', () => {
    const p = resolveWblPeriod('all');
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
  });
  it('exposes fall and spring terms', () => {
    expect(resolveWblPeriod('fall-2025').start).toBe('2025-08-01T00:00:00.000Z');
    expect(resolveWblPeriod('fall-2025').end).toBe('2026-01-01T00:00:00.000Z');
    expect(resolveWblPeriod('spring-2026').start).toBe('2026-01-01T00:00:00.000Z');
    expect(resolveWblPeriod('spring-2026').end).toBe('2026-08-01T00:00:00.000Z');
  });
  it('every preset has a unique slug and a label', () => {
    const slugs = WBL_PERIODS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    WBL_PERIODS.forEach((p) => expect(p.label.length).toBeGreaterThan(0));
  });
});
