import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { isUserAdmin } from '@/lib/utils/admin-check'

// Create or get a distinct DM conversation between admin (current user) and target coach
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminId = session.user.id
    const isAdmin = await isUserAdmin(supabase, adminId)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId: coachId } = await req.json() as { userId?: string }
    if (!coachId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (coachId === adminId) return NextResponse.json({ error: 'Cannot DM self' }, { status: 400 })

    // 1) Find existing DM that both are members of
    const { data: adminConvos, error: adminConvosErr } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', adminId)

    if (adminConvosErr) return NextResponse.json({ error: adminConvosErr.message }, { status: 400 })

    const convoIds = (adminConvos || []).map(c => c.conversation_id)
    let existingId: string | null = null
    if (convoIds.length > 0) {
      const { data: shared, error: sharedErr } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .in('conversation_id', convoIds)
        .eq('user_id', coachId)

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

    // 2) Create new DM and add both members (RLS allows admin)
    const { data: convo, error: convoErr } = await supabase
      .from('conversations')
      .insert({ type: 'dm', title: null, created_by: adminId })
      .select('id')
      .single()

    if (convoErr || !convo) return NextResponse.json({ error: convoErr?.message || 'Failed to create conversation' }, { status: 400 })

    const members = [
      { conversation_id: convo.id, user_id: adminId, role: 'admin' },
      { conversation_id: convo.id, user_id: coachId, role: 'member' },
    ]
    const { error: memErr } = await supabase.from('conversation_members').insert(members)
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 })

    return NextResponse.json({ conversationId: convo.id })
  } catch (e) {
    console.error('Create DM error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

