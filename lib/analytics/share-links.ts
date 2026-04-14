import crypto from 'node:crypto';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

export type AnalyticsShareLink = {
  id: string;
  token: string;
  report_type: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function createShareToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function buildAnalyticsShareUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://coach.cyber-guild.org';
  return `${base.replace(/\/$/, '')}/shared/analytics/${token}`;
}

export function buildAnalyticsShareUrlFromBase(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, '')}/shared/analytics/${token}`;
}

export async function createAnalyticsShareLink(options: {
  createdBy: string;
  expiresInDays?: number | null;
  maxUses?: number | null;
}) {
  const supabase = getServiceRoleSupabaseClient();
  const token = createShareToken();
  const expiresAt =
    options.expiresInDays && options.expiresInDays > 0
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data, error } = await supabase
    .from('analytics_share_links')
    .insert({
      token,
      report_type: 'analytics_donor',
      expires_at: expiresAt,
      max_uses: options.maxUses ?? null,
      created_by: options.createdBy,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    link: data as AnalyticsShareLink,
    url: buildAnalyticsShareUrl(token),
  };
}

export async function getAnalyticsShareLinkByToken(token: string) {
  const supabase = getServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('analytics_share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AnalyticsShareLink | null) ?? null;
}

export function validateAnalyticsShareLink(link: AnalyticsShareLink) {
  if (link.revoked_at) return { valid: false, reason: 'revoked' as const };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'expired' as const };
  }
  if (typeof link.max_uses === 'number' && link.use_count >= link.max_uses) {
    return { valid: false, reason: 'exhausted' as const };
  }
  return { valid: true as const };
}

export async function markAnalyticsShareLinkUsed(id: string, currentUseCount: number) {
  const supabase = getServiceRoleSupabaseClient();
  const { error } = await supabase
    .from('analytics_share_links')
    .update({
      use_count: currentUseCount + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw error;
  }
}
