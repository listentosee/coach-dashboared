import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging/safe-logger';
import { AuditLogger } from '@/lib/audit/audit-logger';

// Known Fillout form IDs — same defaults used by the claim page + send route.
// Used for form-id → audience-type inference when URL parameter forwarding
// isn't available.
const COMPETITOR_FORM_ID = process.env.NEXT_PUBLIC_FILLOUT_COMPETITOR_FORM_ID || 'ca1hRrHGijus';
const COACH_FORM_ID = process.env.NEXT_PUBLIC_FILLOUT_COACH_FORM_ID || 'bJKURVuG1zus';

function inferTypeFromFormId(formId: string | null): 'coach' | 'competitor' | null {
  if (!formId) return null;
  if (formId === COMPETITOR_FORM_ID) return 'competitor';
  if (formId === COACH_FORM_ID) return 'coach';
  return null;
}

/**
 * Secondary extraction of the claim token: if Fillout isn't forwarding URL
 * parameters, a hidden question field in the form may still carry it. Checks
 * question names/ids for anything resembling `claim_token` and returns the
 * first non-empty value. Cheap defense-in-depth — cost is one array scan.
 */
function extractClaimTokenFromQuestions(submission: FilloutSubmission): string | null {
  const questions = Array.isArray(submission.questions) ? submission.questions : [];
  for (const q of questions as Array<{ id?: string; name?: string; value?: unknown }>) {
    const key = (q?.name || q?.id || '').toLowerCase();
    if (key === 'claim_token' || key === 'claimtoken' || key === 'claim-token') {
      const v = q?.value == null ? '' : String(q.value).trim();
      if (v) return v;
    }
  }
  return null;
}

type FilloutUrlParameter = {
  id?: string;
  name?: string;
  value?: unknown;
};

type FilloutSubmission = {
  submissionId?: string;
  formId?: string;
  submissionTime?: string;
  lastUpdatedAt?: string;
  urlParameters?: FilloutUrlParameter[];
  questions?: unknown[];
};

type WebhookHandleResult = {
  stored: boolean;
  type: 'coach' | 'competitor' | null;
  submissionId: string | null;
  notes: string[];
};

function isUuid(value: string | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeType(value: string | null): 'coach' | 'competitor' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'coach' || normalized === 'competitor') {
    return normalized;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function coerceSubmissions(payload: unknown): FilloutSubmission[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => (asRecord(item) ?? {}) as FilloutSubmission);
  }

  const record = asRecord(payload);
  if (!record) return [];

  const nestedSubmission = asRecord(record.submission);
  if (nestedSubmission) {
    return [nestedSubmission as FilloutSubmission];
  }

  const responses = Array.isArray(record.responses) ? record.responses : null;
  if (responses) {
    return responses.map((item) => (asRecord(item) ?? {}) as FilloutSubmission);
  }

  if (record.submissionId || record.urlParameters || record.questions) {
    return [record as FilloutSubmission];
  }

  return [];
}

function readUrlParameterMap(submission: FilloutSubmission, rootPayload: unknown) {
  const map = new Map<string, string>();
  const sources: FilloutUrlParameter[][] = [];

  if (Array.isArray(submission.urlParameters)) {
    sources.push(submission.urlParameters);
  }

  const root = asRecord(rootPayload);
  if (root && Array.isArray(root.urlParameters)) {
    sources.push(root.urlParameters as FilloutUrlParameter[]);
  }

  for (const source of sources) {
    for (const param of source) {
      const value = param?.value == null ? '' : String(param.value).trim();
      if (!value) continue;

      const keys = [param?.name, param?.id].map((key) => (key || '').trim()).filter(Boolean);
      for (const key of keys) {
        map.set(key, value);
      }
    }
  }

  return map;
}

function getSubmissionId(submission: FilloutSubmission, rootPayload: unknown) {
  const root = asRecord(rootPayload);
  const direct = submission.submissionId || (typeof root?.submissionId === 'string' ? root.submissionId : null);
  return direct?.trim() || null;
}

function getFormId(submission: FilloutSubmission, rootPayload: unknown) {
  const root = asRecord(rootPayload);
  const direct = submission.formId || (typeof root?.formId === 'string' ? root.formId : null);
  return direct?.trim() || null;
}

function getSubmittedAt(submission: FilloutSubmission, rootPayload: unknown) {
  const root = asRecord(rootPayload);
  const direct =
    submission.submissionTime ||
    submission.lastUpdatedAt ||
    (typeof root?.submissionTime === 'string' ? root.submissionTime : null) ||
    (typeof root?.lastUpdatedAt === 'string' ? root.lastUpdatedAt : null);

  return direct?.trim() || new Date().toISOString();
}

