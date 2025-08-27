import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '../_lib/token';

type Body = {
  competitorId: string;
  mode?: 'email' | 'inperson';          // 'inperson' for kiosk check-in
};

export async function POST(req: NextRequest) {
  const { competitorId, mode = 'email' } = (await req.json()) as Body;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Pull competitor data (adjust field names if needed)
  const { data: c, error } = await supabase
    .from('competitors')
    .select('id, first_name, last_name, grade, school, email_school, is_18_or_over, parent_name, parent_email')
    .eq('id', competitorId)
    .single();

  if (error || !c) return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });

  const isAdult = !!c.is_18_or_over;
  const templateId = isAdult ? process.env.ZOHO_SIGN_TEMPLATE_ID_ADULT! : process.env.ZOHO_SIGN_TEMPLATE_ID_MINOR!;
  const templateKind = isAdult ? 'adult' : 'minor';

  const accessToken = await getZohoAccessToken();

  // Get template details to read its single action_id
  const tRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!tRes.ok) {
    return NextResponse.json({ error: 'Failed to load template', detail: await tRes.text() }, { status: 502 });
  }
  const tJson = await tRes.json();
  const action = tJson.templates?.actions?.[0];
  if (!action) {
    return NextResponse.json({ error: 'Template has no signer action' }, { status: 400 });
  }

  // Build the single recipient action
  const recipient =
    isAdult
      ? { name: `${c.first_name} ${c.last_name}`, email: c.email_school } // or use your preferred participant email field
      : { name: c.parent_name, email: c.parent_email };

  if (!recipient.email) {
    return NextResponse.json({ error: 'Missing recipient email for this template' }, { status: 400 });
  }

  const actionPayload: any = {
    action_id: action.action_id,
    action_type: mode === 'inperson' ? 'INPERSONSIGN' : 'SIGN',
    recipient_name: mode === 'inperson' ? recipient.name : recipient.name,
    recipient_email: mode === 'inperson' ? (recipient.email || 'no-email@example.com') : recipient.email,
    verify_recipient: true,
    verification_type: 'EMAIL',
  };
  if (mode === 'inperson') {
    // Host an in-person session for the first signer
    actionPayload.in_person_name = recipient.name;
    actionPayload.in_person_email = recipient.email || 'no-email@example.com';
    actionPayload.is_host = true;
  }

  // Prefill fields (labels must match your template fields)
  const field_data = {
    field_text_data: {
      participant_name: `${c.first_name} ${c.last_name}`,
      school: c.school || '',
      grade: c.grade || '',
      program_dates: 'September 15, 2025 – May 30, 2026', // or process.env.PROGRAM_DATES
    },
    // Add address or other fields if present in your DB and template
  };

  const dataParam = {
    templates: {
      field_data,
      actions: [actionPayload],
      notes: 'Please review and sign the Mayors Cup release.',
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
    return NextResponse.json({ error: 'Zoho Sign create failed', detail: createJson }, { status: 502 });
  }

  const requestId = createJson.requests?.request_id as string;

  await supabase.from('agreements').insert({
    competitor_id: c.id,
    provider: 'zoho',
    template_kind: templateKind,
    request_id: requestId,
    status: 'sent',
    signers: [{ role: isAdult ? 'Participant' : 'ParentGuardian', email: recipient.email, name: recipient.name, status: 'sent' }],
    metadata: { templateId, mode },
  });

  return NextResponse.json({ ok: true, requestId, templateKind });
}
