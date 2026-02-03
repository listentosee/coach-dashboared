import type { JobHandler, JobPayloadMap } from '../types';
import { syncAllCompetitorGameStats, syncAllTeamsWithGamePlatform } from '@/lib/integrations/game-platform/service';

export const handleGamePlatformSync: JobHandler<'game_platform_sync'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_sync'] = job.payload ?? {};
  const useWave = payload.mode === 'wave' || typeof payload.batchSize === 'number';

  const competitorSummary = await syncAllCompetitorGameStats({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    forceFullSync: payload.forceFullSync ?? false,
    forceFlashCtfSync: payload.forceFlashCtfSync ?? false,
    batchSize: useWave ? payload.batchSize : undefined,
    cursor: useWave ? payload.cursor ?? null : undefined,
    wave: useWave,
    logger: logger ?? console,
  });

  if (useWave) {
    const nextCursor = competitorSummary.nextCursor ?? null;
    const nextPayload: JobPayloadMap['game_platform_sync'] = {
      ...payload,
      mode: payload.mode ?? 'wave',
      batchSize: payload.batchSize,
      cursor: nextCursor,
    };

    try {
      await supabase
        .from('job_queue')
        .update({ payload: nextPayload })
        .eq('id', job.id);
    } catch (error) {
      logger?.warn?.('Failed to update wave sync cursor', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const hasForceScope = Boolean(payload.forceFullSync || payload.forceFlashCtfSync);
  const isFullForce = Boolean(payload.forceFullSync && payload.forceFlashCtfSync);
  let shouldSyncTeams = !hasForceScope || isFullForce;
  const wrapped = useWave ? competitorSummary.wrapped === true : false;

  if (useWave) {
    if (payload.syncTeams === true) {
      shouldSyncTeams = true;
    } else if (payload.syncTeams === false) {
      shouldSyncTeams = false;
    } else {
      shouldSyncTeams = wrapped;
    }
  } else if (typeof payload.syncTeams === 'boolean') {
    shouldSyncTeams = payload.syncTeams;
  }

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
