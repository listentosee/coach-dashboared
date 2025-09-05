import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Lists admins (id, name, email) for reply-privately assistance
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('list_admins_minimal')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ admins: data || [] })
  } catch (e) {
    console.error('List admins error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

