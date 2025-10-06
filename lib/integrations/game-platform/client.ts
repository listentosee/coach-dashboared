import { z } from 'zod';

export interface GamePlatformClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  retry?: RetryOptions;
  logger?: Pick<Console, 'error' | 'warn' | 'info'>;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export type GamePlatformUserRole = 'coach' | 'user';

export interface CreateUserPayload {
  first_name: string;
  last_name: string;
  email: string;
  preferred_username: string;
  role: GamePlatformUserRole;
  syned_school_id?: string | null;
  syned_region_id?: string | null;
  syned_coach_user_id?: string | null;
  syned_user_id?: string | null;
}

export interface CreateTeamPayload {
  syned_coach_user_id: string;
  syned_team_id: string;
  team_name: string;
  affiliation: string;
  division: 'high_school' | 'middle_school' | 'college';
}

export interface AssignMemberPayload {
  syned_team_id: string;
  syned_user_id: string;
}

export interface DeleteTeamPayload {
  syned_team_id: string;
}

export interface GetTeamAssignmentsPayload {
  syned_team_id?: string | null;
}

export interface GetScoresPayload {
  syned_user_id?: string | null;
  after_time_unix?: number | null;
}

export interface GetFlashCtfProgressPayload {
  syned_user_id: string;
}

const DefaultRetry: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 2000,
};

const GenericSuccessSchema = z.object({}).passthrough();

const CreateUserResponseSchema = z.object({
  metactf_user_id: z.number(),
  metactf_username: z.string(),
  syned_user_id: z.string(),
});

const CreateTeamResponseSchema = z.object({
  metactf_team_id: z.number(),
  metactf_coach_id: z.string(),
  syned_team_id: z.string(),
  team_name: z.string(),
  division: z.enum(['high_school', 'middle_school', 'college']),
  affiliation: z.string(),
});

const TeamAssignmentResponseSchema = z.object({
  syned_team_id: z.string(),
  syned_user_id: z.string(),
});

const TeamAssignmentsResponseSchema = z.object({
  assignments: z.array(TeamAssignmentResponseSchema),
  total_count: z.number(),
});

const ChallengeSolveSchema = z.object({
  challenge_solve_id: z.number(),
  challenge_id: z.number(),
  challenge_title: z.string(),
  challenge_points: z.number(),
  challenge_category: z.string(),
  timestamp_unix: z.number(),
  challenge_retired: z.boolean(),
  nist_nice_work_roles: z.array(z.string()),
});

const ScoresResponseSchema = z.object({
  syned_user_id: z.string().nullable().optional(),
  metactf_user_id: z.number(),
  total_challenges_solved: z.number(),
  total_points: z.number(),
  last_accessed_unix_timestamp: z.number(),
  category_points: z.record(z.number()),
  challenge_solves: z.array(ChallengeSolveSchema).optional(),
});

const FlashCtfEntrySchema = z.object({
  flash_ctf_name: z.string(),
  flash_ctf_time_start_unix: z.number(),
  flash_ctf_time_end_unix: z.number().optional(), // Not in spec but included for forward compatibility
  challenges_solved: z.number(),
  points_earned: z.number(),
  rank: z.number(),
  challenge_solves: z.array(ChallengeSolveSchema), // Required per API spec
});

const FlashCtfProgressResponseSchema = z.object({
  syned_user_id: z.string(),
  flash_ctfs: z.array(FlashCtfEntrySchema),
});

export interface GamePlatformRequestConfig {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown> | null;
  query?: Record<string, string | number | null | undefined>;
  signal?: AbortSignal;
}

export class GamePlatformError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GamePlatformError';
  }
}

