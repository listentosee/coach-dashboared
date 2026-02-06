import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('list_conversations_summary', { p_user_id: user.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ conversations: data || [] })
  } catch (e) {
    console.error('List conversation summary error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
