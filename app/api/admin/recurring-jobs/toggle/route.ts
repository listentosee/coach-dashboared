import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

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

  try {
    const body = await request.json();
    const { jobId, enabled } = body;

    if (!jobId || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('recurring_jobs')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      job: data,
    });
  } catch (error) {
    console.error('[recurring-jobs] Failed to toggle:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update recurring job' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
