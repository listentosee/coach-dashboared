import type { JobHandler, JobPayloadMap } from '../types';
import { sweepPendingTotalsRefresh } from '@/lib/integrations/game-platform/service';
import { enqueueJob } from '@/lib/jobs/queue';

export const handleGamePlatformTotalsSweep: JobHandler<'game_platform_totals_sweep'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_totals_sweep'] = job.payload ?? {};

  const result = await sweepPendingTotalsRefresh({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    batchSize: payload.batchSize ?? 100,
    forceAll: payload.forceAll ?? false,
    cursor: payload.cursor ?? null,
    logger: logger ?? console,
  });

  if (payload.forceAll && result?.nextCursor) {
    try {
      await enqueueJob({
        taskType: 'game_platform_totals_sweep',
        payload: {
          ...payload,
          cursor: result.nextCursor,
        },
        runAt: new Date(),
      });
    } catch (error) {
      logger?.warn?.('Failed to enqueue next totals sweep batch', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: 'succeeded',
    output: result,
  };
};
