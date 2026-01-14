import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { runJobs } from '@/lib/jobs/runner';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

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

  const startedAt = new Date();
  let workerRunId: string | null = null;

  try {
    let service;
    try {
      service = getServiceRoleSupabaseClient();
    } catch (error) {
      console.error('[run-worker] service role client unavailable', error);
      return NextResponse.json({ error: 'Worker unavailable' }, { status: 500 });
    }

    // Best-effort: record this invocation for diagnostics.
    try {
      const { data } = await service
        .from('job_worker_runs')
        .insert({
          source: 'admin_manual',
          started_at: startedAt.toISOString(),
          http_method: 'POST',
          user_agent: 'admin-tools/run-worker',
        })
        .select('id')
        .single();

      workerRunId = data?.id ?? null;
    } catch {
      workerRunId = null;
    }

    // Call the worker function directly
    const result = await runJobs({ limit: 5, force: false });

    if (workerRunId) {
      try {
        await service
          .from('job_worker_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: result.status,
            processed: result.processed,
            succeeded: result.succeeded ?? null,
            failed: result.failed ?? null,
            message: result.message ?? null,
            results: result.results ?? null,
          })
          .eq('id', workerRunId);
      } catch {
        // Best-effort only.
      }
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'Worker executed successfully',
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (error) {
    console.error('[run-worker] Failed to execute worker:', error);

    if (workerRunId) {
      try {
        await service
          .from('job_worker_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: 'error',
            processed: 0,
            succeeded: null,
            failed: null,
            error_message: error instanceof Error ? error.message : String(error),
          })
          .eq('id', workerRunId);
      } catch {
        // Best-effort only.
      }
    }

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
