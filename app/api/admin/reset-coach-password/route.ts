import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { coachId } = await request.json()
    if (!coachId) {
      return NextResponse.json({ error: 'coachId is required' }, { status: 400 })
    }

    // Verify caller is an authenticated admin using cookie-bound client
    const cookieStore = await cookies()
    const authed = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await authed.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await authed
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Create service-role client to update auth user
    const service = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Generate a strong temporary password (url-safe)
    const tempPassword = crypto.randomBytes(24).toString('base64url')

    // Preserve existing app_metadata and set an admin-enforced flag there
    const { data: existing, error: getErr } = await service.auth.admin.getUserById(coachId)
    if (getErr) {
      return NextResponse.json({ error: getErr.message }, { status: 400 })
    }
    const currentAppMeta = (existing?.user?.app_metadata as any) || {}

    // Set temp password and require change on next login via app_metadata (user cannot modify this)
    const { error: updateError } = await service.auth.admin.updateUserById(coachId, {
      password: tempPassword,
      app_metadata: { ...currentAppMeta, must_change_password: true }
    })
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // Log the admin action (best-effort)
    await service.from('activity_logs').insert({
      user_id: user.id,
      action: 'admin_reset_coach_password',
      entity_type: 'profiles',
      metadata: { coach_id: coachId }
    })

    return NextResponse.json({ success: true, tempPassword })
  } catch (e: any) {
    console.error('Reset coach password error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
