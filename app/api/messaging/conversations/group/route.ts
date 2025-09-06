import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Create a multi-member conversation (treated as 'dm' type; members can post)
// Body: { userIds: string[], title?: string }
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userIds, title } = await req.json() as { userIds?: string[], title?: string }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds is required' }, { status: 400 })
    }

    // Ensure creator is included
    const uniqueIds = Array.from(new Set([session.user.id, ...userIds]))

    const { data: convo, error: convoErr } = await supabase
      .from('conversations')
      .insert({ type: 'group', title: title || null, created_by: session.user.id })
      .select('id')
      .single()
    if (convoErr || !convo) return NextResponse.json({ error: convoErr?.message || 'Failed to create conversation' }, { status: 400 })

    const rows = uniqueIds.map(uid => ({ conversation_id: convo.id, user_id: uid, role: uid === session.user.id ? 'member' : 'member' }))
    const { error: memErr } = await supabase.from('conversation_members').insert(rows)
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 })

    return NextResponse.json({ conversationId: convo.id })
  } catch (e) {
    console.error('Create group conversation error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
