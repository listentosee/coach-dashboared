import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Fetch messages for a conversation (RLS enforced)
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
    const limit = parseInt(url.searchParams.get('limit') || '500', 10)
    const includeArchived = url.searchParams.get('includeArchived') === 'true'

    // Use FERPA-compliant function that includes per-user state (flagged, archived_at)
    // If includeArchived=true, fetch directly with LEFT JOIN to get archived_at field
    let messages: any[] | null = null
    let error: any = null

    if (includeArchived) {
      // Fetch all messages including archived ones with per-user state
      // Use a manual query since we need to filter message_user_state by current user
      const { data: allMessages, error: fetchError } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at, parent_message_id')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 1000))

      if (fetchError) {
        error = fetchError
        messages = []
      } else {
        // Fetch profiles and user state separately
        const messageIds = (allMessages || []).map(m => m.id)
        const senderIds = [...new Set((allMessages || []).map(m => m.sender_id))]

        const [profilesRes, stateRes] = await Promise.all([
          supabase.from('profiles').select('id, first_name, last_name, email').in('id', senderIds),
          supabase.from('message_user_state').select('message_id, flagged, archived_at').in('message_id', messageIds).eq('user_id', user.id)
        ])

        const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]))
        const stateMap = new Map((stateRes.data || []).map(s => [s.message_id, s]))

        messages = (allMessages || []).map((row: any) => {
          const profile = profileMap.get(row.sender_id)
          const state = stateMap.get(row.id)
          return {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            body: row.body,
            created_at: row.created_at,
            parent_message_id: row.parent_message_id,
            sender_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
            sender_email: profile?.email || null,
            flagged: state?.flagged || false,
            archived_at: state?.archived_at || null,
          }
        })
      }
    } else {
      // Use function that filters out archived messages
      const result = await supabase
        .rpc('get_conversation_messages_with_state', { p_conversation_id: id, p_user_id: user.id })
      messages = result.data
      error = result.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const normalized = (messages || []).map((row: any) => ({
      ...row,
      id: `${row.id}`,
      parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
    }))
    return NextResponse.json({ messages: normalized })
  } catch (e) {
    console.error('Get messages error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Send a message to a conversation (server-side transaction; RLS enforces authorizations)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params

    const { body, parentMessageId } = await req.json() as { body?: string; parentMessageId?: string | number | null }
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body required' }, { status: 400 })
    }

    let normalizedParentId: string | null = null
    if (parentMessageId != null) {
      const asString = typeof parentMessageId === 'number' ? parentMessageId.toString() : String(parentMessageId).trim()
      if (asString.length > 0) {
        normalizedParentId = asString
      }
    }

    const payload: Record<string, any> = { conversation_id: id, sender_id: user.id, body }
    if (normalizedParentId) {
      payload.parent_message_id = normalizedParentId
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
