#!/usr/bin/env tsx
/**
 * Audit script: cross-references Supabase Storage (signatures bucket)
 * against the agreements table to find:
 *   1. Agreements marked 'completed' with no signed_pdf_path
 *   2. PDFs in storage that aren't linked to any agreement
 *   3. Agreements with a signed_pdf_path that doesn't exist in storage
 *
 * Usage:
 *   pnpm tsx scripts/audit-agreement-pdfs.ts
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'signatures';
const STORAGE_PREFIXES = ['signed', 'manual', 'print-ready'];

async function listAllFiles(prefix: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
      console.error(`Error listing ${prefix}/: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const file of data) {
      if (file.name && !file.name.startsWith('.')) {
        paths.push(`${prefix}/${file.name}`);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function main() {
  const lines: string[] = [];
  const log = (line = '') => { lines.push(line); console.log(line); };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  log(`# Agreement PDF Audit Report`);
  log(`**Generated:** ${new Date().toISOString()}`);
  log();

  // 1. List all files in storage
  console.log('Scanning storage bucket...');
  const allFiles: string[] = [];
  for (const prefix of STORAGE_PREFIXES) {
    const files = await listAllFiles(prefix);
    allFiles.push(...files);
    console.log(`  ${prefix}/: ${files.length} files`);
  }

  log(`## Storage Inventory`);
  for (const prefix of STORAGE_PREFIXES) {
    const count = allFiles.filter(f => f.startsWith(`${prefix}/`)).length;
    log(`- \`${prefix}/\`: ${count} files`);
  }
  log(`- **Total:** ${allFiles.length} files`);
  log();

  // Build a set of storage paths for fast lookup
  const storagePathSet = new Set(allFiles);

  // 2. Fetch all agreements
  const { data: agreements, error: agError } = await supabase
    .from('agreements')
    .select('id, competitor_id, request_id, status, signed_pdf_path, completion_source, template_kind, manual_uploaded_path, updated_at')
    .order('updated_at', { ascending: false });

  if (agError) {
    console.error(`Error fetching agreements: ${agError.message}`);
    process.exit(1);
  }

  log(`## Agreements: ${agreements.length} total`);
  log();

  // 3. Fetch competitors for date field check
  const competitorIds = [...new Set(agreements.map(a => a.competitor_id))];
  const { data: competitors, error: compError } = await supabase
    .from('competitors')
    .select('id, is_18_or_over, participation_agreement_date, media_release_date, first_name, last_name')
    .in('id', competitorIds);

  if (compError) {
    console.error(`Error fetching competitors: ${compError.message}`);
    process.exit(1);
  }

  const competitorMap = new Map(competitors?.map(c => [c.id, c]) ?? []);

  // Build set of paths referenced by agreements
  const linkedPaths = new Set<string>();
  for (const ag of agreements) {
    if (ag.signed_pdf_path) linkedPaths.add(ag.signed_pdf_path);
    if (ag.manual_uploaded_path) linkedPaths.add(ag.manual_uploaded_path);
  }

  // --- Report ---

  // A. Completed agreements with no signed_pdf_path
  const completedNoPath = agreements.filter(
    a => (a.status === 'completed' || a.status === 'completed_manual') && !a.signed_pdf_path
  );
  log(`## A. Completed agreements with NO signed_pdf_path: ${completedNoPath.length}`);
  log();
  for (const a of completedNoPath) {
    const expectedPath = a.completion_source === 'manual'
      ? '(manual — no predictable path)'
      : `signed/${a.request_id}.pdf`;
    const existsInStorage = expectedPath !== '(manual — no predictable path)' && storagePathSet.has(expectedPath);
    const comp = competitorMap.get(a.competitor_id);
    const dateField = a.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
    const hasDate = comp ? !!(comp as any)[dateField] : 'unknown';

    log(`### Agreement \`${a.id}\``);
    log(`- **request_id:** \`${a.request_id}\``);
    log(`- **status:** ${a.status}, **source:** ${a.completion_source}`);
    log(`- **competitor:** ${comp?.first_name} ${comp?.last_name} (\`${a.competitor_id}\`)`);
    log(`- **competitor date stamped:** ${hasDate}`);
    log(`- **expected storage path:** \`${expectedPath}\``);
    log(`- **file exists in storage:** ${existsInStorage}`);
    log();
  }

  // B. Completed agreements with signed_pdf_path that DOESN'T exist in storage
  const pathNotInStorage = agreements.filter(
    a => a.signed_pdf_path && !storagePathSet.has(a.signed_pdf_path)
  );
  log(`## B. Agreements with signed_pdf_path NOT found in storage: ${pathNotInStorage.length}`);
  log();
  for (const a of pathNotInStorage) {
    log(`- Agreement \`${a.id}\` — path: \`${a.signed_pdf_path}\` — status: ${a.status}`);
  }
  log();

  // C. Files in storage not linked to any agreement
  const orphanedFiles = allFiles.filter(f => !linkedPaths.has(f));
  log(`## C. Orphaned files in storage (not linked to any agreement): ${orphanedFiles.length}`);
  log();
  for (const f of orphanedFiles) {
    log(`- \`${f}\``);
  }
  log();

  // D. Completed agreements where competitor date field is missing
  const completedNoDate = agreements.filter(a => {
    if (a.status !== 'completed' && a.status !== 'completed_manual') return false;
    const comp = competitorMap.get(a.competitor_id);
    if (!comp) return true;
    const dateField = a.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
    return !(comp as any)[dateField];
  });
  log(`## D. Completed agreements where competitor date field is NULL: ${completedNoDate.length}`);
  log();
  for (const a of completedNoDate) {
    const comp = competitorMap.get(a.competitor_id);
    const dateField = a.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
    log(`- Agreement \`${a.id}\` → **${comp?.first_name} ${comp?.last_name}** — missing: \`${dateField}\` — pdf: \`${a.signed_pdf_path || '(none)'}\``);
  }
  log();

  // Summary
  log(`## Summary`);
  log();
  log(`| Metric | Count |`);
  log(`|--------|-------|`);
  log(`| Storage files | ${allFiles.length} |`);
  log(`| Agreements | ${agreements.length} |`);
  log(`| Completed, no PDF path | ${completedNoPath.length} |`);
  log(`| PDF path missing from storage | ${pathNotInStorage.length} |`);
  log(`| Orphaned storage files | ${orphanedFiles.length} |`);
  log(`| Completed, no competitor date | ${completedNoDate.length} |`);

  // Write report to docs/
  const outPath = resolve(__dirname, '..', 'docs', 'audit', `agreement-pdf-audit-${timestamp}.md`);
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`\nReport written to: ${outPath}`);
}

main().catch(console.error);
