import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET /api/messaging/pinned - Get all pinned items (messages and conversations)
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: pinnedItems, error } = await supabase.rpc('get_pinned_items')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ pinnedItems: pinnedItems || [] })
  } catch (e) {
    console.error('Get pinned items error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
