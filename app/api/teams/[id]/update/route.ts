import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { z } from 'zod';

const UpdateTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters'),
  description: z.string().optional(),
  division: z.string().optional(),
  status: z.enum(['forming', 'active', 'archived']).optional(),
});

export async function PUT(
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

    // Check if user is admin
    const isAdmin = await isUserAdmin(supabase, session.user.id);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateTeamSchema.parse(body);

    // Verify the team exists and user has access
    let query = supabase
      .from('teams')
      .select('id, name, status, coach_id')
      .eq('id', params.id);

    if (!isAdmin) {
      query = query.eq('coach_id', session.user.id);
    }

    const { data: existingTeam, error: checkError } = await query.single();

    if (checkError || !existingTeam) {
      return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 });
    }

    // Check if team name already exists for this coach (if name is being changed)
    if (validatedData.name !== existingTeam.name) {
      let duplicateQuery = supabase
        .from('teams')
        .select('id, name')
        .eq('name', validatedData.name)
        .neq('id', params.id);

      if (!isAdmin) {
        duplicateQuery = duplicateQuery.eq('coach_id', session.user.id);
      }

      const { data: duplicateTeam, error: duplicateError } = await duplicateQuery.single();

      if (duplicateTeam) {
        return NextResponse.json({ 
          error: `Team name "${validatedData.name}" already exists` 
        }, { status: 400 });
      }
    }

    // Update the team
    const { data: team, error: updateError } = await supabase
      .from('teams')
      .update({
        name: validatedData.name,
        description: validatedData.description || null,
        division: validatedData.division || null,
        status: validatedData.status || existingTeam.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('Database error:', updateError);
      return NextResponse.json({ error: 'Failed to update team: ' + updateError.message }, { status: 400 });
    }

    // Log the activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'team_updated',
        entity_type: 'team',
        entity_id: team.id,
        metadata: { 
          team_name: team.name,
          coach_id: existingTeam.coach_id
        }
      });

    return NextResponse.json({
      team,
      message: 'Team updated successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error updating team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
