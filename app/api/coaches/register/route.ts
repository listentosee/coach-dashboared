import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { GamePlatformClient } from '@/lib/integrations/game-platform/client';
import { logger } from '@/lib/logging/safe-logger';
import { MondayClient } from '@/lib/integrations/monday';
import {
  upsertGamePlatformProfile,
  type GamePlatformSyncStatus,
} from '@/lib/integrations/game-platform/repository';
import { AuditLogger } from '@/lib/audit/audit-logger';
import { assertEmailsUnique, EmailConflictError } from '@/lib/validation/email-uniqueness';

const FEATURE_ENABLED = process.env.GAME_PLATFORM_INTEGRATION_ENABLED === 'true';

/**
 * POST /api/coaches/register
 *
 * Creates a coach profile in local database AND registers them on MetaCTF platform
 * This should be called after Supabase auth.signUp succeeds
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - no user session' }, { status: 401 });
    }

    const body = await request.json();
    const {
      email,
      full_name,
      first_name,
      last_name,
      school_name,
      mobile_number,
      division,
      region,
      monday_coach_id,
      is_approved = true,
    } = body;

    try {
      await assertEmailsUnique({
        supabase,
        emails: [email],
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

    // 1. Create local profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email,
        full_name,
        first_name,
        last_name,
        school_name,
        mobile_number,
        division,
        region: 'IE',
        monday_coach_id,
        is_approved,
        role: 'coach',
        live_scan_completed: false,
        mandated_reporter_completed: false,
      })
      .select()
      .single();

    if (profileError) {
      logger.error('Failed to create coach profile', { error: profileError, userId: user.id });
      return NextResponse.json(
        { error: 'Failed to create profile', details: profileError.message },
        { status: 500 }
      );
    }

    const normalizeStatus = (status?: string | null): GamePlatformSyncStatus => {
      switch (status) {
        case 'approved':
        case 'user_created':
        case 'pending':
        case 'denied':
        case 'error':
          return status;
        default:
          return 'pending';
      }
    };

    // 2. Register coach on MetaCTF (if feature enabled)
    let metactfUserId: string | null = null;
    let metactfStatus: string | null = null;
    let metactfError: string | null = null;

    if (FEATURE_ENABLED) {
      try {
        const gamePlatformClient = new GamePlatformClient({ logger });

        // Build coach user payload - MetaCTF requires syned_school_id and syned_region_id for coaches
        const coachPayload = {
          first_name: first_name || full_name?.split(' ')[0] || 'Coach',
          last_name: last_name || full_name?.split(' ').slice(1).join(' ') || 'User',
          email: email,
          preferred_username:
            `${first_name}.${last_name}`.toLowerCase().replace(/[^a-z0-9._-]/g, '') || user.id,
          role: 'coach' as const,
          syned_user_id: user.id,
          syned_school_id: school_name || 'Unknown School',
          syned_region_id: 'IE',
        };

        // Try to get existing user first
        let metactfResponse;
        try {
          metactfResponse = await gamePlatformClient.getUser({ syned_user_id: user.id });
          metactfUserId = metactfResponse.syned_user_id;
          metactfStatus = metactfResponse.metactf_user_status;
          logger.info('Coach already exists on MetaCTF', { userId: user.id, status: metactfStatus });
        } catch (getUserError: any) {
          // If 404, create new user
          if (getUserError?.status === 404) {
            logger.info('Creating new coach on MetaCTF', { userId: user.id });
            metactfResponse = await gamePlatformClient.createUser(coachPayload);
            metactfUserId = metactfResponse.syned_user_id;
            metactfStatus = metactfResponse.metactf_user_status || null;
            logger.info('Created coach on MetaCTF', {
              userId: user.id,
              metactfUserId,
              status: metactfStatus,
            });
            await AuditLogger.logAction(supabase, {
              user_id: user.id,
              action: 'data_disclosed_game_platform',
              entity_type: 'coach',
              entity_id: user.id,
              metadata: {
                disclosure_type: 'coach_registration',
                payload: coachPayload,
                metactf_user_id: metactfUserId,
                metactf_status: metactfStatus,
              },
            });
          } else {
            throw getUserError;
          }
        }

        // Update local profile with MetaCTF user ID
        if (metactfUserId) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              game_platform_user_id: metactfUserId,
              game_platform_last_synced_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          if (updateError) {
            logger.warn('Failed to update profile with MetaCTF user ID', {
              error: updateError,
              userId: user.id,
            });
          }

          try {
            await upsertGamePlatformProfile(supabase, {
              coachId: user.id,
              metactfRole: 'coach',
              synedUserId: metactfUserId,
              metactfUserId: metactfResponse?.metactf_user_id ?? null,
              metactfUsername: metactfResponse?.metactf_username ?? null,
              status: normalizeStatus(metactfStatus),
              syncError: metactfError,
              lastSyncedAt: new Date().toISOString(),
            });
          } catch (repoError: any) {
            logger.warn('Failed to persist game platform coach mapping', {
              error: repoError?.message,
              userId: user.id,
            });
          }
        }
      } catch (error: any) {
        // Log error but don't fail registration - coach can still use the platform
        metactfError = error?.message || 'Unknown MetaCTF error';
        logger.error('Failed to register coach on MetaCTF', { error, userId: user.id });
      }
    }

    // 3. Update Monday.com status to "Synced to Dashboard" after successful registration
    if (monday_coach_id) {
      try {
        const mondayClient = new MondayClient();
        // Status index "9" corresponds to "Synced To Dashboard" in Monday.com
        const statusUpdated = await mondayClient.updateCoachStatus(monday_coach_id, '9');

        if (statusUpdated) {
          logger.info('Updated Monday.com status to "Synced to Dashboard"', {
            userId: user.id,
            mondayCoachId: monday_coach_id,
          });
        } else {
          logger.warn('Failed to update Monday.com status', {
            userId: user.id,
            mondayCoachId: monday_coach_id,
          });
        }
      } catch (error: any) {
        // Log error but don't fail registration - coach is already onboarded
        logger.error('Error updating Monday.com status', {
          error,
          userId: user.id,
          mondayCoachId: monday_coach_id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      profile,
      metactf: {
        enabled: FEATURE_ENABLED,
        userId: metactfUserId,
        status: metactfStatus,
        error: metactfError,
      },
    });
  } catch (error: any) {
    logger.error('Coach registration failed', { error: error?.message });
    return NextResponse.json(
      { error: 'Registration failed', details: error?.message },
      { status: 500 }
    );
  }
}
