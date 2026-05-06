import { describe, it, expect } from 'vitest';
import { summarizeChallengeBreakdown } from './challenge-breakdown';

describe('summarizeChallengeBreakdown', () => {
  it('returns zeros for an empty input', () => {
    const result = summarizeChallengeBreakdown([]);
    expect(result.odl).toBe(0);
    expect(result.ctf).toBe(0);
    expect(result.total).toBe(0);
    expect(result.perUser.size).toBe(0);
  });

  it('counts ODL and Flash CTF rows separately and sums them', () => {
    const rows = [
      { synced_user_id: 'u1', source: 'odl' },
      { synced_user_id: 'u1', source: 'odl' },
      { synced_user_id: 'u1', source: 'flash_ctf' },
      { synced_user_id: 'u2', source: 'flash_ctf' },
      { synced_user_id: 'u2', source: 'flash_ctf' },
    ];
    const result = summarizeChallengeBreakdown(rows);
    expect(result.odl).toBe(2);
    expect(result.ctf).toBe(3);
    expect(result.total).toBe(5);
    expect(result.perUser.get('u1')).toEqual({ odl: 2, ctf: 1, total: 3 });
    expect(result.perUser.get('u2')).toEqual({ odl: 0, ctf: 2, total: 2 });
  });

  it('treats unknown or null sources as ODL (default platform bucket)', () => {
    const rows = [
      { synced_user_id: 'u1', source: null },
      { synced_user_id: 'u1', source: 'something_else' },
      { synced_user_id: 'u1', source: 'flash_ctf' },
    ];
    const result = summarizeChallengeBreakdown(rows);
    expect(result.odl).toBe(2);
    expect(result.ctf).toBe(1);
    expect(result.total).toBe(3);
  });
});
