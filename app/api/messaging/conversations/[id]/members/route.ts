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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Use RPC to include profile fields and enforce membership
    const { data, error } = await supabase
      .rpc('list_members_with_profile', { p_conversation_id: params.id })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const members = (data || []).map((r: any) => ({
      user_id: r.user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      role: r.role,
      joined_at: r.joined_at,
    }))
    return NextResponse.json({ members })
  } catch (e) {
    console.error('List members error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
