import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { JobPlaybookDialog } from '@/components/dashboard/admin/job-playbook-dialog';
import { JobProcessingToggle } from '@/components/dashboard/admin/job-processing-toggle';
import { JobHealthDialog } from '@/components/dashboard/admin/job-health-dialog';
import { QuickSyncActions } from '@/components/dashboard/admin/quick-sync-actions';
import { RunWorkerButton } from '@/components/dashboard/admin/run-worker-button';
import { RefreshQueueButton } from '@/components/dashboard/admin/refresh-queue-button';
import { CreateJobDialog } from '@/components/dashboard/admin/create-job-dialog';
import { JobQueueTable, type JobQueueRow } from '@/components/dashboard/admin/job-queue-table';

interface SearchParams {
  status?: string;
}

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
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

  const serviceSupabase = getServiceRoleSupabaseClient();

  const statusValues = Object.keys(STATUS_LABELS);
  const requestedStatus = searchParams?.status;
  const statusFilter = requestedStatus && statusValues.includes(requestedStatus)
    ? requestedStatus
    : 'all';

  const { data: jobs } = await serviceSupabase
    .from('job_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  const { count: totalJobs } = await serviceSupabase.from('job_queue').select('id', { count: 'exact', head: true });
  const { data: settings } = await serviceSupabase
    .from('job_queue_settings')
    .select('processing_enabled, paused_reason, updated_at')
    .eq('id', 1)
    .single();
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

      {/* Processing Toggle - Right above status boxes */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <JobProcessingToggle
            enabled={settings?.processing_enabled ?? true}
            pausedReason={settings?.paused_reason ?? undefined}
          />
          <RunWorkerButton />
          <CreateJobDialog />
          <RefreshQueueButton />
        </div>
        <p className="text-xs text-muted-foreground flex-shrink-0">Total jobs: {totalJobs ?? 0}</p>
      </div>

      <JobQueueTable
        jobs={(jobs as JobQueueRow[] | null) ?? []}
        initialStatus={statusFilter}
      />

    </div>
  );
}
