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

    return NextResponse.json({ conversations })
  } catch (e) {
    console.error('List conversations error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
