import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Authenticate user with Supabase Auth server
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the competitor belongs to the authenticated coach
    const { data: competitor, error: fetchError } = await supabase
      .from('competitors')
      .select('id, first_name, last_name')
      .eq('id', params.id)
      .eq('coach_id', user.id)
      .single();

    if (fetchError || !competitor) {
      return NextResponse.json({ error: 'Competitor not found or access denied' }, { status: 404 });
    }

    // Generate new profile update token using database function
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('generate_profile_update_token');

    if (tokenError) {
      console.error('Error generating token:', tokenError);
      return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
    }

    const newToken = tokenData;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    // Update the competitor with new token
    const { error: updateError } = await supabase
      .from('competitors')
      .update({
        profile_update_token: newToken,
        profile_update_token_expires: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (updateError) {
      console.error('Database error:', updateError);
      return NextResponse.json({ error: 'Failed to regenerate token: ' + updateError.message }, { status: 400 });
    }

    // Log the activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'profile_link_regenerated',
        entity_type: 'competitor',
        entity_id: competitor.id,
        metadata: { 
          competitor_name: `${competitor.first_name} ${competitor.last_name}`,
          coach_id: user.id
        }
      });

    // Generate the new profile update URL  
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
    const profileUpdateUrl = `${baseUrl}/update-profile/${newToken}`;

    return NextResponse.json({
      message: 'Profile update link regenerated successfully',
      profileUpdateUrl,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Error regenerating profile link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
