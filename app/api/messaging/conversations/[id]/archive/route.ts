import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// POST /api/messaging/conversations/[id]/archive - Archive all messages in a conversation
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

    // Archive all messages in the conversation for the current user
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

// DELETE /api/messaging/conversations/[id]/archive?messageId=xxx - Unarchive a message
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const messageId = req.nextUrl.searchParams.get('messageId')
    if (!messageId) {
      return NextResponse.json({ error: 'Message ID required' }, { status: 400 })
    }

    // Unarchive the message
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
      // Don't fail the request if read receipt fails
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Unarchive message error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
