import type { JobHandler, JobPayloadMap } from '../types';
import { syncAllCompetitorGameStats } from '@/lib/integrations/game-platform/service';

const DEFAULT_BATCH_SIZE = 25;

export const handleGamePlatformFlashCtfSync: JobHandler<'game_platform_flash_ctf_sync'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_flash_ctf_sync'] = job.payload ?? {};
  const log = logger ?? console;

  const batchSize = payload.batchSize ?? DEFAULT_BATCH_SIZE;

  log.info?.(`Starting Flash CTF sync job (batch ${batchSize}, cursor: ${payload.cursor ? payload.cursor.id : 'start'})`);

  const summary = await syncAllCompetitorGameStats({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    forceFullSync: false,
    forceFlashCtfSync: true,
    batchSize,
    cursor: payload.cursor ?? null,
    wave: true,
    logger: log,
  });

  // Persist cursor for the next run
  const nextCursor = summary.nextCursor ?? null;
  const wrapped = summary.wrapped === true;

  const nextPayload: JobPayloadMap['game_platform_flash_ctf_sync'] = {
    ...payload,
    batchSize,
    cursor: nextCursor,
  };

  try {
    await supabase
      .from('job_queue')
      .update({ payload: nextPayload })
      .eq('id', job.id);
  } catch (error) {
    log.warn?.('Failed to update Flash CTF sync cursor', {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  log.info?.(`Flash CTF sync batch complete: ${summary.synced} synced, ${summary.results.filter(r => r.status === 'error').length} failed, ${summary.skipped} skipped${wrapped ? ' (wrapped)' : ''}`);

  return {
    status: 'succeeded',
    output: {
      total: summary.total,
      synced: summary.synced,
      failed: summary.results.filter(r => r.status === 'error').length,
      skipped: summary.skipped,
      wrapped,
      nextCursor,
    },
  };
};
