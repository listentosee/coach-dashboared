import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = getServiceRoleSupabaseClient();

  const { data: candidate, error: cErr } = await service
    .from('team_image_candidates')
    .select('id, team_id, candidate_path, status, teams:team_id(coach_id, image_url)')
    .eq('id', candidateId)
    .single();

  if (cErr || !candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }
  if (candidate.status !== 'pending') {
    return NextResponse.json({ error: `Candidate already ${candidate.status}` }, { status: 409 });
  }
  if (!candidate.candidate_path) {
    return NextResponse.json({ error: 'Candidate has no image file' }, { status: 400 });
  }

  const coachId = (candidate.teams as any)?.coach_id as string | undefined;
  const existingImageUrl = ((candidate.teams as any)?.image_url ?? null) as string | null;
  if (!coachId) {
    return NextResponse.json({ error: 'Team has no coach' }, { status: 400 });
  }

  // Guard: refuse to overwrite a coach-uploaded image. Our accept route writes
  // to the exact path `<coach_id>/<team_id>.<ext>`; any other path implies the
  // coach uploaded (or re-uploaded) directly. Admin must reject the candidate
  // to resolve this case — this tool is strictly for backfill.
  const aiAcceptedPathPrefix = `${coachId}/${candidate.team_id}.`;
  if (existingImageUrl && !existingImageUrl.startsWith(aiAcceptedPathPrefix)) {
    return NextResponse.json(
      {
        error:
          'Team already has a coach-uploaded image. Reject this candidate to avoid overwriting the coach\'s upload.',
      },
      { status: 409 },
    );
  }

  const ext = candidate.candidate_path.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.png';
  const finalPath = `${coachId}/${candidate.team_id}${ext}`;

  // Download candidate blob
  const { data: blob, error: dlErr } = await service.storage
    .from('team-images')
    .download(candidate.candidate_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: `Download failed: ${dlErr?.message}` }, { status: 500 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await service.storage
    .from('team-images')
    .upload(finalPath, buffer, { contentType: blob.type || 'image/png', upsert: true });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  // Update team
  const { error: teamErr } = await service
    .from('teams')
    .update({ image_url: finalPath, updated_at: new Date().toISOString() })
    .eq('id', candidate.team_id);
  if (teamErr) {
    return NextResponse.json({ error: `Team update failed: ${teamErr.message}` }, { status: 500 });
  }

  // Mark candidate accepted, delete staging file
  await service.storage.from('team-images').remove([candidate.candidate_path]);
  await service
    .from('team_image_candidates')
    .update({
      status: 'accepted',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      candidate_path: null,
    })
    .eq('id', candidateId);

  return NextResponse.json({ ok: true, image_url: finalPath });
}
