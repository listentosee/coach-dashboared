import type { JobHandler, JobPayloadMap } from '../types';

const DEFAULT_BATCH_SIZE = 500;

export const handleMessageReadReceiptsBackfill: JobHandler<'message_read_receipts_backfill'> = async (
  job,
  { logger, supabase },
) => {
  const payload: JobPayloadMap['message_read_receipts_backfill'] = job.payload ?? {};
  const log = logger ?? console;

  const batchSize = Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE);
  const maxRows = typeof payload.maxRows === 'number' ? Math.max(0, payload.maxRows) : null;
  const dryRun = payload.dryRun ?? false;

  let offset = 0;
  let batches = 0;
  let scanned = 0;
  let inserted = 0;

  try {
    while (true) {
      const remaining = maxRows === null ? null : Math.max(0, maxRows - scanned);
      if (remaining === 0) break;
      const limit = remaining === null ? batchSize : Math.min(batchSize, remaining);

      const { data: states, error } = await supabase
        .from('message_user_state')
        .select('message_id, user_id, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      if (!states || states.length === 0) break;

      scanned += states.length;
      batches += 1;

      if (!dryRun) {
        const receipts = states.map((row) => ({
          message_id: row.message_id,
          user_id: row.user_id,
          read_at: row.archived_at ?? new Date().toISOString(),
        }));

        const { data: insertedRows, error: insertError } = await supabase
          .from('message_read_receipts')
          .upsert(receipts, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
          .select('id');

        if (insertError) throw insertError;

        inserted += insertedRows?.length ?? 0;
      }

      if (states.length < limit) break;
      offset += states.length;
    }

    return {
      status: 'succeeded',
      output: {
        scanned,
        inserted,
        batches,
        dryRun,
        batchSize,
        maxRows,
      },
    };
  } catch (error) {
    log.error('[message-read-receipts-backfill] job failed', error);
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error backfilling message read receipts',
    };
  }
};
