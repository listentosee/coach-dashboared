import type { JobHandler, JobPayloadMap } from '../types';
import { getInternalBaseUrl } from './smsDigestProcessor';

export const handleAdminAlertDispatch: JobHandler<'admin_alert_dispatch'> = async (job, { logger }) => {
  const payload: JobPayloadMap['admin_alert_dispatch'] = job.payload ?? {};
  const log = logger ?? console;

  try {
    const internalSecret = process.env.INTERNAL_AUTOMATION_SECRET || process.env.INTERNAL_SYNC_SECRET;
    if (!internalSecret) {
      throw new Error('Missing INTERNAL_AUTOMATION_SECRET (or INTERNAL_SYNC_SECRET) environment variable');
    }

    const baseUrl = getInternalBaseUrl();
    const url = `${baseUrl}/api/internal/notifications/unread`;

    const roles = payload.roles && payload.roles.length > 0 ? payload.roles : ['admin'];
    const allowSms = payload.allowSms ?? false;
    const force = payload.force ?? true;
    const windowMinutes = payload.windowMinutes ?? 10;

    log.info('[notifications/admin] calling internal route', {
      url,
      dryRun: payload.dryRun ?? false,
      roles,
      allowSms,
      force,
      windowMinutes,
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
        windowMinutes,
        force,
        roles,
        allowSms,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Internal notification route failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    log.info('[notifications/admin] completed', result);

    return {
      status: 'succeeded',
      output: result,
    };
  } catch (error) {
    log.error('[notifications/admin] job failed', error);
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error processing admin alerts',
    };
  }
};
