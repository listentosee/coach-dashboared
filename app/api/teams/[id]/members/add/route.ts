import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { z } from 'zod';

const AddMemberSchema = z.object({
  competitor_id: z.string().uuid('Invalid competitor ID'),
  position: z.number().min(1).max(6, 'Position must be between 1 and 6').optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the authenticated user session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin and resolve acting context
    const isAdmin = await isUserAdmin(supabase, user.id);
    const actingCoachId = isAdmin ? (cookies().get('admin_coach_id')?.value || null) : null
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = AddMemberSchema.parse(body);

    // Verify the team exists and user has access
    let teamQuery = supabase
      .from('teams')
      .select('id, name, status, coach_id')
      .eq('id', params.id);

    if (!isAdmin) {
      teamQuery = teamQuery.eq('coach_id', user.id);
    } else {
      teamQuery = teamQuery.eq('coach_id', actingCoachId as string)
    }

    const { data: team, error: teamError } = await teamQuery.single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    // Verify the competitor exists and user has access
    let competitorQuery = supabase
      .from('competitors')
      .select('id, first_name, last_name, coach_id')
      .eq('id', validatedData.competitor_id);

    if (!isAdmin) {
      competitorQuery = competitorQuery.eq('coach_id', user.id);
    } else {
      competitorQuery = competitorQuery.eq('coach_id', actingCoachId as string)
    }

    const { data: competitor, error: competitorError } = await competitorQuery.single();

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

    // Determine the position to use
    let positionToUse = validatedData.position;
    
    if (!positionToUse) {
      // Auto-assign next available position
      const { data: existingPositions, error: positionsError } = await supabase
        .from('team_members')
        .select('position')
        .eq('team_id', params.id);

      if (positionsError) {
        console.error('Error fetching existing positions:', positionsError);
        return NextResponse.json({ error: 'Failed to check team positions' }, { status: 400 });
      }

      const takenPositions = (existingPositions || []).map(p => p.position);
      const nextPosition = [1, 2, 3, 4, 5, 6].find(p => !takenPositions.includes(p));
      
      if (!nextPosition) {
        return NextResponse.json({ 
          error: 'Team is already at maximum capacity (6 members)' 
        }, { status: 400 });
      }
      
      positionToUse = nextPosition;
    } else {
      // Check if specified position is already taken
      const { data: positionTaken, error: positionError } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', params.id)
        .eq('position', positionToUse)
        .single();

      if (positionTaken) {
        return NextResponse.json({ 
          error: `Position ${positionToUse} is already taken` 
        }, { status: 400 });
      }
    }

    // Team size limit is already checked in position calculation above

    // Add the member to the team
    const { data: teamMember, error: addError } = await supabase
      .from('team_members')
      .insert({
        team_id: params.id,
        competitor_id: validatedData.competitor_id,
        position: positionToUse,
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
        user_id: user.id,
        action: 'team_member_added',
        entity_type: 'team_member',
        entity_id: teamMember.id,
        metadata: { 
          team_name: team.name,
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          position: validatedData.position,
          coach_id: team.coach_id
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
