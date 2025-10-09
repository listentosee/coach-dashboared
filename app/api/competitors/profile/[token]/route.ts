import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging/safe-logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Fetch competitor profile by token
    const { token } = await context.params

    const { data: competitor, error } = await supabase
      .from('competitors')
      .select('*')
      .eq('profile_update_token', token)
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
    logger.error('Error fetching competitor profile:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
