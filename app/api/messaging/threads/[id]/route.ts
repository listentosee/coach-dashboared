import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET /api/messaging/threads/[id]
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const threadRootId = id.trim()
    if (threadRootId.length === 0) {
      return NextResponse.json({ error: 'Invalid thread ID' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('get_thread_messages', { p_thread_root_id: threadRootId as any })
    if (!error) {
      const normalized = (data || []).map((row: any) => ({
        ...row,
        id: `${row.id}`,
        parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
      }))
      return NextResponse.json({ messages: normalized })
    }

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
      .or(`id.eq.${threadRootId},parent_message_id.eq.${threadRootId}`)
      .order('created_at', { ascending: true })

    if (childErr) {
      const normalizedRoot = [{
        ...root,
        id: `${root.id}`,
        parent_message_id: root.parent_message_id != null ? `${root.parent_message_id}` : null,
      }]
      return NextResponse.json({ messages: normalizedRoot })
    }

    const normalizedFallback = (children || [root]).map((row: any) => ({
      ...row,
      id: `${row.id}`,
      parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
    }))
    return NextResponse.json({ messages: normalizedFallback })
  } catch (e) {
    console.error('Thread fetch error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
