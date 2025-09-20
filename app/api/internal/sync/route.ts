import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { syncAllCompetitorGameStats } from '@/lib/integrations/game-platform/service';

const INTERNAL_SYNC_SECRET = process.env.INTERNAL_SYNC_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getHeaderSecret(request: NextRequest) {
  return (
    request.headers.get('x-internal-sync-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null
  );
}

async function getSupabaseClient(isInternal: boolean) {
  if (isInternal) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase service role configuration for sync');
    }
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }

  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

async function handleSync({
  supabase,
  coachId,
  dryRun,
}: {
  supabase: any;
  coachId: string | null;
  dryRun: boolean;
}) {
  const summary = await syncAllCompetitorGameStats({
    supabase,
    dryRun,
    logger: console,
    coachId,
  });

  return NextResponse.json({ summary, dryRun });
}

export async function POST(request: NextRequest) {
  const headerSecret = getHeaderSecret(request);
  const isInternal = INTERNAL_SYNC_SECRET && headerSecret === INTERNAL_SYNC_SECRET;

  try {
    if (!isInternal) {
      const supabase = await getSupabaseClient(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Admins only' }, { status: 403 });
      }

      const params = await request.json().catch(() => ({}));
      const dryRun = !!params.dryRun;
      const coachId = params.coachId ?? null;
      return await handleSync({ supabase, coachId, dryRun });
    }

    const params = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const dryRun = !!params.dryRun;
    const coachId = params.coachId ?? null;

    const supabase = await getSupabaseClient(true);
    return await handleSync({ supabase, coachId, dryRun });
  } catch (error: any) {
    console.error('[internal/sync] failed', error);
    return NextResponse.json({ error: error?.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const headerSecret = getHeaderSecret(request);
  const isInternal = INTERNAL_SYNC_SECRET && headerSecret === INTERNAL_SYNC_SECRET;

  if (!isInternal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await getSupabaseClient(true);
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
  const coachId = request.nextUrl.searchParams.get('coachId');

  return handleSync({ supabase, coachId, dryRun });
}
