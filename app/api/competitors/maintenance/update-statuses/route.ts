import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { updateAllCompetitorStatuses } from '@/lib/utils/competitor-status';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a coach
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'coach') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update all competitor statuses
    const result = await updateAllCompetitorStatuses(supabase);

    // Log detailed errors if any occurred
    if (result.errors > 0) {
      console.error('Bulk status update errors:', result.errorDetails);
    }

    // Log the maintenance activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action: 'bulk_status_update',
        entity_type: 'competitors',
        metadata: { 
          updated: result.updated,
          errors: result.errors,
          total: result.total,
          errorDetails: result.errorDetails,
          coach_id: user.id
        }
      });

    return NextResponse.json({
      message: 'Status update completed',
      result
    });

  } catch (error) {
    console.error('Error updating competitor statuses:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
