import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Returns total unread message count for the current user across all conversations
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Prefer receipts-based unread counter; fallback to legacy last_read_at
    let data: any = null
    let error: any = null
    const v2 = await supabase.rpc('count_unread_by_receipts', { p_user_id: user.id })
    if (!v2.error) {
      data = v2.data
    } else {
      const v1 = await supabase.rpc('count_unread_messages', { p_user_id: user.id })
      data = v1.data
      error = v1.error
    }

    if (error) {
      // Fallback: compute in-app if function not present
      const { data: rows, error: qErr } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id)
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 })
      // Receipts-based fallback: count messages without a receipt per convo
      let total = 0
      for (const row of rows || []) {
        const { data: ids } = await supabase
          .from('messages')
          .select('id, sender_id')
          .eq('conversation_id', row.conversation_id)
        const mine = new Set<number>()
        for (const m of ids || []) {
          if (m.sender_id === user.id) continue
          const { count } = await supabase
            .from('message_read_receipts')
            .select('*', { count: 'exact', head: true })
            .eq('message_id', (m as any).id)
            .eq('user_id', user.id)
          if ((count || 0) === 0) total += 1
        }
      }
      return NextResponse.json({ count: total })
    }

    return NextResponse.json({ count: data as number })
  } catch (e) {
    console.error('Unread count error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
