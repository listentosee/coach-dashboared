import { NextResponse } from 'next/server';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin';
}

export async function GET() {
  const authorized = await requireAdmin();
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc('job_queue_health');

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to load health data' }, { status: 500 });
  }

  return NextResponse.json(data);
}
