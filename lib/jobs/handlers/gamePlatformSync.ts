import type { JobHandler, JobPayloadMap } from '../types';
import { syncAllCompetitorGameStats, syncAllTeamsWithGamePlatform } from '@/lib/integrations/game-platform/service';

export const handleGamePlatformSync: JobHandler<'game_platform_sync'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_sync'] = job.payload ?? {};

  const competitorSummary = await syncAllCompetitorGameStats({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    forceFullSync: payload.forceFullSync ?? false,
    logger: logger ?? console,
  });

  const teamSummary = await syncAllTeamsWithGamePlatform({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    logger: logger ?? console,
  });

  return {
    status: 'succeeded',
    output: {
      competitors: competitorSummary,
      teams: teamSummary,
    },
  };
};
