import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { syncTeamWithGamePlatform } from '@/lib/integrations/game-platform/service';
import { AuditLogger } from '@/lib/audit/audit-logger';
import { logger } from '@/lib/logging/safe-logger';

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

    // Log third-party data disclosure if sync was successful and not a dry run
    if (!dryRun && (result.status === 'synced' || result.status === 'created_team')) {
      // Get team members to log disclosure for each
      const { data: members } = await supabase
        .from('team_members')
        .select('competitor_id')
        .eq('team_id', id);

      if (members && members.length > 0) {
        // Log disclosure for each team member
        for (const member of members) {
          await AuditLogger.logDisclosure(supabase, {
            competitorId: member.competitor_id,
            disclosedTo: 'MetaCTF Game Platform',
            purpose: 'Team sync for cybersecurity competition participation',
            userId: user.id,
            dataFields: ['first_name', 'last_name', 'email_school', 'grade', 'division'],
          });
        }
      }
    }

    return NextResponse.json({
      ...result,
      featureEnabled: FEATURE_ENABLED,
      dryRun,
    });
  } catch (error: any) {
    logger.error('Team sync to Game Platform failed', { error: error?.message, teamId: id });
    const message = error?.message ?? 'Internal server error';
    const status = error?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
