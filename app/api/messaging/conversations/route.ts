import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// List conversations visible to the current user (RLS enforced)
// Supports ?archived=true to get archived conversations
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const showArchived = url.searchParams.get('archived') === 'true'

    // Use original function for backward compatibility
    let conversations: any[] | null = null
    let error: any = null

    const enriched = await supabase.rpc('list_conversations_enriched', { p_user_id: user.id })
    if (!enriched.error) {
      conversations = enriched.data as any[]
    } else {
      const legacy = await supabase.rpc('list_conversations_with_unread', { p_user_id: user.id })
      error = legacy.error
      conversations = legacy.data as any[]
    }

    if (error && !conversations) return NextResponse.json({ error: error.message }, { status: 400 })

    // Filter by all_archived (derived from message-level archive state)
    // A conversation is archived when ALL its messages have archived_at set
    const filtered = (conversations || []).filter((c: any) => {
      const isArchived = c.all_archived === true
      return showArchived ? isArchived : !isArchived
    })

    const normalized = filtered.map((c: any) => ({
      ...c,
      unread_count: c.last_message_at ? Math.max(0, Number(c.unread_count ?? 0)) : 0,
    }))

    return NextResponse.json({ conversations: normalized })
  } catch (e) {
    console.error('List conversations error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