export class GamePlatformClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: Required<RetryOptions>;
  private readonly logger?: Pick<Console, 'error' | 'warn' | 'info'>;

  constructor(options: GamePlatformClientOptions = {}) {
    const envToken = process.env.GAME_PLATFORM_API_TOKEN;
    const envBaseUrl = process.env.GAME_PLATFORM_API_BASE_URL ?? process.env.META_CTF_BASE_URL;

    this.token = options.token ?? envToken ?? '';
    this.baseUrl = options.baseUrl ?? envBaseUrl ?? 'https://api.metactf.com/integrations/syned/v1';
    const resolvedFetch = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
    if (!resolvedFetch) {
      throw new Error('Fetch implementation unavailable. Provide options.fetchImpl when instantiating GamePlatformClient.');
    }
    this.fetchImpl = resolvedFetch;
    this.retry = {
      attempts: options.retry?.attempts ?? DefaultRetry.attempts,
      baseDelayMs: options.retry?.baseDelayMs ?? DefaultRetry.baseDelayMs,
      maxDelayMs: options.retry?.maxDelayMs ?? DefaultRetry.maxDelayMs,
    };
    this.logger = options.logger;

    if (!this.token) {
      this.logger?.warn?.('GamePlatformClient instantiated without API token. Calls will fail until configured.');
    }
  }

  async createUser(payload: CreateUserPayload, signal?: AbortSignal) {
    return this.request(CreateUserResponseSchema, '/users', { method: 'POST', body: payload, signal });
  }

  async createTeam(payload: CreateTeamPayload, signal?: AbortSignal) {
    return this.request(CreateTeamResponseSchema, '/teams', { method: 'POST', body: payload, signal });
  }

  async assignMemberToTeam(payload: AssignMemberPayload, signal?: AbortSignal) {
    return this.request(TeamAssignmentResponseSchema, '/users/assign_team', { method: 'POST', body: payload, signal });
  }

  async deleteTeam(payload: DeleteTeamPayload, signal?: AbortSignal) {
    return this.request(GenericSuccessSchema, '/teams/delete', { method: 'POST', body: payload, signal });
  }

  async getTeamAssignments(payload: GetTeamAssignmentsPayload, signal?: AbortSignal) {
    return this.request(TeamAssignmentsResponseSchema, '/users/get_team_assignments', {
      method: 'GET',
      query: { syned_team_id: payload.syned_team_id ?? undefined },
      signal,
    });
  }

  async getScores(payload: GetScoresPayload = {}, signal?: AbortSignal) {
    return this.request(ScoresResponseSchema, '/scores/get_odl_scores', {
      method: 'GET',
      query: {
        syned_user_id: payload.syned_user_id ?? undefined,
        after_time_unix: payload.after_time_unix ?? undefined,
      },
      signal,
    });
  }

  async getFlashCtfProgress(payload: GetFlashCtfProgressPayload, signal?: AbortSignal) {
    return this.request(FlashCtfProgressResponseSchema, '/scores/get_flash_ctf_progress', {
      method: 'GET',
      query: { syned_user_id: payload.syned_user_id },
      signal,
    });
  }

  async sendPasswordReset(syned_user_id: string, signal?: AbortSignal) {
    return this.request(GenericSuccessSchema, '/auth/send_password_reset_email', {
      method: 'POST',
      body: { syned_user_id },
      signal,
    });
  }

  private async request<T>(schema: z.ZodSchema<T>, path: string, config: GamePlatformRequestConfig): Promise<T> {
    const { method = 'GET', body, signal, query } = config;

    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const relativePath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(relativePath, base);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }

    if (!this.token) {
      throw new GamePlatformError('Missing GAME_PLATFORM_API_TOKEN configuration', 401, { path });
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };

    const init: RequestInit = {
      method,
      headers,
      signal,
    };

    if (body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (body !== undefined) {
      this.logger?.warn?.(`Ignoring body for GET ${path}; using query parameters instead.`);
    }

    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.retry.attempts) {
      try {
        const response = await this.fetchImpl(url, init);
        if (!response.ok) {
          const errorPayload = await this.safeParseJson(response);
          const message = typeof errorPayload?.detail === 'string'
            ? errorPayload.detail
            : `GamePlatform request failed with status ${response.status}`;
          if (response.status >= 500 && attempt < this.retry.attempts - 1) {
            await this.delay(attempt);
            attempt += 1;
            continue;
          }
          throw new GamePlatformError(message, response.status, {
            path,
            method,
            body,
            errorPayload,
          });
        }

        const data = await this.safeParseJson(response);
        return schema.parse(data);
      } catch (error) {
        lastError = error;
        if (error instanceof GamePlatformError) {
          throw error;
        }
        if (attempt < this.retry.attempts - 1) {
          await this.delay(attempt);
          attempt += 1;
          continue;
        }
        const err = error instanceof Error ? error : new Error('Unknown error during Game Platform request');
        throw new GamePlatformError(err.message, 500, { path, method, body, error });
      }
    }

    throw new GamePlatformError('Exhausted retry attempts', 500, { path, method, body, lastError });
  }

  private async safeParseJson(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      this.logger?.warn?.(`Failed to parse JSON response from ${response.url}`);
      return { raw: text };
    }
  }

  private async delay(attempt: number) {
    const delay = Math.min(
      this.retry.baseDelayMs * Math.pow(2, attempt),
      this.retry.maxDelayMs,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export type GamePlatformClientMock = Pick<GamePlatformClient, 'createUser' | 'createTeam' | 'assignMemberToTeam' | 'deleteTeam' | 'getTeamAssignments' | 'getScores' | 'sendPasswordReset'>;
