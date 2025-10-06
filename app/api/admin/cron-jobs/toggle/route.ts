import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { z } from 'zod';

const ToggleSchema = z.object({
  jobName: z.string(),
  active: z.boolean(),
});

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { jobName, active } = ToggleSchema.parse(body);

    // Use service role client - it has elevated permissions
    const supabase = getServiceRoleSupabaseClient();

    // The service role should be able to directly update cron.job via PostgREST
    // The cron schema needs to be exposed in the API settings
    const { data, error } = await supabase
      .schema('cron')
      .from('job')
      .update({ active })
      .eq('jobname', jobName)
      .select();

    if (error) {
      console.error('Error toggling cron job:', error);
      return NextResponse.json({
        error: 'Failed to toggle cron job',
        details: error.message,
        hint: 'The cron schema may not be exposed in Supabase API settings'
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }

    console.error('Error in cron toggle API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
