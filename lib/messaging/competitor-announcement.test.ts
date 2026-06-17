import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRecipients } from './competitor-announcement';

// --------------------------------------------------------------------------
// Mock Supabase client
// --------------------------------------------------------------------------

function createMockClient(rows: Record<string, unknown>[], error: { message: string } | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: rows, error }),
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any;
}

describe('resolveRecipients', () => {
  it('returns all competitors with valid emails', async () => {
    const client = createMockClient([
      { id: 'c1', game_platform_onboarding_email: 'alice@example.com', email_personal: null, email_school: null },
      { id: 'c2', game_platform_onboarding_email: null, email_personal: 'bob@example.com', email_school: null },
      { id: 'c3', game_platform_onboarding_email: null, email_personal: null, email_school: 'carol@school.edu' },
    ]);

    const result = await resolveRecipients(client);

    expect(result.recipients).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.recipients.map((r) => r.email)).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@school.edu',
    ]);
  });

  it('follows email precedence: onboarding > personal > school', async () => {
    const client = createMockClient([
      {
        id: 'c1',
        game_platform_onboarding_email: 'onboarding@example.com',
        email_personal: 'personal@example.com',
        email_school: 'school@example.com',
      },
    ]);

    const result = await resolveRecipients(client);

    expect(result.recipients[0].email).toBe('onboarding@example.com');
  });

  it('skips competitors with no email', async () => {
    const client = createMockClient([
      { id: 'c1', game_platform_onboarding_email: null, email_personal: null, email_school: null },
    ]);

    const result = await resolveRecipients(client);

    expect(result.recipients).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toEqual({ competitorId: 'c1', reason: 'no_email' });
  });

  it('skips competitors with invalid email format', async () => {
    const client = createMockClient([
      { id: 'c1', game_platform_onboarding_email: 'not-an-email', email_personal: null, email_school: null },
    ]);

    const result = await resolveRecipients(client);

    expect(result.recipients).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toEqual({ competitorId: 'c1', reason: 'invalid_email_format' });
  });

  it('handles mix of valid, invalid, and missing emails', async () => {
    const client = createMockClient([
      { id: 'c1', game_platform_onboarding_email: 'good@example.com', email_personal: null, email_school: null },
      { id: 'c2', game_platform_onboarding_email: 'bad-email', email_personal: null, email_school: null },
      { id: 'c3', game_platform_onboarding_email: null, email_personal: null, email_school: null },
      { id: 'c4', game_platform_onboarding_email: null, email_personal: 'also-good@test.org', email_school: null },
    ]);

    const result = await resolveRecipients(client);

    expect(result.recipients).toHaveLength(2);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.find((s) => s.competitorId === 'c2')?.reason).toBe('invalid_email_format');
    expect(result.skipped.find((s) => s.competitorId === 'c3')?.reason).toBe('no_email');
  });

  it('returns empty arrays when no competitors exist', async () => {
    const client = createMockClient([]);

    const result = await resolveRecipients(client);

    expect(result.recipients).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('throws on Supabase query error', async () => {
    const client = createMockClient([], { message: 'Connection refused' });

    await expect(resolveRecipients(client)).rejects.toThrow('Failed to query competitors');
  });
});
