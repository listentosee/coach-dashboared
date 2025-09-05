import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// List members of a conversation with basic profile info (RLS enforced)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('conversation_members')
      .select('user_id, profiles:first_name, profiles:last_name, profiles:email')
      .eq('conversation_id', params.id)
      .returns<any>()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // The select with aliases above may not work in all environments; fallback to a join pattern
    if (!data) {
      const { data: rows, error: err2 } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', params.id)
      if (err2) return NextResponse.json({ error: err2.message }, { status: 400 })
      const ids = (rows || []).map(r => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', ids)
      return NextResponse.json({ members: (profiles || []).map(p => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email })) })
    }

    // Normalize response
    const members = (data as any[]).map((r: any) => ({
      user_id: r.user_id,
      first_name: (r as any).first_name,
      last_name: (r as any).last_name,
      email: (r as any).email,
    }))
    return NextResponse.json({ members })
  } catch (e) {
    console.error('List members error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

