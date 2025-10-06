import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { enqueueJob } from '@/lib/jobs/queue';
import type { JobPayloadMap } from '@/lib/jobs/types';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  // Check authentication
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin status
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const payload: JobPayloadMap['game_platform_totals_sweep'] = {
      dryRun: body.dryRun ?? false,
      coachId: body.coachId ?? null,
      batchSize: body.batchSize ?? 100,
    };

    const job = await enqueueJob({
      taskType: 'game_platform_totals_sweep',
      payload,
      runAt: new Date(), // Run immediately
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Totals sweep job enqueued successfully',
    });
  } catch (error) {
    console.error('Failed to enqueue totals sweep job:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enqueue job' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
