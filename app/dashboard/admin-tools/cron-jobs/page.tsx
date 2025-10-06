import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { CronJobsTable } from '@/components/dashboard/admin/cron-jobs-table';
import { CronExecutionHistory } from '@/components/dashboard/admin/cron-execution-history';
import { CronScheduleTemplates } from '@/components/dashboard/admin/cron-schedule-templates';

export const dynamic = 'force-dynamic';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  database: string;
  username: string;
  active: boolean;
}

interface CronRun {
  runid: number;
  jobid: number;
  jobname: string;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
}

export default async function CronJobsPage() {
  const cookieStore = await cookies();
  const authClient = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await authClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  // Use service role client for cron schema access
  const supabase = getServiceRoleSupabaseClient();

  // Fetch cron jobs using RPC functions
  const { data: cronJobs, error: cronError } = await supabase
    .rpc('get_cron_jobs');

  const { data: recentRuns, error: runsError } = await supabase
    .rpc('get_cron_job_runs', { limit_count: 50 });

  if (cronError) {
    console.error('Error fetching cron jobs:', cronError);
  }

  if (runsError) {
    console.error('Error fetching cron runs:', runsError);
  }

  const jobs: CronJob[] = (cronJobs || []) as CronJob[];
  const runs: CronRun[] = (recentRuns || []) as CronRun[];

  // Calculate summary stats
  const activeCount = jobs.filter(j => j.active).length;
  const inactiveCount = jobs.filter(j => !j.active).length;
  const recentFailures = runs.filter(r => r.status === 'failed').length;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cron Jobs</h1>
            <p className="text-gray-600 mt-2">
              Manage recurring background tasks scheduled via Supabase pg_cron.
            </p>
          </div>
          <CronScheduleTemplates />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Total Jobs</div>
          <div className="text-2xl font-bold text-gray-900">{jobs.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-green-600">{activeCount}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Inactive</div>
          <div className="text-2xl font-bold text-gray-400">{inactiveCount}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Recent Failures</div>
          <div className="text-2xl font-bold text-red-600">{recentFailures}</div>
        </div>
      </div>

      {/* Cron Jobs Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scheduled Jobs</h2>
        <CronJobsTable jobs={jobs} />
      </div>

      {/* Execution History */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Execution History</h2>
        <CronExecutionHistory runs={runs} />
      </div>
    </div>
  );
}
