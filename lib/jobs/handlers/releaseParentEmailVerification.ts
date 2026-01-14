import type { JobHandler, JobPayloadMap } from '../types';
import { readEnv } from '../env';

const DEFAULT_STALE_HOURS = 24;
const DEFAULT_LIMIT = 50;

function normalizeEmail(value: unknown): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function isPrintModeAgreement(agreement: { metadata?: any; status?: string } | null | undefined): boolean {
  const metadata = agreement?.metadata ?? {};
  return metadata?.mode === 'print' || metadata?.isPrintMode === true || agreement?.status === 'print_ready';
}

export const handleReleaseParentEmailVerification: JobHandler<'release_parent_email_verification'> = async (
  job,
  { logger, supabase },
) => {
  const payload: JobPayloadMap['release_parent_email_verification'] = job.payload ?? {};
  const log = logger ?? console;

  try {
    const staleHours = payload.staleHours ?? DEFAULT_STALE_HOURS;
    const limit = payload.limit ?? DEFAULT_LIMIT;
    const dryRun = payload.dryRun ?? false;

    const cutoffIso = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();

    const { data: candidateAgreements, error: candidateError } = await supabase
      .from('agreements')
      .select(
        'id, competitor_id, provider, template_kind, status, created_at, updated_at, metadata, recipient_email_verification_sent_at, recipient_email_verification_status',
      )
      .eq('provider', 'zoho')
      .eq('template_kind', 'minor')
      .eq('status', 'sent')
      .lt('created_at', cutoffIso)
      .is('recipient_email_verification_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (candidateError) throw candidateError;

    if (!candidateAgreements || candidateAgreements.length === 0) {
      return {
        status: 'succeeded',
        output: { candidates: 0, sent: 0, skipped: 0, dryRun },
      };
    }

    const competitorIds = Array.from(new Set(candidateAgreements.map((a: any) => a.competitor_id).filter(Boolean)));
    const { data: competitors, error: competitorError } = await supabase
      .from('competitors')
      .select('id, coach_id, is_18_or_over, parent_email, parent_email_is_valid')
      .in('id', competitorIds);

    if (competitorError) throw competitorError;

    const competitorsById = new Map<string, any>();
    for (const competitor of competitors || []) {
      competitorsById.set(competitor.id, competitor);
    }

    const supabaseUrl = readEnv('SUPABASE_URL') ?? readEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY') ?? readEnv('SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase service role configuration for SendGrid verification email');
    }

    const functionUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/send-email-alert`;

    const subject = 'Email check: Mayors Cup release form';
    const text = [
      'Hello',
      '',
      "This is an automated email to confirm we can reach this address for a student's Mayors Cup release form.",
      '',
      'You do not need to reply.',
      '',
      'If this email address is incorrect, please contact your coach and have the student update the parent/guardian email on their profile.',
      '',
      'Thank you,',
      'Coach Dashboard',
      '',
    ].join('\n');

    let sent = 0;
    let skipped = 0;
    const results: Array<{ agreementId: string; status: string; reason?: string }> = [];

    for (const agreement of candidateAgreements as any[]) {
      const competitor = competitorsById.get(agreement.competitor_id);
      if (!competitor) {
        skipped += 1;
        results.push({ agreementId: agreement.id, status: 'skipped', reason: 'competitor_not_found' });
        continue;
      }

      if (competitor.is_18_or_over) {
        skipped += 1;
        results.push({ agreementId: agreement.id, status: 'skipped', reason: 'not_minor' });
        continue;
      }

      if (isPrintModeAgreement(agreement)) {
        skipped += 1;
        results.push({ agreementId: agreement.id, status: 'skipped', reason: 'print_mode' });
        continue;
      }

      const parentEmail = normalizeEmail(competitor.parent_email);
      if (!parentEmail) {
        skipped += 1;
        results.push({ agreementId: agreement.id, status: 'skipped', reason: 'missing_parent_email' });
        continue;
      }

      if (competitor.parent_email_is_valid === false) {
        skipped += 1;
        results.push({ agreementId: agreement.id, status: 'skipped', reason: 'already_invalid' });
        continue;
      }

      if (!dryRun) {
        const emailResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: parentEmail,
            subject,
            text,
            coachId: competitor.coach_id ?? undefined,
            customArgs: {
              email_type: 'release_parent_email_verification',
              agreement_id: String(agreement.id),
              competitor_id: String(competitor.id),
            },
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text().catch(() => '');
          log.error('[release-email-verification] send failed', {
            agreementId: agreement.id,
            competitorId: competitor.id,
            status: emailResponse.status,
            errorText,
          });
          skipped += 1;
          results.push({ agreementId: agreement.id, status: 'skipped', reason: `send_failed:${emailResponse.status}` });
          continue;
        }

        const nowIso = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('agreements')
          .update({
            recipient_email_verification_sent_at: nowIso,
            recipient_email_verification_status: 'pending',
            recipient_email_verification_error: null,
          })
          .eq('id', agreement.id);

        if (updateError) {
          log.error('[release-email-verification] failed to update agreement', {
            agreementId: agreement.id,
            error: updateError.message,
          });
          skipped += 1;
          results.push({ agreementId: agreement.id, status: 'skipped', reason: 'agreement_update_failed' });
          continue;
        }
      }

      sent += 1;
      results.push({ agreementId: agreement.id, status: dryRun ? 'dry_run' : 'sent' });
    }

    return {
      status: 'succeeded',
      output: {
        candidates: candidateAgreements.length,
        sent,
        skipped,
        dryRun,
        results: results.slice(0, 25),
      },
    };
  } catch (error) {
    log.error('[release-email-verification] job failed', error);
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error verifying parent emails',
    };
  }
};