async function handleSubmission(
  supabase: any,
  submission: FilloutSubmission,
  rootPayload: unknown
): Promise<WebhookHandleResult> {
  const notes: string[] = [];
  const paramMap = readUrlParameterMap(submission, rootPayload);
  const submissionId = getSubmissionId(submission, rootPayload);
  const formId = getFormId(submission, rootPayload);
  const submittedAt = getSubmittedAt(submission, rootPayload);

  if (!submissionId) {
    return {
      stored: false,
      type: null,
      submissionId: null,
      notes: ['Missing submissionId in Fillout payload'],
    };
  }

  // Resolve audience type: URL parameter first, form-id inference as fallback.
  // This keeps the flow working even if Fillout isn't forwarding URL params.
  const typeFromParam = normalizeType(paramMap.get('type') || null);
  const typeFromForm = inferTypeFromFormId(formId);
  const type = typeFromParam ?? typeFromForm;

  if (!type) {
    return {
      stored: false,
      type: null,
      submissionId,
      notes: [
        `Could not determine audience type. type param=${paramMap.get('type') || '(missing)'}, form_id=${formId || '(missing)'}`,
      ],
    };
  }
  if (!typeFromParam && typeFromForm) {
    notes.push(`type inferred from form_id=${formId}`);
  }

  // Resolve per-audience id (may be absent — we'll still store the row).
  const idParam = (paramMap.get('id') || '').trim() || null;
  const competitorId = type === 'competitor' && isUuid(idParam) ? idParam : null;
  const coachProfileId = type === 'coach' && isUuid(idParam) ? idParam : null;
  if (idParam && type === 'competitor' && !competitorId) notes.push('Competitor id was not a valid UUID');
  if (idParam && type === 'coach' && !coachProfileId) notes.push('Coach profile id was not a valid UUID');

  // Resolve claim token: URL param first, question-field fallback.
  const claimTokenFromParam = (paramMap.get('claim_token') || '').trim() || null;
  const claimTokenFromQuestion = claimTokenFromParam ? null : extractClaimTokenFromQuestions(submission);
  const claimToken = claimTokenFromParam ?? claimTokenFromQuestion;
  if (!claimTokenFromParam && claimTokenFromQuestion) {
    notes.push('claim_token recovered from question field');
  }

  // For competitor submissions, try to link + unlock the certificate. Any
  // failure here does NOT prevent storing survey_results below — we keep
  // the raw response either way so the data isn't lost.
  let competitorCertificateId: string | null = null;
  let resolvedCompetitorId = competitorId;

  if (type === 'competitor' && claimToken) {
    const { data: certificate, error: certificateError } = await supabase
      .from('competitor_certificates')
      .select('id, competitor_id')
      .eq('claim_token', claimToken)
      .maybeSingle();

    if (certificateError) {
      notes.push(`Certificate lookup failed: ${certificateError.message}`);
    } else if (certificate) {
      competitorCertificateId = String(certificate.id);
      if (!resolvedCompetitorId && certificate.competitor_id) {
        resolvedCompetitorId = certificate.competitor_id;
        notes.push('competitor_id recovered from certificate claim_token');
      } else if (resolvedCompetitorId && certificate.competitor_id && certificate.competitor_id !== resolvedCompetitorId) {
        notes.push('competitor_id did not match certificate claim_token');
      }

      const { error: updateError } = await supabase
        .from('competitor_certificates')
        .update({
          survey_completed_at: submittedAt,
          fillout_submission_id: submissionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', competitorCertificateId);

      if (updateError) notes.push(`Certificate update failed: ${updateError.message}`);
    } else {
      notes.push('No certificate row matched claim_token');
    }
  } else if (type === 'competitor') {
    notes.push('Missing claim_token for competitor submission — survey stored but certificate not unlocked');
  }

  const { error: upsertError } = await supabase.from('survey_results').upsert(
    {
      type,
      competitor_id: type === 'competitor' ? resolvedCompetitorId : null,
      coach_profile_id: type === 'coach' ? coachProfileId : null,
      competitor_certificate_id: competitorCertificateId,
      fillout_submission_id: submissionId,
      fillout_form_id: formId,
      submitted_at: submittedAt,
      results_jsonb: {
        submission,
        url_parameters: Object.fromEntries(paramMap.entries()),
        raw_payload: rootPayload,
      },
    },
    { onConflict: 'fillout_submission_id' }
  );

  if (upsertError) {
    return {
      stored: false,
      type,
      submissionId,
      notes: [...notes, `Survey result upsert failed: ${upsertError.message}`],
    };
  }

  await AuditLogger.logAction(supabase, {
    user_id: null, // anonymous webhook — Fillout-originated
    action: type === 'competitor' ? 'certificate_survey_submitted' : 'coach_survey_submitted',
    entity_type: type === 'competitor' ? 'competitor_certificate' : 'coach_profile',
    entity_id: competitorCertificateId ?? (type === 'coach' ? coachProfileId ?? undefined : undefined),
    metadata: {
      fillout_submission_id: submissionId,
      fillout_form_id: formId,
      competitor_id: competitorId,
      coach_profile_id: coachProfileId,
    },
  });

  return {
    stored: true,
    type,
    submissionId,
    notes,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/certificates/fillout/webhook',
    methods: ['POST'],
  });
}

/**
 * Validates the shared secret Fillout sends as a custom webhook header.
 *
 * Fillout's webhook config supports a "Custom Header" — we configure one
 * there (e.g. name=`x-fillout-webhook-secret`, value=<random-string>) and
 * match it here against FILLOUT_WEBHOOK_SECRET.
 *
 * We accept either a dedicated header or a bearer token in Authorization,
 * whichever is easier to configure in Fillout. Constant-time comparison
 * to resist timing attacks.
 *
 * Fail-closed: if FILLOUT_WEBHOOK_SECRET is not set we reject all requests.
 * This tool marks certificates as "survey completed" and unlocks downloads,
 * so anonymous writes are unacceptable.
 */
function verifyWebhookSecret(req: NextRequest): { ok: true } | { ok: false; reason: string; status: number } {
  const expected = process.env.FILLOUT_WEBHOOK_SECRET;
  if (!expected) {
    return { ok: false, reason: 'FILLOUT_WEBHOOK_SECRET is not configured on the server', status: 503 };
  }

  const headerValue = (
    req.headers.get('x-fillout-webhook-secret') ||
    req.headers.get('x-webhook-secret') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
    ''
  ).trim();

  if (!headerValue) {
    return { ok: false, reason: 'Missing webhook secret header', status: 401 };
  }

  // Constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) {
    return { ok: false, reason: 'Webhook secret did not match', status: 401 };
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  if (mismatch !== 0) {
    return { ok: false, reason: 'Webhook secret did not match', status: 401 };
  }

  return { ok: true };
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase service role configuration' }, { status: 500 });
  }

  const auth = verifyWebhookSecret(req);
  if (!auth.ok) {
    logger.warn('Fillout webhook rejected', { reason: auth.reason, status: auth.status });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const raw = await req.text();
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch (error) {
    logger.warn('Fillout webhook payload was not valid JSON', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Log the top-level shape so we can see what Fillout is actually sending
  // when submissions fail to store. No content — keys only (safe).
  const topLevelKeys = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.keys(payload as Record<string, unknown>)
    : Array.isArray(payload) ? [`__array[${payload.length}]`] : [`__${typeof payload}`];

  const submissions = coerceSubmissions(payload);
  if (submissions.length === 0) {
    logger.warn('Fillout webhook: coerceSubmissions returned empty', { topLevelKeys });
    return NextResponse.json({
      ok: true,
      stored: 0,
      ignored: 1,
      notes: ['No Fillout submissions found in payload'],
      debug: { topLevelKeys },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const results: WebhookHandleResult[] = [];

  for (const submission of submissions) {
    results.push(await handleSubmission(supabase, submission, payload));
  }

  const stored = results.filter((result) => result.stored).length;
  const ignored = results.length - stored;
  const notes = results.flatMap((result) => result.notes);

  // Extra diagnostics when nothing stored — we want to see WHY, not just a count.
  if (stored === 0) {
    logger.warn('Fillout webhook stored 0 submissions', {
      topLevelKeys,
      submissionCount: submissions.length,
      firstSubmissionKeys: submissions[0] ? Object.keys(submissions[0] as Record<string, unknown>) : [],
      firstSubmissionUrlParamNames: Array.isArray((submissions[0] as any)?.urlParameters)
        ? ((submissions[0] as any).urlParameters as Array<{ name?: string }>).map((p) => p?.name)
        : [],
      notes,
    });
  }

  logger.info('Fillout webhook processed', {
    stored,
    ignored,
    results: results.map((result) => ({
      type: result.type,
      submissionId: result.submissionId,
      stored: result.stored,
      notes: result.notes,
    })),
  });

  return NextResponse.json({
    ok: true,
    stored,
    ignored,
    results,
    notes,
  });
}
