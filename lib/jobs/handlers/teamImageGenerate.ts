import type { JobHandler } from '../types';
import { generateForTeam } from '@/lib/team-images/generate';

/**
 * Job wrapper around generateForTeam. Used only for bulk runs (the per-team
 * regen API calls generateForTeam directly and awaits the result).
 */
export const handleTeamImageGenerate: JobHandler<'team_image_generate'> = async (job, { supabase }) => {
  const { teamId, regenInstructions, supersedesCandidateId } = job.payload;

  if (!teamId) {
    return { status: 'failed', error: 'Missing teamId in payload' };
  }

  try {
    const result = await generateForTeam(
      { teamId, regenInstructions, supersedesCandidateId },
      supabase,
    );
    return { status: 'succeeded', output: result };
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
