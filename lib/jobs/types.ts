import type { SupabaseClient } from '@supabase/supabase-js';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobTaskType = 'game_platform_sync';

export interface GamePlatformSyncPayload {
  dryRun?: boolean;
  coachId?: string | null;
}

export interface JobPayloadMap {
  game_platform_sync: GamePlatformSyncPayload;
}

export type JobPayload<T extends JobTaskType = JobTaskType> = JobPayloadMap[T];

export interface JobRecord<T extends JobTaskType = JobTaskType> {
  id: string;
  taskType: T;
  payload: JobPayload<T>;
  status: JobStatus;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  output: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface JobContext {
  supabase: SupabaseClient<any, any, any>;
  logger?: Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;
}

export interface JobSuccessResult {
  status: 'succeeded';
  output?: unknown;
}

export interface JobFailureResult {
  status: 'failed';
  error: string;
  retryInMs?: number; // milliseconds
}

export type JobResult = JobSuccessResult | JobFailureResult;

export type JobHandler<T extends JobTaskType = JobTaskType> = (
  job: JobRecord<T>,
  context: JobContext
) => Promise<JobResult | void>;
