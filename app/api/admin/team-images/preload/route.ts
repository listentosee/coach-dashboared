import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

/**
 * POST /api/admin/team-images/preload
 *
 * Creates one empty pending `team_image_candidates` row for every team that
 * has no image_url and no existing pending candidate. These rows serve as
 * placeholders in the review UI — admin clicks Regen on each to actually
 * generate an image (useful for testing/refining the prompt one team at a time).
 */
export async function POST() {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = getServiceRoleSupabaseClient();

  const { data: teamsNoImage, error: teamsErr } = await service
    .from('teams')
    .select('id')
    .is('image_url', null);
  if (teamsErr) return NextResponse.json({ error: teamsErr.message }, { status: 500 });

  const teamIds = (teamsNoImage ?? []).map((t: { id: string }) => t.id);
  if (teamIds.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0 });
  }

  const { data: existing } = await service
    .from('team_image_candidates')
    .select('team_id')
    .in('team_id', teamIds)
    .eq('status', 'pending');
  const skip = new Set((existing ?? []).map((r: { team_id: string }) => r.team_id));

  const rowsToInsert = teamIds
    .filter((id) => !skip.has(id))
    .map((team_id) => ({ team_id, status: 'pending' }));

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ created: 0, skipped: skip.size });
  }

  const { error: insErr } = await service.from('team_image_candidates').insert(rowsToInsert);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ created: rowsToInsert.length, skipped: skip.size });
}
