/**
 * MetaCTF's `challenge_solve_id` is NOT globally unique — it is assigned per
 * event/competition and can collide across events for the same user. Observed
 * in production: id `1819` appeared for one competitor under both an
 * "Inland Empire Mayors Cyber Cup 2026" solve and an "April 2026 Flash CTF"
 * solve.
 *
 * The `game_platform_challenge_solves` table is keyed on
 * `(synced_user_id, challenge_solve_id)`. A single upsert batch that contains
 * the same `challenge_solve_id` twice fails with Postgres error
 * "ON CONFLICT DO UPDATE command cannot affect row a second time", which aborts
 * the whole competitor sync. De-duplicate solve rows by `challenge_solve_id`
 * before upserting so a colliding upstream payload can't break the batch.
 *
 * Last write wins — the most recently iterated event's record is kept.
 */
export function dedupeSolveRowsByChallengeSolveId<T extends { challenge_solve_id: unknown }>(
  rows: T[],
): T[] {
  const byId = new Map<unknown, T>();
  for (const row of rows) {
    byId.set(row.challenge_solve_id, row);
  }
  return [...byId.values()];
}
