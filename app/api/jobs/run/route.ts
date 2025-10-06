import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { runJobs } from '@/lib/jobs/runner';

interface RunRequestBody {
  limit?: number;
  force?: boolean;
}

async function handleRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  // Only accept Vercel cron authorization
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron) {
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
