'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

interface JobProcessingToggleProps {
  enabled: boolean;
  pausedReason?: string | null;
}

export function JobProcessingToggle({ enabled, pausedReason }: JobProcessingToggleProps) {
  const [processingEnabled, setProcessingEnabled] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleChange = (nextEnabled: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/job-queue/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled, reason: null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update');
        setProcessingEnabled(data.processingEnabled);
        router.refresh();
      } catch (error) {
        console.error('[job-processing-toggle] failed', error);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={processingEnabled}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <span className="text-base font-medium text-foreground">
        {processingEnabled ? 'Job Queue On' : 'Job Queue Off'}
      </span>
    </div>
  );
}
