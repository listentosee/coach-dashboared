import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET /api/messaging/conversations/[id]/threads
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

    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '200', 10)

    const { data, error } = await supabase.rpc('list_threads', { p_conversation_id: id, p_limit: limit })
    if (!error) return NextResponse.json({ threads: data || [] })

    // Fallback path if RPC is missing (schema cache or migration not applied)
    console.warn('list_threads RPC unavailable, falling back to direct query:', error.message)
    // Fetch root messages (parent_message_id is null) for the conversation
    const { data: roots, error: rootsErr } = await supabase
      .from('messages')
      .select('id, sender_id, created_at, body, thread_reply_count, thread_last_reply_at')
      .eq('conversation_id', id)
      .is('parent_message_id', null)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit || 50, 1), 200))

    if (rootsErr) return NextResponse.json({ error: rootsErr.message }, { status: 400 })

    const threads = (roots || []).map((m: any) => ({
      root_id: m.id,
      sender_id: m.sender_id,
      created_at: m.created_at,
      snippet: String(m.body || '').replace(/\n+/g, ' ').slice(0, 160),
      reply_count: Number(m.thread_reply_count ?? 0),
      last_reply_at: m.thread_last_reply_at || null,
      read_count: 0,
    }))
    return NextResponse.json({ threads })
  } catch (e) {
    console.error('List threads error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
