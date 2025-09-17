import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getZohoAccessToken } from '@/app/api/zoho/_lib/token'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  // Align with the profile GET route environment usage for consistency
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  try {
    // Lookup competitor by profile token
    const { data: competitor, error } = await supabase
      .from('competitors')
      .select('id, coach_id, first_name, last_name, grade, email_school, email_personal, is_18_or_over, profile_update_token_expires')
      .eq('profile_update_token', params.token)
      .single()
    if (error || !competitor) return NextResponse.json({ error: 'Profile not found or token expired' }, { status: 404 })

    // Validate token is active
    if (competitor.profile_update_token_expires && new Date(competitor.profile_update_token_expires) < new Date()) {
      return NextResponse.json({ error: 'Link has expired. Contact your coach for a new link.' }, { status: 400 })
    }

    // 18+ only
    if (!competitor.is_18_or_over) {
      return NextResponse.json({ error: 'Participation agreement is only available for 18+ participants.' }, { status: 400 })
    }
    // Required fields
    if (!competitor.grade) {
      return NextResponse.json({ error: 'Grade is required before sending.' }, { status: 400 })
    }
    // Accept personal email override from the request body (unsaved form value)
    let emailOverride: string | undefined
    try {
      const body = await req.json().catch(() => null)
      if (body && typeof body.email_personal === 'string') emailOverride = body.email_personal
    } catch {}

    // Prefer override > competitor.personal > school
    const email = ((emailOverride || (competitor as any).email_personal || competitor.email_school) || '').trim()
    if (!/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid personal email on the form before sending.' }, { status: 400 })
    }

    // Fetch coach school for template prefill
    const { data: coach } = await supabase.from('profiles').select('school_name').eq('id', competitor.coach_id).single()
    const schoolText = (coach?.school_name && String(coach.school_name).trim()) || ''
    if (!schoolText) return NextResponse.json({ error: 'Coach school is missing; contact your coach.' }, { status: 400 })

    // Prevent duplicate active agreements
    const { data: existingAgreements } = await supabase
      .from('agreements')
      .select('id, status')
      .eq('competitor_id', competitor.id)
      .order('created_at', { ascending: false })
      .limit(10)
    const hasActive = (existingAgreements || []).some(a => ['sent','viewed','print_ready'].includes((a as any).status))
    if (hasActive) return NextResponse.json({ error: 'An active release already exists. Please complete or cancel it before sending another.' }, { status: 409 })

    // Build Zoho request
    const templateId = process.env.ZOHO_SIGN_TEMPLATE_ID_ADULT!
    const accessToken = await getZohoAccessToken()

    // Fetch template to get action
    const tRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    })
    if (!tRes.ok) {
      const txt = await tRes.text()
      return NextResponse.json({ error: 'Failed to load template', detail: txt }, { status: 502 })
    }
    const tJson = await tRes.json()
    const action = tJson.templates?.actions?.[0]
    if (!action) return NextResponse.json({ error: 'Template has no signer action' }, { status: 400 })

    const actionPayload = {
      action_id: action.action_id,
      action_type: 'SIGN',
      recipient_name: `${competitor.first_name} ${competitor.last_name}`,
      recipient_email: email,
      verify_recipient: true,
      verification_type: 'EMAIL',
    }
    const field_data = {
      field_text_data: {
        participant_name: `${competitor.first_name} ${competitor.last_name}`,
        school: schoolText,
        grade: String(competitor.grade)
      },
      field_boolean_data: {},
      field_date_data: {},
      field_radio_data: {},
      field_checkboxgroup_data: {}
    }
    const notes = 'Please review and sign the Mayors Cup participation agreement.'
    const dataParam = { templates: { field_data, actions: [actionPayload], notes } }
    const formBody = new URLSearchParams({ data: JSON.stringify(dataParam), is_quicksend: 'true' })

    const createRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}/createdocument`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    })
    const createJson = await createRes.json().catch(() => ({}))
    if (!createRes.ok || createJson.status !== 'success') {
      return NextResponse.json({ error: 'Zoho Sign create failed', detail: createJson }, { status: 502 })
    }
    const requestId = createJson.requests?.request_id as string

    // Insert agreement
    const { error: agreementError } = await supabase.from('agreements').insert({
      competitor_id: competitor.id,
      provider: 'zoho',
      template_kind: 'adult',
      request_id: requestId,
      status: 'sent',
      signers: [{ role: 'Participant', email, name: `${competitor.first_name} ${competitor.last_name}`, status: 'sent' }],
      metadata: { templateId, mode: 'email', notes }
    })
    if (agreementError) return NextResponse.json({ error: 'Failed to create agreement record' }, { status: 500 })

    return NextResponse.json({ ok: true, requestId })
  } catch (e) {
    console.error('send-participation error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
