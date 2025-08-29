import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { coachId, duration = 24 } = await request.json();
    
    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID is required' }, { status: 400 });
    }

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify the coach exists
    const { data: coach, error: coachError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', coachId)
      .eq('role', 'coach')
      .single();

    if (coachError || !coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    // Determine the correct redirect URL based on environment
    let redirectUrl: string;
    
    if (process.env.VERCEL_URL) {
      // Production - use Vercel URL
      redirectUrl = `https://${process.env.VERCEL_URL}/dashboard`;
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      // Custom environment variable
      redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
    } else {
      // Development fallback
      redirectUrl = 'http://localhost:3000/dashboard';
    }

    console.log('Generating magic link with redirect URL:', redirectUrl);

    // Generate magic link for the coach
    const { data: magicLinkData, error: magicLinkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: coach.email,
      options: {
        redirectTo: redirectUrl
      }
    });

    if (magicLinkError) {
      console.error('Error generating magic link:', magicLinkError);
      return NextResponse.json({ 
        error: 'Failed to generate access link',
        details: magicLinkError.message 
      }, { status: 500 });
    }

    if (!magicLinkData?.properties?.action_link) {
      console.error('Magic link generated but no action_link found:', magicLinkData);
      return NextResponse.json({ 
        error: 'Magic link generated but invalid response format',
        details: 'No action_link in response'
      }, { status: 500 });
    }

    // Log the admin action
    await supabase
      .from('activity_logs')
      .insert({
        user_id: coachId, // This will be the admin's ID when we implement proper admin tracking
        action: 'admin_generated_coach_access',
        entity_type: 'profiles',
        metadata: {
          coach_id: coachId,
          coach_email: coach.email,
          duration_hours: duration,
          generated_by: 'system_admin',
          redirect_url: redirectUrl
        }
      });

    return NextResponse.json({
      success: true,
      message: `Access link generated for ${coach.full_name}`,
      data: {
        coach: {
          id: coach.id,
          email: coach.email,
          full_name: coach.full_name
        },
        accessLink: magicLinkData.properties.action_link,
        expiresIn: `${duration} hours`,
        redirectUrl: redirectUrl
      }
    });

  } catch (error) {
    console.error('Error generating coach access link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
