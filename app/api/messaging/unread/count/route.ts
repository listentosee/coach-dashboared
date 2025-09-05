import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Returns total unread message count for the current user across all conversations
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Compute unread per conversation by comparing last_read_at
    const { data, error } = await supabase.rpc('count_unread_messages', { p_user_id: session.user.id })

    if (error) {
      // Fallback: compute in-app if function not present
      const { data: rows, error: qErr } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', session.user.id)
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 })
      let total = 0
      for (const row of rows || []) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', row.conversation_id)
          .gt('created_at', row.last_read_at)
          .neq('sender_id', session.user.id)
        total += count || 0
      }
      return NextResponse.json({ count: total })
    }

    return NextResponse.json({ count: data as number })
  } catch (e) {
    console.error('Unread count error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
