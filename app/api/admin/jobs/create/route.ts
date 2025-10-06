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
    const { task_type, payload, is_recurring, recurrence_interval_minutes, expires_at, run_at } = body;

    if (!task_type) {
      return NextResponse.json({ error: 'Missing task_type' }, { status: 400 });
    }

    // Validate recurring job has interval
    if (is_recurring && !recurrence_interval_minutes) {
      return NextResponse.json({ error: 'Recurring jobs must have recurrence_interval_minutes' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('job_queue')
      .insert({
        task_type,
        payload: payload || {},
        is_recurring: is_recurring || false,
        recurrence_interval_minutes: is_recurring ? recurrence_interval_minutes : null,
        expires_at: expires_at || null,
        run_at: run_at || new Date().toISOString(),
        status: 'pending',
      })
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
    console.error('[create-job] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create job' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
