import type { JobHandler, JobPayloadMap } from '../types';
import { syncAllCompetitorGameStats, syncAllTeamsWithGamePlatform } from '@/lib/integrations/game-platform/service';

export const handleGamePlatformSync: JobHandler<'game_platform_sync'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_sync'] = job.payload ?? {};

  const competitorSummary = await syncAllCompetitorGameStats({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    forceFullSync: payload.forceFullSync ?? false,
    forceFlashCtfSync: payload.forceFlashCtfSync ?? false,
    logger: logger ?? console,
  });

  const hasForceScope = Boolean(payload.forceFullSync || payload.forceFlashCtfSync);
  const isFullForce = Boolean(payload.forceFullSync && payload.forceFlashCtfSync);
  const shouldSyncTeams = !hasForceScope || isFullForce;

  const teamSummary = shouldSyncTeams
    ? await syncAllTeamsWithGamePlatform({
        supabase,
        dryRun: payload.dryRun ?? false,
        coachId: payload.coachId ?? null,
        logger: logger ?? console,
      })
    : { total: 0, synced: 0, skipped: 0, results: [] };

  return {
    status: 'succeeded',
    output: {
      competitors: competitorSummary,
      teams: teamSummary,
    },
  };
};
