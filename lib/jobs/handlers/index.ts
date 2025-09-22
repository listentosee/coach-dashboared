import type { JobHandler, JobTaskType } from '../types';
import { handleGamePlatformSync } from './gamePlatformSync';

const handlers: Record<JobTaskType, JobHandler<any>> = {
  game_platform_sync: handleGamePlatformSync,
};

export function getJobHandler<T extends JobTaskType>(taskType: T): JobHandler<T> {
  const handler = handlers[taskType] as JobHandler<T> | undefined;
  if (!handler) {
    throw new Error(`No job handler registered for task type: ${taskType}`);
  }
  return handler;
}

export const jobHandlers = handlers;
