import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const limitPerConversation = Number(url.searchParams.get('limitPerConversation') || 50)

    const { data, error } = await supabase.rpc('get_recent_messages_for_user', {
      p_user_id: user.id,
      p_limit_per_conversation: limitPerConversation,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const normalized = (data || []).map((row: any) => ({
      ...row,
      id: `${row.id}`,
      parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
    }))

    return NextResponse.json({ messages: normalized })
  } catch (e) {
    console.error('Recent messages error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
