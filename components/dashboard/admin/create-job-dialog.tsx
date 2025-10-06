'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';

const TASK_TYPES = [
  { value: 'game_platform_sync', label: 'Incremental Sync (game_platform_sync)' },
  { value: 'game_platform_totals_sweep', label: 'Totals Sweep (game_platform_totals_sweep)' },
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

const DURATION_OPTIONS = [
  { value: 'forever', label: 'Forever (until manually stopped)' },
  { value: '60', label: '1 hour' },
  { value: '360', label: '6 hours' },
  { value: '1440', label: '1 day' },
  { value: '10080', label: '1 week' },
  { value: '43200', label: '30 days' },
];

export function CreateJobDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    task_type: 'game_platform_sync',
    is_recurring: false,
    recurrence_interval_minutes: 60,
    duration: 'forever',
    run_at: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = formData.task_type === 'game_platform_sync'
        ? { dryRun: false }
        : { batchSize: 50 };

      const expiresAt = !formData.is_recurring || formData.duration === 'forever'
        ? null
        : new Date(Date.now() + parseInt(formData.duration) * 60 * 1000).toISOString();

      const runAt = formData.run_at
        ? new Date(formData.run_at).toISOString()
        : new Date().toISOString();

      const res = await fetch('/api/admin/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type: formData.task_type,
          payload,
          is_recurring: formData.is_recurring,
          recurrence_interval_minutes: formData.is_recurring ? formData.recurrence_interval_minutes : null,
          expires_at: expiresAt,
          run_at: runAt,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create job');
      }

      setIsOpen(false);
      setFormData({
        task_type: 'game_platform_sync',
        is_recurring: false,
        recurrence_interval_minutes: 60,
        duration: 'forever',
        run_at: '',
      });
      router.refresh();
    } catch (error) {
      console.error('[create-job] Failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Job
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Create Job</DialogTitle>
          <DialogDescription className="text-gray-600">
            Create a one-time or recurring background job.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="run_at" className="text-gray-900">Run At (optional)</Label>
            <Input
              id="run_at"
              type="datetime-local"
              value={formData.run_at}
              onChange={(e) => setFormData({ ...formData, run_at: e.target.value })}
              className="bg-white text-gray-900 border-gray-300"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty to run immediately</p>
          </div>

          <div className="flex items-center gap-3 p-3 border rounded bg-gray-50">
            <Switch
              checked={formData.is_recurring}
              onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
            />
            <div>
              <Label className="text-gray-900">Recurring Job</Label>
              <p className="text-xs text-gray-600">Job runs repeatedly on a schedule</p>
            </div>
          </div>

          {formData.is_recurring && (
            <>
              <div>
                <Label htmlFor="interval" className="text-gray-900">How Often</Label>
                <select
                  id="interval"
                  value={formData.recurrence_interval_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, recurrence_interval_minutes: parseInt(e.target.value) })
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

              <div>
                <Label htmlFor="duration" className="text-gray-900">How Long</Label>
                <select
                  id="duration"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                  required
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700">
              {isSubmitting ? 'Creating...' : 'Create Job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
