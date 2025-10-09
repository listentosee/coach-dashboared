/**
 * Parent Disclosure Report Endpoint
 *
 * FERPA 34 CFR § 99.32 requires schools to maintain a record of each disclosure
 * of personally identifiable information and make those records available to parents.
 *
 * This endpoint provides parents with access to all third-party disclosures
 * of their child's education records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { AuditLogger } from '@/lib/audit/audit-logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { id } = await context.params;

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get competitor to verify ownership
    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select('coach_id, first_name, last_name')
      .eq('id', id)
      .single();

    if (competitorError || !competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    // Check if user is the coach for this competitor (or admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const actingCoachId = isAdmin ? cookieStore.get('admin_coach_id')?.value : null;

    if (!isAdmin && competitor.coach_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (isAdmin && actingCoachId && competitor.coach_id !== actingCoachId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Retrieve all disclosure logs for this competitor
    const disclosureLogs = await AuditLogger.getDisclosures(supabase, id);

    // Also get other relevant audit logs (views, updates, etc.)
    const otherLogs = await AuditLogger.getCompetitorLogs(supabase, {
      competitorId: id,
      actions: ['competitor_viewed', 'competitor_updated', 'competitor_created'],
      limit: 50
    });

    return NextResponse.json({
      competitor: {
        id: competitor.id,
        name: `${competitor.first_name} ${competitor.last_name}`
      },
      disclosures: disclosureLogs,
      activity: otherLogs,
      total_disclosures: disclosureLogs.length
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
