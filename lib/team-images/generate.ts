/**
 * Core team-image generator. Loads team + members + coach, builds the prompt,
 * calls Gemini, uploads the result to the `team-images/_candidates/` folder,
 * and writes a row to `team_image_candidates`.
 *
 * Called inline by the admin regen API (one team, blocking) and by the
 * `team_image_generate` job handler (one team per job, bulk path).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImage } from '@/lib/integrations/gemini/image';
import { buildPrompt, type TeamMemberInfo } from '@/lib/team-images/build-prompt';

const CANDIDATES_FOLDER = '_candidates';

export interface GenerateForTeamInput {
  teamId: string;
  regenInstructions?: string;
  /** When set: the existing candidate that this regen should replace. */
  supersedesCandidateId?: string;
}

export interface GenerateForTeamResult {
  candidateId: string;
  teamId: string;
  path: string;
  style: string;
  palette: string;
}

export async function generateForTeam(
  input: GenerateForTeamInput,
  supabase: SupabaseClient<any, any, any>,
): Promise<GenerateForTeamResult> {
  const { teamId, regenInstructions, supersedesCandidateId } = input;

  // 1. Load team + coach
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select(`
      id, name, coach_id,
      profiles!teams_coach_id_fkey ( school_name, full_name )
    `)
    .eq('id', teamId)
    .single();

  if (teamErr || !team) {
    throw new Error(`Team not found: ${teamId} (${teamErr?.message ?? ''})`);
  }

  const profile = (team as any).profiles as { school_name: string | null; full_name: string | null } | null;
  const schoolName = profile?.school_name ?? 'Cybersecurity Academy';

  // 2. Load members
  const { data: memberRows, error: membersErr } = await supabase
    .from('team_members')
    .select(`
      competitor_id,
      competitors:competitors ( first_name, grade, gender, race, ethnicity, level_of_technology )
    `)
    .eq('team_id', teamId);

  if (membersErr) throw new Error(`Failed to load members: ${membersErr.message}`);

  const members: TeamMemberInfo[] = (memberRows ?? [])
    .map((r: any) => r.competitors)
    .filter((c: any): c is TeamMemberInfo => !!c && !!c.first_name);

  // 3. Build prompt
  const built = buildPrompt({
    teamName: team.name,
    schoolName,
    members,
    regenInstructions: regenInstructions ?? null,
  });

  // 4. Choose candidate row: reuse empty placeholder, supersede real prior, or create new
  let candidateId: string;
  let priorPathToDelete: string | null = null;

  if (supersedesCandidateId) {
    const { data: prior } = await supabase
      .from('team_image_candidates')
      .select('id, candidate_path')
      .eq('id', supersedesCandidateId)
      .maybeSingle();

    if (prior && !prior.candidate_path) {
      // Empty placeholder — update in place
      candidateId = prior.id;
      await supabase
        .from('team_image_candidates')
        .update({
          prompt_used: built.prompt,
          regen_instructions: regenInstructions ?? null,
          status: 'pending',
          error_message: null,
          generated_at: new Date().toISOString(),
        })
        .eq('id', candidateId);
    } else {
      if (prior?.candidate_path) priorPathToDelete = prior.candidate_path;
      await supabase
        .from('team_image_candidates')
        .update({ status: 'superseded', reviewed_at: new Date().toISOString() })
        .eq('id', supersedesCandidateId);

      const { data: newRow, error: insertErr } = await supabase
        .from('team_image_candidates')
        .insert({
          team_id: teamId,
          prompt_used: built.prompt,
          regen_instructions: regenInstructions ?? null,
          status: 'pending',
        })
        .select('id')
        .single();
      if (insertErr || !newRow) {
        throw new Error(`Failed to insert candidate row: ${insertErr?.message ?? ''}`);
      }
      candidateId = newRow.id as string;
    }
  } else {
    const { data: newRow, error: insertErr } = await supabase
      .from('team_image_candidates')
      .insert({
        team_id: teamId,
        prompt_used: built.prompt,
        regen_instructions: regenInstructions ?? null,
        status: 'pending',
      })
      .select('id')
      .single();
    if (insertErr || !newRow) {
      throw new Error(`Failed to insert candidate row: ${insertErr?.message ?? ''}`);
    }
    candidateId = newRow.id as string;
  }

  if (priorPathToDelete) {
    await supabase.storage.from('team-images').remove([priorPathToDelete]);
  }

  // 5. Call Gemini + upload
  try {
    const result = await generateImage({ prompt: built.prompt });
    const ext = result.mimeType.includes('jpeg') ? '.jpg' : '.png';
    const candidatePath = `${CANDIDATES_FOLDER}/${candidateId}${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('team-images')
      .upload(candidatePath, result.bytes, {
        contentType: result.mimeType,
        upsert: true,
      });

    if (uploadErr) {
      await supabase
        .from('team_image_candidates')
        .update({ status: 'failed', error_message: `Upload failed: ${uploadErr.message}` })
        .eq('id', candidateId);
      throw new Error(`Upload failed: ${uploadErr.message}`);
    }

    await supabase
      .from('team_image_candidates')
      .update({ candidate_path: candidatePath })
      .eq('id', candidateId);

    return {
      candidateId,
      teamId,
      path: candidatePath,
      style: built.style,
      palette: built.palette,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('team_image_candidates')
      .update({ status: 'failed', error_message: message })
      .eq('id', candidateId);
    throw err;
  }
}
