import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { collectColumns, escapeCsv, rowValuesByColumn } from '@/lib/certificates/parse-submission';

/**
 * GET /api/admin/certificates/submissions/export?type=coach|competitor
 *
 * Streams a CSV of all submissions of the given type. Columns:
 *   submitted_at, respondent, email, school, <one column per question>
 *
 * Question columns come from the union of question ids across all
 * submissions (in first-seen order), so differently-shaped submissions
 * still align as long as Fillout question ids are stable.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const typeParam = req.nextUrl.searchParams.get('type');
  if (typeParam !== 'coach' && typeParam !== 'competitor') {
    return NextResponse.json({ error: 'type must be coach or competitor' }, { status: 400 });
  }

  const service = getServiceRoleSupabaseClient();
  const { data, error } = await service
    .from('survey_results')
    .select(`
      id,
      type,
      submitted_at,
      results_jsonb,
      competitors:competitor_id (
        first_name,
        last_name,
        email_personal,
        email_school,
        coach:profiles!competitors_coach_id_fkey ( full_name, school_name )
      ),
      profiles:coach_profile_id ( full_name, email, school_name )
    `)
    .eq('type', typeParam)
    .order('submitted_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const columns = collectColumns(rows.map((r: any) => r.results_jsonb));

  // `coach` and `school` are populated for competitor exports (the
  // respondent's own coach) so analysts can group by coach/school without
  // re-joining manually. For coach exports `coach` is left blank since
  // the coach is the respondent and `school` carries their own school.
  const header = ['submitted_at', 'respondent', 'email', 'coach', 'school', ...columns.map((c) => c.label)];
  const lines = [header.map(escapeCsv).join(',')];

  for (const r of rows as any[]) {
    const name =
      typeParam === 'competitor'
        ? `${r.competitors?.first_name ?? ''} ${r.competitors?.last_name ?? ''}`.trim()
        : r.profiles?.full_name ?? '';
    const email =
      typeParam === 'competitor'
        ? r.competitors?.email_personal ?? r.competitors?.email_school ?? ''
        : r.profiles?.email ?? '';
    const competitorCoach = r.competitors?.coach ?? null;
    const coach = typeParam === 'competitor' ? competitorCoach?.full_name ?? '' : '';
    const school =
      typeParam === 'competitor'
        ? competitorCoach?.school_name ?? ''
        : r.profiles?.school_name ?? '';

    const base = [r.submitted_at ?? '', name, email, coach, school];
    const answers = rowValuesByColumn(r.results_jsonb, columns);
    lines.push([...base, ...answers].map(escapeCsv).join(','));
  }

  const filename = `survey-${typeParam}-responses-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
