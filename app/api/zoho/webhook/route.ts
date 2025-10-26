import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getZohoAccessToken } from '../_lib/token';
import { logger } from '@/lib/logging/safe-logger';
import { AuditLogger } from '@/lib/audit/audit-logger';

function verifyZohoHmac(rawBody: string, headerSig: string | null) {
  if (!headerSig) return false;
  const calc = crypto.createHmac('sha256', process.env.ZOHO_WEBHOOK_SECRET!).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(calc));
}

export async function POST(req: NextRequest) {
  const raw = await req.text(); // compute HMAC over raw body
  const headerSig = req.headers.get('x-zs-webhook-signature');
  
  // Check if this is a test request from Zoho (no signature header)
  const isTestRequest = !headerSig;
  
  // For production requests, verify HMAC signature
  if (!isTestRequest && !verifyZohoHmac(raw, headerSig)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  const payload = JSON.parse(raw);
  
  // Handle test requests (just return success)
  if (isTestRequest) {
    return NextResponse.json({ 
      ok: true, 
      message: 'Test webhook received successfully',
      timestamp: new Date().toISOString()
    });
  }

  const requestId: string | undefined = payload?.requests?.request_id;
  const requestStatus: string | undefined = payload?.requests?.request_status;

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (requestId) {

    const normalized =
      (requestStatus || '').toLowerCase() === 'completed' ? 'completed' :
      (requestStatus || '').toLowerCase() === 'declined' ? 'declined' :
      (requestStatus || '').toLowerCase() === 'expired' ? 'expired' : 'sent';

    // Load the agreement first to inspect metadata (e.g., print mode)
    const { data: existing } = await supabase
      .from('agreements')
      .select('id, competitor_id, template_kind, metadata, status')
      .eq('request_id', requestId)
      .single();

    if (!existing) {
      return NextResponse.json({ ok: true, message: 'No matching agreement; ignoring' });
    }

    const isPrintMode = !!(existing as any)?.metadata?.isPrintMode

    // For print mode requests, ignore all webhook status changes and keep 'print_ready'
    if (isPrintMode) {
      if (existing.status !== 'completed_manual' && existing.status !== 'print_ready') {
        await supabase
          .from('agreements')
          .update({ status: 'print_ready', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      return NextResponse.json({ ok: true, message: 'Print mode agreement; webhook ignored' })
    }

    await supabase
      .from('agreements')
      .update({ status: normalized, completion_source: normalized === 'completed' ? 'zoho' : null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (normalized === 'completed') {
      try {
        const accessToken = await getZohoAccessToken();
        const pdfRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${requestId}/pdf`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        });
        const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
        const pdfPath = `signed/${requestId}.pdf`;

        await supabase.storage.from('signatures').upload(pdfPath, pdfBuf, {
          contentType: 'application/pdf',
          upsert: true,
        });

        // Stamp competitor row: adult -> participation_agreement_date; minor -> media_release_date
        const dateField = existing.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
        await supabase.from('competitors')
          .update({ [dateField]: new Date().toISOString() })
          .eq('id', existing.competitor_id);

        // Recalculate and update competitor status
        const { data: updatedCompetitor } = await supabase
          .from('competitors')
          .select('*')
          .eq('id', existing.competitor_id)
          .single();

        if (updatedCompetitor) {
          const { calculateCompetitorStatus } = await import('@/lib/utils/competitor-status');
          const newStatus = calculateCompetitorStatus(updatedCompetitor);
          
          await supabase
            .from('competitors')
            .update({ status: newStatus })
            .eq('id', existing.competitor_id);
        }

        await supabase.from('agreements')
          .update({ signed_pdf_path: pdfPath })
          .eq('request_id', requestId);

        // Log agreement signed action for audit trail
        await AuditLogger.logAgreement(supabase, {
          agreementId: existing.id,
          competitorId: existing.competitor_id,
          action: 'agreement_signed',
          userId: null,
          metadata: {
            provider: 'zoho',
            template_kind: existing.template_kind,
            request_id: requestId,
            signed_via: 'zoho_webhook',
            signed_at: new Date().toISOString(),
            system_actor: 'zoho_webhook'
          }
        });
      } catch (e) {
        logger.error('PDF storage failed', { error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
