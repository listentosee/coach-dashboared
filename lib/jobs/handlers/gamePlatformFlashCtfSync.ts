import type { JobHandler, JobPayloadMap } from '../types';
import { syncAllCompetitorGameStats } from '@/lib/integrations/game-platform/service';

export const handleGamePlatformFlashCtfSync: JobHandler<'game_platform_flash_ctf_sync'> = async (job, { supabase, logger }) => {
  const payload: JobPayloadMap['game_platform_flash_ctf_sync'] = job.payload ?? {};
  const log = logger ?? console;

  log.info?.('Starting Flash CTF sync job');

  const summary = await syncAllCompetitorGameStats({
    supabase,
    dryRun: payload.dryRun ?? false,
    coachId: payload.coachId ?? null,
    forceFullSync: false,
    forceFlashCtfSync: true,
    logger: log,
  });

  log.info?.(`Flash CTF sync complete: ${summary.synced} synced, ${summary.failed} failed, ${summary.skipped} skipped`);

  return {
    status: 'succeeded',
    output: {
      total: summary.total,
      synced: summary.synced,
      failed: summary.failed,
      skipped: summary.skipped,
    },
  };
};
