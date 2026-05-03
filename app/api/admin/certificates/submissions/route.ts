import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { parseSubmissionAnswers } from '@/lib/certificates/parse-submission';

/**
 * GET /api/admin/certificates/submissions?type=coach|competitor|all
 *
 * Returns survey submissions with respondent info and parsed Q&A pairs.
 * Used by the Submissions panel on the certificates admin page.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const typeParam = (req.nextUrl.searchParams.get('type') ?? 'all') as 'coach' | 'competitor' | 'all';
  const service = getServiceRoleSupabaseClient();

  let query = service
    .from('survey_results')
    .select(`
      id,
      type,
      competitor_id,
      coach_profile_id,
      fillout_submission_id,
      fillout_form_id,
      submitted_at,
      results_jsonb,
      competitors:competitor_id (
        first_name,
        last_name,
        coach:profiles!competitors_coach_id_fkey ( full_name, school_name )
      ),
      profiles:coach_profile_id ( full_name, email, school_name )
    `)
    .order('submitted_at', { ascending: false })
    .limit(500);

  if (typeParam !== 'all') query = query.eq('type', typeParam);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const submissions = (data ?? []).map((r: any) => {
    const respondentName =
      r.type === 'competitor'
        ? `${r.competitors?.first_name ?? ''} ${r.competitors?.last_name ?? ''}`.trim() || '(unknown competitor)'
        : r.profiles?.full_name || r.profiles?.email || '(unknown coach)';

    // Supabase typing on chained FK embeds is loose — coerce through `any`.
    // For competitor rows, surface the *competitor's* coach name + school.
    // For coach rows we already had the school via the direct embed; coach
    // name is left null so the UI can render a dash (the coach is the
    // respondent themselves and would be redundant).
    const competitorCoach = r.competitors?.coach ?? null;
    const coachName = r.type === 'competitor' ? competitorCoach?.full_name ?? null : null;
    const schoolName =
      r.type === 'competitor'
        ? competitorCoach?.school_name ?? null
        : r.profiles?.school_name ?? null;

    return {
      id: r.id,
      type: r.type as 'coach' | 'competitor',
      submitted_at: r.submitted_at,
      fillout_submission_id: r.fillout_submission_id,
      fillout_form_id: r.fillout_form_id,
      respondent_name: respondentName,
      respondent_email: r.type === 'coach' ? r.profiles?.email ?? null : null,
      coach_name: coachName,
      school_name: schoolName,
      competitor_id: r.competitor_id,
      coach_profile_id: r.coach_profile_id,
      answers: parseSubmissionAnswers(r.results_jsonb),
    };
  });

  return NextResponse.json({ submissions });
}
