/**
 * Sync Flash CTF data for a single competitor from MetaCTF into the database.
 *
 * Usage:
 *   npx tsx scripts/sync-flash-ctf-single.ts <synced_user_id>
 *
 * Example (Dylan Driscoll):
 *   npx tsx scripts/sync-flash-ctf-single.ts 2b5d3f48-3556-46ff-aa9a-cb7b4ffa1739
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GamePlatformClient } from '../lib/integrations/game-platform/client';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE env vars'); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false } });
const client = new GamePlatformClient();

async function main() {
  const syncedUserId = process.argv[2];
  if (!syncedUserId) {
    console.error('Usage: npx tsx scripts/sync-flash-ctf-single.ts <synced_user_id>');
    process.exit(1);
  }

  console.log(`Fetching Flash CTF progress from MetaCTF for ${syncedUserId}...`);

  const result = await client.getFlashCtfProgress({ syned_user_id: syncedUserId });
  const events = result?.flash_ctfs ?? [];

  if (events.length === 0) {
    console.log('No Flash CTF events found on MetaCTF.');
    return;
  }

  console.log(`Found ${events.length} event(s). Upserting...\n`);

  const eventRows = [];
  const solveRows = [];

  for (const entry of events) {
    const start = entry.flash_ctf_time_start_unix
      ? new Date(entry.flash_ctf_time_start_unix * 1000).toISOString()
      : null;
    const end = (entry as any).flash_ctf_time_end_unix
      ? new Date((entry as any).flash_ctf_time_end_unix * 1000).toISOString()
      : null;
    const eventId = `${entry.flash_ctf_name}:${entry.flash_ctf_time_start_unix}`;

    eventRows.push({
      synced_user_id: syncedUserId,
      event_id: eventId,
      flash_ctf_name: entry.flash_ctf_name,
      challenges_solved: entry.challenges_solved,
      points_earned: entry.points_earned,
      rank: entry.rank,
      max_points_possible: entry.max_points_possible ?? null,
      started_at: start,
      ended_at: end,
      raw_payload: entry,
    });

    for (const solve of entry.challenge_solves ?? []) {
      solveRows.push({
        synced_user_id: syncedUserId,
        challenge_solve_id: solve.challenge_solve_id,
        challenge_id: solve.challenge_id,
        challenge_title: solve.challenge_title,
        challenge_category: solve.challenge_category,
        challenge_points: solve.challenge_points,
        solved_at: solve.timestamp_unix
          ? new Date(solve.timestamp_unix * 1000).toISOString()
          : null,
        source: 'flash_ctf',
        raw_payload: solve,
      });
    }

    console.log(`  ${entry.flash_ctf_name}: ${entry.challenges_solved} challenges, ${entry.points_earned} pts, rank #${entry.rank}`);
  }

  if (eventRows.length) {
    const { error } = await supabase
      .from('game_platform_flash_ctf_events')
      .upsert(eventRows, { onConflict: 'synced_user_id,event_id' });
    if (error) {
      console.error('Failed to upsert events:', error.message);
      return;
    }
    console.log(`\nUpserted ${eventRows.length} event(s).`);
  }

  if (solveRows.length) {
    const { error } = await supabase
      .from('game_platform_challenge_solves')
      .upsert(solveRows, { onConflict: 'synced_user_id,challenge_solve_id' });
    if (error) {
      console.error('Failed to upsert challenge solves:', error.message);
      return;
    }
    console.log(`Upserted ${solveRows.length} challenge solve(s).`);
  }

  // Update sync state
  await supabase
    .from('game_platform_sync_state')
    .upsert({
      synced_user_id: syncedUserId,
      last_flash_ctf_synced_at: eventRows[0]?.started_at ?? new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      last_result: 'success',
      error_message: null,
    });

  console.log('\nDone. Dylan should now appear in the Flash CTF Summary panel.');
}

main().catch(console.error);
