#!/usr/bin/env tsx
/**
 * One-time cleanup script: deletes orphaned files from the signatures storage bucket.
 *
 * Reads the orphan list from the audit report, verifies each file is still
 * unlinked to any agreement, then deletes it.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-orphaned-pdfs.ts          # dry run (default)
 *   pnpm tsx scripts/cleanup-orphaned-pdfs.ts --delete  # actually delete
 */

import { createClient } from '@supabase/supabase-js';
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
const dryRun = !process.argv.includes('--delete');

// Orphaned files from audit report 2026-02-08T20:21:29
const ORPHANED_FILES = [
  'signed/505002000000045285.pdf',
  'signed/505002000000053077.pdf',
  'signed/505002000000063139.pdf',
  'signed/505002000000063285.pdf',
  'signed/505002000000065023.pdf',
  'signed/505002000000065097.pdf',
  'signed/505002000000066135.pdf',
  'signed/505002000000066249.pdf',
  'signed/505002000000090019.pdf',
  'signed/505002000000091017.pdf',
  'signed/505002000000097015.pdf',
  'signed/505002000000101015.pdf',
  'signed/505002000000101227.pdf',
  'signed/505002000000105063.pdf',
  'signed/505002000000105157.pdf',
  'signed/505002000000106015.pdf',
  'signed/505002000000106087.pdf',
  'signed/505002000000111019.pdf',
  'signed/505002000000116015.pdf',
  'signed/505002000000118047.pdf',
  'manual/manual-upload-505002000000046141-2025-08-28T00-50-52-336Z.pdf',
  'manual/manual-upload-505002000000046141-2025-08-28T03-01-23-180Z.pdf',
  'manual/manual-upload-505002000000049019-2025-08-28T01-21-13-908Z.pdf',
  'manual/manual-upload-505002000000049019-2025-08-28T03-00-27-547Z.pdf',
  'manual/manual-upload-505002000000050015-2025-08-30T01-07-01-604Z.pdf',
  'manual/manual-upload-505002000000059017-2025-09-12T16-13-31-846Z.pdf',
  'manual/manual-upload-505002000000059017-2025-09-15T23-13-18-373Z.pdf',
  'manual/manual-upload-505002000000063015-2025-09-15T22-57-23-856Z.pdf',
  'manual/manual-upload-505002000000064041-2025-09-16T21-53-13-030Z.pdf',
  'manual/manual-upload-505002000000064105-2025-10-10T19-29-23-588Z.pdf',
  'manual/manual-upload-505002000000070015-2025-09-18T19-22-27-931Z.pdf',
  'manual/manual-upload-505002000000103079-2025-10-09T18-31-27-202Z.pdf',
  'manual/manual-upload-505002000000109015-2025-10-10T17-31-58-412Z.pdf',
  'manual/manual-upload-505002000000116077-2025-10-13T19-18-24-614Z.pdf',
  'manual/manual-upload-505002000000116145-2025-10-13T20-05-19-508Z.pdf',
  'manual/manual-upload-505002000000116285-2025-10-14T22-33-29-336Z.pdf',
  'manual/manual-upload-505002000000118131-2025-10-13T20-23-33-703Z.pdf',
  'manual/manual-upload-505002000000128015-2025-10-16T00-36-46-021Z.pdf',
  'print-ready/04ca703f-a15a-4272-ad11-a99dd11cd404.pdf',
  'print-ready/0acfa1d3-b814-4a71-a2c5-7d85b4859599.pdf',
  'print-ready/0c733d61-f702-4032-97db-6915ec2eaf11.pdf',
  'print-ready/16099ad7-9f6a-4ba9-8518-1bbf24f2bfd4.pdf',
  'print-ready/16e5a104-af5c-4d2b-983d-f9bd3bc7d5e0.pdf',
  'print-ready/176f3a6f-fa94-4784-9c50-c0082f5a754d.pdf',
  'print-ready/1d15865d-57c7-4ecb-a269-fee43fe03dd1.pdf',
  'print-ready/2441e18e-e083-4a71-9af9-2ad7cd7903d7.pdf',
  'print-ready/265b7d4c-23df-4ccc-8946-f9d47793e292.pdf',
  'print-ready/2c3d353f-d754-49de-99e3-32cbcdf408de.pdf',
  'print-ready/2cd7079e-606e-445e-98c1-7a7c1fc0c6e3.pdf',
  'print-ready/33297076-9854-4cb1-b154-074577a3632c.pdf',
  'print-ready/34e2c051-8cf8-4b96-9009-17a9daa80055.pdf',
  'print-ready/39d247e6-0a16-4e5c-9dd4-5ede237ad388.pdf',
  'print-ready/40c45d30-1786-4583-a86e-c534f70c6b7f.pdf',
  'print-ready/4a199477-e17f-449d-9d44-ec9c504439f1.pdf',
  'print-ready/652bc154-06f4-4f90-a3f3-5bd96ecba742.pdf',
  'print-ready/6a6e9a8d-a98b-4b34-8a83-fce3ac668a52.pdf',
  'print-ready/6f9951fd-3c85-438b-be9e-66c3785d247b.pdf',
  'print-ready/7779a748-b851-47dc-b972-90c7366584e3.pdf',
  'print-ready/784cd612-7d3d-473d-99db-6dab8268ecd7.pdf',
  'print-ready/7941d059-dd1f-48f7-b612-4a169515773e.pdf',
  'print-ready/8645565a-3a07-4197-894a-cbf8814b66f2.pdf',
  'print-ready/91bae4f1-2c87-4fdb-aae1-1de3a182c098.pdf',
  'print-ready/9596ce29-53af-48ae-94df-c49e633b15c4.pdf',
  'print-ready/ab974ce9-a919-4797-905a-5a17e24ac5b3.pdf',
  'print-ready/b26d447a-d59f-4f9b-9106-9e17b6d02e84.pdf',
  'print-ready/b5ebdc27-4e3d-4d88-85ff-b005f53a761f.pdf',
  'print-ready/baf948f6-a566-49b4-9451-f8142421f58e.pdf',
  'print-ready/be8cb00b-d7c5-4e17-b740-a6fb9994a10f.pdf',
  'print-ready/c3127443-4b70-4409-9440-559f386f2090.pdf',
  'print-ready/ccaa34cd-055e-43d0-8c42-58ae25ba7e92.pdf',
  'print-ready/ccad4aea-a637-460b-8f6a-0931b05c1ff1.pdf',
  'print-ready/d21b350b-84bb-43bb-ac1b-9a45b89fabca.pdf',
  'print-ready/dbe9e90f-4ce5-40bd-a1bd-7d10aa0d6b08.pdf',
  'print-ready/dcc21b61-924f-469d-9f21-cccbfc993434.pdf',
  'print-ready/dd8a1f9c-5d64-4936-b9b4-a31ce6f5ef6e.pdf',
  'print-ready/ee49f65b-f79a-43e1-af67-76d232bd0052.pdf',
  'print-ready/eeadbe65-5e93-4726-b383-d3d161834911.pdf',
  'print-ready/f818fd30-675b-48fd-9441-680d8c7ef1d2.pdf',
  'print-ready/fa85f7b3-5d44-4e04-9121-e9a4dae289bd.pdf',
  'print-ready/fb4918cc-ba0d-4c51-9ed6-9bd11381b700.pdf',
];

