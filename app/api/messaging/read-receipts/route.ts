import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// POST /api/messaging/read-receipts
// Body: { messageIds: number[] }
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messageIds } = await req.json() as { messageIds: number[] }
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'Invalid message IDs' }, { status: 400 })
    }

    const ids = messageIds
      .map((id) => (typeof id === 'string' ? parseInt(id as any, 10) : id))
      .filter((id) => Number.isFinite(id)) as number[]

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid message IDs' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('mark_messages_read', { p_message_ids: ids })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true, marked_count: data })
  } catch (e) {
    console.error('Read receipts POST error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/messaging/read-receipts?messageIds=1,2,3
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const messageIdsParam = req.nextUrl.searchParams.get('messageIds')
    if (!messageIdsParam) {
      return NextResponse.json({ error: 'Message IDs required' }, { status: 400 })
    }

    const ids = messageIdsParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid message IDs' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('get_message_read_status', { p_message_ids: ids })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ readStatus: data })
  } catch (e) {
    console.error('Read receipts GET error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
