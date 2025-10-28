import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getZohoAccessToken } from '../_lib/token';
import { logger } from '@/lib/logging/safe-logger';
import { AuditLogger } from '@/lib/audit/audit-logger';

type CancelBody = {
  agreementId?: string;
  reason?: string;
};

const TERMINAL_STATUSES = new Set([
  'completed',
  'completed_manual',
  'declined',
  'expired',
]);

export async function POST(req: NextRequest) {
  let body: CancelBody;

  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', error_code: 'invalid_body' },
      { status: 400 },
    );
  }

  const agreementId = body.agreementId;
  const reason =
    body.reason?.trim() ||
    'Coach initiated cancellation to prepare manual override.';

  if (!agreementId) {
    return NextResponse.json(
      { error: 'Agreement ID is required', error_code: 'missing_agreement_id' },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const cookieStore = await cookies();
    const authed = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    const {
      data: { user },
    } = await authed.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', error_code: 'unauthorized' },
        { status: 401 },
      );
    }

    const { data: profile } = await authed
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const actingCoachId = isAdmin
      ? cookieStore.get('admin_coach_id')?.value || null
      : null;

    if (isAdmin && !actingCoachId) {
      return NextResponse.json(
        { error: 'Select a coach context to edit', error_code: 'missing_admin_context' },
        { status: 403 },
      );
    }

    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .select(
        'id, competitor_id, template_kind, status, request_id, metadata, provider, signers, signed_pdf_path',
      )
      .eq('id', agreementId)
      .single();

    if (agreementError || !agreement) {
      return NextResponse.json(
        {
          error: 'Agreement not found',
          error_code: 'agreement_not_found',
          details: agreementError?.message,
        },
        { status: 404 },
      );
    }

    if (agreement.provider !== 'zoho') {
      return NextResponse.json(
        {
          error: 'Only Zoho agreements can be cancelled via this endpoint',
          error_code: 'unsupported_provider',
        },
        { status: 400 },
      );
    }

    if (TERMINAL_STATUSES.has(agreement.status)) {
      return NextResponse.json(
        {
          error: 'Agreement has already reached a terminal status',
          error_code: 'agreement_terminal',
        },
        { status: 409 },
      );
    }

    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select('coach_id, first_name, last_name')
      .eq('id', agreement.competitor_id)
      .single();

    if (competitorError || !competitor) {
      return NextResponse.json(
        {
          error: 'Competitor not found for agreement',
          error_code: 'competitor_not_found',
        },
        { status: 404 },
      );
    }

    if (!isAdmin && competitor.coach_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied', error_code: 'coach_mismatch' },
        { status: 403 },
      );
    }

    if (isAdmin && actingCoachId && competitor.coach_id !== actingCoachId) {
      return NextResponse.json(
        {
          error: 'Target not owned by selected coach',
          error_code: 'admin_context_mismatch',
        },
        { status: 403 },
      );
    }

    let recallSuccess = false;
    let deleteSuccess = false;

    try {
      const accessToken = await getZohoAccessToken();

      const recallResponse = await fetch(
        `${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${agreement.request_id}/recall`,
        {
          method: 'POST',
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason }),
        },
      );

      if (recallResponse.ok) {
        recallSuccess = true;
      } else {
        logger.warn('Zoho recall failed during cancellation', {
          status: recallResponse.status,
          agreement_id: agreement.id,
        });
      }

      if (recallSuccess) {
        const deleteResponse = await fetch(
          `${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${agreement.request_id}/delete`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ recall_inprogress: true, reason }),
          },
        );

        if (deleteResponse.ok) {
          deleteSuccess = true;
        } else {
          logger.warn('Zoho delete failed during cancellation', {
            status: deleteResponse.status,
            agreement_id: agreement.id,
          });
        }
      }
    } catch (zohoError) {
      logger.warn('Zoho API error while cancelling agreement', {
        agreement_id: agreement.id,
        error: zohoError instanceof Error ? zohoError.message : 'Unknown error',
      });
    }

    if (
      agreement.signed_pdf_path &&
      agreement.signed_pdf_path.startsWith('print-ready/')
    ) {
      const { error: storageError } = await supabase.storage
        .from('signatures')
        .remove([agreement.signed_pdf_path]);

      if (storageError) {
        logger.warn('Failed to remove print-ready PDF during cancellation', {
          agreement_id: agreement.id,
          error: storageError.message,
        });
      }
    }

    const { error: deleteError } = await supabase
      .from('agreements')
      .delete()
      .eq('id', agreement.id);

    if (deleteError) {
      logger.error('Failed to delete agreement during cancellation', {
        agreement_id: agreement.id,
        error: deleteError.message,
      });
      return NextResponse.json(
        {
          error: 'Failed to remove agreement record',
          error_code: 'agreement_delete_failed',
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    await AuditLogger.logAgreement(supabase, {
      agreementId: agreement.id,
      competitorId: agreement.competitor_id,
      action: 'agreement_voided',
      userId: user.id,
      metadata: {
        provider: agreement.provider,
        template_kind: agreement.template_kind,
        request_id: agreement.request_id,
        prior_status: agreement.status,
        competitor_name: `${competitor.first_name} ${competitor.last_name}`,
        reason,
        zoho_cleanup: {
          recall_success: recallSuccess,
          delete_success: deleteSuccess,
        },
        agreement_snapshot: {
          ...agreement,
        },
      },
    });

    logger.info('Agreement cancelled for manual override', {
      agreement_id: agreement.id,
      competitor_id: agreement.competitor_id,
      user_id: user.id,
      recallSuccess,
      deleteSuccess,
    });

    return NextResponse.json({
      ok: true,
      zohoCleanup: {
        recallSuccess,
        deleteSuccess,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Agreement cancellation failed', { error: detail });
    return NextResponse.json(
      {
        error: 'Agreement cancellation failed due to an unexpected error',
        error_code: 'cancel_unhandled',
        details: detail,
      },
      { status: 500 },
    );
  }
}
