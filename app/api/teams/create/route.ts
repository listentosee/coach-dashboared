import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { z } from 'zod';
import { syncTeamWithGamePlatform } from '@/lib/integrations/game-platform/service';

const CreateTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters'),
  description: z.string().optional(),
  division: z.string().optional(),
  coach_id: z.string().uuid().optional(), // Optional for admins to specify coach
});

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Get authenticated user (verified)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin and resolve acting context
    const isAdmin = await isUserAdmin(supabase, user.id);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateTeamSchema.parse(body);

    // Determine which coach_id to use
    let coachId = user.id;
    if (isAdmin) {
      const actingCoachId = cookieStore.get('admin_coach_id')?.value || null
      if (!actingCoachId) return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
      coachId = actingCoachId
    }

    // Check if team name already exists for this coach
    const { data: existingTeam, error: checkError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('coach_id', coachId)
      .eq('name', validatedData.name)
      .single();

    if (existingTeam) {
      return NextResponse.json({ 
        error: `Team name "${validatedData.name}" already exists` 
      }, { status: 400 });
    }

    // Create the team
    const { data: team, error: createError } = await supabase
      .from('teams')
      .insert({
        coach_id: coachId,
        name: validatedData.name,
        description: validatedData.description || null,
        division: validatedData.division || null,
        status: 'forming',
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return NextResponse.json({ error: 'Failed to create team: ' + createError.message }, { status: 400 });
    }

    // Log the activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'team_created',
        entity_type: 'team',
        entity_id: team.id,
        metadata: { 
          team_name: team.name,
          coach_id: coachId
        }
      });

    let gamePlatformSync: any = null;
    try {
      gamePlatformSync = await syncTeamWithGamePlatform({
        supabase,
        teamId: team.id,
        logger: console,
      });
    } catch (syncError: any) {
      console.error('Game Platform team sync failed after create', syncError);
      gamePlatformSync = { error: syncError?.message ?? 'Unknown Game Platform sync error' };
    }

    return NextResponse.json({
      team,
      message: 'Team created successfully',
      gamePlatformSync,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error creating team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
