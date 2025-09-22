'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface JobProcessingToggleProps {
  enabled: boolean;
  pausedReason?: string | null;
}

export function JobProcessingToggle({ enabled, pausedReason }: JobProcessingToggleProps) {
  const [processingEnabled, setProcessingEnabled] = useState(enabled);
  const [reason, setReason] = useState(pausedReason ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleChange = (nextEnabled: boolean) => {
    startTransition(async () => {
      try {
        let payloadReason = reason;
        if (!nextEnabled) {
          const input = window.prompt('Pause reason', reason || 'Maintenance window');
          if (input === null) {
            // User cancelled prompt; abort update.
            return;
          }
          payloadReason = input.trim();
          setReason(payloadReason);
        }
        const res = await fetch('/api/admin/job-queue/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled, reason: payloadReason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update');
        setProcessingEnabled(data.processingEnabled);
        setReason(data.pausedReason ?? '');
        router.refresh();
      } catch (error) {
        console.error('[job-processing-toggle] failed', error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Automatic Processing</h2>
          <p className="text-xs text-gray-500">
            Toggle whether cron-triggered jobs are processed automatically.
          </p>
        </div>
        <Switch
          checked={processingEnabled}
          onCheckedChange={handleChange}
          disabled={isPending}
        />
      </div>
      {!processingEnabled && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500" htmlFor="pause-reason">
            Pause reason
          </label>
          <input
            id="pause-reason"
            className={cn(
              'w-full rounded border px-3 py-2 text-sm',
              isPending && 'opacity-70'
            )}
            disabled={isPending}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g., Maintenance window"
          />
        </div>
      )}
    </div>
  );
}
