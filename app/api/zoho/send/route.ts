import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getZohoAccessToken } from '../_lib/token';
import { logger } from '@/lib/logging/safe-logger';
import { AuditLogger } from '@/lib/audit/audit-logger';

type Body = {
  competitorId: string;
  mode?: 'email' | 'print';          // 'print' for print-and-sign manual upload
};

export async function POST(req: NextRequest) {
  const { competitorId, mode = 'email' } = (await req.json()) as Body;

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Enforce caller authorization (admin coach context or coach ownership)
  const cookieStore = await cookies()
  const authed = createRouteHandlerClient({ cookies: () => cookieStore })
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await authed.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  const actingCoachId = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null
  if (isAdmin && !actingCoachId) return NextResponse.json({ error: 'Select a coach context to edit' }, { status: 403 })

  // Pull competitor data with coach's school from profile
  const { data: c, error } = await supabase
    .from('competitors')
    .select(`
      id, 
      first_name, 
      last_name, 
      grade, 
      email_personal,
      email_school, 
      is_18_or_over, 
      parent_name, 
      parent_email,
      parent_email_is_valid,
      coach_id,
      profiles!competitors_coach_id_fkey(school_name)
    `)
    .eq('id', competitorId)
    .single();

  if (error || !c) {
    logger.error('Competitor fetch failed', { error: error?.message, competitorId });
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
  }
  // Ownership check
  if (!isAdmin && c.coach_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }
  if (isAdmin && actingCoachId && c.coach_id !== actingCoachId) {
    return NextResponse.json({ error: 'Target not owned by selected coach' }, { status: 403 })
  }

  logger.info('Processing Zoho request', { competitor_id: c.id, isAdult: !!c.is_18_or_over, mode });

  const isAdult = !!c.is_18_or_over;
  // Resolve coach profile explicitly based on acting context/ownership
  const coachProfileId = c.coach_id
  const { data: coachProfile } = await supabase
    .from('profiles')
    .select('school_name')
    .eq('id', coachProfileId)
    .single()
  const schoolText = (coachProfile?.school_name && String(coachProfile.school_name).trim()) || ''
  const gradeText = (c.grade && String(c.grade).trim()) || ''

  // Hard validation: school and grade are required by the template
  if (!schoolText) {
    return NextResponse.json({ error: 'Coach profile is missing school name. Please set the coach\'s school before sending.' }, { status: 400 })
  }
  if (!gradeText) {
    return NextResponse.json({ error: 'Competitor grade is required before sending.' }, { status: 400 })
  }
  const templateId = isAdult ? process.env.ZOHO_SIGN_TEMPLATE_ID_ADULT! : process.env.ZOHO_SIGN_TEMPLATE_ID_MINOR!;
  const templateKind = isAdult ? 'adult' : 'minor';

  logger.info('Template selected', { templateKind });

  const accessToken = await getZohoAccessToken();

  // Prevent duplicate active agreements (non-terminal) per competitor
  const { data: existingAgreements } = await supabase
    .from('agreements')
    .select('id, status, metadata, request_id')
    .eq('competitor_id', c.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const hasActiveNonTerminal = (existingAgreements || []).some(a => ['sent','viewed','print_ready'].includes((a as any).status))
  const existingPrint = (existingAgreements || []).find(a => (a as any).status === 'print_ready' && !!(a as any)?.metadata?.isPrintMode)

  if (mode === 'print') {
    if (existingPrint) {
      // Reuse existing print-ready request to avoid duplicates
      return NextResponse.json({ ok: true, requestId: (existingPrint as any).request_id, templateKind, mode: 'print', reused: true })
    }
    // If there's an active email flow, block to reduce confusion
    const hasActiveEmail = (existingAgreements || []).some(a => ['sent','viewed'].includes((a as any).status) && !(a as any)?.metadata?.isPrintMode)
    if (hasActiveEmail) {
      return NextResponse.json({ error: 'An active digital release already exists for this competitor. Please complete or cancel it before creating a print release.' }, { status: 409 })
    }
  } else {
    // mode === 'email': block if any active flow exists
    if (hasActiveNonTerminal) {
      return NextResponse.json({ error: 'An active release already exists for this competitor. Please complete or cancel it before sending another.' }, { status: 409 })
    }
  }

  // Get template details to read its single action_id
  const tRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });

  if (!tRes.ok) {
    const errorText = await tRes.text();
    logger.error('Template fetch failed', { status: tRes.status, templateId });
    return NextResponse.json({ error: 'Failed to load template', detail: errorText }, { status: 502 });
  }

  const tJson = await tRes.json();

  const action = tJson.templates?.actions?.[0];
  if (!action) {
    logger.error('No actions in template', { templateId });
    return NextResponse.json({ error: 'Template has no signer action' }, { status: 400 });
  }



  // Build the single recipient action
  const recipient =
    isAdult
      ? { name: `${c.first_name} ${c.last_name}`, email: (c as any).email_personal || c.email_school }
      : { name: c.parent_name, email: c.parent_email };

  // Validate required fields based on age
  if (isAdult === null) {
    return NextResponse.json({ error: 'Competitor age information is missing. Please set is_18_or_over field.' }, { status: 400 });
  }

  if (isAdult && !(c as any).email_personal && !c.email_school) {
    return NextResponse.json({ error: 'Adult competitor is missing email address (personal or school).' }, { status: 400 });
  }

  if (!isAdult && (!c.parent_name || !c.parent_email)) {
    return NextResponse.json({ error: 'Minor competitor is missing parent/guardian information (name and email).' }, { status: 400 });
  }

  if (!recipient.email) {
    return NextResponse.json({ error: 'Missing recipient email for this template' }, { status: 400 });
  }

  // Basic email format validation to reduce bounces
  const emailRegex = /.+@.+\..+/;
  if (!emailRegex.test(String(recipient.email).trim())) {
    return NextResponse.json({ error: 'Recipient email appears invalid. Please correct it before sending.' }, { status: 400 });
  }

  // Block sending if parent email is known invalid (for minors)
  if (!isAdult && (c as any).parent_email_is_valid === false) {
    return NextResponse.json({
      error: 'Parent email has been marked as invalid. Have the student update the parent email on their profile before sending.',
    }, { status: 400 });
  }

  const actionPayload: any = {
    action_id: action.action_id,
    action_type: mode === 'print' ? 'SIGN' : 'SIGN', // Both modes use SIGN, print just indicates manual upload
    recipient_name: recipient.name,
    recipient_email: recipient.email,
    verify_recipient: true,
    verification_type: 'EMAIL',
  };
  
  // Prefill fields using Zoho's expected format
  const field_data = {
    field_text_data: {
      participant_name: `${c.first_name} ${c.last_name}`,
      school: schoolText,
      grade: gradeText,
    },
    field_boolean_data: {},
    field_date_data: {},
    field_radio_data: {},
    field_checkboxgroup_data: {}
  };

  logger.debug('Field data prepared', { hasParticipantName: !!field_data.field_text_data.participant_name });

  // For print mode, we'll add a note indicating manual upload is expected
  const notes = mode === 'print'
    ? 'Please print, sign, and return to your coach for manual upload.'
    : 'Please review and sign the Mayors Cup release.';

  // For print mode, create a Zoho request but don't send emails
  if (mode === 'print') {
    
    // Create a Zoho request with internal recipient (coach) to avoid sending emails
    const printActionPayload = {
      action_id: action.action_id,
      action_type: 'SIGN',
      recipient_name: 'Coach', // Internal recipient
      recipient_email: 'cyber@syned.org', // Default email to prevent sending to external recipients
      verify_recipient: false, // No verification needed for internal
      verification_type: 'NONE',
    };

    const printDataParam = {
      templates: {
        field_data,
        actions: [printActionPayload],
        notes: notes,
      },
    };

    const printFormBody = new URLSearchParams({
      data: JSON.stringify(printDataParam),
      is_quicksend: 'true',
    });

    // Create the Zoho request for PDF generation
    const printCreateRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}/createdocument`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: printFormBody.toString(),
    });

    if (!printCreateRes.ok) {
      const errorText = await printCreateRes.text();
      logger.error('Print request failed', { status: printCreateRes.status });
      return NextResponse.json({ error: 'Failed to create print request', detail: errorText }, { status: 502 });
    }

    const printCreateJson = await printCreateRes.json();
    const printRequestId = printCreateJson.requests?.request_id as string;

    // Create agreement record in database with 'print_ready' status
    const { data: agreementData, error: agreementError } = await supabase.from('agreements').insert({
      competitor_id: c.id,
      provider: 'zoho',
      template_kind: templateKind,
      request_id: printRequestId, // Use actual Zoho request ID
      status: 'print_ready',
      signers: [{ role: isAdult ? 'Participant' : 'ParentGuardian', email: recipient.email, name: recipient.name, status: 'print_ready' }],
      metadata: { templateId, mode, notes, isPrintMode: true },
    }).select();

    if (agreementError) {
      logger.error('Agreement creation failed', { error: agreementError.message });
      return NextResponse.json({ error: 'Failed to create agreement record', detail: agreementError }, { status: 500 });
    }

    // Log third-party data disclosure (FERPA requirement)
    await AuditLogger.logDisclosure(supabase, {
      competitorId: c.id,
      disclosedTo: 'Zoho Sign',
      purpose: 'Electronic signature collection for consent forms (print mode)',
      userId: user.id,
      dataFields: ['first_name', 'last_name', 'grade', isAdult ? 'email_school' : 'parent_email', isAdult ? null : 'parent_name'].filter(Boolean) as string[],
      requestId: printRequestId
    });

    // Generate pre-filled PDF from the Zoho request
    try {
      const pdfResponse = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${printRequestId}/pdf`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });

      if (pdfResponse.ok) {
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfPath = `print-ready/${agreementData[0].id}.pdf`;
        
        // Store the pre-filled PDF in Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('signatures')
          .upload(pdfPath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (!storageError) {
          // Update agreement with PDF path
          await supabase
            .from('agreements')
            .update({ signed_pdf_path: pdfPath })
            .eq('id', agreementData[0].id);
        } else {
          logger.warn('PDF storage failed', { error: storageError.message });
        }
      } else {
        logger.warn('PDF generation failed', { status: pdfResponse.status });
      }
    } catch (pdfError) {
      logger.warn('PDF generation error', { error: pdfError instanceof Error ? pdfError.message : 'Unknown error' });
      // Continue even if PDF generation fails
    }
    
    return NextResponse.json({ ok: true, requestId: printRequestId, templateKind, mode: 'print' });
  }

  const dataParam = {
    templates: {
      field_data,
      actions: [actionPayload],
      notes: notes,
    },
  };

  const formBody = new URLSearchParams({
    data: JSON.stringify(dataParam),
    is_quicksend: 'true',
  });

  const createRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}/createdocument`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });

  const createJson = await createRes.json().catch(() => ({}));

  if (!createRes.ok || createJson.status !== 'success') {
    logger.error('Document creation failed', { status: createRes.status });
    return NextResponse.json({ error: 'Zoho Sign create failed', detail: createJson }, { status: 502 });
  }

  const requestId = createJson.requests?.request_id as string;

  // Create agreement record in database
  const { data: agreementData, error: agreementError } = await supabase.from('agreements').insert({
          competitor_id: c.id,
          provider: 'zoho',
          template_kind: templateKind,
          request_id: requestId,
          status: 'sent',
          signers: [{ role: isAdult ? 'Participant' : 'ParentGuardian', email: recipient.email, name: recipient.name, status: 'sent' }],
          metadata: { templateId, mode, notes },
        }).select();

  if (agreementError) {
    logger.error('Agreement record creation failed', { error: agreementError.message });
    return NextResponse.json({ error: 'Failed to create agreement record', detail: agreementError }, { status: 500 });
  }

  // Log third-party data disclosure (FERPA requirement)
  await AuditLogger.logDisclosure(supabase, {
    competitorId: c.id,
    disclosedTo: 'Zoho Sign',
    purpose: 'Electronic signature collection for consent forms (email mode)',
    userId: user.id,
    dataFields: ['first_name', 'last_name', 'grade', isAdult ? 'email_school' : 'parent_email', isAdult ? null : 'parent_name'].filter(Boolean) as string[],
    requestId
  });

  return NextResponse.json({ ok: true, requestId, templateKind });
}
