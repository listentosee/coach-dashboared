import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

interface ActionPayload {
  jobId?: string;
  action?: 'retry' | 'cancel' | 'delete';
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, authorized: false } as const;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { supabase, authorized: false } as const;
  }

  return { supabase, authorized: true } as const;
}

export async function POST(request: NextRequest) {
  const { supabase, authorized } = await requireAdmin();
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);

  const jobId = formData?.get('jobId')?.toString();
  const action = formData?.get('action')?.toString() as ActionPayload['action'];

  if (!jobId || !action) {
    return NextResponse.json({ error: 'Missing jobId or action' }, { status: 400 });
  }

  try {
    if (action === 'retry') {
      const { error } = await supabase
        .from('job_queue')
        .update({
          status: 'pending',
          run_at: new Date().toISOString(),
          last_error: null,
          completed_at: null,
        })
        .eq('id', jobId);

      if (error) throw error;
    } else if (action === 'cancel') {
      const { error } = await supabase
        .from('job_queue')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;
    } else if (action === 'delete') {
      const { error } = await supabase
        .from('job_queue')
        .delete()
        .eq('id', jobId);

      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.redirect(new URL('/dashboard/admin-tools/jobs', request.url), { status: 303 });
  } catch (error) {
    console.error('[job-queue-actions] failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
