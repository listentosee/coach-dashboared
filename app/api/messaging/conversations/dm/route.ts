import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// ALWAYS create a NEW DM conversation - each conversation is a distinct thread
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUserId = user.id

    const { userId: otherUserId, title } = await req.json() as { userId?: string, title?: string }
    if (!otherUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (otherUserId === currentUserId) return NextResponse.json({ error: 'Cannot DM self' }, { status: 400 })

    // Use the server function to create DM conversation with proper RLS handling
    const { data: conversationId, error: createErr } = await supabase
      .rpc('create_dm_conversation', {
        p_other_user_id: otherUserId,
        p_title: title || null
      })

    if (createErr || !conversationId) {
      return NextResponse.json({ error: createErr?.message || 'Failed to create conversation' }, { status: 400 })
    }

    return NextResponse.json({ conversationId })
  } catch (e) {
    console.error('Create DM error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
