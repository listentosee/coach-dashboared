import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// POST /api/messaging/conversations/[id]/pin - Pin a conversation or message
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
    const body = await req.json()
    const { messageId } = body

    // If messageId is provided, pin the message; otherwise pin the conversation
    const functionName = messageId ? 'pin_message' : 'pin_conversation_v2'
    const params = messageId
      ? { p_conversation_id: id, p_message_id: messageId }
      : { p_conversation_id: id }

    const { error } = await supabase.rpc(functionName, params)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Pin error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/messaging/conversations/[id]/pin - Unpin a conversation or message
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
    const body = await req.json()
    const { messageId } = body

    // If messageId is provided, unpin the message; otherwise unpin the conversation
    const functionName = messageId ? 'unpin_message' : 'unpin_conversation_v2'
    const params = messageId
      ? { p_conversation_id: id, p_message_id: messageId }
      : { p_conversation_id: id }

    const { error } = await supabase.rpc(functionName, params)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Unpin error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
