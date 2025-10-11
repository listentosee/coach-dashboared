import type { SupabaseClient } from '@supabase/supabase-js';

export type AnySupabaseClient = SupabaseClient<any, any, any>;

export type EmailConflictSource = 'profile' | 'competitor_school' | 'competitor_personal';

export interface EmailConflict {
  email: string;
  source: EmailConflictSource;
  recordId: string;
  coachId?: string | null;
}

export interface EmailConflictCheckOptions {
  supabase: AnySupabaseClient;
  emails: Array<string | null | undefined>;
  ignoreProfileIds?: string[];
  ignoreCompetitorIds?: string[];
  coachScopeId?: string | null;
}

export interface EmailConflictResult {
  normalizedEmails: string[];
  conflicts: EmailConflict[];
}

export class EmailConflictError extends Error {
  constructor(public readonly details: EmailConflictResult) {
    super('Email address already in use');
    this.name = 'EmailConflictError';
  }
}

export function normalizeEmail(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export async function findEmailConflicts({
  supabase,
  emails,
  ignoreProfileIds = [],
  ignoreCompetitorIds = [],
  coachScopeId = null,
}: EmailConflictCheckOptions): Promise<EmailConflictResult> {
  const normalizedEmails = Array.from(
    new Set(
      emails
        .map(normalizeEmail)
        .filter((email): email is string => Boolean(email)),
    ),
  );

  if (normalizedEmails.length === 0) {
    return { normalizedEmails: [], conflicts: [] };
  }

  const conflicts: EmailConflict[] = [];

  const { data: profileMatches, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .in('email', normalizedEmails);

  if (profileError) {
    throw profileError;
  }

  (profileMatches ?? [])
    .filter((row) => !ignoreProfileIds.includes(row.id))
    .forEach((row) => {
      const normalized = normalizeEmail(row.email);
      if (!normalized) return;
      conflicts.push({
        email: normalized,
        source: 'profile',
        recordId: row.id,
      });
    });

  const competitorSelectors = [
    { column: 'email_school', source: 'competitor_school' as const },
    { column: 'email_personal', source: 'competitor_personal' as const },
  ];

  for (const selector of competitorSelectors) {
    const query = supabase
      .from('competitors')
      .select(`id, coach_id, ${selector.column}`)
      .in(selector.column, normalizedEmails);

    if (coachScopeId) {
      query.eq('coach_id', coachScopeId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    (data ?? [])
      .filter((row) => !ignoreCompetitorIds.includes(row.id))
      .forEach((row) => {
        const email = normalizeEmail((row as any)[selector.column]);
        if (!email) return;
        conflicts.push({
          email,
          source: selector.source,
          recordId: row.id,
          coachId: row.coach_id ?? null,
        });
      });
  }

  return {
    normalizedEmails,
    conflicts,
  };
}

export async function assertEmailsUnique(options: EmailConflictCheckOptions): Promise<void> {
  const result = await findEmailConflicts(options);
  if (result.conflicts.length > 0) {
    throw new EmailConflictError(result);
  }
}
