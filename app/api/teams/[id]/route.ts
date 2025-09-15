import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Delete the team
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', params.id);

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
        entity_id: params.id,
        metadata: { 
          team_name: team.name,
          coach_id: team.coach_id
        }
      });

    return NextResponse.json({
      message: 'Team deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
