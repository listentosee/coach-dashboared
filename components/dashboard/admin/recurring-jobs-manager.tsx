'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Clock, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

const TASK_TYPES = [
  { value: 'game_platform_sync', label: 'Incremental Sync (game_platform_sync)' },
  { value: 'game_platform_totals_sweep', label: 'Totals Sweep (game_platform_totals_sweep)' },
  { value: 'sms_digest_processor', label: 'Unread Notification Processor (sms_digest_processor)' },
];

const COMMON_INTERVALS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours (daily)' },
];

export function RecurringJobsManager({ jobs }: RecurringJobsManagerProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    task_type: 'game_platform_sync',
    schedule_interval_minutes: 60,
  });

  const handleToggle = async (jobId: string, currentEnabled: boolean) => {
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
    }
  };

  const handleDelete = async (jobId: string, jobName: string) => {
    if (!confirm(`Delete recurring job "${jobName}"?`)) return;

    try {
      const res = await fetch('/api/admin/recurring-jobs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete');
      }

      router.refresh();
    } catch (error) {
      console.error('[recurring-jobs] Failed to delete:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/admin/recurring-jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create');
      }

      setIsDialogOpen(false);
      setFormData({ name: '', task_type: 'game_platform_sync', schedule_interval_minutes: 60 });
      router.refresh();
    } catch (error) {
      console.error('[recurring-jobs] Failed to create:', error);
      alert(error instanceof Error ? error.message : 'Failed to create recurring job');
    } finally {
      setIsSubmitting(false);
    }
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">Recurring Job Schedule</CardTitle>
            <CardDescription className="text-muted-foreground">
              Automated jobs that run on a schedule. The cron worker checks every 5 minutes.
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Job
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Recurring Job</DialogTitle>
                <DialogDescription>
                  Create a new job that runs automatically on a schedule.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-gray-900">Job Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Hourly Incremental Sync"
                    className="bg-white text-gray-900 border-gray-300"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="task_type" className="text-gray-900">Task Type</Label>
                  <select
                    id="task_type"
                    value={formData.task_type}
                    onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    required
                  >
                    {TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="interval" className="text-gray-900">Schedule Interval</Label>
                  <select
                    id="interval"
                    value={formData.schedule_interval_minutes}
                    onChange={(e) =>
                      setFormData({ ...formData, schedule_interval_minutes: parseInt(e.target.value) })
                    }
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    required
                  >
                    {COMMON_INTERVALS.map((interval) => (
                      <option key={interval.value} value={interval.value}>
                        {interval.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700">
                    {isSubmitting ? 'Creating...' : 'Create Job'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <span className="font-semibold text-gray-900">{job.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                    Every {formatInterval(job.schedule_interval_minutes)}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-mono text-xs">{job.task_type}</span>
                  {job.enabled && (
                    <span className="ml-3 text-xs">Next run: {getNextRun(job)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={job.enabled}
                  onCheckedChange={() => handleToggle(job.id, job.enabled)}
                />
                <span className="text-sm font-medium text-gray-900 min-w-[60px]">
                  {job.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={() => handleDelete(job.id, job.name)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete job"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
