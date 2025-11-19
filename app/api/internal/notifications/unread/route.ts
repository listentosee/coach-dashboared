import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const INTERNAL_AUTOMATION_SECRET = process.env.INTERNAL_AUTOMATION_SECRET || process.env.INTERNAL_SYNC_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_FUNCTION_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;

function getHeaderSecret(request: NextRequest) {
  return (
    request.headers.get('x-internal-automation-secret') ||
    request.headers.get('x-internal-sync-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null
  );
}

function ensureSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration for unread notifications route');
  }
}

function getBaseSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL;

  if (explicit) {
    const normalized = explicit.startsWith('http') ? explicit : `https://${explicit}`;
    return normalized.replace(/\/+$/, '');
  }

  return 'http://localhost:3000';
}

function buildAlertMessage(firstName: string, count: number) {
  const safeName = firstName || 'Coach';
  const plural = count === 1 ? 'message' : 'messages';
  return `Hi ${safeName}, you have ${count} unread ${plural} in your Coach Dashboard. Please log in to read and reply.`;
}

async function sendEmailAlert({
  to,
  firstName,
  unreadCount,
  coachId,
  dashboardUrl,
  messagesCount,
  displayName,
}: {
  to: string;
  firstName: string;
  unreadCount: number;
  coachId: string;
  dashboardUrl: string;
  messagesCount?: number;
  displayName?: string;
}) {
  ensureSupabaseConfig();
  if (!SUPABASE_FUNCTION_BASE) {
    throw new Error('Supabase function base URL is not configured');
  }

  const response = await fetch(`${SUPABASE_FUNCTION_BASE}/send-email-alert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      templateData: {
        name: displayName || firstName || 'Coach',
        dashboard_url: dashboardUrl,
        messages: typeof messagesCount === 'number' ? messagesCount : unreadCount,
      },
      coachId,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = { error: 'Failed to parse SendGrid response body' };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function sendSmsAlert({
  phoneNumber,
  message,
  coachId,
}: {
  phoneNumber: string;
  message: string;
  coachId: string;
}) {
  ensureSupabaseConfig();
  if (!SUPABASE_FUNCTION_BASE) {
    throw new Error('Supabase function base URL is not configured');
  }

  const response = await fetch(`${SUPABASE_FUNCTION_BASE}/send-sms-notification`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumber,
      message,
      coachId,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = { error: 'Failed to parse SMS response body' };
  }

  return {
    ok: response.ok && !!payload?.success,
    status: response.status,
    payload,
  };
}

async function processNotifications({
  dryRun,
  coachId,
  windowMinutes,
  force,
}: {
  dryRun: boolean;
  coachId: string | null;
  windowMinutes: number;
  force: boolean;
}) {
  ensureSupabaseConfig();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: candidates, error } = await supabase.rpc('fetch_unread_alert_candidates', {
    p_window_minutes: windowMinutes,
    p_coach_id: coachId,
    p_force: force,
  });

  if (error) {
    throw new Error(`fetch_unread_alert_candidates failed: ${error.message}`);
  }

  const summary: any = {
    dryRun,
    force,
    candidates: candidates?.length ?? 0,
    alertsAttempted: 0,
    emailSent: 0,
    smsSent: 0,
    successes: 0,
    failures: 0,
    results: [] as Array<any>,
  };

  if (!candidates || candidates.length === 0) {
    return summary;
  }

  const dashboardUrl = `${getBaseSiteUrl()}/dashboard/messages`;

  for (const candidate of candidates) {
    const details: any = {
      coachId: candidate.coach_id,
      unreadCount: candidate.unread_count,
      emailAttempted: false,
      smsAttempted: false,
      emailSuccess: false,
      smsSuccess: false,
      errors: [] as string[],
    };

    summary.alertsAttempted += 1;

    if (dryRun) {
      summary.results.push({ ...details, status: 'dry-run' });
      continue;
    }

    const firstName = candidate.first_name || candidate.full_name?.split(' ')?.[0] || 'Coach';
    const alertEmail = candidate.email_alert_address || candidate.email;
    const message = buildAlertMessage(firstName, candidate.unread_count);
    const channelResults: Array<{ channel: 'email' | 'sms'; ok: boolean; error?: string }> = [];

    const wantsEmailAlerts = candidate.email_alerts_enabled !== false;

    if (wantsEmailAlerts && alertEmail) {
      details.emailAttempted = true;
      const emailResponse = await sendEmailAlert({
        to: alertEmail,
        firstName,
        unreadCount: candidate.unread_count,
        coachId: candidate.coach_id,
        dashboardUrl,
        messagesCount: candidate.unread_count,
        displayName: candidate.full_name,
      });
      if (emailResponse.ok) {
        summary.emailSent += 1;
        details.emailSuccess = true;
      } else {
        details.errors.push(
          `Email failed (${emailResponse.status}): ${
            emailResponse.payload?.error || emailResponse.payload?.details || 'Unknown error'
          }`,
        );
      }
      channelResults.push({
        channel: 'email',
        ok: emailResponse.ok,
        error: emailResponse.ok ? undefined : JSON.stringify(emailResponse.payload),
      });
    }

    if (candidate.sms_notifications_enabled && candidate.mobile_number) {
      details.smsAttempted = true;
      const smsResponse = await sendSmsAlert({
        phoneNumber: candidate.mobile_number,
        message,
        coachId: candidate.coach_id,
      });
      if (smsResponse.ok) {
        summary.smsSent += 1;
        details.smsSuccess = true;
      } else {
        details.errors.push(
          `SMS failed (${smsResponse.status}): ${
            smsResponse.payload?.error || smsResponse.payload?.details || 'Unknown error'
          }`,
        );
      }
      channelResults.push({
        channel: 'sms',
        ok: smsResponse.ok,
        error: smsResponse.ok ? undefined : JSON.stringify(smsResponse.payload),
      });
    }

    if (!candidate.email_alerts_enabled && !candidate.sms_notifications_enabled) {
      details.errors.push('Coach has all notifications disabled');
    }

    if (channelResults.length === 0) {
      details.errors.push('No eligible channels found for this coach');
    }

    for (const result of channelResults) {
      await supabase
        .from('alert_log')
        .insert({
          coach_id: candidate.coach_id,
          channel: result.channel,
          unread_count: candidate.unread_count,
          error_text: result.ok ? null : result.error || 'Unknown error',
        });
    }

    const succeeded = channelResults.some((r) => r.ok);
    if (succeeded) {
      await supabase.rpc('mark_unread_alert_sent', {
        p_coach_id: candidate.coach_id,
        p_unread_count: candidate.unread_count,
      });
      summary.successes += 1;
    } else {
      summary.failures += 1;
    }

    details.status = succeeded ? 'completed' : 'failed';
    summary.results.push(details);
  }

  return summary;
}

export async function POST(request: NextRequest) {
  const headerSecret = getHeaderSecret(request);
  if (!INTERNAL_AUTOMATION_SECRET || headerSecret !== INTERNAL_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = !!body.dryRun;
    const coachId = body.coachId ?? null;
    const windowMinutes = Number(body.windowMinutes ?? 1440) || 1440;
    const force = !!body.force;

    const summary = await processNotifications({ dryRun, coachId, windowMinutes, force });

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[internal/notifications/unread] failed', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const headerSecret = getHeaderSecret(request);
  if (!INTERNAL_AUTOMATION_SECRET || headerSecret !== INTERNAL_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
  const coachId = request.nextUrl.searchParams.get('coachId');
  const windowMinutes = Number(request.nextUrl.searchParams.get('windowMinutes') ?? 1440) || 1440;
  const force = request.nextUrl.searchParams.get('force') === 'true';

  try {
    const summary = await processNotifications({
      dryRun,
      coachId,
      windowMinutes,
      force,
    });
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[internal/notifications/unread] failed', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
