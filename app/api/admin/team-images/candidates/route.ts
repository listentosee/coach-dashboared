import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

/**
 * GET /api/admin/team-images/candidates?status=pending
 *
 * Returns candidate rows with joined team + coach info and a signed URL for the image.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const statusFilter = req.nextUrl.searchParams.get('status') ?? 'pending';
  const service = getServiceRoleSupabaseClient();

  let query = service
    .from('team_image_candidates')
    .select(`
      id, team_id, candidate_path, prompt_used, regen_instructions,
      status, error_message, generated_at, reviewed_at,
      teams:team_id ( id, name, coach_id, profiles!teams_coach_id_fkey ( full_name, school_name ) )
    `)
    .order('generated_at', { ascending: false })
    .limit(200);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate signed URLs for candidate files
  const candidates = await Promise.all(
    (data ?? []).map(async (row: any) => {
      let signedUrl: string | null = null;
      if (row.candidate_path) {
        const { data: signed } = await service.storage
          .from('team-images')
          .createSignedUrl(row.candidate_path, 60 * 60 * 8); // 8h
        signedUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        team_id: row.team_id,
        team_name: row.teams?.name ?? 'Unknown Team',
        coach_name: row.teams?.profiles?.full_name ?? null,
        school_name: row.teams?.profiles?.school_name ?? null,
        candidate_path: row.candidate_path,
        signed_url: signedUrl,
        prompt_used: row.prompt_used,
        regen_instructions: row.regen_instructions,
        status: row.status,
        error_message: row.error_message,
        generated_at: row.generated_at,
        reviewed_at: row.reviewed_at,
      };
    }),
  );

  return NextResponse.json({ candidates });
}
