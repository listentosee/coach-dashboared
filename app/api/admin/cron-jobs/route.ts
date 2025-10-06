import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(authClient, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use service role client for cron schema access
    const supabase = getServiceRoleSupabaseClient();

    // Query cron jobs from cron schema
    const { data: cronJobs, error: cronError } = await supabase
      .rpc('get_cron_jobs');

    if (cronError) {
      console.error('Error fetching cron jobs:', cronError);
      return NextResponse.json({ error: 'Failed to fetch cron jobs' }, { status: 500 });
    }

    // Query recent execution history
    const { data: recentRuns, error: runsError } = await supabase
      .rpc('get_cron_job_runs', { limit_count: 50 });

    if (runsError) {
      console.error('Error fetching cron runs:', runsError);
    }

    return NextResponse.json({
      cronJobs: cronJobs || [],
      recentRuns: recentRuns || [],
    });
  } catch (error) {
    console.error('Error in cron jobs API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
