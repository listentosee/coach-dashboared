import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
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
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const filter = (req.nextUrl.searchParams.get('filter') ?? 'all') as 'pending' | 'all';
  const service = getServiceRoleSupabaseClient();

  // 1. Load all teams + coach (plus populated-team filter below).
  const { data: teamsRaw, error: teamsErr } = await service
    .from('teams')
    .select(`
      id, name, image_url, coach_id,
      profiles!teams_coach_id_fkey ( full_name, school_name )
    `)
    .order('name');

  if (teamsErr) return NextResponse.json({ error: teamsErr.message }, { status: 500 });

  // Drop empty teams — no point generating an image for a team with no roster.
  // Also count active members per team (is_active=true AND status != 'pending')
  // so the UI can surface the roster size that actually competes.
  const { data: populatedRows } = await service
    .from('team_members')
    .select('team_id, competitors:competitors ( is_active, status )');
  const populatedTeamIds = new Set((populatedRows ?? []).map((r: { team_id: string }) => r.team_id));
  const activeByTeam = new Map<string, number>();
  for (const row of (populatedRows ?? []) as Array<{ team_id: string; competitors: { is_active: boolean | null; status: string | null } | null }>) {
    const c = row.competitors;
    const isActive = !!c && c.is_active !== false && c.status !== 'pending';
    if (isActive) activeByTeam.set(row.team_id, (activeByTeam.get(row.team_id) ?? 0) + 1);
  }
  const teams = (teamsRaw ?? []).filter((t) => populatedTeamIds.has(t.id));

  // 2. Load all candidates (newest first), keep only the latest per team
  const { data: allCandidates } = await service
    .from('team_image_candidates')
    .select('id, team_id, candidate_path, prompt_used, regen_instructions, status, error_message, generated_at, reviewed_at')
    .order('generated_at', { ascending: false });

  const latestByTeam = new Map<string, NonNullable<typeof allCandidates>[number]>();
  for (const c of allCandidates ?? []) {
    if (!latestByTeam.has(c.team_id)) latestByTeam.set(c.team_id, c);
  }

  // 3. First pass: derive status + figure out which paths need signed URLs
  type TeamDerived = {
    t: any;
    coach: { full_name: string | null; school_name: string | null } | null;
    latest: (typeof allCandidates)[number] | null;
    imageUrl: string | null;
    status: 'pending' | 'generated' | 'complete' | 'failed' | 'missing';
    coachUploadedWhilePending: boolean;
    imagePath: string | null;
    coachImagePath: string | null;
  };

  const derived: TeamDerived[] = (teams ?? []).map((t: any) => {
    const coach = t.profiles as { full_name: string | null; school_name: string | null } | null;
    const latest = latestByTeam.get(t.id) ?? null;

    const imageUrl: string | null = t.image_url ?? null;
    const aiAcceptedPathPrefix = `${t.coach_id}/${t.id}.`;
    const isAiAcceptedImage = !!imageUrl && imageUrl.startsWith(aiAcceptedPathPrefix);
    const isCoachUploadedImage = !!imageUrl && !isAiAcceptedImage;

    let status: TeamDerived['status'];
    if (latest?.status === 'pending') status = 'pending';
    else if (latest?.status === 'accepted' && imageUrl) status = 'generated';
    else if (imageUrl) status = 'complete';
    else if (latest?.status === 'failed') status = 'failed';
    else status = 'missing';

    const coachUploadedWhilePending = status === 'pending' && isCoachUploadedImage;

    let imagePath: string | null = null;
    if (status === 'pending' && latest?.candidate_path) imagePath = latest.candidate_path;
    else if (imageUrl) imagePath = imageUrl;

    const coachImagePath = coachUploadedWhilePending && imageUrl ? imageUrl : null;

    return { t, coach, latest, imageUrl, status, coachUploadedWhilePending, imagePath, coachImagePath };
  });

  // 4. Batch-sign every unique path in ONE call. Signing 50+ URLs with
  // per-path awaits blows past the serverless timeout.
  const uniquePaths = Array.from(
    new Set(
      derived
        .flatMap((d) => [d.imagePath, d.coachImagePath])
        .filter((p): p is string => !!p),
    ),
  );

  const signedByPath = new Map<string, string>();
  if (uniquePaths.length > 0) {
    const { data: signedBatch } = await service.storage
      .from('team-images')
      .createSignedUrls(uniquePaths, 60 * 60 * 8);
    for (const entry of signedBatch ?? []) {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    }
  }

  // 5. Build final rows
  const rows = derived.map(({ t, coach, latest, status, coachUploadedWhilePending, imagePath, coachImagePath }) => {
    return {
      team_id: t.id,
      team_name: t.name,
      active_member_count: activeByTeam.get(t.id) ?? 0,
      coach_name: coach?.full_name ?? null,
      school_name: coach?.school_name ?? null,
      status,
      image_path: imagePath,
      signed_url: imagePath ? signedByPath.get(imagePath) ?? null : null,
      coach_uploaded_while_pending: coachUploadedWhilePending,
      coach_image_signed_url: coachImagePath ? signedByPath.get(coachImagePath) ?? null : null,
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
  });

  const filtered = filter === 'pending' ? rows.filter((r) => r.status === 'pending') : rows;

  return NextResponse.json({ teams: filtered });
}
