import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const AddMemberSchema = z.object({
  competitor_id: z.string().uuid('Invalid competitor ID'),
  position: z.number().min(1).max(6, 'Position must be between 1 and 6'),
});

export async function POST(
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = AddMemberSchema.parse(body);

    // Verify the team belongs to the authenticated coach
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, status')
      .eq('id', params.id)
      .eq('coach_id', session.user.id)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    // Verify the competitor belongs to the authenticated coach
    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select('id, first_name, last_name')
      .eq('id', validatedData.competitor_id)
      .eq('coach_id', session.user.id)
      .single();

    if (competitorError || !competitor) {
      return NextResponse.json({ error: 'Competitor not found or access denied' }, { status: 404 });
    }

    // Check if competitor is already on a team
    const { data: existingMembership, error: membershipError } = await supabase
      .from('team_members')
      .select('id, team_id')
      .eq('competitor_id', validatedData.competitor_id)
      .single();

    if (existingMembership) {
      return NextResponse.json({ 
        error: `${competitor.first_name} ${competitor.last_name} is already on a team` 
      }, { status: 400 });
    }

    // Check if position is already taken
    const { data: positionTaken, error: positionError } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', params.id)
      .eq('position', validatedData.position)
      .single();

    if (positionTaken) {
      return NextResponse.json({ 
        error: `Position ${validatedData.position} is already taken` 
      }, { status: 400 });
    }

    // Check team size limit
    const { count: currentMembers, error: countError } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', params.id);

    if (countError) {
      console.error('Error counting team members:', countError);
      return NextResponse.json({ error: 'Failed to check team size' }, { status: 400 });
    }

    if (currentMembers >= 6) {
      return NextResponse.json({ 
        error: 'Team is already at maximum capacity (6 members)' 
      }, { status: 400 });
    }

    // Add the member to the team
    const { data: teamMember, error: addError } = await supabase
      .from('team_members')
      .insert({
        team_id: params.id,
        competitor_id: validatedData.competitor_id,
        position: validatedData.position,
      })
      .select()
      .single();

    if (addError) {
      console.error('Database error:', addError);
      return NextResponse.json({ error: 'Failed to add member: ' + addError.message }, { status: 400 });
    }

    // Log the activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'team_member_added',
        entity_type: 'team_member',
        entity_id: teamMember.id,
        metadata: { 
          team_name: team.name,
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          position: validatedData.position,
          coach_id: session.user.id
        }
      });

    return NextResponse.json({
      teamMember,
      message: 'Member added successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error adding team member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
