import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { AuditLogger } from '@/lib/audit/audit-logger';

const requestBodySchema = z.object({
  audience: z.enum(['competitor', 'coach']),
  ids: z.array(z.string().uuid()).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  certificateYear: z.number().int().optional(),
  dryRun: z.boolean().optional(),
});

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://coach.cyber-guild.org';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@coach.cyber-guild.org';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Coach Dashboard';
const COACH_FILLOUT_FORM_ID = process.env.NEXT_PUBLIC_FILLOUT_COACH_FORM_ID || 'bJKURVuG1zus';

function ensureServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function createClaimToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildCoachFeedbackUrl(id: string) {
  const url = new URL(`https://form.fillout.com/t/${COACH_FILLOUT_FORM_ID}`);
  url.searchParams.set('type', 'coach');
  url.searchParams.set('id', id);
  return url.toString();
}

function buildCompetitorClaimUrl(token: string) {
  return new URL(`/certificate/claim/${token}`, APP_BASE_URL).toString();
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

    const parsed = requestBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const serviceClient = ensureServiceClient();
    const { audience, ids, subject, body, certificateYear, dryRun } = parsed.data;

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

      // Prefer the coach's alert email if they've set one — they typically
      // route it to an address they actually watch. Fall back to the
      // profile email. Drop coaches with neither.
      const recipients = (coaches || [])
        .map((coach) => {
          const preferred = (coach.email_alert_address ?? '').trim();
          const fallback = (coach.email ?? '').trim();
          const email = preferred || fallback;
          if (!email) return null;
          return {
            id: coach.id,
            name: coach.full_name,
            email,
            link: buildCoachFeedbackUrl(coach.id),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (dryRun) {
        return NextResponse.json({ ok: true, dryRun: true, audience, recipients });
      }

      if (!SENDGRID_API_KEY) {
        return NextResponse.json({ error: 'SENDGRID_API_KEY is not configured' }, { status: 500 });
      }

      const personalizations = recipients.map((recipient) => ({
        to: [{ email: recipient.email }],
        custom_args: {
          email_type: 'coach_feedback',
          coach_profile_id: recipient.id,
        },
      }));

      const textBody =
        body ||
        'Please share your feedback using this link:\n\n{{link}}';

      const htmlBody = textBody.replace('{{link}}', '{{link}}').replace(/\n/g, '<br />');

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
          subject: subject || 'Coach Feedback Survey',
          content: [
            {
              type: 'text/html',
              value: htmlBody
                .replace('{{link}}', '<a href="{{link}}">{{link}}</a>')
                .replace('{{name}}', '{{name}}'),
            },
          ],
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
          metadata: { email: recipient.email },
        });
      }

      return NextResponse.json({ ok: true, sent: recipients.length, audience });
    }

    let certificateQuery = serviceClient
      .from('competitor_certificates')
      .select(
        'id, competitor_id, claim_token, certificate_year, storage_path, competitors(id, first_name, last_name, email_personal, email_school, game_platform_onboarding_email)'
      )
      .not('storage_path', 'is', null);

    if (certificateYear) {
      certificateQuery = certificateQuery.eq('certificate_year', certificateYear);
    }

    if (ids?.length) {
      certificateQuery = certificateQuery.in('competitor_id', ids);
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
        link: buildCompetitorClaimUrl(claimToken),
      });
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, audience, recipients: prepared });
    }

    if (!SENDGRID_API_KEY) {
      return NextResponse.json({ error: 'SENDGRID_API_KEY is not configured' }, { status: 500 });
    }

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
        content: [
          {
            type: 'text/html',
            value: (body || 'Hello {{name}},<br /><br />Your certificate is ready. Use this link to claim it:<br /><a href="{{link}}">{{link}}</a>')
              .replace('{{link}}', '<a href="{{link}}">{{link}}</a>'),
          },
        ],
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
        },
      });
    }

    return NextResponse.json({ ok: true, sent: prepared.length, audience });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[certificates/send] 500', { message, stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
