import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

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
    // Get the shared secret for authenticating with the worker endpoint
    const sharedSecret = process.env.JOB_RUNNER_SECRET || process.env.CRON_SECRET;
    if (!sharedSecret) {
      throw new Error('JOB_RUNNER_SECRET or CRON_SECRET not configured');
    }

    // Call the worker endpoint with authentication
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const workerUrl = `${baseUrl}/api/jobs/run`;

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-job-runner-secret': sharedSecret,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Worker returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: result.message || 'Worker executed successfully',
      processedCount: result.processedCount || 0,
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
