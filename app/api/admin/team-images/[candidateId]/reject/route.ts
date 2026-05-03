import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;

  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = getServiceRoleSupabaseClient();

  const { data: candidate, error: cErr } = await service
    .from('team_image_candidates')
    .select('id, candidate_path, status')
    .eq('id', candidateId)
    .single();

  if (cErr || !candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }
  if (candidate.status !== 'pending') {
    return NextResponse.json({ error: `Candidate already ${candidate.status}` }, { status: 409 });
  }

  if (candidate.candidate_path) {
    await service.storage.from('team-images').remove([candidate.candidate_path]);
  }

  await service
    .from('team_image_candidates')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      candidate_path: null,
    })
    .eq('id', candidateId);

  return NextResponse.json({ ok: true });
}
