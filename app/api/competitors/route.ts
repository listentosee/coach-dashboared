import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status'

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
        game_platform_synced_at,
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
      console.error('Database error:', competitorsError);
      return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 400 });
    }

    // Fetch team data separately to avoid complex joins
    const competitorIds = competitors?.map(c => c.id) || [];
    let teamMembersData: any[] = [];
    let agreementsData: any[] = [];
    
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
    }

    // Transform the data to include team information
    const transformedCompetitors = competitors?.map(competitor => {
      const teamMember = teamMembersData.find(tm => tm.competitor_id === competitor.id);
      const computedStatus = calculateCompetitorStatus(competitor as any)
      const latestAgreement = agreementsData.find(a => a.competitor_id === competitor.id) || null
      return {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        email_personal: competitor.email_personal,
        email_school: competitor.email_school,
        parent_email: (competitor as any).parent_email || null,
        is_18_or_over: competitor.is_18_or_over,
        grade: competitor.grade,
        status: computedStatus,
        division: (competitor as any).division || null,
        media_release_date: competitor.media_release_date,
        participation_agreement_date: competitor.participation_agreement_date,
        game_platform_id: competitor.game_platform_id,
        game_platform_synced_at: competitor.game_platform_synced_at,
        profile_update_token: competitor.profile_update_token,
        profile_update_token_expires: competitor.profile_update_token_expires,
        created_at: competitor.created_at,
        is_active: competitor.is_active,
        coach_id: competitor.coach_id,
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
    console.error('Error fetching competitors:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
