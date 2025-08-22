import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Fetch competitor profile by token
    const { data: competitor, error } = await supabase
      .from('competitors')
      .select('*')
      .eq('profile_update_token', params.token)
      .single();

    if (error || !competitor) {
      return NextResponse.json({ error: 'Profile not found or token expired' }, { status: 404 });
    }

    // Check if token is expired
    if (competitor.profile_update_token_expires && new Date(competitor.profile_update_token_expires) < new Date()) {
      return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
    }

    return NextResponse.json({
      profile: competitor
    });

  } catch (error) {
    console.error('Error fetching competitor profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
