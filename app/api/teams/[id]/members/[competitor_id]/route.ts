import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { onboardCompetitorToGamePlatform, syncTeamWithGamePlatform } from '@/lib/integrations/game-platform/service';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; competitor_id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin and resolve acting context
    const isAdmin = await isUserAdmin(supabase, user.id);
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
    const { id: teamId, competitor_id } = await context.params
    const competitorId = competitor_id
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }

    // Verify the team exists and user has access
    let query = supabase
      .from('teams')
      .select('id, name, coach_id')
      .eq('id', teamId);

    if (!isAdmin) {
      query = query.eq('coach_id', user.id);
    } else {
      query = query.eq('coach_id', actingCoachId as string)
    }

    const { data: team, error: teamError } = await query.single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    // Get the team member details before deletion
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('id, position')
      .eq('team_id', teamId)
      .eq('competitor_id', competitor_id)
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Remove the member from the team
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('competitor_id', competitor_id);

    if (deleteError) {
      console.error('Database error:', deleteError);
      return NextResponse.json({ error: 'Failed to remove member: ' + deleteError.message }, { status: 400 });
    }

    // Log the activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'team_member_removed',
        entity_type: 'team_member',
        entity_id: teamMember.id,
        metadata: { 
          team_name: team.name,
          competitor_id,
          position: teamMember.position,
          coach_id: team.coach_id
        }
      });

    let gamePlatformSync: any = null;
    try {
      // If competitor still belongs to another team, ensure they're onboarded (covers mock reseed cases)
      const { data: remainingMemberships } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('competitor_id', competitorId)
        .limit(1);

      if ((remainingMemberships?.length ?? 0) > 0) {
        await onboardCompetitorToGamePlatform({
          supabase,
          competitorId,
          coachContextId: team.coach_id,
          logger: console,
        });
      }

      gamePlatformSync = await syncTeamWithGamePlatform({
        supabase,
        teamId,
        logger: console,
      });
    } catch (syncError: any) {
      console.error('Game Platform team sync failed after member removal', syncError);
      gamePlatformSync = { error: syncError?.message ?? 'Unknown Game Platform sync error' };
    }

    return NextResponse.json({
      message: 'Member removed successfully',
      gamePlatformSync,
    });

  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
