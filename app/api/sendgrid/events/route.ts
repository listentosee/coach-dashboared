import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging/safe-logger';

type SendGridEventPayload = Record<string, unknown> & {
  event?: string;
  email?: string;
  reason?: string;
  response?: string;
  status?: string;
  custom_args?: Record<string, unknown>;
};

function getEventArg(event: SendGridEventPayload, key: string): string | null {
  const direct = event[key];
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return String(direct);
  }
  const customArgs = event.custom_args;
  if (customArgs && typeof customArgs === 'object') {
    const nested = (customArgs as Record<string, unknown>)[key];
    if (nested !== undefined && nested !== null && String(nested).trim()) {
      return String(nested);
    }
  }
  return null;
}

function normalizeEmail(value: unknown): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.SENDGRID_EVENT_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'SendGrid webhook token is not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const providedToken = url.searchParams.get('token') || req.headers.get('x-sendgrid-webhook-token');
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase service role configuration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let events: unknown;
  try {
    events = await req.json();
  } catch (error) {
    logger.warn('SendGrid webhook payload was not valid JSON', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const rows: SendGridEventPayload[] = Array.isArray(events) ? (events as SendGridEventPayload[]) : [events as SendGridEventPayload];
  if (rows.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  const invalidEvents = new Set(['bounce', 'dropped', 'blocked']);
  let processed = 0;
  let ignored = 0;
  let updatedAgreements = 0;
  let markedInvalid = 0;

  for (const event of rows) {
    processed += 1;

    const emailType = getEventArg(event, 'email_type');
    if (emailType !== 'release_parent_email_verification') {
      ignored += 1;
      continue;
    }

    const agreementId = getEventArg(event, 'agreement_id');
    const competitorId = getEventArg(event, 'competitor_id');
    const eventType = (event.event ? String(event.event) : '').trim().toLowerCase();
    if (!agreementId || !competitorId || !eventType) {
      ignored += 1;
      continue;
    }

    const errorTextRaw = (event.reason || event.response || event.status || '').toString().trim();
    const errorText = errorTextRaw ? errorTextRaw.slice(0, 1000) : null;

    if (invalidEvents.has(eventType)) {
      const { error: agreementErr } = await supabase
        .from('agreements')
        .update({
          recipient_email_verification_status: eventType,
          recipient_email_verification_error: errorText,
        })
        .eq('id', agreementId);

      if (!agreementErr) updatedAgreements += 1;

      const incomingEmail = normalizeEmail(event.email);
      if (!incomingEmail) continue;

      const { data: competitor, error: competitorErr } = await supabase
        .from('competitors')
        .select('id, parent_email')
        .eq('id', competitorId)
        .maybeSingle();

      if (competitorErr || !competitor) continue;

      const currentParentEmail = normalizeEmail((competitor as any).parent_email);
      if (!currentParentEmail || currentParentEmail !== incomingEmail) continue;

      const { error: invalidErr } = await supabase
        .from('competitors')
        .update({
          parent_email_is_valid: false,
          parent_email_validated_at: new Date().toISOString(),
          parent_email_invalid_reason: errorText || eventType,
        })
        .eq('id', competitorId);

      if (!invalidErr) markedInvalid += 1;
      continue;
    }

    if (eventType === 'delivered') {
      const { error: agreementErr } = await supabase
        .from('agreements')
        .update({
          recipient_email_verification_status: 'delivered',
          recipient_email_verification_error: null,
        })
        .eq('id', agreementId)
        .neq('recipient_email_verification_status', 'bounce')
        .neq('recipient_email_verification_status', 'dropped')
        .neq('recipient_email_verification_status', 'blocked');

      if (!agreementErr) updatedAgreements += 1;
      continue;
    }

    ignored += 1;
  }

  return NextResponse.json({
    ok: true,
    processed,
    ignored,
    updatedAgreements,
    markedInvalid,
  });
}

export const runtime = 'nodejs';

