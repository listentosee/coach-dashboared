import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { z } from 'zod';

const UpdateScheduleSchema = z.object({
  jobName: z.string(),
  schedule: z.string(), // Cron expression like '0 * * * *'
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

    // Use service role client for cron schema access
    const supabase = getServiceRoleSupabaseClient();

    const body = await request.json();
    const { jobName, schedule } = UpdateScheduleSchema.parse(body);

    // Update cron job schedule
    const { error } = await supabase
      .rpc('update_cron_schedule', {
        job_name: jobName,
        new_schedule: schedule
      });

    if (error) {
      console.error('Error updating cron schedule:', error);
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }

    console.error('Error in cron schedule API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
