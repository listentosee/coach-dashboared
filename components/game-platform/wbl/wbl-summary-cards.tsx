'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WblSummary } from '@/lib/integrations/game-platform/work-based-learning-hours';

const h = (m: number) => (Math.round((m / 60) * 10) / 10).toFixed(1);

export function WblSummaryCards({ summary }: { summary: WblSummary }) {
  const items = [
    { label: 'Total Hours', value: h(summary.totalMinutes) },
    { label: 'ODL Hours', value: h(summary.odlMinutes) },
    { label: 'Flash CTF Hours', value: h(summary.ctfMinutes) },
    { label: 'Avg Hours / Student', value: h(summary.avgMinutes) },
    { label: 'Students', value: String(summary.studentCount) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-400">{it.label}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-slate-100">{it.value}</CardContent>
        </Card>
      ))}
    </div>
  );
}
