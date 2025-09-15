import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Minimal directory for messaging only: id + display name (+ role)
// Access policy:
// - Requires authenticated user
// - Must be invoked from messaging UI (Referer contains /dashboard/messages or /dashboard/messages-v2)
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Guard: only allow when coming from the messaging UI
    const referer = (req.headers.get('referer') || '').toLowerCase()
    const clientHdr = (req.headers.get('x-messaging-client') || '').toString()
    const allowed = clientHdr === '1' || referer.includes('/dashboard/messages') || referer.includes('/dashboard/messages-v2')
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Use RPC that is designed to expose minimal safe fields under RLS
    const { data, error } = await supabase.rpc('list_users_minimal')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const users = (data || [])
      .filter((u: any) => u.id !== user.id)
      .map((u: any) => ({ id: u.id, name: u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || 'Unknown', role: u.role }))

    return NextResponse.json({ users })
  } catch (e) {
    console.error('Messaging users directory error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
