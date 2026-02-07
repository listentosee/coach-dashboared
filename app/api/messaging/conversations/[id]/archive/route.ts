import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// POST /api/messaging/conversations/[id]/archive - Archive all messages in a conversation
// Sets archived_at on every message via message_user_state.
// The conversation is "archived" when ALL its messages have archived_at set.
// When a new message arrives (no archived_at), the conversation pops back into the inbox.
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

    // Archive all messages and mark conversation as read (handled in the RPC)
    const { error } = await supabase.rpc('archive_all_messages_in_conversation', {
      p_conversation_id: id,
      p_user_id: user.id
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Archive conversation error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/messaging/conversations/[id]/archive - Unarchive conversation or single message
// If ?messageId=xxx is provided, unarchive that single message
// If no messageId, unarchive all messages in the conversation
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const messageId = req.nextUrl.searchParams.get('messageId')

    if (messageId) {
      // Unarchive a single message
      const { error: unarchiveError } = await supabase.rpc('unarchive_message_user', {
        p_message_id: messageId
      })

      if (unarchiveError) {
        return NextResponse.json({ error: unarchiveError.message }, { status: 400 })
      }

      // Mark as read - restored messages should not appear as unread
      const { error: readError } = await supabase
        .from('message_read_receipts')
        .upsert({
          message_id: messageId,
          user_id: user.id,
          read_at: new Date().toISOString()
        }, {
          onConflict: 'message_id,user_id'
        })

      if (readError) {
        console.error('Failed to mark restored message as read:', readError)
      }
    } else {
      // Unarchive all messages in the conversation by clearing archived_at
      const { error: stateError } = await supabase
        .from('message_user_state')
        .update({ archived_at: null })
        .eq('user_id', user.id)
        .in('message_id',
          supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', id)
        )

      if (stateError) {
        return NextResponse.json({ error: stateError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Unarchive error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
