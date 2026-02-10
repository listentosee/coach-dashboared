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
  const announcementTerminalStatuses = new Set(['delivered', 'bounced', 'dropped', 'blocked', 'skipped']);
  let processed = 0;
  let ignored = 0;
  let updatedAgreements = 0;
  let markedInvalid = 0;
  let updatedAnnouncementRecipients = 0;
  let completedCampaigns = 0;

  for (const event of rows) {
    processed += 1;

    const emailType = getEventArg(event, 'email_type');
    const eventType = (event.event ? String(event.event) : '').trim().toLowerCase();

    // ---- Competitor announcement email events ----
    if (emailType === 'competitor_announcement') {
      const campaignId = getEventArg(event, 'campaign_id');
      const competitorId = getEventArg(event, 'competitor_id');

      if (!campaignId || !competitorId || !eventType) {
        ignored += 1;
        continue;
      }

      // Map SendGrid event type to recipient status
      let recipientStatus: string | null = null;
      let recipientError: string | null = null;

      if (eventType === 'delivered') {
        recipientStatus = 'delivered';
      } else if (eventType === 'bounce') {
        recipientStatus = 'bounced';
      } else if (eventType === 'dropped') {
        recipientStatus = 'dropped';
      } else if (eventType === 'blocked') {
        recipientStatus = 'blocked';
      }

      // Handle open/click engagement events (set timestamp, first occurrence only)
      if (eventType === 'open' || eventType === 'click') {
        const tsColumn = eventType === 'open' ? 'opened_at' : 'clicked_at';
        const { error: engagementErr } = await supabase
          .from('competitor_announcement_recipients')
          .update({ [tsColumn]: new Date().toISOString(), updated_at: new Date().toISOString() })
          .match({ campaign_id: campaignId, competitor_id: competitorId })
          .is(tsColumn, null);

        if (!engagementErr) {
          updatedAnnouncementRecipients += 1;
        }
        continue;
      }

      if (!recipientStatus) {
        // Not a delivery-outcome event (e.g., 'processed') — skip
        ignored += 1;
        continue;
      }

      // Extract error reason for failure events
      if (recipientStatus !== 'delivered') {
        const errorTextRaw = (event.reason || event.response || event.status || '').toString().trim();
        recipientError = errorTextRaw ? errorTextRaw.slice(0, 1000) : null;
      }

      // Update the recipient row
      const updatePayload: Record<string, unknown> = {
        status: recipientStatus,
        updated_at: new Date().toISOString(),
      };
      if (recipientError !== null) {
        updatePayload.error = recipientError;
      }

      const { error: recipientUpdateErr } = await supabase
        .from('competitor_announcement_recipients')
        .update(updatePayload)
        .match({ campaign_id: campaignId, competitor_id: competitorId });

      if (recipientUpdateErr) {
        logger.warn('[sendgrid-webhook] Failed to update announcement recipient', {
          campaignId,
          competitorId,
          eventType,
          error: recipientUpdateErr.message,
        });
        continue;
      }

      updatedAnnouncementRecipients += 1;

      // Check if all recipients for this campaign have reached a terminal status.
      // If so, mark the campaign as 'sent' with completed_at.
      const { count: nonTerminalCount, error: countErr } = await supabase
        .from('competitor_announcement_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .not('status', 'in', `(${Array.from(announcementTerminalStatuses).join(',')})`);

      if (!countErr && nonTerminalCount === 0) {
        const { error: campaignUpdateErr } = await supabase
          .from('competitor_announcement_campaigns')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('status', 'sending');

        if (!campaignUpdateErr) {
          completedCampaigns += 1;
          logger.info('[sendgrid-webhook] Campaign completed — all recipients terminal', {
            campaignId,
          });
        }
      }

      continue;
    }

    // ---- Release parent email verification events ----
    if (emailType !== 'release_parent_email_verification') {
      ignored += 1;
      continue;
    }

    const agreementId = getEventArg(event, 'agreement_id');
    const competitorId = getEventArg(event, 'competitor_id');
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
    updatedAnnouncementRecipients,
    completedCampaigns,
  });
}

export const runtime = 'nodejs';

