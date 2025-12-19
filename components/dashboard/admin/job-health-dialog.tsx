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
    updated_at: string;
    run_at: string;
    last_run_at: string | null;
    is_recurring: boolean;
    recurrence_interval_minutes: number | null;
    attempts: number;
    max_attempts: number;
    completed_at: string | null;
    last_error: string | null;
  }>;
  vercelCron: {
    configured: boolean;
    schedule: string;
    endpoint: string;
    expectedWorkerEveryMinutes: number;
    lastWorkerRunAt: string | null;
    workerStale: boolean;
  };
  worker: {
    processingEnabled: boolean;
    pausedReason: string | null;
    stuck: {
      running: Array<{
        id: string;
        task_type: string;
        status: string;
        created_at: string;
        updated_at: string;
        run_at: string;
        attempts: number;
        max_attempts: number;
        last_error: string | null;
        ageMinutes: number;
      }>;
      overdue: Array<{
        id: string;
        task_type: string;
        status: string;
        created_at: string;
        updated_at: string;
        run_at: string;
        last_run_at: string | null;
        is_recurring: boolean;
        recurrence_interval_minutes: number | null;
        attempts: number;
        max_attempts: number;
        last_error: string | null;
        nextRunAt: string | null;
        overdueMinutes: number | null;
      }>;
    };
  };
  workerRuns: Array<{
    id: string;
    started_at: string;
    completed_at: string | null;
    source: string;
    status: string | null;
    processed: number;
    succeeded: number | null;
    failed: number | null;
    message: string | null;
    error_message: string | null;
  }>;
  gamePlatformSyncRun: {
    started_at: string;
    completed_at: string | null;
    status: string;
    competitors_synced: number | null;
    competitors_failed: number | null;
    error_message: string | null;
  } | null;
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

  const markdown = data ? buildMarkdown(data) : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">Job health</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Job Queue & Cron Health</DialogTitle>
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

function minutesAgo(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

function buildMarkdown(data: HealthResponse) {
  const lastWorkerAge = minutesAgo(data.vercelCron.lastWorkerRunAt);
  const overdue = data.worker.stuck.overdue ?? [];
  const stuckRunning = data.worker.stuck.running ?? [];

  const workerRuns = (data.workerRuns ?? []).slice(0, 10);

  return [
    '### Vercel Cron Worker',
    '',
    `- **Configured**: ${data.vercelCron.configured ? '✅ CRON_SECRET set' : '⚠️ CRON_SECRET missing'}`,
    `- **Schedule**: \`${data.vercelCron.schedule}\` (expected every ${data.vercelCron.expectedWorkerEveryMinutes}m)`,
    `- **Endpoint**: \`${data.vercelCron.endpoint}\``,
    `- **Last Worker Run**: ${
      data.vercelCron.lastWorkerRunAt
        ? `${new Date(data.vercelCron.lastWorkerRunAt).toLocaleString()} (${lastWorkerAge ?? '—'}m ago)${data.vercelCron.workerStale ? ' ⚠️ stale' : ''}`
        : 'Never'
    }`,
    '',
    '### Processing Toggle',
    '',
    `- **Processing**: ${data.worker.processingEnabled ? '✅ Enabled' : '⏸️ Paused'}`,
    data.worker.pausedReason ? `- **Pause Reason**: ${data.worker.pausedReason}` : '',
    '',
    '### Stuck / Overdue Jobs',
    '',
    `- **Stuck Running (>${20}m)**: ${stuckRunning.length}`,
    ...stuckRunning.slice(0, 10).map((job) => {
      const error = job.last_error ? ` — ${job.last_error.substring(0, 120)}${job.last_error.length > 120 ? '…' : ''}` : '';
      return `  - \`${job.id}\` **${job.task_type}** — running ${job.ageMinutes}m${error}`;
    }),
    `- **Overdue Pending (>${15}m)**: ${overdue.length}`,
    ...overdue.slice(0, 10).map((job) => {
      const next = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'unknown';
      const overdueM = job.overdueMinutes ?? 0;
      const error = job.last_error ? ` — ${job.last_error.substring(0, 120)}${job.last_error.length > 120 ? '…' : ''}` : '';
      return `  - \`${job.id}\` **${job.task_type}** — due ${next} (${overdueM}m overdue)${error}`;
    }),
    '',
    '### Worker Run History (Last 10)',
    '',
    ...workerRuns.map((run) => {
      const started = run.started_at ? new Date(run.started_at).toLocaleString() : 'unknown';
      const status = run.status ?? 'unknown';
      const meta = `processed=${run.processed}${run.succeeded !== null ? ` ok=${run.succeeded}` : ''}${run.failed !== null ? ` fail=${run.failed}` : ''}`;
      const err = run.error_message ? ` — ${run.error_message.substring(0, 140)}${run.error_message.length > 140 ? '…' : ''}` : '';
      return `- **${status}** @ ${started} (${run.source}) — ${meta}${err}`;
    }),
    '',
    '### Game Platform Sync',
    '',
    data.gamePlatformSyncRun
      ? `- **Last Run**: ${new Date(data.gamePlatformSyncRun.started_at).toLocaleString()} — ${data.gamePlatformSyncRun.status}${data.gamePlatformSyncRun.completed_at ? ` (completed ${new Date(data.gamePlatformSyncRun.completed_at).toLocaleString()})` : ''}`
      : '- **Last Run**: Unknown',
    data.gamePlatformSyncRun
      ? `- **Competitors**: ok=${data.gamePlatformSyncRun.competitors_synced ?? 0}, failed=${data.gamePlatformSyncRun.competitors_failed ?? 0}`
      : '',
    data.gamePlatformSyncRun?.error_message
      ? `- **Error**: ${data.gamePlatformSyncRun.error_message}`
      : '',
    '',
    '### Queue Counts',
    '',
    ...(data.queueCounts ?? []).map((row) => `- **${row.status}**: ${row.count}`),
    '',
    '### Recent Jobs (Last 15)',
    '',
    ...(data.recentJobs ?? []).map((job) => {
      const createdAge = minutesAgo(job.created_at);
      const status = job.status;
      const lines = [
        `- **${job.task_type}** (${status}) — created ${createdAge ?? '—'}m ago`,
      ];
      if (job.is_recurring) {
        const lastRun = job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'never';
        lines.push(`  - recurring every ${job.recurrence_interval_minutes ?? '—'}m; last run: ${lastRun}`);
      }
      if (job.last_error) {
        lines.push(`  - Error: ${job.last_error.substring(0, 120)}${job.last_error.length > 120 ? '…' : ''}`);
      }
      return lines.join('\n');
    }),
  ]
    .filter(Boolean)
    .join('\n');
}
