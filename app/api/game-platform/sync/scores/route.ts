import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { syncAllCompetitorGameStats, syncCompetitorGameStats, type AnySupabaseClient } from '@/lib/integrations/game-platform/service';

const CRON_SECRET = process.env.GAME_PLATFORM_CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_METHODS = new Set(['GET', 'POST']);

async function buildSupabaseClient(isCronCall: boolean, cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<AnySupabaseClient> {
  if (isCronCall) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase service role configuration for cron sync');
    }
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

async function handleSync({
  request,
  supabase,
  dryRun,
  actingCoachId,
  competitorId,
}: {
  request: NextRequest;
  supabase: AnySupabaseClient;
  dryRun: boolean;
  actingCoachId: string | null;
  competitorId: string | null;
}) {
  if (competitorId) {
    const result = await syncCompetitorGameStats({
      supabase,
      competitorId,
      dryRun,
      logger: console,
    });
    return NextResponse.json({ result, dryRun });
  }

  const summary = await syncAllCompetitorGameStats({
    supabase,
    dryRun,
    logger: console,
    coachId: actingCoachId,
  });

  return NextResponse.json({ summary, dryRun });
}

export async function POST(request: NextRequest) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const cookieStore = await cookies();
    const secretParam = request.nextUrl.searchParams.get('secret');
    const headerSecret = request.headers.get('x-vercel-cron-secret');
    const hasCronHeader = !!request.headers.get('x-vercel-cron');
    const secretMatches = CRON_SECRET
      ? secretParam === CRON_SECRET || headerSecret === CRON_SECRET
      : false;
    const isCronAttempt = request.method === 'GET' && (hasCronHeader || CRON_SECRET);
    const isCronCall = request.method === 'GET' && (hasCronHeader || secretMatches);

    if (isCronAttempt && !isCronCall) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = await buildSupabaseClient(isCronCall, cookieStore);

    if (!isCronCall) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const isAdminUser = await isUserAdmin(supabase, user.id);
      if (!isAdminUser) {
        return NextResponse.json({ error: 'Admins only' }, { status: 403 });
      }
    }

    const params = request.nextUrl.searchParams;
    const competitorId = params.get('competitorId');
    const dryRun = params.get('dryRun') === 'true';
    const actingCoachId = isCronCall ? null : cookieStore.get('admin_coach_id')?.value || null;

    if (isCronCall && (competitorId || dryRun)) {
      return NextResponse.json({ error: 'Cron requests cannot specify competitorId or dryRun' }, { status: 400 });
    }

    return await handleSync({ request, supabase, dryRun, actingCoachId, competitorId });
  } catch (error: any) {
    console.error('Game Platform score sync failed', error);
    return NextResponse.json({ error: error?.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  return POST(request);
}
