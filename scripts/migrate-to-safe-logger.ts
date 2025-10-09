#!/usr/bin/env tsx
/**
 * Script to migrate all API routes from console.log/error/warn to safe logger
 * This prevents PII exposure in logs (FERPA Issue #2)
 *
 * Usage: npx tsx scripts/migrate-to-safe-logger.ts
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const API_DIR = path.join(process.cwd(), 'app/api');

// Track statistics
let filesProcessed = 0;
let filesModified = 0;
let replacementsMade = 0;

/**
 * Process a single file to replace console logging with safe logger
 */
function processFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  let modified = content;
  let fileChanged = false;
  let fileReplacements = 0;

  // Check if file already has safe logger import
  const hasSafeLogger = content.includes("from '@/lib/logging/safe-logger'");

  // Check if file has any console.log/error/warn calls
  const hasConsoleCalls = /console\.(log|error|warn|info|debug)/.test(content);

  if (!hasConsoleCalls) {
    filesProcessed++;
    return; // Skip files without console calls
  }

  // Add import if not present
  if (!hasSafeLogger) {
    // Find the last import statement
    const importRegex = /import .+ from .+;/g;
    const imports = content.match(importRegex);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      modified = modified.replace(
        lastImport,
        `${lastImport}\nimport { logger } from '@/lib/logging/safe-logger';`
      );
      fileChanged = true;
    }
  }

  // Replace console.error calls - these are most critical
  modified = modified.replace(
    /console\.error\((.*?)\);/g,
    (match, args) => {
      fileReplacements++;
      // Simple case: single string
      if (args.match(/^['"`].*['"`]$/)) {
        return `logger.error(${args});`;
      }
      // Has multiple arguments - convert to message + context
      const parts = args.split(',').map((s: string) => s.trim());
      if (parts.length === 1) {
        return `logger.error(${parts[0]});`;
      }
      const message = parts[0];
      const context = parts.slice(1).join(', ');
      return `logger.error(${message}, { context: ${context} });`;
    }
  );

  // Replace console.warn calls
  modified = modified.replace(
    /console\.warn\((.*?)\);/g,
    (match, args) => {
      fileReplacements++;
      const parts = args.split(',').map((s: string) => s.trim());
      if (parts.length === 1) {
        return `logger.warn(${parts[0]});`;
      }
      const message = parts[0];
      const context = parts.slice(1).join(', ');
      return `logger.warn(${message}, { context: ${context} });`;
    }
  );

  // Replace console.log calls
  modified = modified.replace(
    /console\.log\((.*?)\);/g,
    (match, args) => {
      fileReplacements++;
      const parts = args.split(',').map((s: string) => s.trim());
      if (parts.length === 1) {
        return `logger.info(${parts[0]});`;
      }
      const message = parts[0];
      const context = parts.slice(1).join(', ');
      return `logger.info(${message}, { context: ${context} });`;
    }
  );

  // Replace console.info calls
  modified = modified.replace(
    /console\.info\((.*?)\);/g,
    (match, args) => {
      fileReplacements++;
      const parts = args.split(',').map((s: string) => s.trim());
      if (parts.length === 1) {
        return `logger.info(${parts[0]});`;
      }
      const message = parts[0];
      const context = parts.slice(1).join(', ');
      return `logger.info(${message}, { context: ${context} });`;
    }
  );

  // Replace console.debug calls
  modified = modified.replace(
    /console\.debug\((.*?)\);/g,
    (match, args) => {
      fileReplacements++;
      const parts = args.split(',').map((s: string) => s.trim());
      if (parts.length === 1) {
        return `logger.debug(${parts[0]});`;
      }
      const message = parts[0];
      const context = parts.slice(1).join(', ');
      return `logger.debug(${message}, { context: ${context} });`;
    }
  );

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, 'utf-8');
    filesModified++;
    replacementsMade += fileReplacements;
    console.log(`✓ Modified: ${path.relative(API_DIR, filePath)} (${fileReplacements} replacements)`);
  }

  filesProcessed++;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Scanning API routes for console logging...\n');

  // Find all TypeScript files in app/api
  const files = await glob('app/api/**/*.ts', {
    ignore: ['**/node_modules/**'],
    absolute: true,
  });

  console.log(`Found ${files.length} API route files\n`);
  console.log('📝 Processing files...\n');

  for (const file of files) {
    try {
      processFile(file);
    } catch (error) {
      console.error(`✗ Error processing ${file}:`, error);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${filesProcessed}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Total replacements: ${replacementsMade}`);
  console.log('='.repeat(60));

  if (filesModified > 0) {
    console.log('\n✅ Migration complete! All console.* calls have been replaced with safe logger.');
    console.log('\n⚠️  IMPORTANT: Please review the changes and test thoroughly.');
    console.log('   Some complex logging may need manual adjustment.');
  } else {
    console.log('\n✨ No changes needed - all files are already using safe logger!');
  }
}

main().catch(console.error);
