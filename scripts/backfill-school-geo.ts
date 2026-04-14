#!/usr/bin/env tsx

import 'dotenv/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_GEO_MODEL || 'gpt-4o-mini';
const mondayApiToken = process.env.MONDAY_API_TOKEN || '';
const mondayBoardId = process.env.MONDAY_BOARD_ID || '';
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

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: openaiApiKey });

const GeoSchema = z.object({
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

type GeoResult = z.infer<typeof GeoSchema>;

type MondayAddressColumns = {
  streetAddress?: string;
  mailingAddress?: string;
  city?: string;
  state?: string;
  county?: string;
  zip?: string;
};

type MondayColumnMap = {
  streetAddress?: string;
  mailingAddress?: string;
  city?: string;
  state?: string;
  county?: string;
  zip?: string;
};

const mondayColumnTitles: Record<keyof MondayColumnMap, string> = {
  streetAddress: 'Street Address',
  mailingAddress: 'Mailing Address',
  city: 'City',
  state: 'State',
  county: 'County',
  zip: 'Zip',
};

let mondayColumnMapPromise: Promise<MondayColumnMap | null> | null = null;

function buildSchoolQuery(schoolName: string, region: string | null) {
  const scopedRegion = region?.trim() ? `${region.trim()}, ` : '';
  return `${schoolName.trim()}, ${scopedRegion}California`;
}

function buildAddressQuery(address: MondayAddressColumns) {
  return [address.streetAddress, address.mailingAddress, address.city, address.state, address.zip]
    .map((part) => part?.trim() || '')
    .filter(Boolean)
    .join(', ');
}

async function mondayFetch<T>(query: string): Promise<T> {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      Authorization: mondayApiToken,
      'Content-Type': 'application/json',
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Monday.com API error: ${response.status}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'Unknown Monday.com API error');
  }

  if (!json.data) {
    throw new Error('Missing Monday.com response data');
  }

  return json.data;
}

async function getMondayColumnMap(): Promise<MondayColumnMap | null> {
  if (!mondayApiToken || !mondayBoardId) {
    return null;
  }

  if (!mondayColumnMapPromise) {
    mondayColumnMapPromise = (async () => {
      const data = await mondayFetch<{ boards: Array<{ columns: Array<{ id: string; title: string }> }> }>(
        `query { boards(ids: [${mondayBoardId}]) { columns { id title } } }`
      );

      const columns = data.boards[0]?.columns || [];
      const byTitle = new Map(columns.map((column) => [column.title, column.id]));

      return {
        streetAddress: byTitle.get(mondayColumnTitles.streetAddress),
        mailingAddress: byTitle.get(mondayColumnTitles.mailingAddress),
        city: byTitle.get(mondayColumnTitles.city),
        state: byTitle.get(mondayColumnTitles.state),
        county: byTitle.get(mondayColumnTitles.county),
        zip: byTitle.get(mondayColumnTitles.zip),
      };
    })();
  }

  return mondayColumnMapPromise;
}

async function getMondayAddress(mondayCoachId: string): Promise<MondayAddressColumns | null> {
  const columnMap = await getMondayColumnMap();
  if (!columnMap) {
    return null;
  }

  const data = await mondayFetch<{ items: Array<{ column_values: Array<{ id: string; text: string | null }> }> }>(
    `query { items(ids:[${mondayCoachId}]) { column_values { id text } } }`
  );

  const item = data.items[0];
  if (!item) {
    return null;
  }

  const byId = new Map(item.column_values.map((column) => [column.id, column.text || '']));

  return {
    streetAddress: columnMap.streetAddress ? byId.get(columnMap.streetAddress) || '' : '',
    mailingAddress: columnMap.mailingAddress ? byId.get(columnMap.mailingAddress) || '' : '',
    city: columnMap.city ? byId.get(columnMap.city) || '' : '',
    state: columnMap.state ? byId.get(columnMap.state) || '' : '',
    county: columnMap.county ? byId.get(columnMap.county) || '' : '',
    zip: columnMap.zip ? byId.get(columnMap.zip) || '' : '',
  };
}

function cleanAddressPart(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeState(value?: string) {
  const cleaned = cleanAddressPart(value);
  if (!cleaned) return null;
  if (/^\d{5}(?:-\d{4})?$/.test(cleaned)) return null;
  if (/^[A-Z]{2}$/.test(cleaned)) return cleaned;
  if (/^california$/i.test(cleaned)) return 'California';
  return null;
}

function normalizeZip(value?: string) {
  const cleaned = cleanAddressPart(value);
  if (!cleaned) return null;
  const match = cleaned.match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '').trim();
}

