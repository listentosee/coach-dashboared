import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// POST /api/messaging/read-receipts
// Body: { messageIds: (string | number)[] }
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messageIds } = await req.json() as { messageIds: Array<string | number> }
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'Invalid message IDs' }, { status: 400 })
    }

    const ids = messageIds
      .map((id) => (typeof id === 'number' ? id.toString() : String(id ?? '').trim()))
      .filter((id) => id.length > 0)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid message IDs' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('mark_messages_read', { p_message_ids: ids as any })
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
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const messageIdsParam = req.nextUrl.searchParams.get('messageIds')
    if (!messageIdsParam) {
      return NextResponse.json({ error: 'Message IDs required' }, { status: 400 })
    }

    const ids = messageIdsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid message IDs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('message_read_receipts')
      .select('message_id, read_at')
      .eq('user_id', user.id)
      .in('message_id', ids as any)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ receipts: data || [] })
  } catch (e) {
    console.error('Read receipts GET error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
