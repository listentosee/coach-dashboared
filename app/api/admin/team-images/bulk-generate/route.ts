import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { enqueueJob } from '@/lib/jobs/queue';

export async function POST() {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const job = await enqueueJob({
    taskType: 'team_image_bulk_generate',
    payload: { requestedBy: user.id },
  });

  return NextResponse.json({ jobId: job.id, status: job.status });
}
