import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Create a multi-member conversation (treated as 'dm' type; members can post)
// Body: { userIds: string[], title?: string }
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userIds, title } = await req.json() as { userIds?: string[], title?: string }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds is required' }, { status: 400 })
    }

    // Ensure creator is included
    const uniqueIds = Array.from(new Set([session.user.id, ...userIds]))

    const { data: newId, error: rpcErr } = await supabase.rpc('create_group_conversation', {
      p_user_ids: uniqueIds,
      p_title: title || null,
    })
    if (rpcErr || !newId) return NextResponse.json({ error: rpcErr?.message || 'Failed to create group' }, { status: 400 })

    return NextResponse.json({ conversationId: newId })
  } catch (e) {
    console.error('Create group conversation error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
