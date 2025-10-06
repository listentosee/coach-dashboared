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

  // Get job queue counts
  const { data: queueCounts, error: queueError } = await supabase
    .from('job_queue')
    .select('status')
    .then(async (result) => {
      if (result.error) return { data: null, error: result.error };
      const counts = result.data?.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return {
        data: Object.entries(counts || {}).map(([status, count]) => ({ status, count })),
        error: null,
      };
    });

  // Get recent job runs (last 10)
  const { data: recentJobs, error: jobsError } = await supabase
    .from('job_queue')
    .select('id, task_type, status, created_at, completed_at, last_error')
    .order('created_at', { ascending: false })
    .limit(10);

  // Check Vercel cron status by looking at job_queue_settings
  const { data: settings } = await supabase
    .from('job_queue_settings')
    .select('processing_enabled, paused_reason, updated_at')
    .eq('id', 1)
    .single();

  // Get oldest pending job to detect if worker is running
  const { data: oldestPending } = await supabase
    .from('job_queue')
    .select('run_at, created_at')
    .eq('status', 'pending')
    .order('run_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const workerHealthy = oldestPending
    ? new Date(oldestPending.run_at) > new Date(now.getTime() - 10 * 60 * 1000) // Within last 10 minutes
    : true;

  return NextResponse.json({
    queueCounts: queueCounts || [],
    recentJobs: recentJobs || [],
    vercelCron: {
      configured: true,
      schedule: '*/5 * * * *', // Every 5 minutes
      endpoint: '/api/jobs/run',
    },
    worker: {
      healthy: workerHealthy,
      processingEnabled: settings?.processing_enabled ?? true,
      pausedReason: settings?.paused_reason,
      oldestPendingAge: oldestPending
        ? Math.floor((now.getTime() - new Date(oldestPending.run_at).getTime()) / 1000 / 60)
        : null,
    },
    error: queueError || jobsError ? 'Partial data loaded' : null,
  });
}
