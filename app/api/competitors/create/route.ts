import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const CompetitorSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  is_18_or_over: z.boolean(),
  grade: z.string().optional(),
  email_personal: z.string().email().optional(),
  email_school: z.string().email().optional(),
  game_platform_id: z.string().min(1, 'Student ID is required'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Session user ID:', session.user.id);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CompetitorSchema.parse(body);

    console.log('Validated data:', validatedData);

    // Check if student ID already exists for this coach
    const { data: existingStudent, error: checkError } = await supabase
      .from('competitors')
      .select('id, first_name, last_name')
      .eq('coach_id', session.user.id)
      .eq('game_platform_id', validatedData.game_platform_id)
      .single();

    if (existingStudent) {
      return NextResponse.json({ 
        error: `Student ID ${validatedData.game_platform_id} already exists for ${existingStudent.first_name} ${existingStudent.last_name}` 
      }, { status: 400 });
    }

    // Create competitor record
    const insertData = {
      ...validatedData,
      coach_id: session.user.id,
      status: 'pending'
    };
    
    console.log('Inserting competitor with data:', insertData);

    const { data: competitor, error } = await supabase
      .from('competitors')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create competitor: ' + error.message }, { status: 400 });
    }

    console.log('Competitor created successfully:', competitor);

    // Generate profile update link
    const profileUpdateUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/update-profile/${competitor.profile_update_token}`;

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'competitor_created',
        entity_type: 'competitor',
        entity_id: competitor.id,
        metadata: { 
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          coach_id: session.user.id
        }
      });

    return NextResponse.json({
      competitor,
      profileUpdateUrl
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error creating competitor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
