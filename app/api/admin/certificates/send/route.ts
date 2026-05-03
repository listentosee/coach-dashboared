import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { AuditLogger } from '@/lib/audit/audit-logger';
import { config } from '@/lib/config';

// Same GFM configuration the competitor announcement mailer uses, for UX
// consistency across admin-authored email bodies.
marked.use({ gfm: true, breaks: true });

/**
 * Accept markdown OR raw HTML in admin-authored email bodies.
 *
 * Subtlety: marked URL-encodes characters inside href attributes, so
 * `[Claim]({{link}})` becomes `<a href="%7B%7Blink%7D%7D">Claim</a>`.
 * SendGrid's substitution pass looks for the LITERAL `{{link}}` token and
 * won't match the encoded form — the email would ship with a broken link.
 * After conversion we restore our known substitution tokens to their
 * literal form so SendGrid can do its thing.
 */
const SUBSTITUTION_TOKENS = ['{{link}}', '{{name}}'];

function restoreSubstitutionTokens(html: string): string {
  let out = html;
  for (const token of SUBSTITUTION_TOKENS) {
    const encoded = encodeURIComponent(token);
    // Replace both full and partial encodings — some versions of marked
    // only encode the braces, others encode the whole thing.
    out = out.split(encoded).join(token);
  }
  return out;
}

function bodyToHtml(input: string): string {
  const trimmed = input.trim();
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(trimmed);
  if (looksLikeHtml) return trimmed;
  return restoreSubstitutionTokens(marked.parse(trimmed) as string);
}

const requestBodySchema = z.object({
  audience: z.enum(['competitor', 'coach']),
  deliveryMethod: z.enum(['email', 'in_app']).optional(),
  onlyIncomplete: z.boolean().optional(),
  ids: z.array(z.string().uuid()).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  certificateYear: z.number().int().optional(),
  dryRun: z.boolean().optional(),
});

/**
 * Derive the claim-link base URL from the admin's own request, so the email
 * always points at the same domain the admin was on when they clicked Send.
 *
 * Priority:
 *   1. Request origin (x-forwarded-proto + x-forwarded-host / host) — respects
 *      custom domains, preview deploys, localhost dev, all without config.
 *   2. NEXT_PUBLIC_APP_URL — honored if set; treated as trusted.
 *   3. Production custom domain — last-resort hardcoded fallback.
 */
function deriveAppBaseUrl(req: NextRequest): string {
  // NextRequest.nextUrl.origin is already proto+host from the inbound
  // request — on Vercel this reflects the custom domain (e.g. coach.cyber-
  // guild.org) or preview URL, as appropriate for the environment.
  const originFromRequest = req.nextUrl?.origin?.replace(/\/+$/, '') || '';
  if (originFromRequest && /^https?:\/\//i.test(originFromRequest)) {
    return originFromRequest;
  }

  const envRaw = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (envRaw) {
    const withScheme = /^https?:\/\//i.test(envRaw) ? envRaw : `https://${envRaw}`;
    return withScheme.replace(/\/+$/, '');
  }

  return 'https://coach.cyber-guild.org';
}
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@coach.cyber-guild.org';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Coach Dashboard';

function ensureServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error('Missing Supabase service role configuration');
  }

  return createClient(url, config.supabase.secretKey, { auth: { persistSession: false } });
}

function createClaimToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildCoachFeedbackUrl(baseUrl: string, id: string) {
  // Route through our app-side wrapper at /coach-survey/[id] so the page
  // can short-circuit duplicate submissions before embedding the Fillout
  // iframe. The wrapper builds the Fillout URL itself for the iframe src.
  return `${baseUrl}/coach-survey/${encodeURIComponent(id)}`;
}

function buildCompetitorClaimUrl(baseUrl: string, token: string) {
  return `${baseUrl}/certificate/claim/${encodeURIComponent(token)}`;
}

function bodyToMessageText(input: string, substitutions: Record<string, string>) {
  let out = input.trim();
  for (const [token, value] of Object.entries(substitutions)) {
    out = out.split(token).join(value);
  }
  return out;
}

