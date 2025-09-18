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

export interface GetTeamAssignmentsPayload {
  syned_team_id: string;
}

export interface GetScoresPayload {
  syned_team_id?: string;
}

const DefaultRetry: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 2000,
};

const GenericSuccessSchema = z.object({}).passthrough();

const CreateUserResponseSchema = z
  .object({ syned_user_id: z.string().optional() })
  .passthrough();

const CreateTeamResponseSchema = z
  .object({ syned_team_id: z.string().optional() })
  .passthrough();

const AssignMemberResponseSchema = GenericSuccessSchema;
const TeamAssignmentsResponseSchema = GenericSuccessSchema;
const ScoresResponseSchema = GenericSuccessSchema;

export interface GamePlatformRequestConfig {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown> | null;
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
    const envBaseUrl = process.env.GAME_PLATFORM_API_BASE_URL;

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
    return this.request(AssignMemberResponseSchema, '/users/assign_team', { method: 'POST', body: payload, signal });
  }

  async getTeamAssignments(payload: GetTeamAssignmentsPayload, signal?: AbortSignal) {
    return this.request(TeamAssignmentsResponseSchema, '/users/get_team_assignments', { method: 'GET', body: payload, signal });
  }

  async getScores(payload: GetScoresPayload = {}, signal?: AbortSignal) {
    return this.request(ScoresResponseSchema, '/scores/get_odl_scores', { method: 'GET', body: Object.keys(payload).length ? payload : undefined, signal });
  }

  async sendPasswordReset(syned_user_id: string, signal?: AbortSignal) {
    return this.request(GenericSuccessSchema, '/auth/send_password_reset_email', {
      method: 'POST',
      body: { syned_user_id },
      signal,
    });
  }

  private async request<T>(schema: z.ZodSchema<T>, path: string, config: GamePlatformRequestConfig): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const { method = 'GET', body, signal } = config;

    if (!this.token) {
      throw new GamePlatformError('Missing GAME_PLATFORM_API_TOKEN configuration', 401, { path });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };

    const init: RequestInit = {
      method,
      headers,
      signal,
    };

    if (body !== undefined) {
      // Some endpoints expect GET with JSON body; support it but log a warning.
      if (method === 'GET') {
        this.logger?.warn?.(`GET ${path} invoked with a JSON body. Verify API contract.`);
      }
      init.body = JSON.stringify(body);
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

export type GamePlatformClientMock = Pick<GamePlatformClient, 'createUser' | 'createTeam' | 'assignMemberToTeam' | 'getTeamAssignments' | 'getScores' | 'sendPasswordReset'>;
