import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { JobPlaybookDialog } from '@/components/dashboard/admin/job-playbook-dialog';
import { JobProcessingToggle } from '@/components/dashboard/admin/job-processing-toggle';
import { JobHealthDialog } from '@/components/dashboard/admin/job-health-dialog';
import { QuickSyncActions } from '@/components/dashboard/admin/quick-sync-actions';
import { RunWorkerButton } from '@/components/dashboard/admin/run-worker-button';
import { RefreshQueueButton } from '@/components/dashboard/admin/refresh-queue-button';
import { RecurringJobsManager } from '@/components/dashboard/admin/recurring-jobs-manager';

interface SearchParams {
  status?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const dynamic = 'force-dynamic';

function loadQuickStart(): string {
  return fs.readFileSync(path.join(process.cwd(), 'docs', 'cron-jobs', 'ADMIN-QUICK-START.md'), 'utf8');
}

export default async function JobQueuePage({ searchParams }: { searchParams?: SearchParams }) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  const statusFilter = searchParams?.status ?? 'pending';
  const statusValues = Object.keys(STATUS_LABELS);

  const counts = await Promise.all(statusValues.map(async (status) => {
    const { count } = await supabase
      .from('job_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    return { status, count: count ?? 0 };
  }));

  let jobsQuery = supabase
    .from('job_queue')
    .select('*')
    .order('run_at', { ascending: true })
    .limit(50);

  if (statusFilter && statusValues.includes(statusFilter)) {
    jobsQuery = jobsQuery.eq('status', statusFilter);
  }

  const { data: jobs } = await jobsQuery;
  const { count: totalJobs } = await supabase.from('job_queue').select('id', { count: 'exact', head: true });
  const { data: settings } = await supabase
    .from('job_queue_settings')
    .select('processing_enabled, paused_reason, updated_at')
    .eq('id', 1)
    .single();
  const { data: recurringJobs } = await supabase
    .from('recurring_jobs')
    .select('*')
    .order('name');
  const quickStartContent = loadQuickStart();

  return (
    <div className="container mx-auto py-4 px-4">
      {/* Compressed Header */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Job Queue</h1>
          <p className="text-sm text-muted-foreground">
            Monitor background sync jobs and run manual actions when needed.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <JobPlaybookDialog content={quickStartContent} totalJobs={totalJobs ?? 0} variant="default" />
          <JobHealthDialog variant="default" />
        </div>
      </div>

      {/* Quick Sync Actions */}
      <QuickSyncActions className="mb-4" />

      {/* Recurring Jobs Schedule */}
      {recurringJobs && recurringJobs.length > 0 && (
        <RecurringJobsManager jobs={recurringJobs} />
      )}
      <div className="mb-4" />

      {/* Processing Toggle - Right above status boxes */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <JobProcessingToggle
            enabled={settings?.processing_enabled ?? true}
            pausedReason={settings?.paused_reason ?? undefined}
          />
          <RunWorkerButton />
          <RefreshQueueButton />
        </div>
        <p className="text-xs text-muted-foreground flex-shrink-0">Total jobs: {totalJobs ?? 0}</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4">
        {counts.map(({ status, count }) => (
          <div key={status} className={`border rounded p-3 ${statusFilter === status ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
            <form method="get" action="/dashboard/admin-tools/jobs">
              <input type="hidden" name="status" value={status} />
              <button type="submit" className="w-full text-left">
                <div className="text-xs text-gray-500">{STATUS_LABELS[status]}</div>
                <div className="text-xl font-semibold text-gray-900">{count}</div>
              </button>
            </form>
          </div>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="bg-white border rounded">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempts</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled Run</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Error</th>
              <th scope="col" className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-sm">
            {jobs?.map((job) => {
              const now = new Date();
              const createdAt = new Date(job.created_at);
              const runAt = new Date(job.run_at);
              const isPastDue = runAt < now && job.status === 'pending';
              const ageMinutes = Math.floor((now.getTime() - createdAt.getTime()) / 1000 / 60);

              return (
              <tr key={job.id} className={`align-top ${isPastDue ? 'bg-red-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs text-gray-600 break-all">{job.id.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-gray-900">{job.task_type}</td>
                <td className="px-4 py-3">
                  <span className={isPastDue ? 'text-red-600 font-semibold' : 'text-gray-900'}>
                    {STATUS_LABELS[job.status] ?? job.status}
                    {isPastDue && ' ⚠️'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-900">{job.attempts} / {job.max_attempts}</td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{createdAt.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{ageMinutes}m ago</div>
                </td>
                <td className="px-4 py-3">
                  <div className={isPastDue ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                    {runAt.toLocaleString()}
                  </div>
                  {isPastDue && (
                    <div className="text-xs text-red-500">
                      {Math.floor((now.getTime() - runAt.getTime()) / 1000 / 60)}m overdue
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-pre-wrap max-w-xs truncate" title={job.last_error ?? ''}>{job.last_error ?? '—'}</td>
                <td className="px-4 py-3 space-y-2">
                  <form method="post" action="/api/admin/job-queue/actions">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="action" value="retry" />
                    <button className="w-full rounded px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors" type="submit">
                      Retry now
                    </button>
                  </form>
                  <form method="post" action="/api/admin/job-queue/actions">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="action" value="cancel" />
                    <button className="w-full rounded px-3 py-1 text-sm bg-red-600 text-white hover:bg-red-700 transition-colors" type="submit">
                      Cancel
                    </button>
                  </form>
                </td>
              </tr>
            );
            })}
            {(!jobs || jobs.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No jobs found for the selected filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
