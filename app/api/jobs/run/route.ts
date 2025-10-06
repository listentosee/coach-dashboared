import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getJobHandler } from '@/lib/jobs/handlers';
import { claimJobs, markJobFailed, markJobSucceeded } from '@/lib/jobs/queue';
import type { JobRecord, JobResult } from '@/lib/jobs/types';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

interface RunRequestBody {
  limit?: number;
  force?: boolean;
}

function getSharedSecret(): string {
  const secret = process.env.JOB_QUEUE_RUNNER_SECRET;
  if (!secret) {
    throw new Error('JOB_QUEUE_RUNNER_SECRET is not configured');
  }
  return secret;
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

export async function POST(req: NextRequest) {
  try {
    const sharedSecret = getSharedSecret();
    const headerSecret = req.headers.get('x-job-runner-secret') ?? req.headers.get('x-job-runner-key');
    const authHeader = req.headers.get('authorization');

    // Accept either custom secret header or Vercel cron authorization
    const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const hasValidSecret = headerSecret && headerSecret === sharedSecret;

    if (!isVercelCron && !hasValidSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RunRequestBody;
    const limit = body.limit && body.limit > 0 ? Math.min(body.limit, 10) : 5;
    const force = body.force === true;

    const supabase = getServiceRoleSupabaseClient();
    const { data: settings } = await supabase
      .from('job_queue_settings')
      .select('processing_enabled, paused_reason')
      .eq('id', 1)
      .maybeSingle();

    // Check processing enabled unless force flag is set
    if (!force && settings && settings.processing_enabled === false) {
      return NextResponse.json({
        status: 'paused',
        processed: 0,
        message: settings.paused_reason ?? 'Job processing is paused by an administrator.',
      });
    }

    const jobs = await claimJobs({ limit, client: supabase });

    if (jobs.length === 0) {
      return NextResponse.json({ status: 'ok', processed: 0, message: 'no jobs available' });
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

    return NextResponse.json({
      status: 'ok',
      processed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    console.error('[job-runner] internal error', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown job runner error' },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