function parseStructuredAddress(rawAddress: string | null) {
  if (!rawAddress) {
    return {
      streetAddress: null,
      city: null,
      state: null,
      zip: null,
    };
  }

  const normalized = normalizeWhitespace(rawAddress);
  if (!normalized) {
    return {
      streetAddress: null,
      city: null,
      state: null,
      zip: null,
    };
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toLowerCase() !== 'united states');

  const singleLine = lines.join(', ').replace(/\s+/g, ' ').trim();
  const match = singleLine.match(/^(.*?)(?:,\s*|\s+)([A-Za-z .'-]+?)(?:,\s*|\s+)([A-Z]{2}|California)\s+(\d{5}(?:-\d{4})?)$/i);

  if (match) {
    const [, street, city, state, zip] = match;
    return {
      streetAddress: cleanAddressPart(street),
      city: cleanAddressPart(city),
      state: cleanAddressPart(state),
      zip: normalizeZip(zip),
    };
  }

  const cityZipOnlyMatch = singleLine.match(/^(.*?)(?:,\s*|\s+)([A-Za-z .'-]+?)(?:,\s*|\s+)(\d{5}(?:-\d{4})?)$/i);
  if (cityZipOnlyMatch) {
    const [, street, city, zip] = cityZipOnlyMatch;
    return {
      streetAddress: cleanAddressPart(street),
      city: cleanAddressPart(city),
      state: null,
      zip: normalizeZip(zip),
    };
  }

  if (lines.length >= 2) {
    const street = cleanAddressPart(lines[0]);
    const cityStateLine = lines[1].match(/^([A-Za-z .'-]+),?\s+([A-Z]{2}|California)\s+(\d{5}(?:-\d{4})?)$/i);
    if (cityStateLine) {
      return {
        streetAddress: street,
        city: cleanAddressPart(cityStateLine[1]),
        state: cleanAddressPart(cityStateLine[2]),
        zip: normalizeZip(cityStateLine[3]),
      };
    }
  }

  return {
    streetAddress: cleanAddressPart(lines[0] || normalized),
    city: null,
    state: null,
    zip: normalizeZip(normalized),
  };
}

async function geocodeQuery(query: string, source: 'school' | 'address'): Promise<GeoResult> {
  const sourceHint =
    source === 'address'
      ? 'The input is a street or mailing address. Prefer the exact address match.'
      : 'The input is a school name. Use the best reasonable campus match.';

  const completion = await openai.chat.completions.parse({
    model: openaiModel,
    messages: [
      {
        role: 'system',
        content:
          'Return the best estimated latitude and longitude for the provided school or address. Use decimal degrees. If you cannot make a reasonable match, return null for both values.',
      },
      {
        role: 'user',
        content: [
          `School query: ${query}`,
          'Context:',
          '- This is for plotting participating schools on an admin analytics map.',
          `- ${sourceHint}`,
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
  const scope = refreshAll ? 'REFRESH ALL' : 'NULL ONLY';
  console.log(`\n=== School Geo Backfill (${runMode} / ${scope}) ===`);

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, school_name, region, monday_coach_id, school_geo')
    .eq('role', 'coach')
    .not('school_name', 'is', null)
    .order('created_at', { ascending: true });

  if (!refreshAll) {
    query = query.is('school_geo', null);
  }

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error } = await query;
  if (error) {
    throw error;
  }

  const coaches = rows || [];
  console.log(`Candidates: ${coaches.length}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const coach of coaches) {
    const label = coach.full_name || coach.email || coach.id;
    const schoolName = (coach.school_name || '').trim();

    if (!schoolName) {
      skipped += 1;
      console.log(`  [SKIP] ${label} — missing school_name`);
      continue;
    }

    try {
      let geoQuery = buildSchoolQuery(schoolName, coach.region || null);
      let querySource: 'school' | 'address' = 'school';
      const mondayAddress = coach.monday_coach_id ? await getMondayAddress(coach.monday_coach_id) : null;

      if (mondayAddress) {
        const addressQuery = buildAddressQuery(mondayAddress);

        if (addressQuery) {
          geoQuery = addressQuery;
          querySource = 'address';
        }
      }

      const result = await geocodeQuery(geoQuery, querySource);
      if (typeof result.lat !== 'number' || typeof result.lon !== 'number') {
        skipped += 1;
        console.log(`  [SKIP] ${label} — no coordinates for "${geoQuery}"`);
        continue;
      }

      const parsedAddress = parseStructuredAddress(
        cleanAddressPart(mondayAddress?.streetAddress) || cleanAddressPart(mondayAddress?.mailingAddress)
      );

      const schoolGeo = {
        lat: result.lat,
        lon: result.lon,
        street_address: parsedAddress.streetAddress,
        city: cleanAddressPart(mondayAddress?.city) || parsedAddress.city,
        state: normalizeState(mondayAddress?.state) || parsedAddress.state,
        county: cleanAddressPart(mondayAddress?.county),
        zip: normalizeZip(mondayAddress?.zip) || parsedAddress.zip,
      };

      if (dryRun) {
        console.log(`  [DRY] ${label} — ${geoQuery} => ${JSON.stringify(schoolGeo)}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ school_geo: schoolGeo })
        .eq('id', coach.id);

      if (updateError) {
        failed += 1;
        console.log(`  [FAIL] ${label} — ${updateError.message}`);
        continue;
      }

      updated += 1;
      console.log(`  [OK] ${label} — ${geoQuery} => ${JSON.stringify(schoolGeo)}`);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  [FAIL] ${label} — ${message}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
