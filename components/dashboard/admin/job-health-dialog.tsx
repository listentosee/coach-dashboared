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
  recentJobs: Array<{
    id: string;
    task_type: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    last_error: string | null;
  }>;
  vercelCron: {
    configured: boolean;
    schedule: string;
    endpoint: string;
  };
  worker: {
    healthy: boolean;
    processingEnabled: boolean;
    pausedReason: string | null;
    oldestPendingAge: number | null;
  };
  error: string | null;
}

interface JobHealthDialogProps {
  variant?: 'default' | 'outline';
}

export function JobHealthDialog({ variant = 'outline' }: JobHealthDialogProps) {
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
        '### Vercel Cron Configuration',
        '',
        `- **Status**: ${data.vercelCron.configured ? '✅ Configured' : '❌ Not configured'}`,
        `- **Schedule**: \`${data.vercelCron.schedule}\` (every 5 minutes)`,
        `- **Endpoint**: \`${data.vercelCron.endpoint}\``,
        '',
        '### Worker Status',
        '',
        `- **Health**: ${data.worker.healthy ? '✅ Healthy' : '⚠️ May be stalled'}`,
        `- **Processing**: ${data.worker.processingEnabled ? '✅ Enabled' : '⏸️ Paused'}`,
        data.worker.pausedReason ? `- **Reason**: ${data.worker.pausedReason}` : '',
        data.worker.oldestPendingAge !== null
          ? `- **Oldest Pending Job**: ${data.worker.oldestPendingAge} minutes ago`
          : '',
        '',
        '### Queue Counts',
        '',
        ...data.queueCounts.map((row) => `- **${row.status}**: ${row.count}`),
        '',
        '### Recent Jobs (Last 10)',
        '',
        ...data.recentJobs.map((job) => {
          const age = Math.floor(
            (new Date().getTime() - new Date(job.created_at).getTime()) / 1000 / 60
          );
          const lines = [
            `- **${job.task_type}** (${job.status}) — ${age}m ago`,
          ];
          if (job.last_error) {
            lines.push(`  - Error: ${job.last_error.substring(0, 100)}${job.last_error.length > 100 ? '...' : ''}`);
          }
          return lines.join('\n');
        }),
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">View cron health</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Vercel Cron & Worker Health</DialogTitle>
        </DialogHeader>
        {error && <div className="rounded bg-red-500/10 p-3 text-sm text-red-600">{error}</div>}
        {!error && !data && <div className="text-sm text-gray-600">Loading...</div>}
        {!error && data && (
          <MarkdownPreview source={markdown} style={{ backgroundColor: 'transparent' }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
