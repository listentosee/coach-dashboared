import type { JobHandler, JobPayloadMap } from '../types';
import { refreshGamePlatformProfiles } from '@/lib/integrations/game-platform/service';

export const handleGamePlatformProfileRefresh: JobHandler<'game_platform_profile_refresh'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_profile_refresh'] = job.payload ?? {};

  const summary = await refreshGamePlatformProfiles({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    logger: logger ?? console,
  });

  return {
    status: 'succeeded',
    output: summary,
  };
};
