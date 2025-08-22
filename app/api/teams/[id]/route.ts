import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the authenticated user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the team belongs to the authenticated coach
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', params.id)
      .eq('coach_id', session.user.id)
      .single();

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
        user_id: session.user.id,
        action: 'team_deleted',
        entity_type: 'team',
        entity_id: params.id,
        metadata: { 
          team_name: team.name,
          coach_id: session.user.id
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
