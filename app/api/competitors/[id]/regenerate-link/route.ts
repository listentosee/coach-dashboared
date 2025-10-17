import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { logger } from '@/lib/logging/safe-logger';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Authenticate user with Supabase Auth server
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine admin context
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
    const { id } = await context.params
    if (isAdmin && !actingCoachId) {
      return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })
    }

    // Verify the competitor belongs to the correct coach
    let q = supabase
      .from('competitors')
      .select('id, first_name, last_name')
      .eq('id', id)
    if (isAdmin) q = q.eq('coach_id', actingCoachId as string)
    else q = q.eq('coach_id', user.id)
    const { data: competitor, error: fetchError } = await q.single();

    if (fetchError || !competitor) {
      return NextResponse.json({ error: 'Competitor not found or access denied' }, { status: 404 });
    }

    // Generate new profile update token using database function
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('generate_profile_update_token');

    if (tokenError) {
      logger.error('Error generating token:', { error: tokenError instanceof Error ? tokenError.message : String(tokenError) });
      return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
    }

    const newToken = tokenData;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    // Update the competitor with new token
    const { error: updateError } = await supabase
      .from('competitors')
      .update({
        profile_update_token: newToken,
        profile_update_token_expires: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      logger.error('Database error:', { error: updateError instanceof Error ? updateError.message : String(updateError) });
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
          coach_id: isAdmin ? actingCoachId : user.id,
          acting_coach_id: isAdmin ? actingCoachId : undefined
        }
      });

    // Generate the new profile update URL using current request origin (production-safe)
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host')
    const originFromRequest = host ? `${forwardedProto}://${host}` : undefined
    const baseUrl = originFromRequest || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const profileUpdateUrl = `${baseUrl}/update-profile/${newToken}`;

    return NextResponse.json({
      message: 'Profile update link regenerated successfully',
      profileUpdateUrl,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    logger.error('Error regenerating profile link:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
