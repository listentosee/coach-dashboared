import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { runJobs } from '@/lib/jobs/runner';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

interface RunRequestBody {
  limit?: number;
  force?: boolean;
}

type WorkerRunSource = 'vercel_cron_secret' | 'vercel_cron_user_agent' | 'unknown';

async function tryCreateWorkerRun(params: {
  source: WorkerRunSource;
  startedAt: Date;
  method: string;
  userAgent: string | null;
}) {
  try {
    const supabase = getServiceRoleSupabaseClient();
    const { data } = await supabase
      .from('job_worker_runs')
      .insert({
        source: params.source,
        started_at: params.startedAt.toISOString(),
        http_method: params.method,
        user_agent: params.userAgent ? params.userAgent.slice(0, 500) : null,
      })
      .select('id')
      .single();

    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function tryFinalizeWorkerRun(runId: string | null, updates: Record<string, unknown>) {
  if (!runId) return;
  try {
    const supabase = getServiceRoleSupabaseClient();
    await supabase.from('job_worker_runs').update(updates).eq('id', runId);
  } catch {
    // Best-effort only.
  }
}

async function handleRequest(req: NextRequest) {
  const startedAt = new Date();
  const authHeader = req.headers.get('authorization');
  const userAgent = req.headers.get('user-agent');

  // Accept Vercel cron in two ways:
  // 1. CRON_SECRET if configured (recommended)
  // 2. vercel-cron user agent as fallback
  const hasValidCronSecret = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isVercelCronUserAgent = userAgent?.includes('vercel-cron/1.0');

  if (!hasValidCronSecret && !isVercelCronUserAgent) {
    console.error('[job-runner] Unauthorized request', {
      hasAuthHeader: !!authHeader,
      hasCronSecret: !!process.env.CRON_SECRET,
      userAgent,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const source: WorkerRunSource = hasValidCronSecret
    ? 'vercel_cron_secret'
    : (isVercelCronUserAgent ? 'vercel_cron_user_agent' : 'unknown');

  const workerRunId = await tryCreateWorkerRun({
    source,
    startedAt,
    method: req.method,
    userAgent,
  });

  const body = req.method === 'POST'
    ? (await req.json().catch(() => ({}))) as RunRequestBody
    : {};

  try {
    const result = await runJobs({
      limit: body.limit,
      force: body.force,
    });

    await tryFinalizeWorkerRun(workerRunId, {
      completed_at: new Date().toISOString(),
      status: result.status,
      processed: result.processed,
      succeeded: result.succeeded ?? null,
      failed: result.failed ?? null,
      message: result.message ?? null,
      results: result.results ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    await tryFinalizeWorkerRun(workerRunId, {
      completed_at: new Date().toISOString(),
      status: 'error',
      processed: 0,
      succeeded: null,
      failed: null,
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error('[job-runner] internal error', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown job runner error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleRequest(req);
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
