import { onboardCoachToGamePlatform } from '@/lib/integrations/game-platform/service';
import type { JobHandler, JobPayloadMap } from '../types';

export const handleGamePlatformOnboardCoaches: JobHandler<'game_platform_onboard_coaches'> = async (
  job,
  { supabase, logger },
) => {
  const payload: JobPayloadMap['game_platform_onboard_coaches'] = job.payload ?? {};
  const resolvedLogger = logger ?? console;

  const requestedIds = Array.isArray(payload.coachIds)
    ? payload.coachIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const coachId = payload.coachId ?? null;
  const source = payload.source ?? (requestedIds.length > 0 || coachId ? 'manual' : 'backfill');

  let coachIds = requestedIds.length > 0
    ? requestedIds
    : coachId
    ? [coachId]
    : [];

  if (coachIds.length === 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'coach');

    if (error) {
      return { status: 'failed', error: error.message };
    }

    coachIds = (data ?? []).map((row) => row.id).filter(Boolean);
  }

  const uniqueCoachIds = Array.from(new Set(coachIds));

  const results: {
    processed: number;
    synced: number;
    skipped: number;
    failed: number;
    errors: Array<{ coachId: string; error: string }>;
  } = {
    processed: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const id of uniqueCoachIds) {
    results.processed += 1;
    try {
      const result = await onboardCoachToGamePlatform({
        supabase,
        coachId: id,
        dryRun: payload.dryRun ?? false,
        logger: resolvedLogger,
      });
      if (result.status === 'synced') {
        results.synced += 1;
      } else {
        results.skipped += 1;
      }
    } catch (error) {
      results.failed += 1;
      results.errors.push({
        coachId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: 'succeeded',
    output: {
      source,
      processed: results.processed,
      synced: results.synced,
      skipped: results.skipped,
      failed: results.failed,
      errors: results.errors.slice(0, 20),
    },
  };
};
