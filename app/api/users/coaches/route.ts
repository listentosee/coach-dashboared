import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Lists coaches (id, name, email) for recipient selection
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('list_coaches_minimal')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ coaches: data || [] })
  } catch (e) {
    console.error('List coaches error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
