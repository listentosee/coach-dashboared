import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getServiceRoleSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const authed = createServerClient()
    const { data: { user } } = await authed.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const service = getServiceRoleSupabaseClient()
    // Merge existing app_metadata and clear the flag
    const { data: existing, error: getErr } = await service.auth.admin.getUserById(user.id)
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 400 })
    const currentAppMeta = (existing?.user?.app_metadata as any) || {}
    const { error } = await service.auth.admin.updateUserById(user.id, {
      app_metadata: { ...currentAppMeta, must_change_password: false }
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Refresh the user's session so updated app_metadata is embedded in the JWT cookie
    await authed.auth.refreshSession()

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('clear-must-change error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
