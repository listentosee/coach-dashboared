export type WblPeriodSlug = '2025-26' | 'fall-2025' | 'spring-2026' | 'all';

export interface WblPeriod {
  slug: WblPeriodSlug;
  label: string;
  /** ISO-8601 UTC, inclusive lower bound; null = unbounded. */
  start: string | null;
  /** ISO-8601 UTC, exclusive upper bound; null = unbounded. */
  end: string | null;
}

export const WBL_PERIODS: WblPeriod[] = [
  { slug: '2025-26', label: '2025–26 School Year', start: '2025-08-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' },
  { slug: 'fall-2025', label: 'Fall 2025', start: '2025-08-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z' },
  { slug: 'spring-2026', label: 'Spring 2026', start: '2026-01-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' },
  { slug: 'all', label: 'All time', start: null, end: null },
];

export const DEFAULT_WBL_PERIOD_SLUG: WblPeriodSlug = '2025-26';

export function resolveWblPeriod(slug: string | null | undefined): WblPeriod {
  const found = WBL_PERIODS.find((p) => p.slug === slug);
  return found ?? WBL_PERIODS.find((p) => p.slug === DEFAULT_WBL_PERIOD_SLUG)!;
}
