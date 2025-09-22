import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { JobPlaybookDialog } from '@/components/dashboard/admin/job-playbook-dialog';
import { JobProcessingToggle } from '@/components/dashboard/admin/job-processing-toggle';
import { JobHealthDialog } from '@/components/dashboard/admin/job-health-dialog';

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

function loadPlaybook(): string {
  return fs.readFileSync(path.join(process.cwd(), 'docs', 'job-queue-playbook.md'), 'utf8');
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
  const playbookContent = loadPlaybook();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Job Queue</h1>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-gray-600">
            Monitor background sync jobs and run manual actions when needed.
          </p>
          <div className="flex items-center gap-3">
            <JobPlaybookDialog content={playbookContent} totalJobs={totalJobs ?? 0} />
            <JobHealthDialog />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <JobProcessingToggle
          enabled={settings?.processing_enabled ?? true}
          pausedReason={settings?.paused_reason ?? undefined}
        />
        {!settings?.processing_enabled && settings?.paused_reason && (
          <p className="mt-2 text-sm text-red-500">
            Currently paused: {settings.paused_reason}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">Total recorded jobs: {totalJobs ?? 0}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-8">
        {counts.map(({ status, count }) => (
          <div key={status} className={`border rounded p-4 ${statusFilter === status ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
            <form method="get" action="/dashboard/admin-tools/jobs">
              <input type="hidden" name="status" value={status} />
              <button type="submit" className="w-full text-left">
                <div className="text-sm text-gray-500">{STATUS_LABELS[status]}</div>
                <div className="text-2xl font-semibold text-gray-900">{count}</div>
              </button>
            </form>
          </div>
        ))}
      </div>

      <div className="bg-white border rounded">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempts</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Run</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Error</th>
              <th scope="col" className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-sm">
            {jobs?.map((job) => (
              <tr key={job.id} className="align-top">
                <td className="px-4 py-3 font-mono text-xs text-gray-600 break-all">{job.id}</td>
                <td className="px-4 py-3 text-gray-900">{job.task_type}</td>
                <td className="px-4 py-3 text-gray-900">{STATUS_LABELS[job.status] ?? job.status}</td>
                <td className="px-4 py-3 text-gray-900">{job.attempts} / {job.max_attempts}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(job.run_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-pre-wrap">{job.last_error ?? '—'}</td>
                <td className="px-4 py-3 space-y-2">
                  <form method="post" action="/api/admin/job-queue/actions">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="action" value="retry" />
                    <button className="w-full rounded border px-3 py-1 text-sm text-blue-600 border-blue-600 hover:bg-blue-50" type="submit">
                      Retry now
                    </button>
                  </form>
                  <form method="post" action="/api/admin/job-queue/actions">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="action" value="cancel" />
                    <button className="w-full rounded border px-3 py-1 text-sm text-red-600 border-red-600 hover:bg-red-50" type="submit">
                      Cancel
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!jobs || jobs.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No jobs found for the selected filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
