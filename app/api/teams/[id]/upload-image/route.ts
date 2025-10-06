import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await context.params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null;
    if (isAdmin && !actingCoachId) return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 });

    // Get team data including current image_url and coach_id
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('coach_id, image_url')
      .eq('id', teamId)
      .single();

    if (teamError || !teamData) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Enforce admin context ownership
    if (isAdmin && teamData.coach_id !== actingCoachId) {
      return NextResponse.json({ error: 'Target not owned by selected coach' }, { status: 403 });
    }

    // If there's an image, delete it from storage
    if (teamData.image_url) {
      const { error: deleteError } = await supabase.storage
        .from('team-images')
        .remove([teamData.image_url]);

      if (deleteError) {
        console.error('Storage delete error:', deleteError);
        // Continue anyway - we'll still clear the DB reference
      }
    }

    // Clear the image_url in the database
    const { error: updateError } = await supabase
      .from('teams')
      .update({ image_url: null })
      .eq('id', teamId);

    if (updateError) {
      console.error('Team update error:', updateError);
      return NextResponse.json({ error: 'Failed to remove team image' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Team image delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await context.params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
    if (isAdmin && !actingCoachId) return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    
    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get team data including coach_id
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('coach_id')
      .eq('id', teamId)
      .single();

    if (teamError || !teamData) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Enforce admin context ownership
    if (isAdmin && teamData.coach_id !== actingCoachId) {
      return NextResponse.json({ error: 'Target not owned by selected coach' }, { status: 403 })
    }

    // Generate filename using original name and organize by coach
    const fileExt = file.name.split('.').pop();
    const originalName = file.name.replace(`.${fileExt}`, '');
    const fileName = `${originalName}.${fileExt}`;
    const filePath = `${teamData.coach_id}/${fileName}`;

    // Upload to Supabase Storage with upsert to overwrite existing files
    const { error: uploadError } = await supabase.storage
      .from('team-images')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true, // This will overwrite existing files
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload image' },
        { status: 500 }
      );
    }

    // Store the file path in the database
    const { error: updateError } = await supabase
      .from('teams')
      .update({ image_url: filePath })
      .eq('id', teamId);

    if (updateError) {
      console.error('Team update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update team image' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      image_url: filePath 
    });

  } catch (error) {
    console.error('Team image upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