async function main() {
  console.log(`\n=== Orphaned PDF Cleanup (${dryRun ? 'DRY RUN' : 'LIVE DELETE'}) ===\n`);
  console.log(`Files to process: ${ORPHANED_FILES.length}\n`);

  // Verify each file is still unlinked before deleting
  const { data: agreements } = await supabase
    .from('agreements')
    .select('signed_pdf_path, manual_uploaded_path');

  const linkedPaths = new Set<string>();
  for (const a of agreements || []) {
    if (a.signed_pdf_path) linkedPaths.add(a.signed_pdf_path);
    if (a.manual_uploaded_path) linkedPaths.add(a.manual_uploaded_path);
  }

  const safeToDelete: string[] = [];
  const stillLinked: string[] = [];

  for (const path of ORPHANED_FILES) {
    if (linkedPaths.has(path)) {
      stillLinked.push(path);
    } else {
      safeToDelete.push(path);
    }
  }

  if (stillLinked.length > 0) {
    console.log(`WARNING: ${stillLinked.length} files are now linked to agreements (skipping):`);
    for (const p of stillLinked) console.log(`  SKIP  ${p}`);
    console.log();
  }

  console.log(`Safe to delete: ${safeToDelete.length} files\n`);

  if (dryRun) {
    for (const p of safeToDelete) console.log(`  [dry-run] would delete: ${p}`);
    console.log('\nRe-run with --delete to actually remove these files.');
    return;
  }

  // Delete in batches of 20 (Supabase storage API limit)
  const BATCH_SIZE = 20;
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < safeToDelete.length; i += BATCH_SIZE) {
    const batch = safeToDelete.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);

    if (error) {
      console.error(`  FAILED batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      failed += batch.length;
    } else {
      deleted += batch.length;
      for (const p of batch) console.log(`  DELETED  ${p}`);
    }
  }

  console.log(`\nDone: ${deleted} deleted, ${failed} failed, ${stillLinked.length} skipped.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
