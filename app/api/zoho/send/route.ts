import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '../_lib/token';

type Body = {
  competitorId: string;
  mode?: 'email' | 'inperson';          // 'inperson' for kiosk check-in
};

export async function POST(req: NextRequest) {
  console.log('Zoho send API called with:', { competitorId: req.body });
  
  const { competitorId, mode = 'email' } = (await req.json()) as Body;
  console.log('Parsed request:', { competitorId, mode });
  
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  console.log('Supabase client created');

  // Pull competitor data with coach's school from profile
  const { data: c, error } = await supabase
    .from('competitors')
    .select(`
      id, 
      first_name, 
      last_name, 
      grade, 
      email_school, 
      is_18_or_over, 
      parent_name, 
      parent_email,
      coach_id,
      profiles!competitors_coach_id_fkey(school_name)
    `)
    .eq('id', competitorId)
    .single();
    
  console.log('Raw competitor data from Supabase:', c);

  if (error || !c) {
    console.error('Competitor fetch error:', error);
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
  }
  
  console.log('Competitor data fetched:', { 
    id: c.id, 
    name: `${c.first_name} ${c.last_name}`,
    isAdult: c.is_18_or_over,
    email: c.is_18_or_over ? c.email_school : c.parent_email,
    profiles: c.profiles,
    schoolName: c.profiles?.school_name
  });

  const isAdult = !!c.is_18_or_over;
  const templateId = isAdult ? process.env.ZOHO_SIGN_TEMPLATE_ID_ADULT! : process.env.ZOHO_SIGN_TEMPLATE_ID_MINOR!;
  const templateKind = isAdult ? 'adult' : 'minor';
  
  console.log('Template selection:', { isAdult, templateId, templateKind });

  console.log('Getting Zoho access token...');
  const accessToken = await getZohoAccessToken();
  console.log('Access token retrieved:', accessToken ? 'Success' : 'Failed');

  // Get template details to read its single action_id
  console.log('Fetching template details from Zoho...');
  const tRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  console.log('Template fetch response:', { status: tRes.status, ok: tRes.ok });
  
  if (!tRes.ok) {
    const errorText = await tRes.text();
    console.error('Template fetch failed:', { status: tRes.status, error: errorText });
    return NextResponse.json({ error: 'Failed to load template', detail: errorText }, { status: 502 });
  }
  
  const tJson = await tRes.json();
  console.log('Template data received:', { hasTemplates: !!tJson.templates, actionsCount: tJson.templates?.actions?.length });
  
  const action = tJson.templates?.actions?.[0];
  if (!action) {
    console.error('No actions found in template');
    return NextResponse.json({ error: 'Template has no signer action' }, { status: 400 });
  }
  
  console.log('Action found:', { actionId: action.action_id, actionType: action.action_type });



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

  // Prefill fields using Zoho's expected format
  const field_data = {
    field_text_data: {
      participant_name: `${c.first_name} ${c.last_name}`,
      school: c.profiles?.school_name || '',
      grade: c.grade || '',
    },
    field_boolean_data: {},
    field_date_data: {},
    field_radio_data: {},
    field_checkboxgroup_data: {}
  };
  
  console.log('Field data being sent:', field_data);

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

  console.log('Creating document in Zoho...');
  const createRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}/createdocument`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });
  
  console.log('Document creation response:', { status: createRes.status, ok: createRes.ok });
  
  const createJson = await createRes.json().catch(() => ({}));
  console.log('Document creation result:', createJson);
  
  if (!createRes.ok || createJson.status !== 'success') {
    console.error('Document creation failed:', { status: createRes.status, response: createJson });
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
