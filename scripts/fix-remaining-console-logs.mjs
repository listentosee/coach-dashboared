#!/usr/bin/env node
/**
 * Batch fix remaining console.error/warn calls in competitors API routes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const filesToFix = [
  'app/api/competitors/bulk-import/route.ts',
  'app/api/competitors/check-duplicates/route.ts',
  'app/api/competitors/route.ts',
  'app/api/competitors/paged/route.ts',
  'app/api/competitors/[id]/regenerate-link/route.ts',
  'app/api/competitors/[id]/toggle-active/route.ts',
  'app/api/competitors/profile/[token]/route.ts',
  'app/api/competitors/profile/[token]/update/route.ts',
  'app/api/competitors/profile/[token]/send-participation/route.ts',
  'app/api/competitors/maintenance/update-statuses/route.ts',
];

let totalFixed = 0;

filesToFix.forEach(relativePath => {
  const filePath = path.join(projectRoot, relativePath);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${relativePath} (not found)`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Check if already has logger import
  const hasLoggerImport = content.includes("from '@/lib/logging/safe-logger'");

  // Add import if needed
  if (!hasLoggerImport && /console\.(error|warn)/.test(content)) {
    // Find last import line
    const importMatch = content.match(/(import .+ from .+;\n)+/);
    if (importMatch) {
      const lastImportEnd = importMatch[0].length;
      content = content.slice(0, lastImportEnd) +
                "import { logger } from '@/lib/logging/safe-logger';\n" +
                content.slice(lastImportEnd);
    }
  }

  // Replace console.error with logger.error
  content = content.replace(
    /console\.error\('([^']+)',\s*(\w+)\);/g,
    (match, msg, errorVar) => `logger.error('${msg}', { error: ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}) });`
  );

  content = content.replace(
    /console\.error\("([^"]+)",\s*(\w+)\);/g,
    (match, msg, errorVar) => `logger.error("${msg}", { error: ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}) });`
  );

  // Replace console.warn with logger.warn
  content = content.replace(
    /console\.warn\('([^']+)',\s*(\w+)\);/g,
    (match, msg, errorVar) => `logger.warn('${msg}', { error: ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}) });`
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Fixed ${relativePath}`);
    totalFixed++;
  } else {
    console.log(`ℹ️  No changes needed for ${relativePath}`);
  }
});

console.log(`\n✨ Batch fix complete! Fixed ${totalFixed} files.`);
