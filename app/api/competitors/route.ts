import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { logger } from '@/lib/logging/safe-logger';
import type { GamePlatformProfileRecord } from '@/lib/integrations/game-platform/repository';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Authenticate user with Supabase Auth server
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const isAdmin = await isUserAdmin(supabase, user.id);
    const coachContext = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null;

    // Build the query - admins see all, coaches see only their own
    let query = supabase
      .from('competitors')
      .select(`
        id,
        first_name,
        last_name,
        email_personal,
        email_school,
        is_18_or_over,
        grade,
        division,
        program_track,
        parent_name,
        parent_email,
        gender,
        race,
        ethnicity,
        level_of_technology,
        years_competing,
        status,
        media_release_date,
        participation_agreement_date,
        game_platform_id,
        game_platform_onboarding_email,
        game_platform_synced_at,
        game_platform_sync_error,
        profile_update_token,
        profile_update_token_expires,
        created_at,
        is_active,
        coach_id
      `);

    // Apply coach filtering only for non-admin users
    if (!isAdmin) {
      query = query.eq('coach_id', user.id);
    } else if (coachContext) {
      query = query.eq('coach_id', coachContext);
    }

    // Execute the query
    const { data: competitors, error: competitorsError } = await query
      .order('last_name', { ascending: true });

    if (competitorsError) {
      logger.error('Database error:', { error: competitorsError instanceof Error ? competitorsError.message : String(competitorsError) });
      return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 400 });
    }

    // Prefetch coach profiles for admin view context hints
    const coachLookup = new Map<string, { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null }>()
    const coachIds = (competitors || [])
      .map((c) => c.coach_id)
      .filter((id): id is string => !!id);

    if (coachIds.length) {
      const uniqueIds = Array.from(new Set(coachIds));
      const { data: coachProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email')
        .in('id', uniqueIds);

      for (const coach of coachProfiles || []) {
        coachLookup.set(coach.id, coach);
      }
    }

    // Fetch team data separately to avoid complex joins
    const competitorIds = competitors?.map(c => c.id) || [];
    let teamMembersData: any[] = [];
    let agreementsData: any[] = [];
    
    let profileMappings: GamePlatformProfileRecord[] = [];
    let syncStates: Array<{ synced_user_id: string; last_login_at: string | null }> = [];
    const mappingByCompetitorId = new Map<string, GamePlatformProfileRecord>();

    if (competitorIds.length > 0) {
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('team_members')
        .select(`
          competitor_id,
          team_id,
          position,
          teams!inner(name)
        `)
        .in('competitor_id', competitorIds);
      
      if (!teamMembersError) {
        teamMembersData = teamMembers || [];
      }

      // Fetch latest agreements ordered by created_at (for each competitor)
      const { data: aggs, error: aggsErr } = await supabase
        .from('agreements')
        .select('competitor_id, status, metadata, created_at')
        .in('competitor_id', competitorIds)
        .order('created_at', { ascending: false })
      if (!aggsErr) agreementsData = aggs || []

      const { data: mappingData, error: mappingError } = await supabase
        .from('game_platform_profiles')
        .select('*')
        .in('competitor_id', competitorIds);

      if (mappingError) {
        logger.error('Failed to load game platform mappings', { error: mappingError instanceof Error ? mappingError.message : String(mappingError) });
      } else {
        profileMappings = mappingData || [];
      }

      for (const mapping of profileMappings) {
        if (mapping.competitor_id) {
          mappingByCompetitorId.set(mapping.competitor_id, mapping);
        }
      }

      const syncedIds = (competitors || [])
        .map((c) => {
          const mapping = mappingByCompetitorId.get(c.id);
          return c.game_platform_id || mapping?.synced_user_id || null;
        })
        .filter((value): value is string => Boolean(value));

      const uniqueSyncedIds = Array.from(new Set(syncedIds));
      if (uniqueSyncedIds.length) {
        const { data: syncStateData, error: syncStateError } = await supabase
          .from('game_platform_sync_state')
          .select('synced_user_id, last_login_at')
          .in('synced_user_id', uniqueSyncedIds);

        if (syncStateError) {
          logger.error('Failed to load game platform sync state', { error: syncStateError.message });
        } else {
          syncStates = syncStateData || [];
        }
      }
    }

    const syncStateByUserId = new Map<string, { last_login_at: string | null }>();
    for (const state of syncStates) {
      if (state?.synced_user_id) {
        syncStateByUserId.set(state.synced_user_id, { last_login_at: state.last_login_at ?? null });
      }
    }

    // Transform the data to include team information
    const transformedCompetitors = competitors?.map(competitor => {
      const teamMember = teamMembersData.find(tm => tm.competitor_id === competitor.id);
      const latestAgreement = agreementsData.find(a => a.competitor_id === competitor.id) || null
      const coachProfile = competitor.coach_id ? coachLookup.get(competitor.coach_id) : null
      const joinedName = coachProfile ? [coachProfile.first_name, coachProfile.last_name].filter(Boolean).join(' ').trim() : ''
      const coachFullName = coachProfile?.full_name?.trim() || joinedName
      const coachLabel = coachFullName || coachProfile?.email || null
      const mapping = mappingByCompetitorId.get(competitor.id) ?? null
      const syncedUserId = competitor.game_platform_id || mapping?.synced_user_id || null;
      const syncState = syncedUserId ? syncStateByUserId.get(syncedUserId) : null;

      return {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        email_personal: competitor.email_personal,
        email_school: competitor.email_school,
        game_platform_onboarding_email: (competitor as any).game_platform_onboarding_email || null,
        parent_name: (competitor as any).parent_name || null,
        parent_email: (competitor as any).parent_email || null,
        is_18_or_over: competitor.is_18_or_over,
        grade: competitor.grade,
        status: competitor.status,
        division: (competitor as any).division || null,
        program_track: (competitor as any).program_track || null,
        media_release_date: competitor.media_release_date,
        participation_agreement_date: competitor.participation_agreement_date,
        game_platform_id: syncedUserId,
        game_platform_synced_at: competitor.game_platform_synced_at ?? mapping?.last_synced_at ?? null,
        game_platform_sync_error: (competitor as any).game_platform_sync_error || mapping?.sync_error || null,
        game_platform_status: mapping?.status ?? null,
        game_platform_last_login_at: syncState?.last_login_at ?? null,
        profile_update_token: competitor.profile_update_token,
        profile_update_token_expires: competitor.profile_update_token_expires,
        created_at: competitor.created_at,
        is_active: competitor.is_active,
        coach_id: competitor.coach_id,
        coach_name: coachFullName || null,
        coach_email: coachProfile?.email || null,
        team_id: teamMember?.team_id || null,
        position: teamMember?.position || null,
        team_name: teamMember?.teams?.name || null,
        agreement_status: latestAgreement?.status || null,
        agreement_mode: latestAgreement?.metadata?.mode || null,
      };
    }) || [];

    return NextResponse.json({
      competitors: transformedCompetitors,
      isAdmin
    });

  } catch (error) {
    logger.error('Error fetching competitors:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
