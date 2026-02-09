import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedRecipient {
  competitorId: string;
  email: string;
}

export interface SkippedRecipient {
  competitorId: string;
  reason: 'no_email' | 'invalid_email_format';
}

export interface RecipientResolution {
  recipients: ResolvedRecipient[];
  skipped: SkippedRecipient[];
}

// ---------------------------------------------------------------------------
// Email validation schema
// ---------------------------------------------------------------------------

const emailSchema = z.string().email();

// ---------------------------------------------------------------------------
// resolveRecipients
// ---------------------------------------------------------------------------

/**
 * Resolves the set of competitors eligible to receive a competitor
 * announcement email.
 *
 * Eligibility: `game_platform_id IS NOT NULL`.
 *
 * Email precedence:
 *   game_platform_onboarding_email > email_personal > email_school
 *
 * Competitors with no resolvable email or an invalid email format are
 * placed in the `skipped` array with a reason so the caller can surface
 * counts without exposing PII.
 *
 * IMPORTANT: This must use a service-role client because it reads across
 * all coaches' competitors.
 */
export async function resolveRecipients(
  serviceClient: SupabaseClient,
  options?: { coachId?: string }
): Promise<RecipientResolution> {
  let query = serviceClient
    .from('competitors')
    .select('id, game_platform_onboarding_email, email_personal, email_school')
    .not('game_platform_id', 'is', null);

  if (options?.coachId) {
    query = query.eq('coach_id', options.coachId);
  }

  const { data: competitors, error } = await query;

  if (error) {
    throw new Error(`Failed to query competitors: ${error.message}`);
  }

  const recipients: ResolvedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];

  for (const competitor of competitors ?? []) {
    const email =
      competitor.game_platform_onboarding_email ??
      competitor.email_personal ??
      competitor.email_school ??
      null;

    if (!email) {
      skipped.push({ competitorId: competitor.id, reason: 'no_email' });
      continue;
    }

    // Validate email format -- SendGrid rejects the entire batch if any
    // email has invalid syntax.
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      skipped.push({ competitorId: competitor.id, reason: 'invalid_email_format' });
      continue;
    }

    recipients.push({ competitorId: competitor.id, email: parsed.data });
  }

  return { recipients, skipped };
}
