import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin and resolve acting context
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
    const { id: teamId } = await context.params;
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }

    // Get request body
    const body = await request.json();
    const { name, image_url, division, status } = body;

    // Build update object with only provided fields
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (division !== undefined) updateData.division = division;
    if (status !== undefined) updateData.status = status;

    // Verify ownership when admin
    if (isAdmin) {
      const { data: teamOwn } = await supabase.from('teams').select('id,coach_id').eq('id', teamId).single()
      if (!teamOwn || teamOwn.coach_id !== actingCoachId) {
        return NextResponse.json({ error: 'Target not owned by selected coach' }, { status: 403 })
      }
    }

    // Update team
    const { data: team, error } = await supabase
      .from('teams')
      .update(updateData)
      .eq('id', teamId)
      .select()
      .single();

    if (error) {
      console.error('Error updating team:', error);
      return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error('Error in team update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
