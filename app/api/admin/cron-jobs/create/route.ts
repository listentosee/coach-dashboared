import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createRouteHandlerClient({ cookies: () => cookieStore });

    // Check authentication
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const isAdmin = await isUserAdmin(authClient, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use service role client for cron schema access
    const supabase = getServiceRoleSupabaseClient();

    const body = await request.json();
    const { jobName, schedule, taskType, payload, maxAttempts } = body;

    // Validate required fields
    if (!jobName || !schedule || !taskType) {
      return NextResponse.json(
        { error: 'Missing required fields: jobName, schedule, taskType' },
        { status: 400 }
      );
    }

    // Validate cron expression (basic check for 5 fields)
    const cronParts = schedule.trim().split(/\s+/);
    if (cronParts.length !== 5) {
      return NextResponse.json(
        { error: 'Invalid cron expression. Must have 5 fields: minute hour day month weekday' },
        { status: 400 }
      );
    }

    // Call the create_cron_job function
    const { data, error } = await supabase.rpc('create_cron_job', {
      job_name: jobName,
      job_schedule: schedule,
      task_type: taskType,
      task_payload: payload || {},
      max_attempts: maxAttempts || 3,
    });

    if (error) {
      console.error('Error creating cron job:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create cron job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: data,
      message: 'Cron job created successfully'
    });
  } catch (error) {
    console.error('Error in create cron job API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
