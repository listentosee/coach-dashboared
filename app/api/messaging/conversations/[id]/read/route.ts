import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Mark conversation as read: update last_read_at for the current user
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Prefer new watermark RPC; fallback to legacy if missing
    let { error: rpcErr } = await supabase.rpc('mark_conversation_read_v2', { p_conversation_id: params.id })
    if (!rpcErr) return NextResponse.json({ ok: true })

    // Legacy fallback
    const legacy = await supabase.rpc('mark_conversation_read', { p_conversation_id: params.id })
    if (!legacy.error) return NextResponse.json({ ok: true })

    // Fallback: direct update using the latest message timestamp
    const { data: lastMsg, error: msgErr } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 })

    const targetTs = lastMsg?.created_at || new Date().toISOString()

    const { error } = await supabase
      .from('conversation_members')
      .update({ last_read_at: targetTs as any })
      .eq('conversation_id', params.id)
      .eq('user_id', session.user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Mark read error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
