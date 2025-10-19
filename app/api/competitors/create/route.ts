import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logger } from '@/lib/logging/safe-logger';
import { assertEmailsUnique, EmailConflictError } from '@/lib/validation/email-uniqueness';
import { upsertGamePlatformProfile } from '@/lib/integrations/game-platform/repository';

const CompetitorSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  // Some UIs post undefined/null; coerce to boolean when present
  is_18_or_over: z.coerce.boolean().optional(),
  grade: z.string().optional().or(z.null()),
  email_personal: z.string().email().optional().or(z.literal('')).or(z.null()),
  // School email required for all participants
  email_school: z.string({ required_error: 'School email is required' }).email('Invalid school email'),
  // Optional at creation; may be assigned later in the lifecycle
  game_platform_id: z.string().min(1).optional(),
  division: z.enum(['middle_school','high_school','college']).optional(),
  program_track: z.enum(['traditional','adult_ed']).optional().or(z.literal('')).or(z.null()),
});

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication (server-validated)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine acting context
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CompetitorSchema.parse(body);

    logger.info('Competitor validation successful', {
      game_platform_id: validatedData.game_platform_id,
      division: validatedData.division
    });

    try {
      await assertEmailsUnique({
        supabase,
        emails: [validatedData.email_school, validatedData.email_personal],
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

    // Check if student ID already exists for this coach (only if provided)
    if (validatedData.game_platform_id) {
      const { data: existingStudent } = await supabase
        .from('competitors')
        .select('id, first_name, last_name')
        .eq('coach_id', isAdmin ? (actingCoachId as string) : user.id)
        .eq('game_platform_id', validatedData.game_platform_id)
        .maybeSingle();
      if (existingStudent) {
        return NextResponse.json({ 
          error: `Student ID ${validatedData.game_platform_id} already exists for ${existingStudent.first_name} ${existingStudent.last_name}` 
        }, { status: 400 });
      }
    }

    // Create competitor record
    const division = validatedData.division || null;
    let programTrack: string | null = null;
    if (division === 'college') {
      const incoming = (validatedData.program_track || '').trim().toLowerCase();
      programTrack = incoming === 'adult_ed' ? 'adult_ed' : 'traditional';
    }

    const insertData = {
      coach_id: isAdmin ? (actingCoachId as string) : user.id,
      first_name: validatedData.first_name,
      last_name: validatedData.last_name,
      is_18_or_over: typeof validatedData.is_18_or_over === 'boolean' ? validatedData.is_18_or_over : null,
      grade: validatedData.grade || null,
      email_personal: validatedData.email_personal || null,
      email_school: validatedData.email_school,
      game_platform_id: validatedData.game_platform_id || null,
      division,
      program_track: programTrack,
      status: 'pending'
    } as any;

    logger.info('Creating competitor record', {
      coach_id: insertData.coach_id,
      game_platform_id: insertData.game_platform_id,
      division: insertData.division
    });

    const { data: competitor, error } = await supabase
      .from('competitors')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create competitor', { error: error.message, code: error.code });
      return NextResponse.json({ error: 'Failed to create competitor: ' + error.message }, { status: 400 });
    }

    logger.info('Competitor created successfully', { competitor_id: competitor.id });

    if (validatedData.game_platform_id) {
      try {
        await upsertGamePlatformProfile(supabase, {
          competitorId: competitor.id,
          metactfRole: 'user',
          syncedUserId: validatedData.game_platform_id,
          status: 'pending',
          syncError: null,
          lastSyncedAt: null,
        });
      } catch (repoError: any) {
        logger.warn('Failed to persist competitor MetaCTF mapping from manual ID', {
          error: repoError?.message,
          competitorId: competitor.id,
        });
      }
    }

    // Generate profile update link using current request origin (production-safe)
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host')
    const originFromRequest = host ? `${forwardedProto}://${host}` : undefined
    const baseUrl = originFromRequest || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const profileUpdateUrl = `${baseUrl}/update-profile/${competitor.profile_update_token}`;

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'competitor_created',
        entity_type: 'competitor',
        entity_id: competitor.id,
        metadata: { 
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          coach_id: insertData.coach_id,
          acting_coach_id: isAdmin ? actingCoachId : undefined
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

    logger.error('Error creating competitor', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
