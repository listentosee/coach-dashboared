#!/usr/bin/env tsx

import 'dotenv/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { createClient } from '@supabase/supabase-js';
import { normalizeSchoolGeo } from '@/lib/analytics/school-geo';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_GEO_MODEL || 'gpt-4o-mini';
const dryRun = process.argv.includes('--dry-run');
const refreshAll = process.argv.includes('--refresh-all');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] || '0', 10) : 0;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!openaiApiKey) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const GeoSchema = z.object({
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

type GeoResult = z.infer<typeof GeoSchema>;

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: openaiApiKey });

function buildGeoQuery(input: ReturnType<typeof normalizeSchoolGeo>) {
  const primary = [input.street_address, input.city, input.state, input.zip].filter(Boolean);
  const fallback = primary.length ? [] : [input.county].filter(Boolean);

  return [...primary, ...fallback]
    .filter(Boolean)
    .join(', ');
}

async function geocodeQuery(query: string): Promise<GeoResult> {
  const completion = await openai.chat.completions.parse({
    model: openaiModel,
    messages: [
      {
        role: 'system',
        content:
          'Return the best estimated latitude and longitude for the provided address-like query. Use decimal degrees. If you cannot make a reasonable match, return null for both values.',
      },
      {
        role: 'user',
        content: [
          `Address query: ${query}`,
          'Context:',
          '- This is for correcting stored school coordinates in an admin analytics map.',
          '- Use only the provided address-like input.',
          '- Return only the requested JSON structure.',
        ].join('\n'),
      },
    ],
    response_format: zodResponseFormat(GeoSchema, 'school_geo'),
  });

  return completion.choices[0]?.message.parsed ?? { lat: null, lon: null };
}

async function main() {
  const runMode = dryRun ? 'DRY RUN' : 'LIVE';
  const scope = refreshAll ? 'ALL JSON PAYLOADS' : 'ONLY ROWS WITH ANY MISSING LAT/LON';
  console.log(`\n=== School Geo JSON Recalc (${runMode} / ${scope}) ===`);

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, school_name, school_geo')
    .eq('role', 'coach')
    .not('school_geo', 'is', null)
    .order('created_at', { ascending: true });

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const coaches = (rows || []).filter((row) => {
    const geo = normalizeSchoolGeo(row.school_geo);
    return refreshAll || geo.lat === null || geo.lon === null;
  });

  console.log(`Candidates: ${coaches.length}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const coach of coaches) {
    const label = coach.full_name || coach.email || coach.id;
    const schoolGeo = normalizeSchoolGeo(coach.school_geo);
    const geoQuery = buildGeoQuery(schoolGeo);

    if (!geoQuery) {
      skipped += 1;
      console.log(`  [SKIP] ${label} — no address fields present in school_geo`);
      continue;
    }

    try {
      const result = await geocodeQuery(geoQuery);
      if (typeof result.lat !== 'number' || typeof result.lon !== 'number') {
        skipped += 1;
        console.log(`  [SKIP] ${label} — no coordinates for "${geoQuery}"`);
        continue;
      }

      const nextSchoolGeo = {
        ...schoolGeo,
        lat: result.lat,
        lon: result.lon,
      };

      if (dryRun) {
        console.log(`  [DRY] ${label} — ${geoQuery} => ${JSON.stringify(nextSchoolGeo)}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ school_geo: nextSchoolGeo })
        .eq('id', coach.id);

      if (updateError) {
        failed += 1;
        console.log(`  [FAIL] ${label} — ${updateError.message}`);
        continue;
      }

      updated += 1;
      console.log(`  [OK] ${label} — ${geoQuery} => ${JSON.stringify(nextSchoolGeo)}`);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  [FAIL] ${label} — ${message}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
}

main().catch((error) => {
  console.error('JSON-based recalc failed:', error);
  process.exit(1);
});
