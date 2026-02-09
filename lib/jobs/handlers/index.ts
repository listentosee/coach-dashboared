import type { JobHandler, JobTaskType } from '../types';
import { handleGamePlatformSync } from './gamePlatformSync';
import { handleGamePlatformTotalsSweep } from './gamePlatformTotalsSweep';
import { handleGamePlatformProfileRefresh } from './gamePlatformProfileRefresh';
import { handleSmsDigestProcessor } from './smsDigestProcessor';
import { handleAdminAlertDispatch } from './adminAlertDispatch';
import { handleReleaseParentEmailVerification } from './releaseParentEmailVerification';
import { handleGamePlatformOnboardCompetitors } from './gamePlatformOnboardCompetitors';
import { handleGamePlatformOnboardCoaches } from './gamePlatformOnboardCoaches';
import { handleMessageReadReceiptsBackfill } from './messageReadReceiptsBackfill';
import { handleCompetitorAnnouncementDispatch } from './competitorAnnouncementDispatch';

const handlers: Record<JobTaskType, JobHandler<any>> = {
  game_platform_sync: handleGamePlatformSync,
  game_platform_totals_sweep: handleGamePlatformTotalsSweep,
  game_platform_profile_refresh: handleGamePlatformProfileRefresh,
  game_platform_onboard_competitors: handleGamePlatformOnboardCompetitors,
  game_platform_onboard_coaches: handleGamePlatformOnboardCoaches,
  sms_digest_processor: handleSmsDigestProcessor,
  admin_alert_dispatch: handleAdminAlertDispatch,
  release_parent_email_verification: handleReleaseParentEmailVerification,
  message_read_receipts_backfill: handleMessageReadReceiptsBackfill,
  competitor_announcement_dispatch: handleCompetitorAnnouncementDispatch,
};

export function getJobHandler<T extends JobTaskType>(taskType: T): JobHandler<T> {
  const handler = handlers[taskType] as JobHandler<T> | undefined;
  if (!handler) {
    throw new Error(`No job handler registered for task type: ${taskType}`);
  }
  return handler;
}

export const jobHandlers = handlers;
