'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Clock, Loader2 } from 'lucide-react';

interface RecurringJob {
  id: string;
  name: string;
  task_type: string;
  schedule_interval_minutes: number;
  enabled: boolean;
  last_enqueued_at: string | null;
}

interface RecurringJobsManagerProps {
  jobs: RecurringJob[];
}

export function RecurringJobsManager({ jobs }: RecurringJobsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleToggle = async (jobId: string, currentEnabled: boolean) => {
    setUpdatingId(jobId);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/recurring-jobs/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, enabled: !currentEnabled }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to update');
        }

        router.refresh();
      } catch (error) {
        console.error('[recurring-jobs] Failed to toggle:', error);
      } finally {
        setUpdatingId(null);
      }
    });
  };

  const formatInterval = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
  };

  const getNextRun = (job: RecurringJob) => {
    if (!job.last_enqueued_at) return 'Next cron run';
    const lastRun = new Date(job.last_enqueued_at);
    const nextRun = new Date(lastRun.getTime() + job.schedule_interval_minutes * 60 * 1000);
    const now = new Date();

    if (nextRun <= now) return 'Due now';

    const minutesUntil = Math.floor((nextRun.getTime() - now.getTime()) / 1000 / 60);
    if (minutesUntil < 60) return `in ${minutesUntil}m`;
    return `in ${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Recurring Job Schedule</CardTitle>
        <CardDescription className="text-muted-foreground">
          Automated jobs that run on a schedule. The cron worker checks every 5 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.map((job) => {
            const isUpdating = updatingId === job.id;

            return (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{job.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      Every {formatInterval(job.schedule_interval_minutes)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-mono text-xs">{job.task_type}</span>
                    {job.enabled && (
                      <span className="ml-3 text-xs">
                        Next run: {getNextRun(job)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={() => handleToggle(job.id, job.enabled)}
                    disabled={isPending}
                  />
                  <span className="text-sm font-medium text-foreground min-w-[60px]">
                    {job.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
