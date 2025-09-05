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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 200))

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body } = await req.json() as { body?: string }
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body required' }, { status: 400 })
    }

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ conversation_id: params.id, sender_id: session.user.id, body })
      .select('id, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ ok: true, id: inserted.id, created_at: inserted.created_at })
  } catch (e) {
    console.error('Send message error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

