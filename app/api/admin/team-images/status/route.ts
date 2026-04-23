import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

/**
 * Summary stats for the admin page header.
 *  - teams_without_image: teams in system with no image_url
 *  - pending_candidates: candidates awaiting review
 *  - in_flight_jobs: team_image_* jobs in pending/running state
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = getServiceRoleSupabaseClient();

  // Teams-without-image excludes empty teams, matching what the UI shows.
  const [{ data: populatedIds }, { data: imagelessTeams }, { count: pendingCandidates }, { count: inFlight }] =
    await Promise.all([
      service.from('team_members').select('team_id'),
      service.from('teams').select('id').is('image_url', null),
      service.from('team_image_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      service
        .from('job_queue')
        .select('id', { count: 'exact', head: true })
        .in('task_type', ['team_image_bulk_generate', 'team_image_generate'])
        .in('status', ['pending', 'running']),
    ]);

  const populatedSet = new Set((populatedIds ?? []).map((r: { team_id: string }) => r.team_id));
  const teamsNoImage = (imagelessTeams ?? []).filter((t: { id: string }) => populatedSet.has(t.id)).length;

  return NextResponse.json({
    teams_without_image: teamsNoImage,
    pending_candidates: pendingCandidates ?? 0,
    in_flight_jobs: inFlight ?? 0,
  });
}
