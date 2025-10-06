import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { runJobs } from '@/lib/jobs/runner';

interface RunRequestBody {
  limit?: number;
  force?: boolean;
}

async function handleRequest(req: NextRequest) {
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

  const body = req.method === 'POST'
    ? (await req.json().catch(() => ({}))) as RunRequestBody
    : {};

  const result = await runJobs({
    limit: body.limit,
    force: body.force,
  });

  return NextResponse.json(result);
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
