import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleSupabaseClient } from './supabase';
import type { JobPayload, JobRecord, JobResult, JobStatus, JobTaskType } from './types';

interface EnqueueOptions<T extends JobTaskType> {
  taskType: T;
  payload?: JobPayload<T>;
  runAt?: Date;
  maxAttempts?: number;
  client?: SupabaseClient<any, any, any>;
}

interface ClaimOptions {
  limit?: number;
  client?: SupabaseClient<any, any, any>;
}

interface MarkSuccessOptions {
  jobId: string;
  output?: unknown;
  client?: SupabaseClient<any, any, any>;
}

interface MarkFailureOptions {
  jobId: string;
  error: string;
  retryInMs?: number;
  client?: SupabaseClient<any, any, any>;
}

type JobRow = {
  id: string;
  task_type: JobTaskType;
  payload: unknown;
  status: JobStatus;
  run_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  output: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    taskType: row.task_type,
    payload: (row.payload ?? {}) as any,
    status: row.status,
    runAt: new Date(row.run_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    output: row.output,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export async function enqueueJob<T extends JobTaskType>(options: EnqueueOptions<T>): Promise<JobRecord<T>> {
  const { taskType, payload, runAt, maxAttempts, client } = options;
  const supabase = client ?? getServiceRoleSupabaseClient();

  const { data, error } = await supabase.rpc<JobRow>('job_queue_enqueue', {
    p_task_type: taskType,
    p_payload: payload ?? {},
    p_run_at: runAt ? runAt.toISOString() : undefined,
    p_max_attempts: maxAttempts,
  });

  if (error || !data) {
    throw new Error(`Failed to enqueue job ${taskType}: ${error?.message ?? 'unknown error'}`);
  }

  return toJobRecord(data) as JobRecord<T>;
}

export async function claimJobs(options: ClaimOptions = {}): Promise<JobRecord[]> {
  const { limit = 1, client } = options;
  const supabase = client ?? getServiceRoleSupabaseClient();

  // job_queue_claim returns SETOF (array), not a single row - don't use type param
  const { data, error } = await supabase.rpc('job_queue_claim', {
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Failed to claim jobs: ${error.message}`);
  }

  if (!data) return [];

  return (Array.isArray(data) ? data : [data]).map(toJobRecord);
}

export async function markJobSucceeded(options: MarkSuccessOptions): Promise<JobRecord> {
  const { jobId, output, client } = options;
  const supabase = client ?? getServiceRoleSupabaseClient();

  const { data, error } = await supabase.rpc<JobRow>('job_queue_mark_succeeded', {
    p_job_id: jobId,
    p_output: output ?? null,
  });

  if (error || !data) {
    throw new Error(`Failed to mark job ${jobId} as succeeded: ${error?.message ?? 'unknown error'}`);
  }

  return toJobRecord(data);
}

export async function markJobFailed(options: MarkFailureOptions): Promise<JobRecord> {
  const { jobId, error: message, retryInMs, client } = options;
  const supabase = client ?? getServiceRoleSupabaseClient();

  const { data, error } = await supabase.rpc<JobRow>('job_queue_mark_failed', {
    p_job_id: jobId,
    p_error: message,
    p_retry_in_ms: retryInMs ?? null,
  });

  if (error || !data) {
    throw new Error(`Failed to mark job ${jobId} as failed: ${error?.message ?? 'unknown error'}`);
  }

  return toJobRecord(data);
}

export async function finalizeJobFromResult(job: JobRecord, result: JobResult, client?: SupabaseClient<any, any, any>): Promise<JobRecord> {
  if (result.status === 'succeeded') {
    return markJobSucceeded({ jobId: job.id, output: result.output, client });
  }

  const retryIn = result.retryInMs ?? undefined;
  return markJobFailed({ jobId: job.id, error: result.error, retryInMs: retryIn, client });
}
