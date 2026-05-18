export type ActivityBucket =
  | 'school_day'
  | 'weekday_before_school'
  | 'weekday_after_school'
  | 'weekend'
  | 'unknown';

export interface ActivityBreakdown {
  total: number;
  schoolDay: number;
  outsideSchool: number;
  before9: number;
  after3: number;
  weekend: number;
  outsidePct: number;
}

const pacificActivityFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function classifyPacificActivity(timestamp?: string | null): ActivityBucket {
  if (!timestamp) return 'unknown';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const parts = pacificActivityFormatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hourPart = parts.find((part) => part.type === 'hour')?.value;
  const hour = hourPart ? Number.parseInt(hourPart, 10) : Number.NaN;

  if (!weekday || Number.isNaN(hour)) return 'unknown';

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  if (!isWeekday) return 'weekend';
  if (hour < 9) return 'weekday_before_school';
  if (hour >= 15) return 'weekday_after_school';
  return 'school_day';
}

export function summarizeActivityBreakdown(
  timestamps: Array<string | null | undefined>,
): ActivityBreakdown {
  const r: ActivityBreakdown = {
    total: 0, schoolDay: 0, outsideSchool: 0,
    before9: 0, after3: 0, weekend: 0, outsidePct: 0,
  };

  for (const ts of timestamps) {
    const bucket = classifyPacificActivity(ts);
    if (bucket === 'unknown') continue;
    r.total += 1;
    if (bucket === 'school_day') {
      r.schoolDay += 1;
      continue;
    }
    r.outsideSchool += 1;
    if (bucket === 'weekday_before_school') r.before9 += 1;
    if (bucket === 'weekday_after_school') r.after3 += 1;
    if (bucket === 'weekend') r.weekend += 1;
  }

  r.outsidePct = r.total === 0 ? 0 : Math.round((r.outsideSchool / r.total) * 100);
  return r;
}
