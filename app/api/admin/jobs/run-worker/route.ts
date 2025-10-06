import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { runJobs } from '@/lib/jobs/runner';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  // Check authentication and admin role
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    // Call the worker function directly
    const result = await runJobs({ limit: 5, force: false });

    return NextResponse.json({
      success: true,
      message: result.message || 'Worker executed successfully',
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (error) {
    console.error('[run-worker] Failed to execute worker:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to run worker',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
