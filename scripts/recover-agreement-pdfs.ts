/**
 * Recovery script: fetch signed PDFs from Zoho for agreements that completed
 * but whose PDF was never stored (signed_pdf_path = null).
 *
 * Usage:
 *   npx tsx scripts/recover-agreement-pdfs.ts
 *
 * Hardcoded to the two known affected agreements. Can be extended to scan all
 * completed agreements with signed_pdf_path = null.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '../app/api/zoho/_lib/token';
import { calculateCompetitorStatus } from '../lib/utils/competitor-status';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const zohoBaseUrl = process.env.ZOHO_SIGN_BASE_URL || 'https://sign.zoho.com';

if (!supabaseUrl || !supabaseKey) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!process.env.ZOHO_REFRESH_TOKEN) { console.error('Missing ZOHO_REFRESH_TOKEN'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const AFFECTED_AGREEMENTS = [
  { agreementId: '3346119e-c37e-4f51-80af-45b4c89f1689', requestId: '505002000000308079', competitorId: 'a3409d4c-3ce3-4318-bea2-3d9af51bb9df', name: 'Elias Yeadon' },
  { agreementId: '502a54e5-6d14-4855-bda2-cc450456b9dc', requestId: '505002000000310131', competitorId: '46b35eae-c269-4fe7-9e1f-ba2a12fd02c0', name: 'Venus Slacks' },
];

async function recoverAgreement(entry: typeof AFFECTED_AGREEMENTS[number], token: string) {
  const { agreementId, requestId, competitorId, name } = entry;
  console.log(`\n--- ${name} (request ${requestId}) ---`);

  // 1. Fetch PDF from Zoho
  console.log('  Fetching PDF from Zoho...');
  const pdfRes = await fetch(`${zohoBaseUrl}/api/v1/requests/${requestId}/pdf`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  if (!pdfRes.ok) {
    console.error(`  FAILED: Zoho returned ${pdfRes.status} ${await pdfRes.text()}`);
    return false;
  }

  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  if (pdfBuf.length === 0) {
    console.error('  FAILED: Zoho returned empty PDF');
    return false;
  }
  console.log(`  Got PDF (${(pdfBuf.length / 1024).toFixed(1)} KB)`);

  // 2. Upload to Supabase Storage
  const pdfPath = `signed/${requestId}.pdf`;
  console.log(`  Uploading to storage: ${pdfPath}...`);
  const { error: uploadError } = await supabase.storage.from('signatures').upload(pdfPath, pdfBuf, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (uploadError) {
    console.error('  FAILED to upload:', uploadError.message);
    return false;
  }
  console.log('  Uploaded successfully.');

  // 3. Update agreement with pdf path
  const { error: agreementError } = await supabase
    .from('agreements')
    .update({ signed_pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq('id', agreementId);
  if (agreementError) {
    console.error('  FAILED to update agreement:', agreementError.message);
    return false;
  }
  console.log('  Agreement signed_pdf_path updated.');

  // 4. Recalculate and fix competitor status
  const { data: competitor, error: compError } = await supabase
    .from('competitors')
    .select('*')
    .eq('id', competitorId)
    .single();

  if (compError || !competitor) {
    console.error('  FAILED to fetch competitor:', compError?.message);
    return false;
  }

  const newStatus = calculateCompetitorStatus(competitor);
  console.log(`  Competitor status: ${competitor.status} → ${newStatus}`);

  if (newStatus !== competitor.status) {
    const { error: statusError } = await supabase
      .from('competitors')
      .update({ status: newStatus })
      .eq('id', competitorId);
    if (statusError) {
      console.error('  FAILED to update competitor status:', statusError.message);
      return false;
    }
    console.log('  Competitor status updated.');
  } else {
    console.log('  Competitor status already correct — no update needed.');
  }

  return true;
}

async function main() {
  console.log('Getting Zoho access token...');
  const token = await getZohoAccessToken();
  console.log('Token obtained.');

  let successCount = 0;
  for (const entry of AFFECTED_AGREEMENTS) {
    const ok = await recoverAgreement(entry, token);
    if (ok) successCount++;
  }

  console.log(`\n=== Recovery complete: ${successCount}/${AFFECTED_AGREEMENTS.length} succeeded ===`);
}

main().catch(console.error);
