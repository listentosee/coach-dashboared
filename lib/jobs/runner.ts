import * as Sentry from '@sentry/nextjs';
import { getJobHandler } from '@/lib/jobs/handlers';
import { claimJobs, markJobFailed, markJobSucceeded } from '@/lib/jobs/queue';
import type { JobRecord, JobResult } from '@/lib/jobs/types';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

interface RunJobsOptions {
  limit?: number;
  force?: boolean;
}

interface RunJobsResult {
  status: 'ok' | 'paused';
  processed: number;
  succeeded?: number;
  failed?: number;
  message?: string;
  results?: Array<{
    id: string;
    status: string;
    attempts: number;
    lastError: string | null;
  }>;
}

async function processJob(job: JobRecord) {
  const supabase = getServiceRoleSupabaseClient();
  const handler = getJobHandler(job.taskType);

  try {
    const result = (await handler(job, { supabase, logger: console })) as JobResult | void;
    if (result && result.status === 'failed') {
      console.warn('[job-runner] handler reported failure', {
        jobId: job.id,
        taskType: job.taskType,
        error: result.error,
        retryInMs: result.retryInMs,
      });
      if (result.retryInMs === undefined) {
        Sentry.captureMessage('Job permanently failed', {
          level: 'error',
          tags: { jobId: job.id, taskType: job.taskType },
          extra: { error: result.error, attempts: job.attempts, maxAttempts: job.maxAttempts },
        });
      }
      return await markJobFailed({
        jobId: job.id,
        error: result.error,
        retryInMs: result.retryInMs,
        client: supabase,
      });
    }

    return await markJobSucceeded({
      jobId: job.id,
      output: result?.output,
      client: supabase,
    });
  } catch (error) {
    console.error('[job-runner] job failed unexpectedly', {
      jobId: job.id,
      error,
    });
    Sentry.captureException(error, {
      tags: { jobId: job.id, taskType: job.taskType },
      extra: { attempts: job.attempts, maxAttempts: job.maxAttempts },
    });

    return await markJobFailed({
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
      retryInMs: undefined,
      client: supabase,
    });
  }
}

async function checkRecurringJobs(supabase: ReturnType<typeof getServiceRoleSupabaseClient>) {
  // Get recurring jobs that need to be enqueued
  const { data: recurringJobs, error } = await supabase.rpc('get_recurring_jobs_to_enqueue');

  if (error) {
    console.error('[recurring-jobs] Failed to get recurring jobs:', error);
    return;
  }

  if (!recurringJobs || recurringJobs.length === 0) {
    return;
  }

  console.log(`[recurring-jobs] Found ${recurringJobs.length} recurring jobs to enqueue`);

  for (const rj of recurringJobs) {
    try {
      // Enqueue the job
      const { data: job, error: enqueueError } = await supabase.rpc('job_queue_enqueue', {
        p_task_type: rj.task_type,
        p_payload: rj.payload,
        p_run_at: new Date().toISOString(),
      });

      if (enqueueError) {
        console.error(`[recurring-jobs] Failed to enqueue ${rj.name}:`, enqueueError);
        continue;
      }

      // Mark as enqueued
      await supabase.rpc('mark_recurring_job_enqueued', { job_id: rj.id });

      console.log(`[recurring-jobs] Enqueued ${rj.name} (${rj.task_type}) - next run in ${rj.schedule_interval_minutes} minutes`);
    } catch (error) {
      console.error(`[recurring-jobs] Error processing ${rj.name}:`, error);
    }
  }
}

export async function runJobs(options: RunJobsOptions = {}): Promise<RunJobsResult> {
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 10) : 5;
  const force = options.force === true;

  const supabase = getServiceRoleSupabaseClient();

  // Check for recurring jobs that need to be scheduled
  await checkRecurringJobs(supabase);

  const { data: settings } = await supabase
    .from('job_queue_settings')
    .select('processing_enabled, paused_reason')
    .eq('id', 1)
    .maybeSingle();

  // Check processing enabled unless force flag is set
  if (!force && settings && settings.processing_enabled === false) {
    return {
      status: 'paused',
      processed: 0,
      message: settings.paused_reason ?? 'Job processing is paused by an administrator.',
    };
  }

  const jobs = await claimJobs({ limit, client: supabase });

  if (jobs.length === 0) {
    return { status: 'ok', processed: 0, message: 'no jobs available' };
  }

  const results = [] as Array<{ id: string; status: string; attempts: number; lastError: string | null }>;
  for (const job of jobs) {
    const updatedJob = await processJob(job);
    results.push({
      id: updatedJob.id,
      status: updatedJob.status,
      attempts: updatedJob.attempts,
      lastError: updatedJob.last_error ?? null,
    });
  }

  const succeeded = results.filter((r) => r.status === 'succeeded').length;
  const failed = results.length - succeeded;

  return {
    status: 'ok',
    processed: results.length,
    succeeded,
    failed,
    results,
  };
}
