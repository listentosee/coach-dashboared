import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Lists coaches (id, name, email) for recipient selection
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
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

    // Fetch competitor counts grouped by coach
    const { data: countRows } = await supabase
      .from('competitors')
      .select('coach_id')

    const countMap: Record<string, number> = {}
    for (const row of countRows ?? []) {
      if (row.coach_id) {
        countMap[row.coach_id] = (countMap[row.coach_id] || 0) + 1
      }
    }

    // Combine name, attach count, sort by first_name A-Z
    const coaches = (data || [])
      .map((c: { id: string; first_name: string | null; last_name: string | null; email: string | null }) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id,
        email: c.email,
        competitor_count: countMap[c.id] || 0,
        _sort: (c.first_name || '').toLowerCase(),
      }))
      .sort((a: { _sort: string }, b: { _sort: string }) => a._sort.localeCompare(b._sort))
      .map(({ _sort, ...rest }: { _sort: string; id: string; name: string; email: string | null; competitor_count: number }) => rest)

    return NextResponse.json({ coaches })
  } catch (e) {
    console.error('List coaches error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
