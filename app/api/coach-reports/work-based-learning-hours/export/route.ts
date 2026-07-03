import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { loadWblReport } from '@/lib/reports/work-based-learning-hours';
import { buildWblWorkbook } from '@/lib/reports/wbl-workbook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function contentDisposition(filename: string) {
  const safe = filename.replace(/["\r\n]/g, '').trim() || 'report.xlsx';
  const ascii = safe.replace(/[^\x20-\x7E]+/g, '') || 'report.xlsx';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

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
      userClient: supabase, statsClient, coachContextId, periodSlug: period, division,
    });

    const buffer = await buildWblWorkbook(report);
    const coachSlug = (report.coach?.name ?? 'coach').replace(/[^a-zA-Z0-9]+/g, '_');
    const filename = `Work_Based_Learning_Hours_${coachSlug}_${report.period.slug}.xlsx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('WBL export failed', err);
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
  }
}
