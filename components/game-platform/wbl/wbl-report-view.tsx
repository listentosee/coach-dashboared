'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { WBL_PERIODS, DEFAULT_WBL_PERIOD_SLUG } from '@/lib/reports/wbl-periods';
import { WblSummaryCards } from './wbl-summary-cards';
import { WblDetailTable } from './wbl-detail-table';
import type { WblReport } from '@/lib/reports/work-based-learning-hours';

const DIVISIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'middle_school', label: 'Middle' },
  { value: 'high_school', label: 'High' },
  { value: 'college', label: 'College' },
];

export function WblReportView() {
  const [period, setPeriod] = useState<string>(DEFAULT_WBL_PERIOD_SLUG);
  const [division, setDivision] = useState<string>('all');
  const [report, setReport] = useState<WblReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/coach-reports/work-based-learning-hours?period=${period}&division=${division}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((json) => { if (!cancelled) setReport(json); })
      .catch(() => { if (!cancelled) setReport(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, division]);

  const onExport = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/coach-reports/work-based-learning-hours/export?period=${period}&division=${division}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Work_Based_Learning_Hours_${period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WBL_PERIODS.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Tabs value={division} onValueChange={setDivision}>
          <TabsList>
            {DIVISIONS.map((d) => <TabsTrigger key={d.value} value={d.value}>{d.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Button onClick={onExport} disabled={downloading || !report} className="ml-auto">
          <Download className="mr-2 h-4 w-4" />{downloading ? 'Preparing…' : 'Export to Excel'}
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && report && (
        <>
          <WblSummaryCards summary={report.summary} />
          <WblDetailTable students={report.students} />
        </>
      )}
      {!loading && !report && <p className="text-sm text-red-400">Could not load the report.</p>}
    </div>
  );
}
