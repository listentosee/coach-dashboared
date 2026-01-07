import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { logger } from '@/lib/logging/safe-logger';
import { maybeAutoOnboardCompetitor } from '@/lib/integrations/game-platform/auto-onboard';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const agreementId = formData.get('agreementId') as string;

    if (!file || !agreementId) {
      return NextResponse.json(
        { error: 'Missing file or agreement ID', error_code: 'missing_parameters' },
        { status: 400 }
      );
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Enforce caller authorization (admin coach context or coach ownership)
    const cookieStore = await cookies()
    const authed = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await authed.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', error_code: 'unauthorized' },
        { status: 401 }
      )
    }
    const { data: profile } = await authed.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
    if (isAdmin && !actingCoachId) {
      return NextResponse.json(
        { error: 'Select a coach context to edit', error_code: 'missing_admin_context' },
        { status: 403 }
      )
    }

    // Get the agreement details
    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .select('competitor_id, template_kind, request_id, status')
      .eq('id', agreementId)
      .single();

    if (agreementError || !agreement) {
      return NextResponse.json(
        {
          error: 'Agreement not found',
          error_code: 'agreement_not_found',
          details: agreementError?.message
        },
        { status: 404 }
      );
    }

    // Ownership check: ensure caller has rights to the agreement's competitor
    const { data: comp } = await supabase.from('competitors').select('coach_id').eq('id', agreement.competitor_id).single()
    if (!isAdmin && comp && comp.coach_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied', error_code: 'coach_mismatch' },
        { status: 403 }
      )
    }
    if (isAdmin && actingCoachId && comp && comp.coach_id !== actingCoachId) {
      return NextResponse.json(
        {
          error: 'Target not owned by selected coach',
          error_code: 'admin_context_mismatch'
        },
        { status: 403 }
      )
    }

    // Check if already completed
    if (agreement.status === 'completed' || agreement.status === 'completed_manual') {
      return NextResponse.json(
        { error: 'Agreement already completed', error_code: 'already_completed' },
        { status: 400 }
      );
    }

    // Step 1: Upload file to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = file.name.split('.').pop();
    const fileName = `manual-upload-${agreement.request_id}-${timestamp}.${fileExtension}`;
    const filePath = `manual/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('signatures')
      .upload(filePath, fileBuffer, {
        contentType: file.type || 'application/pdf',
        upsert: false, // Prevent overwrites
      });

    if (uploadError) {
      const detail = uploadError?.message || 'Unknown storage error';
      logger.error('Storage upload failed', { error: detail });
      const status =
        typeof (uploadError as any)?.statusCode === 'number'
          ? (uploadError as any).statusCode
          : 502;
      return NextResponse.json(
        {
          error: 'Unable to store file in signatures bucket',
          error_code: 'storage_upload_failed',
          details: detail
        },
        { status }
      );
    }

    // Step 2: Recall Zoho request
    let recallSuccess = false;
    let deleteSuccess = false;

    try {
      const { getZohoAccessToken } = await import('../_lib/token');
      const accessToken = await getZohoAccessToken();

      // Recall the document (cancel signing process)
      const recallResponse = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${agreement.request_id}/recall`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Manual completion' })
      });

      if (recallResponse.ok) {
        recallSuccess = true;
      } else {
        logger.warn('Zoho recall failed', { status: recallResponse.status });
      }

      // Step 3: Delete Zoho request (move to trash)
      if (recallSuccess) {
        const deleteResponse = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${agreement.request_id}/delete`, {
          method: 'PUT',
          headers: { 
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            recall_inprogress: true, 
            reason: 'Manual completion' 
          })
        });

        if (deleteResponse.ok) {
          deleteSuccess = true;
        } else {
          logger.warn('Zoho deletion failed', { status: deleteResponse.status });
        }
      }

    } catch (zohoError) {
      logger.warn('Zoho API error', { error: zohoError instanceof Error ? zohoError.message : 'Unknown error' });
      // Continue with local updates even if Zoho operations fail
    }

    // Step 4: Update local database
    const updateData: any = {
      status: 'completed_manual',
      completion_source: 'manual',
      manual_completion_reason: 'Manual completion',
      manual_uploaded_path: filePath,
      manual_completed_at: new Date().toISOString(),
      // Expose the manually uploaded file via the common field used by the UI download button
      signed_pdf_path: filePath,
      updated_at: new Date().toISOString()
    };

    // Track Zoho cleanup status if operations failed
    if (!recallSuccess || !deleteSuccess) {
      updateData.zoho_request_status = 'cleanup_pending';
      updateData.manual_completion_reason = `Manual completion (Zoho cleanup ${!recallSuccess ? 'recall failed' : 'delete failed'})`;
    }

    const { error: updateError } = await supabase
      .from('agreements')
      .update(updateData)
      .eq('id', agreementId);

    if (updateError) {
      logger.error('Agreement update failed', { error: updateError.message });
      return NextResponse.json(
        {
          error: 'Failed to update agreement record',
          error_code: 'agreement_update_failed',
          details: updateError.message
        },
        { status: 500 }
      );
    }

    // Step 5: Update competitor record with agreement date
    const dateField = agreement.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
    const { error: competitorError } = await supabase
      .from('competitors')
      .update({ [dateField]: new Date().toISOString() })
      .eq('id', agreement.competitor_id);

    if (competitorError) {
      logger.error('Competitor update failed', { error: competitorError.message });
      return NextResponse.json(
        {
          error: 'Failed to update competitor record',
          error_code: 'competitor_update_failed',
          details: competitorError.message
        },
        { status: 500 }
      );
    }

    // Step 6: Recalculate and update competitor status
    const { data: updatedCompetitor } = await supabase
      .from('competitors')
      .select('*')
      .eq('id', agreement.competitor_id)
      .single();

    if (updatedCompetitor) {
      const { calculateCompetitorStatus } = await import('@/lib/utils/competitor-status');
      const previousStatus = updatedCompetitor.status;
      const newStatus = calculateCompetitorStatus(updatedCompetitor);
      
      await supabase
        .from('competitors')
        .update({ status: newStatus })
        .eq('id', agreement.competitor_id);

      await maybeAutoOnboardCompetitor({
        supabase,
        competitorId: agreement.competitor_id,
        previousStatus,
        nextStatus: newStatus,
        coachContextId: isAdmin ? actingCoachId : user.id,
        userId: user.id,
        logger,
      });
    }

    return NextResponse.json({
      ok: true,
      message: 'Document uploaded and agreement marked as manually completed',
      filePath,
      zohoCleanup: { recallSuccess, deleteSuccess }
    });

  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Manual upload failed', { error: detail });
    return NextResponse.json(
      {
        error: 'Manual upload failed due to an unexpected error',
        error_code: 'manual_upload_unhandled',
        details: detail
      },
      { status: 500 }
    );
  }
}
