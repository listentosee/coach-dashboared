import type { JobHandler, JobPayloadMap } from '../types';
import { readEnv } from '../env';

const SENDGRID_BATCH_SIZE = 1000;

interface CampaignRow {
  id: string;
  subject: string;
  body_html: string;
  status: string;
}

interface RecipientRow {
  id: string;
  competitor_id: string;
  email: string;
  status: string;
}

export const handleCompetitorAnnouncementDispatch: JobHandler<'competitor_announcement_dispatch'> = async (
  job,
  { logger, supabase },
) => {
  const payload: JobPayloadMap['competitor_announcement_dispatch'] = job.payload;
  const log = logger ?? console;
  const { campaignId } = payload;

  if (!campaignId) {
    return { status: 'failed', error: 'Missing campaignId in job payload' };
  }

  try {
    // ---- 1. Load campaign ----
    const { data: campaign, error: campaignError } = await supabase
      .from('competitor_announcement_campaigns')
      .select('id, subject, body_html, status')
      .eq('id', campaignId)
      .single<CampaignRow>();

    if (campaignError || !campaign) {
      log.error('[competitor-announcement-dispatch] Campaign not found', {
        campaignId,
        error: campaignError?.message,
      });
      return { status: 'failed', error: `Campaign not found: ${campaignId}` };
    }

    if (campaign.status !== 'pending') {
      log.info('[competitor-announcement-dispatch] Campaign not in pending status, skipping', {
        campaignId,
        currentStatus: campaign.status,
      });
      return {
        status: 'succeeded',
        output: { campaignId, skipped: true, reason: `Campaign status is '${campaign.status}', expected 'pending'` },
      };
    }

    // ---- 2. Load queued recipients ----
    const { data: recipients, error: recipientsError } = await supabase
      .from('competitor_announcement_recipients')
      .select('id, competitor_id, email, status')
      .eq('campaign_id', campaignId)
      .eq('status', 'queued')
      .returns<RecipientRow[]>();

    if (recipientsError) {
      log.error('[competitor-announcement-dispatch] Failed to load recipients', {
        campaignId,
        error: recipientsError.message,
      });
      return { status: 'failed', error: `Failed to load recipients: ${recipientsError.message}` };
    }

    if (!recipients || recipients.length === 0) {
      log.info('[competitor-announcement-dispatch] No queued recipients, marking campaign as sent', {
        campaignId,
      });

      await supabase
        .from('competitor_announcement_campaigns')
        .update({ status: 'sent', completed_at: new Date().toISOString() })
        .eq('id', campaignId);

      return {
        status: 'succeeded',
        output: { campaignId, sent: 0, reason: 'No queued recipients' },
      };
    }

    log.info('[competitor-announcement-dispatch] Processing campaign', {
      campaignId,
      recipientCount: recipients.length,
    });

    // ---- 3. Read SendGrid config ----
    const sendgridApiKey = readEnv('SENDGRID_API_KEY');
    if (!sendgridApiKey) {
      log.error('[competitor-announcement-dispatch] Missing SENDGRID_API_KEY');

      await markCampaignFailed(supabase, campaignId, recipients, 'Missing SENDGRID_API_KEY environment variable');

      return { status: 'failed', error: 'Missing SENDGRID_API_KEY environment variable' };
    }

    const fromEmail = readEnv('SENDGRID_FROM_EMAIL') || 'noreply@example.com';
    const fromName = readEnv('SENDGRID_FROM_NAME') || 'Coach Dashboard';

    // ---- 4. Build personalizations and send in batches ----
    const batches: RecipientRow[][] = [];
    for (let i = 0; i < recipients.length; i += SENDGRID_BATCH_SIZE) {
      batches.push(recipients.slice(i, i + SENDGRID_BATCH_SIZE));
    }

    log.info('[competitor-announcement-dispatch] Sending batches', {
      campaignId,
      totalRecipients: recipients.length,
      batchCount: batches.length,
    });

    let totalSent = 0;
    let batchFailure = false;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      const personalizations = batch.map((r) => ({
        to: [{ email: r.email }],
        custom_args: {
          email_type: 'competitor_announcement',
          campaign_id: campaignId,
          competitor_id: r.competitor_id,
        },
      }));

      const sendgridPayload: Record<string, unknown> = {
        personalizations,
        from: {
          email: fromEmail,
          name: fromName,
        },
        subject: campaign.subject,
        content: [{ type: 'text/html', value: campaign.body_html }],
      };

      // Include unsubscribe group if configured
      const unsubscribeGroupId = readEnv('SENDGRID_UNSUBSCRIBE_GROUP_ID');
      if (unsubscribeGroupId && parseInt(unsubscribeGroupId, 10) > 0) {
        sendgridPayload.asm = { group_id: parseInt(unsubscribeGroupId, 10) };
      }

      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sendgridPayload),
        });

        if (response.status === 202) {
          totalSent += batch.length;
          log.info('[competitor-announcement-dispatch] Batch sent successfully', {
            campaignId,
            batchIndex,
            batchSize: batch.length,
          });
        } else {
          const errorText = await response.text().catch(() => '');
          log.error('[competitor-announcement-dispatch] SendGrid API error', {
            campaignId,
            batchIndex,
            status: response.status,
            errorText,
          });

          // Mark all recipients in this batch and remaining batches as failed
          const failedRecipientIds = batches
            .slice(batchIndex)
            .flat()
            .map((r) => r.id);

          await supabase
            .from('competitor_announcement_recipients')
            .update({
              status: 'failed' as string,
              error: `SendGrid API error: ${response.status} - ${errorText.substring(0, 500)}`,
              updated_at: new Date().toISOString(),
            })
            .in('id', failedRecipientIds);

          await supabase
            .from('competitor_announcement_campaigns')
            .update({ status: 'failed' })
            .eq('id', campaignId);

          batchFailure = true;
          break;
        }
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
        log.error('[competitor-announcement-dispatch] Network error calling SendGrid', {
          campaignId,
          batchIndex,
          error: errorMessage,
        });

        // Mark remaining recipients as failed
        const failedRecipientIds = batches
          .slice(batchIndex)
          .flat()
          .map((r) => r.id);

        await supabase
          .from('competitor_announcement_recipients')
          .update({
            status: 'failed' as string,
            error: `Network error: ${errorMessage}`,
            updated_at: new Date().toISOString(),
          })
          .in('id', failedRecipientIds);

        await supabase
          .from('competitor_announcement_campaigns')
          .update({ status: 'failed' })
          .eq('id', campaignId);

        batchFailure = true;
        break;
      }
    }

    if (batchFailure) {
      return {
        status: 'failed',
        error: `Campaign ${campaignId} failed during SendGrid dispatch. ${totalSent} recipients sent before failure.`,
      };
    }

    // ---- 5. All batches succeeded — finalize campaign ----
    // Transition remaining 'queued' recipients to 'unconfirmed' (dispatched to
    // SendGrid but no delivery webhook received yet). This avoids campaigns
    // getting stuck in 'sending' when providers like Yahoo/AOL never fire events.
    const { error: unconfirmedErr } = await supabase
      .from('competitor_announcement_recipients')
      .update({ status: 'unconfirmed', updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId)
      .eq('status', 'queued');

    if (unconfirmedErr) {
      log.error('[competitor-announcement-dispatch] Failed to mark recipients as unconfirmed', {
        campaignId,
        error: unconfirmedErr.message,
      });
      // Non-fatal: fall back to 'sending' so webhooks can still close it
      await supabase
        .from('competitor_announcement_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaignId);
    } else {
      // Mark campaign as complete immediately
      await supabase
        .from('competitor_announcement_campaigns')
        .update({ status: 'sent', completed_at: new Date().toISOString() })
        .eq('id', campaignId);
    }

    log.info('[competitor-announcement-dispatch] Campaign dispatched successfully', {
      campaignId,
      totalSent,
    });

    return {
      status: 'succeeded',
      output: { campaignId, sent: totalSent },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[competitor-announcement-dispatch] Job failed with unexpected error', {
      campaignId,
      error: errorMessage,
    });
    return {
      status: 'failed',
      error: `Unexpected error dispatching campaign ${campaignId}: ${errorMessage}`,
    };
  }
};

/**
 * Helper: mark campaign and all its queued recipients as failed.
 * Logs only campaign ID and counts — never email addresses (FERPA).
 */
async function markCampaignFailed(
  supabase: Parameters<JobHandler>[1]['supabase'],
  campaignId: string,
  recipients: RecipientRow[],
  errorText: string,
): Promise<void> {
  const recipientIds = recipients.map((r) => r.id);

  await supabase
    .from('competitor_announcement_recipients')
    .update({
      status: 'failed' as string,
      error: errorText,
      updated_at: new Date().toISOString(),
    })
    .in('id', recipientIds);

  await supabase
    .from('competitor_announcement_campaigns')
    .update({ status: 'failed' })
    .eq('id', campaignId);
}
