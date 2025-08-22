import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the authenticated user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch competitors with team information
    const { data: competitors, error: competitorsError } = await supabase
      .from('competitors')
      .select(`
        id,
        first_name,
        last_name,
        grade,
        email_school,
        team_members!inner(
          team_id,
          position
        )
      `)
      .eq('coach_id', session.user.id)
      .order('last_name', { ascending: true });

    if (competitorsError) {
      console.error('Database error:', competitorsError);
      return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 400 });
    }

    // Transform the data to include team_id
    const transformedCompetitors = competitors?.map(competitor => ({
      id: competitor.id,
      first_name: competitor.first_name,
      last_name: competitor.last_name,
      grade: competitor.grade,
      email_school: competitor.email_school,
      team_id: competitor.team_members?.[0]?.team_id || null,
      position: competitor.team_members?.[0]?.position || null,
    })) || [];

    return NextResponse.json({
      competitors: transformedCompetitors
    });

  } catch (error) {
    console.error('Error fetching competitors:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
