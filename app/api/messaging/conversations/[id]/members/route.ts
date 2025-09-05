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
      .select('user_id, profiles ( id, first_name, last_name, email )')
      .eq('conversation_id', params.id)
      .returns<any>()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Normalize nested profiles
    const members = (data || []).map((r: any) => ({
      user_id: r.user_id,
      first_name: r.profiles?.first_name ?? null,
      last_name: r.profiles?.last_name ?? null,
      email: r.profiles?.email ?? null,
    }))
    return NextResponse.json({ members })
  } catch (e) {
    console.error('List members error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
