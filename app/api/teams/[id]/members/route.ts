import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
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

    // Fetch team members with competitor details
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select(`
        id,
        competitor_id,
        position,
        joined_at,
        competitor:competitors(
          first_name,
          last_name,
          grade,
          email_school
        )
      `)
      .eq('team_id', params.id)
      .order('position', { ascending: true });

    if (membersError) {
      console.error('Database error:', membersError);
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 400 });
    }

    return NextResponse.json({
      members: members || []
    });

  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
