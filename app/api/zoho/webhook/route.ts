import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getZohoAccessToken } from '../_lib/token';

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

    const { data: agreement } = await supabase
      .from('agreements')
      .update({ status: normalized, updated_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .select('competitor_id, template_kind')
      .single();

    if (normalized === 'completed' && agreement) {
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
        const dateField = agreement.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
        await supabase.from('competitors')
          .update({ [dateField]: new Date().toISOString() })
          .eq('id', agreement.competitor_id);

        // Recalculate and update competitor status
        const { data: updatedCompetitor } = await supabase
          .from('competitors')
          .select('*')
          .eq('id', agreement.competitor_id)
          .single();

        if (updatedCompetitor) {
          const { calculateCompetitorStatus } = await import('@/lib/utils/competitor-status');
          const newStatus = calculateCompetitorStatus(updatedCompetitor);
          
          await supabase
            .from('competitors')
            .update({ status: newStatus })
            .eq('id', agreement.competitor_id);
        }

        await supabase.from('agreements')
          .update({ signed_pdf_path: pdfPath })
          .eq('request_id', requestId);
      } catch (e) {
        console.error('PDF store failed', e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
