import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// POST /api/messaging/conversations/[id]/mute - Mute a conversation
// Accepts optional JSON body: { until?: string } where until is an ISO timestamp.
// If no body or until is omitted, mutes indefinitely (far future).
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

    let until: string
    try {
      const body = await req.json()
      until = body.until || new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
    } catch {
      // No body or invalid JSON - mute indefinitely
      until = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
    }

    const { error } = await supabase
      .from('conversation_members')
      .update({ muted_until: until })
      .eq('conversation_id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, muted_until: until })
  } catch (e) {
    console.error('Mute conversation error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/messaging/conversations/[id]/mute - Unmute a conversation
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

    const { error } = await supabase
      .from('conversation_members')
      .update({ muted_until: null })
      .eq('conversation_id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Unmute conversation error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
