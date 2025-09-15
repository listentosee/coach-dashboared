import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Fetch messages for a conversation (RLS enforced)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)

    // Use V2 RPC that hides private replies from other users
    const { data: messages, error } = await supabase
      .rpc('list_messages_with_sender_v2', { p_conversation_id: params.id, p_limit: Math.min(Math.max(limit, 1), 200) })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ messages })
  } catch (e) {
    console.error('Get messages error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Send a message to a conversation (server-side transaction; RLS enforces authorizations)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body, parentMessageId, privateTo } = await req.json() as { body?: string; parentMessageId?: number; privateTo?: string }
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body required' }, { status: 400 })
    }

    // Private reply path (e.g., announcements): use RPC to bypass RLS safely
    if (privateTo) {
      // Confirm conversation type is announcement; otherwise fall back to normal insert
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('type')
        .eq('id', params.id)
        .single()
      if (!convErr && conv?.type === 'announcement') {
        const { data, error } = await supabase.rpc('post_private_reply', {
          p_conversation_id: params.id,
          p_body: body,
          p_recipient: privateTo,
          p_parent_message_id: parentMessageId ?? null
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true, id: data })
      }
      // Not an announcement; proceed to normal insert below
    }

    const payload: Record<string, any> = { conversation_id: params.id, sender_id: user.id, body }
    if (typeof parentMessageId === 'number' && Number.isFinite(parentMessageId)) {
      payload.parent_message_id = parentMessageId
    }

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert(payload)
      .select('id, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ ok: true, id: inserted.id, created_at: inserted.created_at })
  } catch (e) {
    console.error('Send message error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
