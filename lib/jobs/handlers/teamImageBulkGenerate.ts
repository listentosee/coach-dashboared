import type { JobHandler } from '../types';
import { enqueueJob } from '../queue';

/**
 * Fans out: finds all teams that need an AI-generated image, and enqueues one
 * `team_image_generate` job per team. Skips teams that already have a real
 * image OR a pending candidate (to avoid duplicate review).
 */
export const handleTeamImageBulkGenerate: JobHandler<'team_image_bulk_generate'> = async (
  job,
  { supabase, logger },
) => {
  const log = logger ?? console;
  const { teamIds, requestedBy } = job.payload;

  // Find target teams
  let query = supabase.from('teams').select('id').is('image_url', null);
  if (teamIds && teamIds.length > 0) {
    query = supabase.from('teams').select('id').in('id', teamIds);
  }

  const { data: teams, error } = await query;
  if (error) {
    return { status: 'failed', error: `Failed to query teams: ${error.message}` };
  }

  if (!teams || teams.length === 0) {
    return { status: 'succeeded', output: { enqueued: 0, message: 'no eligible teams' } };
  }

  // Find teams that already have a pending candidate so we skip them
  const teamIdList = teams.map((t: { id: string }) => t.id);
  const { data: existingPending } = await supabase
    .from('team_image_candidates')
    .select('team_id')
    .in('team_id', teamIdList)
    .eq('status', 'pending');

  const skip = new Set((existingPending ?? []).map((r: { team_id: string }) => r.team_id));
  const toEnqueue = teamIdList.filter((id) => !skip.has(id));

  let enqueued = 0;
  for (const teamId of toEnqueue) {
    try {
      await enqueueJob({
        taskType: 'team_image_generate',
        payload: { teamId, requestedBy },
        client: supabase,
      });
      enqueued++;
    } catch (err) {
      log.warn('[team-image-bulk-generate] failed to enqueue', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    status: 'succeeded',
    output: { enqueued, skipped: skip.size, totalEligible: teamIdList.length },
  };
};
