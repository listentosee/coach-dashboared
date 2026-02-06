import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const limit = Number(url.searchParams.get('limit') || 500)

    const { data, error } = await supabase.rpc('list_threads_for_user', {
      p_user_id: user.id,
      p_limit: limit,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const normalized = (data || []).map((row: any) => ({
      ...row,
      root_id: `${row.root_id}`,
    }))

    return NextResponse.json({ threads: normalized })
  } catch (e) {
    console.error('Thread summary error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
