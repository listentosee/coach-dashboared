import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { isUserAdmin } from '@/lib/utils/admin-check'

// Admin-only: post a message to the global Announcements conversation
// Ensures the announcements conversation exists and all coaches are members.
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminId = session.user.id
    const isAdmin = await isUserAdmin(supabase, adminId)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { title, body } = await req.json() as { title?: string, body?: string }
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body required' }, { status: 400 })
    }

    // Create a new announcement conversation and broadcast via RPC
    const { data: newId, error: rpcErr } = await supabase
      .rpc('create_announcement_and_broadcast', { p_title: title || 'Announcement', p_body: body })
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, conversationId: newId })
  } catch (e) {
    console.error('Announcements send error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
