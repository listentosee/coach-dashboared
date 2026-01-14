import { NextResponse } from 'next/server';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin';
}

export async function GET() {
  const authorized = await requireAdmin();
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceRoleSupabaseClient();
  const now = new Date();
  const expectedWorkerEveryMinutes = 5;
  const workerStaleAfterMinutes = 15;
  const runningStuckAfterMinutes = 20;
  const overduePendingAfterMinutes = 15;

  function computeNextRun(job: {
    is_recurring: boolean;
    recurrence_interval_minutes: number | null;
    run_at: string;
    last_run_at: string | null;
  }): Date | null {
    if (job.is_recurring && job.recurrence_interval_minutes) {
      if (!job.last_run_at) return job.run_at ? new Date(job.run_at) : null;
      const base = new Date(job.last_run_at);
      return new Date(base.getTime() + job.recurrence_interval_minutes * 60 * 1000);
    }
    return job.run_at ? new Date(job.run_at) : null;
  }

  // Get job queue counts (best-effort; keep it simple + fast)
  const statuses = ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const;
  const queueCounts: Array<{ status: string; count: number }> = [];
  let queueCountsError: string | null = null;
  try {
    const counts = await Promise.all(
      statuses.map(async (status) => {
        const { count, error } = await supabase
          .from('job_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);
        if (error) throw error;
        return { status, count: count ?? 0 };
      })
    );
    queueCounts.push(...counts);
  } catch (error) {
    queueCountsError = error instanceof Error ? error.message : String(error);
  }

  // Get recent jobs (last 15)
  const { data: recentJobs, error: jobsError } = await supabase
    .from('job_queue')
    .select('id, task_type, status, created_at, updated_at, run_at, last_run_at, is_recurring, recurrence_interval_minutes, attempts, max_attempts, completed_at, last_error')
    .order('created_at', { ascending: false })
    .limit(15);

  // Detect stuck jobs
  const { data: runningJobs } = await supabase
    .from('job_queue')
    .select('id, task_type, status, created_at, updated_at, run_at, attempts, max_attempts, last_error')
    .eq('status', 'running')
    .order('updated_at', { ascending: true })
    .limit(50);

  const { data: pendingJobs } = await supabase
    .from('job_queue')
    .select('id, task_type, status, created_at, updated_at, run_at, last_run_at, is_recurring, recurrence_interval_minutes, attempts, max_attempts, last_error')
    .eq('status', 'pending')
    .order('run_at', { ascending: true })
    .limit(250);

  const stuckRunning = (runningJobs ?? [])
    .map((job) => {
      const updatedAt = new Date(job.updated_at);
      const ageMinutes = Math.floor((now.getTime() - updatedAt.getTime()) / 60000);
      return { ...job, ageMinutes };
    })
    .filter((job) => job.ageMinutes >= runningStuckAfterMinutes);

  const overduePending = (pendingJobs ?? [])
    .map((job) => {
      const nextRun = computeNextRun(job);
      const overdueMinutes = nextRun ? Math.floor((now.getTime() - nextRun.getTime()) / 60000) : null;
      return { ...job, nextRunAt: nextRun ? nextRun.toISOString() : null, overdueMinutes };
    })
    .filter((job) => job.overdueMinutes !== null && job.overdueMinutes >= overduePendingAfterMinutes)
    .slice(0, 25);

  // Check processing settings
  const { data: settings } = await supabase
    .from('job_queue_settings')
    .select('processing_enabled, paused_reason, updated_at')
    .eq('id', 1)
    .single();

  // Worker run history (best-effort; table may not exist yet)
  let workerRuns: any[] = [];
  let workerRunsError: string | null = null;
  try {
    const { data } = await supabase
      .from('job_worker_runs')
      .select('id, started_at, completed_at, source, status, processed, succeeded, failed, message, error_message, results')
      .order('started_at', { ascending: false })
      .limit(20);
    workerRuns = data ?? [];
  } catch (error) {
    workerRunsError = error instanceof Error ? error.message : String(error);
    workerRuns = [];
  }

  const lastWorkerRun = workerRuns[0] ?? null;
  const lastWorkerRunAt = lastWorkerRun?.started_at ?? null;
  const workerStale =
    lastWorkerRunAt
      ? (now.getTime() - new Date(lastWorkerRunAt).getTime()) > workerStaleAfterMinutes * 60 * 1000
      : true;

  // Game Platform sync run status (best-effort)
  let gamePlatformSyncRun: any | null = null;
  try {
    const { data } = await supabase
      .from('game_platform_sync_runs')
      .select('started_at, completed_at, status, competitors_synced, competitors_failed, error_message')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    gamePlatformSyncRun = data ?? null;
  } catch {
    gamePlatformSyncRun = null;
  }

  return NextResponse.json({
    queueCounts,
    recentJobs: recentJobs || [],
    vercelCron: {
      configured: !!process.env.CRON_SECRET,
      schedule: '*/5 * * * *', // Every 5 minutes
      endpoint: '/api/jobs/run',
      expectedWorkerEveryMinutes,
      lastWorkerRunAt,
      workerStale,
    },
    worker: {
      processingEnabled: settings?.processing_enabled ?? true,
      pausedReason: settings?.paused_reason,
      stuck: {
        running: stuckRunning,
        overdue: overduePending,
      },
    },
    workerRuns,
    gamePlatformSyncRun,
    error: queueCountsError || jobsError || workerRunsError ? 'Partial data loaded' : null,
  });
}
