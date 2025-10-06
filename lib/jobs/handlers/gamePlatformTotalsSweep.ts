import type { JobHandler, JobPayloadMap } from '../types';
import { sweepPendingTotalsRefresh } from '@/lib/integrations/game-platform/service';

export const handleGamePlatformTotalsSweep: JobHandler<'game_platform_totals_sweep'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_totals_sweep'] = job.payload ?? {};

  const result = await sweepPendingTotalsRefresh({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    batchSize: payload.batchSize ?? 100,
    logger: logger ?? console,
  });

  return {
    status: 'succeeded',
    output: result,
  };
};
