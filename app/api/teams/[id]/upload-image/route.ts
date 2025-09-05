import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: teamId } = params;
    
    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Create authenticated client (respects RLS)
    const supabase = createRouteHandlerClient({ cookies });

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
