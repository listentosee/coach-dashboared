import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; competitor_id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const isAdmin = await isUserAdmin(supabase, user.id);

    // Verify the team exists and user has access
    let query = supabase
      .from('teams')
      .select('id, name, coach_id')
      .eq('id', params.id);

    if (!isAdmin) {
      query = query.eq('coach_id', user.id);
    }

    const { data: team, error: teamError } = await query.single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    // Get the team member details before deletion
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('id, position')
      .eq('team_id', params.id)
      .eq('competitor_id', params.competitor_id)
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Remove the member from the team
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', params.id)
      .eq('competitor_id', params.competitor_id);

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
          competitor_id: params.competitor_id,
          position: teamMember.position,
          coach_id: team.coach_id
        }
      });

    return NextResponse.json({
      message: 'Member removed successfully'
    });

  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
