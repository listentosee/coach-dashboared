'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '@/styles/job-playbook.css';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), { ssr: false });

interface HealthResponse {
  queueCounts: Array<{ status: string; count: number }>;
  pendingQueueCount: number;
  latestResponses: Array<{ created: string; status_code: number; error: string | null; content: string | null }>;
  latestRuns: Array<{ jobname: string; start_time: string; end_time: string | null; status: string; message: string | null }>;
}

export function JobHealthDialog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        setError(null);
        const res = await fetch('/api/admin/job-queue/health');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load health data');
        setData(json as HealthResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };
    load();
  }, [open]);

  const markdown = data
    ? [
        '### Queue Counts',
        '',
        ...data.queueCounts.map((row) => `- ${row.status}: **${row.count}**`),
        '',
        '### Pending HTTP Requests',
        '',
        `- net.http_request_queue: **${data.pendingQueueCount}**`,
        '',
        '### Latest Cron Runs',
        '',
        ...data.latestRuns.map((run) => {
          const lines = [`- ${run.start_time} — ${run.jobname} (${run.status})`];
          if (run.message) {
            lines.push(`  - ${run.message}`);
          }
          return lines.join('\n');
        }),
        '',
        '### HTTP Responses',
        '',
        ...data.latestResponses.map((resp) => `- ${resp.created}: status ${resp.status_code}${resp.error ? ` — ${resp.error}` : ''}`),
      ].join('\n')
    : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">View cron health</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cron & Worker Health</DialogTitle>
        </DialogHeader>
        {error && <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {!error && !data && <div className="text-sm text-gray-500">Loading...</div>}
        {!error && data && (
          <MarkdownPreview source={markdown} style={{ backgroundColor: 'transparent' }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
