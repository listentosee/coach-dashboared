import { onboardCompetitorToGamePlatform } from '@/lib/integrations/game-platform/service';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status';
import type { JobHandler } from '../types';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

function clampBatchSize(value?: number) {
  if (!value || Number.isNaN(value)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
}

export const handleGamePlatformOnboardCompetitors: JobHandler<'game_platform_onboard_competitors'> = async (
  job,
  { supabase, logger },
) => {
  const payload = job.payload ?? {};
  const competitorIds = Array.isArray(payload.competitorIds)
    ? payload.competitorIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const batchSize = clampBatchSize(payload.batchSize);
  const onlyActive = payload.onlyActive !== false;
  const coachId = payload.coachId ?? null;
  const source = payload.source ?? (competitorIds.length ? 'bulk_import' : 'backfill');
  const forceReonboard = payload.forceReonboard === true;

  const results: {
    processed: number;
    synced: number;
    skipped: number;
    failed: number;
    errors: Array<{ competitorId: string; error: string }>;
  } = {
    processed: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const resolvedLogger = logger ?? console;

  if (forceReonboard && competitorIds.length === 0) {
    return { status: 'failed', error: 'forceReonboard requires explicit competitorIds' };
  }

  const resetCompetitorGamePlatformState = async (competitorId: string) => {
    const { data: competitor, error } = await supabase
      .from('competitors')
      .select('*')
      .eq('id', competitorId)
      .maybeSingle();

    if (error || !competitor) {
      throw new Error(`Competitor ${competitorId} not found`);
    }

    const { error: deleteError } = await supabase
      .from('game_platform_profiles')
      .delete()
      .eq('competitor_id', competitorId);

    if (deleteError) {
      throw new Error(`Failed to clear game platform profile: ${deleteError.message}`);
    }

    const nextStatus = calculateCompetitorStatus({ ...competitor, game_platform_id: null });
    const { error: updateError } = await supabase
      .from('competitors')
      .update({
        game_platform_id: null,
        game_platform_synced_at: null,
        game_platform_sync_error: null,
        status: nextStatus,
      })
      .eq('id', competitorId);

    if (updateError) {
      throw new Error(`Failed to reset competitor game platform state: ${updateError.message}`);
    }
  };

  const processCompetitor = async (competitorId: string) => {
    results.processed += 1;
    try {
      if (forceReonboard) {
        await resetCompetitorGamePlatformState(competitorId);
      }
      const result = await onboardCompetitorToGamePlatform({
        supabase,
        competitorId,
        coachContextId: coachId ?? undefined,
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
        competitorId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  let targetIds = competitorIds;

  if (targetIds.length > 0 && (coachId || onlyActive)) {
    let scopedQuery = supabase
      .from('competitors')
      .select('id')
      .in('id', targetIds);

    if (coachId) {
      scopedQuery = scopedQuery.eq('coach_id', coachId);
    }

    if (onlyActive) {
      scopedQuery = scopedQuery.eq('is_active', true);
    }

    const { data: scopedRows, error: scopedError } = await scopedQuery;
    if (scopedError) {
      return { status: 'failed', error: scopedError.message };
    }

    const allowedIds = new Set((scopedRows ?? []).map((row) => row.id));
    const filteredOut = targetIds.filter((id) => !allowedIds.has(id));
    if (filteredOut.length > 0) {
      results.skipped += filteredOut.length;
      resolvedLogger.warn?.('Skipped competitors outside coach scope or inactive', {
        coachId,
        onlyActive,
        count: filteredOut.length,
      });
    }
    targetIds = targetIds.filter((id) => allowedIds.has(id));
  }

  if (targetIds.length > 0) {
    for (const competitorId of targetIds) {
      await processCompetitor(competitorId);
    }
  } else {
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    for (;;) {
      let query = supabase
        .from('competitors')
        .select('id, created_at')
        .in('status', ['profile', 'compliance'])
        .is('game_platform_id', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(batchSize);

      if (onlyActive) {
        query = query.eq('is_active', true);
      }

      if (coachId) {
        query = query.eq('coach_id', coachId);
      }

      if (cursorCreatedAt && cursorId) {
        query = query.or(
          `created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorId})`,
        );
      }

      const { data, error } = await query;
      if (error) {
        return { status: 'failed', error: error.message };
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const row of data) {
        await processCompetitor(row.id);
      }

      const last = data[data.length - 1];
      cursorCreatedAt = last.created_at;
      cursorId = last.id;

      if (data.length < batchSize) {
        break;
      }
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
