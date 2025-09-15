import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Unified directory: admins + coaches (minimal fields), excludes current user
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Admin only (directory can reveal emails)
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase.rpc('list_users_minimal')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const filtered = (data || []).filter((u: any) => u.id !== user.id)
    return NextResponse.json({ users: filtered })
  } catch (e) {
    console.error('List directory error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
