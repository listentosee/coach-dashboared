/**
 * End-to-end smoke test for the certificate + survey flow.
 *
 * What it does (against a REAL Supabase project, using a throwaway row):
 *   1. Creates a fake competitor_certificates row with a known claim_token
 *      linked to an existing real competitor (picked arbitrarily, read-only
 *      reference — not modified).
 *   2. Uploads a tiny placeholder PDF to the certificates storage bucket.
 *   3. POSTs a synthetic Fillout submission payload to the webhook endpoint
 *      with the required secret header.
 *   4. Verifies `survey_completed_at` was set and a `survey_results` row
 *      landed.
 *   5. GETs the download endpoint and verifies a 200 + PDF body comes back.
 *   6. Cleans up: deletes the storage file, survey_results row, and
 *      competitor_certificates row.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   FILLOUT_WEBHOOK_SECRET=<your-secret> \
 *   pnpm tsx scripts/certificate-flow-smoke-check.ts
 *
 *   Point BASE_URL at wherever the Next.js server is running. Production
 *   works too but you probably want staging/local.
 *
 * Safe to run against production: the test certificate row is fully
 * isolated (random claim_token, distinctive storage path) and every
 * resource it creates is torn down in the finally block.
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const webhookSecret = process.env.FILLOUT_WEBHOOK_SECRET || '';
const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const bucketName = process.env.SUPABASE_CERTIFICATES_BUCKET || 'competition-certificates';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!webhookSecret) {
  console.error('Missing FILLOUT_WEBHOOK_SECRET (must match server env)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

// A minimal valid PDF body — 1 page, empty. Using pdf-lib feels like overkill
// for a smoke test; a literal PDF string is fine here.
const PLACEHOLDER_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n' +
  '4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 72 720 Td (Test Certificate) Tj ET\nendstream\nendobj\n' +
  'xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000098 00000 n\n0000000167 00000 n\n' +
  'trailer<</Size 5/Root 1 0 R>>\nstartxref\n255\n%%EOF',
  'binary',
);

async function main() {
  console.log(`Test against: ${baseUrl}\n`);

  // Pick any active competitor as a reference (we never mutate it).
  const { data: sampleCompetitor, error: sampleErr } = await supabase
    .from('competitors')
    .select('id, first_name, last_name')
    .limit(1)
    .single();

  if (sampleErr || !sampleCompetitor) {
    throw new Error(`Could not find a competitor to test against: ${sampleErr?.message}`);
  }

  const claimToken = `test-${crypto.randomBytes(12).toString('hex')}`;
  const storagePath = `_tests/${claimToken}.pdf`;
  const fakeSubmissionId = `test-submission-${crypto.randomBytes(8).toString('hex')}`;
  const certificateYear = 9999; // clearly a test year

  let certificateId: string | null = null;
  let surveyResultId: string | null = null;
  let storageUploaded = false;

  try {
    // ---------- 1. Upload placeholder PDF ----------
    console.log('[1/6] Uploading placeholder PDF to storage…');
    const { error: upErr } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, PLACEHOLDER_PDF, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
    storageUploaded = true;
    console.log('      ok');

    // ---------- 2. Create test certificate row ----------
    console.log('[2/6] Creating test competitor_certificates row…');
    const { data: inserted, error: insErr } = await supabase
      .from('competitor_certificates')
      .insert({
        competitor_id: sampleCompetitor.id,
        certificate_year: certificateYear,
        storage_path: storagePath,
        claim_token: claimToken,
      })
      .select('id')
      .single();
    if (insErr || !inserted) throw new Error(`Insert failed: ${insErr?.message}`);
    certificateId = inserted.id;
    console.log(`      ok (id=${certificateId}, token=${claimToken})`);

    // ---------- 3. Simulate Fillout webhook ----------
    console.log('[3/6] POST /api/certificates/fillout/webhook (with secret)…');
    const webhookBody = {
      submissionId: fakeSubmissionId,
      formId: 'test-form-id',
      submissionTime: new Date().toISOString(),
      urlParameters: [
        { name: 'type', value: 'competitor' },
        { name: 'id', value: sampleCompetitor.id },
        { name: 'claim_token', value: claimToken },
      ],
      questions: [{ name: 'How was it?', value: 'Great' }],
    };
    const webhookRes = await fetch(`${baseUrl}/api/certificates/fillout/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fillout-webhook-secret': webhookSecret,
      },
      body: JSON.stringify(webhookBody),
    });
    const webhookJson = (await webhookRes.json()) as { stored?: number; error?: string };
    if (!webhookRes.ok || !webhookJson.stored) {
      throw new Error(
        `Webhook failed (${webhookRes.status}): ${webhookJson.error ?? JSON.stringify(webhookJson)}`,
      );
    }
    console.log(`      ok (stored=${webhookJson.stored})`);

    // ---------- 4. Verify DB state ----------
    console.log('[4/6] Verifying survey_completed_at was set…');
    const { data: updatedCert } = await supabase
      .from('competitor_certificates')
      .select('survey_completed_at, fillout_submission_id')
      .eq('id', certificateId)
      .single();
    if (!updatedCert?.survey_completed_at) {
      throw new Error('survey_completed_at was NOT set after webhook');
    }
    if (updatedCert.fillout_submission_id !== fakeSubmissionId) {
      throw new Error('fillout_submission_id did not match the submitted value');
    }
    const { data: surveyRow } = await supabase
      .from('survey_results')
      .select('id')
      .eq('fillout_submission_id', fakeSubmissionId)
      .single();
    if (!surveyRow) throw new Error('survey_results row was NOT created');
    surveyResultId = surveyRow.id;
    console.log('      ok');

    // ---------- 5. Webhook without secret must 401 ----------
    console.log('[5/6] Negative case: webhook without secret…');
    const badRes = await fetch(`${baseUrl}/api/certificates/fillout/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookBody),
    });
    if (badRes.status !== 401 && badRes.status !== 503) {
      throw new Error(`Expected 401/503 for missing secret, got ${badRes.status}`);
    }
    console.log(`      ok (rejected with ${badRes.status})`);

    // ---------- 6. Download endpoint returns the PDF ----------
    console.log('[6/6] GET /api/certificates/download/[token]…');
    const dlRes = await fetch(`${baseUrl}/api/certificates/download/${claimToken}`);
    if (!dlRes.ok) {
      const errText = await dlRes.text().catch(() => '');
      throw new Error(`Download failed (${dlRes.status}): ${errText.slice(0, 300)}`);
    }
    const bodyBytes = Buffer.from(await dlRes.arrayBuffer());
    if (bodyBytes.length === 0 || !bodyBytes.slice(0, 4).toString().startsWith('%PDF')) {
      throw new Error(`Download response did not look like a PDF (first bytes: ${bodyBytes.slice(0, 8).toString('hex')})`);
    }
    console.log(`      ok (${bodyBytes.length} bytes, starts with %PDF)`);

    console.log('\n✅ All checks passed.');
  } catch (err) {
    console.error('\n❌ Test failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    console.log('\nCleanup…');
    if (surveyResultId) {
      await supabase.from('survey_results').delete().eq('id', surveyResultId);
    }
    if (certificateId) {
      await supabase.from('competitor_certificates').delete().eq('id', certificateId);
    }
    if (storageUploaded) {
      await supabase.storage.from(bucketName).remove([storagePath]);
    }
    console.log('done.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
