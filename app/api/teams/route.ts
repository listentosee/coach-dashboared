import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isUserAdmin } from '@/lib/utils/admin-check';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    const coachContext = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null;

    let query = supabase
      .from('teams')
      .select('id, name, coach_id, image_url')
      .order('name', { ascending: true });

    if (!isAdmin) {
      query = query.eq('coach_id', user.id);
    } else if (coachContext) {
      query = query.eq('coach_id', coachContext);
    }

    const { data: teams, error: teamsError } = await query;

    if (teamsError) {
      console.error('Database error:', teamsError);
      return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 400 });
    }

    const transformedTeams = teams?.map(team => ({
      id: team.id,
      name: team.name,
      image_url: team.image_url,
      ...(isAdmin && { coach_id: team.coach_id })
    })) || [];

    return NextResponse.json({
      teams: transformedTeams,
      isAdmin
    });

  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
