'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function RunWorkerButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = () => {
    startTransition(async () => {
      try {
        setMessage('Running worker...');
        const res = await fetch('/api/admin/jobs/run-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();

        if (!res.ok) {
          setMessage(`Error: ${data.error || 'Failed to run worker'}`);
          setTimeout(() => setMessage(null), 3000);
          return;
        }

        setMessage(data.message || 'Worker completed');
        setTimeout(() => setMessage(null), 2000);
        router.refresh();
      } catch (error) {
        console.error('[run-worker-button] failed', error);
        setMessage('Error: Network request failed');
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
            Running...
          </>
        ) : (
          'Run Worker Now'
        )}
      </button>
      {message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
