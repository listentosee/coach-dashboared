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

    const { body } = await req.json() as { body?: string }
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body required' }, { status: 400 })
    }

    // Find or create the announcements conversation
    let conversationId: string | null = null
    {
      const { data: convos, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'announcement')
        .limit(1)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      if (convos && convos.length > 0) {
        conversationId = convos[0].id
      } else {
        const { data: created, error: createErr } = await supabase
          .from('conversations')
          .insert({ type: 'announcement', title: 'Announcements', created_by: adminId })
          .select('id')
          .single()
        if (createErr || !created) return NextResponse.json({ error: createErr?.message || 'Failed to create announcements conversation' }, { status: 400 })
        conversationId = created.id
      }
    }

    // Ensure all coaches are members
    const { data: coachIds, error: coachErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'coach')

    if (coachErr) return NextResponse.json({ error: coachErr.message }, { status: 400 })

    if (coachIds && coachIds.length > 0) {
      const rows = coachIds.map((u) => ({ conversation_id: conversationId!, user_id: u.id, role: 'member' as const }))
      // Insert; ignore on conflict by splitting into chunks if desired. For small N, single insert is fine.
      await supabase.from('conversation_members').insert(rows, { count: 'none' })
        .then(async (res) => {
          if (res.error) {
            // Try to de-duplicate by filtering existing members
            const { data: existing } = await supabase
              .from('conversation_members')
              .select('user_id')
              .eq('conversation_id', conversationId!)
            const existingSet = new Set((existing || []).map((r) => r.user_id))
            const missing = rows.filter(r => !existingSet.has(r.user_id))
            if (missing.length > 0) {
              const { error: secondErr } = await supabase.from('conversation_members').insert(missing)
              if (secondErr) console.warn('Membership insert warning:', secondErr.message)
            }
          }
        })
    }

    // Post the announcement (admins only; RLS allows)
    const { error: msgErr } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId!, sender_id: adminId, body })
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, conversationId })
  } catch (e) {
    console.error('Announcements send error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

