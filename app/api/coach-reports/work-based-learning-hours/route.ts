import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { loadWblReport } from '@/lib/reports/work-based-learning-hours';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const period = request.nextUrl.searchParams.get('period');
    const division = request.nextUrl.searchParams.get('division') ?? 'all';

    const isAdminUser = await isUserAdmin(supabase, user.id);
    const actingCoach = cookieStore.get('admin_coach_id')?.value || null;
    const coachContextId = isAdminUser ? actingCoach : user.id;

    const statsClient = getServiceRoleSupabaseClient() ?? supabase;

    const report = await loadWblReport({
      userClient: supabase,
      statsClient,
      coachContextId,
      periodSlug: period,
      division,
    });

    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('WBL report failed', err);
    return NextResponse.json({ error: 'Failed to load report' }, { status: 500 });
  }
}
