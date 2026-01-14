import { AuditLogger } from '@/lib/audit/audit-logger';
import { logger as defaultLogger } from '@/lib/logging/safe-logger';
import type { AnySupabaseClient } from './service';
import { onboardCompetitorToGamePlatform } from './service';

interface AutoOnboardOptions {
  supabase: AnySupabaseClient;
  competitorId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  coachContextId?: string | null;
  userId?: string | null;
  logger?: Pick<Console, 'error' | 'warn' | 'info' | 'debug'>;
}

export async function maybeAutoOnboardCompetitor({
  supabase,
  competitorId,
  previousStatus,
  nextStatus,
  coachContextId,
  userId,
  logger,
}: AutoOnboardOptions): Promise<void> {
  if (nextStatus !== 'profile' || previousStatus === 'profile') {
    return;
  }

  const resolvedLogger = logger ?? defaultLogger;

  try {
    const result = await onboardCompetitorToGamePlatform({
      supabase,
      competitorId,
      coachContextId,
      logger: resolvedLogger,
    });

    if (result.status === 'synced') {
      await AuditLogger.logDisclosure(supabase, {
        competitorId,
        disclosedTo: 'MetaCTF Game Platform',
        purpose: 'Competitor onboarding for cybersecurity competition participation',
        userId: userId ?? null,
        dataFields: ['first_name', 'last_name', 'email_school', 'grade', 'division'],
      });
    }
  } catch (error) {
    resolvedLogger.warn?.('Auto onboarding to Game Platform failed', {
      competitorId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
