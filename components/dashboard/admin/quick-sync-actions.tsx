'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Loader2, CheckCircle2, XCircle, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface QuickSyncActionsProps {
  className?: string;
}

interface SyncStatus {
  type: 'incremental' | 'totals' | null;
  status: 'idle' | 'triggering' | 'success' | 'error';
  jobId?: string;
  message?: string;
}

const SYNC_PATTERNS = [
  {
    id: 'full-sync',
    name: 'Full Sync (Incremental + Totals)',
    description: 'Fetch recent activity and refresh all aggregate stats',
    icon: PlayCircle,
    color: 'blue',
    steps: [
      { type: 'incremental' as const, name: 'game_platform_sync' },
      { type: 'totals' as const, name: 'game_platform_totals_sweep', delayMs: 30000 },
    ],
  },
  {
    id: 'incremental-only',
    name: 'Incremental Sync (game_platform_sync)',
    description: 'Fetch recent challenge solves without refreshing totals',
    icon: Timer,
    color: 'green',
    steps: [{ type: 'incremental' as const, name: 'game_platform_sync' }],
  },
  {
    id: 'totals-only',
    name: 'Totals Sweep (game_platform_totals_sweep)',
    description: 'Refresh aggregate stats for flagged competitors',
    icon: Timer,
    color: 'purple',
    steps: [{ type: 'totals' as const, name: 'game_platform_totals_sweep' }],
  },
];

export function QuickSyncActions({ className }: QuickSyncActionsProps) {
  const router = useRouter();
  const [activePattern, setActivePattern] = useState<string | null>(null);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const triggerSync = async (type: 'incremental' | 'totals'): Promise<SyncStatus> => {
    const endpoint =
      type === 'incremental'
        ? '/api/admin/jobs/trigger-sync'
        : '/api/admin/jobs/trigger-totals-sweep';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          type,
          status: 'error',
          message: error.error || 'Failed to trigger sync',
        };
      }

      const data = await response.json();
      return {
        type,
        status: 'success',
        jobId: data.jobId,
        message: data.message,
      };
    } catch (error) {
      return {
        type,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const executeSyncPattern = async (patternId: string) => {
    const pattern = SYNC_PATTERNS.find((p) => p.id === patternId);
    if (!pattern) return;

    setActivePattern(patternId);
    setSyncStatuses([]);
    setCurrentStepIndex(0);

    for (let i = 0; i < pattern.steps.length; i++) {
      const step = pattern.steps[i];
      setCurrentStepIndex(i);

      // Add delay if specified (e.g., wait for previous job to complete)
      if (step.delayMs && i > 0) {
        setSyncStatuses((prev) => [
          ...prev,
          {
            type: null,
            status: 'idle',
            message: `Waiting ${step.delayMs / 1000}s for previous job to complete...`,
          },
        ]);
        await new Promise((resolve) => setTimeout(resolve, step.delayMs));
      }

      // Trigger the sync
      setSyncStatuses((prev) => [
        ...prev.slice(0, -1).filter((s) => s.type !== null),
        { type: step.type, status: 'triggering' },
      ]);

      const result = await triggerSync(step.type);
      setSyncStatuses((prev) => [...prev.slice(0, -1), result]);
    }

    setActivePattern(null);

    // Refresh the page to show new jobs in queue
    setTimeout(() => {
      router.refresh();
    }, 1000);
  };

  const getStatusIcon = (status: SyncStatus['status']) => {
    switch (status) {
      case 'triggering':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Timer className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground">Quick Sync Actions</CardTitle>
        <CardDescription className="text-muted-foreground">
          Trigger common sync patterns with a single click
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sync Pattern Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SYNC_PATTERNS.map((pattern) => {
            const Icon = pattern.icon;
            const isActive = activePattern === pattern.id;

            return (
              <Button
                key={pattern.id}
                className="h-auto flex-col items-start p-4 bg-blue-600 text-white hover:bg-blue-700 transition-colors min-h-[120px]"
                onClick={() => executeSyncPattern(pattern.id)}
                disabled={activePattern !== null}
              >
                <div className="flex items-center gap-2 mb-2 w-full">
                  <Icon className="h-5 w-5 text-white" />
                  <span className="font-semibold text-white flex-1 text-left">{pattern.name}</span>
                  {isActive && <Loader2 className="h-4 w-4 animate-spin text-white" />}
                </div>
                <p className="text-xs text-blue-100 text-left w-full line-clamp-2">{pattern.description}</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {pattern.steps.map((step, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs bg-blue-500 text-white border-0">
                      {step.name}
                    </Badge>
                  ))}
                </div>
              </Button>
            );
          })}
        </div>

        {/* Status Log */}
        {syncStatuses.length > 0 && (
          <div className="border rounded-lg p-4 bg-muted/50">
            <h4 className="text-sm font-semibold mb-3 text-foreground">Execution Log</h4>
            <div className="space-y-2">
              {syncStatuses.map((status, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  {getStatusIcon(status.status)}
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {status.type === 'incremental' && 'game_platform_sync'}
                      {status.type === 'totals' && 'game_platform_totals_sweep'}
                      {!status.type && 'Waiting'}
                    </div>
                    {status.message && (
                      <div className="text-xs text-muted-foreground">{status.message}</div>
                    )}
                    {status.jobId && (
                      <div className="text-xs text-muted-foreground font-mono">
                        Job ID: {status.jobId.slice(0, 8)}...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          <p>
            <strong className="text-foreground">Tip:</strong> Full Sync waits 30 seconds between steps to avoid overwhelming the system.
          </p>
          <p>
            Monitor job progress in the Job Queue table below. Jobs typically complete within 2-5 minutes.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
