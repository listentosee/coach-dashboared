import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const UpdateCompetitorSchema = z.object({
  email_personal: z.string().email('Invalid email').optional().or(z.literal('')),
  email_school: z.string().email('Invalid email').optional().or(z.literal('')),
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  is_18_or_over: z.boolean(),
  grade: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateCompetitorSchema.parse(body);

    // Verify the competitor belongs to the authenticated coach
    const { data: existingCompetitor, error: checkError } = await supabase
      .from('competitors')
      .select('id')
      .eq('id', params.id)
      .eq('coach_id', session.user.id)
      .single();

    if (checkError || !existingCompetitor) {
      return NextResponse.json({ error: 'Competitor not found or access denied' }, { status: 404 });
    }

    // Update competitor record
    const { data: competitor, error } = await supabase
      .from('competitors')
      .update({
        email_personal: validatedData.email_personal || null,
        email_school: validatedData.email_school || null,
        first_name: validatedData.first_name,
        last_name: validatedData.last_name,
        is_18_or_over: validatedData.is_18_or_over,
        grade: validatedData.grade || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update competitor: ' + error.message }, { status: 400 });
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'competitor_updated',
        entity_type: 'competitor',
        entity_id: competitor.id,
        metadata: { 
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          coach_id: session.user.id
        }
      });

    return NextResponse.json({
      competitor,
      message: 'Competitor updated successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error updating competitor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
