import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const agreementId = formData.get('agreementId') as string;

    if (!file || !agreementId) {
      return NextResponse.json({ error: 'Missing file or agreement ID' }, { status: 400 });
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get the agreement details
    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .select('competitor_id, template_kind, request_id')
      .eq('id', agreementId)
      .single();

    if (agreementError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = file.name.split('.').pop();
    const fileName = `manual-upload-${agreement.request_id}-${timestamp}.${fileExtension}`;
    const filePath = `manual/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('signatures')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Notify Zoho that the document has been submitted for manual upload
    try {
      const { getZohoAccessToken } = await import('../_lib/token');
      const accessToken = await getZohoAccessToken();
      
      // For print mode agreements, we need to complete the request in Zoho
      // This involves marking all signers as completed
      const completeResponse = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${agreement.request_id}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'Document completed via manual upload by coach'
        })
      });
      
      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.warn('Failed to complete Zoho request:', completeResponse.status, errorText);
      } else {
        console.log('Zoho request marked as completed successfully');
      }
    } catch (notifyError) {
      console.warn('Failed to notify Zoho:', notifyError);
      // Continue with local updates even if Zoho notification fails
    }

    // Update agreement status to completed
    const { error: updateError } = await supabase
      .from('agreements')
      .update({ 
        status: 'completed',
        signed_pdf_path: filePath,
        updated_at: new Date().toISOString()
      })
      .eq('id', agreementId);

    if (updateError) {
      console.error('Agreement update failed:', updateError);
      return NextResponse.json({ error: 'Failed to update agreement' }, { status: 500 });
    }

    // Update competitor record with agreement date
    const dateField = agreement.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
    const { error: competitorError } = await supabase
      .from('competitors')
      .update({ [dateField]: new Date().toISOString() })
      .eq('id', agreement.competitor_id);

    if (competitorError) {
      console.error('Competitor update failed:', competitorError);
      return NextResponse.json({ error: 'Failed to update competitor' }, { status: 500 });
    }

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

    return NextResponse.json({ 
      ok: true, 
      message: 'Document uploaded successfully',
      filePath 
    });

  } catch (error) {
    console.error('Manual upload failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
