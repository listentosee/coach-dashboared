import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET /api/messaging/threads/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const threadRootId = parseInt(params.id, 10)
    if (!Number.isFinite(threadRootId)) {
      return NextResponse.json({ error: 'Invalid thread ID' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('get_thread_messages', { p_thread_root_id: threadRootId })
    if (!error) return NextResponse.json({ messages: data })

    // Fallback if RPC missing: fetch root + direct replies using base columns
    console.warn('get_thread_messages RPC unavailable, falling back:', error.message)
    const { data: root, error: rootErr } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at, parent_message_id')
      .eq('id', threadRootId)
      .maybeSingle()
    if (rootErr || !root) return NextResponse.json({ error: rootErr?.message || 'Not found' }, { status: 400 })

    // Try to fetch children using parent_message_id
    const { data: children, error: childErr } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at, parent_message_id')
      .eq('conversation_id', (root as any).conversation_id)
      .or(`id.eq.${root.id},parent_message_id.eq.${root.id}`)
      .order('created_at', { ascending: true })

    if (childErr) {
      return NextResponse.json({ messages: [root] })
    }

    return NextResponse.json({ messages: children || [root] })
  } catch (e) {
    console.error('Thread fetch error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
