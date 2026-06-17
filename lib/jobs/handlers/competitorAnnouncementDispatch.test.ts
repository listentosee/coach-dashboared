import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCompetitorAnnouncementDispatch } from './competitorAnnouncementDispatch';
import type { JobRecord } from '../types';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeJob(overrides?: Partial<JobRecord<'competitor_announcement_dispatch'>>): JobRecord<'competitor_announcement_dispatch'> {
  return {
    id: 'job-1',
    taskType: 'competitor_announcement_dispatch',
    payload: { campaignId: 'campaign-1' },
    status: 'running',
    runAt: new Date(),
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    output: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function makeCampaign(overrides?: Record<string, unknown>) {
  return {
    id: 'campaign-1',
    subject: 'Test Announcement',
    body_html: '<p>Hello</p>',
    status: 'pending',
    ...overrides,
  };
}

function makeRecipients(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `recip-${i}`,
    competitor_id: `comp-${i}`,
    email: `user${i}@example.com`,
    status: 'queued',
  }));
}

// --------------------------------------------------------------------------
// Mock Supabase builder chain
// --------------------------------------------------------------------------

type MockRow = Record<string, unknown>;

function createMockSupabase(opts: {
  campaign?: MockRow | null;
  campaignError?: { message: string } | null;
  recipients?: MockRow[];
  recipientsError?: { message: string } | null;
}) {
  const updateState = { calls: [] as { table: string; payload: unknown }[] };

  const selectSingleChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: opts.campaign ?? null,
      error: opts.campaignError ?? null,
    }),
    returns: vi.fn().mockResolvedValue({
      data: opts.recipients ?? [],
      error: opts.recipientsError ?? null,
    }),
  };

  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ error: null }),
  };

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'competitor_announcement_campaigns') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: selectSingleChain.single,
          }),
        }),
        update: vi.fn().mockImplementation((payload: unknown) => {
          updateState.calls.push({ table, payload });
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
    }
    if (table === 'competitor_announcement_recipients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              returns: vi.fn().mockResolvedValue({
                data: opts.recipients ?? [],
                error: opts.recipientsError ?? null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((payload: unknown) => {
          updateState.calls.push({ table, payload });
          return {
            in: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
  });

  return { from, _updateState: updateState } as any;
}

// --------------------------------------------------------------------------
// Mock env
// --------------------------------------------------------------------------

vi.mock('../env', () => ({
  readEnv: vi.fn((key: string) => {
    const env: Record<string, string> = {
      SENDGRID_API_KEY: 'SG.test-key',
      SENDGRID_FROM_EMAIL: 'test@example.com',
      SENDGRID_FROM_NAME: 'Test Sender',
      SENDGRID_UNSUBSCRIBE_GROUP_ID: '12345',
    };
    return env[key] ?? null;
  }),
}));

// --------------------------------------------------------------------------
// Mock fetch
// --------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('handleCompetitorAnnouncementDispatch', () => {
  it('fails when campaignId is missing', async () => {
    const job = makeJob({ payload: { campaignId: '' } });
    const supabase = createMockSupabase({ campaign: null });
    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'failed' });
  });

  it('fails when campaign is not found', async () => {
    const job = makeJob();
    const supabase = createMockSupabase({ campaign: null });
    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'failed' });
    expect((result as any).error).toContain('Campaign not found');
  });

  it('succeeds with skip when campaign is not in pending status', async () => {
    const job = makeJob();
    const supabase = createMockSupabase({ campaign: makeCampaign({ status: 'sending' }) });
    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'succeeded' });
    expect((result as any).output?.skipped).toBe(true);
  });

  it('marks campaign as sent when no queued recipients', async () => {
    const job = makeJob();
    const supabase = createMockSupabase({
      campaign: makeCampaign(),
      recipients: [],
    });
    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'succeeded' });
    expect((result as any).output?.sent).toBe(0);
  });

  it('sends batch to SendGrid and marks campaign as sending on 202', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 202,
      text: vi.fn().mockResolvedValue(''),
    });

    const recipients = makeRecipients(3);
    const job = makeJob();
    const supabase = createMockSupabase({
      campaign: makeCampaign(),
      recipients,
    });

    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'succeeded' });
    expect((result as any).output?.sent).toBe(3);

    // Verify fetch was called with correct structure
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body.personalizations).toHaveLength(3);
    expect(body.personalizations[0].to[0].email).toBe('user0@example.com');
    expect(body.personalizations[0].custom_args.email_type).toBe('competitor_announcement');
    expect(body.personalizations[0].custom_args.campaign_id).toBe('campaign-1');
    expect(body.from.email).toBe('test@example.com');
    expect(body.subject).toBe('Test Announcement');
    expect(body.asm.group_id).toBe(12345);
  });

  it('fails campaign when SendGrid returns non-202', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 400,
      text: vi.fn().mockResolvedValue('Bad Request: invalid email'),
    });

    const recipients = makeRecipients(2);
    const job = makeJob();
    const supabase = createMockSupabase({
      campaign: makeCampaign(),
      recipients,
    });

    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'failed' });
    expect((result as any).error).toContain('failed during SendGrid dispatch');
  });

  it('fails campaign on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const recipients = makeRecipients(1);
    const job = makeJob();
    const supabase = createMockSupabase({
      campaign: makeCampaign(),
      recipients,
    });

    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'failed' });
    expect((result as any).error).toContain('failed during SendGrid dispatch');
  });

  it('splits recipients into batches of 1000', async () => {
    // Return 202 for both batches
    mockFetch
      .mockResolvedValueOnce({ status: 202, text: vi.fn().mockResolvedValue('') })
      .mockResolvedValueOnce({ status: 202, text: vi.fn().mockResolvedValue('') });

    const recipients = makeRecipients(1500);
    const job = makeJob();
    const supabase = createMockSupabase({
      campaign: makeCampaign(),
      recipients,
    });

    const result = await handleCompetitorAnnouncementDispatch(job, { supabase });

    expect(result).toMatchObject({ status: 'succeeded' });
    expect((result as any).output?.sent).toBe(1500);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First batch: 1000 recipients
    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body1.personalizations).toHaveLength(1000);

    // Second batch: 500 recipients
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body2.personalizations).toHaveLength(500);
  });
});
