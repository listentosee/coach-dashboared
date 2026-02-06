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
    const scope = (url.searchParams.get('scope') || 'messages').toLowerCase()
    const query = (url.searchParams.get('q') || '').trim()
    if (!query) return NextResponse.json({ results: [] })

    if (scope === 'drafts') {
      const { data, error } = await supabase.rpc('search_drafts_for_user', {
        p_user_id: user.id,
        p_query: query,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ results: data || [] })
    }

    const archived = scope === 'archived'

    const { data, error } = await supabase.rpc('search_message_items', {
      p_user_id: user.id,
      p_query: query,
      p_archived: archived,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ results: data || [] })
  } catch (e) {
    console.error('Search error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
