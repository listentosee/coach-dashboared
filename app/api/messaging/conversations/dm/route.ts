import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Create or get a distinct DM conversation between current user and target user
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUserId = user.id
    // Allow any authenticated user to start a DM with a valid target

    const { userId: otherUserId, title } = await req.json() as { userId?: string, title?: string }
    if (!otherUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (otherUserId === currentUserId) return NextResponse.json({ error: 'Cannot DM self' }, { status: 400 })

    // 1) Find existing DM that both are members of
    const { data: myConvos, error: myConvosErr } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId)

    if (myConvosErr) return NextResponse.json({ error: myConvosErr.message }, { status: 400 })

    const convoIds = (myConvos || []).map(c => c.conversation_id)
    let existingId: string | null = null
    if (convoIds.length > 0) {
      const { data: shared, error: sharedErr } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .in('conversation_id', convoIds)
        .eq('user_id', otherUserId)

      if (sharedErr) return NextResponse.json({ error: sharedErr.message }, { status: 400 })

      const sharedIds = new Set((shared || []).map(s => s.conversation_id))
      // Ensure it is a 'dm'
      if (sharedIds.size > 0) {
      const { data: dmConvos } = await supabase
          .from('conversations')
          .select('id, type')
          .in('id', Array.from(sharedIds))
          .eq('type', 'dm')
          .limit(1)
        if (dmConvos && dmConvos.length > 0) existingId = dmConvos[0].id
      }
    }

    if (existingId) return NextResponse.json({ conversationId: existingId })

    // 2) Create-or-get via SECURITY DEFINER RPC to bypass RLS safely
    const { data: convId, error: rpcErr } = await supabase.rpc('create_or_get_dm', {
      p_other_user_id: otherUserId,
      p_title: title || null,
    })
    if (rpcErr || !convId) return NextResponse.json({ error: rpcErr?.message || 'Failed to create DM' }, { status: 400 })
    return NextResponse.json({ conversationId: convId })
  } catch (e) {
    console.error('Create DM error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
