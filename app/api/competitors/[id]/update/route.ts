import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status';
import { isUserAdmin } from '@/lib/utils/admin-check';
export const dynamic = 'force-dynamic';

const UpdateCompetitorSchema = z.object({
  email_personal: z.string().email('Invalid email').optional().or(z.literal('')).or(z.null()),
  // School email required
  email_school: z.string({ required_error: 'School email is required' }).email('Invalid email'),
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  is_18_or_over: z.coerce.boolean().optional(),
  grade: z.string().optional().or(z.null()),
  division: z.enum(['middle_school','high_school','college']).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication (validated)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateCompetitorSchema.parse(body);

    // Determine admin context
    const isAdmin = await isUserAdmin(supabase, user.id);
    const actingCoachId = isAdmin ? (cookies().get('admin_coach_id')?.value || null) : null
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }
    let verifyQuery = supabase
      .from('competitors')
      .select('id')
      .eq('id', params.id);
    if (!isAdmin) verifyQuery = verifyQuery.eq('coach_id', user.id);
    else verifyQuery = verifyQuery.eq('coach_id', actingCoachId as string);
    const { data: existingCompetitor, error: checkError } = await verifyQuery.single();

    if (checkError || !existingCompetitor) {
      return NextResponse.json({ error: 'Competitor not found or access denied' }, { status: 404 });
    }

    // Build update payload and only include division if provided
    const updatePayload: any = {
      email_personal: validatedData.email_personal || null,
      email_school: validatedData.email_school,
      first_name: validatedData.first_name,
      last_name: validatedData.last_name,
      // if not provided, leave unchanged
      updated_at: new Date().toISOString(),
    }
    if (typeof validatedData.is_18_or_over !== 'undefined') {
      updatePayload.is_18_or_over = validatedData.is_18_or_over as boolean
    }
    if (typeof validatedData.grade !== 'undefined') {
      updatePayload.grade = validatedData.grade || null
    }
    if (typeof validatedData.division !== 'undefined') {
      updatePayload.division = validatedData.division
    }

    // Update competitor record (no returning row to avoid any RLS return friction)
    const { error: upErr } = await supabase
      .from('competitors')
      .update(updatePayload)
      .eq('id', params.id);

    if (upErr) {
      console.error('Competitor update error:', upErr, 'payload:', updatePayload);
      return NextResponse.json({ error: 'Failed to update competitor: ' + upErr.message }, { status: 400 });
    }

    // Fetch the updated competitor row for response and status calc
    const { data: competitor, error: fetchErr } = await supabase
      .from('competitors')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchErr || !competitor) {
      console.error('Competitor fetch after update error:', fetchErr);
      return NextResponse.json({ error: 'Updated competitor not found' }, { status: 400 });
    }

    // Calculate and update status
    const newStatus = calculateCompetitorStatus(competitor);
    const { error: statusError } = await supabase
      .from('competitors')
      .update({ status: newStatus })
      .eq('id', params.id);

    if (statusError) {
      console.error('Status update error:', statusError);
      // Don't fail the entire request, just log the error
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'competitor_updated',
        entity_type: 'competitor',
        entity_id: competitor.id,
        metadata: { 
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          coach_id: competitor.coach_id,
          acting_coach_id: isAdmin ? actingCoachId : undefined
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
