import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Lists coaches (id, name, email) for recipient selection
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase.rpc('list_coaches_minimal')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ coaches: data || [] })
  } catch (e) {
    console.error('List coaches error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
