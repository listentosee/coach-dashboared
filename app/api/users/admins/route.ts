import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Lists admins (id, name, email) for reply-privately assistance
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Admin only
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase.rpc('list_admins_minimal')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ admins: data || [] })
  } catch (e) {
    console.error('List admins error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
