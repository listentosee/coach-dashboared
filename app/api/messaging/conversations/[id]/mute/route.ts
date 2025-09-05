import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { isUserAdmin } from '@/lib/utils/admin-check'

// Admin-only: mute or unmute a user in a conversation
// Body: { userId: string, minutes?: number, until?: string | null }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminId = session.user.id
    const isAdmin = await isUserAdmin(supabase, adminId)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, minutes, until } = await req.json() as { userId?: string, minutes?: number, until?: string | null }
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    let muted_until: string | null = null
    if (typeof until === 'string') {
      muted_until = until
    } else if (typeof minutes === 'number' && minutes > 0) {
      const d = new Date()
      d.setMinutes(d.getMinutes() + minutes)
      muted_until = d.toISOString()
    } else if (until === null) {
      muted_until = null
    }

    const { error } = await supabase
      .from('conversation_members')
      .update({ muted_until })
      .eq('conversation_id', params.id)
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, muted_until })
  } catch (e) {
    console.error('Mute user error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