async function sendCoachInAppMessages({
  supabase,
  recipients,
  senderId,
  subject,
  body,
}: {
  supabase: any;
  recipients: Array<{ id: string; name: string | null; link: string }>;
  senderId: string;
  subject: string;
  body: string;
}) {
  const sent: Array<{ coachProfileId: string; conversationId: string; messageId: string }> = [];

  for (const recipient of recipients) {
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        type: 'dm',
        title: subject,
        created_by: senderId,
      })
      .select('id')
      .single();

    if (conversationError || !conversation?.id) {
      throw conversationError || new Error('Failed to create coach survey conversation');
    }

    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert([
        { conversation_id: conversation.id, user_id: senderId, role: 'member' },
        { conversation_id: conversation.id, user_id: recipient.id, role: 'member' },
      ]);

    if (memberError) throw memberError;

    const messageBody = bodyToMessageText(body, {
      '{{link}}': recipient.link,
      '{{name}}': recipient.name || 'Coach',
    });

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: senderId,
        body: messageBody,
      })
      .select('id')
      .single();

    if (messageError || !message?.id) {
      throw messageError || new Error('Failed to create coach survey message');
    }

    sent.push({
      coachProfileId: recipient.id,
      conversationId: String(conversation.id),
      messageId: String(message.id),
    });
  }

  return sent;
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const appBaseUrl = deriveAppBaseUrl(req);

    const parsed = requestBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const serviceClient = ensureServiceClient();
    const {
      audience,
      ids,
      subject,
      body,
      certificateYear,
      dryRun,
      onlyIncomplete = false,
    } = parsed.data;
    const deliveryMethod = parsed.data.deliveryMethod || 'email';

    if (audience === 'coach') {
      let coachQuery = serviceClient
        .from('profiles')
        .select('id, full_name, email, email_alert_address')
        .eq('role', 'coach');

      if (ids?.length) {
        coachQuery = coachQuery.in('id', ids);
      }

      const { data: coaches, error } = await coachQuery;
      if (error) throw error;

      let completedCoachIds = new Set<string>();
      if (onlyIncomplete && coaches?.length) {
        const { data: completedRows, error: completedError } = await serviceClient
          .from('survey_results')
          .select('coach_profile_id')
          .eq('type', 'coach')
          .in('coach_profile_id', coaches.map((coach) => coach.id));

        if (completedError) throw completedError;
        completedCoachIds = new Set(
          (completedRows || [])
            .map((row) => row.coach_profile_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        );
      }

      // Prefer the coach's alert email if they've set one — they typically
      // route it to an address they actually watch. Fall back to the
      // profile email. Drop coaches with neither for email delivery.
      const recipients = (coaches || [])
        .filter((coach) => !completedCoachIds.has(coach.id))
        .map((coach) => {
          const preferred = (coach.email_alert_address ?? '').trim();
          const fallback = (coach.email ?? '').trim();
          const email = preferred || fallback;
          if (deliveryMethod === 'email' && !email) return null;
          return {
            id: coach.id,
            name: coach.full_name,
            email,
            link: buildCoachFeedbackUrl(appBaseUrl, coach.id),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (dryRun) {
        return NextResponse.json({
          ok: true,
          dryRun: true,
          audience,
          deliveryMethod,
          onlyIncomplete,
          skippedCompleted: completedCoachIds.size,
          recipients,
        });
      }

      const rawBody =
        body ||
        'Hi {{name}},\n\nPlease share your feedback by completing our short [Coach Feedback Survey]({{link}}).\n\nThanks,\nCyber-Guild';
      const resolvedSubject = subject || 'Coach Feedback Survey';

      if (recipients.length === 0) {
        return NextResponse.json({
          ok: true,
          sent: 0,
          audience,
          deliveryMethod,
          onlyIncomplete,
          skippedCompleted: completedCoachIds.size,
        });
      }

      if (deliveryMethod === 'in_app') {
        const sentMessages = await sendCoachInAppMessages({
          supabase,
          recipients,
          senderId: user.id,
          subject: resolvedSubject,
          body: rawBody,
        });

        for (const recipient of recipients) {
          const sentMessage = sentMessages.find((item) => item.coachProfileId === recipient.id);
          await AuditLogger.logAction(serviceClient, {
            user_id: user.id,
            action: 'coach_survey_in_app_message_sent',
            entity_type: 'coach_profile',
            entity_id: recipient.id,
            metadata: {
              conversation_id: sentMessage?.conversationId,
              message_id: sentMessage?.messageId,
              only_incomplete: onlyIncomplete,
            },
          });
        }

        return NextResponse.json({
          ok: true,
          sent: sentMessages.length,
          audience,
          deliveryMethod,
          onlyIncomplete,
          skippedCompleted: completedCoachIds.size,
        });
      }

      if (!SENDGRID_API_KEY) {
        return NextResponse.json({ error: 'SENDGRID_API_KEY is not configured' }, { status: 500 });
      }

      const htmlBody = bodyToHtml(rawBody);

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: recipients.map((recipient) => ({
            to: [{ email: recipient.email }],
            custom_args: {
              email_type: 'coach_feedback',
              coach_profile_id: recipient.id,
            },
            substitutions: {
              '{{link}}': recipient.link,
              '{{name}}': recipient.name || 'Coach',
            },
          })),
          from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
          subject: resolvedSubject,
          content: [{ type: 'text/html', value: htmlBody }],
        }),
      });

      if (response.status !== 202) {
        const detail = await response.text().catch(() => '');
        return NextResponse.json({ error: 'SendGrid send failed', detail }, { status: 502 });
      }

      for (const recipient of recipients) {
        await AuditLogger.logAction(serviceClient, {
          user_id: user.id,
          action: 'coach_survey_emailed',
          entity_type: 'coach_profile',
          entity_id: recipient.id,
          metadata: { email: recipient.email, only_incomplete: onlyIncomplete },
        });
      }

      return NextResponse.json({
        ok: true,
        sent: recipients.length,
        audience,
        deliveryMethod,
        onlyIncomplete,
        skippedCompleted: completedCoachIds.size,
      });
    }

    let certificateQuery = serviceClient
      .from('competitor_certificates')
      .select(
        'id, competitor_id, claim_token, certificate_year, storage_path, survey_completed_at, competitors(id, first_name, last_name, email_personal, email_school, game_platform_onboarding_email)'
      )
      .not('storage_path', 'is', null);

    if (certificateYear) {
      certificateQuery = certificateQuery.eq('certificate_year', certificateYear);
    }

    if (ids?.length) {
      // Explicit competitor list: send (or re-send) to exactly these. The
      // admin opted in, so we honor the request even if some have already
      // been emailed. `onlyIncomplete` still filters out completed surveys.
      certificateQuery = certificateQuery.in('competitor_id', ids);
    } else if (onlyIncomplete) {
      // Resend mode: ignore emailed_at and target every generated certificate
      // whose survey is still incomplete.
      certificateQuery = certificateQuery.is('survey_completed_at', null);
    } else {
      // Bulk run: resume mode. Skip certs that already have `emailed_at`
      // stamped so re-clicks after a partial generation only email the
      // newly-generated PDFs. emailed_at is set further down only after
      // SendGrid returns 202, so it's a reliable "delivered to provider"
      // marker — pairs with the resumable filter in
      // resolveEligibleCompetitors so the recovery flow is symmetric.
      certificateQuery = certificateQuery.is('emailed_at', null);
    }

    if (ids?.length && onlyIncomplete) {
      certificateQuery = certificateQuery.is('survey_completed_at', null);
    }

    const { data: certificates, error } = await certificateQuery;
    if (error) throw error;

    const prepared = [];
    for (const certificate of certificates || []) {
      const competitor = Array.isArray((certificate as any).competitors)
        ? (certificate as any).competitors[0]
        : (certificate as any).competitors;

      const email =
        competitor?.game_platform_onboarding_email ||
        competitor?.email_personal ||
        competitor?.email_school ||
        null;

      if (!email) {
        continue;
      }

      let claimToken = certificate.claim_token;
      if (!claimToken) {
        claimToken = createClaimToken();
        await serviceClient
          .from('competitor_certificates')
          .update({ claim_token: claimToken, updated_at: new Date().toISOString() })
          .eq('id', certificate.id);
      }

      prepared.push({
        certificateId: certificate.id,
        competitorId: certificate.competitor_id,
        email,
        name: `${competitor?.first_name || ''} ${competitor?.last_name || ''}`.trim() || 'Competitor',
        claimToken,
        link: buildCompetitorClaimUrl(appBaseUrl, claimToken),
      });
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, audience, deliveryMethod: 'email', onlyIncomplete, recipients: prepared });
    }

    if (prepared.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, audience, deliveryMethod: 'email', onlyIncomplete });
    }

    if (!SENDGRID_API_KEY) {
      return NextResponse.json({ error: 'SENDGRID_API_KEY is not configured' }, { status: 500 });
    }

    const rawBody =
      body ||
      'Hi {{name}},\n\nYour competition certificate is ready. [Claim your certificate]({{link}}) to complete a short survey and download your PDF.\n\nThanks,\nCyber-Guild';
    const htmlBody = bodyToHtml(rawBody);

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: prepared.map((recipient) => ({
          to: [{ email: recipient.email }],
          custom_args: {
            email_type: 'competitor_certificate',
            competitor_id: recipient.competitorId,
            certificate_id: recipient.certificateId,
            claim_token: recipient.claimToken,
          },
          substitutions: {
            '{{link}}': recipient.link,
            '{{name}}': recipient.name,
          },
        })),
        from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
        subject: subject || 'Your Competition Certificate Is Ready',
        content: [{ type: 'text/html', value: htmlBody }],
      }),
    });

    if (response.status !== 202) {
      const detail = await response.text().catch(() => '');
      return NextResponse.json({ error: 'SendGrid send failed', detail }, { status: 502 });
    }

    await serviceClient
      .from('competitor_certificates')
      .update({ emailed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', prepared.map((recipient) => recipient.certificateId));

    for (const recipient of prepared) {
      await AuditLogger.logAction(serviceClient, {
        user_id: user.id,
        action: 'certificate_emailed',
        entity_type: 'competitor_certificate',
        entity_id: recipient.certificateId,
        metadata: {
          competitor_id: recipient.competitorId,
          email: recipient.email,
          only_incomplete: onlyIncomplete,
        },
      });
    }

    return NextResponse.json({ ok: true, sent: prepared.length, audience, deliveryMethod: 'email', onlyIncomplete });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[certificates/send] 500', { message, stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
