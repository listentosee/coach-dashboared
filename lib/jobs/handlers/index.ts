import type { JobHandler, JobTaskType } from '../types';
import { handleGamePlatformSync } from './gamePlatformSync';
import { handleGamePlatformTotalsSweep } from './gamePlatformTotalsSweep';
import { handleSmsDigestProcessor } from './smsDigestProcessor';
import { handleAdminAlertDispatch } from './adminAlertDispatch';

const handlers: Record<JobTaskType, JobHandler<any>> = {
  game_platform_sync: handleGamePlatformSync,
  game_platform_totals_sweep: handleGamePlatformTotalsSweep,
  sms_digest_processor: handleSmsDigestProcessor,
  admin_alert_dispatch: handleAdminAlertDispatch,
};

export function getJobHandler<T extends JobTaskType>(taskType: T): JobHandler<T> {
  const handler = handlers[taskType] as JobHandler<T> | undefined;
  if (!handler) {
    throw new Error(`No job handler registered for task type: ${taskType}`);
  }
  return handler;
}

export const jobHandlers = handlers;
