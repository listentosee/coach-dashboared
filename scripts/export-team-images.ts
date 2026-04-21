/**
 * Export all team images from Supabase Storage, organized by division / coach.
 *
 * Usage:
 *   pnpm tsx scripts/export-team-images.ts
 *
 * Output:
 *   team-images-export/
 *     Division/            (College, High-School, Middle-School, ROP, Unknown)
 *       Coach-Name/
 *         Team-Name.png
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const OUTPUT_DIR = path.join(process.cwd(), 'team-images-export');

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getExtension(imageUrl: string): string {
  const ext = path.extname(imageUrl).toLowerCase();
  return ext || '.png';
}

function coachDirName(row: { coach_name: string | null; coach_email: string | null; coach_id: string }): string {
  if (row.coach_name) return sanitizeName(row.coach_name);
  if (row.coach_email) return sanitizeName(row.coach_email);
  return `unknown-${row.coach_id.slice(0, 8)}`;
}

const DIVISION_LABELS: Record<string, string> = {
  college: 'College',
  high_school: 'High-School',
  middle_school: 'Middle-School',
  rop: 'ROP',
};

function divisionDirName(division: string | null): string {
  if (!division) return 'Unknown-Division';
  const label = DIVISION_LABELS[division.toLowerCase()];
  return label ?? sanitizeName(division);
}

async function main() {
  // Query teams with images, joined with coach profiles
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`
      id,
      name,
      image_url,
      coach_id,
      division,
      profiles!teams_coach_id_fkey ( full_name, first_name, last_name, email )
    `)
    .not('image_url', 'is', null);

  if (error) {
    console.error('Failed to query teams:', error.message);
    process.exit(1);
  }

  if (!teams || teams.length === 0) {
    console.log('No teams with images found.');
    return;
  }

  console.log(`Found ${teams.length} team(s) with images.\n`);

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let exported = 0;
  let skipped = 0;

  for (const team of teams) {
    const profile = team.profiles as unknown as {
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
    const coachName = profile?.full_name
      ?? (profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : null);
    const coachEmail = profile?.email ?? null;
    const division = (team as { division: string | null }).division ?? null;

    const divisionDir = divisionDirName(division);
    const coachDir = coachDirName({ coach_name: coachName, coach_email: coachEmail, coach_id: team.coach_id });
    const ext = getExtension(team.image_url!);
    const fileName = `${sanitizeName(team.name)}${ext}`;
    const fullDir = path.join(OUTPUT_DIR, divisionDir, coachDir);
    const filePath = path.join(fullDir, fileName);

    // Download from storage
    const { data: blob, error: dlError } = await supabase.storage
      .from('team-images')
      .download(team.image_url!);

    if (dlError || !blob) {
      console.log(
        `  [SKIP] "${team.name}" (division: ${division ?? 'unknown'}, coach: ${coachName ?? coachEmail ?? 'unknown'}) — ${dlError?.message ?? 'empty response'}`,
      );
      skipped++;
      continue;
    }

    // Write to disk
    fs.mkdirSync(fullDir, { recursive: true });
    const buffer = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    console.log(`  [OK] ${divisionDir}/${coachDir}/${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
    exported++;
  }

  console.log(`\nDone: ${exported} exported, ${skipped} skipped`);
}

main().catch(console.error);
