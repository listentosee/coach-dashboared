import type { JobHandler, JobPayloadMap } from '../types';

function getInternalBaseUrl() {
  const explicit =
    process.env.INTERNAL_JOBS_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL;

  const normalized = explicit
    ? explicit.startsWith('http')
      ? explicit
      : `https://${explicit}`
    : 'http://localhost:3000';

  return normalized.replace(/\/+$/, '');
}

export const handleSmsDigestProcessor: JobHandler<'sms_digest_processor'> = async (job, { logger }) => {
  const payload: JobPayloadMap['sms_digest_processor'] = job.payload ?? {};
  const log = logger ?? console;

  try {
    const internalSecret = process.env.INTERNAL_AUTOMATION_SECRET || process.env.INTERNAL_SYNC_SECRET;
    if (!internalSecret) {
      throw new Error('Missing INTERNAL_AUTOMATION_SECRET (or INTERNAL_SYNC_SECRET) environment variable');
    }

    const baseUrl = getInternalBaseUrl();
    const url = `${baseUrl}/api/internal/notifications/unread`;

    log.info('[notifications] calling internal route', {
      url,
      dryRun: payload.dryRun ?? false,
      coachId: payload.coachId ?? null,
      force: payload.force ?? false,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-automation-secret': internalSecret,
      },
      body: JSON.stringify({
        dryRun: payload.dryRun ?? false,
        coachId: payload.coachId ?? null,
        windowMinutes: payload.windowMinutes ?? undefined,
        force: payload.force ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Internal notification route failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    log.info('[notifications] completed', result);

    return {
      status: 'succeeded',
      output: result,
    };
  } catch (error) {
    log.error('[notifications] job failed', error);

    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error processing notifications',
    };
  }
};
