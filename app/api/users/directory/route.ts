import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Unified directory: admins + coaches (minimal fields), excludes current user
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('list_users_minimal')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const filtered = (data || []).filter((u: any) => u.id !== session.user.id)
    return NextResponse.json({ users: filtered })
  } catch (e) {
    console.error('List directory error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

