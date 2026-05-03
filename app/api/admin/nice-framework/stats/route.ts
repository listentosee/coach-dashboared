import { NextResponse } from 'next/server';
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServerClient();

  // Check authentication and admin role
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // Use service role client for reading
  const supabaseAdmin = getServiceRoleSupabaseClient();

  try {
    // Get count of work roles
    const { count, error: countError } = await supabaseAdmin
      .from('nice_framework_work_roles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw countError;
    }

    // Get most recent created_at timestamp
    const { data: latest, error: latestError } = await supabaseAdmin
      .from('nice_framework_work_roles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      count: count || 0,
      lastUpdated: latest?.created_at || null,
    });
  } catch (error) {
    console.error('[nice-framework-stats] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
