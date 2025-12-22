import type { SupabaseClient } from '@supabase/supabase-js';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobTaskType =
  | 'game_platform_sync'
  | 'game_platform_totals_sweep'
  | 'sms_digest_processor'
  | 'admin_alert_dispatch'
  | 'release_parent_email_verification';

export interface GamePlatformSyncPayload {
  dryRun?: boolean;
  coachId?: string | null;
  forceFullSync?: boolean;
}

export interface GamePlatformTotalsSweepPayload {
  dryRun?: boolean;
  coachId?: string | null;
  batchSize?: number;
}

export interface NotificationJobPayload {
  dryRun?: boolean;
  coachId?: string | null; // Optional: process digest for specific recipient only
  windowMinutes?: number;
  force?: boolean;
  roles?: Array<'coach' | 'admin'>;
  allowSms?: boolean;
}

export type SmsDigestProcessorPayload = NotificationJobPayload;
export type AdminAlertDispatchPayload = NotificationJobPayload;

export interface ReleaseParentEmailVerificationPayload {
  dryRun?: boolean;
  limit?: number;
  staleHours?: number;
}

export interface JobPayloadMap {
  game_platform_sync: GamePlatformSyncPayload;
  game_platform_totals_sweep: GamePlatformTotalsSweepPayload;
  sms_digest_processor: SmsDigestProcessorPayload;
  admin_alert_dispatch: AdminAlertDispatchPayload;
  release_parent_email_verification: ReleaseParentEmailVerificationPayload;
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
