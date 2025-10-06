import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { deleteTeamFromGamePlatform } from '@/lib/integrations/game-platform/service';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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
    const { id } = await context.params
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }

    // Verify the team exists and user has access
    let query = supabase
      .from('teams')
      .select('id, name, coach_id')
      .eq('id', id);

    if (!isAdmin) {
      query = query.eq('coach_id', user.id);
    } else {
      query = query.eq('coach_id', actingCoachId as string)
    }

    const { data: team, error: teamError } = await query.single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    // Validate that team has no members
    const { count: memberCount, error: countError } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', id);

    if (countError) {
      return NextResponse.json({ error: 'Failed to verify team members' }, { status: 400 });
    }

    if ((memberCount ?? 0) > 0) {
      return NextResponse.json({
        error: 'Cannot delete team with members. Remove all members first.'
      }, { status: 400 });
    }

    // Call MetaCTF API to delete team (before local deletion)
    let gamePlatformSync: any = null;
    try {
      gamePlatformSync = await deleteTeamFromGamePlatform({
        supabase,
        teamId: id,
        logger: console,
      });
    } catch (syncError: any) {
      console.error('Game Platform team deletion failed', syncError);
      // Don't block local deletion if API fails - log and continue
      gamePlatformSync = {
        error: syncError?.message ?? 'Unknown Game Platform deletion error',
        status: 'api_error_continued'
      };
    }

    // Delete the team
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Database error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete team: ' + deleteError.message }, { status: 400 });
    }

    // Log the activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'team_deleted',
        entity_type: 'team',
        entity_id: id,
        metadata: { 
          team_name: team.name,
          coach_id: team.coach_id
        }
      });

    return NextResponse.json({
      message: 'Team deleted successfully',
      gamePlatformSync,
    });

  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
