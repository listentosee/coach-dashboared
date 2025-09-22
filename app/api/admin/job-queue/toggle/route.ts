import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, authorized: false } as const;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return { supabase, authorized: false } as const;

  return { supabase, authorized: true, userId: user.id } as const;
}

export async function POST(request: NextRequest) {
  const { authorized } = await requireAdmin();
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { enabled?: boolean; reason?: string | null } | null;
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Missing enabled flag' }, { status: 400 });
  }

  const supabase = getServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('job_queue_settings')
    .update({
      processing_enabled: body.enabled,
      paused_reason: body.enabled ? null : (body.reason ?? 'Paused via admin console.'),
    })
    .eq('id', 1)
    .select('processing_enabled, paused_reason, updated_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to update settings' }, { status: 500 });
  }

  return NextResponse.json({
    processingEnabled: data.processing_enabled,
    pausedReason: data.paused_reason,
    updatedAt: data.updated_at,
  });
}
