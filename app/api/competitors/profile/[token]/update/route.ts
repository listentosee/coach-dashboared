import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status';
import { logger } from '@/lib/logging/safe-logger';
import { assertEmailsUnique, EmailConflictError } from '@/lib/validation/email-uniqueness';

const yearsCompetingSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? trimmed : parsed;
    }
    return value;
  },
  z
    .number({ required_error: 'Years competing is required' })
    .min(0, 'Years competing must be between 0 and 20 years')
    .max(20, 'Years competing must be between 0 and 20 years')
);

const ProfileUpdateSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  grade: z.string().min(1, 'Grade is required'),
  gender: z.string().min(1, 'Gender is required'),
  race: z.string().min(1, 'Race is required'),
  ethnicity: z.string().min(1, 'Ethnicity is required'),
  years_competing: yearsCompetingSchema,
  level_of_technology: z.string().min(1, 'Level of technology is required'),
  email_personal: z.string().email('Valid email is required').optional(),
  parent_name: z.string().optional(),
  parent_email: z.string().email('Valid email is required').optional(),
  competition_type: z.enum(['trove', 'gymnasium', 'mayors_cup']),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Parse and validate request body
    const body = await request.json();
    const validatedData = ProfileUpdateSchema.parse(body);

    // First, get the competitor by token to verify it exists and get the ID
    const { token } = await context.params

    const { data: existingCompetitor, error: fetchError } = await supabase
      .from('competitors')
      .select('id, profile_update_token_expires')
      .eq('profile_update_token', token)
      .single();

    if (fetchError || !existingCompetitor) {
      return NextResponse.json({ error: 'Profile not found or token expired' }, { status: 404 });
    }

    // Check if token is expired
    if (existingCompetitor.profile_update_token_expires && new Date(existingCompetitor.profile_update_token_expires) < new Date()) {
      return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
    }

    try {
      await assertEmailsUnique({
        supabase,
        emails: [validatedData.email_personal],
        ignoreCompetitorIds: [existingCompetitor.id],
      });
    } catch (error) {
      if (error instanceof EmailConflictError) {
        return NextResponse.json({
          error: 'Email already in use',
          details: error.details,
        }, { status: 409 });
      }
      throw error;
    }

    // Update competitor profile
    const { data: competitor, error: updateError } = await supabase
      .from('competitors')
      .update({
        grade: validatedData.grade,
        gender: validatedData.gender,
        race: validatedData.race,
        ethnicity: validatedData.ethnicity,
        years_competing: validatedData.years_competing,
        level_of_technology: validatedData.level_of_technology,
        email_personal: validatedData.email_personal || null,
        parent_name: validatedData.parent_name || null,
        parent_email: validatedData.parent_email || null,
        // Immediately invalidate the magic link after successful update
        profile_update_token: null,
        profile_update_token_expires: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingCompetitor.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Database error:', { error: updateError instanceof Error ? updateError.message : String(updateError) });
      return NextResponse.json({ error: 'Failed to update profile: ' + updateError.message }, { status: 400 });
    }

    // Calculate and update status
    const newStatus = calculateCompetitorStatus(competitor);
    const { error: statusError } = await supabase
      .from('competitors')
      .update({ status: newStatus })
      .eq('id', existingCompetitor.id);

    if (statusError) {
      logger.error('Status update error:', { error: statusError instanceof Error ? statusError.message : String(statusError) });
      // Don't fail the entire request, just log the error
    }

    return NextResponse.json({
      competitor,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    logger.error('Error updating competitor profile:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
