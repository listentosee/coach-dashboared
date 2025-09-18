import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { syncTeamWithGamePlatform } from '@/lib/integrations/game-platform/service';

const FEATURE_ENABLED = process.env.GAME_PLATFORM_INTEGRATION_ENABLED === 'true';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    const actingCoachId = isAdmin ? cookieStore.get('admin_coach_id')?.value || null : null;

    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 });
    }

    let teamQuery = supabase
      .from('teams')
      .select('id, coach_id')
      .eq('id', id)
      .maybeSingle();

    if (!isAdmin) {
      teamQuery = teamQuery.eq('coach_id', user.id);
    } else if (actingCoachId) {
      teamQuery = teamQuery.eq('coach_id', actingCoachId);
    }

    const { data: team, error: teamError } = await teamQuery;

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    const dryRunOverride = request.nextUrl.searchParams.get('dryRun');
    const dryRun = typeof dryRunOverride === 'string'
      ? dryRunOverride === 'true'
      : !FEATURE_ENABLED;

    const result = await syncTeamWithGamePlatform({
      supabase,
      teamId: id,
      dryRun,
      logger: console,
    });

    return NextResponse.json({
      ...result,
      featureEnabled: FEATURE_ENABLED,
      dryRun,
    });
  } catch (error: any) {
    console.error('Error syncing team to Game Platform', error);
    const message = error?.message ?? 'Internal server error';
    const status = error?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
