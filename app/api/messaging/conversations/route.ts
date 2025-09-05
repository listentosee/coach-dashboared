import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// List conversations visible to the current user (RLS enforced)
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: conversations, error } = await supabase
      .rpc('list_conversations_with_unread', { p_user_id: session.user.id })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Defensive normalization: if there are no messages (last_message_at is null), unread must be 0.
    const normalized = (conversations || []).map((c: any) => ({
      ...c,
      unread_count: c.last_message_at ? Math.max(0, Number(c.unread_count ?? 0)) : 0,
    }))

    return NextResponse.json({ conversations: normalized })
  } catch (e) {
    console.error('List conversations error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
