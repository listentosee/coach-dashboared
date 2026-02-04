import type { SupabaseClient } from '@supabase/supabase-js';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobTaskType =
  | 'game_platform_sync'
  | 'game_platform_totals_sweep'
  | 'game_platform_profile_refresh'
  | 'game_platform_onboard_competitors'
  | 'game_platform_onboard_coaches'
  | 'sms_digest_processor'
  | 'admin_alert_dispatch'
  | 'release_parent_email_verification'
  | 'message_read_receipts_backfill';

export interface GamePlatformSyncPayload {
  dryRun?: boolean;
  coachId?: string | null;
  forceFullSync?: boolean;
  forceFlashCtfSync?: boolean;
  batchSize?: number;
  cursor?: { createdAt: string; id: string } | null;
  mode?: 'wave' | 'full';
  syncTeams?: boolean;
}

export interface GamePlatformTotalsSweepPayload {
  dryRun?: boolean;
  coachId?: string | null;
  batchSize?: number;
}

export interface GamePlatformProfileRefreshPayload {
  dryRun?: boolean;
  coachId?: string | null;
}

export interface GamePlatformOnboardCompetitorsPayload {
  competitorIds?: string[];
  batchSize?: number;
  coachId?: string | null;
  onlyActive?: boolean;
  source?: 'bulk_import' | 'backfill' | 'manual';
  forceReonboard?: boolean;
}

export interface GamePlatformOnboardCoachesPayload {
  coachId?: string | null;
  coachIds?: string[];
  dryRun?: boolean;
  source?: 'backfill' | 'manual';
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

export interface MessageReadReceiptsBackfillPayload {
  batchSize?: number;
  maxRows?: number;
  dryRun?: boolean;
}

export interface JobPayloadMap {
  game_platform_sync: GamePlatformSyncPayload;
  game_platform_totals_sweep: GamePlatformTotalsSweepPayload;
  game_platform_profile_refresh: GamePlatformProfileRefreshPayload;
  game_platform_onboard_competitors: GamePlatformOnboardCompetitorsPayload;
  game_platform_onboard_coaches: GamePlatformOnboardCoachesPayload;
  sms_digest_processor: SmsDigestProcessorPayload;
  admin_alert_dispatch: AdminAlertDispatchPayload;
  release_parent_email_verification: ReleaseParentEmailVerificationPayload;
  message_read_receipts_backfill: MessageReadReceiptsBackfillPayload;
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
