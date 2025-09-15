import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const ToggleActiveSchema = z.object({
  is_active: z.boolean(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication (validated with Auth server)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = ToggleActiveSchema.parse(body);

    // Verify the competitor belongs to the authenticated coach
    const { data: existingCompetitor, error: checkError } = await supabase
      .from('competitors')
      .select('id')
      .eq('id', params.id)
      .eq('coach_id', user.id)
      .single();

    if (checkError || !existingCompetitor) {
      return NextResponse.json({ error: 'Competitor not found or access denied' }, { status: 404 });
    }

    // Update competitor active status
    const { data: competitor, error } = await supabase
      .from('competitors')
      .update({
        is_active: validatedData.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update competitor status: ' + error.message }, { status: 400 });
    }

    return NextResponse.json({
      competitor,
      message: `Competitor ${validatedData.is_active ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error updating competitor status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
