import { describe, it, expect } from 'vitest';
import { dedupeSolveRowsByChallengeSolveId } from './dedupe';

describe('dedupeSolveRowsByChallengeSolveId', () => {
  it('collapses rows that share a challenge_solve_id (the MetaCTF cross-event collision that wedged the sync)', () => {
    // Real-world case: competitor 37ac2761 had challenge_solve_id 1819 under
    // both "IE Mayors Cyber Cup 2026" (Nonceless) and "April 2026 Flash CTF"
    // (Name Game). Upserting both in one batch on (synced_user_id,
    // challenge_solve_id) triggers Postgres "ON CONFLICT DO UPDATE command
    // cannot affect row a second time".
    const rows = [
      { challenge_solve_id: 1819, challenge_title: 'Nonceless', source: 'flash_ctf' },
      { challenge_solve_id: 1820, challenge_title: 'Other', source: 'flash_ctf' },
      { challenge_solve_id: 1819, challenge_title: 'Name Game', source: 'flash_ctf' },
    ];

    const result = dedupeSolveRowsByChallengeSolveId(rows);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.challenge_solve_id).sort()).toEqual([1819, 1820]);
    // Last write wins.
    expect(result.find((r) => r.challenge_solve_id === 1819)?.challenge_title).toBe('Name Game');
  });

  it('returns rows unchanged when there are no duplicates', () => {
    const rows = [{ challenge_solve_id: 1 }, { challenge_solve_id: 2 }, { challenge_solve_id: 3 }];
    expect(dedupeSolveRowsByChallengeSolveId(rows)).toHaveLength(3);
  });

  it('handles an empty array', () => {
    expect(dedupeSolveRowsByChallengeSolveId([])).toEqual([]);
  });
});
