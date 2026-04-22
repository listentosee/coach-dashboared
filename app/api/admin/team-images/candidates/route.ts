import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

/**
 * GET /api/admin/team-images/candidates?filter=pending|all
 *
 * Returns every team in the system with a derived image-status:
 *   - pending:   latest candidate is pending (awaiting review)
 *   - generated: latest candidate is accepted AND team has image_url
 *   - complete:  team has image_url but no accepted candidate (coach-uploaded)
 *   - failed:    latest candidate failed AND team has no image_url
 *   - missing:   no image_url and no open candidate
 *
 * `filter=pending` narrows to only teams whose latest candidate is pending;
 * `filter=all` returns every team regardless of status.
 *
 * For display convenience, includes a signed URL for either the current team
 * image (complete/generated) or the pending candidate preview (pending).
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const filter = (req.nextUrl.searchParams.get('filter') ?? 'all') as 'pending' | 'all';
  const service = getServiceRoleSupabaseClient();

  // 1. Load all teams + coach
  const { data: teams, error: teamsErr } = await service
    .from('teams')
    .select(`
      id, name, image_url, coach_id,
      profiles!teams_coach_id_fkey ( full_name, school_name )
    `)
    .order('name');

  if (teamsErr) return NextResponse.json({ error: teamsErr.message }, { status: 500 });

  // 2. Load all candidates (newest first), keep only the latest per team
  const { data: allCandidates } = await service
    .from('team_image_candidates')
    .select('id, team_id, candidate_path, prompt_used, regen_instructions, status, error_message, generated_at, reviewed_at')
    .order('generated_at', { ascending: false });

  const latestByTeam = new Map<string, NonNullable<typeof allCandidates>[number]>();
  for (const c of allCandidates ?? []) {
    if (!latestByTeam.has(c.team_id)) latestByTeam.set(c.team_id, c);
  }

  // 3. Build rows
  const rows = await Promise.all(
    (teams ?? []).map(async (t: any) => {
      const coach = t.profiles as { full_name: string | null; school_name: string | null } | null;
      const latest = latestByTeam.get(t.id) ?? null;

      // Detect coach-uploaded images. Our accept route writes to the exact
      // path `<coach_id>/<team_id>.<ext>`. Anything else came from the coach.
      const imageUrl: string | null = t.image_url ?? null;
      const aiAcceptedPathPrefix = `${t.coach_id}/${t.id}.`;
      const isAiAcceptedImage =
        !!imageUrl && imageUrl.startsWith(aiAcceptedPathPrefix);
      const isCoachUploadedImage = !!imageUrl && !isAiAcceptedImage;

      // Derive status
      let status: 'pending' | 'generated' | 'complete' | 'failed' | 'missing';
      if (latest?.status === 'pending') status = 'pending';
      else if (latest?.status === 'accepted' && imageUrl) status = 'generated';
      else if (imageUrl) status = 'complete';
      else if (latest?.status === 'failed') status = 'failed';
      else status = 'missing';

      // Guard: if the team now has a coach-uploaded image while a candidate
      // is still pending, the admin must NOT accept — that would overwrite
      // the coach's work. Surface this to the UI.
      const coachUploadedWhilePending = status === 'pending' && isCoachUploadedImage;

      // Pick which image to display: pending candidate preview OR current team image
      let imagePath: string | null = null;
      if (status === 'pending' && latest?.candidate_path) imagePath = latest.candidate_path;
      else if (imageUrl) imagePath = imageUrl;

      let signedUrl: string | null = null;
      if (imagePath) {
        const { data: signed } = await service.storage
          .from('team-images')
          .createSignedUrl(imagePath, 60 * 60 * 8);
        signedUrl = signed?.signedUrl ?? null;
      }

      // If a coach upload exists alongside a pending candidate, also sign the
      // coach image so the UI can show a thumbnail warning.
      let coachImageSignedUrl: string | null = null;
      if (coachUploadedWhilePending && imageUrl) {
        const { data: signed } = await service.storage
          .from('team-images')
          .createSignedUrl(imageUrl, 60 * 60 * 8);
        coachImageSignedUrl = signed?.signedUrl ?? null;
      }

      return {
        team_id: t.id,
        team_name: t.name,
        coach_name: coach?.full_name ?? null,
        school_name: coach?.school_name ?? null,
        status,
        image_path: imagePath,
        signed_url: signedUrl,
        coach_uploaded_while_pending: coachUploadedWhilePending,
        coach_image_signed_url: coachImageSignedUrl,
        candidate: latest
          ? {
              id: latest.id,
              status: latest.status,
              prompt_used: latest.prompt_used,
              regen_instructions: latest.regen_instructions,
              error_message: latest.error_message,
              generated_at: latest.generated_at,
              candidate_path: latest.candidate_path,
            }
          : null,
      };
    }),
  );

  const filtered = filter === 'pending' ? rows.filter((r) => r.status === 'pending') : rows;

  return NextResponse.json({ teams: filtered });
}
